import crypto from 'crypto';
import ExternalContactImport from '../models/ExternalContactImport.js';
import ExternalContactImportLock from '../models/ExternalContactImportLock.js';
import ExternalMarketingContact from '../models/ExternalMarketingContact.js';
import MarketingSuppression from '../models/MarketingSuppression.js';
import User from '../models/User.js';
import {
  EXTERNAL_CONTACT_LIMITS,
  suggestHeaderMapping,
  validateHeaderMapping,
  validateMappedContact,
} from '../utils/externalContactCsv.js';
import { evaluateExternalContactEligibility, normalizeEmail } from '../utils/emailCampaignEligibility.js';

const previewExpiry = () => new Date(Date.now() + EXTERNAL_CONTACT_LIMITS.previewHours * 60 * 60 * 1000);

async function restrictionsForEmails(emails) {
  const [suppressions, optedOutUsers] = await Promise.all([
    MarketingSuppression.find({ normalizedEmail: { $in: emails }, active: true }).select('normalizedEmail').lean(),
    User.find({ email: { $in: emails }, 'marketingPreference.status': 'opted_out' }).select('email').lean(),
  ]);
  return {
    suppressed: new Set(suppressions.map((row) => normalizeEmail(row.normalizedEmail))),
    optedOutUsers: new Set(optedOutUsers.map((row) => normalizeEmail(row.email))),
  };
}

export async function classifyImportRows({ headers, rows, mapping }) {
  const cleanMapping = validateHeaderMapping(headers, mapping || suggestHeaderMapping(headers));
  const evaluated = rows.map((row) => ({ ...row, ...validateMappedContact(row.raw, cleanMapping, row) }));
  const emails = [...new Set(evaluated.map((row) => row.value.normalizedEmail).filter(Boolean))];
  const [existing, restrictions] = await Promise.all([
    ExternalMarketingContact.find({ normalizedEmail: { $in: emails } }).select('normalizedEmail').lean(),
    restrictionsForEmails(emails),
  ]);
  const existingSet = new Set(existing.map((row) => row.normalizedEmail));
  const seen = new Set();
  const previewRows = evaluated.map((row) => {
    let classification = 'valid_new';
    const errors = [...row.errors];
    const email = row.value.normalizedEmail;
    if (errors.length) classification = 'invalid';
    else if (seen.has(email)) classification = 'duplicate';
    else if (existingSet.has(email)) classification = 'existing';
    seen.add(email);
    const restrictedMatch = restrictions.suppressed.has(email) || restrictions.optedOutUsers.has(email) || row.value.permission.status === 'unsubscribed';
    return {
      rowNumber: row.rowNumber,
      raw: row.raw,
      extraColumns: row.extraColumns || 0,
      value: row.value,
      classification,
      errors,
      warnings: row.warnings,
      permissionUnknown: row.value.permission.status === 'unknown',
      restrictedMatch,
    };
  });
  const counts = {
    total: previewRows.length,
    validNew: previewRows.filter((row) => row.classification === 'valid_new').length,
    existing: previewRows.filter((row) => row.classification === 'existing').length,
    duplicate: previewRows.filter((row) => row.classification === 'duplicate').length,
    invalid: previewRows.filter((row) => row.classification === 'invalid').length,
    permissionUnknown: previewRows.filter((row) => row.permissionUnknown).length,
    restrictedMatches: previewRows.filter((row) => row.restrictedMatch).length,
  };
  return { mapping: cleanMapping, rows: previewRows, counts };
}

export async function createImportPreview({ filename, headers, rows, mapping, adminId }) {
  const classified = mapping?.email
    ? await classifyImportRows({ headers, rows, mapping })
    : {
      mapping,
      rows: rows.map((row) => ({ rowNumber: row.rowNumber, raw: row.raw, extraColumns: row.extraColumns || 0, value: null, classification: 'invalid', errors: ['Map a CSV header to the required email field.'], warnings: [], permissionUnknown: true, restrictedMatch: false })),
      counts: { total: rows.length, validNew: 0, existing: 0, duplicate: 0, invalid: rows.length, permissionUnknown: rows.length, restrictedMatches: 0 },
    };
  return ExternalContactImport.create({
    filename,
    headers,
    mapping: classified.mapping,
    rows: classified.rows,
    counts: classified.counts,
    errorSummary: classified.rows.filter((row) => row.errors.length).slice(0, 200).map((row) => ({ rowNumber: row.rowNumber, messages: row.errors })),
    createdBy: adminId,
    expiresAt: previewExpiry(),
  });
}

export async function remapImportPreview(importId, mapping) {
  const preview = await ExternalContactImport.findOne({ _id: importId, state: 'preview', expiresAt: { $gt: new Date() } }).select('+rows');
  if (!preview) throw Object.assign(new Error('Import preview was not found or has expired.'), { statusCode: 404 });
  const sourceRows = preview.rows.map((row) => ({ rowNumber: row.rowNumber, raw: row.raw, extraColumns: row.extraColumns || 0 }));
  const classified = await classifyImportRows({ headers: preview.headers, rows: sourceRows, mapping });
  preview.mapping = classified.mapping;
  preview.rows = classified.rows;
  preview.counts = classified.counts;
  preview.errorSummary = classified.rows.filter((row) => row.errors.length).slice(0, 200).map((row) => ({ rowNumber: row.rowNumber, messages: row.errors }));
  preview.expiresAt = previewExpiry();
  await preview.save();
  return preview;
}

async function acquireImportLock() {
  const now = new Date();
  const owner = crypto.randomUUID();
  try {
    const lock = await ExternalContactImportLock.findOneAndUpdate(
      { _id: 'external-contact-import', $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }] },
      { $set: { owner, leaseUntil: new Date(now.getTime() + 600000) } },
      { new: true, upsert: true }
    );
    return lock?.owner === owner ? owner : null;
  } catch (error) {
    if (error?.code === 11000) return null;
    throw error;
  }
}

async function releaseImportLock(owner) {
  await ExternalContactImportLock.updateOne(
    { _id: 'external-contact-import', owner },
    { $set: { owner: '', leaseUntil: null } }
  );
}

export async function confirmImport(importId, adminId, { storedLimit = EXTERNAL_CONTACT_LIMITS.stored } = {}) {
  const existingResult = await ExternalContactImport.findById(importId).lean();
  if (!existingResult) throw Object.assign(new Error('Import preview not found.'), { statusCode: 404 });
  if (['completed', 'partial'].includes(existingResult.state)) return existingResult;
  if (existingResult.state !== 'preview' || !existingResult.expiresAt || existingResult.expiresAt <= new Date()) {
    throw Object.assign(new Error('Import preview is unavailable or has expired.'), { statusCode: 409 });
  }
  const owner = await acquireImportLock();
  if (!owner) throw Object.assign(new Error('Another contact import is being confirmed. Try again shortly.'), { statusCode: 409 });
  try {
    const preview = await ExternalContactImport.findOneAndUpdate(
      { _id: importId, state: 'preview' },
      { $set: { state: 'confirming', confirmedBy: adminId } },
      { new: true }
    ).select('+rows');
    if (!preview) {
      const result = await ExternalContactImport.findById(importId).lean();
      if (['completed', 'partial'].includes(result?.state)) return result;
      throw Object.assign(new Error('Import is already being confirmed.'), { statusCode: 409 });
    }
    const revalidated = await classifyImportRows({
      headers: preview.headers,
      rows: preview.rows.map((row) => ({ rowNumber: row.rowNumber, raw: row.raw, extraColumns: row.extraColumns || 0 })),
      mapping: preview.mapping,
    });
    const candidates = revalidated.rows.filter((row) => row.classification === 'valid_new');
    const currentCount = await ExternalMarketingContact.countDocuments();
    if (currentCount + candidates.length > storedLimit) {
      preview.state = 'preview';
      preview.lastError = `Import would exceed the ${storedLimit} external-contact storage limit.`;
      await preview.save();
      throw Object.assign(new Error(preview.lastError), { statusCode: 409 });
    }
    const operations = candidates.map((row) => {
      const data = row.value;
      return {
        updateOne: {
          filter: { normalizedEmail: data.normalizedEmail },
          update: { $setOnInsert: {
            name: data.name,
            email: data.email,
            normalizedEmail: data.normalizedEmail,
            contactType: data.contactType,
            institution: data.institution,
            city: data.city,
            tags: data.tags,
            source: data.source,
            permission: data.permission,
            importBatch: preview._id,
            createdBy: adminId,
            updatedBy: adminId,
          } },
          upsert: true,
        },
      };
    });
    let result = { upsertedCount: 0 };
    try {
      if (operations.length) result = await ExternalMarketingContact.bulkWrite(operations, { ordered: false });
    } catch (error) {
      if (!error?.writeErrors) throw error;
      result = error.result || result;
    }
    const importedOptOuts = candidates.filter((row) => row.value.permission.status === 'unsubscribed');
    if (importedOptOuts.length) {
      const strong = await MarketingSuppression.find({
        normalizedEmail: { $in: importedOptOuts.map((row) => row.value.normalizedEmail) },
        active: true,
        reason: { $in: ['hard_bounce', 'complaint'] },
      }).select('normalizedEmail').lean();
      const strongEmails = new Set(strong.map((row) => row.normalizedEmail));
      const suppressionOperations = importedOptOuts.filter((row) => !strongEmails.has(row.value.normalizedEmail)).map((row) => ({
        updateOne: {
          filter: { normalizedEmail: row.value.normalizedEmail },
          update: { $set: { reason: 'unsubscribe', source: 'external_contact_import', active: true } },
          upsert: true,
        },
      }));
      if (suppressionOperations.length) await MarketingSuppression.bulkWrite(suppressionOperations, { ordered: false });
    }
    const inserted = Number(result.upsertedCount ?? result.nUpserted ?? 0);
    const failed = Number(result.getWriteErrors?.().length || 0);
    preview.counts.inserted = inserted;
    preview.counts.skipped = preview.counts.total - inserted - preview.counts.invalid - failed;
    preview.counts.failed = preview.counts.invalid + failed;
    preview.state = preview.counts.invalid || failed ? 'partial' : 'completed';
    preview.confirmedAt = new Date();
    preview.expiresAt = null;
    preview.rows = [];
    preview.mapping = {};
    preview.lastError = preview.counts.invalid || failed ? 'Some rows were invalid or could not be inserted. Review the import counts.' : null;
    await preview.save();
    return ExternalContactImport.findById(preview._id).lean();
  } catch (error) {
    await ExternalContactImport.updateOne(
      { _id: importId, state: 'confirming' },
      { $set: { state: 'preview', expiresAt: previewExpiry(), lastError: String(error.message || 'Import confirmation failed').slice(0, 500) } }
    );
    throw error;
  } finally {
    await releaseImportLock(owner);
  }
}

export function externalContactFilter(query = {}) {
  const filter = {};
  const search = String(query.search || '').trim().slice(0, 120);
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { normalizedEmail: { $regex: escaped.toLowerCase(), $options: 'i' } },
      { institution: { $regex: escaped, $options: 'i' } },
    ];
  }
  if (['student', 'teacher', 'both', 'other', 'unknown'].includes(query.contactType)) filter.contactType = query.contactType;
  if (query.city) filter.city = String(query.city).trim().slice(0, 100);
  if (query.tag) filter.tags = String(query.tag).trim().slice(0, 60);
  if (query.importBatch && /^[a-f\d]{24}$/i.test(query.importBatch)) filter.importBatch = query.importBatch;
  if (query.eligibility === 'eligible') filter['permission.status'] = 'documented';
  if (query.eligibility === 'unknown') filter['permission.status'] = 'unknown';
  if (query.eligibility === 'unsubscribed') filter['permission.status'] = 'unsubscribed';
  return filter;
}

export async function eligibleExternalRows(contacts) {
  const emails = contacts.map((contact) => normalizeEmail(contact.normalizedEmail));
  const restrictions = await restrictionsForEmails(emails);
  return contacts.map((contact) => evaluateExternalContactEligibility(contact, restrictions.suppressed, restrictions.optedOutUsers));
}

export async function resolveExternalAudience(filters, { max = EXTERNAL_CONTACT_LIMITS.campaignAudience } = {}) {
  if (['unknown', 'unsubscribed', 'restricted'].includes(filters?.eligibility)) return [];
  const contacts = await ExternalMarketingContact.find(externalContactFilter(filters)).sort({ createdAt: -1 }).limit(max + 1).lean();
  if (contacts.length > max) throw Object.assign(new Error(`Filtered audience exceeds the ${max} recipient limit.`), { statusCode: 409 });
  const rows = await eligibleExternalRows(contacts);
  return rows.filter((row) => row.eligible);
}

import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import ExternalContactImport from '../models/ExternalContactImport.js';
import ExternalMarketingContact from '../models/ExternalMarketingContact.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import {
  confirmImport,
  createImportPreview,
  eligibleExternalRows,
  externalContactFilter,
  remapImportPreview,
  resolveExternalAudience,
} from '../services/externalContactService.js';
import {
  EXTERNAL_CONTACT_FIELDS,
  EXTERNAL_CONTACT_LIMITS,
  csvCell,
  parseCsv,
  parsePermissionTimestamp,
  safeDownloadFilename,
  sampleExternalContactsCsv,
  suggestHeaderMapping,
  validMetadataReference,
} from '../utils/externalContactCsv.js';
import { looksLikeEmail, normalizeEmail } from '../utils/emailCampaignEligibility.js';
import { logAdminAction } from '../utils/auditLog.js';
import { getEmailCampaignConfig } from '../config/emailCampaign.js';
import MarketingSuppression from '../models/MarketingSuppression.js';

const router = express.Router();
router.use(authenticateToken, requireAdmin);
const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const uploadOne = (req, res, next) => multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: getEmailCampaignConfig().externalContactMaxFileBytes, files: 1 },
  fileFilter: (uploadReq, file, callback) => {
    const csvName = /\.csv$/i.test(file.originalname || '');
    const textMime = ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel', 'application/octet-stream'].includes(file.mimetype);
    callback(csvName && textMime ? null : Object.assign(new Error('Upload a CSV text file.'), { statusCode: 400 }), csvName && textMime);
  },
}).single('file')(req, res, (error) => {
  if (!error) return next();
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: `CSV must be ${getEmailCampaignConfig().externalContactMaxFileBytes} bytes or smaller.` });
  return res.status(error.statusCode || 400).json({ message: error.message || 'CSV upload failed.' });
});

const serializeImport = (item) => ({
  id: item._id,
  filename: item.filename,
  state: item.state,
  headers: item.headers,
  mapping: item.mapping,
  counts: item.counts,
  errorSummary: item.errorSummary,
  confirmedAt: item.confirmedAt,
  expiresAt: item.expiresAt,
  lastError: item.lastError,
  createdAt: item.createdAt,
});

router.get('/sample.csv', route(async (req, res) => {
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="skillbridge-external-contacts-sample.csv"');
  res.send(`\uFEFF${sampleExternalContactsCsv()}`);
}));

router.post('/imports/preview', uploadOne, route(async (req, res) => {
  if (!req.file?.buffer) return res.status(400).json({ message: 'Choose a CSV file.' });
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(req.file.buffer); }
  catch { return res.status(400).json({ message: 'CSV must use valid UTF-8 encoding.' }); }
  const parsed = parseCsv(text, { maxRows: getEmailCampaignConfig().externalContactMaxRows });
  let requestedMapping;
  if (req.body?.mapping) {
    try { requestedMapping = JSON.parse(req.body.mapping); }
    catch { return res.status(400).json({ message: 'Header mapping must be valid JSON.' }); }
  }
  const mapping = requestedMapping || suggestHeaderMapping(parsed.headers);
  const preview = await createImportPreview({
    filename: safeDownloadFilename(req.file.originalname, 'contacts.csv'),
    headers: parsed.headers,
    rows: parsed.rows,
    mapping,
    adminId: req.user.userId,
  });
  await logAdminAction({ adminId: req.user.userId, action: 'external_contacts_import_previewed', details: { importId: preview._id, rows: preview.counts.total } });
  res.status(201).json({ import: serializeImport(preview), fields: EXTERNAL_CONTACT_FIELDS });
}));

router.post('/imports/:id/remap', route(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid import id.' });
  const preview = await remapImportPreview(req.params.id, req.body?.mapping);
  res.json({ import: serializeImport(preview), fields: EXTERNAL_CONTACT_FIELDS });
}));

router.get('/imports/:id/rows', route(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  const preview = await ExternalContactImport.findById(req.params.id).select('+rows').lean();
  if (!preview) return res.status(404).json({ message: 'Import not found.' });
  const rows = preview.rows || [];
  res.json({ rows: rows.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: rows.length, pages: Math.max(1, Math.ceil(rows.length / limit)) } });
}));

router.get('/imports/:id/errors.csv', route(async (req, res) => {
  const item = await ExternalContactImport.findById(req.params.id).lean();
  if (!item) return res.status(404).json({ message: 'Import not found.' });
  const lines = ['row_number,errors', ...(item.errorSummary || []).map((row) => `${csvCell(row.rowNumber)},${csvCell(row.messages.join('; '))}`)];
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${safeDownloadFilename(`import-${item._id}-errors.csv`)}"`);
  res.send(`\uFEFF${lines.join('\r\n')}\r\n`);
}));

router.post('/imports/:id/confirm', route(async (req, res) => {
  const item = await confirmImport(req.params.id, req.user.userId, { storedLimit: getEmailCampaignConfig().externalContactMaxStored });
  await logAdminAction({ adminId: req.user.userId, action: 'external_contacts_import_confirmed', details: { importId: item._id, inserted: item.counts.inserted, failed: item.counts.failed } });
  res.json({ import: serializeImport(item) });
}));

router.get('/imports', route(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const [items, total] = await Promise.all([
    ExternalContactImport.find({}).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ExternalContactImport.countDocuments(),
  ]);
  res.json({ imports: items.map(serializeImport), pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
}));

router.post('/resolve-audience', route(async (req, res) => {
  const rows = await resolveExternalAudience(req.body?.filters || {}, { max: getEmailCampaignConfig().maxAudience });
  res.json({ ids: rows.map((row) => row.externalContactId), count: rows.length, scope: 'all eligible contacts matching the current filters' });
}));

router.get('/', route(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
  const contacts = await ExternalMarketingContact.find(externalContactFilter(req.query)).sort({ createdAt: -1 }).limit(getEmailCampaignConfig().externalContactMaxStored).lean();
  let rows = (await eligibleExternalRows(contacts)).map((eligibility, index) => ({ ...contacts[index], eligibility }));
  if (req.query.eligibility === 'eligible') rows = rows.filter((row) => row.eligibility.eligible);
  if (req.query.eligibility === 'restricted') rows = rows.filter((row) => ['suppressed', 'registered_user_opted_out', 'unsubscribed'].includes(row.eligibility.skipReason));
  const total = rows.length;
  res.json({ contacts: rows.slice((page - 1) * limit, page * limit), pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
}));

router.patch('/:id', route(async (req, res) => {
  const contact = await ExternalMarketingContact.findById(req.params.id);
  if (!contact) return res.status(404).json({ message: 'External contact not found.' });
  const body = req.body || {};
  if (body.email !== undefined) {
    const email = String(body.email).trim();
    if (!looksLikeEmail(email) || email.length > 254) return res.status(400).json({ message: 'Enter a valid email address.' });
    contact.email = email;
    contact.normalizedEmail = normalizeEmail(email);
  }
  const bounded = { name: 120, institution: 180, city: 100, source: 500 };
  for (const [field, max] of Object.entries(bounded)) {
    if (body[field] !== undefined) {
      const value = String(body[field]).trim();
      if (value.length > max) return res.status(400).json({ message: `${field} must be ${max} characters or fewer.` });
      if (field === 'source' && !validMetadataReference(value)) return res.status(400).json({ message: 'Source URL/reference is invalid.' });
      contact[field] = value;
    }
  }
  if (body.contactType !== undefined) {
    if (!['student', 'teacher', 'both', 'other', 'unknown'].includes(body.contactType)) return res.status(400).json({ message: 'Invalid contact type.' });
    contact.contactType = body.contactType;
  }
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || body.tags.length > 20 || body.tags.some((tag) => !String(tag).trim() || String(tag).trim().length > 60)) return res.status(400).json({ message: 'Use at most 20 non-empty tags of 60 characters each.' });
    contact.tags = [...new Set(body.tags.map((tag) => String(tag).trim()))];
  }
  if (body.permission !== undefined) {
    const status = body.permission?.status;
    if (!['documented', 'unknown', 'unsubscribed'].includes(status)) return res.status(400).json({ message: 'Invalid permission status.' });
    if (status === 'documented') {
      const at = parsePermissionTimestamp(body.permission.at);
      if (!body.permission.source || !body.permission.reference || !at || at > new Date()) {
        return res.status(400).json({ message: 'Documented permission requires a source, valid timestamp, and evidence/reference.' });
      }
      if (!validMetadataReference(body.permission.reference)) return res.status(400).json({ message: 'Permission evidence/reference is invalid.' });
      contact.permission = { status, source: String(body.permission.source).trim().slice(0, 300), at, reference: String(body.permission.reference).trim().slice(0, 500) };
    } else contact.permission = { status, source: '', at: null, reference: '' };
  }
  contact.updatedBy = req.user.userId;
  try { await contact.save(); }
  catch (error) { if (error?.code === 11000) return res.status(409).json({ message: 'An external contact already uses this email.' }); throw error; }
  if (contact.permission.status === 'unsubscribed') {
    const strong = await MarketingSuppression.exists({ normalizedEmail: contact.normalizedEmail, active: true, reason: { $in: ['hard_bounce', 'complaint'] } });
    if (!strong) await MarketingSuppression.findOneAndUpdate(
      { normalizedEmail: contact.normalizedEmail },
      { $set: { reason: 'unsubscribe', source: 'external_contact_admin', active: true } },
      { upsert: true }
    );
  }
  await logAdminAction({ adminId: req.user.userId, action: 'external_contact_updated', details: { contactId: contact._id } });
  const [eligibility] = await eligibleExternalRows([contact.toObject()]);
  res.json({ contact: { ...contact.toObject(), eligibility } });
}));

router.delete('/:id', route(async (req, res) => {
  const contact = await ExternalMarketingContact.findByIdAndDelete(req.params.id);
  if (!contact) return res.status(404).json({ message: 'External contact not found.' });
  await logAdminAction({ adminId: req.user.userId, action: 'external_contact_deleted', details: { contactId: contact._id, suppressionPreserved: true } });
  res.json({ success: true, message: 'Contact deleted. Any existing suppression record was preserved.' });
}));

router.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  // Never pass contact values, CSV rows, permission evidence, or provider data
  // to application logs. This identifier is enough to correlate failures.
  console.error('External contact operation failed:', error.code || error.name || 'UNKNOWN');
  return res.status(error.statusCode || 500).json({
    message: error.statusCode && error.statusCode < 500 ? error.message : 'The external contact operation could not be completed.',
  });
});

export default router;

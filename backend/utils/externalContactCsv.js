import { looksLikeEmail, normalizeEmail } from './emailCampaignEligibility.js';

export const EXTERNAL_CONTACT_FIELDS = [
  'name', 'email', 'contact_type', 'institution', 'city', 'tags', 'source',
  'permission_status', 'permission_source', 'permission_at', 'permission_reference',
];

export const EXTERNAL_CONTACT_LIMITS = Object.freeze({
  fileBytes: 2 * 1024 * 1024,
  rows: 2000,
  stored: 10000,
  campaignAudience: 10000,
  previewHours: 24,
  name: 120,
  email: 254,
  contact_type: 20,
  institution: 180,
  city: 100,
  tags: 500,
  source: 500,
  permission_status: 30,
  permission_source: 300,
  permission_at: 50,
  permission_reference: 500,
});

const HEADER_ALIASES = Object.freeze({
  name: ['name', 'full_name', 'contact_name'],
  email: ['email', 'email_address', 'e_mail'],
  contact_type: ['contact_type', 'type'],
  institution: ['institution', 'organization', 'organisation'],
  city: ['city', 'location'],
  tags: ['tags', 'tag'],
  source: ['source', 'source_url', 'source_description'],
  permission_status: ['permission_status', 'marketing_permission', 'consent'],
  permission_source: ['permission_source', 'consent_source'],
  permission_at: ['permission_at', 'permission_timestamp', 'consent_at'],
  permission_reference: ['permission_reference', 'permission_evidence', 'consent_reference'],
});

const cleanHeader = (value) => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
const cleanValue = (value) => String(value ?? '').trim();

export function validMetadataReference(value) {
  const text = cleanValue(value);
  if (!text || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) return !text;
  if (!/^https?:\/\//i.test(text)) return true;
  try {
    const url = new URL(text);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

export function parsePermissionTimestamp(value) {
  const text = cleanValue(value);
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(text)) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseCsv(text, { maxRows = EXTERNAL_CONTACT_LIMITS.rows } = {}) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  if (!source || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(source)) throw Object.assign(new Error('CSV must be a UTF-8 text file.'), { statusCode: 400 });
  const records = [];
  let row = [];
  let field = '';
  let quoted = false;
  let justClosedQuote = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') { quoted = false; justClosedQuote = true; }
      else field += char;
      continue;
    }
    if (justClosedQuote) {
      if (char === ',') { row.push(field); field = ''; justClosedQuote = false; }
      else if (char === '\r' && source[index + 1] === '\n') { /* CR is consumed before LF */ }
      else if (char === '\n') {
        row.push(field); field = ''; justClosedQuote = false;
        if (row.some((cell) => cell !== '')) records.push(row);
        row = [];
        if (records.length > maxRows + 1) throw Object.assign(new Error(`CSV cannot contain more than ${maxRows} data rows.`), { statusCode: 400 });
      } else throw Object.assign(new Error('CSV contains characters after a closing quote.'), { statusCode: 400 });
    }
    else if (char === '"' && field === '') quoted = true;
    else if (char === '"') throw Object.assign(new Error('CSV contains a quote inside an unquoted field.'), { statusCode: 400 });
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') {
      row.push(field.replace(/\r$/, '')); field = '';
      if (row.some((cell) => cell !== '')) records.push(row);
      row = [];
      if (records.length > maxRows + 1) throw Object.assign(new Error(`CSV cannot contain more than ${maxRows} data rows.`), { statusCode: 400 });
    } else field += char;
  }
  if (quoted) throw Object.assign(new Error('CSV contains an unterminated quoted field.'), { statusCode: 400 });
  row.push(field.replace(/\r$/, ''));
  if (row.some((cell) => cell !== '')) records.push(row);
  if (!records.length) throw Object.assign(new Error('CSV is empty.'), { statusCode: 400 });
  if (records.length < 2) throw Object.assign(new Error('CSV must include a header row and at least one data row.'), { statusCode: 400 });
  if (records.length - 1 > maxRows) throw Object.assign(new Error(`CSV cannot contain more than ${maxRows} data rows.`), { statusCode: 400 });
  const headers = records[0].map(cleanHeader);
  if (!headers.length || headers.some((header) => !header)) throw Object.assign(new Error('CSV contains an empty header.'), { statusCode: 400 });
  if (headers.length > 100 || headers.some((header) => header.length > 120)) throw Object.assign(new Error('CSV headers exceed the supported limits.'), { statusCode: 400 });
  if (new Set(headers).size !== headers.length) throw Object.assign(new Error('CSV headers must be unique.'), { statusCode: 400 });
  const rows = records.slice(1).map((cells, rowIndex) => {
    if (cells.some((cell) => String(cell).length > 4000)) throw Object.assign(new Error(`CSV row ${rowIndex + 2} contains a field longer than 4,000 characters.`), { statusCode: 400 });
    return {
      rowNumber: rowIndex + 2,
      raw: Object.fromEntries(headers.map((header, cellIndex) => [header, String(cells[cellIndex] ?? '')])),
      extraColumns: Math.max(0, cells.length - headers.length),
    };
  });
  return { headers, rows };
}

export function suggestHeaderMapping(headers) {
  const available = new Set(headers.map(cleanHeader));
  return Object.fromEntries(EXTERNAL_CONTACT_FIELDS.map((field) => [
    field,
    HEADER_ALIASES[field].find((alias) => available.has(alias)) || '',
  ]));
}

export function validateHeaderMapping(headers, mapping) {
  const headerSet = new Set(headers);
  const clean = {};
  for (const field of EXTERNAL_CONTACT_FIELDS) {
    const header = cleanHeader(mapping?.[field] || '');
    if (header && !headerSet.has(header)) throw Object.assign(new Error(`Mapped header for ${field} does not exist.`), { statusCode: 400 });
    clean[field] = header;
  }
  if (!clean.email) throw Object.assign(new Error('Map a CSV header to the required email field.'), { statusCode: 400 });
  const used = Object.values(clean).filter(Boolean);
  if (new Set(used).size !== used.length) throw Object.assign(new Error('Each CSV header can only be mapped once.'), { statusCode: 400 });
  return clean;
}

export function validateMappedContact(raw, mapping, { extraColumns = 0 } = {}) {
  const value = Object.fromEntries(EXTERNAL_CONTACT_FIELDS.map((field) => [field, cleanValue(raw[mapping[field]])]));
  const errors = [];
  const warnings = [];
  if (extraColumns) errors.push('Row has more columns than the header.');
  for (const [field, limit] of Object.entries(EXTERNAL_CONTACT_LIMITS)) {
    if (typeof limit === 'number' && value[field]?.length > limit) errors.push(`${field} exceeds ${limit} characters.`);
  }
  value.normalizedEmail = normalizeEmail(value.email);
  if (!value.email) errors.push('Email is required.');
  else if (!looksLikeEmail(value.email) || value.email.length > EXTERNAL_CONTACT_LIMITS.email) errors.push('Email is invalid.');

  const type = value.contact_type.toLowerCase() || 'unknown';
  if (!['student', 'teacher', 'both', 'other', 'unknown'].includes(type)) errors.push('Contact type must be student, teacher, both, other, or unknown.');
  value.contactType = ['student', 'teacher', 'both', 'other', 'unknown'].includes(type) ? type : 'unknown';
  const parsedTags = [...new Set(value.tags.split(/[|;,]/).map(cleanValue).filter(Boolean))];
  if (parsedTags.length > 20) errors.push('Use at most 20 tags.');
  value.tags = parsedTags.slice(0, 20);
  if (value.tags.some((tag) => tag.length > 60)) errors.push('Each tag must be 60 characters or fewer.');
  if (!validMetadataReference(value.source)) errors.push('Source URL/reference is invalid.');
  if (!validMetadataReference(value.permission_reference)) errors.push('Permission evidence/reference is invalid.');

  const requested = value.permission_status.toLowerCase();
  let permissionStatus = 'unknown';
  if (['unsubscribed', 'opted_out', 'opted-out'].includes(requested)) permissionStatus = 'unsubscribed';
  else if (['documented', 'opted_in', 'opted-in', 'true', 'yes'].includes(requested)) {
    const parsedDate = value.permission_at ? parsePermissionTimestamp(value.permission_at) : null;
    if (!value.permission_source || !value.permission_at || !value.permission_reference) {
      warnings.push('Permission remains unknown: source, timestamp, and evidence/reference are all required.');
    } else if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate > new Date()) {
      errors.push('Permission timestamp must be a valid date that is not in the future.');
    } else {
      permissionStatus = 'documented';
      value.permissionAt = parsedDate;
    }
  } else if (requested && !['unknown', 'false', 'no'].includes(requested)) {
    errors.push('Permission status must be documented, unknown, or unsubscribed.');
  }
  if (value.permission_at && !value.permissionAt) {
    const parsedDate = parsePermissionTimestamp(value.permission_at);
    if (!parsedDate) errors.push('Permission timestamp is invalid. Use ISO 8601 format.');
  }
  value.permission = {
    status: permissionStatus,
    source: permissionStatus === 'documented' ? value.permission_source : '',
    at: permissionStatus === 'documented' ? value.permissionAt : null,
    reference: permissionStatus === 'documented' ? value.permission_reference : '',
  };
  return { value, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

export function spreadsheetSafe(value) {
  const text = String(value ?? '');
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function csvCell(value) {
  const safe = spreadsheetSafe(value).replaceAll('"', '""');
  return /[",\r\n]/.test(safe) ? `"${safe}"` : safe;
}

export const safeDownloadFilename = (value, fallback = 'contacts.csv') => {
  const cleaned = String(value || '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 120);
  return cleaned || fallback;
};

export function sampleExternalContactsCsv() {
  return `${EXTERNAL_CONTACT_FIELDS.join(',')}\r\n${[
    'Ayesha Khan', 'ayesha@example.com', 'student', 'Example University', 'Lahore', 'beta;education',
    'Event registration', 'documented', 'event signup checkbox', '2026-10-01T10:00:00Z', 'registration-123',
  ].map(csvCell).join(',')}\r\n`;
}

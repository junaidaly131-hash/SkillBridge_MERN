import mongoose from 'mongoose';

const previewRowSchema = new mongoose.Schema({
  rowNumber: { type: Number, required: true },
  raw: { type: mongoose.Schema.Types.Mixed, required: true },
  extraColumns: { type: Number, default: 0 },
  value: { type: mongoose.Schema.Types.Mixed, default: null },
  classification: {
    type: String,
    enum: ['valid_new', 'existing', 'duplicate', 'invalid'],
    required: true,
  },
  errors: [{ type: String, maxlength: 300 }],
  warnings: [{ type: String, maxlength: 300 }],
  permissionUnknown: { type: Boolean, default: true },
  restrictedMatch: { type: Boolean, default: false },
}, { _id: false, suppressReservedKeysWarning: true });

const countsSchema = new mongoose.Schema({
  total: { type: Number, default: 0 },
  validNew: { type: Number, default: 0 },
  existing: { type: Number, default: 0 },
  duplicate: { type: Number, default: 0 },
  invalid: { type: Number, default: 0 },
  permissionUnknown: { type: Number, default: 0 },
  restrictedMatches: { type: Number, default: 0 },
  inserted: { type: Number, default: 0 },
  skipped: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
}, { _id: false });

const externalContactImportSchema = new mongoose.Schema({
  filename: { type: String, maxlength: 180, required: true },
  state: { type: String, enum: ['preview', 'confirming', 'completed', 'partial', 'failed'], default: 'preview', index: true },
  headers: [{ type: String, maxlength: 120 }],
  mapping: { type: mongoose.Schema.Types.Mixed, default: {} },
  rows: { type: [previewRowSchema], select: false, default: [] },
  counts: { type: countsSchema, default: () => ({}) },
  errorSummary: [{ rowNumber: Number, messages: [{ type: String, maxlength: 300 }] }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  confirmedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  lastError: { type: String, maxlength: 500, default: null },
}, { timestamps: true });

externalContactImportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
externalContactImportSchema.index({ createdAt: -1 });

export default mongoose.model('ExternalContactImport', externalContactImportSchema);

import mongoose from 'mongoose';

const permissionSchema = new mongoose.Schema({
  status: { type: String, enum: ['documented', 'unknown', 'unsubscribed'], default: 'unknown', index: true },
  source: { type: String, trim: true, maxlength: 300, default: '' },
  at: { type: Date, default: null },
  reference: { type: String, trim: true, maxlength: 500, default: '' },
}, { _id: false });

const externalMarketingContactSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 120, default: '' },
  email: { type: String, trim: true, maxlength: 254, required: true },
  normalizedEmail: { type: String, trim: true, maxlength: 254, required: true, unique: true, index: true },
  contactType: { type: String, enum: ['student', 'teacher', 'both', 'other', 'unknown'], default: 'unknown', index: true },
  institution: { type: String, trim: true, maxlength: 180, default: '' },
  city: { type: String, trim: true, maxlength: 100, default: '', index: true },
  tags: [{ type: String, trim: true, maxlength: 60 }],
  source: { type: String, trim: true, maxlength: 500, default: '' },
  permission: { type: permissionSchema, default: () => ({}) },
  importBatch: { type: mongoose.Schema.Types.ObjectId, ref: 'ExternalContactImport', default: null, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

externalMarketingContactSchema.index({ contactType: 1, city: 1, createdAt: -1 });
externalMarketingContactSchema.index({ tags: 1, createdAt: -1 });
externalMarketingContactSchema.index({ 'permission.status': 1, createdAt: -1 });

export default mongoose.model('ExternalMarketingContact', externalMarketingContactSchema);

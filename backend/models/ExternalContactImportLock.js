import mongoose from 'mongoose';

const externalContactImportLockSchema = new mongoose.Schema({
  _id: { type: String, default: 'external-contact-import' },
  owner: { type: String, default: '' },
  leaseUntil: { type: Date, default: null },
}, { versionKey: false });

export default mongoose.model('ExternalContactImportLock', externalContactImportLockSchema);

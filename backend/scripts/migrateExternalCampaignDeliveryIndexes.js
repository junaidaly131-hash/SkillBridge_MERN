import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, '..', '.env') });

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 45000, autoIndex: false });
try {
  const { ensureEmailCampaignDeliveryIndexes } = await import('../services/emailCampaignDeliveryIndexService.js');
  await ensureEmailCampaignDeliveryIndexes();
  console.log('Campaign delivery indexes are ready for external recipients.');
} finally {
  await mongoose.disconnect();
}

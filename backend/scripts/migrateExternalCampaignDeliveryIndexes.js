import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, '..', '.env') });

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 45000, autoIndex: false });
try {
  const collection = mongoose.connection.collection('emailcampaigndeliveries');
  let indexes = [];
  try { indexes = await collection.indexes(); }
  catch (error) { if (error?.code !== 26 && error?.codeName !== 'NamespaceNotFound') throw error; }
  const legacy = indexes.find((index) => index.name === 'campaign_1_user_1' && !index.partialFilterExpression);
  if (legacy) await collection.dropIndex(legacy.name);
  const { default: EmailCampaignDelivery } = await import('../models/EmailCampaignDelivery.js');
  await EmailCampaignDelivery.syncIndexes();
  console.log('Campaign delivery indexes are ready for external recipients.');
} finally {
  await mongoose.disconnect();
}

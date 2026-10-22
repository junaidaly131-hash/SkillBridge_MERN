import EmailCampaignDelivery from '../models/EmailCampaignDelivery.js';

const hasKeys = (index, expected) => {
  const entries = Object.entries(index?.key || {});
  const expectedEntries = Object.entries(expected);
  return entries.length === expectedEntries.length
    && expectedEntries.every(([key, value]) => index.key?.[key] === value);
};

const hasObjectIdPartialFilter = (index, field) => (
  index?.unique === true
  && index?.partialFilterExpression?.[field]?.$type === 'objectId'
);

export function findLegacyCampaignDeliveryIndexes(indexes = []) {
  return indexes.filter((index) => (
    (hasKeys(index, { campaign: 1, user: 1 }) && !hasObjectIdPartialFilter(index, 'user'))
    || (hasKeys(index, { campaign: 1, externalContact: 1 }) && !hasObjectIdPartialFilter(index, 'externalContact'))
  ));
}

export async function ensureEmailCampaignDeliveryIndexes({
  collection = EmailCampaignDelivery.collection,
} = {}) {
  let indexes = [];
  try {
    indexes = await collection.indexes();
  } catch (error) {
    if (error?.code !== 26 && error?.codeName !== 'NamespaceNotFound') throw error;
  }

  const legacyIndexes = findLegacyCampaignDeliveryIndexes(indexes);
  for (const index of legacyIndexes) {
    try {
      await collection.dropIndex(index.name);
    } catch (error) {
      // A rolling deployment may start two instances together. If the other
      // instance already removed this index, this instance can continue.
      if (error?.code !== 27 && error?.codeName !== 'IndexNotFound') throw error;
    }
  }

  // MongoDB treats repeated null values as duplicates in a normal unique
  // compound index. Partial indexes enforce uniqueness only for the matching
  // recipient source, so one campaign can safely contain many app users and
  // many external contacts while normalizedEmail remains the canonical guard.
  await collection.createIndex(
    { campaign: 1, user: 1 },
    {
      name: 'campaign_1_user_1',
      unique: true,
      partialFilterExpression: { user: { $type: 'objectId' } },
    }
  );
  await collection.createIndex(
    { campaign: 1, externalContact: 1 },
    {
      name: 'campaign_1_externalContact_1',
      unique: true,
      partialFilterExpression: { externalContact: { $type: 'objectId' } },
    }
  );
  await collection.createIndex(
    { campaign: 1, normalizedEmail: 1 },
    { name: 'campaign_1_normalizedEmail_1', unique: true }
  );

  return { dropped: legacyIndexes.map((index) => index.name) };
}

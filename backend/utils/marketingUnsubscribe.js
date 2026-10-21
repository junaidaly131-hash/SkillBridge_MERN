import crypto from 'crypto';

export const hashUnsubscribeToken = (token) =>
  crypto.createHash('sha256').update(String(token)).digest('hex');

export function makeUnsubscribeToken(deliveryId, secret = process.env.MARKETING_UNSUBSCRIBE_SECRET) {
  if (!secret) throw new Error('MARKETING_UNSUBSCRIBE_SECRET is missing');
  return crypto.createHmac('sha256', secret).update(String(deliveryId)).digest('base64url');
}

export function safeTokenMatch(token, expectedHash) {
  const actual = Buffer.from(hashUnsubscribeToken(token), 'hex');
  const expected = Buffer.from(String(expectedHash || ''), 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}


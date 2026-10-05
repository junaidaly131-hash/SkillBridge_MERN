import Safepay from '@sfpy/node-core';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Ensure env vars are loaded even if this module is imported before server.js calls dotenv.config()
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

// Safepay V2 ("Express Checkout") via @sfpy/node-core. This replaced the V1
// @sfpy/node-sdk flow, whose hosted page Safepay's review team rejected as
// deprecated.
//
// Everything below was verified against the installed package's source/types
// and live sandbox calls, because several details differ from Safepay's docs:
//
//   - Passport lives under `client`, not `auth` (the auth namespace only has
//     login/logout), and returns the token as a plain string in `data`.
//   - There is no checkout-create API call. The checkout URL is assembled
//     locally by the SDK from the tracker + passport token.
//   - `metadata` rejects arbitrary keys ("unsupported meta key"). Only
//     `order_id` and `source` are accepted, so our transaction id travels as
//     metadata.order_id.
//   - reporter.payments.fetch() returns the state at `data.state`, NOT
//     `data.tracker.state`.
export const SAFEPAY_ENV = process.env.SAFEPAY_ENV === 'production' ? 'production' : 'sandbox';

const API_HOST = SAFEPAY_ENV === 'production'
  ? 'https://api.getsafepay.com'
  : 'https://sandbox.api.getsafepay.com';

// The client authenticates with the merchant secret, sent as the
// x-sfpy-merchant-secret header (authType: 'secret').
const SECRET_KEY = process.env.SAFEPAY_SECRET_KEY || process.env.SAFEPAY_WEBHOOK_SECRET;

const safepay = new Safepay(SECRET_KEY, { authType: 'secret', host: API_HOST });

// Confirmed live in SANDBOX: 'CYBERSOURCE' is the only intent this merchant
// account accepts; 'PAYMENT' is rejected with "unsupported or invalid intent".
//
// Whether production uses the same value depends on which processor the live
// merchant account is routed through, which only Safepay can confirm. It is
// read from the environment so that answer costs an env var, not a deploy.
const INTENT = process.env.SAFEPAY_INTENT || 'CYBERSOURCE';

// V2 takes the amount in MINOR units (paisas) - the exact opposite of V1,
// where `amount: 500` meant Rs 500. Confirmed live: a session created with
// amount 500 came back as display_amount "5.00", and amount 50000 as
// "500.00". Getting this backwards would silently charge 1/100th of the
// pack price, so the conversion lives here and nowhere else.
const PAISAS_PER_RUPEE = 100;

/**
 * Base URL Safepay sends the buyer back to after paying.
 *
 * The localhost default is fine in sandbox and fatal in production: the buyer's
 * browser would be redirected to their OWN machine, so the money moves and they
 * land on a dead page with no idea whether it worked. Refusing to build the
 * checkout at all is far better than discovering this from a customer.
 */
export function resolveFrontendBaseUrl() {
  const raw = (process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');

  if (!raw) {
    if (SAFEPAY_ENV === 'production') {
      throw new Error(
        'FRONTEND_URL is not set. Safepay needs a public URL to return the buyer to after payment.'
      );
    }
    return 'http://localhost:5173';
  }

  if (SAFEPAY_ENV === 'production' && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(raw)) {
    throw new Error(
      `FRONTEND_URL points at ${raw} while SAFEPAY_ENV is production - the post-payment redirect would never reach the buyer.`
    );
  }

  return raw;
}

/**
 * Creates a payment session and returns its tracker token.
 * `amountPKR` is plain rupees; it is converted to paisas for Safepay.
 */
export async function createPaymentSession({ amountPKR, orderId }) {
  const session = await safepay.payments.session.setup({
    merchant_api_key: process.env.SAFEPAY_API_KEY,
    intent: INTENT,
    mode: 'payment',
    currency: 'PKR',
    amount: Math.round(amountPKR * PAISAS_PER_RUPEE),
    metadata: { order_id: String(orderId) },
  });

  const token = session?.data?.tracker?.token;
  if (!token) {
    throw new Error('Safepay session.setup returned no tracker token');
  }
  return token;
}

/**
 * Builds the hosted Express Checkout URL for a tracker.
 * Requires a fresh passport token, which is what authenticates the browser
 * against the checkout page.
 */
export async function createHostedCheckoutUrl({ tracker, orderId, redirectUrl, cancelUrl }) {
  const passport = await safepay.client.passport.create();
  const tbt = passport?.data;
  if (!tbt || typeof tbt !== 'string') {
    throw new Error('Safepay passport.create returned no token');
  }

  return safepay.checkout.createCheckoutUrl({
    env: SAFEPAY_ENV,
    tbt,
    tracker,
    source: 'hosted',
    order_id: String(orderId),
    redirect_url: redirectUrl,
    cancel_url: cancelUrl,
  });
}

/**
 * Authoritative status for a tracker. Returns the `data` object, whose
 * `state` is 'TRACKER_ENDED' once the payment has finished.
 */
export async function fetchTrackerStatus(trackerToken) {
  const res = await safepay.reporter.payments.fetch(trackerToken);
  return res?.data || null;
}

/**
 * Verifies a webhook's X-SFPY-SIGNATURE header: HMAC-SHA512 of the raw request
 * body keyed with the endpoint's shared secret.
 *
 * @sfpy/node-core ships no webhook helper (there is no `safepay.webhooks`
 * namespace), so this is computed here. `rawBody` must be the unparsed bytes -
 * re-serialising the parsed JSON would change key order/whitespace and break
 * the digest.
 */
export function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.SAFEPAY_WEBHOOK_SECRET;
  if (!secret || !signature || !rawBody) return false;

  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * One line at startup saying which Safepay settings are present. Names and
 * set/missing only - never a value, not even a truncated one, because these
 * logs are retained by the host and read by whoever has dashboard access.
 *
 * This exists because a silently-missing variable is the failure mode that
 * costs the most: the app starts, serves fine, and only breaks at the moment a
 * real buyer tries to pay.
 */
export function describeSafepayConfig() {
  const required = {
    SAFEPAY_API_KEY: process.env.SAFEPAY_API_KEY,
    SAFEPAY_SECRET_KEY: process.env.SAFEPAY_SECRET_KEY || process.env.SAFEPAY_WEBHOOK_SECRET,
    SAFEPAY_WEBHOOK_SECRET: process.env.SAFEPAY_WEBHOOK_SECRET,
    FRONTEND_URL: process.env.FRONTEND_URL,
  };

  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([name]) => name);

  console.log(
    `Safepay: env=${SAFEPAY_ENV} intent=${INTENT} api=${API_HOST} ` +
    `${missing.length ? `MISSING=[${missing.join(', ')}]` : 'all required settings present'}`
  );

  if (SAFEPAY_ENV !== 'production') {
    console.log('Safepay: running in SANDBOX - no real money will move.');
  }

  return { env: SAFEPAY_ENV, missing };
}

export default safepay;

import {
  createHostedCheckoutUrl,
  createPaymentSession,
  fetchTrackerStatus,
  resolveFrontendBaseUrl,
  verifyWebhookSignature,
} from '../config/safepay.js';
import { getPack, listPackages } from '../config/creditPacks.js';
import Transaction from '../models/Transaction.js';
import { CreditTransaction, CreditWallet } from '../models/Credit.js';
import RefundRequest from '../models/RefundRequest.js';
import { getOrCreateWallet, addPurchasedCredits } from '../utils/wallet.js';

export const getPackages = async (req, res) => {
  res.json({ packages: listPackages() });
};

const VISIBLE_STATUSES = ['completed', 'failed', 'refunded'];
const MAX_PAGE_LIMIT = 50;
const DEFAULT_PAGE_LIMIT = 10;

export const getMyTransactions = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_PAGE_LIMIT));

    const filter = { user: req.user.userId, status: { $in: VISIBLE_STATUSES } };

    const [transactions, totalCount] = await Promise.all([
      Transaction.find(filter)
        .select('creditsGranted amountPaid currency status createdAt')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Transaction.countDocuments(filter),
    ]);

    const transactionIds = transactions.map((t) => t._id);
    const refundRequests = await RefundRequest.find({ transaction: { $in: transactionIds } })
      .select('transaction status')
      .sort({ createdAt: -1 });
    const refundStatusByTransaction = {};
    refundRequests.forEach((r) => {
      // Keep the most recent one per transaction (already sorted desc above)
      if (!(r.transaction.toString() in refundStatusByTransaction)) {
        refundStatusByTransaction[r.transaction.toString()] = r.status;
      }
    });

    res.json({
      transactions: transactions.map((t) => ({
        id: t._id.toString(),
        creditsGranted: t.creditsGranted,
        amountPaid: t.amountPaid,
        currency: t.currency,
        status: t.status,
        createdAt: t.createdAt,
        refundRequestStatus: refundStatusByTransaction[t._id.toString()] || null,
      })),
      page,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      totalCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Grants credits and marks a transaction completed - shared by the webhook
// handler and the polling fallback below so there's exactly one place that
// moves credits, no matter which path detects the successful payment.
//
// Claims the transaction with an ATOMIC findOneAndUpdate (status: 'pending'
// in the filter) rather than read-then-save. Two concurrent callers for the
// same transaction (e.g. a webhook and a redirect-confirm landing together,
// or a dev-mode double-effect firing this twice) will race on that single
// update - exactly one wins the 'pending' -> 'completed' transition, and the
// loser sees a no-op instead of a Mongoose version conflict / double credit.
async function finalizeCompletedTransaction(transaction, rawPayload, providerTransactionId) {
  const claimed = await Transaction.findOneAndUpdate(
    { _id: transaction._id, status: 'pending' },
    {
      $set: {
        status: 'completed',
        rawPayload,
        ...(providerTransactionId ? { providerTransactionId } : {}),
      },
    },
    { new: true }
  );

  if (!claimed) return; // already completed/failed by a concurrent request

  await CreditTransaction.create({
    user: claimed.user,
    type: 'purchase',
    amount: claimed.creditsGranted,
    description: `Purchased ${claimed.creditsGranted} credits via Safepay`,
    source: 'safepay',
    transactionRef: claimed._id,
  });

  // Bought credits land in the purchased bucket - spendable, but never
  // cashable. They are also not "earned", so totalEarned is left alone.
  const wallet = await getOrCreateWallet(claimed.user);
  addPurchasedCredits(wallet, claimed.creditsGranted);
  await wallet.save();
}

async function finalizeFailedTransaction(transaction, rawPayload) {
  if (transaction.status !== 'pending') return; // don't clobber completed/refunded
  transaction.status = 'failed';
  transaction.rawPayload = rawPayload;
  await transaction.save();
}

// The redirect back from Safepay carries no signature, so it can't be trusted
// on its own. The tracker in it is treated purely as a lookup key and the real
// status is read from Safepay's reporter API - the single source of truth used
// by the redirect-confirm call, the polling endpoint and the webhook alike.
//
// Confirmed live against @sfpy/node-core: the state sits at `data.state`, NOT
// `data.tracker.state` as Safepay's docs suggest.
async function checkAndFinalizeTracker(transaction) {
  if (transaction.status !== 'pending') return transaction;
  if (!transaction.safepayTrackerToken) return transaction;

  const data = await fetchTrackerStatus(transaction.safepayTrackerToken);
  if (!data) return transaction;

  if (data.state !== 'TRACKER_ENDED') {
    // Anything else is still in flight (TRACKER_STARTED, mid-3DS, ...).
    // Unknown states are logged rather than guessed at, so a new one shows up
    // in the logs instead of silently failing someone's payment.
    if (data.state !== 'TRACKER_STARTED') {
      console.warn(`Safepay tracker ${transaction.safepayTrackerToken} in unhandled state: ${data.state}`);
    }
    return transaction;
  }

  // Ended. `purchase_totals` is NOT proof of payment - it is present on a
  // brand-new unpaid tracker too (confirmed live), so it must not be used as
  // the success signal.
  //
  // The exact marker a settled payment carries could not be confirmed: the V2
  // reporter shows none of our historical V1 payments, so no completed tracker
  // existed to inspect. Rather than guess and risk crediting a cancelled
  // payment, an ended tracker with no recognised success marker is logged in
  // full and left pending for a human to settle.
  const MARKERS = ['transaction', 'charge', 'payment'];
  let matchedMarker = MARKERS.find((key) => data[key]) || null;
  if (!matchedMarker && Array.isArray(data.payments) && data.payments.length > 0) {
    matchedMarker = 'payments';
  }

  if (matchedMarker) {
    // Which field proved the payment is recorded, not just that one did. The
    // marker set above was inferred rather than documented, so naming the one
    // that actually fires lets the guesses be narrowed to the real field before
    // this runs against live money. Field name only - no payload, no PII.
    console.log(
      `Safepay tracker ${transaction.safepayTrackerToken} settled via marker "${matchedMarker}"`
    );
    await finalizeCompletedTransaction(
      transaction,
      { via: 'reporter_tracker_status', data },
      transaction.safepayTrackerToken
    );
  } else if (data.is_routed === false) {
    // Ended without ever reaching a processor - nothing was charged.
    await finalizeFailedTransaction(transaction, { via: 'reporter_tracker_status', data });
  } else {
    console.error(
      `Safepay tracker ${transaction.safepayTrackerToken} ENDED with an unrecognised shape - ` +
      'left pending, settle manually and update the success check. Payload: ' +
      JSON.stringify(data)
    );
    return transaction;
  }

  return Transaction.findById(transaction._id);
}

// Get a single transaction's status - polled by the /credits/success page.
// Actively checks Safepay's real status when still pending, so polling alone
// (even without the redirect-confirm call ever succeeding) can resolve it.
export const getTransactionStatus = async (req, res) => {
  try {
    let transaction = await Transaction.findById(req.params.transactionId);
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    if (transaction.user.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    if (transaction.status === 'pending') {
      try {
        transaction = await checkAndFinalizeTracker(transaction);
      } catch (error) {
        console.error(`Safepay tracker status check failed for transaction ${transaction._id}:`, error.message);
        // Fall through and report current (still pending) status - the
        // frontend will just keep polling.
      }
    }

    res.json({
      transaction: {
        id: transaction._id.toString(),
        status: transaction.status,
        creditsGranted: transaction.creditsGranted,
        amountPaid: transaction.amountPaid,
        currency: transaction.currency,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Confirms a payment from the params Safepay appends to our redirect_url.
// Safepay's v1 redirect carries only `order_id` + `tracker` - no signature -
// so this can't verify the callback locally. Instead it uses the tracker to
// look up the real, authoritative status via GET /order/v1/{tracker}
// (checkAndFinalizeTracker above), the same confirmed-working call used by
// the polling endpoint. Trying this first just lets a successful payment
// resolve immediately instead of waiting for the next poll tick.
export const confirmFromRedirect = async (req, res) => {
  try {
    const { transactionId, tracker } = req.body;

    let transaction = await Transaction.findById(transactionId);
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    if (transaction.user.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    // Already settled - nothing to do (also makes a page refresh safe).
    if (transaction.status !== 'pending') {
      return res.json({ transaction: { id: transaction._id.toString(), status: transaction.status } });
    }

    if (!tracker) {
      console.warn('Safepay redirect confirm: missing tracker, got params:', JSON.stringify(req.body));
      return res.status(400).json({ message: 'Missing tracker from the payment provider redirect.' });
    }

    // Make sure the tracker in the redirect is the one we actually created
    // for this purchase, so a tracker from some other payment can't be used
    // to trigger a status check (and potential finalize) against this one.
    if (transaction.safepayTrackerToken && transaction.safepayTrackerToken !== tracker) {
      console.error(
        `Safepay redirect confirm: tracker mismatch for transaction ${transactionId} ` +
        `(expected ${transaction.safepayTrackerToken}, got ${tracker})`
      );
      return res.status(400).json({ message: 'Payment could not be verified.' });
    }

    transaction = await checkAndFinalizeTracker(transaction);

    res.json({
      transaction: {
        id: transaction._id.toString(),
        status: transaction.status,
        creditsGranted: transaction.creditsGranted,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Safepay's checkout is a hosted redirect, not an overlay - this creates a
// 'pending' Transaction up front (before payment happens) so we have our own
// orderId to hand Safepay and match the webhook back against later.
export const createCheckout = async (req, res) => {
  try {
    const { packId } = req.body;

    if (!packId) {
      return res.status(400).json({ message: 'packId is required' });
    }

    const pack = getPack(packId);
    if (!pack) {
      return res.status(400).json({ message: 'Unknown packId' });
    }

    const transaction = await Transaction.create({
      user: req.user.userId,
      packId,
      amountPaid: pack.amountPKR,
      currency: 'PKR',
      creditsGranted: pack.credits,
      status: 'pending',
    });

    try {
      // V2 Express Checkout. Two steps, both confirmed live:
      //   1. payments.session.setup -> tracker token
      //   2. client.passport.create + local URL assembly -> hosted checkout URL
      //
      // `amountPKR` is plain rupees HERE. The rupees -> paisas conversion that
      // V2 requires happens inside createPaymentSession and nowhere else, so
      // don't multiply before passing it in. (A V1-era note here used to claim
      // the API itself took rupees, which is the opposite of what V2 does.)
      const tracker = await createPaymentSession({
        amountPKR: pack.amountPKR,
        orderId: transaction._id.toString(),
      });

      transaction.safepayTrackerToken = tracker;
      await transaction.save();

      // Throws in production if FRONTEND_URL is missing or still points at
      // localhost - see resolveFrontendBaseUrl. The catch below marks the
      // transaction failed, so nobody is left with a pending charge.
      const frontendUrl = resolveFrontendBaseUrl();

      // redirectUrl deliberately carries no query string of its own - Safepay
      // appends its own params, and a pre-existing `?` turned the result into
      // one garbled value last time. Our transaction id rides along as
      // `order_id` instead (both in the session metadata and on this URL).
      const checkoutUrl = await createHostedCheckoutUrl({
        tracker,
        orderId: transaction._id.toString(),
        redirectUrl: `${frontendUrl}/credits/success`,
        cancelUrl: `${frontendUrl}/credits/cancelled`,
      });

      res.json({
        success: true,
        checkoutUrl,
        transactionId: transaction._id.toString(),
      });
    } catch (safepayError) {
      // Don't leave this Transaction stuck in 'pending' forever - the
      // checkout page was never even shown to the user, so this is a clean
      // failure, not an unresolved payment.
      console.error('Safepay checkout creation failed:', safepayError.response?.data || safepayError.message);
      transaction.status = 'failed';
      transaction.rawPayload = safepayError.response?.data || { message: safepayError.message };
      await transaction.save();
      return res.status(502).json({
        message: 'Unable to start checkout with our payment provider right now. Please try again shortly or contact support.',
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Webhooks are a secondary trigger - the redirect-confirm and polling paths
// above already resolve every payment through the reporter API. This verifies
// the signature, then re-checks the named tracker against that same source of
// truth rather than trusting the payload's own shape.
//
// Signature: X-SFPY-SIGNATURE is an HMAC-SHA512 of the RAW body. The route
// mounts express.raw() so req.body is a Buffer here - re-serialising parsed
// JSON would reorder keys and break the digest. @sfpy/node-core ships no
// webhook helper, so the HMAC is computed in config/safepay.js.
export const handleWebhook = async (req, res) => {
  try {
    const signature = req.get('X-SFPY-SIGNATURE');
    const rawBody = Buffer.isBuffer(req.body) ? req.body : null;

    if (!rawBody) {
      console.error('Safepay webhook: raw body missing - check the express.raw() mount');
      return res.status(400).json({ received: false, message: 'Raw body required' });
    }

    if (!verifyWebhookSignature(rawBody, signature)) {
      console.error('Safepay webhook: signature verification failed');
      return res.status(401).json({ received: false, message: 'Invalid signature' });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ received: false, message: 'Malformed JSON' });
    }

    // Tracker token can sit at a few depths depending on the event shape, so
    // every observed location is checked before giving up.
    const data = payload?.data || payload || {};
    const trackerToken = data.tracker?.token || data.token || data.tracker || payload?.tracker;

    if (!trackerToken) {
      console.error('Safepay webhook: no tracker token in payload', JSON.stringify(payload).slice(0, 300));
      return res.status(200).json({ received: true, message: 'No tracker token in payload' });
    }

    const transaction = await Transaction.findOne({ safepayTrackerToken: trackerToken });
    if (!transaction) {
      console.error(`Safepay webhook: no Transaction found for tracker ${trackerToken}`);
      return res.status(200).json({ received: true, message: 'Unknown tracker token' });
    }

    // Same atomic finalize as every other path, so a webhook racing the
    // redirect-confirm cannot double-credit.
    await checkAndFinalizeTracker(transaction);

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error processing Safepay webhook:', error);
    return res.status(500).json({ received: false, message: 'Internal error processing webhook' });
  }
};

export const requestRefund = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { reason } = req.body;

    if (!reason?.trim()) {
      return res.status(400).json({ message: 'reason is required' });
    }

    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    if (transaction.user.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    if (transaction.status !== 'completed') {
      return res.status(400).json({ message: 'Only completed transactions can be refunded' });
    }

    const existing = await RefundRequest.findOne({
      transaction: transaction._id,
      status: { $in: ['pending', 'approved'] },
    });
    if (existing) {
      return res.status(400).json({ message: `A refund request already exists for this transaction (${existing.status}).` });
    }

    const refundRequest = await RefundRequest.create({
      user: req.user.userId,
      transaction: transaction._id,
      reason: reason.trim(),
    });

    res.status(201).json({
      refundRequest: {
        id: refundRequest._id.toString(),
        status: refundRequest.status,
        reason: refundRequest.reason,
        createdAt: refundRequest.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

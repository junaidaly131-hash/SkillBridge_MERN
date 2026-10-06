import PayoutRequest from '../models/PayoutRequest.js';
import User from '../models/User.js';
import { CreditTransaction, CreditWallet } from '../models/Credit.js';
import { creditsToRupees } from '../config/creditConversion.js';
import { holdEarnedForPayout } from '../utils/wallet.js';
import { checkCanCashOut } from '../config/verificationPolicy.js';

// Below this, admin would have to manually process a payout request over a
// negligible amount - not worth the manual bank-transfer overhead.
const MIN_PAYOUT_CREDITS = 100;

const PAYOUT_METHODS = ['bank_transfer', 'jazzcash', 'easypaisa'];

const MAX_PAGE_LIMIT = 50;
const DEFAULT_PAGE_LIMIT = 10;

export const requestPayout = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { creditsRequested, payoutMethod, payoutDetails } = req.body;

    // Checked before anything else: money leaving the platform to a named bank
    // account is the one place identity is non-negotiable. Answering "verify
    // first" beats answering "minimum is 100 credits" to someone who was never
    // going to be allowed to withdraw anyway.
    const requester = await User.findById(userId).select('name verificationStatus skillsTeaching');
    if (!requester) return res.status(404).json({ message: 'User not found' });

    const blocked = checkCanCashOut(requester);
    if (blocked) return res.status(403).json(blocked);

    const credits = Number(creditsRequested);
    if (!Number.isFinite(credits) || credits < MIN_PAYOUT_CREDITS) {
      return res.status(400).json({
        message: `Minimum payout request is ${MIN_PAYOUT_CREDITS} credits.`,
      });
    }

    if (!PAYOUT_METHODS.includes(payoutMethod)) {
      return res.status(400).json({ message: `payoutMethod must be one of: ${PAYOUT_METHODS.join(', ')}` });
    }

    if (!payoutDetails?.accountTitle?.trim() || !payoutDetails?.accountNumber?.trim()) {
      return res.status(400).json({ message: 'accountTitle and accountNumber are required' });
    }
    if (payoutMethod === 'bank_transfer' && !payoutDetails?.bankName?.trim()) {
      return res.status(400).json({ message: 'bankName is required for bank_transfer' });
    }

    const existing = await PayoutRequest.findOne({
      teacher: userId,
      status: { $in: ['pending', 'approved'] },
    });
    if (existing) {
      return res.status(400).json({
        message: `You already have a payout request in progress (${existing.status}). Wait for it to be resolved before requesting another.`,
      });
    }

    // Hold pattern: the credits leave the wallet now, so the same ones can't be
    // spent or requested again while the payout is pending review.
    //
    // Read-check-then-write would not be safe here. Two requests firing at once
    // both read the same earnedBalance, both pass the check, and both create a
    // payout - 100 earned credits claimed twice, settled in real money. The
    // condition therefore lives in the query: only a wallet that still holds
    // enough matches, so of two racing requests exactly one can win.
    //
    // `balance` is decremented alongside because $inc bypasses the model's
    // pre-save hook, which is what normally keeps balance equal to its parts.
    const wallet = await CreditWallet.findOneAndUpdate(
      { user: userId, earnedBalance: { $gte: credits } },
      { $inc: { earnedBalance: -credits, balance: -credits, totalSpent: credits } },
      { new: true }
    );

    if (!wallet) {
      const current = await CreditWallet.findOne({ user: userId }).select('earnedBalance');
      return res.status(400).json({
        message: `Only credits earned by teaching can be cashed out. You have ${current?.earnedBalance || 0} earned credits, requested ${credits}.`,
      });
    }

    let payoutRequest;
    try {
      payoutRequest = await PayoutRequest.create({
        teacher: userId,
        creditsRequested: credits,
        amountPKR: creditsToRupees(credits),
        payoutMethod,
        payoutDetails: {
          accountTitle: payoutDetails.accountTitle.trim(),
          accountNumber: payoutDetails.accountNumber.trim(),
          bankName: payoutDetails.bankName?.trim() || undefined,
        },
      });
    } catch (createError) {
      // The credits are already out of the wallet. Without this the user simply
      // loses them - there would be no payout record for an admin to find.
      await CreditWallet.updateOne(
        { user: userId },
        { $inc: { earnedBalance: credits, balance: credits, totalSpent: -credits } }
      );
      throw createError;
    }

    await CreditTransaction.create({
      user: userId,
      type: 'payout_hold',
      amount: -credits,
      description: `Payout request hold (${credits} credits)`,
      source: 'system',
      payoutRef: payoutRequest._id,
    });

    res.status(201).json({
      payoutRequest: {
        id: payoutRequest._id.toString(),
        creditsRequested: payoutRequest.creditsRequested,
        amountPKR: payoutRequest.amountPKR,
        payoutMethod: payoutRequest.payoutMethod,
        status: payoutRequest.status,
        createdAt: payoutRequest.createdAt,
      },
      newBalance: wallet.balance,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getMyPayoutRequests = async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_PAGE_LIMIT));

    const filter = { teacher: userId };

    const [requests, totalCount] = await Promise.all([
      PayoutRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      PayoutRequest.countDocuments(filter),
    ]);

    res.json({
      requests: requests.map((r) => ({
        id: r._id.toString(),
        creditsRequested: r.creditsRequested,
        amountPKR: r.amountPKR,
        payoutMethod: r.payoutMethod,
        payoutDetails: r.payoutDetails,
        status: r.status,
        adminNote: r.adminNote,
        paymentReference: r.paymentReference,
        createdAt: r.createdAt,
        resolvedAt: r.resolvedAt,
      })),
      page,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      totalCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

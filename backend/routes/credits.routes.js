import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { CreditTransaction } from '../models/Credit.js';
import { getOrCreateWallet } from '../utils/wallet.js';

const router = express.Router();

// Get wallet info and recent transactions
router.get('/wallet', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const wallet = await getOrCreateWallet(userId);

    // Get stats for current month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyStats = await CreditTransaction.aggregate([
      {
        $match: {
          user: wallet.user,
          createdAt: { $gte: startOfMonth },
        },
      },
      {
        $group: {
          _id: null,
          // Keyed on `type`, not on the sign of `amount`. Every credit arriving
          // is a positive row, so summing positives counted a Safepay purchase
          // as money the user had "earned" - and likewise a reversed payout and
          // an admin bonus. Teaching is the only thing anyone earns.
          earned: {
            $sum: {
              $cond: [{ $eq: ['$type', 'teaching'] }, '$amount', 0],
            },
          },
          // And the only thing credits get spent ON is learning. The other
          // negative rows are a refund being clawed back and credits being held
          // for a payout; neither is spending, and both have their own place in
          // the UI (Purchase History and the Cash Out panel).
          spent: {
            $sum: {
              $cond: [{ $eq: ['$type', 'learning'] }, { $abs: '$amount' }, 0],
            },
          },
        },
      },
    ]);

    const stats = monthlyStats[0] || { earned: 0, spent: 0 };

    res.json({
      success: true,
      wallet: {
        balance: wallet.balance,
        // Split out so the UI can be honest about what is cashable - only
        // earned credits can go to a payout.
        purchasedBalance: wallet.purchasedBalance,
        earnedBalance: wallet.earnedBalance,
        totalEarned: wallet.totalEarned,
        totalSpent: wallet.totalSpent,
        earnedThisMonth: stats.earned,
        spentThisMonth: stats.spent,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get transaction history
router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { limit = 20, offset = 0 } = req.query;

    const transactions = await CreditTransaction.find({ user: userId })
      .populate('otherUser', 'name avatar')
      .populate('meeting', 'title startsAt')
      .sort({ createdAt: -1 })
      .skip(Number(offset))
      .limit(Number(limit));

    const total = await CreditTransaction.countDocuments({ user: userId });

    res.json({
      success: true,
      transactions,
      total,
      hasMore: Number(offset) + transactions.length < total,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// REMOVED: POST /earn/teaching, POST /spend/learning, GET /check-balance
//
// /earn/teaching let ANY signed-in caller add 25 cashable credits to their own
// wallet by posting any learnerId. It checked that the learner existed and
// nothing else: not that a meeting existed, not that it had happened, not that
// the caller taught it, and not that it had already been paid out. Called in a
// loop it minted unlimited credits, and earned credits are the cashable kind,
// so the exit was a real bank transfer.
//
// /spend/learning was the same shape in reverse and wrote fabricated 'learning'
// rows. Both predate utils/meetingCompletion.js, which is now the only thing
// that moves credits for a session: it runs from a scheduled sweep, keyed on a
// meeting that actually reached its end time, with a creditsProcessed flag so
// it settles once. Nothing in the app had called either route for some time -
// the frontend thunks were dead too - but the routes stayed mounted and
// reachable.
//
// If a credit movement is ever needed outside session completion, it belongs in
// utils/wallet.js behind a real check, not as an endpoint that trusts its body.

export default router;

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { CreditWallet, CreditTransaction } from '../models/Credit.js';
import User from '../models/User.js';
import { getOrCreateWallet, notifyIfCrossedLowBalance, spendCredits, addEarnedCredits } from '../utils/wallet.js';
import { CREDITS_PER_TEACHING_SESSION, CREDITS_PER_LEARNING_SESSION } from '../config/sessionCreditRates.js';

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

// Process teaching credits (called when a meeting is scheduled where user is teaching)
router.post('/earn/teaching', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { meetingId, learnerId } = req.body;

    if (!learnerId) return res.status(400).json({ message: 'learnerId is required' });

    const learner = await User.findById(learnerId).select('name');
    if (!learner) return res.status(404).json({ message: 'Learner not found' });

    const wallet = await getOrCreateWallet(userId);

    // Teaching is the only thing that fills the cashable bucket.
    addEarnedCredits(wallet, CREDITS_PER_TEACHING_SESSION);
    await wallet.save();

    // Record transaction
    const transaction = await CreditTransaction.create({
      user: userId,
      type: 'teaching',
      amount: CREDITS_PER_TEACHING_SESSION,
      description: `Teaching session with ${learner.name}`,
      meeting: meetingId || null,
      otherUser: learnerId,
    });

    res.json({
      success: true,
      transaction,
      newBalance: wallet.balance,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Process learning credits (called when user schedules to learn)
router.post('/spend/learning', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { meetingId, teacherId } = req.body;

    if (!teacherId) return res.status(400).json({ message: 'teacherId is required' });

    const teacher = await User.findById(teacherId).select('name');
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

    const wallet = await getOrCreateWallet(userId);

    // Check if user has enough credits
    if (wallet.balance < CREDITS_PER_LEARNING_SESSION) {
      return res.status(400).json({
        message: 'Insufficient credits',
        required: CREDITS_PER_LEARNING_SESSION,
        balance: wallet.balance,
      });
    }

    // Deduct for learning - purchased credits first, then earned.
    const balanceBefore = wallet.balance;
    spendCredits(wallet, CREDITS_PER_LEARNING_SESSION);
    await wallet.save();
    notifyIfCrossedLowBalance(userId, balanceBefore, wallet.balance);

    // Record transaction
    const transaction = await CreditTransaction.create({
      user: userId,
      type: 'learning',
      amount: -CREDITS_PER_LEARNING_SESSION,
      description: `Learning session with ${teacher.name}`,
      meeting: meetingId || null,
      otherUser: teacherId,
    });

    res.json({
      success: true,
      transaction,
      newBalance: wallet.balance,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Check if user can afford a learning session
router.get('/check-balance', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const wallet = await getOrCreateWallet(userId);

    res.json({
      success: true,
      balance: wallet.balance,
      canAffordSession: wallet.balance >= CREDITS_PER_LEARNING_SESSION,
      sessionCost: CREDITS_PER_LEARNING_SESSION,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;

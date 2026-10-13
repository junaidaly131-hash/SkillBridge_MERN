import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import {
  getAllTransactions,
  getAllUsers,
  updateUserRole,
  getAnalytics,
  getAuditLog,
  getVerifications,
  getVerificationDoc,
  reviewVerification,
  getRefundRequests,
  reviewRefundRequest,
  getPayoutRequests,
  reviewPayoutRequest,
  markPayoutPaid,
  getReports,
  reviewReport,
  suspendUser,
  unsuspendUser,
  getSessionDisputes,
  reviewSessionDispute,
} from '../controllers/admin.controller.js';

const router = express.Router();

router.get('/transactions', authenticateToken, requireAdmin, getAllTransactions);
router.get('/analytics', authenticateToken, requireAdmin, getAnalytics);
router.get('/users', authenticateToken, requireAdmin, getAllUsers);
router.patch('/users/:userId/role', authenticateToken, requireAdmin, updateUserRole);
router.get('/audit-log', authenticateToken, requireAdmin, getAuditLog);
router.get('/verifications', authenticateToken, requireAdmin, getVerifications);
router.get('/verifications/:userId/docs/:index', authenticateToken, requireAdmin, getVerificationDoc);
router.patch('/verifications/:userId', authenticateToken, requireAdmin, reviewVerification);
router.get('/refund-requests', authenticateToken, requireAdmin, getRefundRequests);
router.patch('/refund-requests/:id', authenticateToken, requireAdmin, reviewRefundRequest);
router.get('/payout-requests', authenticateToken, requireAdmin, getPayoutRequests);
router.patch('/payout-requests/:id/review', authenticateToken, requireAdmin, reviewPayoutRequest);
router.patch('/payout-requests/:id/mark-paid', authenticateToken, requireAdmin, markPayoutPaid);
router.get('/reports', authenticateToken, requireAdmin, getReports);
router.patch('/reports/:reportId', authenticateToken, requireAdmin, reviewReport);
router.patch('/users/:userId/suspend', authenticateToken, requireAdmin, suspendUser);
router.patch('/users/:userId/unsuspend', authenticateToken, requireAdmin, unsuspendUser);
router.get('/session-disputes', authenticateToken, requireAdmin, getSessionDisputes);
router.patch('/session-disputes/:id/review', authenticateToken, requireAdmin, reviewSessionDispute);

export default router;

import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import AdminAuditLog from '../models/AdminAuditLog.js';
import RefundRequest from '../models/RefundRequest.js';
import PayoutRequest from '../models/PayoutRequest.js';
import { CreditTransaction, CreditWallet } from '../models/Credit.js';
import Report from '../models/Report.js';
import SessionDispute from '../models/SessionDispute.js';
import { processCompletedMeetingCredits } from '../utils/meetingCompletion.js';
import { logAdminAction } from '../utils/auditLog.js';
import { notifyUser, emitToUser, emitToAdmins } from '../utils/notify.js';
import { releaseEarnedFromPayout } from '../utils/wallet.js';
import { signedVerificationDocUrl } from '../config/cloudinary.js';
import { toReviewableDocs } from '../utils/verificationDocs.js';
import {
  verificationApprovedEmail,
  verificationRejectedEmail,
  refundApprovedEmail,
  refundRejectedEmail,
  payoutApprovedEmail,
  payoutRejectedEmail,
  payoutPaidEmail,
} from '../utils/notificationEmailTemplates.js';

const MAX_PAGE_LIMIT = 50;
const DEFAULT_PAGE_LIMIT = 10;
const MAX_ANALYTICS_DAYS = 365;
const DEFAULT_ANALYTICS_DAYS = 30;

// Valid values are read from the schema itself so this never drifts from the
// actual User model (rather than hardcoding a role list here).
const VALID_ROLES = User.schema.path('role').enumValues;
const VALID_REPORT_STATUSES = Report.schema.path('status').enumValues;
const VALID_DISPUTE_STATUSES = SessionDispute.schema.path('status').enumValues;

export const getAllTransactions = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_PAGE_LIMIT));

    const [transactions, totalCount, statsResult] = await Promise.all([
      Transaction.find({})
        .populate('user', 'name email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Transaction.countDocuments({}),
      Transaction.aggregate([
        {
          $group: {
            _id: null,
            // This assumes a single currency (PKR, via Safepay) platform-wide.
            totalRevenue: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$amountPaid', 0] },
            },
            totalTransactions: { $sum: 1 },
            completedCount: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
            },
            failedCount: {
              $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
            },
            // A 'pending' row is a checkout that was opened and walked away
            // from - the Transaction is created before the buyer ever reaches
            // Safepay's page. Counting those among the rest made the headline
            // number look like activity that never happened, and dragged the
            // success rate down with attempts that never concluded either way.
            pendingCount: {
              $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
            },
            refundedCount: {
              $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, 1, 0] },
            },
          },
        },
      ]),
    ]);

    const stats = statsResult[0] || {
      totalRevenue: 0,
      totalTransactions: 0,
      completedCount: 0,
      failedCount: 0,
      pendingCount: 0,
      refundedCount: 0,
    };

    res.json({
      stats: {
        totalRevenue: stats.totalRevenue,
        totalTransactions: stats.totalTransactions,
        completedCount: stats.completedCount,
        failedCount: stats.failedCount,
        pendingCount: stats.pendingCount,
        refundedCount: stats.refundedCount,
        // Everything that reached an outcome, either way. This is the honest
        // denominator for a success rate; totalTransactions is not.
        settledCount: stats.totalTransactions - stats.pendingCount,
        currency: 'PKR',
      },
      transactions: transactions.map((t) => ({
        id: t._id.toString(),
        user: t.user
          ? { id: t.user._id.toString(), name: t.user.name, email: t.user.email }
          : null,
        priceId: t.priceId,
        creditsGranted: t.creditsGranted,
        amountPaid: t.amountPaid,
        currency: t.currency,
        status: t.status,
        createdAt: t.createdAt,
      })),
      page,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      totalCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_PAGE_LIMIT));
    const search = (req.query.search || '').trim();

    const filter = search
      ? {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
          ],
        }
      : {};

    const [users, totalCount] = await Promise.all([
      User.find(filter)
        .select('name email role createdAt isSuspended suspendedAt suspendedReason')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    res.json({
      users: users.map((u) => ({
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
        isSuspended: u.isSuspended,
        suspendedAt: u.suspendedAt,
        suspendedReason: u.suspendedReason,
      })),
      page,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      totalCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Disconnects any currently-open sockets for a user and tells them why, so a
// suspension takes effect immediately instead of waiting for their next
// reconnect. Safe no-op if the app isn't set up with socket.io (e.g. tests).
async function forceDisconnectUser(req, userId, reason) {
  const io = req.app.get('io');
  if (!io) return;
  io.to(`user:${userId}`).emit('accountSuspended', { reason });
  const sockets = await io.in(`user:${userId}`).fetchSockets();
  for (const s of sockets) s.disconnect(true);
}

export const suspendUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    if (req.user.userId === userId) {
      return res.status(400).json({ message: 'You cannot suspend your own account.' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') {
      return res.status(400).json({ message: 'Cannot suspend an admin account.' });
    }

    user.isSuspended = true;
    user.suspendedAt = new Date();
    user.suspendedReason = reason?.trim() || null;
    await user.save();

    await forceDisconnectUser(req, user._id, user.suspendedReason);

    await logAdminAction({
      adminId: req.user.userId,
      action: 'user_suspended',
      targetUserId: user._id,
      details: { reason: user.suspendedReason },
    });

    res.json({
      user: {
        id: user._id.toString(),
        isSuspended: user.isSuspended,
        suspendedAt: user.suspendedAt,
        suspendedReason: user.suspendedReason,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const unsuspendUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.isSuspended = false;
    user.suspendedAt = null;
    user.suspendedReason = null;
    await user.save();

    await logAdminAction({
      adminId: req.user.userId,
      action: 'user_unsuspended',
      targetUserId: user._id,
      details: null,
    });

    res.json({
      user: {
        id: user._id.toString(),
        isSuspended: user.isSuspended,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getReports = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_PAGE_LIMIT));
    const status = req.query.status;

    const filter = {};
    if (status) {
      if (!VALID_REPORT_STATUSES.includes(status)) {
        return res.status(400).json({ message: `Invalid status. Must be one of: ${VALID_REPORT_STATUSES.join(', ')}` });
      }
      filter.status = status;
    }

    const [reports, totalCount] = await Promise.all([
      Report.find(filter)
        .populate('reporter', 'name email')
        .populate('reportedUser', 'name email isSuspended')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Report.countDocuments(filter),
    ]);

    res.json({
      reports: reports.map((r) => ({
        id: r._id.toString(),
        reason: r.reason,
        status: r.status,
        createdAt: r.createdAt,
        reporter: r.reporter && { id: r.reporter._id.toString(), name: r.reporter.name, email: r.reporter.email },
        reportedUser: r.reportedUser && {
          id: r.reportedUser._id.toString(),
          name: r.reportedUser.name,
          email: r.reportedUser.email,
          isSuspended: r.reportedUser.isSuspended,
        },
      })),
      page,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      totalCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const reviewReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { action } = req.body; // 'block' | 'dismiss'

    if (!['block', 'dismiss'].includes(action)) {
      return res.status(400).json({ message: "action must be 'block' or 'dismiss'" });
    }

    const report = await Report.findById(reportId);
    if (!report) return res.status(404).json({ message: 'Report not found' });

    if (action === 'block') {
      const reportedUser = await User.findById(report.reportedUser);
      if (!reportedUser) return res.status(404).json({ message: 'Reported user not found' });
      if (reportedUser.role === 'admin') {
        return res.status(400).json({ message: 'Cannot suspend an admin account.' });
      }

      reportedUser.isSuspended = true;
      reportedUser.suspendedAt = new Date();
      reportedUser.suspendedReason = `Reported: ${report.reason}`;
      await reportedUser.save();
      await forceDisconnectUser(req, reportedUser._id, reportedUser.suspendedReason);
    }

    report.status = action === 'block' ? 'reviewed' : 'dismissed';
    await report.save();

    await logAdminAction({
      adminId: req.user.userId,
      action: action === 'block' ? 'report_reviewed_blocked' : 'report_dismissed',
      targetUserId: report.reportedUser,
      details: { reportId: report._id.toString(), reason: report.reason },
    });

    res.json({ report: { id: report._id.toString(), status: report.status } });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ message: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
    }

    if (role !== 'admin' && req.user.userId === userId) {
      return res.status(400).json({ message: 'You cannot change your own role away from admin.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const oldRole = user.role;
    user.role = role;
    await user.save();

    await logAdminAction({
      adminId: req.user.userId,
      action: 'role_change',
      targetUserId: user._id,
      details: { oldRole, newRole: role },
    });

    // Live badge/status update on the user's own profile, and remove the row
    // from every admin's open Verifications list.
    emitToUser(user._id.toString(), 'verificationReviewed', {
      verificationStatus: user.verificationStatus,
      verificationRejectionReason: user.verificationRejectionReason || null,
      verificationReviewedAt: user.verificationReviewedAt,
    });
    emitToAdmins('verificationReviewed', {
      userId: user._id.toString(),
      verificationStatus: user.verificationStatus,
    });

    res.json({
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAnalytics = async (req, res) => {
  try {
    const days = Math.min(MAX_ANALYTICS_DAYS, Math.max(1, parseInt(req.query.days, 10) || DEFAULT_ANALYTICS_DAYS));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days - 1));
    startDate.setHours(0, 0, 0, 0);

    const [revenueByDay, userSignupsByDay, statusBreakdown] = await Promise.all([
      Transaction.aggregate([
        { $match: { createdAt: { $gte: startDate }, status: 'completed' } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            revenue: { $sum: '$amountPaid' },
            transactionCount: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      User.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Transaction.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const breakdown = { completed: 0, failed: 0, refunded: 0, pending: 0 };
    statusBreakdown.forEach((row) => {
      if (row._id in breakdown) breakdown[row._id] = row.count;
    });

    res.json({
      revenueByDay: revenueByDay.map((r) => ({
        date: r._id,
        revenue: r.revenue,
        transactionCount: r.transactionCount,
      })),
      userSignupsByDay: userSignupsByDay.map((r) => ({ date: r._id, count: r.count })),
      transactionStatusBreakdown: breakdown,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAuditLog = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_PAGE_LIMIT));

    const [entries, totalCount] = await Promise.all([
      AdminAuditLog.find({})
        .populate('admin', 'name email')
        .populate('targetUser', 'name email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      AdminAuditLog.countDocuments({}),
    ]);

    res.json({
      entries: entries.map((e) => ({
        id: e._id.toString(),
        action: e.action,
        admin: e.admin ? { id: e.admin._id.toString(), name: e.admin.name, email: e.admin.email } : null,
        targetUser: e.targetUser
          ? { id: e.targetUser._id.toString(), name: e.targetUser.name, email: e.targetUser.email }
          : null,
        details: e.details,
        createdAt: e.createdAt,
      })),
      page,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      totalCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const VALID_VERIFICATION_STATUSES = User.schema.path('verificationStatus').enumValues;

/**
 * Streams one verification document to the reviewing admin.
 *
 * Proxied rather than redirected: a redirect would hand the browser a signed
 * Cloudinary URL, and from there it is in history, in the address bar, and in
 * anything the reviewer pastes. Fetching it here means the document reaches
 * exactly one authenticated response and nothing else.
 */
export const getVerificationDoc = async (req, res) => {
  try {
    const { userId, index } = req.params;

    const user = await User.findById(userId).select('verificationDocs');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const doc = (user.verificationDocs || [])[Number(index)];
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    // Legacy records hold a bare public URL (or an object with one) from before
    // these uploads were made private; scripts/privatiseVerificationDocs.js
    // converts them. Until it has run for a given record, fall back to that URL
    // so review is never blocked.
    const legacyUrl = typeof doc === 'string' ? doc : doc.url;
    const source = doc.publicId
      ? signedVerificationDocUrl(doc.publicId, doc.resourceType)
      : legacyUrl;

    if (!source) return res.status(404).json({ message: 'Document file is missing' });

    const upstream = await fetch(source);
    if (!upstream.ok) {
      return res.status(502).json({ message: 'Failed to fetch document from storage provider' });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());

    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    // Identity documents must not sit in a shared cache, and the signed URL
    // behind this response is short-lived anyway.
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'inline');
    return res.send(buffer);
  } catch (error) {
    console.error('Error streaming verification document:', error);
    return res.status(500).json({ message: 'Failed to load document' });
  }
};

export const getVerifications = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_PAGE_LIMIT));
    const status = req.query.status;

    const filter = {};
    if (status) {
      if (!VALID_VERIFICATION_STATUSES.includes(status)) {
        return res.status(400).json({ message: `Invalid status. Must be one of: ${VALID_VERIFICATION_STATUSES.join(', ')}` });
      }
      filter.verificationStatus = status;
    }

    const [users, totalCount] = await Promise.all([
      User.find(filter)
        .select('name email verificationStatus verificationDocs verificationSubmittedAt verificationReviewedAt verificationRejectionReason skillsTeaching')
        .sort({ verificationSubmittedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    res.json({
      users: users.map((u) => ({
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        verificationStatus: u.verificationStatus,
        verificationDocs: toReviewableDocs(u),
        verificationSubmittedAt: u.verificationSubmittedAt,
        verificationReviewedAt: u.verificationReviewedAt,
        verificationRejectionReason: u.verificationRejectionReason,
        skillsTeaching: u.skillsTeaching,
      })),
      page,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      totalCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const reviewVerification = async (req, res) => {
  try {
    const { userId } = req.params;
    const { decision, rejectionReason } = req.body;

    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ message: "decision must be 'approved' or 'rejected'" });
    }
    if (decision === 'rejected' && !rejectionReason?.trim()) {
      return res.status(400).json({ message: 'rejectionReason is required when rejecting' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.verificationStatus = decision === 'approved' ? 'verified' : 'rejected';
    user.verificationReviewedAt = new Date();
    user.verificationRejectionReason = decision === 'rejected' ? rejectionReason.trim() : undefined;
    await user.save();

    await logAdminAction({
      adminId: req.user.userId,
      action: decision === 'approved' ? 'verification_approved' : 'verification_rejected',
      targetUserId: user._id,
      details: decision === 'rejected' ? { rejectionReason: user.verificationRejectionReason } : null,
    });

    if (decision === 'approved') {
      notifyUser({
        userId: user._id,
        type: 'verification_approved',
        title: 'Your teacher verification was approved',
        body: 'You now have a Verified badge on your profile.',
        link: '/profile',
        sendEmail: true,
        emailContent: verificationApprovedEmail({ name: user.name }),
      });
    } else {
      notifyUser({
        userId: user._id,
        type: 'verification_rejected',
        title: 'Your teacher verification was rejected',
        body: user.verificationRejectionReason,
        link: '/profile',
        sendEmail: true,
        emailContent: verificationRejectedEmail({ name: user.name, reason: user.verificationRejectionReason }),
      });
    }

    res.json({
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        verificationStatus: user.verificationStatus,
        verificationReviewedAt: user.verificationReviewedAt,
        verificationRejectionReason: user.verificationRejectionReason,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getRefundRequests = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_PAGE_LIMIT));
    const status = req.query.status;

    const filter = {};
    if (status) {
      if (!['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status. Must be one of: pending, approved, rejected' });
      }
      filter.status = status;
    }

    const [requests, totalCount] = await Promise.all([
      RefundRequest.find(filter)
        .populate('user', 'name email')
        .populate('transaction', 'amountPaid currency creditsGranted status createdAt providerTransactionId')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      RefundRequest.countDocuments(filter),
    ]);

    res.json({
      requests: requests.map((r) => ({
        id: r._id.toString(),
        status: r.status,
        reason: r.reason,
        adminNote: r.adminNote,
        createdAt: r.createdAt,
        resolvedAt: r.resolvedAt,
        user: r.user ? { id: r.user._id.toString(), name: r.user.name, email: r.user.email } : null,
        transaction: r.transaction
          ? {
              id: r.transaction._id.toString(),
              amountPaid: r.transaction.amountPaid,
              currency: r.transaction.currency,
              creditsGranted: r.transaction.creditsGranted,
              status: r.transaction.status,
              createdAt: r.transaction.createdAt,
            }
          : null,
      })),
      page,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      totalCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const reviewRefundRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, adminNote } = req.body;

    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ message: "decision must be 'approved' or 'rejected'" });
    }
    if (decision === 'rejected' && !adminNote?.trim()) {
      return res.status(400).json({ message: 'adminNote is required when rejecting' });
    }

    const refundRequest = await RefundRequest.findById(id).populate('transaction').populate('user', 'name');
    if (!refundRequest) {
      return res.status(404).json({ message: 'Refund request not found' });
    }
    if (refundRequest.status !== 'pending') {
      return res.status(400).json({ message: `This refund request has already been ${refundRequest.status}.` });
    }

    if (decision === 'rejected') {
      refundRequest.status = 'rejected';
      refundRequest.adminNote = adminNote.trim();
      refundRequest.resolvedAt = new Date();
      await refundRequest.save();

      await logAdminAction({
        adminId: req.user.userId,
        action: 'refund_rejected',
        targetUserId: refundRequest.user._id,
        details: { refundRequestId: refundRequest._id.toString(), adminNote: refundRequest.adminNote },
      });

      notifyUser({
        userId: refundRequest.user._id,
        type: 'refund_rejected',
        title: 'Your refund request was rejected',
        body: refundRequest.adminNote,
        link: '/credits/history',
        sendEmail: true,
        emailContent: refundRejectedEmail({ name: refundRequest.user.name, reason: refundRequest.adminNote }),
      });

      return res.json({
        refundRequest: {
          id: refundRequest._id.toString(),
          status: refundRequest.status,
          adminNote: refundRequest.adminNote,
          resolvedAt: refundRequest.resolvedAt,
        },
      });
    }

    // decision === 'approved' - Safepay's SDK has no refund/adjustment API, so
    // there is no gateway call to make here. This
    // records the approval and reverses the credits; the actual money refund
    // has to be issued manually by the team through the Safepay merchant
    // dashboard. The user is told this explicitly (see refundApprovedEmail).
    const transaction = refundRequest.transaction;
    if (!transaction) {
      return res.status(400).json({ message: 'This refund request is not linked to a valid transaction.' });
    }

    refundRequest.status = 'approved';
    refundRequest.adminNote = adminNote?.trim() || undefined;
    refundRequest.resolvedAt = new Date();
    await refundRequest.save();

    // Wallet balance, the credit ledger entry, and flipping the transaction to
    // 'refunded' move together - wrap them in a real Mongo transaction so a
    // mid-way failure can't leave one applied and the other not.
    const creditsToDeduct = transaction.creditsGranted || 0;
    let creditNote = null;
    let followUpError = null;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const wallet = await CreditWallet.findOne({ user: refundRequest.user._id }).session(session);

        if (wallet && creditsToDeduct > 0) {
          const actualDeduction = Math.min(wallet.balance, creditsToDeduct);
          wallet.balance = Math.max(0, wallet.balance - creditsToDeduct);
          wallet.totalSpent += actualDeduction;
          await wallet.save({ session });

          if (actualDeduction < creditsToDeduct) {
            creditNote = `User had already spent ${creditsToDeduct - actualDeduction} of the ${creditsToDeduct} refunded credits; balance floored at 0 instead of going negative.`;
          }

          await CreditTransaction.create(
            [{
              user: refundRequest.user._id,
              type: 'refund',
              amount: -actualDeduction,
              description: `Refund approved for transaction ${transaction._id}`,
              source: 'admin',
              transactionRef: transaction._id,
            }],
            { session }
          );
        }

        transaction.status = 'refunded';
        await transaction.save({ session });
      });
    } catch (txError) {
      followUpError = txError;
      console.error(
        `CRITICAL: RefundRequest ${refundRequest._id} approval succeeded, but the wallet/transaction update failed and was rolled back:`,
        txError
      );
    } finally {
      await session.endSession();
    }

    if (creditNote) {
      refundRequest.adminNote = [refundRequest.adminNote, creditNote].filter(Boolean).join(' ');
      await refundRequest.save().catch((e) => console.error('Failed to save creditNote onto refundRequest:', e.message));
    }

    await logAdminAction({
      adminId: req.user.userId,
      action: 'refund_approved',
      targetUserId: refundRequest.user._id,
      details: {
        refundRequestId: refundRequest._id.toString(),
        transactionId: transaction._id.toString(),
        creditsDeducted: creditsToDeduct,
        walletSyncFailed: !!followUpError,
        manualPaymentRefundRequired: true,
      },
    });

    notifyUser({
      userId: refundRequest.user._id,
      type: 'refund_approved',
      title: 'Your refund was approved',
      body: `Your refund for transaction ${transaction._id} has been approved. Our team will process the payment refund manually within a few business days.`,
      link: '/credits/history',
      sendEmail: true,
      emailContent: refundApprovedEmail({
        name: refundRequest.user.name,
        amountPaid: transaction.amountPaid,
        currency: transaction.currency,
        creditsGranted: creditsToDeduct,
      }),
    });

    if (followUpError) {
      return res.json({
        refundRequest: {
          id: refundRequest._id.toString(),
          status: refundRequest.status,
          adminNote: refundRequest.adminNote,
          resolvedAt: refundRequest.resolvedAt,
        },
        warning: `Refund approved, but updating the wallet/transaction failed (${followUpError.message}). Please reconcile transaction ${transaction._id} and the user's wallet manually.`,
      });
    }

    res.json({
      refundRequest: {
        id: refundRequest._id.toString(),
        status: refundRequest.status,
        adminNote: refundRequest.adminNote,
        resolvedAt: refundRequest.resolvedAt,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getPayoutRequests = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_PAGE_LIMIT));
    const status = req.query.status;

    const filter = {};
    if (status) {
      if (!['pending', 'approved', 'rejected', 'paid'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status. Must be one of: pending, approved, rejected, paid' });
      }
      filter.status = status;
    }

    const [requests, totalCount] = await Promise.all([
      PayoutRequest.find(filter)
        .populate('teacher', 'name email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      PayoutRequest.countDocuments(filter),
    ]);

    res.json({
      requests: requests.map((r) => ({
        id: r._id.toString(),
        teacher: r.teacher ? { id: r.teacher._id.toString(), name: r.teacher.name, email: r.teacher.email } : null,
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

export const reviewPayoutRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, adminNote } = req.body;

    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ message: "decision must be 'approved' or 'rejected'" });
    }
    if (decision === 'rejected' && !adminNote?.trim()) {
      return res.status(400).json({ message: 'adminNote is required when rejecting' });
    }

    const payoutRequest = await PayoutRequest.findById(id).populate('teacher', 'name');
    if (!payoutRequest) {
      return res.status(404).json({ message: 'Payout request not found' });
    }
    if (payoutRequest.status !== 'pending') {
      return res.status(400).json({ message: `This payout request has already been ${payoutRequest.status}.` });
    }

    if (decision === 'approved') {
      // Approval is only a decision that admin intends to pay - no money has moved
      // yet and the held credits stay held until mark-paid or a later rejection.
      payoutRequest.status = 'approved';
      payoutRequest.adminNote = adminNote?.trim() || undefined;
      payoutRequest.resolvedAt = new Date();
      await payoutRequest.save();

      await logAdminAction({
        adminId: req.user.userId,
        action: 'payout_approved',
        targetUserId: payoutRequest.teacher._id,
        details: { payoutRequestId: payoutRequest._id.toString(), creditsRequested: payoutRequest.creditsRequested },
      });

      notifyUser({
        userId: payoutRequest.teacher._id,
        type: 'payout_approved',
        title: 'Your payout request was approved',
        body: `Your request for ${payoutRequest.creditsRequested} credits (Rs. ${payoutRequest.amountPKR}) was approved and will be paid soon.`,
        link: '/credits',
        sendEmail: true,
        emailContent: payoutApprovedEmail({
          name: payoutRequest.teacher.name,
          credits: payoutRequest.creditsRequested,
          amountPKR: payoutRequest.amountPKR,
        }),
      });

      return res.json({
        payoutRequest: {
          id: payoutRequest._id.toString(),
          status: payoutRequest.status,
          adminNote: payoutRequest.adminNote,
          resolvedAt: payoutRequest.resolvedAt,
        },
      });
    }

    // decision === 'rejected' - reverse the hold so the teacher gets their credits back.
    const wallet = await CreditWallet.findOne({ user: payoutRequest.teacher._id });
    if (wallet) {
      releaseEarnedFromPayout(wallet, payoutRequest.creditsRequested);
      wallet.totalEarned += payoutRequest.creditsRequested;
      await wallet.save();

      await CreditTransaction.create({
        user: payoutRequest.teacher._id,
        type: 'payout_reversal',
        amount: payoutRequest.creditsRequested,
        description: `Payout request rejected - hold reversed (${payoutRequest.creditsRequested} credits)`,
        source: 'admin',
        payoutRef: payoutRequest._id,
      });
    }

    payoutRequest.status = 'rejected';
    payoutRequest.adminNote = adminNote.trim();
    payoutRequest.resolvedAt = new Date();
    await payoutRequest.save();

    await logAdminAction({
      adminId: req.user.userId,
      action: 'payout_rejected',
      targetUserId: payoutRequest.teacher._id,
      details: {
        payoutRequestId: payoutRequest._id.toString(),
        creditsReversed: payoutRequest.creditsRequested,
        adminNote: payoutRequest.adminNote,
      },
    });

    notifyUser({
      userId: payoutRequest.teacher._id,
      type: 'payout_rejected',
      title: 'Your payout request was rejected',
      body: payoutRequest.adminNote,
      link: '/credits',
      sendEmail: true,
      emailContent: payoutRejectedEmail({
        name: payoutRequest.teacher.name,
        credits: payoutRequest.creditsRequested,
        reason: payoutRequest.adminNote,
      }),
    });

    res.json({
      payoutRequest: {
        id: payoutRequest._id.toString(),
        status: payoutRequest.status,
        adminNote: payoutRequest.adminNote,
        resolvedAt: payoutRequest.resolvedAt,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const markPayoutPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentReference } = req.body;

    if (!paymentReference?.trim()) {
      return res.status(400).json({ message: 'paymentReference is required' });
    }

    const payoutRequest = await PayoutRequest.findById(id).populate('teacher', 'name');
    if (!payoutRequest) {
      return res.status(404).json({ message: 'Payout request not found' });
    }
    if (payoutRequest.status !== 'approved') {
      return res.status(400).json({
        message: `Only approved payout requests can be marked paid (current status: ${payoutRequest.status}).`,
      });
    }

    payoutRequest.status = 'paid';
    payoutRequest.paymentReference = paymentReference.trim();
    payoutRequest.resolvedAt = new Date();
    await payoutRequest.save();

    await logAdminAction({
      adminId: req.user.userId,
      action: 'payout_marked_paid',
      targetUserId: payoutRequest.teacher._id,
      details: { payoutRequestId: payoutRequest._id.toString(), creditsRequested: payoutRequest.creditsRequested },
    });

    notifyUser({
      userId: payoutRequest.teacher._id,
      type: 'payout_paid',
      title: 'Your payout has been paid',
      body: `${payoutRequest.creditsRequested} credits (Rs. ${payoutRequest.amountPKR}) sent. Reference: ${payoutRequest.paymentReference}`,
      link: '/credits',
      sendEmail: true,
      emailContent: payoutPaidEmail({
        name: payoutRequest.teacher.name,
        credits: payoutRequest.creditsRequested,
        amountPKR: payoutRequest.amountPKR,
        paymentReference: payoutRequest.paymentReference,
        payoutMethod: payoutRequest.payoutMethod,
      }),
    });

    res.json({
      payoutRequest: {
        id: payoutRequest._id.toString(),
        status: payoutRequest.status,
        paymentReference: payoutRequest.paymentReference,
        resolvedAt: payoutRequest.resolvedAt,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getSessionDisputes = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_PAGE_LIMIT));
    const status = req.query.status;

    const filter = {};
    if (status) {
      if (!VALID_DISPUTE_STATUSES.includes(status)) {
        return res.status(400).json({ message: `Invalid status. Must be one of: ${VALID_DISPUTE_STATUSES.join(', ')}` });
      }
      filter.status = status;
    }

    const [disputes, totalCount] = await Promise.all([
      SessionDispute.find(filter)
        .populate('reportedBy', 'name email')
        .populate({
          path: 'meeting',
          select: 'title startsAt duration sessionType skill participants createdBy',
          populate: { path: 'participants', select: 'name email' },
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      SessionDispute.countDocuments(filter),
    ]);

    res.json({
      disputes: disputes.map((d) => ({
        id: d._id.toString(),
        status: d.status,
        reason: d.reason,
        adminNote: d.adminNote,
        createdAt: d.createdAt,
        resolvedAt: d.resolvedAt,
        reportedBy: d.reportedBy
          ? { id: d.reportedBy._id.toString(), name: d.reportedBy.name, email: d.reportedBy.email }
          : null,
        meeting: d.meeting
          ? {
              id: d.meeting._id.toString(),
              title: d.meeting.title,
              startsAt: d.meeting.startsAt,
              duration: d.meeting.duration,
              sessionType: d.meeting.sessionType,
              skill: d.meeting.skill,
              participants: (d.meeting.participants || []).map((p) => ({
                id: p._id.toString(),
                name: p.name,
                email: p.email,
              })),
            }
          : null,
      })),
      page,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      totalCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const reviewSessionDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, adminNote } = req.body;

    if (!['upheld', 'rejected'].includes(decision)) {
      return res.status(400).json({ message: "decision must be 'upheld' or 'rejected'" });
    }
    if (!adminNote?.trim()) {
      return res.status(400).json({ message: 'adminNote is required' });
    }

    const dispute = await SessionDispute.findById(id).populate('meeting');
    if (!dispute) {
      return res.status(404).json({ message: 'Dispute not found' });
    }
    if (dispute.status !== 'pending') {
      return res.status(400).json({ message: `This dispute has already been ${dispute.status}.` });
    }

    const meeting = dispute.meeting;
    if (!meeting) {
      return res.status(404).json({ message: 'The meeting behind this dispute no longer exists.' });
    }
    if (meeting.creditsProcessed) {
      // Shouldn't happen (a pending dispute blocks Step 2), but don't let a
      // decision double-process credits if it somehow does.
      return res.status(400).json({ message: 'Credits for this meeting have already been finalized.' });
    }

    dispute.status = decision;
    dispute.adminNote = adminNote.trim();
    dispute.resolvedAt = new Date();
    await dispute.save();

    if (decision === 'upheld') {
      // No-show confirmed - permanently block credits for this meeting. Set
      // creditsProcessed so Step 2's query (creditsProcessed: false) can never
      // pick this meeting up again, same as the "insufficient balance" branch
      // in processCompletedMeetingCredits uses to mark a meeting settled
      // without a transfer happening.
      meeting.creditsProcessed = true;
      meeting.creditsNote = `No credits transferred - dispute upheld: ${adminNote.trim()}`;
      await meeting.save();
    } else {
      // Rejected - the dispute doesn't hold up, so process credits right now
      // rather than waiting for the next Step 2 tick.
      await processCompletedMeetingCredits(meeting);
    }

    await logAdminAction({
      adminId: req.user.userId,
      action: decision === 'upheld' ? 'session_dispute_upheld' : 'session_dispute_rejected',
      targetUserId: dispute.reportedBy,
      details: { disputeId: dispute._id.toString(), meetingId: meeting._id.toString(), adminNote: dispute.adminNote },
    });

    const participantIds = meeting.participants.map(String);
    for (const participantId of participantIds) {
      notifyUser({
        userId: participantId,
        type: decision === 'upheld' ? 'session_dispute_upheld' : 'session_dispute_rejected',
        title: decision === 'upheld' ? 'Session dispute resolved - no-show confirmed' : 'Session dispute resolved - session stands',
        body: decision === 'upheld'
          ? `"${meeting.title}": ${adminNote.trim()} No credits were transferred for this session.`
          : `"${meeting.title}": ${adminNote.trim()} Credits have been processed as normal.`,
        link: '/meetings/history',
      });
    }

    res.json({
      dispute: {
        id: dispute._id.toString(),
        status: dispute.status,
        adminNote: dispute.adminNote,
        resolvedAt: dispute.resolvedAt,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

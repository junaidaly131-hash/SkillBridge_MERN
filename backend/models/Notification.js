import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    required: true,
    enum: [
      'new_message', 'meeting_reminder', 'meeting_confirmed', 'meeting_cancelled',
      // A session now has to be agreed to before it runs, so there is an
      // invitation to answer and two ways it can end without happening.
      'meeting_invite', 'meeting_declined', 'meeting_expired',
      // Already raised by POST /meetings/:id/report-issue but missing from this
      // list, so creating it threw, notifyUser swallowed the error, and the
      // other participant was never told their session had been disputed -
      // neither by bell nor by socket, since the emit sits after the create.
      'session_disputed',
      'credit_low_balance', 'verification_submitted', 'verification_approved', 'verification_rejected',
      'refund_approved', 'refund_rejected', 'payout_approved', 'payout_rejected', 'payout_paid',
    ],
  },
  title: { type: String, required: true },
  body: { type: String },
  link: { type: String },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

notificationSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);

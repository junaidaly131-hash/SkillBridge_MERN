import mongoose from 'mongoose';

const verificationCodeSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      length: 6,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    purpose: {
      type: String,
      enum: ['signup', 'login', 'password_reset'],
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    },
    verified: {
      type: Boolean,
      default: false,
    },
    // Wrong guesses against this specific code. A 6-digit code is only 1,000,000
    // possibilities, so without a ceiling the 10-minute window is long enough to
    // walk the whole space - and /auth/verify hands back a full session, so that
    // would be account takeover with no password involved. At MAX_CODE_ATTEMPTS
    // the code is burned and the user has to request a new one.
    attempts: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Index for cleanup
verificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
verificationCodeSchema.index({ email: 1, purpose: 1 });

export default mongoose.model('VerificationCode', verificationCodeSchema);


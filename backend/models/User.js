import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { VERIFICATION_DOC_TYPE_VALUES, DEFAULT_VERIFICATION_DOC_TYPE } from '../config/verificationDocTypes.js';

const skillSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  sessions: {
    type: Number,
    default: 0,
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5,
  },
});

const learningSkillSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  // Completed learning sessions for this specific skill - the only thing
  // `progress` is actually derived from (see PROGRESS_PER_SESSION in
  // utils/meetingCompletion.js). Not user-editable.
  sessions: {
    type: Number,
    default: 0,
  },
  // Auto-computed from `sessions` each time a session for this skill
  // completes - never set directly by the user.
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
});

const verificationDocSchema = new mongoose.Schema({
  // Legacy only. These documents used to be uploaded with Cloudinary's default
  // delivery type, which meant the URL alone was enough for anyone to fetch
  // somebody's CNIC - no login, no expiry. New uploads are private and carry
  // `publicId` instead, and the URL to view one is signed per request. Kept
  // (and no longer required) so records written before that change still open;
  // scripts/privatiseVerificationDocs.js converts them.
  url: {
    type: String,
    default: '',
  },
  // Cloudinary public id of a private asset. Never a URL: a signed Cloudinary
  // URL does not expire unless an expiry is baked in, so storing one would put
  // a permanently working link to a national ID document in the database.
  publicId: {
    type: String,
    default: '',
  },
  // 'image' or 'raw' - needed to address the asset, since Cloudinary namespaces
  // the two separately and a PDF is stored as raw.
  resourceType: {
    type: String,
    enum: ['image', 'raw'],
    default: 'image',
  },
  docType: {
    type: String,
    enum: VERIFICATION_DOC_TYPE_VALUES,
    default: DEFAULT_VERIFICATION_DOC_TYPE,
  },
  fileName: {
    type: String,
    default: '',
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
});

const certificationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  issuer: {
    type: String,
    trim: true,
  },
  year: {
    type: String,
  },
  fileUrl: {
    type: String,
  },
  filePublicId: {
    type: String,
  },
  fileName: {
    type: String,
  },
  fileMimeType: {
    type: String,
  },
});

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please provide an email'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: function() {
        return !this.googleId && !this.facebookId;
      },
      minlength: 6,
      select: false,
    },
    googleId: {
      type: String,
      sparse: true,
    },
    facebookId: {
      type: String,
      sparse: true,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    // Platform-level suspension, distinct from the user-to-user `blockedUsers`
    // relationship below - set by an admin (typically off the back of a
    // report) to cut off login/chat access entirely.
    isSuspended: {
      type: Boolean,
      default: false,
    },
    suspendedAt: {
      type: Date,
      default: null,
    },
    suspendedReason: {
      type: String,
      default: null,
    },
    verificationStatus: {
      type: String,
      enum: ['unverified', 'pending', 'verified', 'rejected'],
      default: 'unverified',
    },
    // Objects rather than bare URLs so the admin review screen can say what
    // each file is meant to be (see config/verificationDocTypes.js). Older
    // string entries were converted by scripts/migrateVerificationDocs.js.
    verificationDocs: [verificationDocSchema],
    verificationSubmittedAt: {
      type: Date,
    },
    verificationReviewedAt: {
      type: Date,
    },
    verificationRejectionReason: {
      type: String,
    },
    bio: {
      type: String,
      maxlength: 500,
      default: '',
    },
    location: {
      type: String,
      trim: true,
      default: '',
    },
    languages: [{
      type: String,
      trim: true,
    }],
    timezone: {
      type: String,
      default: '',
    },
    avatar: {
      type: String,
      default: '',
    },
    avatarPublicId: {
      type: String,
      default: '',
    },
    skillsTeaching: [skillSchema],
    skillsLearning: [learningSkillSchema],
    certifications: [certificationSchema],
    stats: {
      sessionsTaught: {
        type: Number,
        default: 0,
      },
      sessionsLearned: {
        type: Number,
        default: 0,
      },
      avgRating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
      },
    },
    // Users this account has blocked. Blocking prevents messages in either
    // direction between the two accounts.
    blockedUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    // Updated when a user's last socket disconnects; used to show "last seen" text.
    lastSeen: {
      type: Date,
      default: null,
    },
    // True once this user has booked their one free trial session as a
    // student - set at booking time, not completion, and never reset by any
    // in-app action. See Meeting.isFreeTrialSession.
    freeTrialSessionUsed: {
      type: Boolean,
      default: false,
    },
    // Teacher-side opt-in: off by default, since accepting a free-trial
    // booking means this user earns nothing for that session.
    acceptsFreeTrialSessions: {
      type: Boolean,
      default: false,
    },
    // Set once the post-signup wizard is finished OR skipped - either way the
    // wizard never reappears. Accounts that predate the wizard were backfilled
    // to true (scripts/backfillOnboarding.js) so it only ever greets new signups.
    onboardingCompleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('User', userSchema);



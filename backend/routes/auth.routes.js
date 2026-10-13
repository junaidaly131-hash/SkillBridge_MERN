import express from 'express';
import crypto from 'crypto';
import User from '../models/User.js';
import VerificationCode from '../models/VerificationCode.js';
import { sendVerificationCode, sendPasswordResetCode } from '../utils/emailService.js';
import { authenticateToken } from '../middleware/auth.js';
import { codeIssueLimiter, codeRedeemLimiter } from '../middleware/rateLimit.js';
import { signAuthToken } from '../config/jwt.js';
import { verifyGoogleCredential, verifyFacebookAccessToken, OAuthError } from '../utils/oauthVerify.js';

const router = express.Router();

// Wrong guesses allowed against one code before it is burned. This is the real
// defence against brute-forcing a 6-digit code: it holds no matter how many IP
// addresses the attacker has, which is not true of any rate limiter. Five is
// what a mistyped code needs and nowhere near what guessing needs.
const MAX_CODE_ATTEMPTS = 5;

// Purposes that /verify will accept. 'password_reset' is deliberately absent -
// that code belongs to /reset-password only. Redeeming it here used to hand
// back a full session instead, which let a reset code be turned into a silent
// account takeover: the password never changes, so the owner sees nothing
// unusual and the attacker keeps the session.
const SESSION_GRANTING_PURPOSES = ['signup', 'login'];

// Generate 6-digit code.
//
// crypto.randomInt, not Math.random: V8's Math.random is a seeded xorshift128+
// generator whose internal state can be recovered from a handful of outputs, so
// anyone who could ask for codes to their own address could then predict the
// next code issued to somebody else's.
function generateCode() {
  return String(crypto.randomInt(100000, 1000000));
}

// Constant-time compare for a submitted code against the stored one. Same shape
// as the webhook signature check in config/safepay.js - length is compared
// first because timingSafeEqual throws on a mismatch.
function codeMatches(submitted, stored) {
  const a = Buffer.from(String(submitted), 'utf8');
  const b = Buffer.from(String(stored), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Finds the newest live code for this email and checks the submitted one
 * against it, counting the guess if it is wrong.
 *
 * Looking the record up by email+purpose and THEN comparing the code is what
 * makes the attempt counter possible at all. Querying by code (as this used to)
 * means a wrong guess simply matches no document, leaving nothing to record the
 * attempt against - so the code stayed guessable for its full ten minutes.
 *
 * Returns { record } on success, or { error: { status, message } }.
 */
async function consumeCode({ email, code, purposes }) {
  const record = await VerificationCode.findOne({
    email,
    purpose: Array.isArray(purposes) ? { $in: purposes } : purposes,
    verified: false,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  // Same message whether there is no code at all, it expired, or it was for a
  // different purpose - none of that is information a caller needs.
  if (!record) {
    return { error: { status: 400, message: 'Invalid or expired verification code' } };
  }

  if (record.attempts >= MAX_CODE_ATTEMPTS) {
    return {
      error: {
        status: 400,
        message: 'Too many incorrect attempts for this code. Please request a new one.',
      },
    };
  }

  if (!codeMatches(code, record.code)) {
    await VerificationCode.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
    const left = MAX_CODE_ATTEMPTS - (record.attempts + 1);
    return {
      error: {
        status: 400,
        message: left > 0
          ? `Invalid verification code. ${left} attempt${left === 1 ? '' : 's'} left.`
          : 'Invalid verification code. Please request a new one.',
      },
    };
  }

  return { record };
}

// Register
router.post('/register', codeIssueLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create new user
    const user = await User.create({
      name,
      email,
      password,
    });

    // Generate and send verification code
    const code = generateCode();
    await VerificationCode.create({
      email: user.email,
      code,
      userId: user._id,
      purpose: 'signup',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    });

    // Send email in background (non-blocking)
    sendVerificationCode(user.email, code).catch(err => 
      console.error('❌ Error sending verification email:', err.message)
    );

    // Return success immediately
    res.status(201).json({
      success: true,
      requiresVerification: true,
      email: user.email,
      message: `Verification code sent to your email`,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Login
router.post('/login', codeIssueLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.isSuspended) {
      return res.status(403).json({ message: 'Your account has been suspended. Contact support for help.' });
    }

    // Generate and send verification code
    const code = generateCode();
    await VerificationCode.create({
      email: user.email,
      code,
      userId: user._id,
      purpose: 'login',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    });

    // Send email in background (non-blocking)
    sendVerificationCode(user.email, code).catch(err => 
      console.error('❌ Error sending verification email:', err.message)
    );

    // Return success immediately
    res.json({
      success: true,
      requiresVerification: true,
      email: user.email,
      message: 'Verification code sent to your email',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Google OAuth
// Identity comes ONLY from the verified Google token - never from the request
// body. Reading email/name off the body previously let anyone mint a session
// for any address, including an admin's.
router.post('/google', async (req, res) => {
  try {
    const { credential, tokenId } = req.body;

    let verified;
    try {
      verified = await verifyGoogleCredential(credential || tokenId);
    } catch (err) {
      if (err instanceof OAuthError) {
        return res.status(err.status).json({ message: err.message });
      }
      console.error('Google verification error:', err.message);
      return res.status(401).json({ message: 'Google sign-in could not be verified.' });
    }

    const { sub: googleSubject, email, name } = verified;

    let user = await User.findOne({
      $or: [{ email }, { googleId: googleSubject }]
    });

    if (user) {
      // Update googleId if not set
      if (!user.googleId) {
        user.googleId = googleSubject;
        await user.save();
      }
    } else {
      // Create new user
      user = await User.create({
        name,
        email,
        googleId: googleSubject,
        password: undefined, // OAuth users don't need password
      });
    }

    if (user.isSuspended) {
      return res.status(403).json({ message: 'Your account has been suspended. Contact support for help.' });
    }

    // Generate JWT token
    const token = signAuthToken(user._id);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        onboardingCompleted: user.onboardingCompleted,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Facebook OAuth
// Same rule as /google: only what Facebook's own API returns for the presented
// access token is trusted. Body-supplied email/name are ignored entirely.
router.post('/facebook', async (req, res) => {
  try {
    const { accessToken } = req.body;

    let verified;
    try {
      verified = await verifyFacebookAccessToken(accessToken);
    } catch (err) {
      if (err instanceof OAuthError) {
        return res.status(err.status).json({ message: err.message });
      }
      console.error('Facebook verification error:', err.message);
      return res.status(401).json({ message: 'Facebook sign-in could not be verified.' });
    }

    const { id: fbId, email, name } = verified;

    let user = await User.findOne({
      $or: [{ email }, { facebookId: fbId }]
    });

    if (user) {
      // Update facebookId if not set
      if (!user.facebookId) {
        user.facebookId = fbId;
        await user.save();
      }
    } else {
      // Create new user
      user = await User.create({
        name,
        email,
        facebookId: fbId,
        password: undefined, // OAuth users don't need password
      });
    }

    if (user.isSuspended) {
      return res.status(403).json({ message: 'Your account has been suspended. Contact support for help.' });
    }

    // Generate JWT token
    const token = signAuthToken(user._id);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        onboardingCompleted: user.onboardingCompleted,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Verify code and complete authentication
router.post('/verify', codeRedeemLimiter, async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ message: 'Email and code are required' });
    }

    const { record: verification, error } = await consumeCode({
      email: String(email).toLowerCase().trim(),
      code: String(code).trim(),
      purposes: SESSION_GRANTING_PURPOSES,
    });
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    // Mark as verified
    verification.verified = true;
    await verification.save();

    // Get user
    const user = await User.findById(verification.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.isSuspended) {
      return res.status(403).json({ message: 'Your account has been suspended. Contact support for help.' });
    }

    // Generate JWT token
    const token = signAuthToken(user._id);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        onboardingCompleted: user.onboardingCompleted,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Resend verification code
router.post('/resend-code', codeIssueLimiter, async (req, res) => {
  try {
    const { email, purpose } = req.body;

    if (!email || !purpose) {
      return res.status(400).json({ message: 'Email and purpose are required' });
    }

    // `purpose` is written straight into the record and decides which endpoint
    // the resulting code works at, so it cannot be taken on trust. Only a
    // resend of a sign-in code belongs here: a password reset has its own
    // endpoint, and allowing it through this one let anyone send a
    // "reset your password" mail, from our own verified sending domain, to any
    // address they had reason to think was registered.
    if (!SESSION_GRANTING_PURPOSES.includes(purpose)) {
      return res.status(400).json({ message: 'Unsupported purpose' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    // Deliberately NOT a 404 when the address is unknown. This endpoint needs
    // no account to call and used to answer 404 vs 200, which made it a working
    // "is this person registered here?" oracle - the exact thing
    // /forgot-password below goes out of its way to avoid. Both now answer the
    // same way and only actually send when there is somebody to send to.
    if (user) {
      // Invalidate old codes for this email and purpose
      await VerificationCode.updateMany(
        { email: normalizedEmail, purpose, verified: false },
        { verified: true }
      );

      // Generate new code
      const code = generateCode();
      await VerificationCode.create({
        email: user.email,
        code,
        userId: user._id,
        purpose,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      });

      sendVerificationCode(user.email, code).catch((err) =>
        console.error('❌ Error resending verification email:', err.message)
      );
    }

    res.json({
      success: true,
      message: 'If an account exists for that email, a new code has been sent.',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Request a password reset code. Always responds with the same success
// message regardless of whether the email exists, so this can't be used to
// enumerate registered accounts - the code is only actually sent if it does.
router.post('/forgot-password', codeIssueLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email?.trim()) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (user) {
      // Invalidate any earlier still-active reset codes for this email first.
      await VerificationCode.updateMany(
        { email: normalizedEmail, purpose: 'password_reset', verified: false },
        { verified: true }
      );

      const code = generateCode();
      await VerificationCode.create({
        email: normalizedEmail,
        code,
        userId: user._id,
        purpose: 'password_reset',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      sendPasswordResetCode(normalizedEmail, code).catch((err) =>
        console.error('❌ Error sending password reset email:', err.message)
      );
    }

    res.json({
      success: true,
      message: 'If an account exists for that email, a password reset code has been sent.',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Verify the reset code and set a new password in one step.
router.post('/reset-password', codeRedeemLimiter, async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: 'Email, code, and newPassword are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    const { record: verification, error } = await consumeCode({
      email: normalizedEmail,
      code: String(code).trim(),
      purposes: 'password_reset',
    });
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const user = await User.findById(verification.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    verification.verified = true;
    await verification.save();

    user.password = newPassword; // pre-save hook rehashes since this field changed
    await user.save();

    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get current user (verify token)
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        onboardingCompleted: user.onboardingCompleted,
        skills: user.skills,
        interests: user.interests,
        bio: user.bio,
        profilePicture: user.profilePicture,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;


import express from 'express';
import User from '../models/User.js';
import Report from '../models/Report.js';
import { CreditWallet } from '../models/Credit.js';
import { authenticateToken } from '../middleware/auth.js';
import { uploadAvatar, uploadCertification, deleteFromCloudinary } from '../config/cloudinary.js';
import { documentFetchLimiter } from '../middleware/rateLimit.js';
import MarketingSuppression from '../models/MarketingSuppression.js';

const router = express.Router();

// Get current user profile (full details)
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
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
        bio: user.bio,
        location: user.location,
        languages: user.languages,
        timezone: user.timezone,
        avatar: user.avatar,
        skillsTeaching: user.skillsTeaching,
        skillsLearning: user.skillsLearning,
        certifications: user.certifications,
        stats: user.stats,
        createdAt: user.createdAt,
        verificationStatus: user.verificationStatus,
        // Document types and names only - no storage id or URL. The owner
        // already has these files; the UI uses this to show which slots are
        // filled, and handing out a way to address the stored copy would widen
        // the only route to a CNIC for no gain.
        verificationDocs: (user.verificationDocs || []).map((d) =>
          typeof d === 'string'
            ? { docType: undefined, fileName: '' }
            : { docType: d.docType, fileName: d.fileName || '' }
        ),
        verificationSubmittedAt: user.verificationSubmittedAt,
        verificationReviewedAt: user.verificationReviewedAt,
        verificationRejectionReason: user.verificationRejectionReason,
        blockedUsers: user.blockedUsers,
        freeTrialSessionUsed: user.freeTrialSessionUsed,
        acceptsFreeTrialSessions: user.acceptsFreeTrialSessions,
        onboardingCompleted: user.onboardingCompleted,
        emailVerifiedAt: user.emailVerifiedAt,
        marketingPreference: user.marketingPreference,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Marks the post-signup wizard as done. Called both when the wizard is
// completed and when it's skipped - skipping saves nothing else, so anything
// the user passed over stays genuinely empty rather than getting a default.
// The data the wizard does collect goes through the existing skills/profile
// endpoints below, not through here.
router.patch('/me/onboarding', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { onboardingCompleted: true },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ success: true, onboardingCompleted: user.onboardingCompleted });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update user profile
router.put('/me', authenticateToken, async (req, res) => {
  try {
    const { name, bio, location, languages, timezone, acceptsFreeTrialSessions } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (bio !== undefined) updateData.bio = bio;
    if (location !== undefined) updateData.location = location;
    if (languages !== undefined) updateData.languages = languages;
    if (timezone !== undefined) updateData.timezone = timezone;
    if (acceptsFreeTrialSessions !== undefined) updateData.acceptsFreeTrialSessions = acceptsFreeTrialSessions;

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        bio: user.bio,
        location: user.location,
        languages: user.languages,
        timezone: user.timezone,
        avatar: user.avatar,
        skillsTeaching: user.skillsTeaching,
        skillsLearning: user.skillsLearning,
        certifications: user.certifications,
        stats: user.stats,
        freeTrialSessionUsed: user.freeTrialSessionUsed,
        acceptsFreeTrialSessions: user.acceptsFreeTrialSessions,
        // Must be present: the client replaces its whole cached profile with
        // this payload, and a missing flag reads as "onboarding not pending",
        // which would tear the wizard down mid-flow.
        onboardingCompleted: user.onboardingCompleted,
        emailVerifiedAt: user.emailVerifiedAt,
        marketingPreference: user.marketingPreference,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Account-level marketing choice. Transactional messages (verification,
// password reset, meetings) are deliberately unaffected.
router.patch('/me/marketing-preference', authenticateToken, async (req, res) => {
  try {
    if (typeof req.body?.subscribed !== 'boolean') {
      return res.status(400).json({ message: 'subscribed must be true or false' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ message: 'Admin accounts cannot receive campaigns' });
    if (req.body.subscribed && !user.emailVerifiedAt) {
      return res.status(400).json({ message: 'Verify your email before subscribing to updates.' });
    }

    const normalizedEmail = user.email.trim().toLowerCase();
    if (req.body.subscribed) {
      const providerSuppression = await MarketingSuppression.exists({ normalizedEmail, active: true, reason: { $in: ['hard_bounce', 'complaint'] } });
      if (providerSuppression) {
        return res.status(409).json({ message: 'This address is suppressed after a delivery or complaint event. Contact support before opting in again.' });
      }
    }
    const now = new Date();
    user.marketingPreference = {
      status: req.body.subscribed ? 'opted_in' : 'opted_out',
      changedAt: now,
      source: 'account_settings',
    };
    await user.save();

    if (req.body.subscribed) {
      // Only an explicit unsubscribe is reversible here. A complaint or hard
      // bounce remains suppressed until an administrator/provider resolves it.
      await MarketingSuppression.updateOne(
        { normalizedEmail, reason: 'unsubscribe' },
        { $set: { active: false, user: user._id, source: 'account_settings' } }
      );
    } else {
      const strongSuppression = await MarketingSuppression.exists({ normalizedEmail, active: true, reason: { $in: ['hard_bounce', 'complaint'] } });
      if (!strongSuppression) {
        await MarketingSuppression.findOneAndUpdate(
          { normalizedEmail },
          { $set: { reason: 'unsubscribe', source: 'account_settings', user: user._id, active: true } },
          { upsert: true, new: true }
        );
      }
    }

    res.json({ success: true, marketingPreference: user.marketingPreference });
  } catch (error) {
    res.status(500).json({ message: 'Could not update email preference' });
  }
});

// Upload avatar
router.post('/me/avatar', authenticateToken, uploadAvatar.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Delete old avatar if exists
    if (user.avatarPublicId) {
      await deleteFromCloudinary(user.avatarPublicId);
    }

    // Update user with new avatar
    user.avatar = req.file.path;
    user.avatarPublicId = req.file.filename;
    await user.save();

    res.json({
      success: true,
      message: 'Avatar uploaded successfully',
      avatar: user.avatar,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete avatar
router.delete('/me/avatar', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.avatarPublicId) {
      await deleteFromCloudinary(user.avatarPublicId);
    }

    user.avatar = '';
    user.avatarPublicId = '';
    await user.save();

    res.json({
      success: true,
      message: 'Avatar deleted successfully',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add skill to teach
router.post('/me/skills/teaching', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Skill name is required' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if skill already exists
    const exists = user.skillsTeaching.some(
      skill => skill.name.toLowerCase() === name.toLowerCase()
    );
    if (exists) {
      return res.status(400).json({ message: 'Skill already exists' });
    }

    user.skillsTeaching.push({ name, sessions: 0, rating: 0 });
    await user.save();

    res.json({
      success: true,
      message: 'Skill added successfully',
      skillsTeaching: user.skillsTeaching,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Remove skill to teach
router.delete('/me/skills/teaching/:skillId', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const remaining = user.skillsTeaching.filter(
      skill => skill._id.toString() !== req.params.skillId
    );

    // Dropping the last teaching skill makes someone a non-teacher, and the
    // cash-out screen disappears with it - which would strand any credits they
    // earned. Make them withdraw first rather than silently locking the money.
    if (remaining.length === 0 && user.skillsTeaching.length > 0) {
      const wallet = await CreditWallet.findOne({ user: user._id }).select('earnedBalance');
      if (wallet?.earnedBalance > 0) {
        return res.status(400).json({
          message:
            `You still have ${wallet.earnedBalance} earned credits. Cash them out before ` +
            'removing your last teaching skill, otherwise you cannot withdraw them.',
          earnedBalance: wallet.earnedBalance,
        });
      }
    }

    user.skillsTeaching = remaining;
    await user.save();

    res.json({
      success: true,
      message: 'Skill removed successfully',
      skillsTeaching: user.skillsTeaching,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add skill to learn
router.post('/me/skills/learning', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Skill name is required' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if skill already exists (handle both object and legacy string formats)
    const exists = user.skillsLearning.some(skill => {
      const skillName = typeof skill === 'string' ? skill : skill.name;
      return skillName && skillName.toLowerCase() === name.toLowerCase();
    });
    if (exists) {
      return res.status(400).json({ message: 'Skill already exists' });
    }

    // sessions/progress always start at 0 - progress is auto-derived from
    // completed sessions in this skill, never user-settable.
    user.skillsLearning.push({ name });
    await user.save();

    res.json({
      success: true,
      message: 'Learning goal added successfully',
      skillsLearning: user.skillsLearning,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Remove skill to learn
router.delete('/me/skills/learning/:skillId', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const skillIdParam = req.params.skillId;

    // Handle both object format (with _id) and legacy string format
    user.skillsLearning = user.skillsLearning.filter(skill => {
      // If skill is an object with _id, compare _id
      if (skill._id) {
        return skill._id.toString() !== skillIdParam;
      }
      // If skill is a string (legacy format), compare the string directly
      return skill !== skillIdParam;
    });
    await user.save();

    res.json({
      success: true,
      message: 'Learning goal removed successfully',
      skillsLearning: user.skillsLearning,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add certification with file upload
// NOTE: multer/cloudinary errors happen *before* the async handler, so we wrap the upload
const uploadCertificationMiddleware = (req, res, next) => {
  uploadCertification.single('file')(req, res, (err) => {
    if (err) {
      console.error('Certification upload error:', err);
      // Multer errors (file size, invalid file, etc.)
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File size too large. Maximum size is 10MB.' });
      }
      return res.status(500).json({
        message: err.message || 'Certification file upload failed',
        error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      });
    }
    next();
  });
};

router.post('/me/certifications', authenticateToken, uploadCertificationMiddleware, async (req, res) => {
  try {
    const { name, issuer, year } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Certification name is required' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const certification = {
      name: name.trim(),
      issuer: issuer ? issuer.trim() : '',
      year: year || '',
      // CloudinaryStorage puts the URL in req.file.path
      fileUrl: req.file ? (req.file.path || '') : '',
      // Cloudinary public id comes back as req.file.filename from multer-storage-cloudinary
      filePublicId: req.file ? (req.file.filename || '') : '',
      // Preserve original name + mimetype for proper downloads and rendering
      fileName: req.file?.originalname || '',
      fileMimeType: req.file?.mimetype || '',
    };

    user.certifications.push(certification);
    await user.save();

    res.json({
      success: true,
      message: 'Certification added successfully',
      certifications: user.certifications,
    });
  } catch (error) {
    console.error('Error adding certification:', error);
    res.status(500).json({
      message: error.message || 'Failed to add certification',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// Download a certification file with correct filename/extension
router.get('/me/certifications/:certId/download', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const certification = user.certifications.find(
      (cert) => cert._id.toString() === req.params.certId
    );

    if (!certification || !certification.fileUrl) {
      return res.status(404).json({ message: 'Certification file not found' });
    }

    const upstream = await fetch(certification.fileUrl);
    if (!upstream.ok) {
      return res.status(502).json({ message: 'Failed to fetch file from storage provider' });
    }

    const contentType =
      upstream.headers.get('content-type') || certification.fileMimeType || 'application/octet-stream';

    // Prefer original filename, else derive from cert name
    let filename = certification.fileName?.trim() || `${certification.name || 'certificate'}`;

    // If filename looks like a Cloudinary public_id (common when original name wasn't stored), fall back to cert name
    const publicId = certification.filePublicId?.trim();
    if (publicId && filename === publicId) {
      filename = `${certification.name || 'certificate'}`;
    }
    // Add extension if missing (prefer stored mimetype, fallback to upstream Content-Type)
    const mimeForExt = certification.fileMimeType || contentType;
    if (!filename.includes('.') && mimeForExt) {
      const map = {
        'application/pdf': 'pdf',
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'application/msword': 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      };
      const ext = map[mimeForExt];
      if (ext) filename = `${filename}.${ext}`;
    }

    const disposition = req.query.disposition === 'inline' ? 'inline' : 'attachment';

    res.setHeader('Content-Type', contentType);
    // filename*= supports UTF-8; keep simple filename too for compatibility
    const safeName = filename.replace(/"/g, '');
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`
    );

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (error) {
    console.error('Error downloading certification:', error);
    res.status(500).json({ message: error.message || 'Failed to download certification' });
  }
});

// Remove certification
router.delete('/me/certifications/:certId', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const certification = user.certifications.find(
      cert => cert._id.toString() === req.params.certId
    );

    // Delete file from Cloudinary if exists
    if (certification && certification.filePublicId) {
      const resourceType = certification.fileUrl.includes('.pdf') ? 'raw' : 'image';
      await deleteFromCloudinary(certification.filePublicId, resourceType);
    }

    user.certifications = user.certifications.filter(
      cert => cert._id.toString() !== req.params.certId
    );
    await user.save();

    res.json({
      success: true,
      message: 'Certification removed successfully',
      certifications: user.certifications,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all users (admin only - you can add admin check middleware)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Download a certification file from another user's profile (public)
router.get('/:userId/certifications/:certId/download', authenticateToken, documentFetchLimiter, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const certification = user.certifications.find(
      (cert) => cert._id.toString() === req.params.certId
    );

    if (!certification || !certification.fileUrl) {
      return res.status(404).json({ message: 'Certification file not found' });
    }

    const upstream = await fetch(certification.fileUrl);
    if (!upstream.ok) {
      return res.status(502).json({ message: 'Failed to fetch file from storage provider' });
    }

    const contentType =
      upstream.headers.get('content-type') || certification.fileMimeType || 'application/octet-stream';

    let filename = certification.fileName?.trim() || `${certification.name || 'certificate'}`;

    const publicId = certification.filePublicId?.trim();
    if (publicId && filename === publicId) {
      filename = `${certification.name || 'certificate'}`;
    }

    const mimeForExt = certification.fileMimeType || contentType;
    if (!filename.includes('.') && mimeForExt) {
      const map = {
        'application/pdf': 'pdf',
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'application/msword': 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      };
      const ext = map[mimeForExt];
      if (ext) filename = `${filename}.${ext}`;
    }

    const disposition = req.query.disposition === 'inline' ? 'inline' : 'attachment';

    res.setHeader('Content-Type', contentType);
    const safeName = filename.replace(/"/g, '');
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`
    );

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (error) {
    console.error('Error downloading certification:', error);
    res.status(500).json({ message: error.message || 'Failed to download certification' });
  }
});

// Get user by ID (public profile)
router.get('/:userId', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        bio: user.bio,
        location: user.location,
        timezone: user.timezone,
        languages: user.languages,
        avatar: user.avatar,
        skillsTeaching: user.skillsTeaching,
        skillsLearning: user.skillsLearning,
        certifications: user.certifications,
        stats: user.stats,
        verificationStatus: user.verificationStatus,
        acceptsFreeTrialSessions: user.acceptsFreeTrialSessions,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Block another user - prevents messages in either direction between the two.
router.post('/:userId/block', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { userId: targetId } = req.params;

    if (targetId === userId) {
      return res.status(400).json({ message: "You can't block yourself" });
    }

    const target = await User.findById(targetId).select('_id');
    if (!target) return res.status(404).json({ message: 'User not found' });

    await User.updateOne({ _id: userId }, { $addToSet: { blockedUsers: targetId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Unblock a previously blocked user
router.post('/:userId/unblock', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { userId: targetId } = req.params;

    await User.updateOne({ _id: userId }, { $pull: { blockedUsers: targetId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Report another user (e.g. from a chat's "..." menu)
router.post('/:userId/report', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { userId: targetId } = req.params;
    const { reason, conversationId } = req.body;

    if (targetId === userId) {
      return res.status(400).json({ message: "You can't report yourself" });
    }
    if (!reason?.trim()) {
      return res.status(400).json({ message: 'reason is required' });
    }

    const target = await User.findById(targetId).select('_id');
    if (!target) return res.status(404).json({ message: 'User not found' });

    const report = await Report.create({
      reporter: userId,
      reportedUser: targetId,
      reason: reason.trim(),
      conversation: conversationId || null,
    });

    res.status(201).json({ success: true, reportId: report._id.toString() });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;

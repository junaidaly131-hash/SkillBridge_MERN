import User from '../models/User.js';
import { notifyAdmins, emitToAdmins } from '../utils/notify.js';
import { isValidDocType, DEFAULT_VERIFICATION_DOC_TYPE } from '../config/verificationDocTypes.js';
import { describeMissingDocs, isTeachingAccount } from '../config/verificationPolicy.js';
import { toReviewableDocs } from '../utils/verificationDocs.js';

export const submitVerification = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Students verify too - they just need less. Requiring a teaching skill
    // here used to lock them out of verification entirely, which in turn locked
    // them out of booking past the free trial.
    if (user.verificationStatus === 'pending') {
      return res.status(409).json({
        message: "Your documents are already under review. We'll email you once that's done.",
      });
    }

    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ message: 'At least one document is required.' });
    }

    // docTypes arrives parallel to the files (same order). Multipart text
    // fields come through as a string when there's only one, so it's
    // normalised to an array before pairing. Anything unrecognised falls back
    // rather than rejecting the whole upload.
    const rawTypes = req.body.docTypes;
    const docTypes = Array.isArray(rawTypes) ? rawTypes : rawTypes ? [rawTypes] : [];

    // `file.path` (Cloudinary's secure_url) is deliberately NOT stored. For a
    // private asset that URL carries a signature with no expiry, so keeping it
    // would leave a permanently working link to a CNIC sitting in the database.
    // The public id is enough to sign a fresh, short-lived URL on demand - see
    // signedVerificationDocUrl.
    const docs = files.map((file, i) => ({
      publicId: file.filename,
      resourceType: file.mimetype === 'application/pdf' ? 'raw' : 'image',
      docType: isValidDocType(docTypes[i]) ? docTypes[i] : DEFAULT_VERIFICATION_DOC_TYPE,
      fileName: file.originalname || '',
    }));

    // Rejected here rather than at review time: a reviewer's day shouldn't be
    // spent telling people they forgot their ID.
    const missing = describeMissingDocs(user, docs.map((d) => d.docType));
    if (missing) {
      return res.status(400).json({ message: missing });
    }

    user.verificationDocs = docs;
    user.verificationStatus = 'pending';
    user.verificationSubmittedAt = new Date();
    user.verificationRejectionReason = undefined;
    await user.save();

    // Tell the admins: a bell notification each, plus a live event so an open
    // Verifications screen gains the row without a refresh.
    await notifyAdmins({
      type: 'verification_submitted',
      title: 'New verification request',
      body: `${user.name} submitted ${docs.length} document${docs.length === 1 ? '' : 's'} for ${isTeachingAccount(user) ? 'teacher' : 'student'} verification.`,
      link: '/admin/verifications',
    });

    emitToAdmins('verificationSubmitted', {
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        skillsTeaching: user.skillsTeaching,
        verificationDocs: toReviewableDocs(user),
        verificationSubmittedAt: user.verificationSubmittedAt,
        verificationStatus: user.verificationStatus,
      },
    });

    res.json({
      success: true,
      verificationStatus: user.verificationStatus,
      // The uploader gets back what they submitted, minus any way to address
      // the stored file. They have the originals; what they need from us is
      // confirmation of which document types landed.
      verificationDocs: user.verificationDocs.map((d) => ({
        docType: d.docType,
        fileName: d.fileName,
      })),
      verificationSubmittedAt: user.verificationSubmittedAt,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

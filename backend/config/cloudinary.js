import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Ensure env vars are loaded even if this module is imported before server.js calls dotenv.config()
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Storage for avatar images
const avatarStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'skillbridge/avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 300, height: 300, crop: 'fill' }],
  },
});

// Storage for certification files (supports various formats)
const certificationStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const isPdf = file.mimetype === 'application/pdf';
    const original = (file.originalname || 'certificate').replace(/\.[^/.]+$/, '');
    const safeBase = original
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
    return {
      folder: 'skillbridge/certifications',
      resource_type: isPdf ? 'raw' : 'auto',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx'],
      // Avoid random public ids like "za9r6oiooxcqipl53ggm"
      // Keep it unique with a timestamp but readable.
      public_id: `${Date.now()}-${safeBase || 'certificate'}`,
    };
  },
});

// Storage for identity/credential verification documents.
//
// type: 'private' is the important line. Cloudinary's default is 'upload',
// which serves an asset to anyone holding the URL - no credentials, no expiry.
// These are CNICs and degree certificates, and the public_id was
// "<timestamp>-<userId>" where the user id is already on show in /teachers/:id,
// so the only thing standing between a stranger and someone's national ID was
// guessing a millisecond. Private assets 404 on an unsigned URL (verified
// against this account for both resource types), and admins view them through
// GET /api/admin/verifications/:userId/docs/:index, which signs a short-lived
// URL per request.
//
// resource_type is pinned rather than left as 'auto': the delivery URL has to
// be rebuilt later to sign it, and 'auto' means not knowing whether Cloudinary
// filed the asset under /image/ or /raw/.
const verificationStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const isPdf = file.mimetype === 'application/pdf';
    return {
      folder: 'skillbridge/verifications',
      resource_type: isPdf ? 'raw' : 'image',
      type: 'private',
      ...(isPdf ? {} : { allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }),
      public_id: `${Date.now()}-${req.user?.userId || 'doc'}`,
    };
  },
});

/**
 * A signed, short-lived URL for one private verification document.
 *
 * Ten minutes is plenty for a reviewer to open a file and nowhere near long
 * enough for the link to be worth passing on. Note this is deliberately NOT
 * the `secure_url` Cloudinary returns at upload time: that one is signed too,
 * but with no expiry at all, so it would work forever once it leaked.
 */
export const signedVerificationDocUrl = (publicId, resourceType = 'image') =>
  cloudinary.utils.private_download_url(publicId, '', {
    resource_type: resourceType === 'raw' ? 'raw' : 'image',
    expires_at: Math.floor(Date.now() / 1000) + 10 * 60,
  });

// Cloudinary's `allowed_formats` validation is unreliable for resource_type
// 'raw' (it rejects legitimate files like .txt with "unknown file format"),
// so non-image files are validated ourselves via multer's fileFilter below
// instead, and no allowed_formats is passed for the raw case.
const CHAT_ATTACHMENT_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'zip'];

// Storage for chat attachments (images, documents, etc.)
const chatAttachmentStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const isImage = file.mimetype.startsWith('image/');
    const original = (file.originalname || 'file').replace(/\.[^/.]+$/, '');
    const safeBase = original
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
    return {
      folder: 'skillbridge/chat-attachments',
      resource_type: isImage ? 'image' : 'raw',
      ...(isImage ? { allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'] } : {}),
      public_id: `${Date.now()}-${safeBase || 'file'}`,
    };
  },
});

// Multer upload instances
export const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

export const uploadCertification = multer({
  storage: certificationStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

export const uploadVerificationDoc = multer({
  storage: verificationStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

export const uploadChatAttachment = multer({
  storage: chatAttachmentStorage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
  fileFilter: (req, file, cb) => {
    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    if (!CHAT_ATTACHMENT_EXTENSIONS.includes(ext)) {
      return cb(new Error(`File type .${ext} is not allowed`));
    }
    cb(null, true);
  },
});

// Helper function to delete file from Cloudinary
export const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    return result;
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    throw error;
  }
};

export default cloudinary;

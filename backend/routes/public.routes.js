import express from 'express';
import User from '../models/User.js';

// Everything served here is readable by anyone on the internet, with no token.
// That makes it the one router where the shape of a response is a security
// boundary rather than a convenience, so fields are listed explicitly and the
// Mongoose document is never passed through.
//
// Its reason to exist is search: a marketplace whose inventory sits behind a
// login has nothing for Google to rank, and nothing for a visitor to judge
// before signing up.
const router = express.Router();

const MAX_PAGE_SIZE = 24;

// Who may appear publicly at all. Unverified accounts are excluded because the
// badge is the whole promise being made to a visitor, and suspended ones
// because their profile should stop being an advertisement the moment they are
// suspended.
const PUBLICLY_LISTABLE = {
  verificationStatus: 'verified',
  isSuspended: { $ne: true },
  'skillsTeaching.0': { $exists: true },
};

// Fields safe to publish. Deliberately absent: email, skillsLearning, timezone,
// certification FILES (a degree scan is not public even when the certificate's
// name is), verification documents, wallet figures, and anything about
// sessions with named counterparties.
const PUBLIC_FIELDS = 'name avatar bio location languages skillsTeaching certifications stats createdAt';

function toPublicTeacher(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    avatar: user.avatar || null,
    bio: user.bio || '',
    location: user.location || '',
    languages: user.languages || [],
    skills: (user.skillsTeaching || []).map((s) => ({
      name: s.name,
      sessions: s.sessions || 0,
      rating: s.rating || 0,
    })),
    // Names only. fileUrl/filePublicId stay server-side; a visitor has no
    // business downloading someone's scanned certificate.
    certifications: (user.certifications || []).map((c) => ({
      name: c.name,
      issuer: c.issuer || '',
      year: c.year || '',
    })),
    stats: {
      sessionsTaught: user.stats?.sessionsTaught || 0,
      avgRating: user.stats?.avgRating || 0,
    },
    memberSince: user.createdAt,
    verified: true, // implied by PUBLICLY_LISTABLE, stated so the UI need not infer it
  };
}

// GET /api/public/teachers - the directory. Also the page that gives every
// profile an internal link, without which Google would never find them.
router.get('/teachers', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.limit) || MAX_PAGE_SIZE));

    const filter = { ...PUBLICLY_LISTABLE };

    // Optional skill filter, escaped so a crafted query can't become a regex.
    const skill = req.query.skill?.trim();
    if (skill) {
      filter['skillsTeaching.name'] = new RegExp(skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select(PUBLIC_FIELDS)
        .sort({ 'stats.avgRating': -1, 'stats.sessionsTaught': -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    res.json({
      teachers: users.map(toPublicTeacher),
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      total,
    });
  } catch (error) {
    console.error('Public teacher directory failed:', error.message);
    res.status(500).json({ message: 'Could not load teachers right now.' });
  }
});

// GET /api/public/teachers/:id - one profile.
router.get('/teachers/:id', async (req, res) => {
  try {
    // The id is matched together with the visibility filter, so an unverified
    // or suspended teacher is a 404 rather than a 403 - there is no reason to
    // confirm to an anonymous caller that a given account exists.
    const user = await User.findOne({ _id: req.params.id, ...PUBLICLY_LISTABLE }).select(PUBLIC_FIELDS);

    if (!user) {
      return res.status(404).json({ message: 'Teacher not found.' });
    }

    res.json({ teacher: toPublicTeacher(user) });
  } catch (error) {
    // A malformed ObjectId throws here; it is a 404 to the caller, not a 500.
    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Teacher not found.' });
    }
    console.error('Public teacher profile failed:', error.message);
    res.status(500).json({ message: 'Could not load this profile right now.' });
  }
});

export default router;

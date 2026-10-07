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

// "Graphic Design" -> "graphic-design". Used both ways: to build the URL of a
// skill page and to find the skill again from one.
export const toSkillSlug = (name) =>
  String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * Distinct skills that at least one publicly visible teacher actually teaches.
 *
 * Driven by real teachers rather than a hand-kept list, because a skill page
 * with nobody on it is worse than no page: Google files those under "crawled,
 * currently not indexed" and they drag on the rest of the site. So the set of
 * skill pages grows as teachers get verified, with no code change.
 *
 * Skills are grouped case-insensitively - "Python" and "python" are one skill -
 * and the most common spelling wins as the display name.
 */
async function listPublicSkills() {
  const rows = await User.aggregate([
    { $match: PUBLICLY_LISTABLE },
    { $unwind: '$skillsTeaching' },
    {
      $group: {
        _id: { $toLower: '$skillsTeaching.name' },
        names: { $push: '$skillsTeaching.name' },
        teacherCount: { $sum: 1 },
      },
    },
    { $sort: { teacherCount: -1, _id: 1 } },
  ]);

  return rows.map((r) => {
    const tally = new Map();
    for (const n of r.names) tally.set(n, (tally.get(n) || 0) + 1);
    const name = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return { slug: toSkillSlug(name), name, teacherCount: r.teacherCount };
  });
}

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

// GET /api/public/skills - every skill that has someone to teach it.
// Also what the sitemap is built from, so it never lists an empty page.
router.get('/skills', async (req, res) => {
  try {
    res.json({ skills: await listPublicSkills() });
  } catch (error) {
    console.error('Public skill list failed:', error.message);
    res.status(500).json({ message: 'Could not load skills right now.' });
  }
});

// GET /api/public/skills/:slug - one skill page's worth of data.
router.get('/skills/:slug', async (req, res) => {
  try {
    const slug = toSkillSlug(req.params.slug);
    const skill = (await listPublicSkills()).find((s) => s.slug === slug);

    // A skill nobody teaches has no page. 404 rather than an empty shell, so
    // Google is never offered a page with nothing on it.
    if (!skill) {
      return res.status(404).json({ message: 'No teachers for this skill yet.' });
    }

    // Matched on the exact name, anchored and escaped, so "React" cannot also
    // pull in "React Native".
    const escaped = skill.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const teachers = await User.find({
      ...PUBLICLY_LISTABLE,
      'skillsTeaching.name': new RegExp(`^${escaped}$`, 'i'),
    })
      .select(PUBLIC_FIELDS)
      .sort({ 'stats.avgRating': -1, 'stats.sessionsTaught': -1 })
      .limit(MAX_PAGE_SIZE);

    res.json({ skill, teachers: teachers.map(toPublicTeacher) });
  } catch (error) {
    console.error('Public skill page failed:', error.message);
    res.status(500).json({ message: 'Could not load this skill right now.' });
  }
});

export default router;

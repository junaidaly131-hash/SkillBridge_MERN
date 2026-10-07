import express from 'express';
import User from '../models/User.js';
import { canonicalSkillName, toSkillSlug, SKILL_ALIASES } from '../config/skillVocabulary.js';

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

/**
 * Distinct skills that at least one publicly visible teacher actually teaches.
 *
 * Driven by real teachers rather than a hand-kept list, because a skill page
 * with nobody on it is worse than no page: Google files those under "crawled,
 * currently not indexed" and they drag on the rest of the site. So the set of
 * skill pages grows as teachers get verified, with no code change.
 *
 * Variants are folded together first - see config/skillVocabulary.js - so
 * "React", "reactjs" and "React Development" become one page with all three
 * teachers on it rather than three thin pages splitting them.
 *
 * Counted per teacher, not per row: someone listing both "React" and "React
 * Development" is one React teacher, not two.
 */
async function listPublicSkills() {
  const users = await User.find(PUBLICLY_LISTABLE).select('_id skillsTeaching');

  const bySkill = new Map();
  for (const user of users) {
    const seen = new Set();
    for (const s of user.skillsTeaching || []) {
      const name = canonicalSkillName(s.name);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      bySkill.set(name, (bySkill.get(name) || 0) + 1);
    }
  }

  return [...bySkill.entries()]
    .map(([name, teacherCount]) => ({ slug: toSkillSlug(name), name, teacherCount }))
    .sort((a, b) => b.teacherCount - a.teacherCount || a.name.localeCompare(b.name));
}

/** Every raw spelling that folds into one canonical skill, for querying. */
function spellingsOf(canonicalName) {
  const out = new Set([canonicalName]);
  for (const [alias, target] of Object.entries(SKILL_ALIASES)) {
    if (target === canonicalName) out.add(alias);
  }
  return [...out];
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
    const requested = toSkillSlug(req.params.slug);
    const all = await listPublicSkills();

    let skill = all.find((s) => s.slug === requested);

    // An alias slug still has to land somewhere: /learn/react should reach the
    // React Development page rather than 404, both for anyone following an old
    // link and so there is one page per skill instead of several URLs serving
    // it. The caller is told the canonical slug and redirects to it.
    if (!skill) {
      const canonical = canonicalSkillName(String(req.params.slug).replace(/-+/g, ' '));
      const canonicalSlug = canonical ? toSkillSlug(canonical) : null;
      skill = all.find((s) => s.slug === canonicalSlug);
    }

    // A skill nobody teaches has no page. 404 rather than an empty shell, so
    // Google is never offered a page with nothing on it.
    if (!skill) {
      return res.status(404).json({ message: 'No teachers for this skill yet.' });
    }

    // Every spelling that folds into this skill, each anchored and escaped, so
    // the page gathers the "React" and "reactjs" teachers too - while "React
    // Native" stays its own skill, because matching is exact and never a
    // substring.
    const patterns = spellingsOf(skill.name).map(
      (s) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    );
    const teachers = await User.find({
      ...PUBLICLY_LISTABLE,
      'skillsTeaching.name': { $in: patterns },
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

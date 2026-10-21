export const USER_PROFILE_FILTERS = ['all', 'student', 'teacher', 'both', 'unassigned'];
export const USER_STATUS_FILTERS = ['all', 'active', 'blocked'];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function buildManagedUserFilter({ search = '', profile = 'all', status = 'all' } = {}) {
  const conditions = [{ role: { $ne: 'admin' } }];
  const trimmedSearch = search.trim();

  if (trimmedSearch) {
    const safeSearch = escapeRegex(trimmedSearch);
    conditions.push({
      $or: [
        { name: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } },
      ],
    });
  }

  if (profile === 'student') conditions.push({ 'skillsLearning.0': { $exists: true } });
  if (profile === 'teacher') conditions.push({ 'skillsTeaching.0': { $exists: true } });
  if (profile === 'both') {
    conditions.push(
      { 'skillsLearning.0': { $exists: true } },
      { 'skillsTeaching.0': { $exists: true } },
    );
  }
  if (profile === 'unassigned') {
    conditions.push(
      { 'skillsLearning.0': { $exists: false } },
      { 'skillsTeaching.0': { $exists: false } },
    );
  }

  if (status === 'active') conditions.push({ isSuspended: { $ne: true } });
  if (status === 'blocked') conditions.push({ isSuspended: true });

  return conditions.length === 1 ? conditions[0] : { $and: conditions };
}

export const USER_MANAGEMENT_STATS_PIPELINE = [
  { $match: { role: { $ne: 'admin' } } },
  {
    $group: {
      _id: null,
      totalUsers: { $sum: 1 },
      students: {
        $sum: {
          $cond: [{ $gt: [{ $size: { $ifNull: ['$skillsLearning', []] } }, 0] }, 1, 0],
        },
      },
      teachers: {
        $sum: {
          $cond: [{ $gt: [{ $size: { $ifNull: ['$skillsTeaching', []] } }, 0] }, 1, 0],
        },
      },
    },
  },
];

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildManagedUserFilter,
  USER_MANAGEMENT_STATS_PIPELINE,
} from '../utils/adminUserManagement.js';

test('managed user filter always excludes admins', () => {
  assert.deepEqual(buildManagedUserFilter(), { role: { $ne: 'admin' } });
});

test('student and teacher filters use the matching profile arrays', () => {
  assert.deepEqual(buildManagedUserFilter({ profile: 'student' }), {
    $and: [
      { role: { $ne: 'admin' } },
      { 'skillsLearning.0': { $exists: true } },
    ],
  });

  assert.deepEqual(buildManagedUserFilter({ profile: 'teacher' }), {
    $and: [
      { role: { $ne: 'admin' } },
      { 'skillsTeaching.0': { $exists: true } },
    ],
  });
});

test('both filter requires learning and teaching skills', () => {
  assert.deepEqual(buildManagedUserFilter({ profile: 'both' }), {
    $and: [
      { role: { $ne: 'admin' } },
      { 'skillsLearning.0': { $exists: true } },
      { 'skillsTeaching.0': { $exists: true } },
    ],
  });
});

test('status filter distinguishes active and blocked users', () => {
  assert.deepEqual(buildManagedUserFilter({ status: 'active' }).$and.at(-1), {
    isSuspended: { $ne: true },
  });
  assert.deepEqual(buildManagedUserFilter({ status: 'blocked' }).$and.at(-1), {
    isSuspended: true,
  });
});

test('search input is escaped before it is used as a regular expression', () => {
  const filter = buildManagedUserFilter({ search: 'user+test@example.com' });
  const searchCondition = filter.$and[1].$or[0].name;

  assert.equal(searchCondition.$regex, 'user\\+test@example\\.com');
  assert.equal(searchCondition.$options, 'i');
});

test('management stats count non-admin students and teachers independently', () => {
  assert.deepEqual(USER_MANAGEMENT_STATS_PIPELINE[0], { $match: { role: { $ne: 'admin' } } });
  assert.ok(USER_MANAGEMENT_STATS_PIPELINE[1].$group.students);
  assert.ok(USER_MANAGEMENT_STATS_PIPELINE[1].$group.teachers);
});

export const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

export function looksLikeEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function evaluateCampaignEligibility(user, suppressedEmails = new Set(), { allowLegacyAudience = false } = {}) {
  const normalizedEmail = normalizeEmail(user?.email);
  const preference = user?.marketingPreference?.status;
  let reason = null;
  if (!user) reason = 'missing_user';
  else if (user.role === 'admin') reason = 'admin_account';
  else if (user.isSuspended) reason = 'suspended';
  else if (!looksLikeEmail(normalizedEmail)) reason = 'invalid_email';
  else if (preference === 'opted_out') reason = 'opted_out';
  else if (suppressedEmails.has(normalizedEmail)) reason = 'suppressed';
  else if (!allowLegacyAudience && !user.emailVerifiedAt) reason = 'email_unverified';
  else if (!allowLegacyAudience && preference !== 'opted_in') reason = 'consent_unknown';

  return {
    userId: user?._id,
    normalizedEmail,
    recipientName: user?.name || '',
    isStudent: Boolean(user?.skillsLearning?.length),
    isTeacher: Boolean(user?.skillsTeaching?.length),
    eligible: !reason,
    skipReason: reason,
  };
}

export function dedupeAudience(rows) {
  const userIds = new Set();
  const emails = new Set();
  const unique = [];
  for (const row of rows) {
    const id = String(row.userId || '');
    const email = normalizeEmail(row.normalizedEmail);
    if (!id || !email || userIds.has(id) || emails.has(email)) continue;
    userIds.add(id);
    emails.add(email);
    unique.push({ ...row, normalizedEmail: email });
  }
  return unique;
}


export const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

export function looksLikeEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function evaluateCampaignEligibility(user, suppressedEmails = new Set()) {
  const normalizedEmail = normalizeEmail(user?.email);
  let reason = null;
  if (!user) reason = 'missing_user';
  else if (user.role === 'admin') reason = 'admin_account';
  else if (user.isSuspended) reason = 'suspended';
  else if (!looksLikeEmail(normalizedEmail)) reason = 'invalid_email';
  else if (!user.emailVerifiedAt) reason = 'email_unverified';
  else if (user.marketingPreference?.status === 'unknown' || !user.marketingPreference?.status) reason = 'consent_unknown';
  else if (user.marketingPreference?.status !== 'opted_in') reason = 'opted_out';
  else if (suppressedEmails.has(normalizedEmail)) reason = 'suppressed';

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


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
  else if (!allowLegacyAudience && preference !== 'opted_in') reason = 'consent_unknown';

  return {
    userId: user?._id,
    normalizedEmail,
    recipientName: user?.name || '',
    isStudent: Boolean(user?.skillsLearning?.length),
    isTeacher: Boolean(user?.skillsTeaching?.length),
    eligible: !reason,
    skipReason: reason,
    sourceKind: 'user',
  };
}

export function evaluateExternalContactEligibility(contact, suppressedEmails = new Set(), restrictedUserEmails = new Set()) {
  const normalizedEmail = normalizeEmail(contact?.normalizedEmail || contact?.email);
  let reason = null;
  if (!contact) reason = 'missing_external_contact';
  else if (!looksLikeEmail(normalizedEmail)) reason = 'invalid_email';
  else if (contact.permission?.status === 'unsubscribed') reason = 'unsubscribed';
  else if (suppressedEmails.has(normalizedEmail)) reason = 'suppressed';
  else if (restrictedUserEmails.has(normalizedEmail)) reason = 'registered_user_opted_out';
  else if (contact.permission?.status !== 'documented') reason = 'permission_unknown';

  return {
    externalContactId: contact?._id,
    normalizedEmail,
    recipientName: contact?.name || '',
    isStudent: ['student', 'both'].includes(contact?.contactType),
    isTeacher: ['teacher', 'both'].includes(contact?.contactType),
    eligible: !reason,
    skipReason: reason,
    sourceKind: 'external',
  };
}

const RESTRICTION_REASONS = new Set(['opted_out', 'suppressed', 'unsubscribed', 'registered_user_opted_out']);

export function mergeAudienceByEmail(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const email = normalizeEmail(row.normalizedEmail);
    if (!email) continue;
    if (!grouped.has(email)) grouped.set(email, []);
    grouped.get(email).push({ ...row, normalizedEmail: email });
  }
  const merged = [];
  for (const [normalizedEmail, matches] of grouped) {
    const restriction = matches.find((row) => RESTRICTION_REASONS.has(row.skipReason));
    const eligible = matches.find((row) => row.eligible);
    const primary = eligible || matches[0];
    merged.push({
      ...primary,
      normalizedEmail,
      eligible: Boolean(eligible) && !restriction,
      skipReason: restriction?.skipReason || (eligible ? null : primary.skipReason),
      provenance: matches.map((row) => ({
        kind: row.sourceKind || (row.userId ? 'user' : 'external'),
        userId: row.userId || null,
        externalContactId: row.externalContactId || null,
      })),
    });
  }
  return merged;
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


const LIMITS = {
  subject: 150,
  preheader: 180,
  heading: 120,
  message: 4000,
  ctaLabel: 60,
  ctaUrl: 500,
  closing: 500,
};

export const AI_TUTOR_CAMPAIGN_TEMPLATE = Object.freeze({
  subject: 'Meet your new SkillBridge AI Tutor',
  preheader: 'Learn, practise, and prepare with personalised AI support.',
  heading: 'Learn with the SkillBridge AI Tutor',
  message: 'Hi {{firstName}},\n\nYour new AI Tutor can explain concepts, create practice quizzes, summarise private documents, and help you prepare lesson plans.',
  ctaLabel: 'Try AI Tutor',
  ctaUrl: 'https://www.skill-bridge.me/ai-tutor',
  closing: 'Keep learning,\nThe SkillBridge team',
});

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function interpolate(value, firstName) {
  return String(value).replaceAll('{{firstName}}', firstName || 'there');
}

export function validateCampaignContent(content, { allowedOrigins } = {}) {
  const errors = [];
  const clean = {};
  for (const [field, max] of Object.entries(LIMITS)) {
    const value = String(content?.[field] ?? '').trim();
    if (!value) errors.push(`${field} is required`);
    if (value.length > max) errors.push(`${field} must be ${max} characters or fewer`);
    clean[field] = value;
  }
  if (/\r|\n/.test(clean.subject) || /\r|\n/.test(clean.preheader)) {
    errors.push('Subject and preheader cannot contain line breaks');
  }
  const tokens = Object.values(clean).flatMap((value) => value.match(/{{[^}]+}}/g) || []);
  if (tokens.some((token) => token !== '{{firstName}}')) errors.push('Only {{firstName}} is supported');

  try {
    const url = new URL(clean.ctaUrl);
    const configured = String(process.env.MARKETING_ALLOWED_CTA_ORIGINS || '')
      .split(',').map((value) => value.trim()).filter(Boolean);
    const origins = allowedOrigins || [
      'https://skill-bridge.me',
      'https://www.skill-bridge.me',
      ...configured,
    ];
    if (url.protocol !== 'https:' || !origins.includes(url.origin)) {
      errors.push('CTA must use HTTPS on an approved SkillBridge origin');
    }
  } catch {
    errors.push('CTA URL is invalid');
  }
  return { valid: errors.length === 0, errors, content: clean };
}

function lineBreaks(value) {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

export function renderCampaignEmail({ content, recipientName, unsubscribeUrl, preview = false }) {
  const firstName = String(recipientName || '').trim().split(/\s+/)[0] || 'there';
  const fields = Object.fromEntries(
    Object.entries(content).map(([key, value]) => [key, interpolate(value, firstName)])
  );
  const safeUnsubscribe = escapeHtml(unsubscribeUrl || '#');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(fields.subject)}</title></head><body style="margin:0;background:#f6f8fa;font-family:Arial,sans-serif;color:#152447"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(fields.preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8fa;padding:24px 12px"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden"><tr><td style="padding:24px 32px;border-top:5px solid #249f91"><div style="font-size:21px;font-weight:800;letter-spacing:.3px">SKILLBRIDGE</div></td></tr><tr><td style="padding:16px 32px 32px"><h1 style="font-size:28px;line-height:1.25;margin:0 0 18px">${escapeHtml(fields.heading)}</h1><div style="font-size:16px;line-height:1.7;color:#374151">${lineBreaks(fields.message)}</div><p style="margin:28px 0"><a href="${escapeHtml(fields.ctaUrl)}" style="display:inline-block;background:#1d2c50;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">${escapeHtml(fields.ctaLabel)}</a></p><div style="font-size:15px;line-height:1.6;color:#374151">${lineBreaks(fields.closing)}</div></td></tr><tr><td style="padding:20px 32px;background:#f3f7f7;color:#6b7280;font-size:12px;line-height:1.6">You received this because you opted in to SkillBridge product updates.<br>SkillBridge · <a href="mailto:support@skill-bridge.me" style="color:#168f83">support@skill-bridge.me</a>${preview ? '' : `<br><a href="${safeUnsubscribe}" style="color:#168f83">Unsubscribe from marketing emails</a>`}</td></tr></table></td></tr></table></body></html>`;
  const text = `${fields.preheader}\n\n${fields.heading}\n\n${fields.message}\n\n${fields.ctaLabel}: ${fields.ctaUrl}\n\n${fields.closing}\n\nSkillBridge | support@skill-bridge.me${preview ? '' : `\nUnsubscribe: ${unsubscribeUrl}`}`;
  return { subject: fields.subject, html, text };
}


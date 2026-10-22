const LIMITS = {
  subject: 150, preheader: 180, heading: 120, message: 4000,
  ctaLabel: 60, ctaUrl: 500, closing: 500,
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

export const INTRODUCE_SKILLBRIDGE_TEMPLATE = Object.freeze({
  subject: 'Learn a skill. Share what you know.',
  preheader: 'Meet SkillBridge: skill exchange, online sessions, and AI study tools.',
  heading: 'A new way to learn and share your skills',
  message: "Hi {{firstName}},\n\nI'm Junaid, the developer behind SkillBridge, a platform where people can learn skills from others and share what they know.\n\nYou can explore teachers, connect through chat, and arrange online learning sessions.\n\nWe've also added AI Tutor. It lets you ask learning questions, work with your PDF or TXT notes, and create summaries, practice quizzes, and flashcards.\n\nIf you're learning something new or interested in teaching a skill, I'd love for you to explore it.",
  ctaLabel: 'Explore SkillBridge',
  ctaUrl: 'https://www.skill-bridge.me/',
  closing: 'Junaid\nSkillBridge',
});

export function escapeHtml(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
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
  if (/\r|\n/.test(clean.subject) || /\r|\n/.test(clean.preheader)) errors.push('Subject and preheader cannot contain line breaks');
  const tokens = Object.values(clean).flatMap((value) => value.match(/{{[^}]+}}/g) || []);
  if (tokens.some((token) => token !== '{{firstName}}')) errors.push('Only {{firstName}} is supported');
  try {
    const url = new URL(clean.ctaUrl);
    const configured = String(process.env.MARKETING_ALLOWED_CTA_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
    const origins = allowedOrigins || ['https://skill-bridge.me', 'https://www.skill-bridge.me', ...configured];
    if (url.protocol !== 'https:' || !origins.includes(url.origin)) errors.push('CTA must use HTTPS on an approved SkillBridge origin');
  } catch { errors.push('CTA URL is invalid'); }
  return { valid: errors.length === 0, errors, content: clean };
}

function lineBreaks(value) {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

function publicSiteAsset(pathname, ctaUrl) {
  const candidates = [process.env.FRONTEND_URL, ctaUrl, 'https://www.skill-bridge.me'];
  for (const candidate of candidates) {
    try {
      const url = new URL(String(candidate || '').trim());
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
      return new URL(pathname, `${url.origin}/`).toString();
    } catch {
      // Try the next trusted public-site candidate.
    }
  }
  return `https://www.skill-bridge.me${pathname}`;
}

export function renderCampaignEmail({ content, recipientName, unsubscribeUrl, preview = false }) {
  const firstName = String(recipientName || '').trim().split(/\s+/)[0] || 'there';
  const fields = Object.fromEntries(Object.entries(content).map(([key, value]) => [key, interpolate(value, firstName)]));
  const safeUnsubscribe = escapeHtml(unsubscribeUrl || '#');
  const homeUrl = publicSiteAsset('/', fields.ctaUrl);
  const logoUrl = publicSiteAsset('/assets/logo.png', fields.ctaUrl);
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(fields.subject)}</title>
  <style>
    @media only screen and (max-width:620px) {
      .email-shell { width:100% !important; }
      .mobile-pad { padding-left:22px !important; padding-right:22px !important; }
      .hero-title { font-size:30px !important; line-height:1.2 !important; }
      .feature-cell { display:block !important; width:100% !important; padding:0 0 10px !important; }
      .cta-link { display:block !important; text-align:center !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f3f6f8;font-family:Arial,Helvetica,sans-serif;color:#17213d;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(fields.preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f3f6f8" style="width:100%;background:#f3f6f8;">
    <tr>
      <td align="center" style="padding:34px 14px;">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" class="email-shell" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e3e9ee;border-radius:18px;overflow:hidden;box-shadow:0 8px 24px rgba(23,33,61,.08);">
          <tr>
            <td class="mobile-pad" style="padding:24px 38px;background:#ffffff;border-bottom:1px solid #e8edef;">
              <a href="${escapeHtml(homeUrl)}" style="display:inline-block;text-decoration:none;">
                <img src="${escapeHtml(logoUrl)}" width="190" alt="SkillBridge" style="display:block;width:190px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">
              </a>
            </td>
          </tr>
          <tr>
            <td class="mobile-pad" bgcolor="#17213d" style="padding:42px 38px 40px;background:#17213d;">
              <div style="display:inline-block;margin:0 0 18px;padding:7px 12px;border-radius:999px;background:#263453;color:#78ddd2;font-size:11px;line-height:1;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Learn &nbsp;&bull;&nbsp; Teach &nbsp;&bull;&nbsp; Grow</div>
              <h1 class="hero-title" style="margin:0;color:#ffffff;font-size:36px;line-height:1.18;font-weight:800;letter-spacing:-.7px;">${escapeHtml(fields.heading)}</h1>
              <p style="margin:18px 0 0;color:#cbd5e1;font-size:16px;line-height:1.65;">${escapeHtml(fields.preheader)}</p>
            </td>
          </tr>
          <tr>
            <td class="mobile-pad" style="padding:38px 38px 18px;background:#ffffff;">
              <div style="font-size:16px;line-height:1.75;color:#344054;">${lineBreaks(fields.message)}</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:30px 0 26px;">
                <tr>
                  <td class="feature-cell" width="33.33%" valign="top" style="width:33.33%;padding:0 6px 0 0;"><div style="min-height:112px;padding:17px 15px;border:1px solid #dcebea;border-radius:12px;background:#f2faf8;"><div style="font-size:20px;line-height:1;">&#128218;</div><div style="margin-top:11px;color:#17213d;font-size:14px;font-weight:700;">Learn</div><div style="margin-top:5px;color:#667085;font-size:12px;line-height:1.5;">Discover skills and learn with real people.</div></div></td>
                  <td class="feature-cell" width="33.33%" valign="top" style="width:33.33%;padding:0 3px;"><div style="min-height:112px;padding:17px 15px;border:1px solid #e6e8f0;border-radius:12px;background:#f7f8fc;"><div style="font-size:20px;line-height:1;">&#127891;</div><div style="margin-top:11px;color:#17213d;font-size:14px;font-weight:700;">Teach</div><div style="margin-top:5px;color:#667085;font-size:12px;line-height:1.5;">Share what you know and help others grow.</div></div></td>
                  <td class="feature-cell" width="33.33%" valign="top" style="width:33.33%;padding:0 0 0 6px;"><div style="min-height:112px;padding:17px 15px;border:1px solid #dcebea;border-radius:12px;background:#f2faf8;"><div style="font-size:20px;line-height:1;">&#10024;</div><div style="margin-top:11px;color:#17213d;font-size:14px;font-weight:700;">AI Tutor</div><div style="margin-top:5px;color:#667085;font-size:12px;line-height:1.5;">Study smarter with personalised AI support.</div></div></td>
                </tr>
              </table>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#238b80" style="border-radius:10px;"><a class="cta-link" href="${escapeHtml(fields.ctaUrl)}" style="display:inline-block;padding:15px 23px;color:#ffffff;background:#238b80;border-radius:10px;font-size:15px;line-height:1;font-weight:700;text-decoration:none;">${escapeHtml(fields.ctaLabel)} &nbsp;&rarr;</a></td></tr></table>
              <div style="margin-top:30px;padding-top:24px;border-top:1px solid #edf0f2;color:#475467;font-size:14px;line-height:1.7;">${lineBreaks(fields.closing)}</div>
            </td>
          </tr>
          <tr>
            <td class="mobile-pad" style="padding:24px 38px 28px;background:#f8fafb;color:#667085;font-size:12px;line-height:1.65;border-top:1px solid #edf0f2;">
              <strong style="color:#17213d;">SkillBridge</strong> &mdash; meaningful learning through people and technology.<br>
              <a href="${escapeHtml(homeUrl)}" style="color:#238b80;text-decoration:none;">skill-bridge.me</a> &nbsp;&bull;&nbsp; <a href="mailto:support@skill-bridge.me" style="color:#238b80;text-decoration:none;">support@skill-bridge.me</a>${preview ? '' : `<br><a href="${safeUnsubscribe}" style="display:inline-block;margin-top:10px;color:#667085;text-decoration:underline;">Unsubscribe from marketing emails</a>`}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  const text = `${fields.preheader}\n\n${fields.heading}\n\n${fields.message}\n\n${fields.ctaLabel}: ${fields.ctaUrl}\n\n${fields.closing}\n\nThis is a SkillBridge product update and introduction.\nSkillBridge | support@skill-bridge.me${preview ? '' : `\nUnsubscribe: ${unsubscribeUrl}`}`;
  return { subject: fields.subject, html, text };
}

import nodemailer from 'nodemailer';

// Which address mail appears to come from. Account and transactional mail goes
// out as support@ so replies land where someone handles them; general
// enquiries (the public contact form) use info@.
//
// These must be addresses the SMTP account is allowed to send as - a provider
// will reject or silently rewrite a From it doesn't own, which is why the
// Gmail sender had to move to the domain's own mailbox.
export const SUPPORT_FROM = () =>
  process.env.SUPPORT_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER;
export const INFO_FROM = () =>
  process.env.INFO_EMAIL || process.env.SUPPORT_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER;

// A dedicated sending identity for the contact and support forms. Without it
// those messages go out From the same mailbox they are delivered To, which
// makes the mail client file them as sent-by-you ("Me" in the sender column)
// and is the kind of self-addressed mail spam filters look at twice. Replies
// are unaffected either way - Reply-To already points at the person who wrote
// in. Needs no mailbox of its own, only an address on a verified domain.
export const FORM_FROM = (identity) =>
  process.env.MAIL_FROM || (identity === 'info' ? INFO_FROM() : SUPPORT_FROM());

function smtpTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
}


// Render's free plan blocks outbound SMTP, so a host that works locally just
// times out there. Resend goes over HTTPS on 443, which isn't blocked, so it
// is preferred whenever an API key is present and SMTP remains the fallback -
// that keeps local development working unchanged with no key set.
let resendClient = null;
async function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendClient) {
    const { Resend } = await import('resend');
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

// Campaign mail deliberately has no SMTP fallback: queue semantics, stable
// idempotency and webhook message ids depend on one provider.
export async function sendMarketingEmail({ from, to, subject, html, text, headers, tags, idempotencyKey }) {
  const resend = await getResend();
  if (!resend) {
    const error = new Error('Resend is not configured');
    error.code = 'CAMPAIGN_CONFIG_MISSING';
    throw error;
  }

  return sendMarketingEmailWithClient(resend, { from, to, subject, html, text, headers, tags, idempotencyKey });
}

// Exported for a provider-contract unit test; production callers use the
// wrapper above so they cannot supply their own client.
export async function sendMarketingEmailWithClient(resend, { from, to, subject, html, text, headers, tags, idempotencyKey }) {
  try {
    const { data, error } = await resend.emails.send(
      { from, to, subject, html, text, headers, ...(tags?.length ? { tags } : {}) },
      { idempotencyKey }
    );
    if (error) {
      const providerError = new Error(error.message || 'Resend rejected the message');
      providerError.code = error.name || error.code || 'RESEND_REJECTED';
      providerError.statusCode = error.statusCode || error.status;
      throw providerError;
    }
    return { messageId: data?.id };
  } catch (error) {
    if (!error.code) error.code = error.name || 'RESEND_ERROR';
    throw error;
  }
}

export async function verifyResendWebhook(payload, headers) {
  const resend = await getResend();
  if (!resend || !process.env.RESEND_WEBHOOK_SECRET) {
    throw new Error('Resend webhook verification is not configured');
  }
  return resend.webhooks.verify({
    payload: Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload),
    headers: {
      id: headers['svix-id'],
      timestamp: headers['svix-timestamp'],
      signature: headers['svix-signature'],
    },
    webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
  });
}

/**
 * The one place a message actually leaves from. Returns a { messageId }-ish
 * object so existing callers can keep logging it.
 */
async function dispatch({ from, to, subject, html, text, replyTo }) {
  const resend = await getResend();

  if (resend) {
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
      ...(replyTo ? { replyTo } : {}),
    });
    if (error) throw new Error(error.message || 'Resend rejected the message');
    return { messageId: data?.id };
  }

  const transporter = smtpTransport();
  if (!transporter) throw new Error('No email transport configured');
  return transporter.sendMail({ from, to, subject, html, text, ...(replyTo ? { replyTo } : {}) });
}

/**
 * Used by the contact and support forms. `replyTo` carries the sender's own
 * address so staff can just hit reply, while the From stays a mailbox the
 * SMTP account actually owns.
 *
 * Returns false when it genuinely couldn't send, so a form can tell the user
 * to email directly instead of claiming success.
 */
export async function sendFormEmail({ to, from = 'support', subject, html, text, replyTo }) {
  const fromAddress = FORM_FROM(from);
  const hasTransport = Boolean(process.env.RESEND_API_KEY) || Boolean(smtpTransport());

  if (!hasTransport) {
    console.log('='.repeat(50));
    console.log(`📧 [not sent - no email transport configured] ${subject} -> ${to}`);
    console.log(text);
    console.log('='.repeat(50));
    return false;
  }

  try {
    const info = await dispatch({
      from: `"SkillBridge" <${fromAddress}>`,
      to,
      subject,
      html,
      text,
      replyTo,
    });
    console.log('✅ Form email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Error sending form email:', error.message);
    return false;
  }
}

/**
 * Prints a sign-in code to the terminal, but only when there is genuinely no
 * way to deliver it.
 *
 * This used to print unconditionally - the old comment said "always print the
 * code to the terminal for local testing, regardless of whether SMTP is
 * configured". On Render that meant every login and password-reset code landed
 * in the application log next to the address it belonged to, where the host
 * retains it and anyone with dashboard access can read it. A code is a
 * single-use password: that is account takeover for anyone who can see the
 * logs, admins included, and it walks straight past the per-code attempt limit
 * in routes/auth.routes.js.
 *
 * So: never in production, and otherwise only when no transport exists at all,
 * which is the one case where the developer has no other way to get the code.
 */
function logCodeForLocalDevOnly(label, email, code) {
  if (process.env.NODE_ENV === 'production') return;
  const hasTransport = Boolean(process.env.RESEND_API_KEY) || Boolean(smtpTransport());
  if (hasTransport) return;

  console.log('='.repeat(50));
  console.log(`🔑 ${label} for ${email}: ${code}`);
  console.log('(shown because no mail transport is configured — local dev only)');
  console.log('='.repeat(50));
}

export async function sendVerificationCode(email, code) {
  logCodeForLocalDevOnly('2FA Verification Code', email, code);

  // Check if SMTP is configured
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = SUPPORT_FROM();

  // If SMTP is not configured, we've already logged the code above - nothing more to do.
  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log('⚠️  SMTP not configured. Add SMTP_HOST, SMTP_USER, and SMTP_PASS to .env to send emails.');
    return true;
  }

  try {
    const info = await dispatch({
      from: `"SkillBridge" <${smtpFrom}>`,
      to: email,
      subject: 'SkillBridge Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">SkillBridge</h1>
          </div>
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-top: 0;">Your Verification Code</h2>
            <p style="color: #666; font-size: 16px;">Please use the following code to verify your account:</p>
            <div style="background: white; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
              <p style="font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px; margin: 0;">${code}</p>
            </div>
            <p style="color: #666; font-size: 14px;">This code will expire in 10 minutes.</p>
            <p style="color: #999; font-size: 12px; margin-top: 30px;">If you didn't request this code, please ignore this email.</p>
          </div>
        </div>
      `,
      text: `Your SkillBridge verification code is: ${code}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this code, please ignore this email.`,
    });

    console.log('✅ Verification email sent successfully:', info.messageId);
    console.log('📧 Email sent to:', email);
    return true;
  } catch (error) {
    console.error('❌ Error sending verification email:', error.message);
    console.error('❌ Error code:', error.code);
    console.error('❌ Error details:', error);
    console.log('⚠️  Email sending failed. Please check SMTP settings. (Code was already printed above.)');
    return true; // Return true to not block the registration/login flow
  }
}

export async function sendPasswordResetCode(email, code) {
  logCodeForLocalDevOnly('Password Reset Code', email, code);

  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = SUPPORT_FROM();

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log('⚠️  SMTP not configured. Add SMTP_HOST, SMTP_USER, and SMTP_PASS to .env to send emails.');
    return true;
  }

  try {
    const info = await dispatch({
      from: `"SkillBridge" <${smtpFrom}>`,
      to: email,
      subject: 'Reset your SkillBridge password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">SkillBridge</h1>
          </div>
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-top: 0;">Reset Your Password</h2>
            <p style="color: #666; font-size: 16px;">Use the following code to reset your password:</p>
            <div style="background: white; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
              <p style="font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px; margin: 0;">${code}</p>
            </div>
            <p style="color: #666; font-size: 14px;">This code will expire in 10 minutes.</p>
            <p style="color: #999; font-size: 12px; margin-top: 30px;">If you didn't request a password reset, you can safely ignore this email - your password won't be changed.</p>
          </div>
        </div>
      `,
      text: `Use the following code to reset your SkillBridge password: ${code}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this, you can safely ignore this email.`,
    });

    console.log('✅ Password reset email sent successfully:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Error sending password reset email:', error.message);
    return true; // Never block the caller's primary action over an email failure
  }
}

export async function sendMeetingInviteEmail(email, recipientName, meetingDetails) {
  const { title, startsAt, duration, skill, joinUrl, organizerName } = meetingDetails;

  // Check if SMTP is configured
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = SUPPORT_FROM();

  const meetingDate = new Date(startsAt).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  // If SMTP is not configured, log to console (for development)
  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log('='.repeat(50));
    console.log(`📅 Meeting Invite for ${email}`);
    console.log(`   Title: ${title}`);
    console.log(`   Date: ${meetingDate}`);
    console.log(`   Duration: ${duration} minutes`);
    console.log(`   Skill: ${skill || 'N/A'}`);
    console.log(`   Organizer: ${organizerName}`);
    console.log(`   Join URL: ${joinUrl}`);
    console.log('='.repeat(50));
    console.log('⚠️  SMTP not configured. Add SMTP_HOST, SMTP_USER, and SMTP_PASS to .env to send emails.');
    return true;
  }

  try {
    const info = await dispatch({
      from: `"SkillBridge" <${smtpFrom}>`,
      to: email,
      subject: `Meeting Invitation: ${title}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">SkillBridge</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Meeting Invitation</p>
          </div>
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-top: 0;">Hi ${recipientName}!</h2>
            <p style="color: #666; font-size: 16px;">${organizerName} has invited you to a session on SkillBridge.</p>

            <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #14b8a6;">
              <h3 style="color: #333; margin: 0 0 15px 0;">📅 ${title}</h3>
              <p style="color: #666; margin: 8px 0;"><strong>🕐 When:</strong> ${meetingDate}</p>
              <p style="color: #666; margin: 8px 0;"><strong>⏱️ Duration:</strong> ${duration} minutes</p>
              ${skill ? `<p style="color: #666; margin: 8px 0;"><strong>📚 Skill:</strong> ${skill}</p>` : ''}
              <p style="color: #666; margin: 8px 0;"><strong>👤 Organizer:</strong> ${organizerName}</p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${joinUrl}" style="display: inline-block; background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%); color: white; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-weight: bold; font-size: 16px;">
                Join Meeting
              </a>
            </div>

            <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">
              Or copy this link: <a href="${joinUrl}" style="color: #14b8a6;">${joinUrl}</a>
            </p>
          </div>
        </div>
      `,
      text: `Hi ${recipientName}!\n\n${organizerName} has invited you to a session on SkillBridge.\n\n📅 ${title}\n🕐 When: ${meetingDate}\n⏱️ Duration: ${duration} minutes\n${skill ? `📚 Skill: ${skill}\n` : ''}👤 Organizer: ${organizerName}\n\nJoin Meeting: ${joinUrl}`,
    });

    console.log('✅ Meeting invite email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Error sending meeting invite email:', error.message);
    // Fallback to console logging if email fails
    console.log('='.repeat(50));
    console.log(`📅 Meeting Invite for ${email}`);
    console.log(`   Title: ${title}`);
    console.log(`   Join URL: ${joinUrl}`);
    console.log('='.repeat(50));
    return true;
  }
}

// Generic notification email - used by utils/notify.js for every notification
// type that opts into email delivery. Callers pass their own subject/html/text
// so each notification type reads as a distinct, specific message.
export async function sendNotificationEmail(email, subject, html, text) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = SUPPORT_FROM();

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log('='.repeat(50));
    console.log(`🔔 Notification email for ${email}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   ${text}`);
    console.log('='.repeat(50));
    console.log('⚠️  SMTP not configured. Add SMTP_HOST, SMTP_USER, and SMTP_PASS to .env to send emails.');
    return true;
  }

  try {
    const info = await dispatch({
      from: `"SkillBridge" <${smtpFrom}>`,
      to: email,
      subject,
      html,
      text,
    });

    console.log('✅ Notification email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Error sending notification email:', error.message);
    console.log('='.repeat(50));
    console.log(`🔔 Notification email for ${email}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   ${text}`);
    console.log('='.repeat(50));
    return true; // Never block the caller's primary action over an email failure
  }
}

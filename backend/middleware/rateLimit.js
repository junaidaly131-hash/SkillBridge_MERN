import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// These limits are deliberately generous. Carrier-grade NAT is the norm for
// mobile users in Pakistan, so a whole city can share one address - a tight
// per-IP limit would lock out real people long before it inconvenienced an
// attacker, who can rotate addresses anyway.
//
// So per-IP limiting is NOT the defence against guessing a verification code.
// That is the per-code attempt counter in routes/auth.routes.js, which holds
// regardless of how many addresses the attacker has. What these limiters
// actually buy is a ceiling on the cheap, high-volume abuse that no counter
// covers: hammering the issuing endpoints to send mail.

const common = {
  standardHeaders: true, // RateLimit-* response headers
  legacyHeaders: false,
  // Default is the status code alone with an empty body; the frontend reads
  // `message` off every other error response, so give it one here too.
  handler: (req, res) =>
    res.status(429).json({
      message: 'Too many attempts. Please wait a few minutes and try again.',
    }),
};

/**
 * Endpoints that MINT a code and send an email: register, login,
 * forgot-password, resend-code.
 *
 * Each of these costs us a real outbound email, so the cap is on how many an
 * address can trigger rather than on how many it can get wrong. Ten in fifteen
 * minutes is far more than any genuine sign-in flow needs (register + resend is
 * two) while stopping someone from using our verified sending domain to mail-bomb
 * a user, which would cost us the domain's reputation.
 */
export const codeIssueLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  ...common,
});

/**
 * Endpoints that REDEEM a code: verify, reset-password.
 *
 * Secondary to the per-code attempt counter - see MAX_CODE_ATTEMPTS. This only
 * blunts the rate at which a single address can work through codes for many
 * different accounts at once, which the per-code counter does not see.
 */
export const codeRedeemLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  ...common,
});

/**
 * Fetching another user's uploaded credential file.
 *
 * Any signed-in user being able to see a teacher's degree is the point - it is
 * how a student decides who to book, so this is not locked down to people who
 * already have a conversation. But signing up is free and self-serve, and the
 * public directory lists every teacher, so without a ceiling one account can
 * walk the whole platform and collect every certificate on it. Sixty an hour is
 * far more than reading profiles needs and far less than scraping wants.
 *
 * Keyed per authenticated user rather than per IP: these endpoints all sit
 * behind a JWT, and a shared mobile IP would otherwise pool strangers together.
 */
export const documentFetchLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  // ipKeyGenerator, not req.ip, for the anonymous fallback: an IPv6 client
  // typically holds a whole /64, so keying on the exact address would hand one
  // attacker effectively unlimited buckets. The helper normalises to the subnet.
  keyGenerator: (req) => req.user?.userId || ipKeyGenerator(req.ip),
  ...common,
  handler: (req, res) =>
    res.status(429).json({
      message: "You've opened a lot of documents in a short time. Please try again later.",
    }),
});

/**
 * Cheap, short-term protection in front of the durable daily AI quota.
 * Authentication runs before this middleware, so the key is an account rather
 * than a shared mobile/carrier IP. Daily admission still happens atomically in
 * MongoDB; this limiter is only for bursts.
 */
export const aiTutorSendLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 15,
  keyGenerator: (req) => req.user?.userId || ipKeyGenerator(req.ip),
  ...common,
  handler: (req, res) =>
    res.status(429).json({
      code: 'AI_TUTOR_RATE_LIMIT',
      message: 'Too many AI Tutor requests. Please wait a few minutes and try again.',
    }),
});

export const campaignTestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => req.user?.userId || ipKeyGenerator(req.ip),
  ...common,
  handler: (req, res) => res.status(429).json({ message: 'Too many test emails. Please wait before trying again.' }),
});

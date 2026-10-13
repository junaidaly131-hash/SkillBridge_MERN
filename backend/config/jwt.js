import jwt from 'jsonwebtoken';

// Session tokens were signed in three separate places with
// `{ expiresIn: process.env.JWT_EXPIRE }`. jsonwebtoken treats an undefined
// expiresIn as "no expiry" and omits the exp claim entirely, so a deployment
// that simply never set the variable issued tokens that are valid forever -
// including ones already in the wild. One helper, one default, checked once.

const DEFAULT_EXPIRES_IN = '7d';
const MIN_SECRET_LENGTH = 32;

/**
 * Reads and validates the JWT settings. Call once at startup, before the server
 * starts listening, so a misconfiguration is a refusal to boot rather than a
 * surprise at the first login.
 */
export function assertJwtConfig() {
  const secret = process.env.JWT_SECRET;

  // Fatal. Without it jwt.sign throws on every login anyway, so failing here
  // just makes the reason obvious instead of surfacing it as a 500 later.
  if (!secret) {
    throw new Error('JWT_SECRET is not set - refusing to start.');
  }

  // Not fatal: an existing deployment should not be bricked by a length rule.
  // But a short secret is an offline brute-force target, and whoever recovers
  // it can mint a token for any account, admins included.
  if (secret.length < MIN_SECRET_LENGTH) {
    console.warn(
      `⚠️  JWT_SECRET is only ${secret.length} characters. Use at least ${MIN_SECRET_LENGTH} ` +
        '(e.g. `openssl rand -base64 48`). Rotating it signs everyone out, nothing worse.'
    );
  }

  if (!process.env.JWT_EXPIRE) {
    console.warn(`⚠️  JWT_EXPIRE is not set - sessions will expire after ${DEFAULT_EXPIRES_IN}.`);
  }
}

/** The expiry to sign with - never undefined, which would mean "never expires". */
export const jwtExpiresIn = () => process.env.JWT_EXPIRE || DEFAULT_EXPIRES_IN;

/** Signs a session token for one user. The only place auth tokens are minted. */
export function signAuthToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: jwtExpiresIn() });
}

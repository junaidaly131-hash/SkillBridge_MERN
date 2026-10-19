const SESSION_AUTH_CODES = new Set([
  'AUTH_REQUIRED',
  'TOKEN_EXPIRED',
  'INVALID_TOKEN',
  'ACCOUNT_SUSPENDED',
]);

export function bearerToken(authorization) {
  if (typeof authorization !== 'string') return '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1] || '';
}

export function isSessionAuthFailure({ status, code, message, authorization }) {
  if (!bearerToken(authorization)) return false;
  if (SESSION_AUTH_CODES.has(code)) return true;
  if (status === 401) return true;

  // Supports a rolling deployment where the frontend reaches an older backend
  // that still returned a bare 403 for an expired JWT.
  return status === 403 && /^invalid or expired token$/i.test(String(message || '').trim());
}

export function shouldInvalidateSession({ currentToken, ...failure }) {
  const sentToken = bearerToken(failure.authorization);
  return Boolean(
    sentToken &&
    sentToken === currentToken &&
    isSessionAuthFailure(failure)
  );
}

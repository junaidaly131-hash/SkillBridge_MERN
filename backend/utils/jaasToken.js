import jwt from 'jsonwebtoken';

const TOKEN_LIFETIME_SECONDS = 2 * 60 * 60; // 2 hours - keep short, per JaaS guidance
const NOT_BEFORE_BUFFER_SECONDS = 10; // small clock-skew buffer, matches 8x8's own sample

// The full PEM file (including "-----BEGIN/END PRIVATE KEY-----" armor and its
// internal newlines) is stored base64-encoded in JAAS_PRIVATE_KEY_BASE64, which
// survives .env untouched since it's a single line with no literal newlines to lose.
function loadPrivateKey() {
  const raw = (process.env.JAAS_PRIVATE_KEY_BASE64 || '').trim();
  if (!raw) {
    throw new Error('JAAS_PRIVATE_KEY_BASE64 is not set');
  }

  const decoded = Buffer.from(raw, 'base64').toString('utf-8');
  if (!decoded.includes('-----BEGIN')) {
    throw new Error('JAAS_PRIVATE_KEY_BASE64 did not decode to a valid PEM');
  }

  return decoded;
}

// Generates a short-lived, per-participant JWT for one JaaS room.
// isModerator should be true only for the meeting's organizer.
// roomName is the bare room name - NOT prefixed with the App ID.
export function generateJaasToken({ userId, name, email, isModerator, roomName }) {
  if (!roomName) {
    throw new Error('generateJaasToken requires roomName');
  }

  const privateKey = loadPrivateKey();
  const appId = process.env.JAAS_APP_ID;
  const kid = process.env.JAAS_API_KEY_ID;

  if (!appId || !kid) {
    throw new Error('JAAS_APP_ID or JAAS_API_KEY_ID is not set');
  }

  const nowSeconds = Math.round(Date.now() / 1000);

  const payload = {
    aud: 'jitsi',
    iss: 'chat',
    sub: appId,
    // Scoped to ONE room. This used to be '*', on the reasoning that our own
    // participant check gates who gets a token - but that gates minting, not
    // use. A wildcard token works in every room under the App ID for its full
    // two hours, so anyone who booked a single session of their own held a key
    // to every other call on the platform, as moderator if they had created a
    // meeting (so: able to kick the real participants and end the call).
    //
    // The earlier attempt at a literal room name most likely failed because
    // context.room was missing entirely - see below. The bare room name is
    // correct here; it is NOT prefixed with the App ID, which goes in `sub`.
    room: roomName,
    exp: nowSeconds + TOKEN_LIFETIME_SECONDS,
    nbf: nowSeconds - NOT_BEFORE_BUFFER_SECONDS,
    context: {
      // Required for the room claim above to be compared literally. Without
      // this block 8x8 may treat `room` as a regex, and a room name containing
      // regex metacharacters would then match the wrong thing or nothing at all.
      room: {
        regex: false,
      },
      user: {
        id: userId,
        name,
        email,
        // JaaS expects these as the literal strings "true"/"false", not booleans -
        // confirmed against 8x8's own official jaas_demo sample code.
        moderator: isModerator ? 'true' : 'false',
      },
      features: {
        livestreaming: 'false',
        recording: 'false',
        transcription: 'false',
        'outbound-call': 'false',
      },
    },
  };

  return jwt.sign(payload, privateKey, { algorithm: 'RS256', header: { kid } });
}

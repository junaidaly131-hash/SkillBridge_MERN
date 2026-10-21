export const RESEND_EVENT_STATUS = Object.freeze({
  'email.sent': { status: 'accepted', rank: 10 },
  'email.delivery_delayed': { status: 'accepted', rank: 15 },
  'email.delivered': { status: 'delivered', rank: 30 },
  'email.failed': { status: 'failed', rank: 40 },
  'email.bounced': { status: 'failed', rank: 50 },
  'email.complained': { status: 'failed', rank: 60 },
});

export function shouldApplyProviderEvent({ currentAt, currentRank = 0, incomingAt, incomingRank }) {
  const currentTime = currentAt ? new Date(currentAt).getTime() : 0;
  const incomingTime = new Date(incomingAt).getTime();
  return incomingTime > currentTime || (incomingTime === currentTime && incomingRank > currentRank);
}

export function isHardBounce(eventType, bounceType) {
  if (eventType !== 'email.bounced') return false;
  return !['transient', 'soft'].includes(String(bounceType || '').toLowerCase());
}


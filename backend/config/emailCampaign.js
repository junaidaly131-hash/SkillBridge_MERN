const positiveInt = (name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const validHttpBase = (value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
};

export function getEmailCampaignConfig() {
  const senderAddress = (
    process.env.MARKETING_FROM ||
    process.env.MAIL_FROM ||
    process.env.SUPPORT_EMAIL ||
    ''
  ).trim();
  const senderName = (process.env.MARKETING_FROM_NAME || 'SkillBridge').trim();
  const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  const backendUrl = (process.env.BACKEND_URL || '').replace(/\/$/, '');
  return {
    enabled: process.env.EMAIL_CAMPAIGN_ENABLED === 'true',
    legacyAudienceEnabled: process.env.EMAIL_CAMPAIGN_LEGACY_AUDIENCE === 'true',
    resendConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
    webhookConfigured: Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim()),
    unsubscribeConfigured: Boolean(process.env.MARKETING_UNSUBSCRIBE_SECRET?.trim()),
    senderAddress,
    senderValid: /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(senderAddress) && !/[\r\n]/.test(senderAddress),
    senderName,
    senderNameValid: Boolean(senderName) && senderName.length <= 80 && !/[\r\n]/.test(senderName),
    frontendUrl,
    backendUrl,
    publicUrlsValid: validHttpBase(frontendUrl) && validHttpBase(backendUrl),
    concurrency: positiveInt('EMAIL_CAMPAIGN_CONCURRENCY', 1, { max: 5 }),
    maxAttempts: positiveInt('EMAIL_CAMPAIGN_MAX_ATTEMPTS', 3, { max: 5 }),
    leaseMs: positiveInt('EMAIL_CAMPAIGN_LEASE_MS', 120000, { min: 30000, max: 600000 }),
    requestTimeoutMs: positiveInt('EMAIL_CAMPAIGN_REQUEST_TIMEOUT_MS', 30000, { min: 5000, max: 120000 }),
    retryBaseMs: positiveInt('EMAIL_CAMPAIGN_RETRY_BASE_MS', 30000, { min: 1000, max: 3600000 }),
  };
}

export function assertCampaignSendConfig() {
  const config = getEmailCampaignConfig();
  const missing = [];
  if (!config.enabled) missing.push('EMAIL_CAMPAIGN_ENABLED=true');
  if (!config.resendConfigured) missing.push('RESEND_API_KEY');
  if (!config.senderAddress) missing.push('MARKETING_FROM (or MAIL_FROM/SUPPORT_EMAIL)');
  else if (!config.senderValid) missing.push('a valid MARKETING_FROM email address');
  if (!config.senderNameValid) missing.push('a valid MARKETING_FROM_NAME');
  if (!config.unsubscribeConfigured) missing.push('MARKETING_UNSUBSCRIBE_SECRET');
  if (!config.frontendUrl) missing.push('FRONTEND_URL');
  if (!config.backendUrl) missing.push('BACKEND_URL');
  if (config.frontendUrl && config.backendUrl && !config.publicUrlsValid) missing.push('valid HTTP(S) FRONTEND_URL and BACKEND_URL');
  if (config.leaseMs < config.requestTimeoutMs + 30000) {
    missing.push('EMAIL_CAMPAIGN_LEASE_MS at least 30 seconds longer than EMAIL_CAMPAIGN_REQUEST_TIMEOUT_MS');
  }
  if (missing.length) {
    const error = new Error(`Email campaigns are not configured: ${missing.join(', ')}`);
    error.code = 'CAMPAIGN_CONFIG_MISSING';
    throw error;
  }
  return config;
}

export function describeEmailCampaignConfig() {
  const config = getEmailCampaignConfig();
  console.log('Email campaigns:', config.enabled ? 'enabled' : 'disabled');
  console.log('Email campaign legacy audience:', config.legacyAudienceEnabled ? 'enabled' : 'disabled');
  console.log('Email campaign Resend key:', config.resendConfigured ? 'set' : 'missing');
  console.log('Email campaign webhook secret:', config.webhookConfigured ? 'set' : 'missing');
  console.log('Marketing unsubscribe secret:', config.unsubscribeConfigured ? 'set' : 'missing');
  console.log('Email campaign sender:', config.senderAddress ? 'set' : 'missing');
  console.log('Email campaign public URLs:', config.publicUrlsValid ? 'set' : 'missing/invalid');
}

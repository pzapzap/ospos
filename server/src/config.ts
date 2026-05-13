function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

const jwtSecret = requireEnv('JWT_SECRET');
if (process.env.NODE_ENV === 'production' && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}

export const config = {
  port: parseInt(optionalEnv('PORT', '3000'), 10),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),

  database: {
    url: requireEnv('DATABASE_URL'),
  },

  jwt: {
    secret: jwtSecret,
    expiresIn: '24h',
  },

  stripe: {
    secretKey: requireEnv('STRIPE_SECRET_KEY'),
    webhookSecret: requireEnv('STRIPE_WEBHOOK_SECRET'),
    apiVersion: '2024-12-18.acacia' as const,
  },

  connect: (() => {
    const mode = optionalEnv('STRIPE_CONNECT_MODE', 'express');
    if (mode !== 'express' && mode !== 'standard') {
      throw new Error(`STRIPE_CONNECT_MODE must be 'express' or 'standard' (got: ${mode})`);
    }
    const clientId = optionalEnv('STRIPE_CONNECT_CLIENT_ID', '');
    const redirectUri = optionalEnv('STRIPE_CONNECT_REDIRECT_URI', '');
    if (mode === 'standard' && (!clientId || !redirectUri)) {
      throw new Error('STRIPE_CONNECT_MODE=standard requires STRIPE_CONNECT_CLIENT_ID and STRIPE_CONNECT_REDIRECT_URI');
    }
    return { mode: mode as 'express' | 'standard', clientId, redirectUri };
  })(),

  // Stubbed for Phase 2, implement Phase 3
  twilio: {
    accountSid: optionalEnv('TWILIO_ACCOUNT_SID', ''),
    authToken: optionalEnv('TWILIO_AUTH_TOKEN', ''),
    phoneNumber: optionalEnv('TWILIO_PHONE_NUMBER', ''),
  },

  sendgrid: {
    apiKey: optionalEnv('SENDGRID_API_KEY', ''),
    fromEmail: optionalEnv('SENDGRID_FROM_EMAIL', ''),
  },

  resend: {
    apiKey: optionalEnv('RESEND_API_KEY', ''),
    fromEmail: optionalEnv('RESEND_FROM_EMAIL', ''),
  },
};

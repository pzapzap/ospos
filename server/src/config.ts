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

export const config = {
  port: parseInt(optionalEnv('PORT', '3000'), 10),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),

  database: {
    url: requireEnv('DATABASE_URL'),
  },

  jwt: {
    secret: requireEnv('JWT_SECRET'),
    expiresIn: '24h',
  },

  stripe: {
    secretKey: requireEnv('STRIPE_SECRET_KEY'),
    webhookSecret: requireEnv('STRIPE_WEBHOOK_SECRET'),
    apiVersion: '2024-12-18.acacia' as const,
  },

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
};

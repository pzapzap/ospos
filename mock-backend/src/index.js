// OSPOS Mock Backend
// For development and open source contribution only.
// This server returns fake responses so the app can be tested without
// a real Stripe account or production backend.

const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Fake JWT generation
function fakeJWT(userId) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      email: 'dev@ospos.app',
      stripeAccountId: 'acct_mock_123',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400,
    })
  ).toString('base64url');
  return `${header}.${payload}.mock_signature`;
}

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', mock: true, timestamp: new Date().toISOString() });
});

// POST /auth/register
app.post('/auth/register', (req, res) => {
  const { email } = req.body;
  console.log(`[MOCK] Register: ${email}`);
  res.json({
    token: fakeJWT('mock-user-001'),
    userId: 'mock-user-001',
  });
});

// POST /auth/login
app.post('/auth/login', (req, res) => {
  const { email } = req.body;
  console.log(`[MOCK] Login: ${email}`);
  res.json({
    token: fakeJWT('mock-user-001'),
    userId: 'mock-user-001',
  });
});

// GET /mock-stripe-onboarding — serves a fake Stripe Connect page
app.get('/mock-stripe-onboarding', (_req, res) => {
  console.log('[MOCK] Serving mock Stripe onboarding page');
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, sans-serif; background: #0a2540; color: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .card { background: #1a3a5c; border-radius: 12px; padding: 32px; max-width: 360px; text-align: center; }
    h1 { font-size: 22px; margin-bottom: 8px; }
    p { color: #8898aa; font-size: 14px; line-height: 1.5; }
    button { background: #635bff; color: #fff; border: none; border-radius: 8px; padding: 14px 32px; font-size: 16px; font-weight: 600; margin-top: 24px; cursor: pointer; width: 100%; }
    .stripe { color: #635bff; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Mock <span class="stripe">Stripe</span> Connect</h1>
    <p>This is a simulated Stripe Connect onboarding page for development testing.</p>
    <p>In production, this would be the real Stripe onboarding flow where you enter business details.</p>
    <button onclick="if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage('stripe-return')}else{window.location.href='ospos://stripe/return'}">Complete Setup (Mock)</button>
  </div>
</body>
</html>`);
});

// POST /stripe/onboarding
app.post('/stripe/onboarding', (req, res) => {
  console.log('[MOCK] Stripe onboarding requested');
  // Point to our own mock page that has a "Complete" button redirecting to ospos://stripe/return
  const host = req.headers.host || 'localhost:3000';
  const protocol = req.protocol || 'http';
  res.json({
    url: `${protocol}://${host}/mock-stripe-onboarding`,
    stripeAccountId: 'acct_mock_123',
  });
});

// POST /stripe/onboarding/refresh
app.post('/stripe/onboarding/refresh', (req, res) => {
  console.log('[MOCK] Stripe onboarding refresh');
  const host = req.headers.host || 'localhost:3000';
  const protocol = req.protocol || 'http';
  res.json({
    url: `${protocol}://${host}/mock-stripe-onboarding`,
  });
});

// GET /stripe/account-status
app.get('/stripe/account-status', (_req, res) => {
  res.json({
    charges_enabled: true,
    details_submitted: true,
    payouts_enabled: true,
  });
});

// POST /stripe/connection-token
app.post('/stripe/connection-token', (_req, res) => {
  console.log('[MOCK] Connection token requested');
  res.json({ secret: 'mock_connection_token_secret' });
});

// POST /payments/create-intent
app.post('/payments/create-intent', (req, res) => {
  const { amount, currency } = req.body;
  console.log(`[MOCK] Create payment intent: ${amount} ${currency}`);
  res.json({
    clientSecret: 'pi_mock_secret_' + Date.now(),
    paymentIntentId: 'pi_mock_' + Date.now(),
  });
});

// POST /payments/refund
app.post('/payments/refund', (req, res) => {
  const { paymentIntentId, amount } = req.body;
  console.log(`[MOCK] Refund: ${paymentIntentId} amount=${amount}`);
  res.json({
    refundId: 're_mock_' + Date.now(),
    status: 'succeeded',
    amount: amount || 0,
  });
});

// POST /sync/push
app.post('/sync/push', (req, res) => {
  const records = req.body.records || [];
  console.log(`[MOCK] Sync push: ${records.length} records (discarded)`);
  res.json({ synced: records.map((r) => r.id) });
});

// GET /sync/pull
app.get('/sync/pull', (_req, res) => {
  res.json({ orders: [] });
});

// POST /receipts/send
app.post('/receipts/send', (req, res) => {
  const { method, recipient } = req.body;
  console.log(`[MOCK] Send receipt via ${method} to ${recipient}`);
  res.json({ success: true, receiptLogId: 'mock-receipt-' + Date.now() });
});

// All other routes → 501
app.all('*', (req, res) => {
  console.log(`[MOCK] 501 Not Implemented: ${req.method} ${req.path}`);
  res.status(501).json({
    error: 'Not implemented in mock backend',
    hint: 'This endpoint requires the production backend. See server/ directory.',
  });
});

app.listen(PORT, () => {
  console.log(`\n  OSPOS Mock Backend running on port ${PORT}`);
  console.log('  This is for development only — not for production use.\n');
});

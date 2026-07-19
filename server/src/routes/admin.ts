import { Router, Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { query } from '../db/connection';

const router = Router();

// Token compared in constant time so we don't leak length info via timing.
// Missing env var → treat as "feature disabled" and always 404.
function tokenOk(candidate: string): boolean {
  const expected = process.env.ADMIN_STATS_TOKEN;
  if (!expected || expected.length < 16) return false;
  if (candidate.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
  } catch {
    return false;
  }
}

interface StatsRow {
  total_users: number;
  stripe_attached: number;
  apple_signin: number;
  google_signin: number;
  new_24h: number;
  new_7d: number;
  new_30d: number;
  orders_24h: number;
  orders_7d: number;
  gmv_24h_cents: number;
  gmv_7d_cents: number;
  gmv_24h_cash_cents: number;
  gmv_24h_card_cents: number;
  gmv_7d_cash_cents: number;
  gmv_7d_card_cents: number;
  receipts_7d: number;
}

async function fetchStats(): Promise<StatsRow> {
  const rows = await query<StatsRow>(
    `SELECT
      (SELECT COUNT(*)::int FROM users) AS total_users,
      (SELECT COUNT(*)::int FROM users WHERE stripe_account_id IS NOT NULL) AS stripe_attached,
      (SELECT COUNT(*)::int FROM users WHERE apple_identifier IS NOT NULL) AS apple_signin,
      (SELECT COUNT(*)::int FROM users WHERE google_identifier IS NOT NULL) AS google_signin,
      (SELECT COUNT(*)::int FROM users WHERE created_at > NOW() - INTERVAL '24 hours') AS new_24h,
      (SELECT COUNT(*)::int FROM users WHERE created_at > NOW() - INTERVAL '7 days') AS new_7d,
      (SELECT COUNT(*)::int FROM users WHERE created_at > NOW() - INTERVAL '30 days') AS new_30d,
      (SELECT COUNT(*)::int FROM synced_orders WHERE created_at > NOW() - INTERVAL '24 hours') AS orders_24h,
      (SELECT COUNT(*)::int FROM synced_orders WHERE created_at > NOW() - INTERVAL '7 days') AS orders_7d,
      (SELECT COALESCE(SUM(total),0)::bigint FROM synced_orders WHERE created_at > NOW() - INTERVAL '24 hours') AS gmv_24h_cents,
      (SELECT COALESCE(SUM(total),0)::bigint FROM synced_orders WHERE created_at > NOW() - INTERVAL '7 days') AS gmv_7d_cents,
      (SELECT COALESCE(SUM(total) FILTER (WHERE payment_method = 'cash'),0)::bigint FROM synced_orders WHERE created_at > NOW() - INTERVAL '24 hours') AS gmv_24h_cash_cents,
      (SELECT COALESCE(SUM(total) FILTER (WHERE payment_method = 'card'),0)::bigint FROM synced_orders WHERE created_at > NOW() - INTERVAL '24 hours') AS gmv_24h_card_cents,
      (SELECT COALESCE(SUM(total) FILTER (WHERE payment_method = 'cash'),0)::bigint FROM synced_orders WHERE created_at > NOW() - INTERVAL '7 days') AS gmv_7d_cash_cents,
      (SELECT COALESCE(SUM(total) FILTER (WHERE payment_method = 'card'),0)::bigint FROM synced_orders WHERE created_at > NOW() - INTERVAL '7 days') AS gmv_7d_card_cents,
      (SELECT COUNT(*)::int FROM receipt_logs WHERE created_at > NOW() - INTERVAL '7 days') AS receipts_7d`
  );
  return rows[0];
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

function formatMoney(cents: number | bigint): string {
  const n = Number(cents) / 100;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function renderPage(s: StatsRow): string {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const attachRate = s.total_users > 0 ? Math.round((s.stripe_attached / s.total_users) * 100) : 0;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="refresh" content="30">
<title>OSPOS · Stats</title>
<style>
  :root {
    --bg: #09090B;
    --surface: #18181B;
    --border: #27272A;
    --text: #FAFAFA;
    --text-secondary: #A1A1AA;
    --text-muted: #8E8E93;
    --cyan: #22D3EE;
    --cyan-dark: #06B6D4;
    --accent: #D4A574;
    --danger: #EF4444;
    --success: #22D3EE;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Text', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
    font-variant-numeric: tabular-nums;
  }
  body { min-height: 100vh; padding: 24px; }
  .container { max-width: 900px; margin: 0 auto; padding-bottom: 48px; }
  header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 32px; gap: 16px; flex-wrap: wrap; }
  .brand { display: flex; align-items: baseline; gap: 12px; }
  .brand-mark {
    font-family: 'DM Serif Display', Georgia, serif;
    font-size: 32px;
    color: var(--text);
    letter-spacing: -0.02em;
  }
  .brand-sub {
    font-size: 12px;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    color: var(--text-muted);
    font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
  }
  .refresh {
    font-size: 11px;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    color: var(--text-muted);
    font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
  }
  .refresh .dot {
    display: inline-block;
    width: 6px; height: 6px;
    background: var(--cyan);
    border-radius: 50%;
    margin-right: 6px;
    vertical-align: middle;
    box-shadow: 0 0 12px rgba(34, 211, 238, 0.6);
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  section { margin-bottom: 40px; }
  .section-label {
    font-size: 11px;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    color: var(--text-muted);
    font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
    margin-bottom: 14px;
  }
  .hero {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 28px 28px 24px;
    margin-bottom: 20px;
  }
  .hero-number {
    font-family: 'DM Serif Display', Georgia, serif;
    font-size: 96px;
    line-height: 1;
    color: var(--cyan);
    letter-spacing: -0.04em;
    margin-bottom: 4px;
  }
  .hero-label {
    font-size: 15px;
    color: var(--text-secondary);
    font-weight: 500;
  }
  .hero-sub {
    margin-top: 12px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
    display: flex; justify-content: space-between; align-items: baseline;
    gap: 16px;
  }
  .hero-sub .k {
    font-size: 12px;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    color: var(--text-muted);
    font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
  }
  .hero-sub .v {
    font-family: 'DM Serif Display', Georgia, serif;
    font-size: 22px;
    color: var(--text);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
  }
  .stat {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 18px 20px;
  }
  .stat-num {
    font-family: 'DM Serif Display', Georgia, serif;
    font-size: 34px;
    color: var(--text);
    line-height: 1;
    letter-spacing: -0.02em;
  }
  .stat-num.cyan { color: var(--cyan); }
  .stat-num.accent { color: var(--accent); }
  .stat-label {
    margin-top: 8px;
    font-size: 12px;
    color: var(--text-muted);
    letter-spacing: 0.2px;
  }
  .stat-money .stat-num { font-size: 26px; }
  .stat-split {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
    font-size: 11px;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .stat-split .k { color: var(--text-muted); }
  .stat-split .v { color: var(--text-secondary); font-family: 'DM Serif Display', Georgia, serif; font-size: 14px; letter-spacing: 0; text-transform: none; }
  footer {
    margin-top: 40px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
    display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap;
    color: var(--text-muted);
    font-size: 11px;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
  }
  @media (max-width: 500px) {
    body { padding: 16px; }
    .hero { padding: 20px; }
    .hero-number { font-size: 72px; }
  }
</style>
</head>
<body>
<div class="container">
  <header>
    <div class="brand">
      <div class="brand-mark">OSPOS</div>
      <div class="brand-sub">· merchant stats</div>
    </div>
    <div class="refresh"><span class="dot"></span>live · 30s</div>
  </header>

  <section>
    <div class="section-label">Merchants</div>
    <div class="hero">
      <div class="hero-number">${formatNumber(s.total_users)}</div>
      <div class="hero-label">Total merchants signed up</div>
      <div class="hero-sub">
        <span class="k">Stripe attached</span>
        <span class="v">${formatNumber(s.stripe_attached)} <span style="color: var(--text-muted); font-size: 14px;">/ ${attachRate}%</span></span>
      </div>
    </div>

    <div class="grid">
      <div class="stat">
        <div class="stat-num cyan">${formatNumber(s.new_24h)}</div>
        <div class="stat-label">New · last 24h</div>
      </div>
      <div class="stat">
        <div class="stat-num">${formatNumber(s.new_7d)}</div>
        <div class="stat-label">New · last 7d</div>
      </div>
      <div class="stat">
        <div class="stat-num">${formatNumber(s.new_30d)}</div>
        <div class="stat-label">New · last 30d</div>
      </div>
    </div>
  </section>

  <section>
    <div class="section-label">Sign-in methods</div>
    <div class="grid">
      <div class="stat">
        <div class="stat-num">${formatNumber(s.apple_signin)}</div>
        <div class="stat-label">Sign in with Apple</div>
      </div>
      <div class="stat">
        <div class="stat-num">${formatNumber(s.google_signin)}</div>
        <div class="stat-label">Sign in with Google</div>
      </div>
      <div class="stat">
        <div class="stat-num">${formatNumber(s.total_users - s.apple_signin - s.google_signin)}</div>
        <div class="stat-label">Email + password</div>
      </div>
    </div>
  </section>

  <section>
    <div class="section-label">Activity</div>
    <div class="grid">
      <div class="stat stat-money">
        <div class="stat-num accent">${escapeHtml(formatMoney(s.gmv_24h_cents))}</div>
        <div class="stat-label">GMV · last 24h · ${formatNumber(s.orders_24h)} orders</div>
        <div class="stat-split">
          <span class="k">Cash <span class="v">${escapeHtml(formatMoney(s.gmv_24h_cash_cents))}</span></span>
          <span class="k">Card <span class="v">${escapeHtml(formatMoney(s.gmv_24h_card_cents))}</span></span>
        </div>
      </div>
      <div class="stat stat-money">
        <div class="stat-num accent">${escapeHtml(formatMoney(s.gmv_7d_cents))}</div>
        <div class="stat-label">GMV · last 7d · ${formatNumber(s.orders_7d)} orders</div>
        <div class="stat-split">
          <span class="k">Cash <span class="v">${escapeHtml(formatMoney(s.gmv_7d_cash_cents))}</span></span>
          <span class="k">Card <span class="v">${escapeHtml(formatMoney(s.gmv_7d_card_cents))}</span></span>
        </div>
      </div>
      <div class="stat">
        <div class="stat-num">${formatNumber(s.receipts_7d)}</div>
        <div class="stat-label">Receipts sent · last 7d</div>
      </div>
    </div>
  </section>

  <footer>
    <div>as of ${escapeHtml(now)}</div>
    <div>api.ospos.app · v1.1.2</div>
  </footer>
</div>
</body>
</html>`;
}

// GET /admin/:token/stats
// Renders a self-refreshing HTML dashboard. Token in URL path (not header) so
// Phil can bookmark the URL on his phone / laptop and just tap to check.
router.get('/:token/stats', async (req: Request, res: Response): Promise<void> => {
  const tokenParam = typeof req.params.token === 'string' ? req.params.token : '';
  if (!tokenOk(tokenParam)) {
    res.status(404).send('Not Found');
    return;
  }
  try {
    const s = await fetchStats();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.send(renderPage(s));
  } catch (err) {
    console.error('[ADMIN] Stats query failed:', err);
    res.status(500).send('Internal Server Error');
  }
});

// GET /admin/:token/stats.json — same data as JSON, for scripting
router.get('/:token/stats.json', async (req: Request, res: Response): Promise<void> => {
  const tokenParam = typeof req.params.token === 'string' ? req.params.token : '';
  if (!tokenOk(tokenParam)) {
    res.status(404).json({ error: 'Not Found' });
    return;
  }
  try {
    const s = await fetchStats();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.json({ ...s, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[ADMIN] Stats query failed:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;

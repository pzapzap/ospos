// TTPOi launch email — Apple-approved copy and structure
// Based on Apple's Lifecycle Email "Launch" template (Small variant)

const LEGAL_DISCLAIMER =
  'Tap to Pay on iPhone requires a supported payment app and the latest version of iOS. ' +
  'Update to the latest version by going to Settings > General > Software Update. ' +
  'Tap Download and Install. Some contactless cards may not be accepted. ' +
  'Transaction limits may apply. The Contactless Symbol is a trademark owned by and used ' +
  'with permission of EMVCo, LLC. Tap to Pay on iPhone is not available in all markets. ' +
  'For Tap to Pay on iPhone countries and regions, see ' +
  '<a href="https://developer.apple.com/tap-to-pay/regions/" style="color:#0071e3">developer.apple.com/tap-to-pay/regions</a>.';

export function buildTTPOiLaunchEmail(businessName: string): { subject: string; html: string } {
  const subject = 'Tap to Pay on iPhone is now available with OSPOS';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1d1d1f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto">

  <!-- Header -->
  <tr><td style="padding:32px 32px 0;text-align:left">
    <p style="margin:0 0 4px;font-size:13px;color:#86868b">OSPOS</p>
    <h1 style="margin:0 0 16px;font-size:28px;font-weight:700;line-height:1.1">Tap to Pay on iPhone</h1>
    <p style="margin:0 0 8px;font-size:20px;color:#86868b;font-weight:400;line-height:1.3">Accept contactless payments right on your iPhone.</p>
    <p style="margin:0 0 24px;font-size:15px;color:#1d1d1f;line-height:1.5">
      Tap to Pay on iPhone is now available with OSPOS.&#x25E6;
      That means you can accept all types of in-person, contactless payments&mdash;from physical debit
      and credit cards to Apple Pay and other digital wallets. Right on your iPhone.
    </p>
    <a href="https://ospos.app" style="display:inline-block;padding:12px 24px;border:1px solid #1d1d1f;border-radius:24px;color:#1d1d1f;text-decoration:none;font-size:15px;font-weight:500">Open OSPOS</a>
  </td></tr>

  <!-- Divider -->
  <tr><td style="padding:32px 32px"><hr style="border:none;border-top:1px solid #d2d2d7;margin:0"/></td></tr>

  <!-- Benefit 1: Expand -->
  <tr><td style="padding:0 32px 32px">
    <p style="margin:0 0 8px;font-size:28px">&#x2714;&#xFE0E;</p>
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;line-height:1.2">Expand where you do business.</h2>
    <p style="margin:0;font-size:15px;color:#86868b;line-height:1.5">
      Reach more customers, accept payments on the go, and explore new setups, like line busting.
      All you need is your iPhone.
    </p>
  </td></tr>

  <!-- Divider -->
  <tr><td style="padding:0 32px 32px"><hr style="border:none;border-top:1px solid #d2d2d7;margin:0"/></td></tr>

  <!-- Benefit 2: Streamline -->
  <tr><td style="padding:0 32px 32px">
    <p style="margin:0 0 8px;font-size:28px">&#x1F4F6;</p>
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;line-height:1.2">Streamline checkout with no additional hardware.</h2>
    <p style="margin:0;font-size:15px;color:#86868b;line-height:1.5">
      Tap to Pay on iPhone is easy to set up and use. No additional equipment required.
    </p>
  </td></tr>

  <!-- Divider -->
  <tr><td style="padding:0 32px 32px"><hr style="border:none;border-top:1px solid #d2d2d7;margin:0"/></td></tr>

  <!-- Benefit 3: Privacy -->
  <tr><td style="padding:0 32px 32px">
    <p style="margin:0 0 8px;font-size:28px">&#x1F512;</p>
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;line-height:1.2">Privacy and security built in.</h2>
    <p style="margin:0;font-size:15px;color:#86868b;line-height:1.5">
      Tap to Pay on iPhone uses the built-in security and privacy features of iPhone to help protect
      your business and customer data. When a payment is processed, Apple doesn&rsquo;t store card numbers
      on the device or on Apple servers.
    </p>
  </td></tr>

  <!-- Divider -->
  <tr><td style="padding:0 32px 32px"><hr style="border:none;border-top:1px solid #d2d2d7;margin:0"/></td></tr>

  <!-- How to get started -->
  <tr><td style="padding:0 32px 32px">
    <h2 style="margin:0 0 20px;font-size:22px;font-weight:700;line-height:1.2">Get started in a few steps.</h2>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
      <tr>
        <td style="vertical-align:top;padding-right:12px">
          <span style="display:inline-block;width:28px;height:28px;border:1px solid #86868b;border-radius:50%;text-align:center;line-height:28px;font-size:14px;color:#86868b">1</span>
        </td>
        <td style="vertical-align:middle;font-size:15px;line-height:1.5">Open the OSPOS app on your iPhone.</td>
      </tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
      <tr>
        <td style="vertical-align:top;padding-right:12px">
          <span style="display:inline-block;width:28px;height:28px;border:1px solid #86868b;border-radius:50%;text-align:center;line-height:28px;font-size:14px;color:#86868b">2</span>
        </td>
        <td style="vertical-align:middle;font-size:15px;line-height:1.5">Go to Settings and tap &ldquo;Set Up&rdquo; under Tap to Pay on iPhone.</td>
      </tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:4px">
      <tr>
        <td style="vertical-align:top;padding-right:12px">
          <span style="display:inline-block;width:28px;height:28px;border:1px solid #86868b;border-radius:50%;text-align:center;line-height:28px;font-size:14px;color:#86868b">3</span>
        </td>
        <td style="vertical-align:middle;font-size:15px;line-height:1.5">Accept in-person, contactless payments&mdash;right on iPhone.</td>
      </tr>
    </table>
  </td></tr>

  <!-- Legal disclaimer -->
  <tr><td style="padding:0 32px 32px">
    <p style="margin:0;font-size:11px;color:#86868b;line-height:1.5">
      &#x25E6; Legal Disclaimers<br/><br/>
      ${LEGAL_DISCLAIMER}
    </p>
  </td></tr>

</table>
</body>
</html>`;

  return { subject, html };
}

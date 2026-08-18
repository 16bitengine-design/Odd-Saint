// ---------------------------------------------------------------------------
// Odd Saint — Pesapal IPN registration (run ONCE, not part of any daily job)
//
// Pesapal requires your webhook URL to be registered before any checkout
// will work, and hands back an ipn_id you then use on every order request
// afterward. This script does that registration and prints the ID —
// copy it into Vercel as the PESAPAL_IPN_ID environment variable.
//
// Re-running this is harmless (Pesapal just returns a fresh registration),
// but you only need to do it once per site URL. If you ever change your
// domain, run it again and update PESAPAL_IPN_ID with the new value.
// ---------------------------------------------------------------------------

function baseUrl() {
  return process.env.PESAPAL_ENV === 'production'
    ? 'https://pay.pesapal.com/v3'
    : 'https://cybqa.pesapal.com/pesapalv3';
}

async function getAccessToken() {
  const consumerKey = process.env.PESAPAL_CONSUMER_KEY;
  const consumerSecret = process.env.PESAPAL_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) {
    throw new Error('Missing PESAPAL_CONSUMER_KEY or PESAPAL_CONSUMER_SECRET environment variable');
  }

  const res = await fetch(`${baseUrl()}/api/Auth/RequestToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ consumer_key: consumerKey, consumer_secret: consumerSecret }),
  });
  if (!res.ok) throw new Error(`Pesapal auth failed: ${await res.text()}`);

  const data = await res.json();
  if (!data.token) throw new Error(`Pesapal auth did not return a token: ${JSON.stringify(data)}`);
  return data.token;
}

async function registerIpnUrl(token, ipnUrl) {
  const res = await fetch(`${baseUrl()}/api/URLSetup/RegisterIPN`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ url: ipnUrl, ipn_notification_type: 'GET' }),
  });
  if (!res.ok) throw new Error(`Pesapal IPN registration failed: ${await res.text()}`);
  return res.json();
}

async function main() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    throw new Error('Missing NEXT_PUBLIC_SITE_URL environment variable');
  }
  const ipnUrl = `${siteUrl}/api/webhooks/pesapal`;

  console.log(`Registering IPN URL: ${ipnUrl}`);
  console.log(`Environment: ${process.env.PESAPAL_ENV === 'production' ? 'PRODUCTION' : 'sandbox'}`);

  const token = await getAccessToken();
  const result = await registerIpnUrl(token, ipnUrl);

  console.log('\n✅ Registration successful.\n');
  console.log('Full response:', JSON.stringify(result, null, 2));
  console.log(`\n────────────────────────────────────────────────────────`);
  console.log(`Copy this value into Vercel as PESAPAL_IPN_ID:`);
  console.log(`\n  ${result.ipn_id}\n`);
  console.log(`────────────────────────────────────────────────────────`);
}

main().catch((err) => {
  console.error('\n❌ Registration failed:', err.message);
  process.exit(1);
});

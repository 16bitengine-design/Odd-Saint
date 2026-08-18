// ---------------------------------------------------------------------------
// Pesapal API 3.0 — redirect-based checkout (like Stripe/Flutterwave were).
// Supports cards (Visa/Mastercard) and East African mobile money (M-Pesa,
// Airtel Money) through one hosted payment page. Used as the fallback when
// PawaPay doesn't cover the customer's country/network, and as the general
// card-payment path.
//
// Pesapal's flow has one extra one-time setup step other providers don't
// need: you must register a webhook ("IPN") URL and get back an ipn_id
// BEFORE you can submit any order — see registerIpnUrl() below and the
// setup note in the route that uses it.
// ---------------------------------------------------------------------------

function baseUrl(): string {
  return process.env.PESAPAL_ENV === 'production'
    ? 'https://pay.pesapal.com/v3'
    : 'https://cybqa.pesapal.com/pesapalv3';
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/** Pesapal bearer tokens are short-lived (~5 min) — cached in-process to avoid re-authenticating on every call within that window. */
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

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

  cachedToken = { token: data.token, expiresAt: Date.now() + 4 * 60 * 1000 }; // refresh a minute early
  return data.token;
}

/**
 * One-time setup call — registers your IPN (webhook) URL with Pesapal and
 * returns an ipn_id. Run this once (e.g. by temporarily hitting this
 * function from a scratch script, or calling it manually), then store the
 * resulting ID as the PESAPAL_IPN_ID environment variable. Re-registering
 * on every checkout request would work but is wasteful — Pesapal expects
 * this to be a one-time setup step, not a per-transaction one.
 */
export async function registerIpnUrl(ipnUrl: string): Promise<string> {
  const token = await getAccessToken();
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
  const data = await res.json();
  return data.ipn_id;
}

export interface SubmitOrderResult {
  orderTrackingId: string;
  redirectUrl: string;
}

export async function submitOrder(params: {
  merchantReference: string;
  amountUsd: number;
  description: string;
  callbackUrl: string;
  email: string;
}): Promise<SubmitOrderResult> {
  const ipnId = process.env.PESAPAL_IPN_ID;
  if (!ipnId) {
    throw new Error(
      'Missing PESAPAL_IPN_ID environment variable — run the one-time IPN registration first (see registerIpnUrl in this file).'
    );
  }

  const token = await getAccessToken();

  const res = await fetch(`${baseUrl()}/api/Transactions/SubmitOrderRequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      id: params.merchantReference,
      currency: 'USD',
      amount: params.amountUsd,
      description: params.description,
      callback_url: params.callbackUrl,
      notification_id: ipnId,
      billing_address: { email_address: params.email },
    }),
  });

  if (!res.ok) throw new Error(`Pesapal order submission failed: ${await res.text()}`);

  const data = await res.json();
  if (!data.redirect_url) {
    throw new Error(`Pesapal did not return a redirect URL: ${JSON.stringify(data)}`);
  }

  return { orderTrackingId: data.order_tracking_id, redirectUrl: data.redirect_url };
}

export async function getTransactionStatus(orderTrackingId: string): Promise<any> {
  const token = await getAccessToken();
  const res = await fetch(
    `${baseUrl()}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
  );
  if (!res.ok) throw new Error(`Pesapal status check failed: ${await res.text()}`);
  return res.json();
}

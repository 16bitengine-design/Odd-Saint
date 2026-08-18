import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// PawaPay — direct mobile money deposits across Africa, no redirect. The
// customer enters their phone number in OUR OWN checkout UI; we submit a
// deposit request, PawaPay pushes an approval prompt (PIN entry) straight
// to their phone via the network operator, and we poll/receive a webhook
// for the result.
//
// IMPORTANT — VERIFY BEFORE RELYING ON THIS: the correspondent codes below
// (which country+network combination maps to which PawaPay identifier) are
// a best-effort list from public documentation/community sources, not a
// live-verified pull from PawaPay's own API. A wrong code here fails
// loudly (PawaPay rejects the deposit request outright), which is safer
// than the league-ID situation, but still — check the current correspondent
// list in your PawaPay dashboard before treating this as production-ready,
// and add/correct entries as needed.
// ---------------------------------------------------------------------------

export interface Correspondent {
  code: string;
  label: string;
}

export const COUNTRY_CORRESPONDENTS: Record<string, Correspondent[]> = {
  ZM: [
    { code: 'MTN_MOMO_ZMB', label: 'MTN Mobile Money' },
    { code: 'AIRTEL_OAPI_ZMB', label: 'Airtel Money' },
  ],
  KE: [{ code: 'MPESA_KEN', label: 'M-Pesa' }],
  UG: [
    { code: 'MTN_MOMO_UGA', label: 'MTN Mobile Money' },
    { code: 'AIRTEL_OAPI_UGA', label: 'Airtel Money' },
  ],
  GH: [
    { code: 'MTN_MOMO_GHA', label: 'MTN Mobile Money' },
    { code: 'VODAFONE_GHA', label: 'Vodafone Cash' },
    { code: 'AIRTELTIGO_GHA', label: 'AirtelTigo Money' },
  ],
  RW: [
    { code: 'MTN_MOMO_RWA', label: 'MTN Mobile Money' },
    { code: 'AIRTEL_OAPI_RWA', label: 'Airtel Money' },
  ],
  TZ: [
    { code: 'VODACOM_TZN', label: 'M-Pesa (Vodacom)' },
    { code: 'TIGO_TZN', label: 'Tigo Pesa' },
    { code: 'AIRTEL_OAPI_TZN', label: 'Airtel Money' },
  ],
  MW: [
    { code: 'AIRTEL_OAPI_MWI', label: 'Airtel Money' },
    { code: 'TNM_MWI', label: 'TNM Mpamba' },
  ],
};

export function getCorrespondentsForCountry(countryCode: string): Correspondent[] {
  return COUNTRY_CORRESPONDENTS[countryCode.toUpperCase()] ?? [];
}

export function isPawaPaySupportedCountry(countryCode: string): boolean {
  return getCorrespondentsForCountry(countryCode).length > 0;
}

function baseUrl(): string {
  // PawaPay provides separate sandbox and production hosts — swap via env
  // var so testing doesn't risk touching the live endpoint.
  return process.env.PAWAPAY_ENV === 'production'
    ? 'https://api.pawapay.io'
    : 'https://api.sandbox.pawapay.io';
}

export interface InitiateDepositResult {
  depositId: string;
  status: string; // 'ACCEPTED' | 'REJECTED' | ...
  rejectionReason?: string;
}

/**
 * Kicks off a deposit — this returns almost immediately with just an
 * ACCEPTED/REJECTED acknowledgment that the request reached the network.
 * The actual payment result (did the customer approve on their phone)
 * arrives later via the configured callback URL, or by polling
 * checkDepositStatus.
 */
export async function initiateDeposit(params: {
  amountUsd: number;
  correspondent: string;
  phoneNumber: string; // MSISDN, digits only, country code included, no leading +
  statementDescription: string;
}): Promise<InitiateDepositResult> {
  const apiToken = process.env.PAWAPAY_API_TOKEN;
  if (!apiToken) throw new Error('Missing PAWAPAY_API_TOKEN environment variable');

  const depositId = randomUUID();

  const res = await fetch(`${baseUrl()}/deposits`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      depositId,
      amount: params.amountUsd.toFixed(2),
      currency: 'USD',
      correspondent: params.correspondent,
      payer: { type: 'MSISDN', address: { value: params.phoneNumber } },
      customerTimestamp: new Date().toISOString(),
      statementDescription: params.statementDescription.slice(0, 22), // PawaPay caps this field's length
    }),
  });

  if (!res.ok) {
    throw new Error(`PawaPay deposit request failed: ${await res.text()}`);
  }

  const data = await res.json();
  return { depositId, status: data.status, rejectionReason: data.rejectionReason };
}

export async function checkDepositStatus(depositId: string): Promise<any> {
  const apiToken = process.env.PAWAPAY_API_TOKEN;
  if (!apiToken) throw new Error('Missing PAWAPAY_API_TOKEN environment variable');

  const res = await fetch(`${baseUrl()}/deposits/${depositId}`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  if (!res.ok) throw new Error(`PawaPay status check failed: ${await res.text()}`);
  return res.json();
}

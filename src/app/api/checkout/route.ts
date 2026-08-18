import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { PLANS, isValidPlanId, SAINTS_LOCK_PLANS, isValidSaintsLockPlanId } from '@/lib/plans';
import { isPawaPaySupportedCountry, getCorrespondentsForCountry, initiateDeposit } from '@/lib/pawapay';
import { submitOrder } from '@/lib/pesapal';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

// ---------------------------------------------------------------------------
// POST /api/checkout
// Body: {
//   product: 'subscription' | 'saints_lock',
//   plan: string,
//   userId: string,
//   email: string,
//   countryCode: string (ISO 3166-1 alpha-2, e.g. 'KE'),
//   phoneNumber: string,
//   correspondent?: string (which network — required if the country has more than one option)
// }
//
// ONE unified checkout screen on the frontend; this route decides the split
// on the backend:
//   - If the country/network is covered by PawaPay, use it — direct STK
//     push straight to the customer's phone, no redirect away from the app.
//     Returns { provider: 'pawapay', depositId } — frontend then polls
//     /api/checkout/status for the result.
//   - Otherwise, fall back to Pesapal's hosted redirect page (also covers
//     card payments). Returns { provider: 'pesapal', url }.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  let body: {
    product?: string;
    plan?: string;
    userId?: string;
    email?: string;
    countryCode?: string;
    phoneNumber?: string;
    correspondent?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { product, plan, userId, email, countryCode, phoneNumber, correspondent } = body;

  if (product !== 'subscription' && product !== 'saints_lock') {
    return NextResponse.json({ error: 'Invalid product' }, { status: 400 });
  }
  if (!plan) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }
  if (!userId || !email) {
    return NextResponse.json({ error: 'Must be signed in to purchase' }, { status: 401 });
  }
  if (!countryCode) {
    return NextResponse.json({ error: 'Country is required' }, { status: 400 });
  }

  const planConfig =
    product === 'subscription'
      ? isValidPlanId(plan)
        ? PLANS[plan]
        : null
      : isValidSaintsLockPlanId(plan)
      ? SAINTS_LOCK_PLANS[plan]
      : null;

  if (!planConfig) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }

  try {
    if (isPawaPaySupportedCountry(countryCode)) {
      if (!phoneNumber) {
        return NextResponse.json({ error: 'Phone number is required for mobile money' }, { status: 400 });
      }

      const correspondents = getCorrespondentsForCountry(countryCode);
      const chosenCorrespondent = correspondent || correspondents[0]?.code;
      if (!chosenCorrespondent) {
        return NextResponse.json({ error: 'No mobile money network available for this country' }, { status: 400 });
      }

      const deposit = await initiateDeposit({
        amountUsd: planConfig.amountUsd,
        correspondent: chosenCorrespondent,
        phoneNumber,
        statementDescription: 'Odd Saint',
      });

      if (deposit.status !== 'ACCEPTED') {
        return NextResponse.json(
          { error: deposit.rejectionReason || 'Payment request was not accepted' },
          { status: 400 }
        );
      }

      await recordPendingTransaction({
        id: deposit.depositId,
        provider: 'pawapay',
        userId,
        email,
        product,
        plan,
      });

      return NextResponse.json({ provider: 'pawapay', depositId: deposit.depositId });
    }

    // Fallback: Pesapal's hosted redirect page (also handles card payments).
    const merchantReference = `oddsaint-${product}-${randomUUID()}`;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://odd-saint.vercel.app';

    const order = await submitOrder({
      merchantReference,
      amountUsd: planConfig.amountUsd,
      description: `Odd Saint — ${planConfig.label} plan`,
      callbackUrl: `${siteUrl}?checkout=return`,
      email,
    });

    await recordPendingTransaction({
      id: order.orderTrackingId,
      provider: 'pesapal',
      userId,
      email,
      product,
      plan,
    });

    return NextResponse.json({ provider: 'pesapal', url: order.redirectUrl });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[checkout] Failed to start checkout:', err);
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 });
  }
}

async function recordPendingTransaction(params: {
  id: string;
  provider: 'pawapay' | 'pesapal';
  userId: string;
  email: string;
  product: string;
  plan: string;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('pending_transactions').insert({
    id: params.id,
    provider: params.provider,
    user_id: params.userId,
    email: params.email,
    product: params.product,
    plan: params.plan,
  });
  if (error) throw error;
}

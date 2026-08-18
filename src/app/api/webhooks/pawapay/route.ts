
import { NextRequest, NextResponse } from 'next/server';
import { grantAccessForPayment } from '@/lib/grantAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

// ---------------------------------------------------------------------------
// POST /api/webhooks/pawapay
// Configure this as the callback URL in your PawaPay dashboard.
//
// NOTE ON AUTHENTICATION: unlike Stripe (HMAC signature) or Flutterwave
// (static secret hash), I don't have confirmed details on PawaPay's
// callback authentication scheme from available documentation. Check your
// PawaPay dashboard/docs for how they let you verify incoming callbacks
// (commonly either a shared secret header or an IP allowlist) and add that
// check here before going live — right now this trusts the payload
// structure but doesn't cryptographically verify the sender. The
// /api/checkout/status polling endpoint acts as a safety net that doesn't
// depend on this webhook alone, but this gap should still be closed.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  let event: any;
  try {
    event = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const payload = Array.isArray(event) ? event[0] : event;
  const depositId: string | undefined = payload?.depositId;
  const status: string | undefined = payload?.status;

  if (!depositId) {
    return NextResponse.json({ error: 'Missing depositId' }, { status: 400 });
  }

  if (status === 'COMPLETED') {
    try {
      const supabase = getSupabaseAdmin();
      const { data: pending } = await supabase
        .from('pending_transactions')
        .select('*')
        .eq('id', depositId)
        .maybeSingle();

      if (pending && pending.status === 'pending') {
        await grantAccessForPayment({
          product: pending.product,
          userId: pending.user_id,
          planId: pending.plan,
          email: pending.email,
        });
        await supabase.from('pending_transactions').update({ status: 'completed' }).eq('id', depositId);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[pawapay webhook] Failed to grant access:', err);
    }
  }

  return NextResponse.json({ received: true });
}

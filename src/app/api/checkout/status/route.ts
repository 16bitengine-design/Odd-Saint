
import { NextRequest, NextResponse } from 'next/server';
import { checkDepositStatus } from '@/lib/pawapay';
import { grantAccessForPayment } from '@/lib/grantAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

// ---------------------------------------------------------------------------
// GET /api/checkout/status?depositId=...
// The frontend polls this after initiating a PawaPay deposit, since there's
// no redirect to bounce back to — the customer approves via a PIN prompt on
// their own phone, out of band from our page entirely.
//
// This ALSO grants access directly if the deposit is confirmed complete,
// as a safety net alongside the webhook — either one succeeding is enough,
// and grantAccessForPayment's upsert makes doing it twice harmless.
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const depositId = req.nextUrl.searchParams.get('depositId');
  if (!depositId) {
    return NextResponse.json({ error: 'Missing depositId' }, { status: 400 });
  }

  try {
    const result = await checkDepositStatus(depositId);
    const status: string = Array.isArray(result) ? result[0]?.status : result?.status;

    if (status === 'COMPLETED') {
      const pending = await getPendingTransaction(depositId);
      if (pending && pending.status === 'pending') {
        await grantAccessForPayment({
          product: pending.product,
          userId: pending.user_id,
          planId: pending.plan,
          email: pending.email,
        });
        await markTransactionComplete(depositId);
      }
    }

    return NextResponse.json({ status: status ?? 'UNKNOWN' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[checkout status] Failed to check PawaPay deposit status:', err);
    return NextResponse.json({ error: 'Could not check payment status' }, { status: 500 });
  }
}

async function getPendingTransaction(id: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from('pending_transactions').select('*').eq('id', id).maybeSingle();
  return data;
}

async function markTransactionComplete(id: string) {
  const supabase = getSupabaseAdmin();
  await supabase.from('pending_transactions').update({ status: 'completed' }).eq('id', id);
}

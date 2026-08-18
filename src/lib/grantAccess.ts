import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { PLANS, isValidPlanId, SAINTS_LOCK_PLANS, isValidSaintsLockPlanId } from '@/lib/plans';

// ---------------------------------------------------------------------------
// Grants access after a verified successful payment. Used by both the
// Stripe and Flutterwave webhook handlers so the actual "what happens on a
// successful payment" logic only exists in one place.
// ---------------------------------------------------------------------------

export async function grantAccessForPayment(params: {
  product: string | undefined;
  userId: string | undefined;
  planId: string | undefined;
  email: string | undefined;
}): Promise<void> {
  const { product, userId, planId, email } = params;

  if (!userId || !planId) {
    // eslint-disable-next-line no-console
    console.warn('[grantAccess] Missing userId/planId, nothing granted:', params);
    return;
  }

  const supabase = getSupabaseAdmin();

  if (product === 'saints_lock') {
    if (!isValidSaintsLockPlanId(planId)) {
      // eslint-disable-next-line no-console
      console.warn('[grantAccess] Unrecognized Saint\'s Lock plan id:', planId);
      return;
    }
    const plan = SAINTS_LOCK_PLANS[planId];
    const expiresAt = new Date(Date.now() + plan.days * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('saints_lock_access')
      .upsert({ user_id: userId, email, active: true, expires_at: expiresAt });
    if (error) throw error;
    return;
  }

  // Default / 'subscription' product.
  if (!isValidPlanId(planId)) {
    // eslint-disable-next-line no-console
    console.warn('[grantAccess] Unrecognized subscription plan id:', planId);
    return;
  }
  const plan = PLANS[planId];
  const expiresAt = new Date(Date.now() + plan.days * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from('subscribers')
    .upsert({ user_id: userId, email, active: true, expires_at: expiresAt });
  if (error) throw error;
}

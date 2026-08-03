'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  fetchTickets,
  getTicketStatus,
  getTrialDaysRemaining,
  isWithinFreeTrial,
  getAnonymousTrialStart,
  type Ticket,
  type Match,
  type MatchStatus,
} from '@/lib/dataFetcher';

// ---------------------------------------------------------------------------
// Color tokens — Odd Saint brand
// ---------------------------------------------------------------------------
const COLORS = {
  bg: '#0a0a0a',
  surface: '#171717',
  surfaceAlt: '#1f1f1f',
  border: '#2a2a2a',
  emerald: '#10b981',
  red: '#ef4444',
  textPrimary: '#f5f5f5',
  textMuted: '#a3a3a3',
};

type UnlockMap = Record<string, boolean>; // ticketId -> unlocked via ad/purchase

// ---------------------------------------------------------------------------
// Small shared components
// ---------------------------------------------------------------------------

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: COLORS.emerald,
          color: '#04150f',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: 14,
          letterSpacing: '-0.02em',
        }}
      >
        OS
      </div>
      <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em', color: COLORS.textPrimary }}>
        ODD SAINT
      </span>
    </div>
  );
}

function IndemnificationNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div
      style={{
        background: COLORS.surfaceAlt,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 10,
        padding: compact ? '10px 12px' : '14px 16px',
        fontSize: compact ? 11 : 12.5,
        lineHeight: 1.5,
        color: COLORS.textMuted,
      }}
    >
      <strong style={{ color: COLORS.textPrimary }}>Hold-Harmless Indemnification Agreement.</strong>{' '}
      Odd Saint provides AI-generated statistical opinions on football outcomes, expressed only as
      an "AI Data Confidence Index" percentage — never as a guarantee. Sports outcomes are
      volatile and unpredictable. By using this platform you acknowledge that all decisions made on
      the basis of this content are your own responsibility, and you release Odd Saint, its
      operators, and affiliates from any and all liability for financial losses, damages, or claims
      arising from reliance on this content.
    </div>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: COLORS.emerald,
        border: `1px solid ${COLORS.emerald}55`,
        borderRadius: 999,
        padding: '2px 8px',
        whiteSpace: 'nowrap',
      }}
    >
      {value}% AI Confidence
    </span>
  );
}

function StatusDot({ status }: { status: MatchStatus }) {
  const color = status === 'green' ? COLORS.emerald : status === 'red' ? COLORS.red : '#525252';
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: 999,
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Ad components (Ad Engine wrapper) — swap the inner div for your real
// AdSense <ins> tag or affiliate banner snippet.
// ---------------------------------------------------------------------------

function AdSlot({ variant }: { variant: 'infeed' | 'anchor' }) {
  const isAnchor = variant === 'anchor';
  return (
    <div
      data-ad-slot={variant}
      style={{
        width: '100%',
        height: isAnchor ? 56 : 90,
        background: COLORS.surfaceAlt,
        border: `1px dashed ${COLORS.border}`,
        borderRadius: isAnchor ? 0 : 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: COLORS.textMuted,
        fontSize: 11,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
      }}
    >
      Ad Slot — {isAnchor ? 'Sticky Anchor' : 'In-Feed'}
    </div>
  );
}

function WatchAdOverlay({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [seconds, setSeconds] = useState(5);

  useEffect(() => {
    if (seconds <= 0) {
      onDone();
      return;
    }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds, onDone]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 14,
          padding: 24,
          width: '100%',
          maxWidth: 360,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 8 }}>Simulated video ad</div>
        <div
          style={{
            height: 140,
            borderRadius: 10,
            background: '#0d0d0d',
            border: `1px dashed ${COLORS.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 32,
            fontWeight: 800,
            color: COLORS.emerald,
            marginBottom: 14,
          }}
        >
          {seconds > 0 ? seconds : '✓'}
        </div>
        <div style={{ fontSize: 12.5, color: COLORS.textMuted, marginBottom: 16 }}>
          {seconds > 0
            ? `Selection unlocks in ${seconds}s...`
            : 'Selection unlocked! You can close this now.'}
        </div>
        <button
          onClick={onClose}
          disabled={seconds > 0}
          style={{
            width: '100%',
            padding: '10px 0',
            borderRadius: 8,
            border: 'none',
            fontWeight: 700,
            fontSize: 13,
            cursor: seconds > 0 ? 'not-allowed' : 'pointer',
            background: seconds > 0 ? COLORS.border : COLORS.emerald,
            color: seconds > 0 ? COLORS.textMuted : '#04150f',
          }}
        >
          {seconds > 0 ? 'Please wait...' : 'Close & Reveal'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ticket card (accordion) with red/green grading engine
// ---------------------------------------------------------------------------

function MatchRow({ match, blurred }: { match: Match; blurred: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 0',
        borderBottom: `1px solid ${COLORS.border}`,
        gap: 10,
        filter: blurred ? 'blur(5px)' : 'none',
        userSelect: blurred ? 'none' : 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <StatusDot status={match.status} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              color: COLORS.textPrimary,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {match.homeTeam} vs {match.awayTeam}
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted }}>
            {match.league} · {match.market}
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>{match.odds}</div>
        <ConfidenceBadge value={match.confidence} />
      </div>
    </div>
  );
}

function TicketCard({
  ticket,
  unlocked,
  trialActive,
  onWatchAd,
  onSubscribe,
  onPayPerTicket,
}: {
  ticket: Ticket;
  unlocked: boolean;
  trialActive: boolean;
  onWatchAd: (ticketId: string) => void;
  onSubscribe: () => void;
  onPayPerTicket: (ticketId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const overallStatus = getTicketStatus(ticket);
  const isLocked = !ticket.isFree && !trialActive && !unlocked;

  const borderColor =
    overallStatus === 'green' ? COLORS.emerald : overallStatus === 'red' ? COLORS.red : COLORS.border;

  const statusLabel =
    overallStatus === 'green' ? 'WON' : overallStatus === 'red' ? 'FAILED' : 'IN PLAY';

  return (
    <div
      style={{
        background: COLORS.surface,
        border: `1.5px solid ${borderColor}`,
        borderRadius: 14,
        padding: 16,
        marginBottom: 14,
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          color: 'inherit',
        }}
      >
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textPrimary }}>{ticket.label}</div>
          <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 }}>
            {ticket.matchCount} matches · odds {ticket.oddsRange} · total {ticket.totalOdds}x
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: '0.04em',
              padding: '3px 9px',
              borderRadius: 999,
              color:
                overallStatus === 'green' ? '#04150f' : overallStatus === 'red' ? '#1a0505' : COLORS.textMuted,
              background: borderColor,
            }}
          >
            {statusLabel}
          </span>
          <span style={{ color: COLORS.textMuted, fontSize: 12 }}>{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div style={{ marginTop: 14 }}>
          {isLocked ? (
            <div
              style={{
                position: 'relative',
                border: `1px dashed ${COLORS.border}`,
                borderRadius: 10,
                padding: 16,
              }}
            >
              <div style={{ filter: 'blur(4px)', pointerEvents: 'none' }}>
                {ticket.matches.slice(0, 2).map((m) => (
                  <MatchRow key={m.id} match={m} blurred />
                ))}
              </div>
              <div
                style={{
                  marginTop: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 12, color: COLORS.textMuted, textAlign: 'center' }}>
                  Your 30-day free trial has ended. Unlock this ticket:
                </div>
                <button
                  onClick={() => onWatchAd(ticket.id)}
                  style={{
                    padding: '10px 0',
                    borderRadius: 8,
                    border: 'none',
                    fontWeight: 700,
                    fontSize: 13,
                    background: COLORS.emerald,
                    color: '#04150f',
                    cursor: 'pointer',
                  }}
                >
                  ▶ Watch Ad to Reveal Selection
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => onPayPerTicket(ticket.id)}
                    style={{
                      flex: 1,
                      padding: '9px 0',
                      borderRadius: 8,
                      border: `1px solid ${COLORS.border}`,
                      fontWeight: 600,
                      fontSize: 12,
                      background: 'transparent',
                      color: COLORS.textPrimary,
                      cursor: 'pointer',
                    }}
                  >
                    Pay Micro-Fee
                  </button>
                  <button
                    onClick={onSubscribe}
                    style={{
                      flex: 1,
                      padding: '9px 0',
                      borderRadius: 8,
                      border: `1px solid ${COLORS.border}`,
                      fontWeight: 600,
                      fontSize: 12,
                      background: 'transparent',
                      color: COLORS.textPrimary,
                      cursor: 'pointer',
                    }}
                  >
                    Subscribe Monthly
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              {ticket.matches.map((m) => (
                <MatchRow key={m.id} match={m} blurred={false} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auth gate
// ---------------------------------------------------------------------------

function LoginModal({ onSent, onClose }: { onSent: (email: string) => void; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    if (!agreed || !email) return;
    setStatus('sending');
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) {
      setStatus('error');
      return;
    }
    setStatus('sent');
    onSent(email);
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <Logo />
        </div>
        <form
          onSubmit={handleLogin}
          style={{
            width: '100%',
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 14,
            padding: 20,
            position: 'relative',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              background: 'none',
              border: 'none',
              color: COLORS.textMuted,
              fontSize: 16,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>

          <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 14, paddingRight: 20 }}>
            Sign in with a magic link to sync your trial and unlocks across devices.
          </div>
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: `1px solid ${COLORS.border}`,
              background: COLORS.surfaceAlt,
              color: COLORS.textPrimary,
              fontSize: 13,
              marginBottom: 12,
              boxSizing: 'border-box',
            }}
          />

          <div style={{ marginBottom: 14 }}>
            <IndemnificationNotice compact />
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              fontSize: 12,
              color: COLORS.textMuted,
              marginBottom: 14,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            I have read and accept the Hold-Harmless Indemnification Agreement.
          </label>

          <button
            type="submit"
            disabled={!agreed || !email || status === 'sending'}
            style={{
              width: '100%',
              padding: '11px 0',
              borderRadius: 8,
              border: 'none',
              fontWeight: 700,
              fontSize: 13,
              cursor: !agreed || !email ? 'not-allowed' : 'pointer',
              background: !agreed || !email ? COLORS.border : COLORS.emerald,
              color: !agreed || !email ? COLORS.textMuted : '#04150f',
            }}
          >
            {status === 'sending' ? 'Sending link...' : 'Send Magic Link'}
          </button>

          {status === 'sent' && (
            <div style={{ marginTop: 10, fontSize: 12, color: COLORS.emerald, textAlign: 'center' }}>
              Check your inbox for the sign-in link.
            </div>
          )}
          {status === 'error' && (
            <div style={{ marginTop: 10, fontSize: 12, color: COLORS.red, textAlign: 'center' }}>
              Something went wrong. Please try again.
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Page() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [registeredAt, setRegisteredAt] = useState<string | null>(null);
  const [anonTrialStart, setAnonTrialStart] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [unlocks, setUnlocks] = useState<UnlockMap>({});
  const [adTicketId, setAdTicketId] = useState<string | null>(null);
  const [adReady, setAdReady] = useState(false);
  const [loading, setLoading] = useState(true);

  // Every visitor gets the 30-day trial immediately — no account required.
  // The clock starts on first visit and is stored locally on their device.
  useEffect(() => {
    setAnonTrialStart(getAnonymousTrialStart());
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const user = data.session?.user ?? null;
      setUserEmail(user?.email ?? null);
      setRegisteredAt(user?.created_at ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setUserEmail(user?.email ?? null);
      setRegisteredAt(user?.created_at ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    fetchTickets().then(setTickets);
  }, []);

  // Logged-in users get their trial tied to their account (registeredAt);
  // everyone else gets the anonymous, device-local trial start.
  const effectiveTrialStart = userEmail ? registeredAt : anonTrialStart;
  const trialActive = useMemo(() => isWithinFreeTrial(effectiveTrialStart), [effectiveTrialStart]);
  const daysLeft = useMemo(() => getTrialDaysRemaining(effectiveTrialStart), [effectiveTrialStart]);

  function handleWatchAd(ticketId: string) {
    setAdTicketId(ticketId);
    setAdReady(false);
  }

  function closeAdOverlay() {
    if (adTicketId) {
      setUnlocks((prev) => ({ ...prev, [adTicketId]: true }));
    }
    setAdTicketId(null);
    setAdReady(false);
  }

  function handlePayPerTicket(ticketId: string) {
    // Wire this up to your payment provider (Stripe, Paystack, etc.).
    // On success, mark the ticket unlocked for this session.
    setUnlocks((prev) => ({ ...prev, [ticketId]: true }));
  }

  function handleSubscribe() {
    // Wire this up to your subscription checkout flow.
    // eslint-disable-next-line no-alert
    alert('Redirect to subscription checkout goes here.');
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: COLORS.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: COLORS.textMuted,
          fontSize: 13,
        }}
      >
        Loading Odd Saint...
      </div>
    );
  }

  // Interleave an in-feed ad slot between the Bronze and Gold tickets.
  const feedItems: Array<{ kind: 'ticket'; ticket: Ticket } | { kind: 'ad' }> = [];
  tickets.forEach((t) => {
    feedItems.push({ kind: 'ticket', ticket: t });
    if (t.tier === 'bronze') feedItems.push({ kind: 'ad' });
  });

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, color: COLORS.textPrimary, paddingBottom: 76 }}>
      {/* Header */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: COLORS.bg,
          borderBottom: `1px solid ${COLORS.border}`,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Logo />
        {userEmail ? (
          <button
            onClick={() => supabase.auth.signOut()}
            style={{
              background: 'none',
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              padding: '6px 10px',
              color: COLORS.textMuted,
              fontSize: 11.5,
              cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        ) : (
          <button
            onClick={() => setShowLoginModal(true)}
            style={{
              background: 'none',
              border: `1px solid ${COLORS.emerald}55`,
              borderRadius: 8,
              padding: '6px 10px',
              color: COLORS.emerald,
              fontSize: 11.5,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Sign in
          </button>
        )}
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px' }}>
        {/* Trial banner */}
        <div
          style={{
            background: trialActive ? `${COLORS.emerald}1a` : COLORS.surfaceAlt,
            border: `1px solid ${trialActive ? COLORS.emerald + '55' : COLORS.border}`,
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 12.5,
            marginBottom: 14,
            color: trialActive ? COLORS.emerald : COLORS.textMuted,
          }}
        >
          {trialActive
            ? `Free trial active — ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining. Every ticket is unlocked, no account needed.`
            : 'Your free trial has ended. The Mega Day Ticket stays free forever — unlock premium tiers with an ad, a micro-fee, or a subscription.'}
        </div>

        <div style={{ marginBottom: 16 }}>
          <IndemnificationNotice />
        </div>

        {/* Ticket feed with in-feed ad injection */}
        {feedItems.map((item, idx) =>
          item.kind === 'ad' ? (
            <div key={`ad-${idx}`} style={{ marginBottom: 14 }}>
              <AdSlot variant="infeed" />
            </div>
          ) : (
            <TicketCard
              key={item.ticket.id}
              ticket={item.ticket}
              trialActive={trialActive}
              unlocked={!!unlocks[item.ticket.id]}
              onWatchAd={handleWatchAd}
              onSubscribe={handleSubscribe}
              onPayPerTicket={handlePayPerTicket}
            />
          )
        )}
      </div>

      {/* Sticky anchor ad banner */}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30 }}>
        <AdSlot variant="anchor" />
      </div>

      {/* Watch-ad-to-unlock overlay */}
      {adTicketId && (
        <WatchAdOverlay onDone={() => setAdReady(true)} onClose={closeAdOverlay} />
      )}

      {/* Optional sign-in modal — never blocks browsing, only opened by choice */}
      {showLoginModal && (
        <LoginModal
          onSent={(email) => {
            setUserEmail(email);
          }}
          onClose={() => setShowLoginModal(false)}
        />
      )}
    </div>
  );
}

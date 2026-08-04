'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  fetchTickets,
  getTicketStatus,
  getTrialDaysRemaining,
  isWithinFreeTrial,
  getAnonymousTrialStart,
  fetchPerformanceHistory,
  summarizeHistory,
  type Ticket,
  type Match,
  type MatchStatus,
  type DayPerformance,
} from '@/lib/dataFetcher';

// ---------------------------------------------------------------------------
// Color tokens — Odd Saint brand
// A functional, high-contrast palette in the style of mainstream sportsbook
// apps: clean white/grey surfaces, a bold saturated green as the primary
// brand color, and the standard win/loss/live traffic-light convention
// (green = won, red = lost, amber = still live) so ticket status reads at a
// glance without needing to read the label text.
// ---------------------------------------------------------------------------
const COLORS = {
  bg: '#f4f6f5',
  surface: '#ffffff',
  surfaceAlt: '#eef1ef',
  border: '#d7dedb',
  hairline: '#c3ccc7',
  emerald: '#0b8a4f',
  gold: '#b8860b',
  amber: '#e08e00',
  red: '#d3321f',
  textPrimary: '#12241c',
  textMuted: '#5c6b63',
};

const SURFACE_GRADIENT = COLORS.surface; // flat surfaces — bookmaker UIs favor clean flat cards over gradients
const FONT_DISPLAY = 'var(--font-body), system-ui, -apple-system, sans-serif';
const FONT_BODY = 'var(--font-body), system-ui, -apple-system, sans-serif';

type UnlockMap = Record<string, boolean>; // ticketId -> unlocked via ad/purchase

// ---------------------------------------------------------------------------
// Small shared components
// ---------------------------------------------------------------------------

function Logo({ light = false }: { light?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 7,
          background: light ? '#ffffff' : COLORS.emerald,
          color: light ? COLORS.emerald : '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 14,
          letterSpacing: '-0.01em',
        }}
      >
        OS
      </div>
      <span
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 19,
          letterSpacing: '-0.01em',
          color: light ? '#ffffff' : COLORS.textPrimary,
        }}
      >
        Odd Saint
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
        borderTop: `1px solid ${COLORS.hairline}`,
        borderRadius: 10,
        padding: compact ? '10px 12px' : '14px 16px',
        fontSize: compact ? 11 : 12.5,
        lineHeight: 1.6,
        color: COLORS.textMuted,
      }}
    >
      <strong style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, color: COLORS.textPrimary }}>
        Hold-Harmless Indemnification Agreement.
      </strong>{' '}
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
        fontFamily: FONT_BODY,
        fontSize: 10.5,
        fontWeight: 600,
        color: COLORS.emerald,
        background: 'rgba(16,185,129,0.08)',
        border: `1px solid ${COLORS.emerald}40`,
        borderRadius: 999,
        padding: '3px 9px',
        whiteSpace: 'nowrap',
        letterSpacing: '0.01em',
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
        height: isAnchor ? 58 : 90,
        background: COLORS.surfaceAlt,
        border: `1px dashed ${COLORS.border}`,
        borderTop: isAnchor ? `1px solid ${COLORS.hairline}` : `1px dashed ${COLORS.border}`,
        borderRadius: isAnchor ? 0 : 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: COLORS.textMuted,
        fontFamily: FONT_BODY,
        fontSize: 10.5,
        letterSpacing: '0.08em',
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
          background: SURFACE_GRADIENT,
          border: `1px solid ${COLORS.hairline}`,
          borderRadius: 16,
          padding: 26,
          width: '100%',
          maxWidth: 360,
          textAlign: 'center',
          boxShadow: '0 20px 60px -20px rgba(0,0,0,0.6)',
        }}
      >
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 15,
            fontWeight: 600,
            color: COLORS.textPrimary,
            marginBottom: 10,
          }}
        >
          Simulated video ad
        </div>
        <div
          style={{
            height: 140,
            borderRadius: 12,
            background: '#0d0d0d',
            border: `1px dashed ${COLORS.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: FONT_DISPLAY,
            fontSize: 34,
            fontWeight: 600,
            color: COLORS.emerald,
            marginBottom: 16,
          }}
        >
          {seconds > 0 ? seconds : '✓'}
        </div>
        <div style={{ fontSize: 12.5, color: COLORS.textMuted, marginBottom: 18 }}>
          {seconds > 0
            ? `Selection unlocks in ${seconds}s...`
            : 'Selection unlocked! You can close this now.'}
        </div>
        <button
          onClick={onClose}
          disabled={seconds > 0}
          style={{
            width: '100%',
            padding: '11px 0',
            borderRadius: 9,
            border: 'none',
            fontFamily: FONT_BODY,
            fontWeight: 600,
            fontSize: 13,
            cursor: seconds > 0 ? 'not-allowed' : 'pointer',
            background: seconds > 0 ? COLORS.border : `linear-gradient(135deg, ${COLORS.emerald}, #0d9668)`,
            color: seconds > 0 ? COLORS.textMuted : '#04150f',
            transition: 'background 0.2s ease',
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
        padding: '11px 0',
        borderBottom: `1px solid ${COLORS.border}`,
        gap: 10,
        filter: blurred ? 'blur(5px)' : 'none',
        userSelect: blurred ? 'none' : 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <StatusDot status={match.status} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: FONT_BODY,
              fontSize: 13,
              fontWeight: 500,
              color: COLORS.textPrimary,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {match.homeTeam} vs {match.awayTeam}
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 1 }}>
            {match.league} · {match.market}
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 14,
            fontWeight: 800,
            color: COLORS.emerald,
            background: 'rgba(11,138,79,0.1)',
            borderRadius: 6,
            padding: '3px 9px',
            display: 'inline-block',
          }}
        >
          {match.odds}
        </div>
        <div style={{ marginTop: 4 }}>
          <ConfidenceBadge value={match.confidence} />
        </div>
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
    overallStatus === 'green' ? COLORS.emerald : overallStatus === 'red' ? COLORS.red : COLORS.amber;

  const statusLabel =
    overallStatus === 'green' ? 'WON' : overallStatus === 'red' ? 'FAILED' : 'IN PLAY';

  return (
    <div
      style={{
        position: 'relative',
        background: SURFACE_GRADIENT,
        border: `1px solid ${borderColor}`,
        borderRadius: 14,
        padding: '17px 16px 16px',
        marginBottom: 14,
        overflow: 'hidden',
        boxShadow: `0 0 0 1px ${borderColor}33`,
      }}
    >
      {/* Status indicator bar — solid color, no decorative animation, so
          win/loss/live reads instantly at a glance. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: borderColor,
        }}
      />

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
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16.5, fontWeight: 600, color: COLORS.textPrimary }}>
              {ticket.label}
            </div>
            {ticket.slipLabel && (
              <span
                style={{
                  fontFamily: FONT_BODY,
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: COLORS.emerald,
                  background: 'rgba(11,138,79,0.1)',
                  borderRadius: 999,
                  padding: '1px 7px',
                }}
              >
                Slip {ticket.slipLabel}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 3 }}>
            {ticket.matchCount} matches · odds {ticket.oddsRange} · total{' '}
            <span style={{ color: COLORS.emerald, fontWeight: 700 }}>{ticket.totalOdds}x</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            className={overallStatus === 'pending' ? 'live-pulse' : undefined}
            style={{
              fontFamily: FONT_BODY,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              padding: '4px 10px',
              borderRadius: 999,
              color: overallStatus === 'green' ? '#04150f' : overallStatus === 'red' ? '#2a0808' : '#3d2900',
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
                <div
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: 12.5,
                    color: COLORS.textMuted,
                    textAlign: 'center',
                  }}
                >
                  Your 30-day free trial has ended. Unlock this ticket:
                </div>
                <button
                  onClick={() => onWatchAd(ticket.id)}
                  style={{
                    padding: '11px 0',
                    borderRadius: 9,
                    border: 'none',
                    fontFamily: FONT_BODY,
                    fontWeight: 600,
                    fontSize: 13,
                    background: `linear-gradient(135deg, ${COLORS.emerald}, #0d9668)`,
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
                      border: `1px solid ${COLORS.hairline}`,
                      fontFamily: FONT_BODY,
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
                      border: `1px solid ${COLORS.hairline}`,
                      fontFamily: FONT_BODY,
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
            background: SURFACE_GRADIENT,
            border: `1px solid ${COLORS.hairline}`,
            borderRadius: 14,
            padding: 22,
            position: 'relative',
            boxShadow: '0 20px 60px -20px rgba(0,0,0,0.6)',
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

          <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 14, paddingRight: 20, lineHeight: 1.5 }}>
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
              padding: '11px 12px',
              borderRadius: 8,
              border: `1px solid ${COLORS.border}`,
              background: COLORS.surfaceAlt,
              color: COLORS.textPrimary,
              fontFamily: FONT_BODY,
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
              lineHeight: 1.4,
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
              borderRadius: 9,
              border: 'none',
              fontFamily: FONT_BODY,
              fontWeight: 600,
              fontSize: 13,
              cursor: !agreed || !email ? 'not-allowed' : 'pointer',
              background:
                !agreed || !email ? COLORS.border : `linear-gradient(135deg, ${COLORS.emerald}, #0d9668)`,
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

function Hero({
  bronzeCount,
  goldCount,
  winRatePct,
  onViewHistory,
}: {
  bronzeCount: number;
  goldCount: number;
  winRatePct: number | null;
  onViewHistory: () => void;
}) {
  return (
    <div
      style={{
        borderRadius: 12,
        background: COLORS.emerald,
        padding: '20px 18px 18px',
        marginBottom: 18,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontFamily: FONT_BODY,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.75)',
          marginBottom: 6,
        }}
      >
        Today's Slate
      </div>
      <h1
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 23,
          lineHeight: 1.2,
          color: '#ffffff',
          margin: '0 0 8px',
        }}
      >
        Curated tickets, graded in the open.
      </h1>
      <p
        style={{
          fontFamily: FONT_BODY,
          fontSize: 12.5,
          color: 'rgba(255,255,255,0.85)',
          maxWidth: 360,
          margin: '0 auto 18px',
          lineHeight: 1.5,
        }}
      >
        Odd Saint offers football predictions only — not a betting operator,
        not financial advice. Every pick carries an AI confidence index,
        never a guarantee.
      </p>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 4,
        }}
      >
        {[
          { label: 'Bronze slips today', value: String(bronzeCount) },
          { label: 'Gold slips today', value: String(goldCount) },
          {
            label: '14-day win rate',
            value: winRatePct !== null ? `${winRatePct}%` : '—',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              background: 'rgba(255,255,255,0.14)',
              borderRadius: 8,
              padding: '8px 14px',
              minWidth: 96,
            }}
          >
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 800, color: '#ffffff' }}>
              {stat.value}
            </div>
            <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.75)', marginTop: 2, lineHeight: 1.3 }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onViewHistory}
        style={{
          marginTop: 10,
          background: 'none',
          border: 'none',
          color: '#ffffff',
          fontFamily: FONT_BODY,
          fontSize: 11.5,
          fontWeight: 700,
          cursor: 'pointer',
          textDecoration: 'underline',
          textUnderlineOffset: 3,
        }}
      >
        View performance history →
      </button>
    </div>
  );
}

function PerformanceHistory({ history }: { history: DayPerformance[] }) {
  if (history.length === 0) return null;
  return (
    <div
      style={{
        background: COLORS.surfaceAlt,
        border: `1px solid ${COLORS.border}`,
        borderTop: `1px solid ${COLORS.hairline}`,
        borderRadius: 12,
        padding: 14,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 14,
          fontWeight: 600,
          color: COLORS.textPrimary,
          marginBottom: 10,
        }}
      >
        Last {history.length} days
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {history.map((day) => {
          const decided = day.won + day.failed;
          const wonPct = decided > 0 ? (day.won / decided) * 100 : 0;
          return (
            <div key={day.date} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 74, fontSize: 11, color: COLORS.textMuted, flexShrink: 0 }}>
                {day.date.slice(5)}
              </div>
              <div
                style={{
                  flex: 1,
                  height: 8,
                  borderRadius: 999,
                  background: 'rgba(18,36,28,0.06)',
                  overflow: 'hidden',
                  display: 'flex',
                }}
              >
                {decided > 0 && (
                  <div
                    style={{
                      width: `${wonPct}%`,
                      background: COLORS.emerald,
                    }}
                  />
                )}
              </div>
              <div style={{ width: 78, fontSize: 10.5, color: COLORS.textMuted, textAlign: 'right', flexShrink: 0 }}>
                {day.winRatePct !== null ? `${day.winRatePct}% · ${day.ticketsGenerated}` : `${day.ticketsGenerated} live`}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 10, lineHeight: 1.5 }}>
        Win rate = won ÷ (won + failed) among that day's tickets. Ticket count shown after the dot.
      </div>
    </div>
  );
}

function Footer() {
  const [showLegal, setShowLegal] = useState(false);

  return (
    <div style={{ marginTop: 28, paddingTop: 18, borderTop: `1px solid ${COLORS.border}` }}>
      <button
        onClick={() => setShowLegal((s) => !s)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          color: COLORS.textMuted,
          fontFamily: FONT_BODY,
          fontSize: 11.5,
          cursor: 'pointer',
          textDecoration: 'underline',
          textUnderlineOffset: 3,
        }}
      >
        Legal & disclosures {showLegal ? '▲' : '▼'}
      </button>

      {showLegal && (
        <div style={{ marginTop: 12 }}>
          <IndemnificationNotice compact />
        </div>
      )}

      <div style={{ fontSize: 10.5, color: COLORS.textMuted, marginTop: 14, lineHeight: 1.5 }}>
        © {new Date().getFullYear()} Odd Saint.
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
  const [history, setHistory] = useState<DayPerformance[]>([]);
  const [showHistory, setShowHistory] = useState(false);
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
    fetchPerformanceHistory(14).then(setHistory);
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
          fontFamily: FONT_DISPLAY,
          fontSize: 14,
          letterSpacing: '0.02em',
        }}
      >
        Loading Odd Saint…
      </div>
    );
  }

  // Interleave a single in-feed ad slot right after the Bronze slips end
  // (there are now 5 of them) and before Gold begins.
  const feedItems: Array<{ kind: 'ticket'; ticket: Ticket } | { kind: 'ad' }> = [];
  const lastBronzeIndex = tickets.map((t) => t.tier).lastIndexOf('bronze');
  tickets.forEach((t, idx) => {
    feedItems.push({ kind: 'ticket', ticket: t });
    if (idx === lastBronzeIndex && lastBronzeIndex !== -1) feedItems.push({ kind: 'ad' });
  });

  const historySummary = summarizeHistory(history);
  const bronzeCountToday = tickets.filter((t) => t.tier === 'bronze').length;
  const goldCountToday = tickets.filter((t) => t.tier === 'gold').length;

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, color: COLORS.textPrimary, paddingBottom: 76 }}>
      {/* Header */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: COLORS.emerald,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Logo light />
        {userEmail ? (
          <button
            onClick={() => supabase.auth.signOut()}
            style={{
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.4)',
              borderRadius: 7,
              padding: '6px 12px',
              color: '#ffffff',
              fontFamily: FONT_BODY,
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        ) : (
          <button
            onClick={() => setShowLoginModal(true)}
            style={{
              background: '#ffffff',
              border: 'none',
              borderRadius: 7,
              padding: '6px 12px',
              color: COLORS.emerald,
              fontFamily: FONT_BODY,
              fontSize: 11.5,
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            Sign in
          </button>
        )}
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px' }}>
        <Hero
          bronzeCount={bronzeCountToday}
          goldCount={goldCountToday}
          winRatePct={historySummary.winRatePct}
          onViewHistory={() => setShowHistory((s) => !s)}
        />

        {showHistory && <PerformanceHistory history={history} />}

        {/* Trial banner */}
        <div
          style={{
            position: 'relative',
            background: trialActive ? 'rgba(16,185,129,0.08)' : COLORS.surfaceAlt,
            border: `1px solid ${trialActive ? COLORS.emerald + '40' : COLORS.border}`,
            borderRadius: 10,
            padding: '11px 14px',
            fontFamily: FONT_BODY,
            fontSize: 12.5,
            lineHeight: 1.5,
            marginBottom: 14,
            color: trialActive ? COLORS.emerald : COLORS.textMuted,
          }}
        >
          {trialActive
            ? `Free trial active — ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining. Every ticket is unlocked, no account needed.`
            : 'Your free trial has ended. The Mega Day Ticket stays free forever — unlock premium tiers with an ad, a micro-fee, or a subscription.'}
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

        <Footer />
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

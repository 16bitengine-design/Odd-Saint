import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';

// Single bold sans-serif family, used everywhere — headlines through data
// rows. Sportsbook/bookmaker interfaces prioritize fast scanning over
// editorial polish, so one consistent, heavily-weighted sans reads clearer
// at a glance than mixing in a display serif. Self-hosted at build time by
// next/font (no runtime request to Google, no extra npm package).
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Odd Saint — AI Football Prediction Tickets',
  description:
    'Curated football prediction tickets with AI-driven confidence ratings. Not financial or betting advice.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body
        style={{
          margin: 0,
          background: '#f4f6f5',
          fontFamily: 'var(--font-body), system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        }}
      >
        {/*
          Global styles kept as a plain <style> tag — no CSS-in-JS library,
          no framework, per the "native styling only" brief. Covers a couple
          of accessibility basics and the live/pending pulse used on
          in-play status indicators.
        */}
        <style>{`
          * { box-sizing: border-box; }
          ::selection { background: rgba(11,138,79,0.25); color: #12241c; }

          @keyframes livePulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.45; }
          }
          .live-pulse { animation: livePulse 1.6s ease-in-out infinite; }
          @media (prefers-reduced-motion: reduce) {
            .live-pulse { animation: none; }
          }

          button:focus-visible,
          input:focus-visible,
          a:focus-visible {
            outline: 2px solid #0b8a4f;
            outline-offset: 2px;
          }
        `}</style>
        {children}
      </body>
    </html>
  );
}

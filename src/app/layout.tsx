import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Fraunces, Inter } from 'next/font/google';

// Display serif — used sparingly for the wordmark, ticket tier names, and
// figures. Self-hosted at build time by next/font (no runtime request to
// Google, no extra npm package — stays true to the "ultra-lightweight" brief).
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600'],
  style: ['normal'],
  display: 'swap',
});

// Body/data sans — used for everything else, tuned for legibility on small
// mobile screens where odds and match data need to stay crisp.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Odd Saint — AI Football Prediction Tickets',
  description:
    'Curated football prediction tickets with AI-driven confidence ratings. Not financial or betting advice.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body
        style={{
          margin: 0,
          background: '#0a0a0a',
          fontFamily: 'var(--font-body), system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        }}
      >
        {/*
          Global styles kept as a plain <style> tag — no CSS-in-JS library,
          no framework, per the "native styling only" brief. This covers the
          "silk sheen" signature animation shared by the logo mark, ticket
          card hairlines, and modals, plus a couple of accessibility basics.
        */}
        <style>{`
          * { box-sizing: border-box; }
          ::selection { background: rgba(16,185,129,0.35); color: #f6f1e7; }

          @keyframes silkSweep {
            0% { background-position: 0% 0; }
            100% { background-position: 200% 0; }
          }
          .silk-sheen {
            animation: silkSweep 5s linear infinite;
          }
          @media (prefers-reduced-motion: reduce) {
            .silk-sheen { animation: none; }
          }

          button:focus-visible,
          input:focus-visible,
          a:focus-visible {
            outline: 2px solid #10b981;
            outline-offset: 2px;
          }
        `}</style>
        {children}
      </body>
    </html>
  );
}

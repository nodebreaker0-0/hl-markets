import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/Toaster';
import { BasketChip } from '@/components/BasketSheet';
import { AutobetTicker } from '@/components/AutobetTicker';

export const metadata: Metadata = {
  title: 'hl-markets — Hyperliquid governance explorer',
  description:
    'Public explorer for Hyperliquid validatorL1Vote governance — outcome, delisting, future variants. Polymarket-style detail, mobile-first, virtual polls, my delegation lookup. No backend key custody.',
};

// CSP is enforced only on production builds. Next.js dev (`next dev`) ships
// React-Refresh which uses `eval` for hot-reload — incompatible with a strict
// `script-src` policy. The production static export does not use eval.
//
// Constitution IX — host-agnostic: backend origin is whatever NEXT_PUBLIC_BACKEND_URL
// resolves to at build time. We inline it into connect-src so the deployed
// bundle locks itself to that one backend.
const IS_PROD = process.env.NODE_ENV === 'production';

const BACKEND_ORIGIN = (() => {
  try {
    const url = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';
    return new URL(url).origin;
  } catch {
    return 'http://localhost:3001';
  }
})();

const CSP_PROD =
  "default-src 'self'; " +
  `connect-src 'self' https://api.hyperliquid.xyz https://api.hyperliquid-testnet.xyz https://api.openai.com https://api.anthropic.com https://api.tavily.com https://api.coingecko.com https://api.football-data.org https://api.stlouisfed.org https://api.openweathermap.org ${BACKEND_ORIGIN}; ` +
  "script-src 'self' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; " +
  "object-src 'none'; " +
  "base-uri 'none'; " +
  "frame-ancestors 'none'";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        {IS_PROD && <meta httpEquiv="Content-Security-Policy" content={CSP_PROD} />}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className="min-h-screen bg-surface text-on-surface antialiased font-sans">
        <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-4 sm:py-6">{children}</div>
        <Toaster />
        <BasketChip />
        <AutobetTicker />
      </body>
    </html>
  );
}

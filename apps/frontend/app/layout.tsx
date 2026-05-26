import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'hl-gov — Hyperliquid governance explorer',
  description:
    'Public explorer for Hyperliquid validatorL1Vote governance — outcome, delisting, future variants. Polymarket-style detail, mobile-first, virtual polls, my delegation lookup. No backend key custody.',
};

// CSP — Constitution IX (host-agnostic) means backend host is NEXT_PUBLIC_BACKEND_URL.
// The CSP is built at runtime so the deployed bundle reflects whatever backend the
// build was pinned to. For mobile/desktop SSR-equivalent (static export), this
// resolves to the URL inlined at build time.
const BACKEND_ORIGIN = (() => {
  try {
    const url = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';
    return new URL(url).origin;
  } catch {
    return 'http://localhost:3001';
  }
})();

const CSP =
  "default-src 'self'; " +
  `connect-src 'self' https://api.hyperliquid.xyz https://api.hyperliquid-testnet.xyz ${BACKEND_ORIGIN}; ` +
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
        <meta httpEquiv="Content-Security-Policy" content={CSP} />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className="min-h-screen bg-hl-bg text-hl-text antialiased font-sans">
        <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-4 sm:py-6">{children}</div>
      </body>
    </html>
  );
}

'use client';

// Hero — Polymarket-style entry point. Three tabs follow:
//   - Pending: outcome governance the validators haven't passed yet
//   - Markets: outcome markets currently trading on Hyperliquid
//   - Historical: settled / expired outcome governance

export function Hero() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-divider bg-surface-elevated bg-hero-radial p-5 sm:p-7">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">
        Hyperliquid · prediction markets
      </p>
      <h1 className="mt-2 text-2xl font-bold leading-tight text-on-surface sm:text-3xl">
        Outcome markets <span className="text-primary">on Hyperliquid</span>.
      </h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-on-surface-muted">
        Browse HIP-4 outcome markets currently trading, see the governance
        actions queued to launch new ones, and dig into settled questions —
        all sourced from validator-level data. Read-only · no key custody.
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-on-surface-muted">
        <span className="rounded-full bg-surface px-2 py-0.5 ring-1 ring-divider">
          Polymarket-style multi-option
        </span>
        <span className="rounded-full bg-surface px-2 py-0.5 ring-1 ring-divider">
          Testnet + Mainnet
        </span>
        <span className="rounded-full bg-surface px-2 py-0.5 ring-1 ring-divider">
          Live orderbook & % chance
        </span>
      </div>
    </section>
  );
}

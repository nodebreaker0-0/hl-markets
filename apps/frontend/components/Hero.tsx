'use client';

// Polymarket-style hero — one or two trending markets above the fold.
// In Phase B this is a placeholder; Phase C feeds it the "closing soonest"
// outcome from validatorL1Votes.

export function Hero() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-hl-border bg-hl-surface bg-hero-radial p-5 sm:p-7">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-hl-mint">
        Live · Hyperliquid governance
      </p>
      <h1 className="mt-2 text-2xl font-bold leading-tight text-hl-text sm:text-3xl">
        Watch validator decisions <span className="text-hl-mint">in the open</span>.
      </h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-hl-subtle">
        Outcome registrations, delistings, settlements — all <code className="mono text-hl-text">validatorL1Vote</code>{' '}
        actions, with stake & count progress, voted validators by name, and a virtual
        poll for delegators. Mobile-first. Read-only. No key custody.
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-hl-subtle">
        <span className="rounded-full bg-hl-bg px-2 py-0.5 ring-1 ring-hl-border">
          Quorum: 20% stake / 50% count
        </span>
        <span className="rounded-full bg-hl-bg px-2 py-0.5 ring-1 ring-hl-border">
          Testnet + Mainnet
        </span>
        <span className="rounded-full bg-hl-bg px-2 py-0.5 ring-1 ring-hl-border">
          EIP-712 virtual polls
        </span>
      </div>
    </section>
  );
}

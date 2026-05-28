'use client';

// Phase X-052 — TradeFlow Step 2: confirm + sign.
// 사용자 review (outcome / side / amount / receive / fee) → Sign button →
// placeMarketBuy → /trade?...&step=3&fillId=...
//
// builder fee 정직 (HIP-4 buy=0). agent flow 우선 (Phase K).

import { useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import clsx from 'clsx';
import type { TradeContext } from '@/app/trade/page';
import { useSession } from '@/lib/use-session';
import { placeMarketBuy } from '@/lib/trade';
import { loadAgent } from '@/lib/agent';
import { EnableTradingModal } from '@/components/EnableTradingModal';
import { CURRENT_NETWORK } from '@/lib/network';
import { pushToast } from '@/lib/toast';

export function TradeStepConfirm({ ctx }: { ctx: TradeContext }): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { session } = useSession();

  const amountStr = sp.get('amount') ?? '0';
  const usdAmount = Number(amountStr);
  const sideIsYes = ctx.sideIdx === 0;

  const bestAsk = ctx.book?.asks[0];
  const bestBid = ctx.book?.bids[0];
  const askPx = bestAsk?.px ?? 0;
  const askSz = bestAsk?.sz ?? 0;
  const bidPx = bestBid?.px ?? 0;
  const shares = askPx > 0 ? Math.ceil(usdAmount / askPx) : 0;
  const winPayout = shares; // outcome 시장 — share 1개 = winner $1

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [needAgent, setNeedAgent] = useState(false);

  function goBack(): void {
    const params = new URLSearchParams(sp.toString());
    params.set('step', '1');
    router.push(`${pathname}?${params.toString()}`);
  }

  async function onSign(): Promise<void> {
    if (!session) {
      pushToast({ tone: 'error', message: 'Connect wallet first.' });
      return;
    }
    const agent = await loadAgent(session.address, CURRENT_NETWORK);
    if (!agent) {
      setNeedAgent(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const result = await placeMarketBuy({
        agent,
        wallet: session.address,
        network: CURRENT_NETWORK,
        assetId: ctx.assetId,
        usdAmount,
        bestAskPx: askPx,
        bestAskSz: askSz,
        bestBidPx: bidPx,
        asks: ctx.book?.asks,
        slippagePct: 2,
      });
      // 다음 step 으로. fillId 는 HF response 에 따라 추출 (resp.data.statuses[0].filled.oid 등)
      // 일단 placeholder 'ok' 로 step 3 로.
      const params = new URLSearchParams(sp.toString());
      params.set('step', '3');
      params.set('fillId', 'ok');
      router.push(`${pathname}?${params.toString()}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2xl">
      <section className="flex flex-col gap-md">
        <span className="text-caption uppercase tracking-widest text-on-surface-muted">
          Review your bet
        </span>
        <h1 className="text-h1 font-bold leading-tight text-on-surface">
          {ctx.outcomeName}
        </h1>
      </section>

      {/* Summary card */}
      <section className="flex flex-col gap-md rounded-lg bg-surface-elevated p-lg">
        <SummaryRow label="Side" value={ctx.sideName} accent={sideIsYes ? 'up' : 'down'} />
        <SummaryRow
          label="Bet"
          value={`$${usdAmount.toFixed(2)}`}
          big
        />
        <SummaryRow label="Current price" value={`${(askPx * 100).toFixed(1)}%`} mono />
        <SummaryRow label="You get" value={`${shares} shares`} mono />
        <div className="border-t border-divider pt-md">
          <SummaryRow
            label={ctx.sideName + ' wins → you receive'}
            value={`$${winPayout.toFixed(2)}`}
            mono
            big
            accent="up"
          />
        </div>
        <div className="text-[10px] text-on-surface-muted">
          IOC market at best ask + 2% slip · buy fee 0 (HIP-4) · sell fee 5 bps on close
        </div>
      </section>

      {err && (
        <div className="rounded-md border border-accent-down/40 bg-accent-down/10 px-base py-md text-body-sm text-accent-down">
          {err}
        </div>
      )}

      {/* Sticky bottom buttons */}
      <div className="sticky bottom-base mt-auto flex gap-sm sm:bottom-auto">
        <button
          type="button"
          onClick={goBack}
          disabled={busy}
          className="rounded-md bg-surface px-base py-md text-button font-semibold text-on-surface-muted transition-colors hover:bg-surface-elevated hover:text-on-surface disabled:opacity-40"
        >
          ← Edit
        </button>
        <button
          type="button"
          onClick={() => void onSign()}
          disabled={busy || !session}
          className={clsx(
            'flex-1 rounded-md px-base py-md text-button font-bold transition-colors',
            busy || !session
              ? 'cursor-not-allowed bg-divider text-on-surface-disabled'
              : 'bg-primary text-on-primary hover:bg-primary-bright',
          )}
        >
          {busy
            ? 'Signing & placing…'
            : !session
              ? 'Connect wallet first'
              : `Place bet · $${usdAmount.toFixed(0)}`}
        </button>
      </div>

      {needAgent && session && (
        <EnableTradingModal
          wallet={session.address}
          onDone={() => {
            setNeedAgent(false);
            void onSign();
          }}
          onCancel={() => setNeedAgent(false)}
        />
      )}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  big,
  mono,
  accent,
}: {
  label: string;
  value: string;
  big?: boolean;
  mono?: boolean;
  accent?: 'up' | 'down';
}): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-md">
      <span className="text-body-sm text-on-surface-muted">{label}</span>
      <span
        className={clsx(
          mono && 'mono tabular-nums',
          big ? 'text-h1 font-bold' : 'text-body-md font-semibold',
          accent === 'up' && 'text-accent-up',
          accent === 'down' && 'text-accent-down',
          !accent && 'text-on-surface',
        )}
      >
        {value}
      </span>
    </div>
  );
}

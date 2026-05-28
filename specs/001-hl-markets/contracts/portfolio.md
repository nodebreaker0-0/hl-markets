# Portfolio page — spec

> Phase J.8 — 사용자가 hl-markets 에서 산 outcome 자산을 한 화면에 모아 보고,
> 각 포지션을 cash out 할 수 있게 한다.
> Phase N (Polish 1-11): outcome-only filter, Cancel open order,
> Fill toast notification, multi-level walk-the-book, partial cash out
> slider 모두 landed.

---

## 1. 라우트
`/portfolio` — connected wallet 필수. wallet 없으면 sign-in 안내.

## 2. 페이지 구조

```
┌───────────────────────────────────────────┐
│ Portfolio · 0xef22…d5ac                   │
│ ┌──────────────────────────────────────┐  │
│ │ Total value: $XX.XX (+$Y / +Z%)      │  │
│ │ Cost basis: $XX.XX                   │  │
│ │ Realized P&L: $XX.XX                 │  │
│ └──────────────────────────────────────┘  │
│                                            │
│ ── HOLDINGS ──                            │
│ ┌──────────────────────────────────────┐  │
│ │ France · 2026 World Cup champion     │  │
│ │ 63 shares                            │  │
│ │ Entry: $30.52 · Now: $10.65 (-65%)   │  │
│ │ [ Cash out 63 shares ($10.65) ]      │  │
│ └──────────────────────────────────────┘  │
│ ┌──────────────────────────────────────┐  │
│ │ BELOW 4.3% Yes · May CPI             │  │
│ │ 30 shares                            │  │
│ │ Entry: $12.00 · Now: $— (no bid)     │  │
│ │ [ — ]                                 │  │
│ └──────────────────────────────────────┘  │
│                                            │
│ ── OPEN ORDERS ──                         │
│ • Buy 30 BELOW 4.3% @ 0.4 (resting)      │
│   [ Cancel ]                              │
│                                            │
│ ── RECENT FILLS ──                        │
│ 1h ago · Buy 63 France @ 0.4845 · $30.52 │
│ 2h ago · Buy 30 BELOW 4.3% @ 0.4 · $12   │
│ ...                                       │
└───────────────────────────────────────────┘
```

## 3. Data sources (모두 HF info endpoint)

| 영역 | endpoint | 필터 / 가공 |
|------|----------|-------------|
| Holdings | `spotClearinghouseState` | balances 중 `coin.startsWith('+')` 만 → outcome 자산 |
| Marks | `l2Book` (per asset) | best bid → cash-out 가격. 없으면 "no bid" |
| Open orders | `openOrders` | 그대로 |
| Fills | `userFills` | recent 20 |
| 이름 매핑 | `outcomeMeta` | 한 번만 fetch, in-memory cache. `+102490` → outcome 10249 → "France" |

## 4. PnL 계산

- **Unrealized**: `(현재 bid 가격 - entry 가격) × shares`. 보유 holding의 `entryNtl` 필드는 매수 시점의 누적 USDC 비용을 줌. shares × bestBid - entryNtl = unrealized.
- **Realized**: `userFills` 중 `dir: "Sell"` 모두 합산. `closedPnl` 필드 사용 (이미 HF 계산).
- 현재 bid가 없는 holding은 unrealized 계산 불가 → "—" 표시.

## 5. Cash out 동작

- 클릭 시 `placeMarketSell({ assetId, bestBidPx, sharesToSell, slippagePct: 2 })` 호출.
- **size = slider 또는 % input (0-100%)** of 보유 share — Polish 11 에서 partial cash out landed.
- limit price = `bestBidPx × (1 - slip/100)` (= 0.98 × bid). minimum tick은 outcome 별 다를 수 있음 — wire.ts 정규화.
- HL min notional 검증: `shares × bestBid ≥ $10`. 미달 시 disabled.
- agent privkey로 사인 (Phase K) → /trade-forward → 결과 toast (Polish 3).
- **Multi-level walk-the-book** — 단일 best bid 보다 큰 size 가 매도될 때 L2 의 second-level / third-level 도 활용 (Polish 9).
- **Builder fee 정직 표시** — HIP-4 sell 시 5 bps 부과 (Phase L finding). buy 시 0 (sell 가 아니므로 portfolio 의 buy modal 에선 "no fee").

## 6. UX 단순화 (Polymarket parity)

- buy fee 0 (HIP-4 outcome 시장 정책 — `contracts/revenue-model.md` 참조).
- sell fee 5 bps 명시 (sell confirm 모달 정직성, Constitution XI).
- 손익: 색깔 (mint / mainnet) 으로 + / - 구분.
- mobile-first, 카드 grid 1열.

## 7. 페이지 폴링

- holdings + open orders: 10초 마다 자동 refresh.
- recent fills: 30초 마다.
- 수동 refresh 버튼 헤더에.

## 8. Cancel open order (Polish 2)

- `/portfolio` 의 open order row 의 "Cancel" 클릭.
- `cancel` action 빌드 → agent privkey 사인 → `/trade-forward`.
- HF response status 가 `success` 이면 row 즉시 제거 + toast.

## 9. Open questions / 후속 작업

- ~~Partial cash out (전체 / 절반 / 사용자 정의)~~ → Polish 11 에서 landed.
- ~~Cancel open order~~ → Polish 2 에서 landed.
- Holding 클릭 시 해당 outcome market 으로 이동 — 거의 됨, 일부 row 만 missing link.
- 결제완료 (settled) 자산 별도 섹션 — payout 클레임 — Phase V+ 옵션.
- "P&L over time" 차트 — 후속 phase.
- 보유 outcome 의 자동 "Cash out at X% gain" — 옵트인 알람 (Phase O autobet 의 sell 모드, 일단 OUT).

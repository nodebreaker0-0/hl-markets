# Portfolio page — spec

> Phase J.8 — 사용자가 hl-markets 에서 산 outcome 자산을 한 화면에 모아 보고,
> 각 포지션을 cash out 할 수 있게 한다.

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
- size = 보유 share 전체 (partial cash out은 v2 — input 추가 필요).
- limit price = `bestBidPx × (1 - slip/100)` (= 0.98 × bid). minimum tick은 outcome 별 다를 수 있음 — wire.ts 정규화.
- HL min notional 검증: `shares × bestBid ≥ $10`. 미달 시 disabled.
- agent privkey로 사인 → /trade-forward → 결과 toast.

## 6. UX 단순화 (Polymarket parity)

- 빌더 fee 안내 hide (HIP-4 outcome 거래는 fee 부과되지 않음 — Agent A 조사 결과 #82).
- 손익: 색깔 (mint / mainnet) 으로 + / - 구분.
- mobile-first, 카드 grid 1열.

## 7. 페이지 폴링

- holdings + open orders: 10초 마다 자동 refresh.
- recent fills: 30초 마다.
- 수동 refresh 버튼 헤더에.

## 8. Open questions / 후속 작업

- Partial cash out (전체 / 절반 / 사용자 정의)
- Holding 클릭 시 해당 outcome market 으로 이동
- 결제완료 (settled) 자산 별도 섹션 — payout 클레임
- "P&L over time" 차트 — 후속 phase

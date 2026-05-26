# Contract: Outcome Market

> HIP-4 outcome contract — binary instruments that settle to 0 or 1 on event
> resolution. Run on HyperCore's standard orderbook + matching engine, sharing
> account & margin with spot/perp. **Canonical outcomes** (our case) are
> deployed + settled by validator vote (`O.registerTokensAndStandaloneOutcome`,
> `O.settle`, etc.) rather than a builder's 1M HYPE stake.
>
> Sources verified 2026-05-24:
> - HF docs: `hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets`
> - HF info endpoint `outcomeMeta` (verified on mainnet + testnet)
> - HF info `allMids` `#NNNN` keys (verified)
> - HF info `l2Book` with `coin` (verified)
> - app.hyperliquid.xyz/trade/`<slug>-<side>-<date>-<time>` URL pattern (UI reference)

---

## 1. Lifecycle (canonical outcome)

```
                ┌── (no quorum) ──→ expired ── persisted as historical, no market
governance ─────┤
(O.register)    └── (quorum) ────→ deployed
                                       │
                                       ↓ ~15-min single-price opening auction
                                  continuous orderbook trading (bounded 0.001~0.999)
                                       │
                                       ↓
                       ┌─ governance (O.settle) — validators vote on outcome ─┐
                       │                                                       ↓
                       └── (no quorum) ─→ keep trading (next round)         oracle posts 0|1
                                                                                ↓
                                                                          all positions settle in USDH
                                                                          historical (winner side recorded)
```

Per-stage data we need:

| Stage | Source | Captured |
|---|---|---|
| Pending registration | `validatorL1Votes` (variant outcome, action.O.register*) | already in Phase C |
| Pending settle | `validatorL1Votes` (variant outcome, action.O.settle) | not yet — needs handler |
| Deployed | `outcomeMeta.outcomes[]` cross-ref with the prior register action | indexer matches |
| Currently trading (price, OI, depth) | `allMids` (`#NNNN`) + `l2Book` (`coin`) | indexer + UI fetch |
| Settled | absence from `validatorL1Votes` + change in outcome state (TBD — need confirmation if outcomeMeta carries a settled flag) | indexer |

## 2. outcomeMeta (HF info)

```json
{
  "type": "outcomeMeta"
}
```

Response (verified mainnet):
```json
{
  "outcomes": [
    {
      "outcome": 105,
      "name": "Recurring",
      "description": "class:priceBinary|underlying:BTC|expiry:20260527-0600|targetPrice:76877|period:1d|...",
      "sideSpecs": [{ "name": "Yes" }, { "name": "No" }],
      "quoteToken": "USDC"
    },
    ...
  ]
}
```

Fields:
- `outcome` — stable integer ID.
- `name` — short display name. Sometimes generic ("Recurring", "Recurring Named Outcome") — operator must read `description` to disambiguate.
- `description` — free text. For recurring binaries, a `|`-delimited spec:
  `class:priceBinary | underlying:<sym> | expiry:<YYYYMMDD-HHMM> | targetPrice:<price> | period:<N>(d|h)`.
- `sideSpecs[]` — N sides. Binary = `[Yes, No]`; multi-outcome can be `[Change, No Change]` or `[Below 75339, 75339-78414, Above 78414]` (3 sides) etc.
- `quoteToken` — almost always `USDC` for now.

Stats (mainnet, 2026-05-24): 10 outcomes (100~109). testnet: 66 outcomes (10272+).

## 3. Asset ID mapping — outcome → trading book

`allMids` returns mid prices keyed by asset string. Outcome trading prices use the `#NNNN` namespace (verified):

| outcome | side `Yes` key | side `No` key |
|---|---|---|
| 100 (Fallback) | `#1000` | `#1001` |
| 101 (Below 4.3%) | `#1010` | `#1011` |
| 102 (Exactly 4.3%) | `#1020` | `#1021` |
| 103 (Above 4.3%) | `#1030` | `#1031` |
| 104 (June Fed) | `#1040` | `#1041` |

**Hypothesized mapping** (must be cross-verified on testnet where outcome IDs are 5-digit):

```
assetKey(outcome, side_idx) = "#" + str(outcome * 10 + side_idx)
```

For mainnet outcome 100~109 this means `#1000`~`#1099` (only 5 outcomes have actual liquidity right now → `#1000`~`#1041` visible). For testnet outcome 10281 ("Champions League winner") the predicted key is `#102810`/`#102811`/... — to be verified by indexer.

`l2Book` uses the same `coin` form. Example:
```json
POST /info  { "type": "l2Book", "coin": "#1050" }
```

If the mapping turns out to be HF-internal (not pure formula), we fall back to a lookup table the indexer builds from `outcomeMeta` + `allMids` keys snapshot.

## 4. URL slug pattern (UI reference)

app.hyperliquid.xyz uses URL slugs like:
```
/trade/btc-above-76877-yes-may-27-0600
```

Decomposed:
- `btc-above-76877` — derived from `description` (class:priceBinary|underlying:BTC|targetPrice:76877)
- `yes` — `sideSpecs[].name` lowercased (`yes`, `no`, `change`, `above-78414`, ...)
- `may-27-0600` — derived from `expiry:20260527-0600`

For hl-markets we **do not** mimic this slug; we use the outcome ID + side in our route:
```
/o/<network>/<outcomeId>     ← canonical outcome detail
/o/<network>/<outcomeId>/<sideIdx>   ← specific side focus (optional)
```

`<govId>` (from `validatorL1Votes`) and `<outcomeId>` (from `outcomeMeta`) are linked one-to-one (or many-to-one for multi-stage governance) in the indexer's `outcome_market.gov_id` column.

## 5. Trading data we surface

Polymarket-style detail page (Phase H), per outcome:

| UI element | Source |
|---|---|
| Question (large heading) | `outcomeMeta.name` + description parse |
| % Chance | `allMids[yesKey] * 100` (binary); for multi-outcome, each side's mid |
| 24h Change | `(midNow - midPrevDay) / midPrevDay` — `metaAndAssetCtxs`-style ctx may carry `prevDayPx`; verify endpoint for outcome ctxs (TBD) |
| 24h Volume | from outcome ctx (TBD endpoint — none of the `outcome*Ctxs` variants currently respond) |
| Open Interest | same TBD |
| Order Book | `l2Book` `coin=#NNNN` — `levels[0]` = bids, `levels[1]` = asks |
| 24h candle chart | `candleSnapshot` with `coin=#NNNN`, `interval="1h"`, `startTime=now-24h` |
| Side toggle (Yes/No) | UI state; swaps which `#NNNN` key the page reads |
| Validators voted (history) | indexer joins outcome_market.gov_id → vote_snapshot timeline |
| Settle status | indexer (settled outcomes drop from validatorL1Votes; recorded with `winner_side`) |

Open questions (TBD as we run indexer in Phase E):
- Where do `24h volume`/`OI`/`prevDayPx` come from for outcome assets? `outcomeMetaAndAssetCtxs` does not exist. Possibilities: `metaAndAssetCtxs` may include them (try filter), or there is an outcome-specific ctx endpoint with a different name.
- Multi-side outcomes (e.g., 3 sides like BTC price range) — does the side index increment beyond 1? Probably yes — `#10502` would be side 2.

## 6. UI reference — Polymarket / app.hyperliquid.xyz

User-provided screenshot (2026-05-24) of `app.hyperliquid.xyz/trade/btc-above-76877-yes-may-27-0600` shows:

- Top header: title + side toggle (Yes/No)
- Stats row: BTC Price/Countdown, % Chance, Price (Yes), 24h Change, 24h Volume, Open Interest
- Left column: search + category tabs (All / Perps / Spot / **Outcome** / Crypto / Tradfi / HIP-3 / Trending / Pre-launch)
- Outcome list: per-row (title, % Chance, Volume, OI), with multi-outcome shown as inline side breakdown ("75339 to 78414  89%", "Above 78414  8%", "Below 75339  3%")
- Center: candle chart (BTC mark price → underlying)
- Right column: Order Book (price / size / total) with Yes/No swap, Spread row
- Bottom: Balances / Positions / Outcomes / Open Orders / TWAP / Trade History / Funding / Order History

Our `/o/<network>/<outcomeId>` page reproduces this layout in HL dark + mint (no Polymarket colors, no app.hyperliquid.xyz styling). Specific component tree in Phase H.

## 7. Governance ↔ outcome link

In `lib/governance/renderers/outcome.tsx`:
- During Phase C, the Card/Detail only know about the governance action.
- During Phase F+ (after backend lands), if the indexer linked `gov_id → outcome_id`, the Detail view also pulls live market data via `lib/api.ts` `outcomeMeta` + `l2Book` and renders the Polymarket panel.
- Multi-side outcomes (3+ sides in `sideSpecs`) need a third bar in the panel.

## 8. Settlement and historical

When a deployed outcome is settled:
1. The settle governance (`O.settle...`) appears in `validatorL1Votes` and quorum-reaches.
2. Oracle posts 0/1 (or N-of-M for multi-outcome).
3. Trading halts; positions settle.
4. The outcome may still appear in `outcomeMeta` (TBD — verify if HF removes it or adds a `isSettled` flag).
5. Our indexer records: `outcome_market.status = settled`, `winner_side = <int>`, `settled_at`.

Expired (no quorum before deadline) — outcome never trades; `outcome_market` row stays at `status = governance_expired`, no `outcome_id`.

## 9. Open questions to resolve in Phase E

1. Asset ID formula for 5-digit outcomes (testnet 10272+).
2. `prevDayPx`/`24h volume`/`OI` for outcome assets — exact info type.
3. Settled detection: does `outcomeMeta` carry a flag, or do we infer from absence + recent settle vote?
4. `O.settle` action's exact JSON shape (need a captured testnet sample).
5. Multi-side mapping: `#100502` vs `#1050` + side 2 — TBD.

These get answered as the indexer runs against live data; spec is updated.

# hl-markets — Project Charter

> **Status**: v0.3 (2026-05-27, pivoted from hl-gov)
> **One-line**: A Polymarket-style public explorer for Hyperliquid HIP-4 **outcome markets** — read-only, mobile-first, multi-option questions + standalone binaries, live order books and % chance per option. Sourced entirely from public HF endpoints, indexed for historical lookback.

---

## 1. Pivot note (was hl-gov)

This project started in May 2026 as **hl-gov**, a general Hyperliquid validator-governance explorer (outcome + delisting + delegation lookup + EIP-712 virtual polls). After Phase H landed and we saw the polymarket-style outcome UI come together, we decided the outcome side was the actual value — the delisting / delegations / virtual-poll layer was complexity for little reader benefit.

So the project is now **hl-markets**, a focused outcome-market app. Old plumbing (governance indexer, validator snapshots) stays only insofar as it powers the outcome lifecycle (deploy gov → market trading → settle gov). Delisting variants, delegation lookups, and EIP-712 virtual polls are removed.

If anyone wants a generic governance explorer in the future, fork from the v0.2 charter.

## 2. Why this exists

Hyperliquid ships HIP-4 outcome markets — Polymarket-style prediction markets settled on HyperCore (e.g. *"May CPI year-over-year"* → Below 4.3% / Exactly 4.3% / Above 4.3%, each a separate outcome whose Yes side mid = that bucket's % chance). The official trade interface lists them but doesn't:

- group them by question (a multi-option market is shown as three unrelated outcomes),
- decode the recurring-market DSL (`class:priceBucket|underlying:BTC|priceThresholds:75339,78414|expiry:20260527-0600`) into readable labels,
- surface "how much can I buy and how much can I make if I'm right" at the option-list level,
- show settled / expired markets at all once HF rolls them out of `outcomeMeta`.

`hl-markets` fills those gaps with a single read-only SPA + a tiny indexer for historical depth.

## 3. Non-goals

- ❌ Custody, signing, or any wallet interaction (the SPA never asks for keys).
- ❌ Order routing / trading UI. We link out to `app.hyperliquid.xyz/trade/#NNNN`.
- ❌ Generic governance browser (delisting actions, validator votes on non-outcome topics).
- ❌ Delegator-centric features (My Delegations, validator scorecard).
- ❌ EIP-712 virtual polls / on-site straw votes.
- ❌ Multi-tenant white-label hosting.

## 4. Users & roles

| Role | What they do |
|---|---|
| Trader prospect | Browse currently-trading markets, see which option has the most upside, click out to Hyperliquid to trade. |
| Researcher | Inspect settled / expired questions and the governance actions that deployed them. |
| Validator (Carl) | Sanity-check what outcome registrations are pending and what's about to settle. |

## 5. Tabs (the whole app)

| Tab | Source | What's in it |
|---|---|---|
| **Pending** | HF `validatorL1Votes` (live) | Outcome-variant governance actions awaiting validator vote — i.e. *outcomes about to launch*. Filtered to `variant === 'outcome'`. |
| **Markets** | HF `outcomeMeta` + `allMids` (live) | Currently-trading outcomes. Multi-option markets grouped into **question cards** (Polymarket-style). Standalone binaries shown below in a separate section. |
| **Historical** | Indexer (Postgres) | Outcome governance that has been settled / expired. Same card style as Pending, but read from the indexer because HF no longer returns them. |

## 6. Stack (unchanged from v0.2)

### 6.1 Frontend
- Next.js 14 App Router with `output: 'export'` (static SPA, S3 + CloudFront).
- TypeScript strict, Tailwind CSS, mobile-first.
- No wallet, no signing libs, no analytics SDKs.

### 6.2 Backend
- Node 20 single process: Hono HTTP + node-cron indexer.
- Drizzle ORM + Postgres 15.
- Dockerfile + docker-compose for local; managed Postgres in prod.
- Host TBD (Railway / Fly / VPS — single Docker image so any will work).

### 6.3 Domain
- `hl-markets.bharvest.io` (TBD when the deploy host is chosen).

## 7. Postgres tables

Same five tables as v0.2 (when this was hl-gov), in service of outcome lifecycle:

| Table | Use |
|---|---|
| `governance` | Outcome variant governance — `deployOutcome`, `settleOutcome` and the like. Status: pending / settled / expired. |
| `vote_snapshot` | Per-tick snapshot of who has voted on a pending governance. Used to compute "votes: N · quorum" on Historical cards. |
| `validator_snapshot` | Validator metadata (name, stake) so historical cards can render voter names. |
| `outcome_market` | One row per outcome. `deployGovId` / `settleGovId` link to `governance` when matched by (name, sideNames). |
| `poll_vote` | **Deprecated** — leftover from the v0.2 Phase G (hl-gov virtual polls). Schema kept so the existing migration applies cleanly; will be dropped in the next migration. |

## 8. Architecture

```
USER (mobile + desktop)
   ↓
[ CloudFront / Cloudflare / GH Pages ] ── static SPA
   ├─→ HF /info direct      (markets / pending — lowest latency)
   └─→ hl-markets-api       (historical — backed by Postgres)
        ↓
   [ Node process: Hono HTTP + in-process node-cron ]
        ↓
   [ Postgres 15 ]   (local: docker-compose · prod: managed)
```

## 9. Phases (status after pivot)

| Phase | Status | Notes |
|---|---|---|
| A — Charter / spec-kit | ✓ | Will be re-stamped as `001-hl-markets` once renamed. |
| B — Frontend skeleton + HL tone | ✓ | |
| C — Live data (no backend) | ✓ | |
| D — Delegation lookup | **removed** | hl-markets isn't delegator-centric. |
| E — Local backend (Postgres + Hono) | ✓ | |
| F — Historical via backend | ✓ | |
| G — EIP-712 virtual polls | **removed** | Outcome markets settle on price, not on opinion votes. |
| H.1 — Outcome detail (binary) | ✓ | `/o?network=&id=` |
| H.2 — Question grouping | ✓ | `/q?network=&id=` + Markets tab redesign |
| H.3 — Backend: persist `outcomes.questions` | pending | So Historical can include settled questions. |
| I — Polish + deploy host pick | pending | Domain `hl-markets.bharvest.io`, repo rename, README rewrite. |

## 10. Constitution diff vs v0.2

- **I. Zero key custody** — same.
- **II. Signed messages over trust** — **removed** (no EIP-712 polls anymore).
- **III. Idempotent reads** — same.
- **IV. Network selector explicit** — same.
- **V. Plugin / renderer extensibility** — same; outcome / question / unknown variants still go through `lib/governance/renderers`, plus the new `lib/outcome-question.ts` DSL parser for recurring markets.
- **VI. Mobile-first** — same.
- **VII. HL brand tokens** — same.
- **VIII. No telemetry** — same.
- **IX. Host-agnostic** — same.
- **X. Tier gating** — same.

(Constitution gate in the Makefile keeps the survivors; II is dropped.)

## 11. Open items

- Repo / directory rename `hl-gov` → `hl-markets` — **done** (task #53).
- Backend table cleanup: drop `poll_vote`, drop unused governance fields once index of outcome governance stabilizes.
- Free-text expiry extraction beyond CPI ("scheduled for ..." / "by ...") covers most curated questions; tighten when we see counter-examples.
- Historical governance backfill (#48) is still open — HF only exposes pending, so anything deployed before the indexer started observing is permanently un-linked.

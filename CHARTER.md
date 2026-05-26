# hl-markets — Project Charter

> **Status**: v0.4 (2026-05-27, +Phase J: wallet + live engagement)
> **One-line**: A Polymarket-style public explorer **and trading client** for
> Hyperliquid HIP-4 outcome markets — read-only browsing for everyone, plus a
> connected-wallet layer with per-market chat, position badges, and in-app
> trade (Builder Code). Mobile-first, zero key custody.
> **Ownership**: personal project by builnad (not an official B-Harvest
> deliverable). Builder code revenue, if any, flows to a personal EOA TBD.

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

- ❌ **Key custody.** Private keys never leave the user's wallet. The SPA
  asks the wallet to *sign* — never to *share* secrets. Signing is permitted
  for (a) Phase J.1 session sign-in (EIP-712 typed data) and (b) Phase J.5
  trade orders (HL action format; backend forwards the user-signed action
  verbatim to `/exchange`).
- ❌ Validator-side actions (those belong to `hl-vote-web`).
- ❌ Generic governance browser (delisting, non-outcome validator votes).
- ❌ Delegator-centric features (My Delegations, validator scorecard).
- ❌ EIP-712 virtual polls / on-site straw votes.
- ❌ Multi-tenant white-label hosting.

## 4. Users & roles

| Role | Wallet? | What they do |
|---|---|---|
| Observer | no | Browse markets, see % chance, read chat (Phase J.3 read-only mode). |
| Trader | yes | Connect wallet → session sign-in → chat in any market they hold a position in → in-app trade with Builder Code (Phase J.5). |
| Researcher | no | Inspect settled / expired questions and their deploying governance. |
| Admin (builnad) | yes | Delete spammy chat messages (Phase J.2 moderation). |

## 5. Tabs (the whole app)

| Tab | Source | What's in it |
|---|---|---|
| **Pending** | HF `validatorL1Votes` (live) | Outcome-variant governance actions awaiting validator vote — i.e. *outcomes about to launch*. Filtered to `variant === 'outcome'`. |
| **Markets** | HF `outcomeMeta` + `allMids` (live) | Currently-trading outcomes. Multi-option markets grouped into **question cards** (Polymarket-style). Standalone binaries shown below in a separate section. |
| **Historical** | Indexer (Postgres) | Settled / expired outcome governance + settled questions kept in `outcome_question`. |

### 5.1 Per-market detail page (after Phase J)

Each market page (`/q?id=` or `/o?id=`) gains a connected-wallet section:

- **Chat panel** — message list (newest at bottom), composer at the bottom.
  Each message shows `0x12…34` (or ENS / HL display name when resolvable),
  a side badge (`Yes long` / `No long` / `—`), timestamp, body.
- **Position badge next to every chat author** — read live from HF
  `clearinghouseState`, side only (no $ size).
- **Trade widget** — buy/sell on the active option's `#NNNN` asset. Signs an
  HL action with Builder Code attached; backend forwards to `/exchange`.

The page degrades gracefully without a wallet: no chat compose, no trade
widget, chat list is read-only.

## 6. Stack

### 6.1 Frontend
- Next.js 14 App Router with `output: 'export'` (static SPA, S3 + CloudFront).
- TypeScript strict, Tailwind CSS, mobile-first.
- **Wallet**: EIP-1193 direct (same pattern as `hl-vote-web`). MetaMask first,
  Ledger WebHID later if needed. No `wagmi` / `viem`-as-a-framework — keeps
  the bundle under the 1.5 MB ceiling (Constitution VII).
- No analytics SDKs.

### 6.2 Backend
- Node 20 single process: Hono HTTP + WebSocket upgrade + node-cron indexer.
- Drizzle ORM + Postgres 15.
- Dockerfile + docker-compose for local; managed Postgres in prod.
- Host TBD (Railway / Fly / VPS — single Docker image so any will work).

### 6.3 Live transport (Phase J.2+)
- **WebSocket** for chat fan-out. One ws connection per browser tab; server
  maintains a `Set<ws>` per `(network, marketKey)` room.
- Auth: session JWT (HttpOnly cookie, 24h) issued after EIP-712 sign-in.
- Backpressure: server drops the slowest sockets; clients reconnect with
  exponential backoff.

### 6.4 Domain
- `hl-markets.bharvest.io` (mainnet) + `hl-markets-testnet.bharvest.io` —
  both TBD when the deploy host is chosen.

## 7. Postgres tables

Outcome lifecycle (carry-over from v0.2 + v0.3):

| Table | Use |
|---|---|
| `governance` | Outcome variant governance. Status: pending / settled / expired. |
| `vote_snapshot` | Per-tick voter snapshot for the Historical quorum bar. |
| `validator_snapshot` | Validator metadata (name, stake) for voter names. |
| `outcome_market` | One row per outcome. `deployGovId` / `settleGovId` link by (name, sideNames). |
| `outcome_question` | Polymarket-style question grouping; survives after HF drops settled questions. |
| `poll_vote` | **Deprecated** — leftover from v0.2 Phase G; will be dropped. |

New for Phase J:

| Table | Use |
|---|---|
| `chat_session` | One row per session token issued after EIP-712 sign-in. `(address, network, issuedAt, expiresAt, lastSeenAt)`. JWT itself is HttpOnly cookie; this table is for revoke + audit. |
| `chat_message` | `(id, network, marketKey, address, body, signedAt, deletedAt)`. `marketKey` is `q:<questionId>` or `o:<outcomeId>`. Wiped when the parent market settles (per Charter §3 retention). |
| `chat_admin` | Hardcoded list of addresses with delete permission (currently: builnad's EOA). |

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

## 9. Phases

| Phase | Status | Notes |
|---|---|---|
| A — Charter / spec-kit | ✓ | |
| B — Frontend skeleton + HL tone | ✓ | |
| C — Live data (no backend) | ✓ | |
| D — Delegation lookup | **removed** | not delegator-centric. |
| E — Local backend (Postgres + Hono) | ✓ | |
| F — Historical via backend | ✓ | |
| G — EIP-712 virtual polls | **removed** | superseded by Phase J chat. |
| H.1 — Outcome detail (binary) | ✓ | `/o?id=` |
| H.2 — Question grouping | ✓ | `/q?id=` + Markets tab redesign |
| H.3 — Backend: persist `outcome_question` | ✓ | Historical includes settled questions. |
| I — Polish + deploy host pick | pending | testnet + mainnet S3 sites, custom domains. |
| **J.1 — Wallet connect + session sign-in** | pending | EIP-1193 + EIP-712 sign → JWT cookie. |
| **J.2 — Chat backend** | pending | `chat_message` table + WebSocket + sig verify + rate limit + position-gate. |
| **J.3 — Chat UI per market** | pending | message list + composer on `/q` + `/o`. |
| **J.4 — Position badge** | pending | HF `clearinghouseState`, side-only display. |
| **J.5 — In-app trade with Builder Code** | pending | order form on market page; forward to `/exchange` with `builder` field. |

## 10. Constitution (v0.4)

- **I. Zero key custody** — private keys never reach the backend. Sign-in
  uses EIP-712 typed data; trade actions use HL's L1 action signing format.
  Both happen in the wallet; backend only sees signatures + recovered
  addresses.
- **II. Signed messages over trust** — **restored** (was dropped at v0.3
  when Phase G was removed). Every chat message is implicitly authenticated
  by the session JWT, which itself was minted from a verifiable EIP-712
  signature. Trade orders carry the HL action signature.
- **III. Idempotent reads** — same.
- **IV. Network selector explicit** — same (build-time `NEXT_PUBLIC_HL_NETWORK`).
- **V. Plugin / renderer extensibility** — same; new market variants go
  through `lib/governance/renderers` + `lib/outcome-question.ts`.
- **VI. Mobile-first** — same.
- **VII. HL brand tokens** — same.
- **VIII. No telemetry** — same.
- **IX. Host-agnostic** — same; the wallet layer doesn't change this — Hono
  WS works on any Node host.
- **X. Tier gating** — same.
- **XI. Trade safety** *(new)* — the backend forwards the user-signed action
  to HF `/exchange` byte-for-byte. It MUST NOT alter `order`, `coin`, `side`,
  `sz`, `px`. It MAY append `builder: {b, f}` only when the configured
  Builder Code values are set in env. UI MUST show the builder fee before
  the user signs.

## 11. Open items

- **Builder Code wallet** — builnad needs to (a) pick a personal EOA,
  (b) submit `approveBuilderFee` to HL once (per network), (c) set
  `NEXT_PUBLIC_BUILDER_ADDR` + `NEXT_PUBLIC_BUILDER_FEE_BPS` (default 5 bps)
  in the frontend build env. See Phase J.5 spec for the SDK call.
- Repo / directory rename — **done** (task #53).
- Backend table cleanup: drop `poll_vote`, drop unused governance fields
  once index of outcome governance stabilizes.
- Free-text expiry extraction tightening (counter-examples TBD).
- Historical governance backfill — HF only exposes pending; anything
  deployed before the indexer started observing is permanently un-linked
  (acceptable trade-off).

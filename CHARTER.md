# hl-markets — Project Charter

> **Status**: v0.5 (2026-05-28, +Phases K-U: full trading + AI analyst + deep
> agents + autobet)
> **One-line**: An AI-powered Polymarket-style platform for Hyperliquid HIP-4
> outcome markets — read-only browsing for everyone, plus a connected-wallet
> layer with multi-leg basket trading, AI-assisted discovery / analysis, and
> opt-in autobet. Mobile-first, zero key custody, builder-code monetized.
> **Ownership**: personal project by builnad (not an official B-Harvest
> deliverable). Builder code revenue flows to a personal EOA.

---

## 1. Pivot history

### v0.2 → v0.3 (hl-gov → hl-markets)
This project started in May 2026 as **hl-gov**, a general Hyperliquid
validator-governance explorer. After Phase H landed and the polymarket-style
outcome UI came together, the outcome side was the actual value — delisting /
delegations / virtual-poll layers were complexity for little reader benefit.

Project became **hl-markets**, a focused outcome-market app. Old plumbing
(governance indexer, validator snapshots) stays only insofar as it powers the
outcome lifecycle. Delisting variants, delegation lookups, EIP-712 virtual
polls were removed.

### v0.4 → v0.5 (explorer → trading platform → AI platform)
Phases J-U evolved the app from a Polymarket-style read-only explorer with
chat into a **complete trading platform** with AI discovery, deep domain
agents, and rules-driven autobet. The thesis: a static SPA + tiny Hono backend
+ user's own browser LLM key can compete with hosted prediction-market UIs on
UX while taking zero key custody and zero PII.

## 2. Why this exists

Hyperliquid ships HIP-4 outcome markets settled on HyperCore. The official
trade interface lists them but doesn't:

- group them by question (a multi-option market shows as three unrelated
  outcomes),
- decode the recurring-market DSL into readable labels,
- surface "how much can I buy and how much can I make" at the option-list
  level,
- show settled markets at all once HF rolls them out of `outcomeMeta`,
- **let you trade a multi-leg basket as one action**,
- **use AI to surface mispriced outcomes across every active market**,
- **autonomously execute small bets to rules you set**.

`hl-markets` fills all of those with a single SPA, a tiny indexer, and an
opt-in AI layer that uses the user's own LLM API key.

## 3. Non-goals

- ❌ **Key custody.** Private keys never leave the user's wallet, and agent
  privkeys never leave the user's browser IndexedDB. Backend signs nothing.
- ❌ **LLM key custody.** Backend never sees the user's OpenAI / Anthropic /
  Tavily / FRED / football-data / OpenWeatherMap keys. All AI calls go
  browser → provider directly.
- ❌ Validator-side actions (those belong to `hl-vote-web`).
- ❌ Generic governance browser (delisting, non-outcome validator votes).
- ❌ Delegator-centric features.
- ❌ EIP-712 virtual polls / on-site straw votes.
- ❌ Multi-tenant white-label hosting.
- ❌ **Automated trading without explicit user opt-in.** AI surfaces signals;
  autobet only runs when the user clicks Enable and sets caps (Constitution
  XIV).

## 4. Users & roles

| Role | Wallet? | LLM key? | What they do |
|---|---|---|---|
| Observer | no | no | Browse markets, see % chance, read chat. |
| Trader | yes | optional | Connect → chat → trade single or basket; manage positions; partial cash-out / cancel. |
| AI-assisted trader | yes | yes | Discovery tab — paste LLM key in browser, get ranked picks from every active market with deep-agent reasoning. |
| Autobet trader | yes | yes | Sets rules (daily cap, per-bet max, min edge, category filter); a background ticker auto-fires every 5 minutes. |
| Researcher | no | no | Inspect settled / expired questions and their deploying governance. |
| Admin (builnad) | yes | no | Delete spammy chat messages. |

## 5. Tabs (the whole app)

| Tab | Source | What's in it |
|---|---|---|
| **Pending** | HF `validatorL1Votes` (live) | Outcome-variant governance actions awaiting validator vote — outcomes about to launch. |
| **Markets** | HF `outcomeMeta` + `allMids` (live) | Currently-trading outcomes. Questions grouped Polymarket-style. |
| **Historical** | Indexer (Postgres) | Settled / expired outcome governance + settled questions. |
| **Discovery** *(Phase S/T/U)* | LLM call (browser→provider) | Free-text user query ("World Cup top 5 ROI", "ending soon mispriced", "70%+ confidence under 50¢") → AI returns top picks across all categories with deep-agent reasoning and quarter-Kelly sizing. |
| **Basket** *(Phase L/M)* | localStorage | Multi-leg cart; one signed `order` action with N legs ships all at once with builder fee attached. |
| **Portfolio** *(Phase N)* | HF `clearinghouseState` + `openOrders` | Current positions with mark / PnL; partial cash-out and cancel-order forms. |
| **Autobet** *(Phase O)* | localStorage rules + 5-min background scan | Configure caps + filters; dry-run; recent log. |
| **Markets/Settings** *(Phase R)* | localStorage | LLM key paste UI (OpenAI / Anthropic / Tavily / FRED / football-data / OpenWeatherMap); agent privkey backup. |

### 5.1 Per-market detail page (Phase J+)

Each market page (`/q?id=` or `/o?id=`) has:

- **Chat panel** — message list, composer at bottom. Each message shows the
  wallet (`0x12…34` or HL display name), position-side badge, timestamp, body.
- **Position badge** next to every chat author — read live from
  `clearinghouseState`, side only.
- **Trade widget** — buy/sell on the active option's `#NNNN` asset, builder fee
  attached, agent flow optional (no popup).
- **AI Analyst** *(Phase Q)* — single-outcome deep analysis using the same
  domain-specialist chain as Discovery. Returns fair %, edge, confidence,
  reasoning bullets, cited sources, rawSignals.
- **Add to Basket** — drops a leg into the basket cart.

The page degrades gracefully without a wallet (no chat compose, no trade
widget, chat read-only) and without an LLM key (no AI Analyst, but the rest
works).

## 6. Stack

### 6.1 Frontend
- Next.js 14 App Router with `output: 'export'` (static SPA, S3 + CloudFront
  or any static host).
- TypeScript strict, Tailwind CSS, mobile-first.
- **Wallet**: EIP-1193 direct (same pattern as `hl-vote-web`). MetaMask first,
  Ledger WebHID later if needed. No `wagmi` / `viem`-as-a-framework — keeps
  the bundle under the 1.5 MB ceiling.
- **Agent key custody**: HL `approveAgent` action mints a session privkey
  (random 32 bytes generated in browser); ciphertext-at-rest in IndexedDB,
  decrypted with the user's wallet signature on tab open. Backend never sees
  it.
- **LLM key custody**: All provider keys stored in `localStorage`
  (`hl-markets:llm-keys-v1`). Wiped by Clear button. Each AI call goes from
  browser fetch directly to `api.openai.com` / `api.anthropic.com` /
  `api.tavily.com` / `api.stlouisfed.org` / `api.football-data.org` /
  `api.openweathermap.org`. Backend has no AI proxy.
- No analytics SDKs.

### 6.2 Backend
- Node 20 single process: Hono HTTP + WebSocket upgrade + node-cron indexer.
- Drizzle ORM + Postgres 15.
- Dockerfile + docker-compose for local; managed Postgres in prod.
- Host TBD (Railway / Fly / VPS — single Docker image so any will work).
- **Trade forwarder** — `/trade-forward` accepts a fully user-signed HL
  action and forwards byte-for-byte to HF `/exchange`, *only* attaching
  `builder: {b, f}` from env. Cannot modify order, side, sz, px (Constitution
  XI).

### 6.3 Live transport (Phase J.2+)
- **WebSocket** for chat fan-out. One ws connection per browser tab; server
  maintains a `Set<ws>` per `(network, marketKey)` room.
- Auth: session JWT (HttpOnly cookie, 24h) issued after EIP-712 sign-in.
- Backpressure: server drops the slowest sockets; clients reconnect with
  exponential backoff.

### 6.4 Domain
- `hl-markets.bharvest.io` (mainnet) + `hl-markets-testnet.bharvest.io` —
  both TBD when the deploy host is chosen.

## 7. Revenue model (Phase L finding, 2026-05-27)

HIP-4 outcome markets implement an asymmetric builder-fee rule that we
discovered by checking testnet fills directly:

| Action | HF builder fee policy |
|---|---|
| **Buy** (open long YES / open long NO) | builder fee = **0** regardless of what `builder.f` requests. The fee field is silently zeroed; users don't pay anything beyond mid. |
| **Sell** (close position) | builder fee = **100% of `builder.f`**. Builder takes its full slice from the seller's proceeds. |

Verified testnet evidence: a 100-unit sell with `builder.f = 100` (= 1 bp)
yielded **0.0265665 USDC** to the builder address on the corresponding
`userFills` row.

Why this matters: it means the *natural* monetization on HIP-4 is
**discovery → close**, not **discovery → open**. The AI layer doesn't need to
push users into bad bets to earn — it only earns when the user is
voluntarily realizing PnL (winning or stopping out). This aligns the platform's
interest with the user's: we make money when they choose to close, which they
do when they've already decided their position is done.

`docs/HIP4-fee-policy.md` documents the discovery experiment and live test
output. `specs/001-hl-markets/contracts/revenue-model.md` (Phase U) covers
the implications for product strategy.

Builder fee target (default): **5 bps** on sells. Below the perceptual
threshold for casual traders, sustainable revenue for a single operator.

## 8. Postgres tables

Outcome lifecycle (carry-over):

| Table | Use |
|---|---|
| `governance` | Outcome variant governance. Status: pending / settled / expired. |
| `vote_snapshot` | Per-tick voter snapshot for the Historical quorum bar. |
| `validator_snapshot` | Validator metadata (name, stake) for voter names. |
| `outcome_market` | One row per outcome. `deployGovId` / `settleGovId` link by (name, sideNames). |
| `outcome_question` | Question grouping; survives after HF drops settled questions. |
| `poll_vote` | **Deprecated** — leftover from v0.2 Phase G; to be dropped. |

Phase J chat:

| Table | Use |
|---|---|
| `chat_session` | One row per session token issued after EIP-712 sign-in. |
| `chat_message` | Per-market message, soft-delete via `deletedAt`. Wiped when parent market settles. |
| `chat_admin` | Hardcoded list of addresses with delete permission. |

**No new server tables for Phase K-U.** All AI / autobet / basket state is
client-only (localStorage + IndexedDB). This keeps zero-key-custody honest
and makes the backend trivially shardable / replaceable.

## 9. Architecture

```
USER (mobile + desktop)
   │
   │   browser-only:
   │   • wallet (EIP-1193 + EIP-712)
   │   • agent privkey (IndexedDB, encrypted at rest)
   │   • LLM keys + Tavily/FRED/football-data/OpenWeatherMap (localStorage)
   │   • basket / autobet rules / discovery cache (localStorage)
   │
   ├──► [HF /info]            markets / pending / clearinghouseState / userFills  (read)
   │
   ├──► [hl-markets-api]      historical / chat / trade-forward
   │       │
   │       └─► Hono HTTP + WebSocket + node-cron
   │            │
   │            └─► Postgres 15
   │
   ├──► [HF /exchange]        order action (signed in browser; backend forwards w/ builder)
   │
   ├──► [api.openai.com] or [api.anthropic.com]   AI discovery + AI analyst   (LLM key in headers, browser→provider)
   │
   ├──► [api.tavily.com]                          domain web search        (deep agents)
   │
   ├──► [api.coingecko.com / api.stlouisfed.org / api.football-data.org / api.openweathermap.org]
   │                                              raw domain signals (no LLM, pure data)
   │
   └──► [CloudFront / Cloudflare / S3 / GH Pages] static SPA
```

The AI layer's pipeline:

```
fetchActiveCandidates  → all open YES outcomes across every question
        │
        ▼
enrichWithSpecialists  → cheap Tier-2 calls (current crypto price, FRED series, etc.)
        │   parallel, best-effort, attach blob
        ▼
enrichWithDeepAnalysts → for top N=12 only:
        │              fetchers (CoinGecko + Tavily / football-data + Tavily / FRED + Tavily / etc.)
        │                 ↓ no LLM, raw signals
        │              loadSkill(category)
        │                 ↓ system prompt with workflow + guardrails + JSON contract
        │              LLM analyst call (1 per candidate; OpenAI strict-json or Anthropic)
        │                 ↓ AnalystOutputSchema (Zod)
        │              fold sources + rawSignals into result
        ▼
askLlmDiscover         → final ranking LLM call: receives all candidates + their deep blobs
                         returns mixed-domain top-K {outcomeId, fairPct, edgePp, conf, reason}
                         user reviews → optional quarter-Kelly sizing → optional basket add
```

## 10. Phases

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
| H.3 — Backend: persist `outcome_question` | ✓ | |
| I — Polish + deploy host pick | pending | testnet + mainnet static sites, custom domains. |
| J.1 — Wallet connect + session sign-in | ✓ | EIP-1193 + EIP-712 sign → JWT cookie. |
| J.2 — Chat backend | ✓ | `chat_message` + WebSocket + sig verify + rate limit + position-gate. |
| J.3 — Chat UI per market | ✓ | message list + composer. |
| J.4 — Position badge | ✓ | `clearinghouseState` side-only. |
| J.5 — In-app trade with Builder Code | ✓ | trade-forward endpoint; builder env wired. |
| J.6 — J.5 silent-killer fixes | ✓ | Zod ordering, price normalization, fee mismatch, min notional — all unblocked on testnet. |
| **K — Agent flow (popup-free trading)** | ✓ | `approveAgent` mints session key; IndexedDB encrypted-at-rest; auto-thaw on tab open. |
| **L — Multi-leg basket bet** | ✓ | Single `order` action with N legs ships builder-attached. Testnet verified. |
| **L.fee — HIP-4 builder fee discovery** | ✓ | Found buy=0/sell=100% asymmetry. Pricing strategy adjusted. |
| **M — Basket UI** | ✓ | localStorage cart, leg-edit modal, projected payout table. |
| **N — Portfolio (positions + close)** | ✓ | `clearinghouseState` + `openOrders`; partial-close + cancel forms. |
| **O — Autobet** | ✓ | Rule engine + dry-run + 5-min `AutobetTicker` background scan. Default OFF. |
| **P — AI Analyst (single outcome)** | ✓ | Browser-direct LLM call; "fair %, edge, conf, reasoning" panel on `/o` and `/q`. |
| **Q — Multi-provider AI keys** | ✓ | Settings page with OpenAI + Anthropic toggle; key wipe button. |
| **R — Settings UX consolidation** | ✓ | LLM keys + agent backup + autobet rules all reachable. |
| **S — AI Discovery (cross-market)** | ✓ | Free-text query → ranked picks across every active outcome. Auto-explore on tab open; 1h localStorage cache. |
| **T — Domain specialists (Tier-3 signals)** | ✓ | Per-category fetchers (CoinGecko / football-data / FRED / Tavily / OpenWeatherMap) enrich candidates before final ranking. |
| **U — Deep agents (anthropic/financial-services-style)** | ✓ | Per-candidate single-LLM-call analyst with SKILL prompts, Zod-enforced JSON, source citations. Top-12 candidates get deep treatment before final rank. |
| V — Mainnet rollout | pending | gas / fee policy review, autobet emergency-stop verification, observability. |

## 11. Constitution (v0.5)

- **I. Zero key custody** — private keys never reach the backend. Sign-in
  uses EIP-712 typed data; trade actions use HL's L1 action signing format.
  Agent privkey lives in browser IndexedDB only.
- **II. Signed messages over trust** — every chat message is implicitly
  authenticated by the session JWT minted from EIP-712. Trade orders carry
  the HL action signature.
- **III. Idempotent reads** — same.
- **IV. Network selector explicit** — build-time `NEXT_PUBLIC_HL_NETWORK`.
- **V. Plugin / renderer extensibility** — new market variants go through
  `lib/governance/renderers` + `lib/outcome-question.ts`.
- **VI. Mobile-first** — same.
- **VII. HL brand tokens** — same; bundle ≤ 1.5 MB.
- **VIII. No telemetry** — no analytics SDK, no server-side user logging
  beyond what the chat / trade-forward endpoints minimally need.
- **IX. Host-agnostic** — Hono image runs anywhere with Postgres.
- **X. Tier gating** — testnet → staging → mainnet, each promoted only after
  verify gate green.
- **XI. Trade safety** — backend forwards user-signed actions byte-for-byte.
  MUST NOT alter `order`, `coin`, `side`, `sz`, `px`. MAY append
  `builder: {b, f}` only when env Builder Code is set. UI MUST show builder
  fee before user signs.
- **XII. Agent flow isolation** *(Phase K)* — the agent privkey is created
  in-browser, never transmitted, and encrypted at rest in IndexedDB with a
  key derived from a wallet signature on a fixed challenge string. Loss of
  the wallet → no recovery; agent has to be re-approved. Backend cannot mint
  or accept agent privkeys.
- **XIII. Single builder code** *(Phase L)* — the deployed image has exactly
  one builder address. Switching it is a deploy event, not a runtime config.
  This protects users from a backend that decides to silently increase the
  fee mid-session.
- **XIV. AI is advisory only** *(Phases P-U)* — every AI output is shown to
  the user with the market price + edge claim + confidence + sources +
  rawSignals. **Autobet** is opt-in, default-off, has hard daily-USDC and
  per-bet caps, and emits an emergency-stop on any consecutive failures.
  The AI never bypasses the human's chance to inspect a recommendation —
  except in the explicit "Autobet enabled" path the user has acknowledged.
- **XV. Untrusted third-party data** *(Phases T-U)* — every fetcher result
  (CoinGecko, FRED, football-data, Tavily, OpenWeatherMap) is treated as
  untrusted: timeouts, size caps, schema parse before render, label
  attached when shown in chat / analyst reasoning. A failing fetcher
  silently leaves the candidate without the corresponding blob; it never
  causes the discovery loop to error.

## 12. Open items

- **Deploy host pick** (Phase I) — Railway / Fly / VPS evaluation by builnad.
- **Builder Code wallet** — choose personal EOA, submit `approveBuilderFee`
  on each network, set env. Done on testnet; mainnet pending.
- Backend table cleanup: drop `poll_vote`, drop unused governance fields.
- Free-text expiry extraction tightening (counter-examples TBD).
- Mainnet rollout (Phase V) — verify Constitution XI/XIII on production
  config, walk through autobet emergency-stop end-to-end, set up uptime
  monitor on `/trade-forward`.
- **Discovery LLM cost guard** — current default is `gpt-4o-mini` (~$0.003
  per discovery call). Document expected cost at the Settings page so users
  with their own keys see the bill before they enable autobet.
- **Deep-agent fetcher rate limits** — Tavily free tier is 1k req/mo;
  document this for users so heavy autobet doesn't burn it. CoinGecko
  free-tier limits also apply.

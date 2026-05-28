# hl-markets

> An AI-powered prediction-market platform on Hyperliquid HIP-4 outcome markets.
> Polymarket-style multi-option UX, popup-free trading (agent flow), per-market chat,
> portfolio with cash out, multi-leg basket bets, and a deep-agent AI discovery
> layer that scans every active market for opportunities. Mobile-first, no key custody.
>
> testnet: `hl-markets-testnet.bharvest.io` *(deploy TBD)*  ·  mainnet: `hl-markets.bharvest.io` *(deploy TBD)*

---

## What it is

Hyperliquid ships HIP-4 outcome markets — prediction markets settled on HyperCore.
The official trade UI lists each outcome separately, has no multi-option grouping,
no AI analytics, no portfolio view, and pops a wallet sign for every trade.
`hl-markets` is the alternative front-end:

**Public (no wallet needed):**
- **Markets / Pending / Historical** tabs — Polymarket-style multi-option question
  cards with % chance per option, sourced from validator-level data.
- **✨ AI Basket Discovery** — type "best ROI today" or just open the tab, and a
  deep-agent pipeline (CoinGecko / FRED / football-data / OpenWeather / Tavily news +
  domain-specific LLM skills) returns a curated, mixed-domain pick list with reasoning,
  fair-price estimates, and Kelly-sized suggestions.
- **⚡ Arb scanner** — auto-detects questions where the sum of all option YES
  prices < $1 (guaranteed-positive basket).
- **⏳ Ending Soon** — markets expiring < 24h with mispricing candidates.

**Connected-wallet:**
- **Sign in** with EIP-712 — one signature → DB-backed session cookie.
- **Enable Trading** with one onboarding sign that registers an agent (API wallet) on
  HL. After that **every trade is popup-free** — agent privkey lives in IndexedDB and
  signs locally. Cash out, cancel, basket bet — all zero-wallet-popup.
- **Bet on X / Cash out** UX (not Buy/Sell) — market IOC + 2% slippage cap, bid-based
  min-notional, multi-level walk for big bets.
- **Multi-leg basket bet** — accumulate legs across pages or get the AI to fill the
  basket for you, then place all N legs in **one agent signature → N independent fills**.
- **Auto-bet** (opt-in) — set daily budget cap + category allow/block + edge threshold;
  the scanner runs every 5 min while your tab is open, agent-signs anything matching.
- **Portfolio** — outcome-only holdings (live mark-to-bid + unrealized PnL), open
  orders with cancel, partial cash out (25/50/75/100% chips), concentration HHI bar,
  recent fills.
- **Per-market chat** — bid-gated ($1+ position required), per-author position badge
  showing the specific outcome + share count + USD value.

**AI layer (sketch)**
```
User opens ✨ AI Basket tab
   ↓
fetchActiveCandidates()        (HF outcomeMeta + allMids — ~200 outcomes)
   ↓
enrichWithSpecialists()        (Phase T: 가벼운 라이브 데이터 fetch, no LLM)
   ↓
pick top 12 promising
   ↓
enrichWithDeepAnalysts()       (Phase U: per-candidate skill + domain fetch + LLM)
   │  ├─ crypto-analyst:   CoinGecko 24h/7d/30d + vol + Tavily ETF/funding/on-chain
   │  ├─ sports-analyst:   football-data 10경기 form + Tavily injury/lineup
   │  ├─ macro-analyst:    FRED 6 obs + MoM/YoY + Tavily consensus
   │  ├─ politics-analyst: Tavily poll/funding/news
   │  └─ weather-analyst:  OpenWeather 24h + NOAA normals
   ↓
askLlmDiscover() final ranking   (mixes all domains into ONE list)
   ↓
6 recommendations: outcome / fair % / edge / reasoning / Kelly USD
   ↓
User clicks "Add all → basket" → 1 agent signature → N filled bets
```

## Revenue model (HIP-4 finding, 2026-05-27)

The HL builder-code fee policy on HIP-4 outcome markets:

| Trade direction | Fee currency | Builder share |
|---|---|---|
| **Buy** YES (USDC → outcome token) | base = outcome token | **0** (builder excluded) |
| **Sell** YES = Cash out (outcome token → USDC) | quote = **USDC** | **100% of fee → builder** (per `approveBuilderFee`) |

→ Every cash out by a hl-markets user accrues 5 bps (default config) USDC to the
builder's referral pool. Claim threshold $1; claimed funds land in builder's spot
balance. Testnet evidence (2026-05-28): `referral.builderRewards = 0.0265665 USDC`
after 2 cash outs totaling ~$31 of notional sold.

Implication: **revenue scales with cash-out volume**, not gross trade. The product
strategy is to make people come back and exit positions — AI discovery + portfolio
+ basket bet are all traffic drivers toward that.

## Architecture

```
USER (mobile + desktop)
   ↓
[ CloudFront / Cloudflare / GH Pages ] ── static SPA (Next.js export)
   ├─→ HF /info direct          (Pending + Markets + l2Book + allMids)
   ├─→ HF /exchange via backend (trade actions, byte-for-byte forward)
   ├─→ api.openai.com / api.anthropic.com  (user own key, browser direct)
   ├─→ api.tavily.com / api.coingecko.com / api.stlouisfed.org / ...
   │   (Phase T/U deep agent data sources, no backend hop)
   └─→ hl-markets-api            (Historical + sessions + /position + /trade-forward + /chat ws)
        ↓
   [ Node 20 process: Hono HTTP + WebSocket + node-cron indexer ]
        ↓
   [ Postgres 15 ]
```

| Piece | Stack |
|---|---|
| Frontend | Next.js 14 App Router, `output: 'export'`, TypeScript strict, Tailwind |
| Wallet bridge | EIP-1193 direct (MetaMask, Phantom-EVM) — no wagmi |
| Agent flow | `viem` keypair gen + IndexedDB store; HL `approveAgent` + L1 sign in browser |
| AI layer | Browser direct → OpenAI/Anthropic + Tavily/CoinGecko/FRED/football-data/OpenWeather |
| Backend | Hono on Node 20 (HTTP + WS + indexer) |
| ORM / DB | Drizzle ORM + Postgres 15 |
| Deploy | Static SPA → S3 + CloudFront. Backend → any container host |

## Repo layout

```
hl-markets/
├── CHARTER.md
├── delegation_matrix.md
├── Makefile                   # verify gate (lint + typecheck + test + build + constitution-gate + bundle-size)
├── docker-compose.yml
├── specs/001-hl-markets/      # spec / plan / contracts / quickstart / tasks
│   └── contracts/             # api.md / data-model.md / outcome-market.md / chat-protocol.md /
│                              # builder-code.md / agent.md / portfolio.md / basket-bet.md /
│                              # ai-analyst.md / news-digest.md / deep-agents.md /
│                              # mainnet-rollout.md / governance.md
├── apps/
│   ├── frontend/              # Next.js static SPA
│   │   ├── app/
│   │   │   ├── page.tsx       # Pending / Markets / Historical / ✨ AI Basket tabs
│   │   │   ├── q/page.tsx     # Question detail (multi-option)
│   │   │   ├── o/page.tsx     # Outcome detail (binary)
│   │   │   ├── g/page.tsx     # Governance detail
│   │   │   ├── portfolio/page.tsx   # Holdings + open orders + cash out
│   │   │   ├── settings/page.tsx    # API keys (own LLM / Tavily / FRED / football / OWM)
│   │   │   └── autobet/page.tsx     # Opt-in auto-bet rule engine
│   │   ├── components/
│   │   │   ├── SimpleTradeWidget.tsx     # Polymarket-style Bet on X / Cash out
│   │   │   ├── TradeWidget.tsx           # Simple ↔ Advanced toggle
│   │   │   ├── EnableTradingModal.tsx    # one-time agent onboarding
│   │   │   ├── BasketSheet.tsx           # floating chip + leg list + place all
│   │   │   ├── AIAnalyzePanel.tsx        # single-outcome AI analysis
│   │   │   ├── AIDiscovery.tsx           # ✨ AI Basket tab content
│   │   │   ├── ArbAlerts.tsx             # cross-outcome sum < $1
│   │   │   ├── EndingSoon.tsx            # < 24h expiry banner
│   │   │   ├── ConcentrationCard.tsx     # HHI + weight bars
│   │   │   ├── AutobetTicker.tsx         # global 5-min background scan
│   │   │   ├── Toaster.tsx               # pub-sub toast layer
│   │   │   ├── ChatPanel.tsx             # per-market chat + position badge
│   │   │   └── SiteHeader.tsx            # Portfolio / Auto-bet / ⚙ Settings nav
│   │   └── lib/
│   │       ├── api.ts / network.ts / outcome-question.ts / liquidity.ts
│   │       ├── wire.ts                   # HL wire-format normalization
│   │       ├── orderbook.ts              # l2Book + walkAsks
│   │       ├── asset-id.ts               # outcomeId * 10 + sideIdx
│   │       ├── agent.ts                  # IndexedDB CRUD (agent privkey)
│   │       ├── signing/
│   │       │   ├── index.ts              # actionHash + phantomAgent + l1Payload (Python parity)
│   │       │   ├── agent-sign.ts         # agent privkey L1 sign
│   │       │   └── user-signed.ts        # approveAgent / approveBuilderFee
│   │       ├── trade.ts                  # placeMarketBuy / placeMarketSell / cancel / basket
│   │       ├── basket.ts                 # localStorage CRUD
│   │       ├── portfolio.ts              # holdings + open orders aggregator
│   │       ├── llm.ts / llm-raw.ts       # provider abstraction (OpenAI / Anthropic)
│   │       ├── search.ts                 # Tavily wrapper
│   │       ├── toast.ts                  # pub-sub channel
│   │       ├── arb.ts                    # cross-outcome sum scanner
│   │       ├── autobet.ts                # rule engine + state
│   │       ├── categorize.ts             # outcome → category (sports/crypto/...)
│   │       ├── specialists.ts            # Phase T light data fetchers
│   │       ├── discovery.ts              # AI Basket pipeline
│   │       └── agents/                   # Phase U deep agents
│   │           ├── types.ts              # AnalystOutput Zod schema
│   │           ├── skills.ts             # 5 domain SKILL prompts
│   │           ├── fetchers.ts           # enriched per-domain data
│   │           └── orchestrator.ts       # category → skill → fetch → LLM → AnalystOutput
│   └── api/                   # Hono backend
│       ├── src/
│       │   ├── index.ts       # HTTP + WS + cron
│       │   ├── routes/        # /health, /governance, /outcome, /question, /auth, /chat,
│       │   │                  # /position, /trade-forward
│       │   ├── chat/          # ws-server, automod, rate-limit, position
│       │   ├── indexer/
│       │   ├── db/            # Drizzle schema + migrations (incl. chat_session, chat_message, chat_admin)
│       │   └── hf/
│       └── Dockerfile
```

## Dev quickstart

Requires Docker + Node 20+.

```bash
# 1. clone
git clone https://github.com/nodebreaker0-0/hl-markets.git
cd hl-markets

# 2. local Postgres
make db
cd apps/api && cp .env.example .env
npm install
npm run db:migrate
npm run dev                              # Hono on :3001 + WS + indexer cron

# 3. frontend (new terminal)
cd ../frontend
cp .env.example .env.local               # set NEXT_PUBLIC_HL_NETWORK=testnet + builder addr
npm install
npm run dev                              # Next.js on :3000
```

Open `http://localhost:3000` — Pending tab is the landing page. The ✨ AI Basket tab
needs an LLM key in /settings to do anything; everything else works without one.

## Verify gate

`make verify` must pass before commit / push:

1. `lint` — eslint on frontend + api
2. `typecheck` — tsc --noEmit on both
3. `test` — vitest (frontend)
4. `build` — `next build` + `docker build` for api
5. `constitution-gate` — no analytics SDKs, no aws-sdk, no key handling in source,
   no hex colors outside Tailwind tokens, byte-for-byte action forward proof, etc.
6. `bundle-size` — frontend gzip ≤ 1.5 MB (Constitution VII)

## Build & deploy

### Frontend — two parallel sites

```bash
# testnet site
cd apps/frontend
NEXT_PUBLIC_HL_NETWORK=testnet \
NEXT_PUBLIC_API_BASE=https://api-testnet.hl-markets.bharvest.io \
NEXT_PUBLIC_BUILDER_ADDR_TESTNET=0xTESTNET_BUILDER \
NEXT_PUBLIC_BUILDER_FEE_BPS=5 \
  npm run build
# → out/ ... upload to s3://hl-markets-testnet/

# mainnet site
NEXT_PUBLIC_HL_NETWORK=mainnet \
NEXT_PUBLIC_API_BASE=https://api.hl-markets.bharvest.io \
NEXT_PUBLIC_BUILDER_ADDR_MAINNET=0xMAINNET_BUILDER \
NEXT_PUBLIC_BUILDER_FEE_BPS=5 \
  npm run build
```

> **Mainnet rollout**: full step-by-step procedure including monitoring + incident
> playbook in [`specs/001-hl-markets/contracts/mainnet-rollout.md`](specs/001-hl-markets/contracts/mainnet-rollout.md).

**Safety checklist** (tick before mainnet `aws s3 sync`):

1. Builder mainnet EOA `clearinghouseState.marginSummary.accountValue ≥ 100 USDC`.
2. `grep -r 0xTESTNET_BUILDER out/_next/static/chunks/` is empty.
3. backend `NODE_ENV=production` + `COOKIE_SECURE=true` + `ALLOWED_ORIGINS` matches.
4. CSP `connect-src` lists only mainnet HF + the AI provider domains you use.
5. CloudFront geo restriction (US / sanctioned countries) ON + disclaimer modal.

### Backend — single Docker image

```bash
cd apps/api
docker build -t hl-markets-api:latest .
docker run -d --name hl-markets-api \
  -e DATABASE_URL='postgres://...' \
  -e ALLOWED_ORIGINS='https://hl-markets.bharvest.io,https://hl-markets-testnet.bharvest.io' \
  -e COOKIE_SECURE=true \
  -e SESSION_JWT_SECRET=<rotate> \
  -e BUILDER_ADDR_MAINNET=0x... \
  -e BUILDER_ADDR_TESTNET=0x... \
  -e BUILDER_MAX_FEE_BPS=5 \
  -e INDEXER_INTERVAL_CRON='*/1 * * * *' \
  -p 3001:3001 \
  hl-markets-api:latest
```

### Postgres tables

| Table | Use |
|---|---|
| `governance` / `vote_snapshot` / `validator_snapshot` | Outcome lifecycle (carry-over) |
| `outcome_market` / `outcome_question` | Per-outcome row + Polymarket-style grouping |
| `chat_session` | DB-backed session (cookie value = ULID, no JWT) |
| `chat_message` | Per-market chat history |
| `chat_admin` | Hard-coded delete-permission whitelist |

## Constitution (highlights)

Full text in `.specify/memory/constitution.md`. Non-negotiable:

- **I. Zero key custody.** Backend never receives a private key or mnemonic.
  EIP-712 sign-in produces a session cookie. Trade actions are signed in the
  browser (main wallet for `approveAgent` + `approveBuilderFee`; agent privkey
  for everything else) and forwarded to HF byte-for-byte.
- **V. Plugin / renderer extensibility.** New variants go through
  `lib/governance/renderers` + `lib/outcome-question.ts`. New AI domains add a
  SKILL + fetcher under `lib/agents/`.
- **VIII. No telemetry.** No analytics SDKs, no Sentry, no GA, no DataDog RUM.
- **IX. Host-agnostic backend.** No `@aws-sdk`, no `aws-cdk-lib`. Plain Docker.
- **XI. Trade safety.** `/trade-forward` forwards user-signed actions
  byte-for-byte to HF `/exchange`. NEVER mutates `order`, `coin`, `side`, `sz`,
  `px`. Only validates the `builder` field against env-configured allowlist.
- **XII. Agent privkey isolation.** Agent privkey lives ONLY in browser
  IndexedDB. Never sent to backend. HL `approveAgent` grants trade/cancel
  rights ONLY — agent cannot withdraw funds.
- **XIII. Single builder per action.** Multi-leg basket bets attach one
  `builder: {b, f}` to the action; never per-leg. Mirror Python SDK.
- **XIV. AI never auto-trades.** LLM output is advisory pre-fill only. Bet
  size is computed client-side (quarter-Kelly). Auto-bet is a separate opt-in
  with explicit daily caps + emergency stop. The LLM never sees a "place"
  instruction.
- **XV. Fetched data is untrusted.** All third-party API output (CoinGecko,
  Tavily, FRED, etc.) is treated as data, never as instructions, in deep-agent
  prompts. Skill prompts state this explicitly.

## Phases (as of 2026-05-28)

| Phase | Status |
|---|---|
| A–C, E–H — explorer + indexer + multi-option grouping | ✓ |
| I — Polish + deploy host pick | pending |
| **J — Live engagement (wallet)** | ✓ |
| &nbsp;&nbsp;J.1 sign-in / J.2 chat backend / J.3 chat UI / J.4 position badge | ✓ |
| &nbsp;&nbsp;J.5 in-app trade (Builder Code) | ✓ (4 silent killers fixed) |
| &nbsp;&nbsp;J.6 Polymarket Simple Mode | ✓ |
| &nbsp;&nbsp;J.7 Agent flow (popup-free) | ✓ |
| &nbsp;&nbsp;J.8 Portfolio + cash out | ✓ |
| &nbsp;&nbsp;J.9 Mainnet rollout doc | ✓ |
| **K — Multi-leg basket bet** | ✓ |
| **M — AI Analyst (own key)** | ✓ (Tier 1 + 2) |
| **N — Arb scanner** | ✓ |
| **O — Auto-bet rule engine** | ✓ |
| **P — Position concentration** | ✓ |
| **Q — Settlement countdown** | ✓ |
| **R — News digest (daily cron)** | spec only |
| **S — AI Basket Discovery (curation)** | ✓ |
| **T — Domain specialists (light data)** | ✓ |
| **U — Deep agents (skill + fetch + LLM)** | ✓ |
| **L — Settled outcome view** | deferred |
| **mainnet deploy** | next milestone |

## License

TBD (planned: MIT).

## Sibling

[`hl-vote-web`](https://github.com/nodebreaker0-0/hl-vote-web) — validator-side
companion for `validatorL1Vote` signing. `hl-markets` is the reader + trader;
`hl-vote-web` is the writer. Same signing primitives (`lib/signing/`), separate apps.

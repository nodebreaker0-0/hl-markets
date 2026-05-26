# hl-markets

> A Polymarket-style public explorer for Hyperliquid HIP-4 **outcome markets**.
> Read-only, mobile-first, no key custody.
>
> testnet: `hl-markets-testnet.bharvest.io` *(deploy TBD)*  ·  mainnet: `hl-markets.bharvest.io` *(deploy TBD)*

---

## What it is

Hyperliquid ships HIP-4 outcome markets — prediction markets settled on HyperCore. The official trade UI lists each outcome separately and doesn't group multi-option questions (CPI bucket, election winner, BTC price band) the way Polymarket does. `hl-markets` fills that gap:

- **Markets** — currently-trading outcomes. Multi-option questions (`outcomeMeta.questions`) shown as one card with options + % chance per option. Standalone binaries listed below.
- **Pending** — outcome governance actions awaiting validator vote (live `validatorL1Votes`). Filtered to `variant === 'outcome'` only — delisting/unknown variants are hidden.
- **Historical** — settled / expired outcome governance from the indexer. Questions persist in DB after HF drops them.

Every fact comes from public HF endpoints. No telemetry, no wallet connect, no signed messages.

> **Pivot note (2026-05-27)**: this repo used to be `hl-gov`, a generic Hyperliquid governance explorer. Phase H made it clear the outcome side was the real value, so the delisting / delegations / EIP-712 polls layer was dropped. See `CHARTER.md` §1.

## Architecture

```
USER (mobile + desktop)
   ↓
[ CloudFront / Cloudflare / GH Pages ] ── static SPA (Next.js export)
   ├─→ HF /info direct        (Pending + Markets — lowest latency)
   └─→ hl-markets-api         (Historical — backed by Postgres)
        ↓
   [ Node 20 process: Hono HTTP + in-process node-cron ]
        ↓
   [ Postgres 15 ]            (local: docker-compose · prod: managed)
```

| Piece | Stack |
|---|---|
| Frontend | Next.js 14 App Router, `output: 'export'`, TypeScript strict, Tailwind |
| Backend | Hono on Node 20 (single process: HTTP + indexer cron) |
| ORM / DB | Drizzle ORM + Postgres 15 |
| Deploy | Static SPA → S3 + CloudFront. Backend → any container host (Railway / Fly / VPS) — single Dockerfile, host-agnostic |

## Repo layout

```
hl-markets/
├── CHARTER.md                 # Project charter (v0.3, post-pivot)
├── CLAUDE.md                  # Agent context
├── Makefile                   # verify gate (lint + typecheck + test + build + constitution-gate + bundle-size)
├── docker-compose.yml         # Postgres 15 for local dev
├── .specify/                  # spec-kit metadata + constitution
├── specs/001-hl-markets/      # spec / plan / contracts / quickstart / tasks
├── apps/
│   ├── frontend/              # Next.js static SPA
│   │   ├── app/
│   │   │   ├── page.tsx       # Pending / Markets / Historical tabs
│   │   │   ├── q/page.tsx     # Question detail (multi-option)
│   │   │   ├── o/page.tsx     # Outcome detail (binary)
│   │   │   └── g/page.tsx     # Governance detail
│   │   ├── components/        # SiteHeader, Hero, GovernanceCard, OutcomePriceChart, MiniOrderbook, ...
│   │   └── lib/
│   │       ├── api.ts         # HF /info + backend wrappers
│   │       ├── network.ts     # NEXT_PUBLIC_HL_NETWORK → CURRENT_NETWORK
│   │       ├── outcome-question.ts   # priceBucket/priceBinary DSL parser
│   │       ├── liquidity.ts          # ask-side walk + max profit
│   │       └── governance/    # variant renderer registry (outcome/delisting/unknown)
│   └── api/                   # Hono backend
│       ├── src/
│       │   ├── index.ts       # app entry (HTTP + cron)
│       │   ├── routes/        # /health, /governance, /outcome, /question
│       │   ├── indexer/       # runGovernance, runValidators, runOutcomes, linkDeployments
│       │   ├── db/            # Drizzle schema + migrations
│       │   └── hf/            # HF /info wrappers
│       └── Dockerfile
```

## Dev quickstart

Requires Docker + Node 20+.

```bash
# 1. clone
git clone https://github.com/nodebreaker0-0/hl-markets.git
cd hl-markets

# 2. local Postgres
make db                                  # docker compose up -d postgres
cd apps/api && cp .env.example .env      # uses postgres://hl_gov:dev@localhost:5432/hl_gov
npm install
npm run db:migrate                       # apply 0000 + 0001 migrations
npm run dev                              # Hono on :3001 + indexer cron every minute

# 3. frontend (new terminal)
cd ../frontend
cp .env.example .env.local               # set NEXT_PUBLIC_HL_NETWORK=testnet
npm install
npm run dev                              # Next.js on :3000
```

Open `http://localhost:3000` — you'll land on the Pending tab. The indexer takes one minute to fill its first round, so Historical starts empty.

## Verify gate

`make verify` must pass before commit / push:

1. `lint` — eslint on frontend + api
2. `typecheck` — tsc --noEmit on both
3. `test` — vitest (frontend)
4. `build` — `next build` + `docker build` for api
5. `constitution-gate` — see `Makefile` (no analytics SDKs, no aws-sdk, no key handling in source, no hex colors outside Tailwind tokens, etc.)
6. `bundle-size` — frontend gzip < 1.5 MB

## Build & deploy

### Frontend — two parallel sites

```bash
# testnet site
cd apps/frontend
NEXT_PUBLIC_HL_NETWORK=testnet \
NEXT_PUBLIC_API_BASE=https://api-testnet.hl-markets.bharvest.io \
  npm run build
# → out/ … upload to s3://hl-markets-testnet/ + invalidate CloudFront

# mainnet site
NEXT_PUBLIC_HL_NETWORK=mainnet \
NEXT_PUBLIC_API_BASE=https://api.hl-markets.bharvest.io \
  npm run build
# → out/ … upload to s3://hl-markets/ + invalidate CloudFront
```

`NEXT_PUBLIC_HL_NETWORK` is read at build time by `lib/network.ts`; the choice is baked into the SPA bundle, so there is no in-app network switcher.

### Backend — single Docker image

```bash
cd apps/api
docker build -t hl-markets-api:latest .
docker run -d --name hl-markets-api \
  -e DATABASE_URL='postgres://<user>:<pw>@<host>:5432/<db>?sslmode=require' \
  -e ALLOWED_ORIGINS='https://hl-markets.bharvest.io,https://hl-markets-testnet.bharvest.io' \
  -e INDEXER_INTERVAL_CRON='*/1 * * * *' \
  -p 3001:3001 \
  hl-markets-api:latest
```

The same image runs on Railway / Fly / Render / a plain VPS — host choice is open.

### Postgres tables

Five tables, three of them in active use:

| Table | Use |
|---|---|
| `governance` | Outcome variant governance (pending / settled / expired) |
| `vote_snapshot` | Per-tick voter snapshot for quorum bar on Historical cards |
| `validator_snapshot` | Validator metadata (name, stake) for voter names |
| `outcome_market` | One row per outcome. `deployGovId` / `settleGovId` link to `governance` when name+sideNames match |
| `outcome_question` | Polymarket-style question grouping mirror; survives after HF removes settled questions |
| `poll_vote` | Deprecated — leftover from the v0.2 (hl-gov) Phase G virtual polls; will be dropped in the next migration |

## Constitution (highlights)

Full text in `.specify/memory/constitution.md`. Non-negotiable:

- **I. Zero key custody.** Backend never receives a private key, mnemonic, or agent key.
- **V. Plugin / renderer extensibility.** New outcome shapes go through `lib/governance/renderers` + `lib/outcome-question.ts`. One file per variant.
- **VIII. No telemetry.** No analytics SDKs, no Sentry, no GA, no DataDog RUM — checked by the gate.
- **IX. Host-agnostic backend.** No `@aws-sdk`, no `aws-cdk-lib`, no host-specific bindings. Plain Docker image; deploy anywhere.

## Phases (as of 2026-05-27)

| Phase | Status |
|---|---|
| A — Charter / spec-kit | ✓ |
| B — Frontend skeleton + HL tone | ✓ |
| C — Live data (no backend) | ✓ |
| D — Delegation lookup | **removed in pivot** |
| E — Local backend (Postgres + Hono) | ✓ |
| F — Historical via backend | ✓ |
| G — EIP-712 virtual polls | **removed in pivot** |
| H.1 — Outcome detail (binary) | ✓ |
| H.2 — Question grouping (Polymarket multi-option) | ✓ |
| H.3 — Backend persists `outcome_question` | ✓ |
| I — Polish + deploy host pick | pending |

## License

TBD (planned: MIT).

## Sibling

[`hl-vote-web`](https://github.com/nodebreaker0-0/hl-vote-web) — the validator-side companion: a tiny static SPA that lets a validator key holder sign `validatorL1Vote` actions. `hl-markets` is the reader, `hl-vote-web` is the writer; they don't share infra.

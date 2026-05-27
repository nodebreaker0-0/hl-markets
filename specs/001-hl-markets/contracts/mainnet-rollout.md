# Mainnet Rollout — operator runbook

> Phase J.9. testnet 에서 J.5/J.6/J.7/J.8 (Builder Code · Polymarket Simple Mode · Agent flow · Portfolio + cash out) 검증이 완료된 상태에서 mainnet 으로 트래픽을 켜는 절차.
>
> 운영자(builnad) 1인 기준. 모든 step 은 우리(we) 가 직접 손으로 실행한다 — CI/CD 자동화 없음.
> Sibling: `builder-code.md`, `agent.md`, `portfolio.md`. Constitution: `.specify/memory/constitution.md`.

---

## 0. TL;DR

```
[ Prereqs OK? ]──no──→ §1 으로 돌아가 채울 것
       │ yes
       ▼
[ Frontend mainnet build + S3 sync + CF invalidate ]   §2
       │
       ▼
[ Backend mainnet deploy (prod env, migration, run) ]  §3
       │
       ▼
[ CSP / CORS smoke test ]                              §4
       │
       ▼
[ Constitution gate: env mismatch 없음 확인 ]          §5
       │
       ▼
[ Monitoring loop on ]                                 §6
       │
       ▼
[ 사고 발생 시 §7 incident / §8 rollback ]
```

---

## 1. Prereqs

운영자가 mainnet 빌드 *시작 전에* 반드시 갖춰야 할 항목들. 빠진 게 있으면 빌드 중단.

### 1.1 Builder EOA — mainnet 전용

- mainnet builder EOA 주소 1개 확보. **testnet EOA 와 절대 같으면 안 됨** (§5 gate 가 막음).
- mainnet builder EOA 의 perp account value **≥ 100 USDC** (HL 정책. 안 채우면 builder fee 가 silently 무시됨).
- 확인 명령 (Python SDK or curl):
  ```bash
  curl -sX POST https://api.hyperliquid.xyz/info \
    -H 'content-type: application/json' \
    -d '{"type":"clearinghouseState","user":"0xMAINNET_BUILDER"}' \
    | jq '.marginSummary.accountValue'
  # → 100 이상이어야 함
  ```
- testnet builder EOA 도 동일하게 ≥ 100 testnet USDC 유지 (rollback 시 살아 있어야 함).

### 1.2 호스팅 결정

- 정적 사이트: S3 + CloudFront (default 가정) 또는 Cloudflare Pages / GH Pages.
- 도메인: `hl-markets.bharvest.io` (mainnet). testnet 은 `hl-markets-testnet.bharvest.io` 유지.
- TLS 인증서 (ACM 또는 CF) 발급 + CloudFront distribution origin 확인.
- Backend host: Railway / Fly / VPS — 단일 Docker 이미지 (§3.2). prod DNS `api.hl-markets.bharvest.io`.

### 1.3 Secrets 회전

testnet 에서 쓰던 secret 을 그대로 mainnet 으로 가져가지 않는다. 새로 발급:

| Secret | testnet 값 | mainnet 값 |
|---|---|---|
| `DATABASE_URL` | local docker postgres | **prod managed Postgres** (RDS / Neon / Supabase) |
| `SESSION_JWT_SECRET` | dev 임의값 | `openssl rand -hex 32` 새로 생성 |
| Builder EOA | testnet EOA | **별도 mainnet EOA (§1.1)** |

회전 후 `.env.example` 의 placeholder 만 갱신, 실제 값은 절대 commit 금지 (Constitution I).

### 1.4 코드 freeze

- `git status` clean. `make verify` green.
- 현재 commit hash 기록 (rollback 시 reference): `git rev-parse HEAD` → `MAINNET_LAUNCH_SHA` 로 어딘가 (Notion / 사적 메모) 박아둠.

---

## 2. Frontend — mainnet build

Next.js static export. build-time 에 env 가 bundle 에 박히므로 한 번 build 하면 그 결과물은 mainnet 전용이다.

### 2.1 Env 준비

`apps/frontend/.env.production` (gitignored) 또는 inline:

```bash
NEXT_PUBLIC_HL_NETWORK=mainnet
NEXT_PUBLIC_API_BASE=https://api.hl-markets.bharvest.io
NEXT_PUBLIC_BUILDER_ADDR_TESTNET=0xTESTNET_BUILDER...   # 둘 다 박아둠 — §5 gate 가 검증
NEXT_PUBLIC_BUILDER_ADDR_MAINNET=0xMAINNET_BUILDER...   # ← 실제 사용되는 값
NEXT_PUBLIC_BUILDER_FEE_BPS=5
NEXT_PUBLIC_BUILDER_MAX_FEE_PCT_STR=0.01%
```

> `lib/network.ts` 가 `NEXT_PUBLIC_HL_NETWORK` 만으로 `CURRENT_NETWORK` 를 결정한다. mainnet build 결과물에는 testnet 분기 코드가 dead-code elimination 되지 않을 수 있으니 (둘 다 string literal) `NEXT_PUBLIC_BUILDER_ADDR_TESTNET` 은 그래도 채워두자 — 단, 실제 호출 경로에는 진입하지 않는다.

### 2.2 Build + deploy

```bash
cd apps/frontend

# 1. clean
rm -rf .next out

# 2. mainnet build
NEXT_PUBLIC_HL_NETWORK=mainnet \
NEXT_PUBLIC_API_BASE=https://api.hl-markets.bharvest.io \
NEXT_PUBLIC_BUILDER_ADDR_MAINNET=0xMAINNET_BUILDER \
NEXT_PUBLIC_BUILDER_ADDR_TESTNET=0xTESTNET_BUILDER \
NEXT_PUBLIC_BUILDER_FEE_BPS=5 \
NEXT_PUBLIC_BUILDER_MAX_FEE_PCT_STR=0.01% \
  npm run build

# 3. bundle 안에 testnet builder addr 가 진짜 사용 경로로 박혔는지 grep 으로 확인 (sanity)
grep -ro "0xMAINNET_BUILDER" out/_next | head
grep -ro "https://api.hyperliquid-testnet.xyz" out/_next | head   # ← 비어 있어야 함

# 4. S3 sync (delete: 옛 chunk 정리)
aws s3 sync out/ s3://hl-markets-prod/ \
  --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "*.html" \
  --exclude "*.txt"

# 5. HTML 은 캐시 짧게 (배포 즉시 반영되도록)
aws s3 sync out/ s3://hl-markets-prod/ \
  --exclude "*" \
  --include "*.html" \
  --include "*.txt" \
  --cache-control "public,max-age=60"

# 6. CloudFront invalidate
aws cloudfront create-invalidation \
  --distribution-id E_MAINNET_DIST_ID \
  --paths "/*"
```

### 2.3 Smoke test

`https://hl-markets.bharvest.io` 열어서:

- DevTools Network 탭: `/info` 요청이 `api.hyperliquid.xyz` (mainnet) 로 가는지 확인. testnet 으로 가면 build 잘못된 거 — §5 gate 가 누락된 것.
- Trade widget 열어서 confirm 모달의 "Builder fee" 문구에 mainnet EOA 가 나오는지 (또는 fee bps 만 명시되더라도 §5 gate 가 검증).
- Portfolio 페이지 — 빈 페이지가 떠야 함 (mainnet 에선 아직 우리가 trade 한 게 없으므로).

---

## 3. Backend — mainnet deploy

### 3.1 Env vars (prod)

```bash
NODE_ENV=production
PORT=3001
DATABASE_URL=postgres://<user>:<pw>@<host>:5432/<db>?sslmode=require
ALLOWED_ORIGINS=https://hl-markets.bharvest.io           # mainnet 만. testnet 도 같은 백엔드 쓸 거면 콤마 추가.
SESSION_JWT_SECRET=<openssl rand -hex 32 결과>
COOKIE_SECURE=true                                       # HTTPS 강제
BUILDER_ADDR_MAINNET=0xMAINNET_BUILDER
BUILDER_ADDR_TESTNET=0xTESTNET_BUILDER
BUILDER_MAX_FEE_BPS=10                                   # frontend default 5 보다 살짝 여유, 절대 100 초과 X
INDEXER_INTERVAL_CRON=*/1 * * * *
INDEXER_ENABLED=true
```

### 3.2 DB migration

```bash
cd apps/api

# prod DATABASE_URL 을 임시로 export 해서 migration 만 돌림
DATABASE_URL='postgres://...?sslmode=require' npm run db:migrate

# 결과: 0000 + 0001 (+ 향후 마이그) 모두 applied. drizzle 의 __drizzle_migrations 테이블 확인.
psql "$DATABASE_URL" -c 'select * from __drizzle_migrations;'
```

### 3.3 Build + run (Docker)

```bash
cd apps/api
docker build -t hl-markets-api:mainnet-$(git rev-parse --short HEAD) .

docker run -d --name hl-markets-api \
  --restart unless-stopped \
  -e NODE_ENV=production \
  -e PORT=3001 \
  -e DATABASE_URL='postgres://...?sslmode=require' \
  -e ALLOWED_ORIGINS='https://hl-markets.bharvest.io' \
  -e SESSION_JWT_SECRET='<32-byte hex>' \
  -e COOKIE_SECURE=true \
  -e BUILDER_ADDR_MAINNET=0xMAINNET_BUILDER \
  -e BUILDER_ADDR_TESTNET=0xTESTNET_BUILDER \
  -e BUILDER_MAX_FEE_BPS=10 \
  -e INDEXER_INTERVAL_CRON='*/1 * * * *' \
  -e INDEXER_ENABLED=true \
  -p 3001:3001 \
  hl-markets-api:mainnet-<sha>
```

Reverse proxy (nginx / Caddy / 호스팅 빌트인) 에서 `api.hl-markets.bharvest.io` → `:3001` 라우팅.

### 3.4 Smoke test

```bash
# health (현재는 index 가 200 OK 만 — §6 에서 /health 추가 권장)
curl -i https://api.hl-markets.bharvest.io/

# CORS
curl -i https://api.hl-markets.bharvest.io/governance/recent \
  -H 'origin: https://hl-markets.bharvest.io'
# → Access-Control-Allow-Origin: https://hl-markets.bharvest.io

# Indexer 1분 후 row 들어왔는지
psql "$DATABASE_URL" -c 'select count(*) from governance;'
```

---

## 4. CSP / CORS 점검

### 4.1 CSP (frontend)

`next.config.mjs` 의 CSP 가 mainnet host 들과 일치하는지 확인. 최소:

```
default-src 'self';
script-src 'self' 'unsafe-inline';                              -- Next.js static export 요건
connect-src 'self'
  https://api.hyperliquid.xyz
  https://api-ui.hyperliquid.xyz
  wss://api.hyperliquid.xyz
  https://api.hl-markets.bharvest.io
  wss://api.hl-markets.bharvest.io;
img-src 'self' data: https://*.hyperliquid.xyz;
style-src 'self' 'unsafe-inline';
frame-ancestors 'none';
```

> testnet 도메인 (`api.hyperliquid-testnet.xyz`) 은 mainnet 빌드의 CSP 에서 **빼는 게 깔끔하다** — 안 빼도 보안상 치명적이진 않지만 §5 gate 의 정신과 일치시키자.

### 4.2 CORS (backend)

- `ALLOWED_ORIGINS` 는 정확한 https origin (스킴 + 도메인) 만. 와일드카드 X.
- `OPTIONS` preflight 응답이 `Access-Control-Allow-Credentials: true` 포함하는지 (세션 쿠키 보내야 함).
- `Set-Cookie` 가 `Secure; HttpOnly; SameSite=None` 인지 확인 (`COOKIE_SECURE=true` 효과).

### 4.3 Cookie 점검

DevTools → Application → Cookies → `hl-markets.bharvest.io`:
- `session=...` 이 떠야 함. wallet sign-in 직후.
- Domain 이 `.bharvest.io` 가 아니라 정확히 `api.hl-markets.bharvest.io` (또는 backend 호스트) 인지.
- Expires / Max-Age 가 의도한 값인지.

---

## 5. Constitution gate — env mismatch detection

**제일 위험한 사고는 testnet builder EOA 가 mainnet 빌드에 박혀 mainnet trade fee 가 testnet EOA 로 흘러가는 것 (or 반대).** 막을 수 있는 모든 자동 가드를 두자.

### 5.1 빌드 시 sanity check (수동)

위 §2.2 step 3 의 grep 외에, 빌드 직후 한 줄로:

```bash
# mainnet build out/ 에 testnet builder addr 가 실제 코드 경로로 박혀 있으면 fail
if grep -rq "0xTESTNET_BUILDER_LOWERCASE" out/_next/static/chunks/ ; then
  echo "FAIL: testnet builder addr leaked into mainnet bundle"
  exit 1
fi
```

> 단순 string 등장은 dead-code 분기일 수도 있어 false positive 가능. 보수적으로 검토.

### 5.2 런타임 self-check (frontend)

`lib/builder.ts` 가 boot 시 다음 assertion 을 console 에 찍게:

```ts
import { CURRENT_NETWORK } from './network'
import { BUILDER_ADDR } from './builder'

if (CURRENT_NETWORK === 'mainnet' && BUILDER_ADDR.toLowerCase() === process.env.NEXT_PUBLIC_BUILDER_ADDR_TESTNET?.toLowerCase()) {
  // Should never happen. 사용자가 trade 못 하도록 throw.
  throw new Error('Constitution XI violated: testnet builder addr in mainnet build')
}
```

### 5.3 Backend self-check

`apps/api/src/index.ts` boot 시:

```ts
if (process.env.NODE_ENV === 'production' && !process.env.COOKIE_SECURE) {
  throw new Error('COOKIE_SECURE must be true in production')
}
if (process.env.NODE_ENV === 'production' && process.env.ALLOWED_ORIGINS?.includes('localhost')) {
  throw new Error('ALLOWED_ORIGINS includes localhost in production')
}
```

이 두 self-check 는 J.9 Polish 항목으로 별도 Task 로 떼서 구현.

### 5.4 Constitution 항목 매핑

| Constitution | mainnet rollout 관련 |
|---|---|
| I. Zero key custody | backend env 에 private key / mnemonic 절대 X — agent 키도 IndexedDB only |
| VIII. No telemetry | mainnet 에 GA / Sentry / RUM 붙이지 말 것 |
| IX. Host-agnostic backend | Docker 이미지 그대로 — aws-sdk 등 호스트 종속 dep 추가 X |
| XI. Action immutability | `/trade-forward` 가 action mutate 안 함 — mainnet 에서도 동일 |

---

## 6. Monitoring

운영 자동화 X. 사람이 1일 1회 손으로 본다는 가정.

### 6.1 추후 추가 권장: `/health` endpoint

현재 backend 는 `/` 만 있다. mainnet 가기 전 또는 J.9 polish 로 다음 추가:

```ts
app.get('/health', async (c) => {
  const dbOk = await db.execute(sql`select 1`).then(() => true).catch(() => false)
  return c.json({
    ok: dbOk,
    network: 'mainnet',           // env 기준
    git: process.env.GIT_SHA ?? 'unknown',
    indexerLastRun: indexerState.lastRunAt,
  })
})
```

### 6.2 매일 확인할 항목

```bash
# 1. Backend health
curl -s https://api.hl-markets.bharvest.io/health | jq

# 2. Builder perp account value (가장 critical — 100 USDC 밑으로 떨어지면 fee 무시됨)
curl -sX POST https://api.hyperliquid.xyz/info \
  -H 'content-type: application/json' \
  -d '{"type":"clearinghouseState","user":"0xMAINNET_BUILDER"}' \
  | jq '.marginSummary.accountValue'

# 3. Builder fee 누적 (referral state)
curl -sX POST https://api.hyperliquid.xyz/info \
  -H 'content-type: application/json' \
  -d '{"type":"referral","user":"0xMAINNET_BUILDER"}' \
  | jq '.builderRewards'

# 4. Agent 수 (Trade 한 unique user 의 prox — chat_session 또는 별도 테이블)
psql "$DATABASE_URL" -c "select count(distinct address) from chat_session where created_at > now() - interval '1 day';"

# 5. Error rate — /trade-forward 4xx/5xx
# nginx / caddy access log 에서 grep, 또는 backend 가 stdout 으로 찍은 걸 docker logs
docker logs hl-markets-api --since 24h 2>&1 | grep -E '"POST /trade-forward"' | awk '{print $9}' | sort | uniq -c
```

### 6.3 임계치 (가이드)

| 지표 | 정상 | 경고 | 사고 |
|---|---|---|---|
| Builder perp account value | ≥ 150 USDC | 100–150 | < 100 → fee 무시됨, §7.2 |
| `/trade-forward` 422 rate | < 5% | 5–20% | > 20% → §7.3 |
| `/trade-forward` 5xx | 0 | 1–2 건/일 | > 5 건/일 |
| Indexer lastRun | < 2 min ago | 2–10 min | > 10 min → backend 죽음 가능성 |
| Agent count daily | 임의 (start 0) | — | 갑작스러운 spike → abuse 의심 |

---

## 7. Incident playbook

### 7.1 HF outage (api.hyperliquid.xyz down)

증상: frontend 가 markets 못 불러옴 / trade 안 됨.

```
1. https://status.hyperliquid.xyz 확인 (있다면) / Hyperliquid Discord 확인.
2. HF outage 이면 → 우리가 할 일 없음. 사용자에게 상단 배너:
   "Hyperliquid is currently unreachable. Trading paused."
   → 정적 사이트라 hot-patch 어려움. 임시로 backend `/health` 가 hf:false 반환하면
     frontend 가 banner 띄우는 hook 을 J.9 polish 로 만들어 둘 것.
3. HF 복귀 시 자동 회복 (캐시 없음).
```

### 7.2 Builder EOA 자금 부족 (< 100 USDC)

증상: trade 는 성공하는데 builder fee 가 안 쌓임 (referral state 정체).

```
1. clearinghouseState 로 accountValue 재확인.
2. mainnet builder EOA 로 USDC perp 입금 — Hyperliquid 공식 UI 사용
   (별도 wallet 에서 builder EOA 로 transfer + perp deposit).
3. 입금 직후 한 건 testnet 이 아닌 mainnet 에서 작은 fill 실행.
4. referral state 의 `builderRewards` 가 다시 증가하는지 5분 후 확인.
```

### 7.3 Agent flow 망가짐 (/trade-forward 422 폭증)

가장 흔한 원인: HL 가 action shape / signing 룰 변경 (chainId, msgpack 순서, builder field 위치 등).

```
1. docker logs 에서 422 본문 확인 — HF 가 보낸 에러 메시지가 들어 있음.
2. 메시지가 "User does not exist" / "Invalid signature" 류 → agent 키 만료 가능.
   사용자 측에서 EnableTradingModal 재실행 (lib/agent.ts 의 invalidate hook).
3. 메시지가 "Builder fee too high" / "Builder not approved" → §1.1 의 maxFeeRate 한도 점검.
   `info maxBuilderFee` 로 user 별 approval 확인.
4. HL signing 룰 변경이 의심되면 → 즉시 backend `INDEXER_ENABLED=false` 로 안전 모드
   (indexer 는 trade 와 무관하지만 동시 사고면 격리), trade 기능 disable 배너.
5. 정상화 commit 후 §2 / §3 재배포.
```

### 7.4 DB 장애

```
1. psql 접근 안 됨 / 매니지드 콘솔에서 instance down 확인.
2. backend `/health` 가 db:false → frontend 의 Historical 탭이 비어 보임 (Markets/Pending 은 HF 직접 조회라 영향 X).
3. 매니지드 DB provider 의 콘솔에서 restart / restore 진행.
4. DB 회복 후 indexer 가 자동으로 catch-up — 별도 작업 없음 (1분 cron).
```

### 7.5 Frontend bundle 사고 (CSP / chunk hash mismatch)

```
1. CloudFront / S3 의 이전 버전이 캐시되어 있을 수 있음 — invalidate `/*` 재실행.
2. 그래도 안 되면 §8 rollback.
```

---

## 8. Rollback

mainnet 에서 어떤 사고든 30분 내 회복 불가하면 testnet 으로 트래픽 돌린다.

### 8.1 옵션 A — DNS 수준 (가장 깔끔)

```
1. Route53 / Cloudflare DNS:
   - hl-markets.bharvest.io  →  현재 mainnet CF dist
   - 대신 testnet CF dist 의 alternate domain 에 hl-markets.bharvest.io 일시 추가
2. TTL 짧게 (60s) — 미리 평시에 낮춰둘 것.
3. Banner 띄우기: "Switched to testnet temporarily — no real funds at risk."
```

### 8.2 옵션 B — S3 bucket 교체

```
1. CloudFront origin 을 s3://hl-markets-prod 에서 s3://hl-markets-testnet 로 변경.
2. invalidate /*.
3. 이 경우 build-time NEXT_PUBLIC_API_BASE 가 testnet api 를 가리키는지 확인 — 안 그러면 broken.
```

### 8.3 옵션 C — 기능별 kill switch

trade 만 사고면 frontend 의 TradeWidget 자체를 disable 하는 env flag (`NEXT_PUBLIC_TRADE_DISABLED=true`) 추가 + rebuild. read-only 모드.

### 8.4 Rollback 후 post-mortem

- `MAINNET_LAUNCH_SHA` 와 사고 commit 사이 diff 확인.
- 재발 방지 task 를 J.9 polish 로 추가.
- testnet 으로 돌렸으면 user 대상 공지 (Discord / X) 24h 내.

---

## 9. Compliance

### 9.1 지역 차단

HL 본체가 US/제재 지역 차단을 IP 기반으로 한다. 우리도 그에 준한다:

- CloudFront 의 **Geo Restriction**:
  - Block: `US`, `IR`, `KP`, `SY`, `CU` (HL 기준에 맞춰 정기 갱신).
  - Allow: 그 외 전부.
- Backend `app.use` 에 country 헤더 (CloudFront 의 `CloudFront-Viewer-Country`) 검사하는 middleware 추가:
  ```ts
  app.use('*', async (c, next) => {
    const country = c.req.header('cloudfront-viewer-country')
    if (BLOCKED_COUNTRIES.has(country ?? '')) {
      return c.json({ error: 'region_blocked' }, 451)
    }
    return next()
  })
  ```

### 9.2 HL prediction market terms

- HL 의 prediction market terms (HIP-4 outcome 시장 약관) 를 README 푸터 / Trade 모달에 링크.
- "No US persons / No restricted jurisdictions" 문구.
- Trade widget 의 첫 사용 시 1회 disclaimer modal — "By trading you confirm you are not located in a restricted jurisdiction." (UI 만, signed acknowledge 까진 안 함 — Constitution I.)

### 9.3 데이터 보관

- backend 에 저장되는 PII 는 **wallet address 뿐** (chat_session, agent_session 등). KYC 정보 없음.
- DB backup 보관 정책: 매니지드 provider default (보통 7일) 그대로. 별도 백업 안 함 — 데이터 복원성보다 minimalism 우선 (governance/outcome 데이터는 HF 에서 재인덱싱 가능).

---

## Appendix A — env mismatch quick reference

| 변수 | testnet | mainnet |
|---|---|---|
| `NEXT_PUBLIC_HL_NETWORK` | `testnet` | `mainnet` |
| `NEXT_PUBLIC_API_BASE` | `https://api-testnet.hl-markets.bharvest.io` | `https://api.hl-markets.bharvest.io` |
| HF endpoint (lib/network.ts) | `api.hyperliquid-testnet.xyz` | `api.hyperliquid.xyz` |
| Builder EOA | `BUILDER_ADDR_TESTNET` | `BUILDER_ADDR_MAINNET` |
| `NODE_ENV` (backend) | `development` | `production` |
| `COOKIE_SECURE` | `false` | `true` |
| `ALLOWED_ORIGINS` | `http://localhost:3000,https://hl-markets-testnet.bharvest.io` | `https://hl-markets.bharvest.io` |
| DB | local docker postgres | managed Postgres + sslmode=require |

## Appendix B — launch checklist (print + tick)

```
[ ] §1.1 builder mainnet EOA ≥ 100 USDC perp 확인
[ ] §1.3 SESSION_JWT_SECRET 새로 생성
[ ] §1.4 git status clean, make verify green, MAINNET_LAUNCH_SHA 기록
[ ] §2.2 frontend mainnet build + bundle grep sanity
[ ] §2.2 S3 sync + CloudFront invalidate
[ ] §2.3 smoke test (HF 호출이 mainnet 으로 가는지)
[ ] §3.2 prod DB migration applied
[ ] §3.3 backend Docker container running
[ ] §3.4 backend smoke test (CORS, indexer row 증가)
[ ] §4.1 CSP 에 mainnet host 만 들어 있는지
[ ] §4.2 cookie Secure/HttpOnly/SameSite=None
[ ] §5.1 testnet builder addr bundle leak grep 없음
[ ] §6.2 monitoring 1일차 baseline 캡쳐
[ ] §9.1 CloudFront geo restriction enabled
[ ] §9.2 disclaimer modal 노출
```

## References

- Constitution: `.specify/memory/constitution.md`
- Builder Code 셋업: `./builder-code.md`
- Agent flow: `./agent.md`
- Portfolio: `./portfolio.md`
- HL referral state: `{"type":"referral","user":"0x..."}`
- HL builder docs: <https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes>

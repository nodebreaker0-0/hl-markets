# hl-markets Constitution

## Core Principles

### I. Backend Has Zero Key Custody (NON-NEGOTIABLE)

hl-markets 의 백엔드는 사용자의 private key, mnemonic, agent key 를 **절대 받지 않는다**. 모든 sign 은 client-side wallet 에서 발생하고, 서버는 (a) signed payload + signature 만 받거나 (b) 사용자가 만든 HL action JSON 을 byte-for-byte 그대로 HF `/exchange` 로 forward 한다. **key 가 서버에 도달하는 path 자체가 존재하지 않는다**.

### II. Signed Messages Over Trust (NON-NEGOTIABLE)

모든 mutating action 은 검증 가능한 signature 로 인증한다:

- **Phase J.1 session sign-in**: EIP-712 typed-data 1회 sign → backend recovery → JWT (HttpOnly cookie, 24h) 발급. JWT 안에 recovered address.
- **Phase J.2 chat message**: session JWT 만 검증. 메시지마다 EIP sign 불요 (UX trade-off, 토큰은 wallet ownership 증명을 이미 cover).
- **Phase J.5 trade**: HL action signing (1337 chainId, validator-spec) → backend 가 sig + action JSON 받아 `/exchange` 그대로 forward, 검증은 HF 책임.

Long-lived token 은 24h TTL + DB 의 `chat_session` row 로 revoke 가능. 그 이상은 재-sign.

### III. Idempotent Reads

API 의 모든 GET 호출은 idempotent + cacheable. CloudFront / Cloudflare 등 edge cache 가 안전하게 캐싱 가능. side effect 는 POST 에만.

### IV. Network Selector Explicit

UI 의 testnet / mainnet 토글은 default 없음. 사용자가 명시 클릭. 색 / URL 으로 강한 시각 단서 (testnet=노랑, mainnet=빨강). 잘못된 network 로 가상투표하면 결과 무의미.

### V. Plugin / Renderer Extensibility (NON-NEGOTIABLE)

거버넌스 variant 추가 (`O`, `D`, 향후 `G`, `X`, ...) 는 코드 한 파일 추가로 끝나야 한다:
- `apps/frontend/lib/governance/renderers/<variant>.tsx` — detail view
- `apps/frontend/lib/governance/classify.ts` — 분류 매핑
- `apps/api/src/indexer/variant-handlers/<variant>.ts` — 인덱싱 시 별도 추출 필요 시

핵심 코드 (`index`, `api routes`, `db schema`) 는 새 variant 마다 변경 X.

### VI. Mobile-First

모든 화면이 < 380px 너비에서 작동. Tailwind sm/md/lg breakpoint 활용. desktop 은 보너스. 한 손 사용 가능.

### VII. HL Brand Tokens

색 / 폰트 / 톤은 HL 시그니처 — 다크 background (`#0F1A1F`) + 민트 accent (`#97FCE4`). Polymarket UX 패턴은 **layout / 정보 구조만** 차용, 색 / 폰트 가져오지 않는다.

### VIII. No Telemetry

외부 analytics SDK (Google Analytics, Sentry, RUM, Datadog 등) 0개. bug report 는 GitHub issue. 사용자 행동 추적 X.

### IX. Host-Agnostic (NON-NEGOTIABLE)

backend artifact 는 단일 Docker image. Mac local (`docker-compose up`), Railway, Fly, AWS ECS, self-hosted VPS 어디든 docker run 으로 동작. host-specific 코드 (CDK / DynamoDB query / EventBridge handler / S3 SDK 등) 0건. 환경 차이는 `.env` 한 곳에서 흡수.

### X. Tier Gating

Phase A → B → C → E → F → H → I → J 순서 (D, G 는 v0.3 pivot 에서 제거). Phase J 도 하위 J.1 → J.2 → J.3 → J.4 → J.5 순서.

### XI. Trade Safety (NON-NEGOTIABLE)

Phase J.5 의 backend `/trade-forward` route 는:
1. 사용자가 sign 한 action JSON 을 **byte-for-byte 보존**하여 HF `/exchange` 로 forward. `coin`, `side`, `sz`, `px`, `tif` 어떤 필드도 수정 금지.
2. `builder` 필드는 (configured Builder Code 값이 env 에 있고 사용자가 UI 에서 "Apply builder fee" 체크박스를 명시 활성화한 경우에만) action 옆에 사용자가 sign 하기 *전* UI 가 표시. backend 가 임의 추가 금지.
3. HF 의 응답 (성공/실패) 을 사용자에게 그대로 노출. backend 가 응답 마사지 0.
4. UI 는 sign 전에 (a) order 4 fields, (b) builder fee bps + 예상 비용 USD, (c) target asset key 4 항목을 prominent 하게 표시.

## Operational Constraints

- **Bundle size (frontend)**: gzip 후 < 1.5 MB (Polymarket-style chart 라이브러리 포함하니 vote-web 보다 살짝 큼).
- **Browser support**: 모바일 Chromium / Safari iOS + 데스크탑 Chrome / Edge / Brave / Firefox.
- **Hosting target**: frontend = S3 + CloudFront (또는 동등). backend = Docker image 어디든.
- **CSP**: `connect-src 'self' https://api.hyperliquid.xyz https://api.hyperliquid-testnet.xyz https://<backend-host>`.
- **Backend cost**: managed Postgres (Railway / Neon / Supabase) free / 작은 tier 안에서 운영 가능. Docker image < 200MB.

## Verify Gate (`make verify`)

모두 통과 시에만 commit / push:

1. `frontend: npm run lint / typecheck / test / build`
2. `apps/api: npm run lint / typecheck / test` + `docker build` 성공
3. `make migration-check` — Drizzle migration 파일이 schema 와 일치
4. `make constitution-gate` — 본 10 원칙 grep 가드
5. `make bundle-size` — frontend gzip < 1.5 MB
6. `make api-shape-test` — Hono routes 의 input/output 이 `contracts/api.md` 와 일치 (Zod schema 또는 OpenAPI export 비교)
7. `make sig-fixture` — 가상투표 sig 검증 golden (Phase G 이후)

### Constitution gate grep (예시)

- I/II: `apps/api/src/` 내 `privateKey|mnemonic|secret` literal grep 0건. session JWT 발급 함수는 EIP-712 signature recovery 호출 거치는 코드 경로 강제.
- III: GET routes 에서 DB write 없음.
- IV: NetworkSelector 에 default 0건 (build-time `NEXT_PUBLIC_HL_NETWORK` 만).
- V: `governance/renderers/index.ts` 가 dynamic registry.
- VI: Tailwind `sm:` / `md:` 클래스 사용. desktop-only 0건.
- VII: `tailwind.config.ts` 의 brand tokens 외 hex color 0건.
- VIII: `analytics|sentry|googletagmanager|datadog-rum` import 0건.
- IX: `aws-cdk-lib|@aws-sdk|aws-lambda` import 0건 in `apps/api/src/`.
- XI: `/trade-forward` route 의 핸들러는 사용자 action JSON 의 fields 를 mutate 하는 코드 없음 (Object.assign / spread into action object grep). builder 필드는 env 가져온 값으로만 set.

## Governance

본 헌법은 hl-markets 의 모든 design / code / PR 결정에 우선한다. 위반 시 `plan.md` Complexity Tracking + builnad 명시 승인. **Non-negotiable 표기 원칙 (I, II, V, IX, XI)** 은 예외 없음.

**Version**: 2.0.0 | **Ratified**: 2026-05-24 | **Last Amended**: 2026-05-27 (Phase J)

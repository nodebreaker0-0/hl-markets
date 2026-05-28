# hl-markets — Delegation Matrix

> **Purpose**: builnad ↔ agent (Claude / hl-agent harness) 간 권한·책임 분배.
> hl-vote-web 과 달리 **key custody 0** (사용자 wallet, 사용자 agent privkey,
> 사용자 LLM API key 전부 backend 가 만지지 않음) 이므로 슬래시 위험은 없지만,
> host 비용 / 외부 사용자 데이터 (chat 메시지, 거래 forward) 처리는 신중.
> **Version**: v0.5 (2026-05-28, +Phase K-U: agent flow, basket, AI, autobet).

## Legend

| 표기 | 의미 |
|---|---|
| 🟢 auto | agent 자율. 사후 보고만 |
| 🟡 propose | agent 변경 제안 + diff/계획 출력. builnad ack 후 진행 |
| 🔴 confirm | agent 가 명시 confirm 받기 전엔 진행 X |
| 📛 forbidden | 어떤 상황에서도 진행 X |

---

## 1. Code / Spec

| 영역 | 권한 | 비고 |
|---|---|---|
| spec-kit 파일 (`.specify/`, `specs/001-hl-markets/`) | 🟢 auto | drift 시 즉시 갱신 |
| frontend TypeScript / TSX | 🟢 auto | hl-vote-web 패턴 재사용 |
| Hono backend (apps/backend/) — routes, indexer, Drizzle schema | 🟢 auto | |
| Drizzle migration 파일 추가 | 🟢 auto | local 에서 verify |
| `lib/agents/` (Phase U deep agents — skills, fetchers, orchestrator, types) | 🟢 auto | Zod schema 변경 시 fixture 동시 갱신 |
| `lib/autobet.ts` rule engine (Phase O) | 🟡 propose | 자동매매 안전 로직 — diff 보고 |
| unit / integration test | 🟢 auto | |
| `next.config.mjs` / `tsconfig` / `tailwind.config` | 🟢 auto | |
| `package.json` deps 추가 (frontend) | 🟡 propose | 직접 deps ≤ 12개 목표 |
| `package.json` deps 추가 (backend) | 🟡 propose | Hono + Drizzle + tiny libs 만 |
| Makefile target 추가 | 🟢 auto | verify gate 강화만, 약화 X |

## 2. Backend infrastructure (host-agnostic)

| 영역 | 권한 | 비고 |
|---|---|---|
| `Dockerfile` / `docker-compose.yml` 작성 / 변경 | 🟢 auto | local 부터 정확히 작동 |
| Hono routes, indexer, Drizzle schema 코드 | 🟢 auto | |
| Drizzle migration 파일 추가 | 🟢 auto | local 에서 verify |
| `/trade-forward` 엔드포인트 코드 변경 | 🟡 propose | Constitution XI — byte-for-byte forwarding 보장 필수 |
| 운영 DB 의 schema migration **실제 실행** | 🔴 confirm | 운영 데이터 영향. builnad 가 host 환경에서 직접 |
| 운영 환경에 deploy (Railway / Fly / VPS / 기타) | 🔴 confirm | **agent 가 직접 deploy 절대 X**. builnad 가 host 콘솔/CLI 로 직접 |
| 운영 host 선택 | 🔴 confirm | 비용 / 운영 부담 평가 후 builnad 결정 |
| Production secrets (Postgres URL, Builder Code address/fee) — `.env` | 📛 forbidden | builnad 가 host 의 secret manager 또는 `.env` 직접 |
| Custom domain (Cloudflare DNS / Route 53 record) | 🔴 confirm | DNS 영향 |
| Mac local Postgres `docker-compose up postgres` | 🟢 auto | local dev |
| Mac local API server `npm run dev` | 🟢 auto | local dev |

## 3. Frontend UX / brand

| 영역 | 권한 | 비고 |
|---|---|---|
| 컴포넌트 구조 / 레이아웃 | 🟢 auto | Polymarket UX 참조하되 색 안 가져옴 (Constitution VII) |
| HL 브랜드 톤 (다크/민트) | 🟢 auto | hl-vote-web tailwind.config 복사 + extend |
| Mobile responsive (sm/md/lg breakpoint) | 🟢 auto | mobile-first |
| 카피 / 경고 문구 | 🟡 propose | "AI는 advisory only", "autobet emergency stop" 같은 안전 문구 약화 X |
| Builder fee 표시 문구 | 🟡 propose | Constitution XI 의 "유저가 signing 전에 builder fee 확인 가능" 보장 |
| 외부 디자인 (Polymarket 이미지 직접 사용) | 📛 forbidden | 영감만, 자산 복사 X |
| Tailwind 외 새 CSS framework | 🔴 confirm | 보통 거부 |

## 4. Backend Hono routes

| 영역 | 권한 | 비고 |
|---|---|---|
| `indexer` cron — HF info fetch / Postgres write | 🟢 auto | |
| `api` routes — historical / chat read / chat write | 🟢 auto | |
| `chat` WebSocket fan-out | 🟢 auto | |
| `trade-forward` — user 가 signed 한 HL action forwarding | 🟡 propose | Constitution XI/XIII — order field 수정 금지, builder 만 env 에서 attach |
| EIP-712 signature 검증 코드 (세션 sign-in) | 🟡 propose | crypto 코드 — golden fixture 필수 |
| **사용자 private key / mnemonic / agent privkey** 받음 | 📛 forbidden | API spec 자체에 들어가지 않게 |
| **사용자 LLM API key (OpenAI / Anthropic / Tavily / FRED 등)** 받음 | 📛 forbidden | 전부 browser → provider 직접; backend 통과 X |
| 사용자 wallet address 외 PII 수집 | 📛 forbidden | address + signature + chat body 외 0 |
| 외부 API 호출 (HF info, HF /exchange 외) | 🔴 confirm | 새 외부 의존 |
| 영구 로그에 wallet address 평문 저장 | 🟡 propose | chat 메시지 자체는 OK; access log 는 별도 검토 |

## 5. Data / DB

| 영역 | 권한 | 비고 |
|---|---|---|
| Postgres read query | 🟢 auto | |
| Postgres write — indexer 의 governance snapshot | 🟢 auto | |
| Postgres write — `chat_message` (sig 검증 후) | 🟢 auto | |
| Postgres bulk export / dump | 🔴 confirm | 비용 + PII 관점 |
| 데이터 마이그레이션 (schema change) | 🔴 confirm | |
| 사용자 데이터 (`chat_message`) **삭제** (admin) | 🔴 confirm | builnad 본인이 admin 으로 직접 |
| 사용자 데이터 (`chat_message`) **bulk wipe** | 🔴 confirm | 마켓 settle 시 자동 wipe 는 코드로 명시; 임시 bulk 는 confirm |

## 6. Browser-side state (자동 X — 사용자 본인)

| 영역 | 권한 | 비고 |
|---|---|---|
| 사용자 IndexedDB (`hl-markets-agent-v1`) 의 agent privkey 직접 읽기 / 쓰기 | 📛 forbidden | 사용자 browser 안에서만 존재. agent (claude) 가 backend 거쳐서 manipulate X |
| 사용자 localStorage (LLM keys, basket, autobet rules) 변경 가이드 | 🟡 propose | 코드 변경으로 schema 갱신 시 migration 코드 추가, 사용자 데이터 자동 clear X |
| 사용자 LLM key 가 backend 로 보내짐 | 📛 forbidden | 발견 시 즉시 stop, builnad 보고 |

## 7. AI / Deep-agent 코드

| 영역 | 권한 | 비고 |
|---|---|---|
| `lib/agents/skills.ts` — SKILL 시스템 prompt 작성 / 수정 | 🟢 auto | Constitution XIV (AI advisory only) 어조 유지 |
| `lib/agents/fetchers.ts` — 새 도메인 fetcher (e.g. polymarket 가격 비교) 추가 | 🟡 propose | 새 외부 API → rate limit / cost 평가 |
| `lib/agents/orchestrator.ts` — 카테고리 매핑 / 폴백 정책 변경 | 🟡 propose | discovery 흐름 영향 |
| `lib/discovery.ts` — `enrichWithDeepAnalysts` 의 N / 병렬도 변경 | 🟡 propose | LLM cost 영향 |
| AnalystOutputSchema (Zod) 변경 | 🟡 propose | UI · skills · fetchers 동시 갱신 필요 |
| autobet 의 daily cap / per-bet max / min edge 기본값 변경 | 🟡 propose | 안전성 영향 — diff 명시 |
| autobet 의 default-OFF / opt-in 제거 | 📛 forbidden | Constitution XIV |
| autobet 의 emergency-stop 임계값 약화 | 📛 forbidden | Constitution XIV |

## 8. Verify gate / CI / Deploy

| 영역 | 권한 | 비고 |
|---|---|---|
| 새 verify gate 추가 | 🟢 auto | 약화 X |
| 기존 gate 완화 / skip | 📛 forbidden | |
| GitHub Actions workflow (CI) | 🟢 auto | |
| GitHub Actions workflow (deploy) | 🟡 propose | host 의 OIDC 가 가능하면 우선; long-lived key 도입 X |
| GitHub secrets (Postgres URL, Builder env) | 📛 forbidden | host 의 secret manager 사용 |

## 9. Git operations

| 영역 | 권한 | 비고 |
|---|---|---|
| `git init`, branch 생성 | 🟢 auto | |
| `git commit` (sandbox 안에서) | 🟡 propose | sandbox 의 `.git/index.lock` 권한 제약 있음 — 실패 시 builnad 가 local 에서 |
| `git push origin <branch>` | 🟡 propose | verify gate 통과 + diff summary 후 |
| `git push origin main` (force / rewrite) | 🔴 confirm | |
| GitHub release / tag (`v0.5.0` …) | 🔴 confirm | 외부에 공유될 artifact |

## 10. Network operations (sandbox)

| 영역 | 권한 | 비고 |
|---|---|---|
| `npm install` | 🟢 auto | lockfile 갱신 |
| Sandbox 에서 HF `/info` testnet / mainnet POST | 🟢 auto | read-only |
| Sandbox 에서 HF `/exchange` POST | 📛 forbidden | builnad 본인 wallet/agent 만 |
| Sandbox 에서 hl-markets API endpoint (deployed) 호출 | 🟢 auto | 자체 endpoint, read only |
| Sandbox 에서 외부 LLM provider (OpenAI / Anthropic) POST | 🔴 confirm | API key 사용 — builnad 본인 키 / dev 용 키 명시 |
| Sandbox 에서 Tavily / FRED / football-data / OpenWeatherMap / CoinGecko POST | 🔴 confirm | 키 사용 — rate limit 평가 |
| 운영 host 의 Console / CLI | 📛 forbidden | builnad 의 account, agent 직접 접근 X |
| 운영 Postgres 에 직접 SQL 실행 | 📛 forbidden | builnad 본인만 |

## 11. Operational decisions

| 영역 | 누가 |
|---|---|
| 운영 host 선택 (Railway / Fly / VPS / 기타 — 추후) | **builnad only** |
| 운영 host 의 account / billing / DNS | **builnad only** |
| 운영 deploy (host 의 CLI/console 실제 실행) | **builnad only** |
| 운영 Postgres schema migration 실행 | **builnad only** |
| Builder Code 의 EOA / fee bps 선택 | **builnad only** |
| `approveBuilderFee` on-chain action 실행 | **builnad only** |
| Mainnet 로 promote 시점 결정 | **builnad only** |
| Autobet 의 default values 변경 / Constitution XIV 의 약화 | **builnad only** (즉시 거부될 가능성 큼) |
| chat 데이터 retention 정책 | builnad |
| External announcement (Discord / X / Telegram) | builnad |

## 12. Stop conditions

agent 는 다음 중 하나라도 발생하면 **즉시 멈추고 builnad 에게 보고**:

1. `make verify` fail + 사유 불분명.
2. host 운영 비용 추정이 사용자 예산 초과.
3. CHARTER 의 결정 사항을 변경해야만 진행 가능.
4. 외부 사용자 데이터 처리 결정 필요 지점 (retention, PII 검토 등).
5. Docker image 가 새 system dependency 를 요구 — 보안/portability 검토 필요.
6. 의존성 추가 검토 중 CVE 또는 typosquatting 의심.
7. **trade-forward 코드에서 user-signed action 의 field 가 수정될 가능성 발견** (Constitution XI 위반).
8. **agent privkey 또는 LLM key 가 backend 통과 가능성 발견** (Constitution I/XII 위반).
9. **autobet default-OFF / emergency-stop 정책 약화 요청** (Constitution XIV 위반).
10. AI 가 새 도메인 fetcher (외부 API) 를 추가하면서 schema parse 없이 raw HTML 을 사용자에게 보여주는 경로 발견 (Constitution XV 위반).

## 13. Reporting cadence

- spec-kit 파일 완료: 1번 요약 보고 (파일 트리)
- 각 Phase 완료: 1줄 요약 + verify 결과
- verify gate green 시 직전 commit hash + 통과한 gate 목록
- 신규 의존성 추가 / Docker image 변경 시 size + 비용 추정
- LLM provider / 외부 API 첫 N 건 호출 시 schema parse 100% 통과 확인
- Builder fee 첫 실수익 transaction 발생 시 testnet/mainnet 구분 + 액수 보고

---

## ✋ Confirmation history (builnad)

- v0.2: AWS CDK 폐기 → Docker image (host-agnostic) 로 deploy.
- v0.3: hl-gov → hl-markets pivot.
- v0.4: Phase J 도입 — wallet, chat, in-app trade, Builder Code.
- v0.5: Phases K-U — agent flow (IndexedDB), basket bet, AI analyst,
  domain specialists, deep agents, autobet. Constitution XI-XV 추가.
  운영 host / mainnet promotion 만 남음 (Phase V).

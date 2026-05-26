# hl-markets — Agent Context

> 이 폴더는 **Hyperliquid 거버넌스 public explorer** (Polymarket-스타일 UX, 가상투표, delegation lookup, mobile-first).
> hl-vote-web 의 **sibling 프로젝트**. Constitution / Charter 다름 — backend 있음 (host-agnostic), key custody 없음.

## Spec-Kit Layout

```
hl-markets/
├── CLAUDE.md                              # 본 파일
├── CHARTER.md                             # why / non-goals / threat / phases / layout
├── delegation_matrix.md                   # builnad ↔ agent 권한
├── README.md                              # 운영자 quickstart (Phase I 까지 보강)
├── Makefile                               # verify gate
├── docker-compose.yml                     # local Postgres
├── .specify/
│   ├── feature.json
│   └── memory/constitution.md             # 10 원칙
└── specs/001-hl-markets/
    ├── spec.md                            # WHAT/WHY
    ├── plan.md                            # HOW
    ├── contracts/
    │   ├── governance.md                  # variant + renderer + quorum
    │   ├── api.md                         # Hono routes contract
    │   └── data-model.md                  # Postgres schema (Drizzle)
    ├── quickstart.md                      # QS-0~9
    └── tasks.md                           # T001~T246
```

<!-- SPECKIT START -->
**Active plan**: `specs/001-hl-markets/plan.md`
<!-- SPECKIT END -->

## 어디서부터 읽는가

| 작업 | 먼저 |
|---|---|
| 처음 전체 파악 | CHARTER.md → spec.md (15분) |
| 새 거버넌스 variant 추가 | contracts/governance.md (§6 절차) |
| API 라우트 추가/변경 | contracts/api.md → routes 코드 |
| DB schema 변경 | contracts/data-model.md → Drizzle migration |
| 검증 시나리오 | quickstart.md |
| 권한 / 자율 진행 | delegation_matrix.md |
| Tasks 진행 | tasks.md |

## 사용자 결정 (2026-05-24)

1. ✅ 이름 `hl-markets`, 경로 `validator/hl-markets/`, 도메인 `hl-markets.bharvest.io`.
2. ✅ Backend = AWS specific 아닌 **host-agnostic** (Hono + Postgres + Docker). 운영 host 는 builnad 추후.
3. ✅ Frontend = Next.js static export (hl-vote-web 패턴), Polymarket UX layout 차용, **HL brand 톤** (다크/민트).
4. ✅ Phase A→I, MVP = B~E (frontend + 로컬 backend).
5. ✅ `cdk/host deploy 실행` 은 builnad 본인. agent 직접 X.
6. ✅ Mobile-first.
7. ✅ Constitution 10 원칙 (I~X).

## 절대 금지

- ❌ validator key / mnemonic / agent key 보유 / 처리 (Constitution I).
- ❌ EIP-712 sig 검증 없이 mutating action (Constitution II).
- ❌ GET 라우트에서 DB write (Constitution III).
- ❌ NetworkSelector default 설정 (Constitution IV).
- ❌ governance variant 하드코딩 분기 (Constitution V — renderer plugin 만).
- ❌ desktop-only style — base mobile 부터 (Constitution VI).
- ❌ HL brand tokens 외 hex 색 hardcode (Constitution VII).
- ❌ 외부 analytics / telemetry SDK (Constitution VIII).
- ❌ aws-cdk-lib / @aws-sdk import (Constitution IX).
- ❌ Phase 순서 건너뛰기 (Constitution X).

## 외부 참조

- hl-vote-web (sibling) — `../hl-vote-web/`. validator name 매핑, EIP-1193 wrappers 등 차용.
- HL info docs — `https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint`.
- Polymarket — `https://polymarket.com` (UX layout 참조 only — 색 / 코드 가져오지 않음).

## 진행 메모 (agent 가 갱신)

| 일자 | 작업 | 상태 |
|---|---|---|
| 2026-05-24 | CHARTER v0.2 (host-agnostic) + delegation_matrix v0.2 | ✅ |
| 2026-05-24 | spec-kit 8파일 (constitution + spec + plan + contracts/{governance,api,data-model} + quickstart + tasks) | ✅ |
| 2026-05-25+ | T001~T009 (Phase B frontend skeleton) | ⏳ |

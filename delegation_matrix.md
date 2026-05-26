# hl-gov — Delegation Matrix

> **Purpose**: builnad ↔ agent (Claude / hl-agent harness) 간 권한·책임 분배.
> hl-vote-web 과 달리 **key custody 0** 이므로 슬래시 위험은 없지만, host 비용 / 외부 사용자 데이터 (가상투표 signed messages) 처리는 신중.

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
| spec-kit 파일 (`.specify/`, `specs/001-hl-gov/`) | 🟢 auto | drift 시 즉시 갱신 |
| frontend TypeScript / TSX | 🟢 auto | hl-vote-web 패턴 재사용 |
| Lambda TypeScript (indexer / api) | 🟢 auto | |
| CDK TypeScript (infra/) | 🟢 auto | template 생성 검증 (`cdk synth`) |
| unit / integration test | 🟢 auto | |
| `next.config.mjs` / `tsconfig` / `tailwind.config` | 🟢 auto | |
| `package.json` deps 추가 (frontend) | 🟡 propose | 직접 deps ≤ 8개 목표 |
| `package.json` deps 추가 (lambdas) | 🟡 propose | aws-sdk v3 + tiny libs 만 |
| `package.json` deps (infra/cdk) | 🟢 auto | `aws-cdk-lib` + `constructs` 만 |
| Makefile target 추가 | 🟢 auto | verify gate 강화만, 약화 X |

## 2. Backend infrastructure (host-agnostic)

| 영역 | 권한 | 비고 |
|---|---|---|
| `Dockerfile` / `docker-compose.yml` 작성 / 변경 | 🟢 auto | local 부터 정확히 작동 |
| Hono routes, indexer, Drizzle schema 코드 | 🟢 auto | |
| Drizzle migration 파일 추가 | 🟢 auto | local 에서 verify |
| 운영 DB 의 schema migration **실제 실행** | 🔴 confirm | 운영 데이터 영향. builnad 가 host 환경에서 직접 |
| 운영 환경에 deploy (Railway / Fly / VPS / ECS — host 추후 결정) | 🔴 confirm | **agent 가 직접 deploy 절대 X**. builnad 가 host 콘솔/CLI 로 직접 |
| 운영 host 선택 | 🔴 confirm | 비용 / 운영 부담 평가 후 builnad 결정 |
| Production secrets (Postgres URL, etc.) — `.env` | 📛 forbidden | builnad 가 host 의 secret manager 또는 `.env` 직접 |
| Custom domain (Route 53 / Cloudflare DNS record) | 🔴 confirm | DNS 영향 |
| Mac local Postgres `docker-compose up postgres` | 🟢 auto | local dev |
| Mac local API server `npm run dev` | 🟢 auto | local dev |

## 3. Frontend UX / brand

| 영역 | 권한 | 비고 |
|---|---|---|
| 컴포넌트 구조 / 레이아웃 | 🟢 auto | Polymarket UX 참조하되 색 안 가져옴 (Constitution VII) |
| HL 브랜드 톤 (다크/민트) | 🟢 auto | hl-vote-web tailwind.config 복사 + extend |
| Mobile responsive (sm/md/lg breakpoint) | 🟢 auto | mobile-first |
| 카피 / 경고 문구 | 🟡 propose | "참고용 신호" 같은 거버넌스 면책은 약화 X |
| 외부 디자인 (Polymarket 이미지 직접 사용) | 📛 forbidden | 영감만, 자산 복사 X |
| Tailwind 외 새 CSS framework | 🔴 confirm | 보통 거부 |

## 4. Backend (Lambda)

| 영역 | 권한 | 비고 |
|---|---|---|
| `indexer` Lambda 로직 — HF info fetch / DynamoDB write | 🟢 auto | |
| `api` Lambda 로직 — GET / POST 핸들러 | 🟢 auto | |
| EIP-712 signature 검증 코드 (가상투표) | 🟡 propose | crypto 코드 — golden fixture 필수 (hl-vote-web 패턴) |
| **사용자 private key 또는 mnemonic** 받음 | 📛 forbidden | API spec 자체에 들어가지 않게 |
| 사용자 wallet address 외 PII 수집 | 📛 forbidden | address + signature + opinion 외 0 |
| 외부 API 호출 (HF info 외) | 🔴 confirm | 새 외부 의존 |
| 영구 로그에 wallet address 평문 저장 | 🟡 propose | 가상투표 결과 자체는 OK; access log 는 별도 검토 |

## 5. Data / DB

| 영역 | 권한 | 비고 |
|---|---|---|
| DynamoDB read query | 🟢 auto | |
| DynamoDB write — indexer 의 governance snapshot | 🟢 auto | |
| DynamoDB write — 가상투표 PollVote | 🟢 auto | sig 검증 후만 |
| DynamoDB scan / bulk export | 🔴 confirm | 비용 큼 |
| 데이터 마이그레이션 (schema change) | 🔴 confirm | |
| 사용자 데이터 (가상투표 결과) **삭제** | 🔴 confirm | 사용자가 명시 요청해도 confirm |

## 6. Verify gate / CI / Deploy

| 영역 | 권한 | 비고 |
|---|---|---|
| 새 verify gate 추가 | 🟢 auto | 약화 X |
| 기존 gate 완화 / skip | 📛 forbidden | |
| GitHub Actions workflow (CI) | 🟢 auto | |
| GitHub Actions workflow (CDK deploy) | 🟡 propose | OIDC 통한 AWS access 설정 — IAM role 신중 |
| GitHub secrets 사용 (AWS key, etc.) | 📛 forbidden | OIDC 우선; long-lived key 도입 X |

## 7. Git operations

| 영역 | 권한 | 비고 |
|---|---|---|
| `git init`, branch 생성, commit | 🟢 auto | verify gate 통과 시에만 |
| `git push origin <branch>` | 🟢 auto | verify gate 통과 + diff summary |
| `git push origin main` (force / rewrite) | 🔴 confirm | |
| GitHub release / tag (`v0.1.0` …) | 🔴 confirm | 외부에 공유될 artifact |

## 8. Network operations

| 영역 | 권한 | 비고 |
|---|---|---|
| `npm install` | 🟢 auto | lockfile 갱신 |
| Sandbox 에서 HF info testnet POST | 🟢 auto | read-only |
| Sandbox 에서 HF info mainnet POST | 🟢 auto | read-only |
| sandbox 에서 hl-gov API endpoint (deployed) 호출 | 🟢 auto | 자체 endpoint, read only |
| 운영 host 의 Console / CLI (Railway / Fly / AWS / VPS) | 📛 forbidden | builnad 의 account, agent 직접 접근 X |
| 운영 Postgres 에 직접 SQL 실행 | 📛 forbidden | builnad 본인만 |

## 9. Operational decisions

| 영역 | 누가 |
|---|---|
| 운영 host 선택 (Railway / Fly / VPS / AWS — 추후) | **builnad only** |
| 운영 host 의 account / billing / DNS | **builnad only** |
| 운영 deploy (host 의 CLI/console 실제 실행) | **builnad only** |
| 운영 Postgres schema migration 실행 | **builnad only** |
| 가상투표 데이터 retention 정책 | builnad |
| External announcement (Discord / X / 텔레그램) | builnad |

## 10. Stop conditions

agent 는 다음 중 하나라도 발생하면 **즉시 멈추고 builnad 에게 보고**:

1. `make verify` fail + 사유 불분명.
2. host 운영 비용 추정이 사용자 예산 초과.
3. CHARTER 의 결정 사항을 변경해야만 진행 가능.
4. 외부 사용자 데이터 처리 결정 필요 지점 (retention, PII 검토 등).
5. Docker image 가 새 system dependency 를 요구 (e.g. binary 외부 도구) — 보안/portability 검토 필요.
6. 의존성 추가 검토 중 CVE 또는 typosquatting 의심.

## 11. Reporting cadence

- spec-kit 7파일 완료: 1번 요약 보고 (파일 트리)
- 각 Phase (B~I) 완료: 1줄 요약 + verify 결과
- verify gate green 시 직전 commit hash + 통과한 gate 목록
- 신규 의존성 추가 / Docker image 변경 시 size + 비용 추정
- 가상투표 첫 N건 수집 시 sig 검증 100% 통과 확인

---

## ✋ Confirmation request (builnad)

v0.2 변경 사항:
- AWS CDK 폐기 → Docker image (host-agnostic) 로 deploy
- 운영 host 결정은 추후 builnad. agent 는 어떤 host 든 직접 deploy 안 함.

CHARTER + 본 matrix v0.2 OK 면 즉시 spec-kit 7파일 + T001 진행합니다.

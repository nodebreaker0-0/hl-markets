# Quickstart — hl-gov 검증 시나리오

> spec.md 의 Success Criteria (SC-001~007) 만족 검증. Phase 별 단계 진행.

## 사전 조건

- Mac local: Node 20+, npm 10+, Docker Desktop, Chromium 브라우저, MetaMask 확장.
- Postgres = Docker Compose (자동).
- HF info testnet/mainnet 접근 가능 (인터넷).

## QS-0 — Repo 첫 가동

```bash
cd /Users/ijeseon/hl-agent/validator/hl-gov
make install          # frontend + api workspaces 모두
make verify           # 모든 게이트 (Phase B 시점엔 lint/typecheck/test/bundle 위주)
```

기대: 모든 verify gate green.

## QS-1 — Phase B Frontend skeleton (P1)

```bash
cd apps/frontend
npm run dev           # http://localhost:3000
```

브라우저:
- 다크 background, 민트 헤더, mobile-first.
- Network tabs (Testnet / Mainnet) — default 없음.
- 모바일 viewport (375 px) 정상.

## QS-2 — Phase C Live data (P1)

브라우저 (`npm run dev`):
1. Network = Testnet 클릭 → 1초 이내 카드 리스트 로드.
2. 첫 카드 클릭 → `/g/testnet/<govId>` detail. variant 별 renderer 표시.
3. QuorumBar — stake / count progress bar.
4. Mainnet 토글 → mainnet 카드.

**합격**: 사용자가 본 `voted (0), unknown 1` 같은 버그 0건. variator name (B-Harvest 등) 정상 표시.

## QS-3 — Phase D Delegation lookup (P1)

브라우저:
1. "My Delegations" 탭 클릭.
2. Wallet connect (MetaMask).
3. mainnet 에서 본인 wallet 의 `delegations(user)` 응답 표시.
4. 각 validator row + 그 validator 의 현재 pending vote 상태표.

## QS-4 — Phase E Local backend (P1)

```bash
docker-compose up -d postgres     # Postgres 5432 LISTEN
cd apps/api
npm run db:migrate
npm run dev                       # http://localhost:3001
```

기대:
- 매분 indexer 가 HF info polling → DB upsert.
- `curl http://localhost:3001/health` → `{ok:true}`.
- `curl 'http://localhost:3001/governance?network=testnet'` → DB 의 row.
- `psql ...` 또는 Drizzle Studio 로 `governance`, `validator_snapshot`, `vote_snapshot` 테이블에 row 누적 확인.

**합격**: 5분 정도 가동 후 governance row N 개, vote_snapshot 누적, validator_snapshot 최신 active set.

## QS-5 — Phase F Historical (P2)

testnet 에서 pending governance 가 settle/expire 되면 (또는 dev 환경에서 임의로 row delete):
- `governance.status` = settled / expired
- API `/governance?status=historical` 응답에 그 row 포함.

브라우저 historical 탭 → settled 카드 시간순 표시.

## QS-6 — Phase G 가상투표 (P2)

브라우저:
1. testnet 거버넌스 detail → "Poll vote" 패널.
2. "Yes" 클릭 → MetaMask EIP-712 popup → confirm.
3. UI 가 "voted" 표시.
4. `/poll-results?network=testnet&gov_id=...` 응답에 head 1, stakeWeighted update.

서버:
- `psql` 로 `poll_vote` 테이블에 row 1.
- recovery 결과 = voter address (일치).

**합격 — golden**: `tests/golden/poll-sig.test.ts` 100/100 (Phase G 시작 시점에 fixture 생성).

## QS-7 — Phase H Polymarket detail (P3)

브라우저:
1. outcome 거버넌스 detail.
2. side 영역에 perp 현재가 (HF `metaAndAssetCtxs`).
3. 24h candle chart (HF `candleSnapshot`).
4. settled 시 winner side + 정산 시각.

## QS-8 — Docker build (Phase I)

```bash
cd apps/api
docker build -t hl-gov-api:dev .
docker images hl-gov-api    # size < 200MB
docker run --rm -p 3001:3001 \
  -e DATABASE_URL=postgres://hl_gov:dev@host.docker.internal:5432/hl_gov \
  hl-gov-api:dev
```

기대:
- Image 빌드 성공.
- Container 가 외부 Postgres 연결 후 indexer 시작.

## QS-9 — Frontend bundle (Phase I)

```bash
cd apps/frontend
npm run build
du -sh out/_next/static/chunks/*.js | sort -h | tail -10
# total gzip < 1.5 MB
```

`make bundle-size` 가 자동 검증.

---

## 검증 결과 보존

Phase 별 합격 시점에:
```
docs/qs-runs/2026-MM-DD-QS-N.md
```

- 환경, 입력, 결과, 스크린샷 path 기록.

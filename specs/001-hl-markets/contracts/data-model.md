# Contract: Data Model (Postgres / Drizzle)

> Schema 는 `apps/api/src/db/schema.ts` 에 Drizzle TypeScript 로 정의. 본 문서는 그 schema 의 의도/제약/migration 정책.
> Mac local = Docker Compose Postgres 15. Prod = managed (Railway / Neon / Supabase / RDS 추후).

## 0. 일반 원칙

- 모든 timestamp = `bigint` (unix ms) 또는 `timestamp with time zone`. **server-side 는 ms epoch 일관**.
- 모든 address = `text` lowercase (대소문자 mismatch 방지).
- 모든 stake / amount = `numeric(40, 0)` (HYPE 의 1e8 raw unit, 큰 정수).
- JSON payload (action body 등) = `jsonb`.

## 1. `governance`

거버넌스 한 row = 한 govId. pending / settled / expired 모두.

```sql
CREATE TABLE governance (
  network         text          NOT NULL,                  -- 'testnet' | 'mainnet'
  gov_id          text          NOT NULL,                  -- sha256(msgpack(action)) hex with 0x
  action          jsonb         NOT NULL,                  -- HF validatorL1Votes[].action verbatim
  variant         text          NOT NULL,                  -- 'outcome' | 'delisting' | 'unknown'
  inner_key       text,                                    -- 'O' | 'D' | other
  expire_time     bigint        NOT NULL,                  -- unix ms (HF)
  status          text          NOT NULL DEFAULT 'pending',-- 'pending' | 'settled' | 'expired'
  first_seen_at   bigint        NOT NULL,                  -- when indexer 가 처음 발견
  last_seen_at    bigint        NOT NULL,                  -- 마지막으로 HF pending list 에 있던 시각
  settled_at      bigint,                                  -- pending list 에서 사라진 시각 (status flip)
  PRIMARY KEY (network, gov_id)
);

CREATE INDEX governance_status_idx   ON governance (network, status, expire_time DESC);
CREATE INDEX governance_variant_idx  ON governance (network, variant);
CREATE INDEX governance_first_seen_idx ON governance (first_seen_at DESC);
```

### settle/expire 판단 (FR-032)

indexer cron 매분:
1. HF `validatorL1Votes` 가 응답한 row 의 govId set 을 만듦.
2. DB 의 (network, status=pending) row 중 그 set 에 없는 row → `last_seen_at` 가 oldest update 인 row.
3. 그런 row 의 처리:
   - `expire_time <= now` → status='expired', settled_at=now.
   - `expire_time > now` 인데 사라짐 → status='settled', settled_at=now (HF 가 quorum 도달로 정산했다고 판단).

### 응답 매핑 (api routes)

- `votes[]` 는 별도 테이블에 두지 않음. **매 polling 의 snapshot 을 governance.action 아래 `_votes` 필드로 저장하지 않고**, 별도 `vote_snapshot` 테이블 사용 (timeline 위해).

## 2. `vote_snapshot`

govId 별로 indexer 가 본 voters[] 변화의 timeseries.

```sql
CREATE TABLE vote_snapshot (
  network         text          NOT NULL,
  gov_id          text          NOT NULL,
  snapshot_ts     bigint        NOT NULL,
  voters          jsonb         NOT NULL,            -- governance addresses array
  quorum_reached  boolean       NOT NULL,            -- HF 측 응답값
  PRIMARY KEY (network, gov_id, snapshot_ts)
);

CREATE INDEX vote_snapshot_gov_idx ON vote_snapshot (network, gov_id, snapshot_ts);
```

매 polling 마다 row 1개. 1분 × 24h × 30d = 43200 row per gov. ~10 active gov 동시 → 432000 row/month. Postgres 거의 0 부담.

API `/governance/{id}` 의 `voteTimeline` = 이 테이블에서 query.

## 3. `validator_snapshot`

validator 메타 snapshot (이름/stake/active/jailed 변화 추적).

```sql
CREATE TABLE validator_snapshot (
  network         text          NOT NULL,
  validator       text          NOT NULL,            -- governance address (lowercased)
  signer          text          NOT NULL,            -- signer address (lowercased)
  name            text          NOT NULL,
  description     text,
  stake           numeric(40,0) NOT NULL,
  is_active       boolean       NOT NULL,
  is_jailed       boolean       NOT NULL,
  commission      numeric(10,8),
  snapshot_ts     bigint        NOT NULL,
  PRIMARY KEY (network, validator, snapshot_ts)
);

CREATE INDEX validator_snapshot_latest_idx ON validator_snapshot (network, validator, snapshot_ts DESC);
```

매분 update. 데이터 양 적음 (validator 수 100 미만).

API `/validators` 는 각 validator 의 latest snapshot row 만 응답 (`DISTINCT ON`).

## 3.5. `outcome_market`

HIP-4 outcome contract — 거버넌스 통과 후 HyperCore 에 등록된 trading market.
`contracts/outcome-market.md` 의 매핑 규약을 그대로 column 화.

```sql
CREATE TABLE outcome_market (
  network         text          NOT NULL,
  outcome_id      bigint        NOT NULL,                 -- outcomeMeta.outcomes[].outcome
  name            text          NOT NULL,
  description     text,
  side_specs      jsonb         NOT NULL,                 -- [{name:"Yes"}, {name:"No"}]
  quote_token     text          NOT NULL DEFAULT 'USDC',
  /** 매핑된 거버넌스 — deploy action 의 (network, gov_id). N:1 가능 (재배포 등) */
  deploy_gov_id   text,
  /** 매핑된 settle 거버넌스 — settle action 의 (network, gov_id). NULL = 아직 정산 안 됨 */
  settle_gov_id   text,
  /** allMids `#NNNN` keys per side — indexer 가 처음 발견 시 채움 */
  asset_keys      jsonb         NOT NULL,                 -- ["#1050","#1051"] (sideSpecs 순서)
  status          text          NOT NULL DEFAULT 'trading', -- 'trading' | 'settled' | 'governance_expired'
  winner_side     int,                                    -- settle 후 oracle 결과 (sideSpecs 의 index)
  first_seen_at   bigint        NOT NULL,
  last_seen_at    bigint        NOT NULL,
  settled_at      bigint,
  PRIMARY KEY (network, outcome_id)
);

CREATE INDEX outcome_market_status_idx     ON outcome_market (network, status, last_seen_at DESC);
CREATE INDEX outcome_market_deploy_gov_idx ON outcome_market (network, deploy_gov_id);
CREATE INDEX outcome_market_settle_gov_idx ON outcome_market (network, settle_gov_id);
```

### 매핑 알고리즘 (indexer)

1. 매분 polling 시점:
   - `outcomeMeta.outcomes[]` fetch
   - `allMids` fetch — `#NNNN` keys 만 추출
   - DB 의 `outcome_market` 와 비교
2. 새 outcome 발견 시:
   - `outcomeMeta.outcomes[].outcome` 의 ID + sideSpecs
   - asset_keys 계산 — `outcome-market.md` §3 의 가설 (`#` + outcomeId*10 + sideIdx). testnet 큰 ID 의 매핑은 indexer 가 cross-verify (allMids `#NNNN` key 중 매핑되지 않은 key 가 있으면 대안 lookup)
   - 최근 7일 내 quorum-reached governance (variant=outcome, action.O.register*) 와 name/description fuzzy match → `deploy_gov_id` 결정
3. 정산 감지 시점 (outcome 가 더 이상 거래 안 됨 또는 outcomeMeta 에 `isSettled` flag if exists):
   - `status = settled`, `winner_side = <int>`, `settled_at = now`
   - 최근 settle governance 와 매칭 → `settle_gov_id` 채움
4. 거버넌스 만료 (deploy 거버넌스가 expire 됨) 시:
   - 새 row 생성 — outcome_id = null 가능 (또는 row 자체 생성 안 함)
   - 단순화: outcome 으로 등록 안 된 governance 는 `governance` table 의 `status='expired'` 로만 표시. `outcome_market` 에는 들어가지 않음.

### 시계열 가격 (선택)

per-outcome 시계열은 client-side fetch (`candleSnapshot`) 로 충분 → 별도 table 안 만듦. 성능 / cache 필요시 Phase X+ 에 `outcome_price_snapshot` 추가 검토.

---

## 4. `poll_vote`

가상투표 — wallet sign 결과 보관.

```sql
CREATE TABLE poll_vote (
  network         text          NOT NULL,
  gov_id          text          NOT NULL,
  voter_addr      text          NOT NULL,            -- lowercased
  side            text          NOT NULL,            -- e.g. 'yes' | 'no' | <custom from sideNames>
  signature       bytea         NOT NULL,            -- 65 bytes (r||s||v)
  signed_at       bigint        NOT NULL,            -- ms epoch from client message
  chain_id        bigint        NOT NULL,            -- chain wallet was on during sign
  recovered_addr  text          NOT NULL,            -- server-side recovery 결과 (== voter_addr)
  voter_stake     numeric(40,0) NOT NULL DEFAULT 0,  -- snapshot at vote time (sum of voter's delegations)
  stored_at       bigint        NOT NULL,            -- server insert ts
  PRIMARY KEY (network, gov_id, voter_addr)
);

CREATE INDEX poll_vote_gov_idx ON poll_vote (network, gov_id);
```

PK = (network, gov_id, voter_addr) → wallet 1개 = 1 vote per governance. duplicate 는 upsert (마지막 vote 만).

API `/poll-results` 는 SQL aggregation:

```sql
SELECT
  side,
  count(*) as head,
  sum(voter_stake) as stake_weighted
FROM poll_vote
WHERE network = $1 AND gov_id = $2
GROUP BY side;
```

## 5. Migrations 정책

- Drizzle migrations → `apps/api/src/db/migrations/`.
- migration file 추가는 PR 단위. constitution-gate 가 unnamed migration / DROP 위주 statement 알람.
- 운영 DB 의 migration 실행 = builnad only (delegation_matrix §9).
- migration up/down 둘 다 작성. 검증 시 up + down + up 라운드트립.

## 6. Backup / retention

- Mac local = Docker volume. 사용자 의지로 삭제 가능.
- Prod (host 추후) — 한 달 vote_snapshot 자동 archive (S3 또는 host 의 backup) — Phase X+ decision.
- poll_vote 는 절대 자동 삭제 X. 사용자가 명시 delete 요청 시만 (delegation_matrix §5).

## 7. 변경 정책

schema column 추가/제거 시:
1. Drizzle migration 작성 + up/down 검증.
2. plan.md Complexity Tracking 갱신.
3. 운영 DB 마이그레이션은 builnad 명시 실행 (delegation_matrix §2/§9).
4. API 응답 shape 영향 시 contracts/api.md 동시 수정.

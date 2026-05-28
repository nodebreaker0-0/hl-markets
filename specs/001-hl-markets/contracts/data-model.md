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

## 4.x Phase J — chat tables

### `chat_session`

EIP-712 sign-in 으로 발급한 session 의 audit + revoke 테이블. JWT 는 HttpOnly cookie 로 클라이언트가 들고 있고, server 는 본 row 의 `revoked_at` 만 체크해서 강제 만료.

```ts
chat_session = pgTable('chat_session', {
  id          : text('id').primaryKey(),        // JWT jti — random ULID
  address     : text('address').notNull(),       // lowercase 0x...
  network     : text('network').notNull(),
  nonce       : text('nonce').notNull(),         // 1회용. 재사용 시 401.
  issuedAt    : bigint('issued_at', {mode:'bigint'}).notNull(),
  expiresAt   : bigint('expires_at', {mode:'bigint'}).notNull(),
  revokedAt   : bigint('revoked_at', {mode:'bigint'}),
  lastSeenAt  : bigint('last_seen_at', {mode:'bigint'}).notNull(),
}, (t) => ({
  addressIdx: index('chat_session_address_idx').on(t.address, t.expiresAt),
  nonceUq   : uniqueIndex('chat_session_nonce_uq').on(t.nonce),
}));
```

- `nonce` unique → replay 방지.
- 만료 + revoke 7일 후 cron 삭제 (FR-086).

### `chat_message`

마켓별 chat. `market_key` = `q:<questionId>` 또는 `o:<outcomeId>`.

```ts
chat_message = pgTable('chat_message', {
  id         : text('id').primaryKey(),         // ULID — 시간순 정렬 가능
  network    : text('network').notNull(),
  marketKey  : text('market_key').notNull(),
  address    : text('address').notNull(),        // lowercase 0x...
  body       : text('body').notNull(),
  signedAt   : bigint('signed_at', {mode:'bigint'}).notNull(),
  deletedAt  : bigint('deleted_at', {mode:'bigint'}),
}, (t) => ({
  roomIdx   : index('chat_message_room_idx').on(t.network, t.marketKey, t.id),
  addressIdx: index('chat_message_address_idx').on(t.address, t.signedAt),
}));
```

조회 패턴: 한 room 의 마지막 N개 = `WHERE network=? AND market_key=? ORDER BY id DESC LIMIT 50`.
정산 후 24h 유예 → cron hard-delete (FR-114).

### `chat_admin`

Delete 권한 보유 address 의 정적 목록. 현재는 builnad 본인 EOA 1개.

```ts
chat_admin = pgTable('chat_admin', {
  address: text('address').primaryKey(),         // lowercase 0x...
  note   : text('note'),
  addedAt: bigint('added_at', {mode:'bigint'}).notNull(),
});
```

> Seed: 첫 migration 또는 별도 seed script 로 builnad 의 admin 주소 1개 insert.

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

---

## 8. Client-side data stores (Phase K–U)

> Phase K 이후 **server 는 governance / chat 만** 들고 있고, **agent key / basket / LLM keys / autobet / discovery cache 는 전부 client-side** (IndexedDB + localStorage). 본 절은 그 client 측 schema 와 정책.

### 8.1 IndexedDB — `hl-markets-agent-v1`

지갑별 agent privkey 보관 (Phase K).

```
DB:     hl-markets-agent-v1
store:  agents
keyPath: composite (network, wallet)

record = {
  network         : 'testnet' | 'mainnet',
  wallet          : string,        // lowercase 0x address (master wallet)
  ciphertext      : ArrayBuffer,   // AES-GCM(agent privkey)
  iv              : ArrayBuffer,   // 12 bytes
  createdAt       : string,        // ISO-8601
  wallet_challenge: string,        // "hl-markets-agent:v1:{wallet}:{network}"
}
```

- 암호화 키 = HKDF(EIP-191 sign(wallet, wallet_challenge)). 즉 **decrypt 하려면 wallet 가 동일 challenge 를 다시 sign** 해야 함. 브라우저 단독으로는 plain privkey 가 disk 에 절대 남지 않음.
- 새 wallet 으로 연결 시 새 record 추가. 기존 record 는 그대로.
- Constitution XII (agent isolation): agent privkey 는 다른 origin / 다른 wallet 으로 절대 노출 X.

### 8.2 localStorage — `hl-markets:*` prefix

모든 key 는 `hl-markets:` namespace + `-vN` suffix.

| Key | Phase | Shape (요약) |
|---|---|---|
| `hl-markets:basket-v1`         | L     | `BasketLeg[]` = `{outcomeId, side, sizeUsd, addedAt}[]` |
| `hl-markets:llm-keys-v1`       | Q/R   | `{openai, anthropic, tavily, fred, footballData, openweather}` (each optional string) |
| `hl-markets:autobet-rules-v1`  | T     | `AutobetRules` — `contracts/autobet.md` §1 참조 |
| `hl-markets:autobet-state-v1`  | T     | `AutobetState` = `{dailyUsedUsd, consecFails, lastTickTs}` |
| `hl-markets:autobet-log-v1`    | T     | ring buffer (cap=200) of `{ts, outcomeId, sizeUsd, status, reason}` |
| `hl-markets:discovery-cache-v1`| S     | `{network, query, candidates, recs, fetchedAt}` — TTL 1h |
| `hl-markets:chat-session`      | J*    | legacy. Phase J 초기 localStorage hint 였으나 현재는 JWT HttpOnly cookie 로 이전. 신규 코드 사용 금지. |

> Constitution I: **LLM key 는 server 에 절대 안 감**. fetch 는 client → provider 직접.
> Constitution XIV: autobet defaults 는 version bump 사이에도 보존 (8.4 migration 정책).

### 8.3 Privacy properties

- client 저장소에 들어가는 PII 는 **wallet address + 사용자 본인 설정** 뿐. 타인 데이터/email/IP 없음.
- `/settings` 의 **Wipe** 버튼:
  - `localStorage` 의 `hl-markets:` prefix key 전부 삭제.
  - IndexedDB `hl-markets-agent-v1` DB 전체 삭제 (`indexedDB.deleteDatabase`).
  - JWT cookie 는 server `/auth/logout` 호출로 revoke + clear.

### 8.4 Migration policy (client)

- key 이름에 `-vN` suffix 박는다. **새 version = 새 key**. 구 version 은 자동 변환하지 않는다 (data-loss risk).
- 신규 코드는 새 key 만 read/write. 구 key 는 사용자가 wipe 하거나 브라우저 storage 가 정리할 때까지 dangling 으로 둠.
- 예: `autobet-rules-v1` → `-v2` 로 바뀔 때 코드는 `-v2` 만 보고, 없으면 default rules (Constitution XIV) 로 초기화.

### 8.5 Constitution alignment 요약

| Article | 적용 |
|---|---|
| I — LLM key isolation        | 8.2 `llm-keys-v1` client only, server 미전송 |
| XII — Agent isolation        | 8.1 IndexedDB AES-GCM + wallet-derived HKDF |
| XIV — Autobet safety defaults| 8.4 새 version key 시 default rules 강제 적용 |

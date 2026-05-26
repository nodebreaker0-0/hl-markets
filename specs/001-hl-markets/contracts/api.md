# Contract: HTTP API (`apps/api/`)

> Host-agnostic Hono routes. 모든 GET 은 idempotent + cacheable. POST 는 EIP-712 signed message 검증.
> Frontend 는 `/governance` (live + historical), `/poll-vote`, `/poll-results` 를 호출.

## 0. Base URL

- Mac local dev: `http://localhost:3001`
- Prod (host 추후): `https://api.hl-markets.bharvest.io` (가설 — host 결정 시 확정)

## 1. Health

### `GET /health`

```http
GET /health → 200
{ "ok": true, "ts": "2026-05-24T12:34:56Z" }
```

쓰임: load balancer probe, monitoring.

## 2. Governance

### `GET /governance`

Query params (Zod validated):

| | Type | Required | Default | 비고 |
|---|---|---|---|---|
| `network` | `'testnet' | 'mainnet'` | yes | — | |
| `status` | `'pending' | 'historical' | 'all'` | no | `pending` | pending 만 default |
| `variant` | `'outcome' | 'delisting' | 'unknown'` | no | — | 안 주면 모두 |
| `limit` | `1..200` | no | 50 | |
| `cursor` | string | no | — | 다음 페이지 (timestamp + govId) |

Response:

```json
{
  "rows": [
    {
      "network": "testnet",
      "govId": "0x<sha256>",
      "action": { "type": "validatorL1Vote", "O": { ... } },
      "variant": "outcome",
      "innerKey": "O",
      "expireTime": 1780210092359,
      "votes": ["0x..."],
      "quorumReached": false,
      "status": "pending",
      "firstSeenAt": 1779600000000,
      "settledAt": null
    }
  ],
  "nextCursor": "abc123" | null,
  "snapshotTime": "2026-05-24T12:34:00Z"
}
```

Cache headers: `Cache-Control: public, max-age=30, stale-while-revalidate=60`. CDN 가 30초 캐싱 OK.

### `GET /governance/{network}/{govId}`

Path:
- `network` = testnet | mainnet
- `govId` = `0x` + 64 hex

Response:

```json
{
  "network": "testnet",
  "govId": "0x...",
  "action": { ... },
  "variant": "outcome",
  "innerKey": "O",
  "expireTime": ...,
  "votes": ["0x..."],
  "voteTimeline": [
    { "ts": 1779600000000, "addedVoters": ["0x..."], "totalVoted": 1 },
    ...
  ],
  "status": "settled",
  "firstSeenAt": ...,
  "settledAt": ...,
  "quorum": {
    "totalActiveStake": "12345...",
    "votedStake": "234...",
    "stakeRatio": 0.018,
    "countRatio": 0.04,
    "stakeReached": false,
    "countReached": false
  },
  "snapshotTime": "..."
}
```

`voteTimeline` = indexer 가 매 polling 마다 votes[] 변화를 기록 → 누가 언제 vote 했는지 timeseries.

### `GET /validators?network=X`

Response:
```json
{
  "validators": [
    { "validator": "0x...", "signer": "0x...", "name": "B-Harvest", "stake": "...", "isActive": true, "isJailed": false, ... }
  ],
  "snapshotTime": "..."
}
```

Frontend 가 validator name 매핑에 사용. HF 직접 fetch 도 가능하지만 cross-network 합산 / cache 가 backend 쪽이 효율.

## 3. Poll (가상투표) — Phase G

### `POST /poll-vote`

Body (Zod validated):

```json
{
  "network": "testnet",
  "govId": "0x<sha256>",
  "side": "yes" | "no" | "<custom>",
  "voter": "0x<voter wallet address>",
  "signedAt": 1779600000000,
  "signature": {
    "r": "0x...",
    "s": "0x...",
    "v": 27 | 28
  }
}
```

Sign domain (Phase G 의 정확한 spec):

```ts
const POLL_DOMAIN = {
  name: "hl-markets-poll",
  version: "1",
  // chainId = 사용자 wallet active chain (어떤 값이든 OK — server 가 받은 값으로 verify)
  chainId: <number from request>,
  verifyingContract: "0x0000000000000000000000000000000000000000",
};

const POLL_TYPES = {
  PollVote: [
    { name: "network",  type: "string" },
    { name: "govId",    type: "bytes32" },
    { name: "side",     type: "string" },
    { name: "signedAt", type: "uint64" },
  ],
  EIP712Domain: [...],
};
```

**중요**: chainId 가 wallet active 이므로, request body 에 sign 시 사용한 chainId 도 함께 보내야 server 가 recovery 가능. → 추가 필드 `chainId: number` 필요. 또는 hyperliquid 패턴처럼 message 안에 `chainId` 필드. **Phase G spec 시점에 확정**.

Server logic:
1. Zod validate.
2. (network, govId) 가 DB 에 존재하는 governance 인지 확인. 없으면 400.
3. signedAt 가 server 시각 ±5분 (replay 방어).
4. Typed-data 재구성 → recovery → `recovered == voter` 확인. 다르면 401.
5. DB upsert `(network, govId, voter)` — duplicate 시 update (last vote 만 카운트).
6. 200 응답: `{ "ok": true, "stored": true }`.

### `GET /poll-results`

Query: `network`, `govId`.

Response:

```json
{
  "network": "testnet",
  "govId": "0x...",
  "head": { "yes": 12, "no": 8, "...": 0 },
  "stakeWeighted": { "yes": "1234567...", "no": "234567..." },
  "totalVoters": 20,
  "snapshotTime": "..."
}
```

stakeWeighted 는 voter 의 `delegations(user)` 결과 합산 (server 가 검증 시점에 fetch + DB 에 voter_stake save).

Cache: `Cache-Control: public, max-age=10` (자주 변경, 짧게).

## 4. Common

### CORS

`Access-Control-Allow-Origin: https://hl-markets.bharvest.io` (또는 결정 도메인) + `http://localhost:3000` (dev).
Wildcard X.

### Rate limit

per-IP token bucket — POST 5 req/min, GET 60 req/min. 초과 시 429.

### Error shape

```json
{ "error": "string", "code": "string", "details": { ... } }
```

HTTP status: 400 (Zod fail), 401 (sig fail), 404 (govId 없음), 429 (rate), 500 (server).

### Idempotency / cache

- GET 모두 idempotent + cache-friendly (no DB write).
- POST 만 mutate.

## 5. OpenAPI / shape test

`make api-shape-test` 가 Zod schema 와 본 contract 의 routes 비교. drift 시 fail.

자동화: `apps/api/src/routes/` 의 zod schema → openapi 생성 → 기대 spec 와 diff.

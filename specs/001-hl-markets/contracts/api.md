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

## 5. Phase J — Wallet + Chat + Position + Trade

> See also: `chat-protocol.md` (WebSocket wire format), `builder-code.md` (trade-forward 의 builder field 제약).

### 5.1 Sign-in / sign-out

#### `POST /auth/sign-in`

Body (Zod):
```json
{
  "address": "0x...",
  "network": "testnet" | "mainnet",
  "nonce": "<server-issued — see /auth/nonce below>",
  "issuedAt": 1779800000000,
  "signature": "0x<65-byte hex>"
}
```

EIP-712 typed data (frontend 가 sign):
```
domain = { name: "hl-markets", version: "1", chainId: <wallet active>, verifyingContract: 0x0 }
primaryType = "SignIn"
types = {
  SignIn: [
    { name: "address",  type: "address" },
    { name: "network",  type: "string"  },
    { name: "nonce",    type: "string"  },
    { name: "issuedAt", type: "uint64"  }
  ]
}
message = { address, network, nonce, issuedAt }
```

Server-side flow:
1. Verify nonce was issued by us in the last 5 min and not yet consumed.
2. `ecrecover(typedDataHash, signature)` must equal `address`.
3. INSERT `chat_session` row.
4. Issue HttpOnly cookie `hlm_session=<jwt>` (SameSite=Lax, Secure in prod, Max-Age=86400). Lax (not Strict) so the SPA's cross-origin fetches carry the cookie.
5. Return `{ address, expiresAt }`.

Errors: 400 (Zod), 401 (sig fail / nonce reuse / nonce expired), 429.

#### `GET /auth/nonce`

```http
GET /auth/nonce → 200
{ "nonce": "1779800123-7f3a...", "expiresAt": 1779800423000 }
```

Server stores in memory (TTL 5 min). One nonce = one sign-in.

#### `POST /auth/sign-out`

Clears cookie + sets `chat_session.revoked_at = now()`. Always 200.

#### `GET /auth/me`

Cookie 있으면 200 `{ address, network, expiresAt }`. 없으면 401.

### 5.2 Chat REST

#### `GET /chat`

| | Type | Required | Default |
|---|---|---|---|
| `network` | `'testnet' | 'mainnet'` | yes | — |
| `marketKey` | `q:<int>` or `o:<int>` | yes | — |
| `before` | message id | no | newest |
| `limit` | `1..100` | no | 50 |

Response:
```json
{
  "messages": [
    {
      "id": "01HXYZ...",       // ULID
      "address": "0x...",
      "body": "I'm long Yes here",
      "signedAt": 1779800050000,
      "deleted": false
    }
  ],
  "nextBefore": "01HXYW..."  // or null
}
```

Public — no auth required. `deleted=true` messages have `body=""` and `address=""`.

#### `DELETE /chat/:id`

Auth: cookie present + (caller is message author OR caller is in `chat_admin`). Soft-delete (`deleted_at = now()`). Returns 204.

### 5.3 Chat WebSocket

#### `WS /chat/ws?network=&marketKey=`

Upgrade from HTTP. Cookie `hlm_session` carried in upgrade headers.

- Read-only when cookie absent (server still accepts the connection so observers can watch).
- Frames are JSON, one per line. See `chat-protocol.md` for the wire format (CLIENT_HELLO, SEND, ACK, BROADCAST, DELETE, ERROR, PING, PONG).

Server enforces:
- (a) JWT verify + address recover from cookie (else read-only).
- (b) rate limit: 10 SEND per address per market per 60s rolling window.
- (c) position gate: GET HF `clearinghouseState` for address — that market's notional ≥ $1.
- (d) automod: URL whitelist, profanity, length ≤ 500.
- (e) market settled → SEND rejected.

### 5.4 Position

#### `GET /position`

| | Type | Required |
|---|---|---|
| `network` | `'testnet' | 'mainnet'` | yes |
| `address`  | `0x...` | yes |
| `marketKey` | `q:<int>` or `o:<int>` | yes |

Response:
```json
{
  "side": "yes-long" | "no-long" | "none",
  "lastFetchedAt": 1779800100000
}
```

30s server-side cache per (network, address, marketKey). HF `clearinghouseState` 를 server 가 caller 대신 호출 (CORS / rate 절약).

Public — no auth (HF data is public).

### 5.5 Trade forward (Constitution XI) — Phase J.5 → K-L extension

#### `POST /trade-forward`

Auth: cookie required.

Body (Phase J.5 original — single-leg `order`):
```json
{
  "action": { "type": "order", "orders": [{...}], "grouping": "na", "builder": { "b": "0x...", "f": 50 } },
  "nonce": 1779800200000,
  "signature": { "r": "0x...", "s": "0x...", "v": 27 },
  "vaultAddress": null
}
```

Body (Phase K — agent-signed accepted):
- `signature` may be produced by **user wallet** (Phase J.5) OR **agent privkey** (Phase K, Constitution XII).
- Backend does not distinguish — it does NOT recover the signer. HF `/exchange` is the authority on signer validity (user EOA or registered agent).
- Cookie session address is used **only** for audit log + cookie auth, not for action-signer match.

Body (Phase L — basket / multi-leg `orders[]`):
```json
{
  "action": {
    "type": "order",
    "orders": [
      { "a": 12, "b": true,  "p": "0.42", "s": "100", "r": false, "t": {...} },
      { "a": 17, "b": false, "p": "0.31", "s": "50",  "r": false, "t": {...} },
      { "a": 9,  "b": true,  "p": "0.55", "s": "25",  "r": false, "t": {...} }
    ],
    "grouping": "na",
    "builder": { "b": "0x...", "f": 50 }
  },
  "nonce": ...,
  "signature": {...},
  "vaultAddress": null
}
```

Constitution XI gate (applies to single-leg AND every leg of basket):
- **MUST NOT modify**: `order.a` (asset), `order.b` (isBuy / side), `order.s` (size), `order.p` (price), `order.r` (reduceOnly), `order.t` (order type).
- **MUST NOT reorder** `orders[]`.
- **MUST NOT** add / remove `orders[]` elements.
- **MAY append** single `action.builder = {b, f}` from env (Constitution XIII) **only if not already present**. Builder field is at action level — never per-order.

Cancel action support (Phase N):
```json
{
  "action": { "type": "cancel", "cancels": [{ "a": 12, "o": 987654321 }] },
  "nonce": ..., "signature": {...}, "vaultAddress": null
}
```
- Same byte-preservation: do not mutate `cancels[]`.
- `builder` field is NOT appended to cancel actions (HF /exchange does not accept builder on cancel).

Server flow (unified):
1. Verify cookie → JWT → caller address (for audit only).
2. Branch on `action.type`:
   - `"order"`: validate basket length ≤ env `MAX_ORDERS_PER_FORWARD` (default 20). If `action.builder` already present, verify it matches env `BUILDER_ADDR_<NETWORK>` (case-insensitive) and `f` ≤ env `BUILDER_MAX_FEE_TENTHS_BPS` (default 100 = 0.1%). If absent AND env Builder Code set → append `{b, f}` from env. If absent AND env Builder Code unset → forward as-is (no builder).
   - `"cancel"`: forward as-is. Do NOT touch `builder`.
   - else: 400.
3. **Do not mutate any signed field.** Forward `{action, signature, nonce, vaultAddress}` to HF `/exchange`. (Note: appending `builder` happens BEFORE the user signs in the frontend — if it's absent here, frontend skipped it because env was unset. Backend's appendage path is reserved for legacy callers and emits a warning.)
4. Return HF response verbatim. No mutation of HF payload.
5. Audit log line: `{ts, callerAddress, action.type, orders.length?, cancels.length?, builderB?, builderF?, hfStatus, hfErr?, signerHint: "user"|"agent"|"unknown"}`. `signerHint` is best-effort from request header `X-Signer-Hint` (frontend hint, not trusted).

Errors:
- 400 if `action.type` not in {`order`, `cancel`} or builder mismatch or basket length > max.
- 401 if no session cookie.
- 502 if HF `/exchange` unreachable.

### 5.6 Builder approval helper

#### `POST /builder-approve-forward` (optional sugar)

`approveBuilderFee` action 도 동일 patterns 으로 forward 할 수 있게 별도 endpoint. 사용자가 직접 sign + `/exchange` 호출해도 OK — backend 거치는 건 audit log 편의용.

## 6. NOT in API — Phase K-U client-side only

> 다음 항목은 **절대 backend endpoint 로 추가하지 않는다**. Constitution I (no user fund custody) + XII (agent privkey browser-only) + 일반 원칙(no provider-key handling) 위반.
> Spec drift 방지 — PR 에 아래 항목 관련 route 가 추가되면 review 에서 reject.

| 항목 | Phase | 저장소 | 이유 |
|---|---|---|---|
| Agent privkey 생성 / 저장 / 조회 | K | Browser IndexedDB (raw key) + WebCrypto (optional wrap) | Constitution XII — privkey never leaves browser. Backend 가 보면 안 됨. |
| LLM provider key (Anthropic / OpenAI / Gemini) | P–Q–R | Browser localStorage | Constitution I 확장 — backend 가 provider key 를 보관하면 user fund-adjacent secret custody. 브라우저에서 provider 로 direct call. |
| Basket cart contents | L | Browser localStorage `hlm.basket.<network>` | UX state, server 가 알 필요 없음. Trade 실행 시점에 `/trade-forward` 로 multi-leg `orders[]` 만 도달. |
| Autobet rules / state / log | O | Browser localStorage `hlm.autobet.*` | Rule engine 은 browser tab 에서만 동작. Server-side autobet = custodial 행위 → Constitution I 위반. |
| AI discovery cache (market suggestions, summaries) | S / T / U | Browser localStorage `hlm.ai.cache.*` | Per-user, provider-key 와 연동 — server 가 들고있으면 안 됨. |
| Tavily search calls | S | Browser → `api.tavily.com` direct | User-supplied key, server proxy 하면 key custody 발생. |
| CoinGecko price | T | Browser → `api.coingecko.com` direct | Public, no key, no need to proxy. |
| FRED economic data | T | Browser → `api.stlouisfed.org` direct | Public key, browser-direct OK. |
| football-data.org | T | Browser direct | 동상. |
| OpenWeatherMap | T | Browser direct | 동상. |

예외 — backend 가 proxy 해야 하는 경우 (정당화 필요):
- CORS 차단된 public source (현재 없음 — 모두 CORS open).
- Heavy rate-limit aggregation across multiple users (현재 없음 — per-user key 라 무의미).

위 list 에 추가하려면 Constitution amendment + spec PR 필요.

## 7. Constitution → Endpoint mapping

| Constitution rule | Enforced by | How |
|---|---|---|
| **XI** — Trade forwarder must not mutate signed fields | `POST /trade-forward` | Byte-for-byte forward to HF `/exchange`. `action.orders[*].{a,b,s,p,r,t}` + `action.cancels[*]` immutable. Basket: per-leg gate + single action-level `builder`. |
| **XII** — Agent privkey browser-only | (NOT in API) | No endpoint accepts / returns / stores agent privkey. `/trade-forward` accepts agent-signed payloads but never sees the key. |
| **XIII** — Builder Code env-gated | `POST /trade-forward` | `action.builder = {b, f}` appended **only** when `BUILDER_ADDR_<NETWORK>` env set AND `BUILDER_MAX_FEE_TENTHS_BPS` ≥ requested `f`. Frontend appends pre-sign when env exposed via config endpoint; backend's append path is legacy fallback. Cancel actions never get builder. |
| **I** — No user fund custody | All endpoints | No endpoint holds private key, signs on behalf of user, or initiates HF action without user/agent signature. `/trade-forward` is pure forwarder. Provider keys + autobet rules excluded (see §6). |

## 8. OpenAPI / shape test

`make api-shape-test` 가 Zod schema 와 본 contract 의 routes 비교. drift 시 fail.

자동화: `apps/api/src/routes/` 의 zod schema → openapi 생성 → 기대 spec 와 diff.

추가 gate: `/trade-forward` golden fixture (Phase K-L) — basket 3-leg signed payload → expected HF `/exchange` request body (byte-identical except for builder append). CI 가 mutation 발생 시 fail.

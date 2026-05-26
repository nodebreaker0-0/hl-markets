# Chat protocol — WebSocket wire format + gates

> Phase J.2 / J.3 의 backend ↔ frontend 계약.
> See also: `api.md` §5 (REST + WS endpoint), `data-model.md` (`chat_message` schema), `builder-code.md` (sibling).

---

## 1. Connection

```
WS /chat/ws?network=<testnet|mainnet>&marketKey=<q:N | o:N>
```

- Cookie `hlm_session` carried in upgrade headers.
- No cookie → connection accepted as **read-only** observer (BROADCAST 만 수신, SEND 불가).
- Bad network / marketKey → 4400 close.
- Server-side: in-memory map `Map<roomKey, Set<ws>>` where `roomKey = "${network}:${marketKey}"`.

### Heartbeat

- Server sends `PING` every 30s. Client must reply `PONG` within 10s; else server closes 4000.
- Client may send `PING` too; server replies `PONG`.

### Reconnect

- Client uses exponential backoff: 1s, 2s, 4s, 8s, ... cap 30s.
- On reconnect, client calls `GET /chat?before=<lastReceivedId>` to fill the gap, then resubscribes.

## 2. Frame format

One JSON object per frame. `type` field discriminates.

### 2.1 Client → server

#### `CLIENT_HELLO` (optional, default is implicit on connect)

```json
{ "type": "CLIENT_HELLO", "v": 1 }
```

Server replies with `SERVER_HELLO` including the room's last 50 messages (so the client doesn't need a separate GET).

#### `SEND`

```json
{
  "type": "SEND",
  "body": "Yes is mispriced",
  "clientNonce": "uuid-v4"
}
```

- `body`: 1..500 chars after `String.prototype.trim()`. Server applies automod (see §3).
- `clientNonce`: client-generated, used to correlate the eventual `ACK`.

#### `DELETE`

```json
{ "type": "DELETE", "id": "01HXYZ..." }
```

Server soft-deletes if caller is author or in `chat_admin`. Broadcasts `BROADCAST_DELETED` to the room.

#### `PING`

```json
{ "type": "PING" }
```

### 2.2 Server → client

#### `SERVER_HELLO`

```json
{
  "type": "SERVER_HELLO",
  "v": 1,
  "roomKey": "mainnet:q:19",
  "you": { "address": "0x..." } | null,   // null if read-only
  "history": [ /* same shape as REST /chat */ ],
  "rateLimit": { "windowSec": 60, "max": 10 }
}
```

#### `ACK`

```json
{
  "type": "ACK",
  "clientNonce": "uuid-v4",
  "id": "01HXYZ...",
  "signedAt": 1779800050000
}
```

Sent to the originator only.

#### `BROADCAST`

```json
{
  "type": "BROADCAST",
  "message": {
    "id": "01HXYZ...",
    "address": "0x...",
    "body": "...",
    "signedAt": 1779800050000
  }
}
```

Sent to **all** sockets in the room (including the originator — gives the originator the canonical server ts/id and confirms broadcast).

#### `BROADCAST_DELETED`

```json
{
  "type": "BROADCAST_DELETED",
  "id": "01HXYZ...",
  "by": "0x..."   // deleter
}
```

#### `ERROR`

```json
{
  "type": "ERROR",
  "code": "rate_limited" | "no_position" | "automod_url" | "automod_profanity" | "too_long" | "settled" | "no_auth" | "bad_frame",
  "message": "human-readable, optional",
  "clientNonce": "uuid-v4"   // present when the error refers to a SEND/DELETE
}
```

No connection close on most errors; the client just shows the message. `no_auth` / `bad_frame` close the socket 4401.

#### `PONG`

```json
{ "type": "PONG" }
```

## 3. Gates (server-side, in order)

Every `SEND` runs through all five. First failure → `ERROR`, drop message.

| Order | Gate | Failure code |
|---|---|---|
| 1 | session cookie present + JWT verified | `no_auth` |
| 2 | rate limit (≤ 10 per address per market per 60s) | `rate_limited` |
| 3 | position notional ≥ $1 (from cached HF `clearinghouseState`) | `no_position` |
| 4 | automod URL whitelist | `automod_url` |
| 4 | automod profanity blocklist | `automod_profanity` |
| 4 | length 1..500 | `too_long` |
| 5 | market not settled (check `outcome_question.status` / `outcome_market.status`) | `settled` |

### 3.1 Automod URL whitelist

Allowed link sources (regex `\bhttps?://...`):

```
hyperliquid.xyz
app.hyperliquid.xyz
app.hyperliquid-testnet.xyz
hyperliquid.gitbook.io
x.com   twitter.com
github.com
```

Any other URL → `automod_url`. Whitelist is in `apps/api/src/chat/automod.ts` constants.

### 3.2 Profanity

Small static blocklist in `apps/api/src/chat/automod.ts`. Case-insensitive whole-word match. The list is intentionally tiny (slurs only) to avoid over-blocking. Manual review preferred for borderline.

### 3.3 Position cache

`GET /position` (cf. `api.md` §5.4) implements the cache. The WS handler reuses the same cache (30s TTL). On cache miss the SEND is queued ≤ 200ms for the HF round-trip, then proceeds.

## 4. Retention

- `chat_message` rows persist until the parent market settles.
- Cron job `chat_cleanup`: runs hourly. For every `chat_message` whose `market_key` parent is `settled` and `settled_at < now() - 24h`, hard-delete the row.
- Trade-off: 24h grace gives an admin window to extract anything noteworthy. After that the room is gone.

## 5. Failure modes

| Symptom | Likely cause | Mitigation |
|---|---|---|
| Client never receives `ACK` for a `SEND` | gate failed silently or socket dropped | client times out after 5s and shows the message as "failed" with a retry button. Server SHOULD have sent `ERROR`. |
| Stale BROADCAST after reconnect (duplicate id) | client got the same id from REST and WS | client deduplicates by id. |
| `ERROR { no_position }` for a user who just opened a position | position cache lag | client retries after 30s; or composer auto-detects position status from `/position` poll. |
| Many sockets per address (multi-tab) | normal | server limits 5 sockets per address per market; oldest dropped (4002). |
| Server restart | live sockets drop | clients reconnect; recent history fetched via REST. |

## 6. Versioning

Frame `v` field — currently `1`. Future incompatible changes bump to `2` and the server refuses lower versions.

## 7. Open

- Mobile background — WS suspended when tab is hidden. Re-fetch on focus.
- Read receipts — out of scope (no DM, no per-user receipt UX).
- Threading / replies — out of scope (flat list only).
- Emoji reactions — out of scope for v1; may add `REACT` frame later under same `v` if shape is additive.

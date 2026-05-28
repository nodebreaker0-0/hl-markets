# Autobet — Rules-Driven Background Trading (Phase O)

> 사용자가 rule 을 set 하면 5분마다 browser 가 백그라운드 scan → 통과
> candidate 를 agent 가 사인 → forward → log. Default OFF, opt-in only.
> Constitution XIV 의 모든 가드 적용.

---

## 1. 핵심 원칙

1. **Default OFF**. 처음 page 진입 시 Enable = false. 사용자가 명시 ON 해야 작동.
2. **Acknowledgement modal** — 첫 enable 시 "I understand this places real trades with my own funds. AI is advisory only and may be wrong." 명시 동의.
3. **Hard caps**:
   - `dailyCapUsd`: 24h 누적 USDC 사용량. 도달 시 즉시 Disable.
   - `perBetMaxUsd`: 단일 bet 의 max size. 그 이상 nullify.
   - `minEdgePp`: AI 의 edge 가 이 % 미만이면 skip.
4. **Emergency stop** — consecutive `emergencyStopConsecFails` (default 3) 회 HF forward 실패 시 즉시 Disable.
5. **Category filter** — `allowCategories[]` / `blockCategories[]` 로 도메인 제한 (e.g. "sports 만").
6. **Browser-only** — tab close 시 scan 안 됨. server-side autobet 은 Constitution XII 위반.
7. **Buy only** — autobet 이 sell 액션 자동 실행 X. sell 은 항상 사용자가 Portfolio 에서 직접.
8. **Log everything** — localStorage ring buffer 200건 + UI 표시.

---

## 2. Module: `lib/autobet.ts`

### 2.1 `AutobetRules`

```ts
interface AutobetRules {
  enabled: boolean;
  dailyCapUsd: number;          // default 0 (= disabled even if enabled)
  perBetMaxUsd: number;         // default 10
  minEdgePp: number;            // default 5 (= 5 percentage points)
  minConfidence: 1 | 2 | 3 | 4 | 5;  // default 3
  allowCategories: Category[];   // empty = all allowed
  blockCategories: Category[];   // priority over allow
  emergencyStopConsecFails: number;  // default 3
  acknowledgedAt: string | null; // 처음 ON 시 ISO time, null = 아직 acknowledge 안 함
}
```

저장: localStorage `hl-markets:autobet-rules-v1`.

### 2.2 `AutobetState`

```ts
interface AutobetState {
  dailyUsedUsd: number;
  dailyResetAt: string;         // ISO, midnight 마다 reset
  consecFails: number;
  lastTickAt: string | null;
  lastEmergencyStop: string | null;
}
```

저장: localStorage `hl-markets:autobet-state-v1`.

### 2.3 `evaluateCandidate(rec, rules, state, freeUsdc)`

순수 함수. golden fixture verify gate.

```ts
function evaluateCandidate(
  rec: DiscoveryRecommendation,
  rules: AutobetRules,
  state: AutobetState,
  freeUsdc: number,
): {allowed: boolean; reason: string; sizeUsd: number}
```

순차 가드:
1. `!rules.enabled` → `{false, "autobet disabled", 0}`.
2. `!rules.acknowledgedAt` → `{false, "no acknowledgement", 0}`.
3. `state.consecFails >= rules.emergencyStopConsecFails` → `{false, "emergency stop", 0}`.
4. `state.dailyUsedUsd >= rules.dailyCapUsd` → `{false, "daily cap reached", 0}`.
5. `rec.edgePp < rules.minEdgePp` → `{false, "edge < min", 0}`.
6. `rec.confidence < rules.minConfidence` → `{false, "conf < min", 0}`.
7. category in `rules.blockCategories` → `{false, "blocked category", 0}`.
8. `rules.allowCategories.length > 0 && category not in allowList` → `{false, "not in allow", 0}`.
9. Compute Kelly size: `kellyUsd = quarterKellyUsd(rec, freeUsdc)`.
10. `kellyUsd <= 0` → `{false, "kelly = 0", 0}`.
11. cap with `perBetMaxUsd` and remaining `dailyCapUsd - dailyUsedUsd`.
12. cap < $10 → `{false, "below min notional", 0}`.
13. return `{true, "ok", sizeUsd}`.

### 2.4 Tick: `runAutobetTick(network, rules, state, keys, freeUsdc)`

```
1. fetchActiveCandidates(network)
2. enrichWithSpecialists (Phase T)
3. askLlmDiscover (Phase S, no deep)   — deep 은 cost 절감 위해 autobet 에서 OFF
4. For each rec:
   - eval = evaluateCandidate(rec, rules, state, freeUsdc)
   - if eval.allowed:
     - signed = agentSign placeMarketBuy(outcomeId, sideIdx=0, sizeUsd)
     - forwardResult = POST /trade-forward
     - update state.dailyUsedUsd += sizeUsd
     - reset state.consecFails = 0 on success, ++ on fail
     - append to log {ts, outcomeId, sizeUsd, status, reason}
5. Persist state + log
```

비고:
- `deep` 단계는 cost 절감 위해 autobet 에서 default OFF. 사용자가 옵션으로 ON 가능 (cost warning 동반).
- `freeUsdc` 는 HF `clearinghouseState` 의 `withdrawable`. tick 마다 새로 fetch.

### 2.5 Daily reset

- `state.dailyResetAt` 가 UTC midnight 지나면 `dailyUsedUsd = 0`, `dailyResetAt` 갱신.
- 5분 tick 마다 첫 step 으로 check.

---

## 3. Page: `app/autobet/page.tsx`

### 3.1 Section: Rules

- Form 인풋:
  - `dailyCapUsd` number ($0 ~ $1000)
  - `perBetMaxUsd` number ($1 ~ $100)
  - `minEdgePp` slider (0 ~ 30)
  - `minConfidence` 1-5 dropdown
  - `allowCategories` / `blockCategories` checkbox grid
  - `emergencyStopConsecFails` 1-10 dropdown
- Save → localStorage upsert.
- **Enable toggle** — 처음 ON 클릭 시 acknowledgement modal.

### 3.2 Section: State + Dry-run preview

- 현재 state: daily used / daily cap, consec fails, last tick.
- Dry-run 버튼 → `runAutobetTick` 호출하되 forward step 만 skip → "would have bet" 미리보기.

### 3.3 Section: Recent log

- localStorage `hl-markets:autobet-log-v1` 의 ring buffer 200건 row.
- columns: time / outcome / size / status / reason.
- "Clear log" 버튼.

### 3.4 Section: Emergency stop

- Big red banner if `state.consecFails >= emergencyStopConsecFails` — "Emergency stop. Review failures. Click here to reset."

---

## 4. Component: `<AutobetTicker>`

global `_app.tsx` (또는 root layout client component) 에 mount.

```tsx
useEffect(() => {
  const interval = setInterval(async () => {
    if (!rules.enabled) return;
    await runAutobetTick(network, rules, state, keys, freeUsdc);
  }, 5 * 60 * 1000);
  return () => clearInterval(interval);
}, [rules.enabled, network, keys]);
```

- tab close → interval 자동 해제.
- visibility change → 즉시 next tick? — default 는 그냥 interval. (사용자 컨트롤 가능: "Run now" 버튼 in autobet page.)
- 동시 두 tab 으로 열린 상태 → 둘 다 tick 실행 → daily cap 가드가 사용량 합산 (localStorage 가 cross-tab 동기화).

---

## 5. Constitution alignment

- **I**. autobet 은 agent privkey 로 사인. wallet popup 0. backend 가 privkey 통과 0.
- **XI**. forwarded action 이 다른 trade 와 동일 byte-for-byte 가드 통과.
- **XII**. agent privkey 가 IndexedDB 안에만 존재. autobet 이 새 privkey 만들지 X.
- **XIV**. default OFF, hard cap, emergency stop, acknowledgement, buy only.
- **XV**. discovery 의 fetcher fallback 그대로 적용.

---

## 6. Open items

- **Cost guardrails**: 사용자가 cap = 0 + perBetMax = 100 으로 잘못 설정하면 stall. UI 가 "cap = 0 means OFF" 명시.
- **Server-side autobet** 검토 — 사용자가 명시 "tab close 시에도 돌려라" 요청해도 거부 (Constitution XII 위반 risk: agent privkey 가 backend 통과해야 함).
- **Auto-sell 정책** 추가 — winner take 시 자동 close. 일단 OUT (Phase V+ 옵션).
- **Multi-leg autobet** — discovery 가 추천한 N개 leg 를 한 basket 으로 묶어서 1 사인. 현재는 leg 마다 단일 사인 (간단함). cost / latency trade-off 후 합치기.
- **Notification** — 사용자가 page 안 보고 있을 때 fill 알림. browser notification API 옵트인.

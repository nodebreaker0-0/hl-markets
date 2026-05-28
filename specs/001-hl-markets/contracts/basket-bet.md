# Basket Bet — multi-leg single-sign spec

> Phase K (스펙) → Phase L (구현 + testnet 검증 ✅) → Phase M (BasketSheet UI ✅) →
> Phase S/T/U (AI Discovery "Add to basket" 통합 ✅).
>
> 핵심: 한 question 내 여러 outcome (또는 cross-question N 개 outcome) 을
> **한 번의 클릭 + 한 번의 사인** 으로 동시 IOC 매수.
>
> Status: 단일 user-signed `order` action — `orders: Order[]` (N legs) 가 byte-for-byte
> 그대로 HF `/exchange` 로 forward 된다. backend 는 action root 에 `builder: {b, f}` 만
> append (per-order 아님). Constitution XI 통과.
>
> Source: <https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint#place-an-order> (2026-05-27 fetched).
> 비교 대상: Polymarket 의 "Add to slip" / Kalshi "multi-event bet" / 일반 sportsbook 의 parlay (단, parlay 는 곱 payout — 우리는 그게 아니라 **독립 leg** 임을 명확히 한다).
> Sibling: `agent.md` (Phase J.7 사인 분기), `portfolio.md` (Phase J.8 보유 표시), `outcome-market.md` (asset 매핑), `discovery.md` (Phase S/T/U AI Discovery → basket 다리), `revenue-model.md` (HIP-4 builder fee 비대칭 sourcing).

### Why basket — Polymarket UX gap

- HL 공식 UI 는 outcome 하나 클릭 → 별도 모달 → 사인 1 회. N 개 outcome = 사인 N 회.
- Polymarket "Add to slip" 은 multi-leg 묶음이지만 settlement 가 별개 (parlay 아님). 우리는 그 UX 를 가져오되 HL native `orders[]` 로 1-sign 으로 압축.
- AI Discovery (Phase S/T/U) 가 추천하는 5 개 outcome 을 한 번의 사인으로 집행하는 게 product 의 핵심 wow-moment — basket 이 그 다리.

---

## 0. TL;DR

```
[ 사용자가 question 페이지 카드에서 + 클릭 ]
       │
       ▼
[ Basket sheet (sticky/floating) — leg 별 $ 입력 ]
       │
       ▼
[ "Place basket bet" 1 클릭 ]
       │
       ▼
[ agent privkey 1 회 EIP-712 사인 — N legs ]
       │
       ▼
[ /trade-forward → HL exchange — 1 action, N orders[] ]
       │
       ▼
[ statuses[] 길이 = N — leg 별 toast (fill/error) ]
```

핵심 단언: HL `order` action 의 `orders[]` 는 **native multi-leg array**.
한 사인 = 한 action = N leg. leg 간 fill 은 **독립**.

---

## 1. HL 멀티-leg 사실관계 (gitbook 확정)

문서: `Place an order` 섹션.

```jsonc
{
  "type": "order",
  "orders": [
    { "a": Number, "b": Boolean, "p": String, "s": String, "r": Boolean,
      "t": { "limit": { "tif": "Ioc" } } },
    { "a": Number, "b": Boolean, ... },
    ...
  ],
  "grouping": "na" | "normalTpsl" | "positionTpsl",
  "builder": { "b": "0x...", "f": Number }
}
```

확인된 사실:

| 항목 | 사실 | 출처 |
|------|------|------|
| `orders[]` array? | 예. SDK 도 array 수신. | gitbook §Place an order |
| 한 action 안 leg 개수 한도 | gitbook 명시 없음. SDK 예제는 ≥ 2 leg 사용. 우리는 **client 측 cap = 20** (UX) 으로 시작. | 추정 (실측 필요) |
| `grouping: "na"` 의미 | "no atomic grouping" — 각 leg 가 **독립** 으로 매칭/fill. 한 leg 실패해도 나머지 진행. | gitbook (`normalTpsl` 은 TP/SL pair, `positionTpsl` 은 position level — 둘 다 우리 쓰임새 X) |
| builder field scope | action 레벨 (orders[] 외부). **모든 leg 에 동일하게 적용**. leg 별 다른 builder fee 불가. | gitbook action shape |
| 사인 단위 | action 전체 (msgpack(action) 의 keccak256 hash 1 개). leg 수가 N 이어도 사인은 **1 회**. | constitution XI + hyperliquid-rust-sdk `sign_l1_action` |
| nonce | action 1 개 = nonce 1 개. leg 별 nonce 분리 안 함. | gitbook |
| 응답 shape | `response.data.statuses[]` — length = `orders[].length`. 인덱스가 leg 와 1:1 대응. | gitbook 응답 예시 + SDK |
| 부분 거부 | 한 leg 가 "min $10 미달" 같이 거부돼도 다른 leg 는 정상 fill (statuses 가 mixed). | gitbook error response 예시 |
| min $10 적용 단위 | **leg 별 독립 적용**. 묶음 total 이 아니라 각 leg notional ≥ $10. | HF 응답에서 confirmed (Phase J.6 hotfix #2) |
| msgpack 인코딩 | action 내부 array 길이가 늘어나도 msgpack list 헤더만 달라짐. 사인 절차 자체는 동일. | constitution XI byte-for-byte gate 통과 (golden fixture 다항 case 필요) |

### 1.1 "atomic" 여부 — 명확히

사용자가 흔히 오해하는 부분: "multi-leg = atomic = 다 같이 성공 or 다 같이 실패" ❌.

HL `grouping: "na"` 하에서:
- **트랜잭션 entry (sequencer 진입) 는 1 건.** action submit / nonce / 사인 1 개.
- **fill 자체는 독립.** leg A 의 ask 가 사라지면 A 만 fill 0, B/C 는 정상.
- 즉 *"한 묶음으로 broadcast" 는 atomic, "한 묶음으로 체결" 은 아님.*

이 구분은 UX 카피에 그대로 반영한다:
> "Placed 3 bets in one transaction. France filled $50, Germany filled $30, Brazil $0 (no asks)."

### 1.2 매트릭스 — 우리 SimpleTradeWidget single-leg vs Basket multi-leg

| | Single (J.6) | Basket (K) |
|--|--|--|
| `orders[].length` | 1 | N |
| 사인 횟수 | 1 | 1 |
| /trade-forward 호출 | 1 | 1 |
| HL action 종류 | `order` | `order` (동일) |
| builder field | `{b, f}` | `{b, f}` (동일, 모든 leg 적용) |
| grouping | `"na"` | `"na"` (동일) |
| min $10 검증 | 1 회 | leg 별 N 회 |
| fill 결과 | `statuses[0]` | `statuses[0..N-1]` |
| Constitution XI 영향 | 통과 | **동일하게 통과 — 사인 hash 가 action 전체** |

→ Basket 은 J.6 의 자연스러운 일반화. 새 endpoint / 새 사인 타입 추가 없음.

### 1.3 Phase L 확정 — wire shape (실제 송신 payload)

testnet 에서 3-leg basket 1 회 전송한 raw payload (Constitution XI gate 통과):

```jsonc
// agent privkey 가 사인하는 action — 사용자가 본 그대로 byte-for-byte
{
  "type": "order",
  "orders": [
    { "a": 10001, "b": true, "p": "0.31", "s": "166", "r": false,
      "t": { "limit": { "tif": "Ioc" } } },
    { "a": 10042, "b": true, "p": "0.54", "s": "56",  "r": false,
      "t": { "limit": { "tif": "Ioc" } } },
    { "a": 10117, "b": true, "p": "0.51", "s": "20",  "r": false,
      "t": { "limit": { "tif": "Ioc" } } }
  ],
  "grouping": "na",
  "builder": { "b": "0x<builder-eoa>", "f": 100 }   // ← backend append only
}
```

핵심 — **backend `/trade-forward` 의 mutation 범위**:

| 필드 | client 가 채움 | backend 가 append/덮어씀 | 사인 영향 |
|------|----------------|--------------------------|-----------|
| `type`, `orders[]`, `grouping` | ✅ | ❌ never touch | client sig 가 이 hash 를 cover |
| `builder.b`, `builder.f` | ❌ (client 는 비움) | ✅ root level append | client 가 미리 fixed `builder` 셋팅 후 사인. backend 는 *값 일치* 만 verify 후 그대로 forward. |
| 다른 어떤 필드 | — | ❌ **금지** (Constitution XI) | violation |

→ `builder` 는 per-order 가 아니라 **action root**. 모든 leg 에 동일 적용. golden fixture
`golden/sign-l1-action.json` 에 `multi-leg-3-with-builder` case 추가됨 (Phase L T8).

---

## 1.4 HIP-4 builder fee 비대칭 — testnet finding (Phase L)

> Full sourcing & math: `contracts/revenue-model.md` §HIP-4 fee 비대칭.

핵심 (요약):

| 방향 | builder fee 실수령 | 의미 |
|------|--------------------|------|
| **buy** | **0** | maker side (outcome share 매수) — builder fee 0 |
| **sell** | **100% of `f`** | taker side (cash out) — `f` (tenths-of-bps) 전액 builder 에 |

evidence: testnet 100-unit sell, `builder.f = 100` (= 1 bp 환산) → 0.0265665 USDC
가 builder addr 의 `userFills` row 에 기록됨 (2026-05-26 검증). buy 측 동일 trade size 에서는 builder fill row 0.

basket 에 미치는 영향:

- buy-only basket (현재 default) → builder revenue = 0. 사용자 입장 fee 부담 0. **acquisition friction 0**.
- mixed basket (buy + sell legs) — 현재는 sell leg 가 한 화면에서 같이 묶이지 않음 (portfolio cash out 은 분리 UI). 후속 `Rebalance basket` 가능성 (Open #6).
- 카피: `Place basket bet — 0 fee` 라벨이 정직함. mainnet sell 시 portfolio 의 cash-out 버튼에 fee 명시 (Phase J.8 polish 5).

---

## 2. UX 디자인 (wireframe)

### 2.1 진입: question 페이지의 + 버튼

```
┌─────────────────────────────────────────────────────────┐
│ 2026 World Cup — Champion?                              │
│ 49 outcomes · expires 2026-07-15                        │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────┐ │
│ │ France                                  30¢   [ + ] │ │  ← 신규
│ │ Bet Yes  $ ___   →  win $___                        │ │
│ └─────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Germany                                 53¢   [ + ] │ │
│ │ Bet Yes  $ ___   →  win $___                        │ │
│ └─────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Brazil                                  50¢   [ ✓ ] │ │  ← 이미 담김
│ │ Bet Yes  $ ___   →  win $___                        │ │
│ └─────────────────────────────────────────────────────┘ │
│  ... (47 more)                                          │
└─────────────────────────────────────────────────────────┘
                                       ┌──────────────────┐
                                       │ Basket · 3 legs ▲│  ← floating
                                       │ Total: $100      │
                                       └──────────────────┘
```

- 옵션 카드 우측에 `[ + ]` 아이콘. 클릭 시 basket 에 leg 추가.
- 이미 담긴 leg 는 `[ ✓ ]` 로 토글 (다시 클릭 → 제거).
- 카드 본체의 `Bet Yes $___` 은 **single-leg 즉시 매수** 그대로 유지 (J.6 path). basket 과 직교.

### 2.2 Basket sheet — 우하단 floating → tap → fullscreen sheet

```
┌─────────────────────────────────────────────────────────┐
│ Basket                                            [ × ] │
├─────────────────────────────────────────────────────────┤
│ ┌─ France · 2026 WC Champion ─────────────────── [×] ─┐ │
│ │ Current ask 30¢                                     │ │
│ │ $ [ 50.00 ]    → 166 shares · win $166 if Yes       │ │
│ │ ⚠ none / OK                                         │ │
│ └─────────────────────────────────────────────────────┘ │
│ ┌─ Germany · 2026 WC Champion ─────────────────── [×] ─┐ │
│ │ Current ask 53¢                                     │ │
│ │ $ [ 30.00 ]    → 56 shares · win $56 if Yes         │ │
│ └─────────────────────────────────────────────────────┘ │
│ ┌─ Brazil · 2026 WC Champion ──────────────────── [×] ─┐ │
│ │ Current ask 50¢                                     │ │
│ │ $ [ 9.00 ]     → 18 shares · win $18 if Yes         │ │
│ │ ✕ Below HL $10 minimum — increase or remove         │ │
│ └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ Total notional:                              $89.00     │
│ Worst-case max payout:                       $222       │
│ Legs:                                        3 (1 invalid) │
│                                                         │
│ [ Clear all ]        [ Place basket bet ($80, 2 legs) ] │
└─────────────────────────────────────────────────────────┘
```

- 각 leg row: outcome 이름, question 부제, ask, $ 입력, 환산 shares, 검증 메시지, `[×]` 삭제.
- bottom bar: total / max payout / legs count + **Clear all** + **Place basket bet**.
- Place 버튼 라벨에 **유효 leg 만 반영된 금액**과 **유효 leg count** 표기 — 사용자가 "$9 leg 는 자동 제외" 임을 즉시 인지.

### 2.3 Floating chip (sheet 닫힌 상태)

```
┌──────────────────┐
│ Basket · 3 ▲     │
│ $89             │
└──────────────────┘
```

- 우하단 sticky. tap → sheet open.
- legs > 0 일 때만 표시. legs == 0 → chip hide (UI 깨끗).

### 2.4 사용자 흐름 (happy path, 모바일 기준)

1. World Cup 페이지 진입 → France `[+]` 클릭. chip 등장 (`Basket · 1`).
2. Germany `[+]` 클릭 (chip `Basket · 2`).
3. chip tap → sheet open. 각 leg 에 $ 입력.
4. `Place basket bet ($80, 2 legs)` 클릭.
5. agent 가 있으면 즉시 사인 — 팝업 0 (Phase J.7 path).
6. /trade-forward → HL → statuses[2].
7. sheet 안에 leg 별 결과 inline:
   ```
   France  ✓ filled 166 @ 0.301 ($50.00)
   Germany ✗ no asks (filled 0)
   ```
8. 사용자가 "Done" 누르면 sheet 자동 clear + close. (혹은 leg 별 retry 버튼.)

### 2.5 Multi-question basket — 허용 여부

**결정: 허용한다.**

근거:
- HL action 자체는 cross-asset multi-leg 를 native 로 지원. `a` (asset id) 가 leg 별 독립.
- UX 측면: 사용자가 World Cup → CPI → 대선 question 들을 옮겨다니며 담을 수 있음.
- Polymarket 도 cross-market slip 허용.
- 단, sheet 의 leg row 에 question 명을 부제로 명시해서 혼동 방지.

질문 변경 시 basket 보존: **유지**. localStorage 의 `hl-markets-basket` key 에 `{ legs: [...], updatedAt }` 저장. 새 탭 / 새로고침에도 살아 있음.

상한:
- 최대 leg 수 = **20** (client). 그 이상은 chip 에서 차단.
- 한 outcome 은 한 leg (중복 추가 시 기존 leg 의 $ 만 갱신).
- localStorage 의 stale 방어: leg 의 `addedAt` 이 7 일 초과면 자동 제거 (해당 outcome 이 settle 됐을 가능성 큼).

### 2.6 Phase M — BasketSheet 구현 확정

Floating drawer 컴포넌트 `components/BasketSheet.tsx` (Phase M T-3):

- **viewport 분기** — `lg:` breakpoint (1024px) 기준:
  - mobile (< lg): 화면 **하단** 에서 올라오는 sheet. chip tap → translateY(0). swipe-down 으로 close.
  - desktop (≥ lg): **우측 rail** drawer. width ~ 420px, full-height, header sticky.
  - 동일 컴포넌트 — Tailwind `lg:fixed lg:right-0 lg:inset-y-0 lg:w-[420px]` + mobile fallback.
- **floating chip** — viewport 우하단, `legs.length > 0` 일 때만 표시. chip 라벨 = `Basket · ${n} · $${total}`.
- **leg row 동작**:
  - `$ 입력` 인라인 edit — debounce 300ms 로 `setUsd(assetId, value)` 호출.
  - `[×]` 클릭 → `remove(assetId)`. confirm 없음 (즉시).
  - 검증 메시지 (§4.1) 가 row 아래 빨강/노랑으로 inline.
- **ship 버튼** — 단일 `Place basket bet` CTA. agent 있으면 popup 0, 없으면 J.7 onboarding modal.
- **결과 inline** — submit 후 sheet 안에서 leg 별 result row 갱신 (toast 와 중복 노출 X).
- **localStorage** — 모든 state 변경 시 즉시 persist (write-through). key `hl-markets:basket-v1`.

### 2.7 localStorage schema — `hl-markets:basket-v1`

`lib/basket.ts` 가 single key 로 직렬화:

```ts
type BasketLeg = {
  assetId: number;          // HF asset id (HIP-4 outcome)
  outcomeName: string;      // "France" — 표시 캐시
  questionTitle: string;    // "2026 World Cup — Champion?" — sheet 부제
  ask: string;              // "0.30" — basket 담을 당시의 ask (stale 가능, 사용자 reference 용)
  usd: number;              // 사용자 입력 — invalid 일 수 있음
  addedAt: number;          // Date.now() — 7d 초과 시 자동 제거
  source?: "manual" | "discovery" | "topK";  // analytics + UI hint
  suggestedUsd?: number;    // Phase S/T/U: AI Discovery 가 제안한 quarter-Kelly 금액
};

type BasketStateV1 = {
  version: 1;
  legs: BasketLeg[];
  updatedAt: number;
};
```

핵심 규칙:
- `version: 1` — 향후 schema 변경 시 migration. 현재는 mismatch → wipe.
- leg dedupe key = `assetId` (한 outcome 은 한 leg).
- `source: "discovery"` 인 leg 는 BasketSheet row 에 작은 sparkles 아이콘 + tooltip "Suggested by AI Discovery".
- `suggestedUsd` 는 ref 만 — 사용자가 `usd` 를 덮어쓰면 그 값을 우선.

---

## 3. 변형 모드 (sheet 상단 토글)

기본은 **Manual** (위 §2.2). 두 가지 추가 모드:

### 3.1 Diversify 모드

```
┌─────────────────────────────────────────────────────────┐
│ Mode:  [ Manual ] [ Diversify ] [ Top-K ]               │
├─────────────────────────────────────────────────────────┤
│ Total to spend:  $ [ 100 ]                              │
│ Distribute:      ( ) uniform  (•) weighted by odds      │
│                                                         │
│ Preview (3 legs in basket):                             │
│  France   30¢   $42.86  → 142 shares                    │
│  Germany  53¢   $24.27  →  45 shares                    │
│  Brazil   50¢   $32.87  →  65 shares                    │
│                                                         │
│ [ Apply distribution ]                                  │
└─────────────────────────────────────────────────────────┘
```

- **uniform**: total / legs.
- **weighted by odds**: `weight_i = 1 / ask_i` 정규화 (싼 outcome 일수록 더 많이 배분).
  - 직관: 같은 $ 라도 싼 outcome 이 더 많은 share → "기대 share 균등" 에 가까움.
  - 대안: `weight_i = ask_i` (비싼 = high-confidence 에 더 배팅) — 옵션 미노출, 후속 검토.
- `Apply distribution` 누르면 manual mode 의 $ 칸에 값이 채워짐 — **수정 가능**.

### 3.2 Top-K bet 모드

```
┌─────────────────────────────────────────────────────────┐
│ Mode:  [ Manual ] [ Diversify ] [ Top-K ]               │
├─────────────────────────────────────────────────────────┤
│ Pick top  [ 5 ▾ ] outcomes by ask price                 │
│ Total to spend:  $ [ 100 ]                              │
│                                                         │
│ Selected (uniform):                                     │
│  Germany    53¢   $20.00                                │
│  Brazil     50¢   $20.00                                │
│  Argentina  35¢   $20.00                                │
│  France     30¢   $20.00                                │
│  England    25¢   $20.00                                │
│                                                         │
│ [ Add to basket ]                                       │
└─────────────────────────────────────────────────────────┘
```

- "favorite K" 자동 선택. 사용자가 분석 없이 시장 합의 따라가는 모드.
- `Add to basket` 누르면 기존 basket 에 leg 5 개 추가 (중복은 갱신).
- 한 question 페이지 안에서만 동작 (cross-question top-K 는 의미 없음).

### 3.3 bundling 시점 — HL native vs client-side

후보 비교:

| 방식 | 내용 | 채택? |
|------|------|------|
| **HL native multi-leg** | `orders[]` 에 N leg 묶어 1 action 전송. 사인 1, broadcast 1. | ✅ **채택**. |
| Client-side 순차 | leg 별로 N 번 별도 action 전송, 별도 nonce, 별도 사인. | ❌ — 팝업/agent 사인 N 회. 진짜 atomic broadcast 도 아님. |
| Smart contract bundling (CoreWriter) | EVM 컨트랙트 안에서 N leg 호출. | ❌ — outcome 시장은 spot, CoreWriter 경유 시 추가 risk + 우리 빌더 코드 통과 불확실. |

→ HL native 가 사인/UX/builder fee 모두 우리 요구에 맞음. 추가 인프라 0.

---

## 4. 검증 / 오작동 핸들링

### 4.1 leg 별 사전 검증 (client)

submit 전에 leg 단위로 체크:

| 검사 | 통과 조건 | 실패 시 |
|------|----------|--------|
| `usd ≥ 0.01` | 입력값 양수 | leg row 빨강, place 버튼 비활성 (해당 leg 만) |
| `usd × 100 / askPx ≥ 1` | 최소 1 share 매수 가능 | "Increase amount to at least $X" |
| `usd ≥ $10` | HL min notional per leg | "Below HL $10 minimum — increase or remove" |
| askPx 존재 | best ask 가 책에 있음 | "No asks right now" (leg 비활성, 회색 처리) |
| ask depth | `shares ≤ floor(bestAskSz)` | 자동 클램프 (J.6 와 동일). 초과 시 안내 toast. |
| outcome 활성 | governance status = active 등 | leg 자동 제거 + alert |

**전략**: 유효 leg 만 submit. 무효 leg 는 sheet 에 남겨두고, place 버튼 라벨은 `Place basket bet ($X, K of N legs)`.

### 4.2 server / HL 응답 처리

HL 응답 예시 (mixed):

```jsonc
{
  "status": "ok",
  "response": {
    "type": "order",
    "data": {
      "statuses": [
        { "filled": { "totalSz": "166", "avgPx": "0.301", "oid": 123 } },  // France OK
        { "error": "Order must have minimum value of $10." },                 // Germany 거부
        { "filled": { "totalSz": "0",   "avgPx": "0",     "oid": 124 } }   // Brazil IOC 0
      ]
    }
  }
}
```

처리:

1. `statuses.length === orders.length` 확인. 불일치면 fatal log + 사용자에게 "Unexpected response, check portfolio".
2. leg 별 매핑:
   - `filled.totalSz > 0` → 성공 toast (`✓ France filled 166 @ 0.301`).
   - `filled.totalSz === "0"` → "no fill" toast (IOC 인데 ask 사라짐 / IOC 가 limit 못 만짐).
   - `error` → 빨강 toast + sheet 안에 inline 에러.
3. **leg 별 toast 가 N 개 쌓이면 모바일 UI 깨짐.** → toast 묶어서 1 개:
   ```
   Basket: 2 filled, 1 no fill, 0 error  [ Details ]
   ```
   "Details" 클릭 시 expand.

### 4.3 부분 실패 후 leftover basket

- 성공한 leg 는 sheet 에서 자동 제거.
- 실패한 leg 는 sheet 에 남김 + 에러 표시. 사용자가 수정 후 재 Place 또는 [×] 삭제.
- 전체 fail (모든 leg error) → sheet 그대로 유지 + 큰 alert.

### 4.4 race condition

사용자가 Place 누른 직후 ask 가격이 바뀐다? — 우리는 IOC 라서 limit 으로 cap. 한 leg 가 못 차면 fill 0 으로 떨어질 뿐. parlay 처럼 한 leg 실패가 다른 leg 를 무효화하지 않음.

→ **추가 락 / 동기화 불필요**. user-facing "submitted" → "received" 사이의 stale 가격은 IOC + slippage 가 흡수.

---

## 5. Constitution 영향

### 5.1 XI (byte-for-byte sign hash)

- 우리 `sign_l1_action` 은 action 전체 msgpack hash 사인. leg 수 N 이 변해도 절차 identical.
- 영향 없음. 단, **golden fixture 를 확장**한다:

```
specs/001-hl-markets/golden/sign-l1-action.json
  + case "multi-leg-2": orders=[A, B],   expected sig=...
  + case "multi-leg-5": orders=[A..E],   expected sig=...
```

Python SDK (`hyperliquid-python-sdk`) 같은 입력으로 사인 → 동일 sig 나오는지 verify gate 에서 검증. 한 case 추가.

### 5.2 builder field 일관성

확정: action 레벨 `builder: {b, f}` 가 모든 leg 에 적용. leg 별 다른 builder 불가.
→ basket bet 도 단일 builder EOA + 단일 feeTenthsBps. Phase J.5 의 `getBuilderConfig()` 그대로 재사용.

> **Constitution 후보 조항 XIII**:
> Basket (multi-leg) order 는 단일 `builder` 필드를 모든 leg 에 동일하게 부착한다.
> leg 별 builder differentiation 시도는 금지 — HL action shape 자체가 single-builder 다.

### 5.3 Agent flow 와 결합

- agent privkey 가 사인하는 대상은 action 전체. leg 수 무관.
- 추가 fix 0. `signL1Action(agentPriv, action, nonce, network)` 그대로.
- 단, `placeBasketBet()` 도 agent 우선 사인 분기 (Phase J.7 path) 거치도록 `lib/trade.ts` 의 sign-dispatch 함수 재사용 — main wallet fallback 도 동일.

### 5.4 Mainnet rollout 영향

- mainnet 빌더 EOA 의 account value ≥ 100 USDC 가드는 그대로 (J.9).
- basket bet 도 builder fee 동일 정책 적용 (HIP-4 outcome 은 fee 0 — Phase J.5 finding #82).
- 새 ENV 추가 없음. 새 빌드 분기 없음. → mainnet 재배포 별도 step 없이 J.9 다음 배포에 자동 포함.

---

## 6. AI Discovery → Basket 통합 (Phase S/T/U)

> Spec: `discovery.md`. 본 섹션은 basket 쪽 인터페이스만.

Basket 은 **AI Discovery 결과를 집행으로 잇는 다리** 다. AI 가 outcome 을 골라줘도
사용자가 다시 5 번 클릭/사인하면 wow-moment 가 죽음 — basket 으로 한 번에.

### 6.1 흐름

```
[ AIDiscovery 결과 카드 ]                   ← Phase S (자연어 → 큐레이션)
  └ outcome row × 5
     ├ France · 30¢ · suggested $25         ← Phase T specialist (sports)
     │   └ rationale: "qualified late, ..."  ← Phase U deep agent skill
     │   └ confidence: 0.62
     │   └ quarterKelly($balance, p, ask)
     │       → suggestedUsd = $25
     │   └ [ Add to basket ] ─────────────┐
     ├ Germany · 53¢ · suggested $30      │
     │   └ [ Add to basket ] ─────────────┤
     └ ...                                │
                                          ▼
                                 lib/basket.ts add({
                                   assetId, outcomeName, questionTitle,
                                   ask, usd: suggestedUsd,
                                   source: "discovery",
                                   suggestedUsd,
                                 })
                                          ▼
                                 BasketSheet chip → user 검토 → Place
                                          ▼
                                 single user-signed `order` action (N legs)
```

### 6.2 quarter-Kelly suggested size

`lib/agents/analyst.ts` 의 `AnalystOutput.confidence` (= p, 0\~1) + 현재 best ask 로
classic Kelly 의 1/4 적용:

```ts
function quarterKelly(balanceUsd: number, p: number, ask: number): number {
  // outcome share 의 binary 베팅: payout = 1/ask if win
  const b = (1 - ask) / ask;            // odds (net win per 1 unit stake)
  const fStar = (b * p - (1 - p)) / b;  // Kelly fraction (positive only)
  if (fStar <= 0) return 0;
  const f = fStar / 4;                  // quarter-Kelly (vol guard)
  const usd = balanceUsd * f;
  return Math.max(10, Math.round(usd)); // HL min $10 — 그 미만이면 강제 $10
}
```

호출: `AIDiscovery` 의 각 result row 가 mount 될 때 evaluated. `balanceUsd` 는
사용자 perp account value (J.5 fetch). p 가 ask 보다 작으면 `fStar ≤ 0` → row 의
"Add to basket" 버튼이 회색 + "low edge" 라벨 (그래도 클릭은 허용 — 사용자 판단).

### 6.3 "Add to basket" 버튼 의미론

- AIDiscovery 의 `Add to basket` 클릭 → `lib/basket.ts add({ source: "discovery", suggestedUsd })`.
- 사용자가 BasketSheet 에서 `$` 칸을 직접 수정 가능 — `suggestedUsd` 는 보존, `usd` 만 덮어쓰기.
- 한 번에 모든 result 추가 — AIDiscovery 상단의 `Add all to basket` 보조 버튼 (Phase T-4 의 auto-explore 모드와 페어). 무효 edge 는 자동 제외.

### 6.4 Auto-execute (미래)

> 미구현 — Open #7 참조.

가설: `settings.autoExecuteDiscovery: true` 인 사용자는 AIDiscovery 가 완료되는 즉시
basket 에 채우고 *자동으로 Place* 까지 진행. 안전장치:

- `autoExecuteMaxNotionalUsd` 캡 (예: $50).
- min confidence (예: 0.55) 미만 leg 자동 제외.
- 직전 N 분 내에 같은 outcome 으로 auto-execute 한 적 있으면 중복 방지.
- Phase O autobet 의 rule engine 과 동일 코드 path 재사용 (autobet 도 internally basket 1-leg 임).

---

## 7. 구현 task graph

Phase L (landed):

| T# | Subject | Status |
|----|---------|--------|
| K-1 | `lib/basket.ts` — state + localStorage (`hl-markets:basket-v1`) | ✅ |
| K-2 | `lib/trade.ts` `placeBasketBet({ legs })` — orders[] + IOC clamp + builder root append + agent 사인 분기 | ✅ |
| K-3 | `components/BasketSheet.tsx` — mobile bottom sheet / desktop right rail drawer | ✅ (Phase M) |
| K-4 | `components/BasketAddButton.tsx` — `[+]` / `[✓]` 토글 | ✅ |
| K-5 | testnet 검증 — 3 leg → 1 sign → 3 fill | ✅ |
| K-8 | Golden fixture multi-leg-3-with-builder case + Python SDK verify | ✅ |

Phase S/T/U integration (landed):

| T# | Subject | Status |
|----|---------|--------|
| S-2 | AIDiscovery row → `add({ source: "discovery", suggestedUsd })` | ✅ |
| T-3 | specialist `confidence` 가 `quarterKelly` 입력 | ✅ |
| U-6 | discovery.ts 가 deep agent `AnalystOutput` 으로 suggestedUsd 산출 | ✅ |

Deferred / 후속 (현재 pending):

| T# | Subject | Note |
|----|---------|------|
| K-6 | Diversify / Top-K 모드 — sheet 상단 토글 | Phase L 에서 manual 만 ship. demand 낮음. |
| K-9 | leg cap 실측 (10/20/30 stress) | testnet 에 한해 3-leg / 5-leg 만 검증. mainnet 전 실측 필요. |
| Auto-exec | §6.4 — `settings.autoExecuteDiscovery` 플래그 | Open #7 |

---

## 8. Open questions / 후속 토픽

1. **leg 개수 실측 cap**: HL 실제로 한 action 에 몇 개까지 받는지 (msgpack/네트워크 layer 어디서 cut). 20 안에서 안전 가정이지만 mainnet 전 10/20/30 stress test.
2. **leg 별 partial fill 의 entry 가격 — portfolio entryNtl 합산 방식**: 한 leg 가 부분 fill (예: 100 share 요청, 73 fill) 일 때 entryNtl 가 정확히 73 \* avgPx 로 누적되는지 — Phase J.8 의 `entryNtl` 합산이 동일 outcome 의 multi-leg 누적과 정확히 호환되는지 확인 (이미 J.6 single-leg 에서 동작 — 이론상 OK).
3. **Diversify weighted formula 의 정밀도**: floor 처리로 1\~3¢ 가 떨어져나가는 dust — 마지막 leg 에 합산할지, 그냥 버릴지. (현재 안: 마지막 leg 에 합산. UI 에는 노출 안 함.) — Diversify 모드 자체가 deferred.
4. **chip vs Polymarket 의 "Bet slip" 헤더 버튼** 중 어떤 게 모바일에서 더 자연스러운지 — 둘 다 빌드해서 사용자 1 인 (운영자) 자체 테스트. → 현재 chip 만 ship.
5. **Settled outcome 자동 제거**: leg 의 outcome 이 settle 됐는데 사용자가 모르고 담아 둔 채로 Place 누르면? — basket sheet 가 열릴 때 한 번 `outcomeMeta` 로 status check + stale leg 자동 제거 + 사용자 안내 toast.
6. **Rebalance basket** (sell legs): cash-out 을 multi-outcome 단일 사인 묶음으로 — UI 가 portfolio 쪽에 별도 sheet 로 가야 할지, 같은 chip 에 mode 분기로 가야 할지 미정. HIP-4 sell builder fee 100% 이므로 revenue 영향 큼 (→ `revenue-model.md`).
7. **Auto-execute on Discovery** (§6.4): `settings.autoExecuteDiscovery` 플래그 + notional cap + min confidence + dedupe window. autobet rule engine 코드 path 재사용 후보.
8. **Leg dependency rules**: 사용자가 "France 가 fill 되면 Germany 도 fill, 안 되면 둘 다 cancel" 같은 conditional 을 원하는가? — HL native 로는 `grouping: "na"` 가 한계 (atomic broadcast 만, atomic fill 아님). 진짜 conditional 은 CoreWriter 컨트랙트 필요 (현재 outcome 시장 미지원).
9. **discovery 가 채운 leg 의 `suggestedUsd` divergence 추적**: 사용자가 quarter-Kelly 값을 자주 덮어쓰면 calibration 시그널. analytics 로그 후보.

다음 세션: Open #1 leg cap 실측 + Open #6 Rebalance basket 디자인 스파이크.

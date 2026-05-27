# Basket Bet — multi-leg single-sign spec

> Phase K — 한 question 내 여러 outcome (또는 cross-question N 개 outcome) 을
> **한 번의 클릭 + 한 번의 사인** 으로 동시 IOC 매수하는 기능.
>
> Source: <https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint#place-an-order> (2026-05-27 fetched).
> 비교 대상: Polymarket 의 "Add to slip" / Kalshi "multi-event bet" / 일반 sportsbook 의 parlay (단, parlay 는 곱 payout — 우리는 그게 아니라 **독립 leg** 임을 명확히 한다).
> Sibling: `agent.md` (Phase J.7 사인 분기), `portfolio.md` (Phase J.8 보유 표시), `outcome-market.md` (asset 매핑).

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

## 6. 구현 task graph

| T# | Subject | Depends on |
|----|---------|------------|
| K-1 | `lib/basket.ts` — basket state (in-memory + localStorage persist). add/remove/setUsd/clear/list. cross-question 지원. cap=20. | — |
| K-2 | `lib/trade.ts` 에 `placeBasketBet({ address, legs: [{assetId, usd, bestAskPx, bestAskSz}, ...] })` 추가. orders[] 빌드 + IOC limit clamp + builder field + agent 사인 분기. | K-1, J.7 sign dispatcher |
| K-3 | `components/BasketSheet.tsx` — floating chip + fullscreen sheet (모바일) / 우측 drawer (데스크탑). leg row + 입력 + 검증 + place 버튼. | K-1 |
| K-4 | `components/BasketAddButton.tsx` — outcome 카드에 부착하는 `[+]` / `[✓]` 토글 버튼 컴포넌트. | K-1 |
| K-5 | `SimpleTradeWidget.tsx` 안에 "Add to basket" 보조 액션 추가 (single-leg path 와 공존). | K-1, K-4 |
| K-6 | Diversify / Top-K 모드 — `components/BasketSheet.tsx` 에 mode toggle + 분배 계산 함수 (`lib/basket.ts` 안의 pure fn). | K-1, K-3 |
| K-7 | 응답 처리 — `lib/trade.ts` 의 statuses[] parser + leg ↔ result 매핑. 묶음 toast 컴포넌트 변형. | K-2 |
| K-8 | Golden fixture — multi-leg case 2 개 추가 + Python SDK 매칭 verify (Constitution XI). | K-2 |
| K-9 | testnet 검증 — 3 leg basket (uniform), 5 leg basket (Top-K), 1 leg 가 $9 일부러 → 거부 확인, 1 leg 가 ask 0 → fill 0 확인. 보유 자산이 portfolio 페이지에 정확히 반영. | all |
| K-10 | docs — `README.md` 의 Phase 표에 K 추가, `CHANGELOG` / `decisions log` 항목. | K-9 |

병렬 가능: K-1 끝나면 K-3 / K-4 / K-2 동시 진행. K-8 은 K-2 와 paired.

---

## 7. Open questions

1. **leg 개수 실측 cap**: HL 실제로 한 action 에 몇 개까지 받는지 (msgpack/네트워크 layer 어디서 cut). 20 안에서 안전 가정이지만 K-9 에서 10/20/30 stress test.
2. **leg 별 partial fill 의 entry 가격 — portfolio entryNtl 합산 방식**: 한 leg 가 부분 fill (예: 100 share 요청, 73 fill) 일 때 entryNtl 가 정확히 73 \* avgPx 로 누적되는지 — Phase J.8 의 `entryNtl` 합산이 동일 outcome 의 multi-leg 누적과 정확히 호환되는지 확인 (이미 J.6 single-leg 에서 동작 — 이론상 OK).
3. **Diversify weighted formula 의 정밀도**: floor 처리로 1\~3¢ 가 떨어져나가는 dust — 마지막 leg 에 합산할지, 그냥 버릴지. (현재 안: 마지막 leg 에 합산. UI 에는 노출 안 함.)
4. **chip vs Polymarket 의 "Bet slip" 헤더 버튼** 중 어떤 게 모바일에서 더 자연스러운지 — 둘 다 빌드해서 사용자 1 인 (운영자) 자체 테스트.
5. **Settled outcome 자동 제거**: leg 의 outcome 이 settle 됐는데 사용자가 모르고 담아 둔 채로 Place 누르면? — basket sheet 가 열릴 때 한 번 `outcomeMeta` 로 status check + stale leg 자동 제거 + 사용자 안내 toast.

다음 세션: Open question #1 의 leg cap 실측부터, 그 다음 K-1.

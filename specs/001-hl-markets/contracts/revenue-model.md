# Revenue Model — HIP-4 Outcome Market Builder Fee

> Phase L (2026-05-27) finding 의 핵심 문서. hl-markets 가 어떻게 운영비를
> 회수하는지 + 사용자 경제와 어떻게 정합하는지.
> Source: testnet 실측 + HL Builder Codes 문서 + outcome 시장 fill 데이터.

---

## 1. 발견 (TL;DR)

HIP-4 outcome 시장의 builder fee 정책은 **비대칭**:

| 행동 | Builder fee 결과 |
|---|---|
| **Buy** (open long YES / open long NO) | **0**. `order.builder.f` 가 무엇이든 HF 가 silent zeroing. 사용자가 추가 부담 없음. |
| **Sell** (close position) | **100%**. `builder.f` 그대로 부과. seller 의 proceeds 에서 차감. |

testnet 실증: 100-unit sell, `builder.f = 100` (= 1 bp 환산), 결과 **0.0265665 USDC** 가 builder addr 의 `userFills` row 에 기록됨.

이는 일반 spot 마켓과 다른 outcome-시장-전용 정책으로 추정됨. HL docs 가
명시하지 않은 부분이므로 mainnet rollout 전 한 번 더 검증 필요.

`docs/HIP4-fee-policy.md` 가 실험 절차 + raw output 포함.

---

## 2. 함의 — 사업 모델

### 2.1 무엇이 좋은가

사용자 입장:
- **신규 진입 마찰 0**. AI 가 추천해도 buy 단계에서 사용자가 빼앗기는 게 없으니, "한 번 시도해보자" 의 진입 비용이 0. 폴리마켓 (2% taker fee) 대비 명백한 가격 우위.
- **수익 실현 시점에만 fee 부과** = 사용자가 이미 "이 포지션 끝낸다" 라고 판단한 시점에만 손해. 진입 잘못된 후 나가지도 못해서 추가 fee 까지 무는 시나리오 없음.
- AI 가 사용자에게 "더 많이 사라" 라고 부추겨도 builder 가 직접 이득 보지 못함 (buy fee 0). AI 의 인센티브가 사용자와 더 정합.

운영자 (builnad) 입장:
- 수익이 **PnL 실현 시점** 에 발생 → 활성 trader 가 정기적으로 close 하는 한 안정.
- 수익이 **buy size 와 분리** → AI 가 큰 사이즈 추천해서 사용자가 망해도 운영자가 단기 이득 안 봄 → 도덕적 해이 차단.

### 2.2 무엇이 위험한가

- 사용자가 winner side 에서 expiry 까지 holding → 자동 정산. sell action 안 거치므로 builder fee 0. "고배당 outcome 가 정산까지 가는" 시나리오에서는 수익 0.
- 사용자가 loser side 에서 expiry → 같은 이유로 sell 안 거침 → 수익 0.
- 즉, **active trader (포지션 자주 turnover)** 가 수익원. 장기 holder 만 있다면 수익 거의 0.

이 비대칭은 우리 product strategy 의 핵심 가이드라인이 된다 — "Discovery" 와 "Portfolio" 는 사용자가 포지션을 **자주 회전** 할 수 있게 만들어야 한다.

---

## 3. 가격 정책 (defaults)

| 항목 | 값 | 비고 |
|---|---|---|
| `NEXT_PUBLIC_BUILDER_FEE_BPS` | **5** | 5 bps = 0.05%. sell 시 100% 부과. |
| `approveBuilderFee.maxFeeRate` | `"0.01%"` (= 10 bps) | 사용자 1회 approve 한도. 운영자가 추후 fee 올릴 여유 + 안전 cap. |
| 사용자 UI 표시 | sell confirm 모달에 "Builder fee: 5 bps (≈ $X)" | buy 시에는 "No buy fee" (Constitution XI 의 정직성). |

5 bps 는 **perceptual threshold 미만** (사용자가 fee 인식 못 함) + **운영
지속 가능** (월 trading volume × bps 가 server cost 와 비교) trade-off 의 결과.

추후 mainnet rollout 후 데이터 보면서 조정. 절대 사용자에게 사전 공지 없이
인상하지 않음 (Constitution XIII — single builder code, env 한 곳).

---

## 4. 사용자 인지 — Constitution XI 정합성

**buy confirm 모달** (TradeWidget / SimpleTradeWidget / BasketSheet):
```
[Buy 12 shares of "France wins" at $0.43]
Estimated cost: $5.16
Fee: $0 (HL outcome markets — buy is free)
[Confirm]
```

**sell confirm 모달** (Portfolio Cash out, basket sell leg, etc.):
```
[Sell 50% of "France wins" position]
Estimated proceeds: $7.21
Builder fee (5 bps): $0.0036
You receive: $7.2064
[Confirm]
```

basket bet 의 경우 leg 별로 buy/sell mix 가능 → 모달이 leg 마다 fee 0 / X 정확히 분리 표시.

---

## 5. Fee 청구

매월 1-2회 builder EOA 로 `claimReferralReward` 호출 (Python SDK 또는 HL UI). 누적된 fee 가 EOA 잔고로 들어옴. mainnet 만 의미.

수익 추적 — mainnet builder fills CSV: `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/<addr-lowercase>/<YYYYMMDD>.csv.lz4`.

추후 hl-markets backend 가 자동 CSV ingest 해서 daily revenue 보여주는 admin view 추가 가능 (Phase V+ 옵션, 필수 X).

---

## 6. AI 와의 정합성

Phase O 의 autobet, Phase S/T/U 의 AI Discovery, Phase P 의 AIAnalyzePanel 가 사용자에게 정보를 제공하면서 다음과 같이 incentive align:

- AI Discovery 가 추천 → 사용자가 buy → 우리 수익 0. 추천이 자신 있어야 사용자가 close 하면서 수익 줌. 잘못된 추천 = 사용자가 close 시 손실 + 우리 fee 작음 (작은 proceeds × bps).
- Autobet 도 buy 시 fee 0. 자동 진입 cost 0. 하지만 sell 액션은 별도 (Phase O 의 default 는 buy 만 autobet — sell 는 "manual close" 로 안전 보호).
- AIAnalyzePanel 은 한 outcome 의 fair vs market 차이를 보여주므로 사용자 의사결정 보조. AI 가 "open 하라" 말해도 (buy fee 0) 우리가 직접 인센티브 못 챙김.

이 구조는 **AI 의 정확도가 우리 수익과 직접 비례** 하지 않게 만들어서
Constitution XIV ("AI advisory only") 와 정합한다. 우리가 AI 정확도 압박을
받지 않는 한 AI 가 사용자를 속이도록 유도할 incentive 가 없다.

---

## 7. Open items

- mainnet 에서 HIP-4 outcome 시장 trade 1건 실행해서 testnet 실측이 mainnet 에도 동일한지 검증 (V-2 task).
- spot 한도 1% vs perp 한도 0.1% 중 HIP-4 가 어느 쪽을 따르는지 — 5 bps 는 양쪽 모두 통과 (sub-bp wide margin) 이지만 mainnet sanity 권장.
- 향후 fee 인상 / 차등 (volume tier) 정책 — 일단 Phase V 안 가져옴.
- Builder fee 의 referral chain (사용자가 다른 builder 에게 redirect) — HL UI 가 표시하는 referrer 와 우리 builder 가 동시 작동하는지 검증 필요 (mainnet only).

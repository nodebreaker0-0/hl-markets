# Builder Code — setup + integration spec

> Phase J.5 ("in-app trade with builder code") 의 전제 조건 문서.
> Source: <https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes> (2026-05-27 fetched).

---

## 1. 무엇인가

HL의 **Builder Code** 는 builder (= 우리 같은 dApp 운영자) 가 자기 사이트를 통해 발생한 trade 의 fee 일부를 받는 메커니즘. 폴리마켓의 "Referral" 비슷한 것.

핵심 사실:
- Builder fee 는 **주문 단위로 옵션** (`order.builder = {b, f}`).
- 매 user 가 builder 마다 **한 번씩 max fee 를 approve** 해야 함. 그 안에서만 fee 청구 가능.
- fee 단위는 **tenths of basis points**. `f=10` ≡ 1 bp ≡ 0.01%. **5 bps = `f=50`.**
- 한도: perp **0.1%** (= 100), spot **1%** (= 1000).
- HIP-4 outcome 마켓은 spot 방식으로 정산 (asset 0/1 settle); 우선 spot 한도 적용 가정.
- Builder 주소는 **perps account value ≥ 100 USDC** 보유 필수 (안 그러면 fee 무시).
- 한 user 가 동시에 active 한 builder approval **최대 10개**.
- Builder fee 청구는 일반 referral reward 채널 (`/exchange` action `claimReferralReward` 또는 UI).
- Mainnet builder fills CSV: `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/<addr-lowercase>/<YYYYMMDD>.csv.lz4`.

## 2. 결정 (hl-markets J.5)

### 2.1 Builder EOA

- 별도 personal EOA 1개. builnad 가 들고 있는 main wallet 또는 fresh 한 새 wallet.
- **mainnet + testnet 각각 다른 EOA** OK — env 로 분기.
- **deposit 요건**: mainnet builder EOA 에 ≥ 100 USDC perp account value. testnet 도 (testnet USDC) 100 이상 있어야 fee 처리됨.

### 2.2 Fee 정책

- **default `f = 50` (= 5 bps = 0.05%).** 폴리마켓이 약 2% taker fee 인 점 감안 작은 편 — early-adopter 친화.
- env: `NEXT_PUBLIC_BUILDER_FEE_BPS=5` (frontend 가 tenths-bps 로 환산해서 action 에 set).
- 추후 마켓별 / volume tier 별 다른 fee 가능성: 일단 single value.

### 2.3 Env vars (frontend)

```
NEXT_PUBLIC_BUILDER_ADDR_MAINNET=0x...
NEXT_PUBLIC_BUILDER_ADDR_TESTNET=0x...
NEXT_PUBLIC_BUILDER_FEE_BPS=5            # human-readable bps, code converts to tenths-bps
NEXT_PUBLIC_BUILDER_MAX_FEE_PCT_STR=0.01% # approveBuilderFee 의 maxFeeRate (작게 잡고 추후 조정)
```

빌드 시 `lib/network.ts` 옆에 `lib/builder.ts` 두고 `CURRENT_NETWORK` 따라 적절한 addr 픽.

> **NOTE**: 위 placeholder 주소들은 Phase J.5 구현 시 builnad 가 EOA 결정 후 채움.

### 2.4 Constitution XI 일관성

- Backend 의 `/trade-forward` 는 사용자가 sign 한 action 의 `builder` 필드를 **변경하지 않는다**. 필드 부재 시 추가도 하지 않는다.
- Frontend 가 sign 전에 builder field 를 action 에 명시 포함하고 사용자가 sign 결과로 그 필드를 인증한다.
- UI: 주문 confirm 모달에 "Builder fee: 5 bps (≈ $X)" 명시.

## 3. 셋업 — user 시점

처음으로 hl-markets 에서 trade 시도하는 user 가 거치는 흐름:

1. Wallet connect (Phase J.1).
2. 마켓 페이지의 Trade widget → "Connect & approve builder fee" 버튼 (이건 J.5 의 첫 1회).
3. 우리가 `approveBuilderFee` action 빌드:
   ```json
   {
     "type": "approveBuilderFee",
     "maxFeeRate": "0.01%",          // 우리 default 보다 살짝 여유
     "builder": "0xBUILDER..."        // CURRENT_NETWORK 에 맞는 addr
   }
   ```
4. user main wallet 으로 sign (HL action signing, chainId 1337).
5. POST → HF `/exchange` (또는 우리 backend `/trade-forward` 를 한 통로로 같이 처리).
6. 응답 OK → 이후 모든 trade 가 builder fee 포함 가능.

승인된 한도는 `info` `{"type":"maxBuilderFee","user":...,"builder":...}` 로 확인 가능 — UI 의 "trade 전 체크".

## 4. Order 빌드 — Phase J.5 양식

User 가 sign 할 action shape (perp/spot 동일):

```json
{
  "type": "order",
  "orders": [
    {
      "a": <asset_id>,                  // 우리는 outcome key #NNNN → asset id 매핑 필요
      "b": <isBuy: true|false>,
      "p": "<price>",                   // 0~1 문자열 (outcome)
      "s": "<size>",                    // share 수
      "r": false,                       // reduceOnly
      "t": { "limit": { "tif": "Ioc" | "Gtc" } }
    }
  ],
  "grouping": "na",
  "builder": {
    "b": "0xBUILDER...",
    "f": 50                              // 5 bps
  }
}
```

> `a` (asset id) 매핑: `#NNNN` 형태의 outcome asset key → integer asset id 가 필요. `meta.universe` (spot meta?) 에서 universe[].name 으로 lookup. Phase J.5 R&D 항목.

## 5. Backend route — `/trade-forward`

Constitution XI 강제:

1. POST body = `{ action, signature, nonce, chainId }`.
2. Backend 는 **action JSON 을 절대 mutate 하지 않는다**. Type-check 만 (zod schema, `builder.f` ≤ 100 가드 등 sanity).
3. signature recovery → JWT 의 address 일치 검증 (sign-in 한 wallet 만 trade 가능 보장).
4. HF `/exchange` 로 forward (`{action, signature, nonce, vaultAddress: null}`).
5. HF 응답 그대로 반환. Backend 가 응답 마사지 0.
6. Audit log: `chat_session.address`, `action.coin`, `action.b`, `action.f`, HF status. (Personal 운영이라 별도 BI 없음, 그냥 file log.)

## 6. Fee 청구

매월 1-2회 builder EOA 로 `claimReferralReward` 호출 (Python SDK 또는 UI). 누적된 fee 가 EOA 잔고로 들어옴. mainnet 만 — testnet 은 의미 없음.

CSV 다운로드로 fills 추적 (위 §1 의 stats-data URL).

## 7. HIP-4 Builder Fee Asymmetry (Phase L finding, 2026-05-27)

testnet 실측 결과 — outcome 시장은 일반 spot/perp 와 다른 정책:

| 행동 | 결과 |
|---|---|
| Buy (open long YES / NO) | HF 가 `builder.f` 를 silent zeroing. 사용자 부담 0. |
| Sell (close) | `builder.f` 100% 부과. seller proceeds 에서 차감. |

evidence: testnet 100-unit sell, `builder.f = 100` (1 bp) → 0.0265665 USDC 가
builder addr 의 `userFills` row 에 기록.

함의:
- buy confirm 모달: "No buy fee" 표시 (정직성, Constitution XI).
- sell confirm 모달: "Builder fee 5 bps (≈ $X)" 표시.
- 사용자가 활발히 close 할 때만 수익 발생 → AI 가 "open" 부추겨도 운영자 직접 이득 없음 → 인센티브 정합.

`contracts/revenue-model.md` 가 사업 모델 전체 문서. `docs/HIP4-fee-policy.md`
가 실험 raw output + 재현 절차.

## 8. Resolved questions (was §7 open)

- ~~HIP-4 outcome 마켓에 builder code 가 perp 한도 (0.1%) 인지 spot 한도 (1%) 인지~~ → asymmetric: buy 무료, sell 100% (위 §7).
- ~~`approveBuilderFee` 의 `maxFeeRate` 가 hl-vote-web 의 EIP-712 signer 와 호환되는지~~ → 호환 확인됨 (J.5 testnet).
- ~~Phase J.5 의 asset id 매핑 R&D~~ → `meta.universe[].name` 에서 `#NNNN` lookup, indexer 가 cross-verify (Phase E 의 outcome lifecycle 코드 재사용).

## 9. Phase L extension — Multi-leg basket

`order` action 의 `orders[]` 가 N개 leg 일 때:
- 모든 leg 에 동일 `builder: {b, f}` attach (`builder` 는 action level field 가 아니라 order level 이 아닌, action level 임에 주의).
- backend `/trade-forward` 가 leg byte 보존 + builder byte 보존 → byte-for-byte forward.
- HF response 가 `statuses[]` row 별 fill 결과.

자세히는 `contracts/basket-bet.md`.

## 8. References

- HL Builder Codes docs: <https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes>
- Python SDK example: <https://github.com/hyperliquid-dex/hyperliquid-python-sdk/blob/master/examples/basic_builder_fee.py>
- HF `/exchange` endpoint: <https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint>
- Referral state info request: `{"type":"referral","user":"0x..."}`

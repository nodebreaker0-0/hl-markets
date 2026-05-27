# Agent (API wallet) — onboarding + signing spec

> Phase J.7 ("매끄러운 거래 UX") 의 핵심 문서.
> Source: <https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint#approve-an-api-wallet> (2026-05-27 fetched).
> 비교 대상: Polymarket (1-tap auth), Backpack, Phantom 의 HL builder code 통합.

---

## 1. 문제

**현재 (Phase J.5+J.6)**: 사용자가 거래할 때마다 MetaMask 팝업 뜨고 main wallet 으로 사인.
- 첫 거래 = approveBuilderFee 사인 1번 + order 사인 1번 (2개 팝업)
- 후속 거래 = order 사인 1번 (1개 팝업)

UX 문제:
- Polymarket 은 첫 진입 후 sign 0번. 우리 1번. 차이가 매우 큼.
- 모바일에서는 wallet 앱 ↔ 브라우저 왕복 비용이 큼.
- IOC 시장가 거래의 "체결 안전성"이 사용자 반응 속도에 종속.

**해결**: HL `approveAgent` 메커니즘.

## 2. HL Agent (API wallet) 메커니즘

HL 의 agent 시스템:
- 사용자가 main wallet 으로 한 번 `approveAgent` action 사인.
- agent address (= ephemeral EOA) 를 HL 시스템에 등록.
- 등록된 agent EOA 의 사인은 main wallet 의 사인과 동등하게 처리됨 (단, **거래 한정**).
- agent 권한: **거래 + cancel + transfer 일부**. 출금/송금 권한 없음 (자금 안전).

action shape:
```json
{
  "type": "approveAgent",
  "hyperliquidChain": "Testnet" | "Mainnet",
  "signatureChainId": "0x66eee",
  "agentAddress": "0x<agent EOA>",
  "agentName": "hl-markets",
  "nonce": <unix-ms>
}
```

사인 방식: `HyperliquidTransaction:ApproveAgent` user-signed action (chainId = wallet active, NOT 1337 phantom).

agent 만료: HL 의 자동 만료는 따로 없음 (사용자가 명시적으로 다른 agent 등록하거나 invalidate 안 하면 영구). 다만 사용자 측에서 안전성 위해 만료 시간을 자체 관리 권장.

## 3. 결정

### 3.1 Agent EOA 생성

- `viem` 의 `generatePrivateKey()` 사용.
- 브라우저 `crypto.getRandomValues` 기반 → 32 바이트 random.
- privkey 는 평생 브라우저 외부로 나가지 않음.
- 같은 main wallet × network 조합 당 하나의 agent.

### 3.2 Agent privkey 저장

저장소 후보 비교:
- `localStorage`: XSS 노출. 거부.
- `sessionStorage`: 탭 닫으면 사라짐. 매번 재인증 = 의미 없음. 거부.
- `IndexedDB`: 영구 + 도메인 격리. **채택**.
- `Web Crypto API` 의 non-extractable key: 가장 안전하지만 secp256k1 미지원. 거부.

키 구조 (IndexedDB):
- DB: `hl-markets-agent`
- store: `agent`
- key: `${main_address}:${network}` (소문자)
- value: `{ privKey: hex, address: hex, createdAt: number, network: 'testnet'|'mainnet', mainAddress: hex }`

privkey 는 **plaintext hex 로 저장**. AES 암호화는 obfuscation 만 추가 — 같은 도메인 코드가 풀 수 있는 키를 또 저장해야 하므로 실효 보안 향상 없음. XSS 가 진짜 위협이지만 그건 CSP + 의존성 감사로 대응.

### 3.3 Onboarding flow

**조건**: 사용자가 처음 거래 시도 OR agent 가 없는 상태일 때.

순서:
1. 사용자가 `Bet on X` 클릭.
2. UI: `Enable trading on hl-markets` 모달 띄움.
   - 안내: "한 번만 사인해두면 그 다음부터 모든 거래가 팝업 없이 즉시 체결됩니다. 자금 출금 권한 없음."
3. 모달 `Enable` 클릭 시:
   - a. agent EOA 생성 (IndexedDB 저장).
   - b. 사용자 main wallet 으로 사인 2개 **순차** (HL 은 multi-action 묶음 미지원):
     - `approveAgent { agentAddress, agentName: "hl-markets" }`
     - `approveBuilderFee { maxFeeRate, builder }`
   - c. 둘 다 성공 → 모달 닫고 원래 trade 진행.
   - d. 어느 하나 실패 → IndexedDB 의 agent 삭제 + 에러 표시.

### 3.4 사인 분기

L1 actions (`order`, `cancel`, ...):
- agent 존재 + 등록 확인됨 → **agent privkey 로 사인** (브라우저, 팝업 없음).
- agent 없음 / 미등록 → onboarding flow.

User-signed actions (`approveAgent`, `approveBuilderFee`, `withdraw`, ...):
- **항상 main wallet 으로 사인**. agent 는 user-signed actions 자체에 권한 없음.

### 3.5 Builder code 일관성

agent 가 사인한 order 도 `action.builder = {b, f}` 필드 그대로 부착.
- HL 시스템은 agent 사인을 main wallet 사인으로 inflate 후 builder fee 처리.
- ✅ Polymarket 와 동일 동작. 빌더 수익 그대로.

### 3.6 Agent 무효화

발생 조건:
- 사용자가 다른 기기 / 브라우저에서 다른 agent 를 등록 → 기존 agent 자동 무효.
- 사용자가 명시적으로 logout → IndexedDB 의 agent 삭제 + (선택) HL 에 다른 dummy address 로 approveAgent 해서 invalidate.
- 사용자가 모종의 이유로 invalidate 원함.

detection:
- 거래 실패 응답이 `Agent does not exist` 같은 형태 → onboarding 재유도.
- 정기적으로 `userRole(main_address)` 호출해서 등록된 agent 목록 확인 (호출 비싸지 않음).

### 3.7 보안 모델

1. **Privkey 격리**: 같은 origin (http://localhost:3000) 에서 동작하는 JS 코드만 IndexedDB 접근 가능. 다른 도메인 코드 차단.
2. **출금 차단**: HL `approveAgent` 자체가 거래/cancel 권한만 부여. 출금/주소 변경 등 자금 위협 action 은 main wallet 필요.
3. **XSS 방어**: CSP `script-src 'self'` + 의존성 lockfile 감사. (이미 Constitution III 에 명시.)
4. **CSRF 방어**: agent 의 사인은 EIP-712 typed data 기반 → 다른 origin 이 사용자 wallet 통해 공격 불가.
5. **Backup/portability**: agent privkey 은 의도적으로 export UI 제공 안 함. 분실 시 단순히 다시 onboard.

### 3.8 만료/갱신 정책

자체 만료 추가:
- agent createdAt 기준 **30 일 후** 만료 처리 (UI 측).
- 30 일 후 첫 거래 시 onboarding 모달 다시 띄움.
- 보안 vs UX trade-off: HL 자체는 무한 valid 라 30 일은 self-imposed.

### 3.9 UX 일관성

- TradeWidget Bet/Cash out 클릭 시 agent 없음 → onboarding 모달 자동 호출.
- onboarding 완료 후 곧바로 원래 trade 진행 (resume).
- 사용자 입장: "한 번 Enable 누르면 그 다음부턴 그냥 BET 클릭 → 즉시 체결" 으로 인식.

## 4. 구현 task graph

| T# | Subject | Depends on |
|----|---------|------------|
| J.7-1 | lib/agent.ts — generate, save, load, delete (IndexedDB) | — |
| J.7-2 | lib/signing/agent-sign.ts — agent privkey 로 L1 action 사인 | J.7-1 |
| J.7-3 | lib/signing/user-signed/approveAgent.ts | — |
| J.7-4 | lib/trade.ts — order 사인 분기 (agent 우선) | J.7-1, J.7-2 |
| J.7-5 | components/EnableTradingModal.tsx — onboarding 2-step | J.7-1, J.7-3 |
| J.7-6 | TradeWidget / SimpleTradeWidget — agent 부재 시 modal 트리거 | J.7-5 |
| J.7-7 | Agent 만료 / invalidate 처리 | J.7-1 |
| J.7-8 | testnet 검증 — 첫 진입에 main wallet 2 사인 → 후속 5건 팝업 없이 | all |

## 5. Constitution 영향

추가 조항 후보:
> **XII. Agent 사인의 builder code 부착은 main wallet 사인과 동일하게 보장한다.**
> agent 가 사인한 order action 이 forward 되는 경로에서도 builder.b / builder.f 변조 금지.

XI (byte-for-byte) 와 함께 묶임.

## 6. Open questions

- HL 의 agent 동시 등록 한도? (몇 개까지 사용 가능)
- agent 사인 시 nonce 충돌 처리 (main wallet 과 별도 nonce space 인지)
- 다른 builder code 운영자 (Backpack 등) 의 agent privkey 저장 방식 — IndexedDB / encrypted localStorage / WebAuthn 중 무엇?

다음 세션 시작 시 Open questions 먼저 짧게 검증 후 J.7-1 부터.

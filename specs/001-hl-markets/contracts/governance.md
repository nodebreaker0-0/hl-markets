# Contract: Governance (variant classification + renderer + quorum)

> Constitution §V (Plugin/Renderer Extensibility) 의 구체 명세.
> 새 거버넌스 variant 가 publisher 에서 등장하면 이 contract 의 규약대로 1 renderer 파일 + 1 classify entry 만 추가하면 코어 코드는 변경 X.

## 1. Variant 분류

`validatorL1Vote` action 의 첫 non-`type` key 로 분류.

| inner key | Variant | UI 라벨 |
|---|---|---|
| `O` | outcome | "Outcome" (민트 액센트) |
| `D` | delisting | "Delisting" (빨강 액센트) |
| (future, e.g. `G`) | unknown | "Unknown variant (raw)" + 경고 |

`apps/frontend/lib/governance/classify.ts`:

```ts
export type Variant = 'outcome' | 'delisting' | 'unknown';

const KNOWN: Record<string, Variant> = {
  O: 'outcome',
  D: 'delisting',
  // 새 variant 추가 시: G: 'governance' 같은 한 줄
};

export function classify(action: { type: string; [k: string]: unknown }): {
  variant: Variant;
  innerKey: string | null;
} {
  const innerKey = Object.keys(action).find((k) => k !== 'type') ?? null;
  const variant = innerKey && innerKey in KNOWN ? KNOWN[innerKey] : 'unknown';
  return { variant, innerKey };
}
```

## 2. Renderer interface

각 variant 별 detail view + card summary.

`apps/frontend/lib/governance/types.ts`:

```ts
import type { ValidatorSummary } from '@/lib/validators';

export interface GovernanceItem {
  network: 'testnet' | 'mainnet';
  /** stable id — sha256(msgpack(action)) hex */
  govId: string;
  /** raw HF action, kept verbatim (Constitution-grade) */
  action: { type: 'validatorL1Vote'; [k: string]: unknown };
  variant: Variant;
  innerKey: string | null;
  expireTime: number;
  votes: `0x${string}`[];        // governance address of voters
  quorumReached: boolean;        // HF의 자체 판단 (확인 후 사용)
  /** historical only */
  status: 'pending' | 'settled' | 'expired';
  firstSeenAt: number;
  settledAt?: number;
}

export interface RendererContext {
  validators: ValidatorSummary[];  // active set
  poll?: { yes: number; no: number; ... };   // Phase G
  marketData?: any;                 // Phase H (perp 가격 등)
}

export interface VariantRenderer {
  Card: React.FC<{ item: GovernanceItem; ctx: RendererContext }>;
  Detail: React.FC<{ item: GovernanceItem; ctx: RendererContext }>;
  /** "내가 staking 한 validator 가 이 거버넌스에 어떻게 vote?" 표 row 컬럼 */
  myDelegationRow?: React.FC<{ item: GovernanceItem; voter: ValidatorSummary; ctx: RendererContext }>;
}
```

`apps/frontend/lib/governance/renderers/index.ts`:

```ts
import { outcome } from './outcome';
import { delisting } from './delisting';
import { unknown } from './unknown';
import type { Variant } from '../classify';
import type { VariantRenderer } from '../types';

export const renderers: Record<Variant, VariantRenderer> = {
  outcome,
  delisting,
  unknown,
};
```

새 variant 추가 = `renderers/<name>.tsx` 1 파일 + 이 index 의 1줄 + classify 의 1 entry.

## 3. Quorum / 통과 기준

Jeff 인용 (tentative): **stake ≥ 20% AND count ≥ 50%** of active validators.

`apps/frontend/lib/governance/thresholds.ts`:

```ts
import type { ValidatorSummary } from '@/lib/validators';

export const STAKE_THRESHOLD = 0.20;
export const COUNT_THRESHOLD = 0.50;

export interface QuorumStatus {
  totalActiveStake: bigint;   // sum of active validators' stake
  totalActiveCount: number;
  votedStake: bigint;         // sum of voters' stake (matched against governance address)
  votedCount: number;
  stakeRatio: number;
  countRatio: number;
  stakeReached: boolean;
  countReached: boolean;
  quorumReached: boolean;     // stakeReached && countReached (locally computed)
}

export function computeQuorum(
  active: ValidatorSummary[],
  votedAddresses: string[],
): QuorumStatus {
  const votedSet = new Set(votedAddresses.map((a) => a.toLowerCase()));
  const totalActiveStake = active.reduce((s, v) => s + BigInt(v.stake), 0n);
  const totalActiveCount = active.length;
  const votedActive = active.filter((v) => votedSet.has(v.validator.toLowerCase()));
  const votedStake = votedActive.reduce((s, v) => s + BigInt(v.stake), 0n);
  const votedCount = votedActive.length;
  const stakeRatio = totalActiveStake > 0n ? Number(votedStake * 10000n / totalActiveStake) / 10000 : 0;
  const countRatio = totalActiveCount > 0 ? votedCount / totalActiveCount : 0;
  const stakeReached = stakeRatio >= STAKE_THRESHOLD;
  const countReached = countRatio >= COUNT_THRESHOLD;
  return {
    totalActiveStake, totalActiveCount, votedStake, votedCount,
    stakeRatio, countRatio, stakeReached, countReached,
    quorumReached: stakeReached && countReached,
  };
}
```

UI 의 `<QuorumBar>` 가 2개 progress (stake / count) + 임계 표시. Jeff 인용 "tentative" 명시 (값 변동 가능).

## 4. govId — 안정 식별자

HF `validatorL1Votes` 응답은 `id` 안 줌. 우리가 안정 id 필요 (DB PK + URL 경로).

`govId = sha256(msgpack(action))` (hex string).

- msgpack 직렬화는 hl-vote-web 패턴 (insertion order 보존). 새 패키지 의존 없이 `@msgpack/msgpack` 가 fallback. 또는 stable JSON canonical 도 가능 — **추후 결정**. 일단 msgpack 으로 가정.
- 같은 action 의 govId 는 시간 무관 동일. 두 번 등장하는 vote (예: settle 후 같은 outcome 다시 등록) 는 다른 nonce 라도 같은 action 이면 같은 govId — 이건 edge case (실제로는 publisher 가 다른 nonce 로 새 govId 생성).

## 5. Variant detail view 명세

### 5.1 Outcome

거버넌스 통과 후 **HIP-4 outcome contract** 로 등록 → HyperCore 의 standard orderbook 에서 trading. 자세한 lifecycle / data sources / Polymarket-style UI 매핑은 **`contracts/outcome-market.md`** 참조.

데이터 source (거버넌스 action 단계):
- 두 가지 known inner op:
  - `action.O.registerTokensAndStandaloneOutcome` — `nameAndDescription: [title, desc]`, `sideNames: [s1, s2, ...]`
  - `action.O.registerTokensAndQuestion` — `name`, `description`, `sideNames`
- `action.O.settle` 또는 비슷한 변형 — 정산 액션 (별도 govId, 같은 outcome 에 대해 deployment 와 settlement 두 단계)
- 새 inner op 가 등장하면 outcome renderer 의 `extractOutcome` 보강 + 본 절에 한 줄 추가

거버넌스 통과 후 (deploy 거버넌스 quorum 달성):
- `outcomeMeta.outcomes[]` 에 새 entry 추가 — `outcome` 정수 ID + 등장한 `name`/`description`/`sideSpecs`
- 우리 indexer 가 `(name, description)` heuristic + 시간 매칭으로 `gov_id ↔ outcome_id` 연결
- `outcome_market` row 생성 — Phase E

UI (거버넌스 + outcome market 통합):
- 큰 제목 + variant badge (Outcome mint)
- 본문 설명 (collapsible)
- side 카드 — Phase B/C 는 sideName 만, Phase F+ 는 deployed 후 trading 가격 + % chance
- QuorumBar (stake + count)
- 가상투표 패널 (Phase G)
- voted/not-voted (이름)
- 만료
- (Phase H) 등록된 outcome 의 Order Book + 24h candle + side 별 % chance — `outcome-market.md` §5

### 5.2 Delisting

데이터 source:
- `action.D` = 단순 ticker 또는 market id 문자열.

UI:
- ticker 큰 헤더.
- 현재 시장 정보 (Phase H 또는 Phase C 시점에서 — `meta` / `metaAndAssetCtxs` 에서 cross-ref). 가격, 24h volume, OI.
- QuorumBar.
- 가상투표 패널.
- voted/not-voted.
- 만료.

### 5.3 Unknown (forward-compat)

UI:
- inner key + raw JSON dump.
- 빨강 경고: "새 거버넌스 type — renderer 미구현. raw 검토 후 가상투표만 가능".
- QuorumBar (기본 흐름 작동).
- 가상투표 패널 — 단, side 가 정해지지 않아 "approve / reject" 같은 generic 옵션.

## 6. 새 variant 추가 절차

1. `apps/frontend/lib/governance/classify.ts` 의 `KNOWN` 에 `<key>: '<variant>'` 추가.
2. `apps/frontend/lib/governance/renderers/<variant>.tsx` 새로 작성, `Card` + `Detail` (+ 옵션 `myDelegationRow`) export.
3. `renderers/index.ts` 에 import + entry.
4. **PR 시 본 contracts/governance.md 의 §5 에 새 variant 절 추가**.
5. constitution-gate 가 grep 으로 hardcoded variant lookup 없는지 검증.

## 7. 변경 정책

이 contract 의 라인 변경 시:
1. HF docs 또는 publisher Slack 의 공식 변경 근거 (URL/date).
2. 기존 variant 의 hash 가 바뀌지 않게 (govId 안정성 — Phase E 이후 운영 데이터 영향).
3. plan.md 의 Complexity Tracking 표에 사유 + builnad 명시 승인.

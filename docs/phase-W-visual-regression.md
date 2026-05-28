# Phase W Visual Regression Record

> 2026-05-29 · Phase W (DESIGN.md token migration + Simple/Pro mode + 5 컴포넌트
> 재설계) 의 visual record. Chrome MCP 로 localhost:3000 testnet build 확인.
> 시각 변화 ground truth — 향후 phase 에서 rollback / 비교 시 reference.

---

## 1. 환경

- Viewport: 1440 × 757 (데스크탑)
- Network: testnet (`NEXT_PUBLIC_HL_NETWORK=testnet`)
- Browser: Chrome (Claude in Chrome MCP)
- Dev server: `npm run dev` after `make design-export` + restart

---

## 2. 페이지별 결과

### 2.1 `/` Markets tab (Simple mode)

✅ Hero "Outcome markets on Hyperliquid." surface-elevated 박스 (radial mint
gradient).
✅ ENDING SOON 박스 (status-warn 노란 톤) + Recurring 카드.
✅ Pending / Markets / Historical / AI Basket 탭 — active 시 mint primary
ring + bg/15 highlight.
✅ Outcome cards — surface-elevated 박스, big-number-md leading %, options
bar (primary/80), 우측 "View →" solid mint CTA.
✅ Grid: lg:grid-cols-2 정상 작동.

### 2.2 `/` Markets tab (Pro mode)

✅ 같은 페이지 viewport 에 약 6 question + 4 standalone row 표시 (Simple 의 2
배 dense).
✅ 1-line table row — `name · leader · X OPTS · MM% · expires YYd YYh`.
✅ mono-md tabular-nums 로 % column align.
✅ hairline divider (border-b border-divider) 로 row 구분.

### 2.3 `/q?id=825` Question detail

✅ Big title "BTC price bucket · expires 2026-05-29 06:00 UTC"
✅ OPTIONS section — 각 option 행이 mint border (selected) / divider (others) +
options bar + 우측 big % (50.0%) — 충분히 dense + 명료.
✅ "No price history" placeholder + Order book / Selected option 2-column grid.

### 2.4 `/portfolio` (wallet 미연결)

✅ "Connect a wallet to see your portfolio." surface-elevated 박스. 단순 fallback.

### 2.5 `/autobet`

✅ "Auto-bet" 헤더 + 설명 prose
✅ "Auto-bet is OFF" + "ENABLE" mint ring 버튼
✅ CAPS 박스 — Daily budget / Per-bet max / Min edge / Min confidence grid.
✅ CATEGORIES — Allow / Block input.

### 2.6 BasketSheet modal (basket chip click)

✅ Header: caption "BASKET BET" + h2 "1 leg"
✅ **Step indicator**: [1 EDIT 활성 mint] → [2 REVIEW divider] → [3 SIGN divider]
✅ Leg row: Algeria · Algeria · Yes / Current ask 10.0% / USD input / 100 shares · wins $100
✅ Footer: caption "TOTAL INTENT" + big-number-md `$10.00`
✅ Bottom CTA: Clear (secondary) / "Connect wallet" full-width solid mint
✅ Helper: "One agent signature · IOC at best ask + 2% slip · builder fee on sell only"

### 2.7 BasketChip floating

✅ 우하단 fixed solid mint pill `BASKET [1]` with text-on-primary.

### 2.8 SiteHeader

✅ Brand "hl-markets" mint + caption "HYPERLIQUID · PREDICTION MARKETS"
✅ Settings ⚙ icon
✅ **SIMPLE / PRO segmented control** (sm+ 만)
✅ TESTNET status badge (status-warn 노란)
✅ CONNECT button (primary ring)

---

## 3. 발견된 issue + fix history

| Issue | Cause | Fix |
|---|---|---|
| 카드 박스 / 색 모두 사라짐 | TS `import` JSON 이 Tailwind config loader 비호환 → 새 토큰 generation 안 됨 | tailwind.config.ts → `readFileSync + JSON.parse` (D-016) |
| 콘텐츠 옹기종기 모임 | `max-w-3xl` (768px) wide 데스크탑 비친화 | `max-w-7xl` (1280px) 일괄 (D-017) |
| OutcomeCard 듀얼 Buy 버튼이 시각만 Buy, 실제 detail link | 사용자 혼란 | 단일 "View →" CTA (D-018) |

---

## 4. lint 결과

```
errors:   0
warnings: 12  (의식적 허용, DESIGN.md Do's and Don'ts 명시)
infos:    1
verify-design gate: PASS
```

Warning 12건 = alpha-bg same-hue chip false negative 6 + disabled/inactive
의도된 약함 2 + orphaned tokens (v2 컴포넌트용) 4. D-014 의 의식적 허용.

---

## 5. 미확인 항목 (wallet 필요)

- `/portfolio` PortfolioHero Simple / Pro variant 실제 데이터
- TradeWidget / SimpleTradeWidget multi-step
- Chat panel
- AIAnalyzePanel (LLM key 필요)
- AIDiscovery result list (LLM call)

→ builnad 가 wallet 연결 + LLM key 입력 후 자체 검증.

---

## 6. 모바일 viewport (375 / 768)

미확인 — Chrome MCP 로 resize 가능. 다음 turn 에서 W-21 Korean sample +
mobile viewport regression 같이 진행.

---

## 7. 변경 history

| 날짜 | 변경 |
|---|---|
| 2026-05-29 | Phase W 의 visual regression record 초기 작성 |

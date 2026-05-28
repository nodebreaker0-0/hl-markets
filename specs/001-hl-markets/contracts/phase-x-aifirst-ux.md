# Phase X — AI-First UX 재설계 (정체성 + IA + flow spec)

> **Phase**: X (after Phase W) · **Created**: 2026-05-29 · **Status**: spec
> **Companion**: `/DESIGN.md` (visual layer) — Phase X 는 flow / IA / page
> hierarchy 만. 두 spec 결합으로 새 UX 정체성 완성.

---

## 1. 정체성

**한 줄**: "Polymarket 의 outcome × Robinhood 의 hero × 토스의 step flow ×
Notion AI 의 inline AI invocation".

**핵심 결정**:
- **AI-First** — 첫 진입 = "What do you want to bet on?" + AI auto-explore.
  browse 는 secondary.
- **모바일 first + bottom nav** — Home · Discover · Basket · Portfolio ·
  Settings (5 icon). 데스크탑은 좌측 sidebar.
- **Trade = 3 step page transition** — Step 1 amount → Step 2 confirm →
  Step 3 result. 토스 패턴.
- **Outcome detail = bottom sheet / modal** — page transition X. home 의 시각
  context 유지.
- **AI inline 도입** — `✨` icon = outcome 옆 analyze invocation. autobet
  daily summary card 가 home/portfolio inline.

---

## 2. Information Architecture

### 2.1 5-tab nav (mobile bottom / desktop sidebar)

| Slot | Mobile icon | Desktop label | Path | 역할 |
|---|---|---|---|---|
| 1 | 🏠 | Home | `/` | "What do you want to bet on?" + auto-explore top 5 + browse link |
| 2 | ✨ | Discover | `/discover` | Full AI query + result table + per-row add. **W-19 의 Pro variant 가 default 가까움**. |
| 3 | 🛒 | Basket *(leg count badge)* | `/basket` | Multi-leg cart + step ship flow. 영구 visible. |
| 4 | 📊 | Portfolio | `/portfolio` | Hero (big-number) + Holdings + Open + Fills. wallet 필요. |
| 5 | ⚙ | Settings | `/settings` | Wallet · Agent · AI keys · Autobet rules. wallet optional. |

**Browse markets** (현재 `/` Markets/Pending/Historical 탭) = `/markets` 별도
page. Home 의 "Browse all 187 markets →" link.

### 2.2 URL hierarchy

```
/                               Home (AI-first hero)
/discover                       Full AI query page
/basket                         Multi-leg cart + ship
/portfolio                      Portfolio (wallet 필요)
/settings                       Settings consolidated
/markets                        Browse all (current 4-tab grid 흡수)
/markets/pending                ─ Filter view
/markets/historical             ─ Filter view

# Detail = sheet/modal, URL 은 shared via hash 또는 query
/?sheet=outcome&id=10287        bottom sheet outcome detail (overlay on Home)
/markets?sheet=outcome&id=...   같은 sheet, markets context

/trade?id=10287&step=1          full-screen TradeFlow Step 1 (amount)
/trade?id=10287&step=2          Step 2 confirm
/trade?id=10287&step=3&fillId=..Step 3 result
```

**원칙**: outcome detail 은 URL query 의 `sheet=outcome&id=N` 로 deep-link 가능
(공유). TradeFlow 는 별도 page (route) 로 step transition.

### 2.3 Layout 컴포넌트 hierarchy

```
<RootLayout>
├── <SiteShellMobile>    (sm: hidden)
│   ├── <PageMain>
│   └── <BottomNav 5-icon>
├── <SiteShellDesktop>   (sm: 보임 — sm:flex)
│   ├── <Sidebar 280px>
│   │   ├── brand
│   │   ├── 5 nav links
│   │   ├── Simple/Pro toggle
│   │   ├── network badge
│   │   └── ConnectButton
│   ├── <PageMain max-w-4xl>
│   └── <AIRightPanel 320px collapsible> (Home, Discover 만)
└── <OutcomeDetailSheet> portal (어디서든 open 가능)
```

**모바일** = vertical stack: header + main + bottom nav.
**데스크탑** = horizontal: sidebar + main + (optional) right panel.

---

## 3. User Stories

### US-X-1 — 첫 진입 = AI 가 인사 (P1)

**시나리오**: 사용자가 처음 `/` 진입. wallet 미연결, AI key 미입력. Hero
"What do you want to bet on today?" + search/AI input + auto-explore 의 top
5 outcome (mock 또는 1시간 cache).

**Acceptance**:
1. 첫 진입 — 0초만에 "GOOD MORNING / What do you want to bet on?" 가 viewport
   상단 60% 차지.
2. AI key 없어도 auto-explore default 5개 (top-N by edge from market mid
   sanity heuristic — AI 호출 없이).
3. 카드 click → bottom sheet open (모바일) / modal (데스크탑).
4. 각 카드의 `[+Basket $X]` button click → basket add.

### US-X-2 — 모바일 사용자가 한 손으로 nav (P1)

**시나리오**: 모바일 viewport 375px. bottom nav 5 icon 항상 visible, thumb
영역 (하단 80px) 안에서 tap-able.

**Acceptance**:
1. 모든 page 에서 bottom nav visible (Settings 포함).
2. nav icon tap area 44 × 44px 이상.
3. Basket 의 leg count badge 가 mint solid + count.
4. active route 의 icon 이 mint highlight.

### US-X-3 — outcome click = bottom sheet, page transition X (P1)

**시나리오**: 모바일 — 카드 click → sheet 가 화면 80% 차지하며 slide up.
사용자 시각이 home 의 context 잃지 않음. close → home 그대로.

**Acceptance**:
1. sheet open animation < 200ms (`prefers-reduced-motion` respect).
2. sheet 안에 outcome name + % chance big-number + AI analyze button + Buy
   YES/NO CTA + orderbook (top 3).
3. sheet 뒤의 home 콘텐츠 dim (bg-black/60).
4. swipe down / X tap / 뒤 → close.

### US-X-4 — Buy = step page transition (P1)

**시나리오**: outcome sheet 에서 "Buy YES $X" click → 전체 화면이 Step 1
(amount input) 으로 전환. URL = `/trade?id=N&step=1`. 사용자가 amount 입력
+ Continue → Step 2 confirm. Sign → Step 3 result. 각 step 별도 page (URL
변화). 토스 패턴 정확히.

**Acceptance**:
1. Step 1 amount input = big-number-md 폰트, $ prefix, quick chips.
2. Step 1 → Step 2 transition slide (200ms).
3. Step 2 confirm = full bet summary + builder fee + sign button.
4. Step 3 result = ✓ icon + filled amount + "Bet again" / "View position".
5. URL 이 step 따라 update. browser back = 이전 step.

### US-X-5 — AI inline invocation (✨ icon) (P2)

**시나리오**: 어떤 outcome card 든 옆에 `✨` icon. 클릭 → AI Analyst sheet
열림 (deep agent 분석). 명시적 AI page 안 가도 inline.

**Acceptance**:
1. 모든 outcome card / row 우상단 `✨` (또는 우측 작은 아이콘).
2. click → AIAnalystSheet open (이미 Phase P 의 AIAnalyzePanel).
3. LLM key 미입력 시 — sheet 안에서 "Add OpenAI/Anthropic key →" CTA inline.

### US-X-6 — Onboarding 3 단계 (P1)

**시나리오**: 신규 visitor → 3 단계 progressive disclosure:
1. **첫 방문**: Hero 아래 "Connect wallet to trade · or browse only" 옵션.
2. **첫 trade 시도**: EnableTrading modal (agent flow, 이미 W-K).
3. **첫 AI 분석 시도**: "Paste OpenAI/Anthropic key" inline prompt.

**Acceptance**:
1. 첫 방문 — wallet 없어도 "GOOD MORNING / AI auto-explore" 즉시 보임.
2. wallet 없이 trade button click → EnableTrading 강제 noticing modal.
3. AI key 없이 ✨ click → key 입력 inline (sheet 안에서).

### US-X-7 — Basket bottom nav 영구 (P2)

**시나리오**: Basket 가 nav 1 slot — leg 0 일 때도 visible. Basket page 진입
시 빈 상태 = "Add legs from any market" CTA.

**Acceptance**:
1. 모든 page 에서 Basket icon visible.
2. 1+ leg 면 mint solid badge (count).
3. Basket page = leg list + step ship flow (현재 BasketSheet 의 풀 사용).

### US-X-8 — Portfolio Robinhood default (이미 W-9 통과, X 에서 default 위치)

→ FR 변경 없음. URL 만 `/portfolio` 로 nav 의 4번째.

### US-X-9 — 데스크탑 right AI panel (P3, optional)

**시나리오**: 데스크탑 viewport (lg+) 에서 Home / Discover 의 오른쪽 320px
가 AI panel — auto-explore 결과 압축 view + 새 query input. main content 와
parallel.

**Acceptance**:
1. lg breakpoint (1024px+) 에서 right panel 보임.
2. md (768~1023px) 에서 hide.
3. collapsible (사용자 toggle).

### US-X-10 — Browse markets secondary (P2)

**시나리오**: 현재 `/` 의 4-tab 구조가 `/markets` 별도 page 로. Home 에서
"Browse all 187 markets →" link.

**Acceptance**:
1. `/markets` = 현재 Markets 탭의 카드 grid (OutcomeCard).
2. `/markets/pending` = 현재 Pending 탭 (GovernanceCard).
3. `/markets/historical` = 현재 Historical 탭.
4. `/markets` 의 sub-nav 또는 tab 으로 3 view 전환.

---

## 4. Functional Requirements

### Layout & Navigation

- **FR-X-001**: `components/SiteShell.tsx` — root layout component. Mobile =
  vertical stack (header + main + BottomNav). Desktop = horizontal (Sidebar +
  main + optional RightPanel).
- **FR-X-002**: `components/BottomNav.tsx` — 5 icon (Home / Discover /
  Basket / Portfolio / Settings). 모바일 sm: hidden. active route mint
  highlight. Basket count badge.
- **FR-X-003**: `components/Sidebar.tsx` — 280px fixed left, sm: hidden (모바일
  은 BottomNav 사용). Brand + 5 nav + Simple/Pro toggle + network badge +
  ConnectButton.
- **FR-X-004**: `components/RightPanel.tsx` — 320px collapsible right, lg+.
  Home / Discover 페이지 only.

### Home

- **FR-X-010**: `app/page.tsx` (rewrite) — Hero "GOOD MORNING / What do you
  want to bet on today?" + search/AI input + AI auto-explore top 5 + quick
  filter chips + "Browse all →" link.
- **FR-X-011**: Auto-explore — AI key 있으면 deep agent top 5, 없으면 단순
  heuristic (sum check / random recent).
- **FR-X-012**: Hero 시간 인사 — "Good morning/afternoon/evening" by local
  time.

### Discover

- **FR-X-020**: `app/discover/page.tsx` — full AI query input + result list
  + per-row "+ Add". Pro mode = table, Simple = card.
- **FR-X-021**: Recent searches localStorage (cap 5).
- **FR-X-022**: Default = auto-explore result (Home 의 expanded).

### Basket

- **FR-X-030**: `app/basket/page.tsx` (BasketSheet 의 풀 페이지 버전) —
  empty state ("Add legs from any market with [+Basket] button") + leg list
  + total intent hero + step ship flow.
- **FR-X-031**: 4-step indicator: [1 Edit] → [2 Review] → [3 Sign] → [4 Result].

### Outcome detail sheet

- **FR-X-040**: `components/OutcomeDetailSheet.tsx` — bottom sheet (모바일)
  / center modal (데스크탑). URL query `?sheet=outcome&id=N`.
- **FR-X-041**: Content: outcome name + % chance big-number + Buy YES/NO CTA
  + orderbook top 3 + `✨ Analyze with AI` inline button + chart placeholder.
- **FR-X-042**: Buy CTA click → navigate `/trade?id=N&step=1&side=yes`.

### TradeFlow (3-step page transition)

- **FR-X-050**: `app/trade/page.tsx` — `searchParams: { id, step, side, fillId? }`.
- **FR-X-051**: Step 1 = `components/TradeStepAmount.tsx` — big-number input
  + quick chips + Continue button → `/trade?id=...&step=2&amount=$X`.
- **FR-X-052**: Step 2 = `components/TradeStepConfirm.tsx` — bet summary +
  builder fee + Sign button → call lib/trade `placeMarketBuy` → `/trade?...
  &step=3&fillId=N`.
- **FR-X-053**: Step 3 = `components/TradeStepResult.tsx` — ✓ + filled
  amount + "Bet again" / "View position".
- **FR-X-054**: Step state machine — URL step 가 source of truth. browser
  back / forward 호환.

### AI inline

- **FR-X-060**: `✨` icon = `components/AIAnalyzeTrigger.tsx`. 어떤 outcome
  card 든 inject 가능. click → AIAnalystSheet open.
- **FR-X-061**: AIAnalystSheet = 기존 AIAnalyzePanel 의 sheet wrapper.
- **FR-X-062**: LLM key 없으면 sheet 안에 "Add OpenAI/Anthropic key" inline
  prompt (Settings 로 redirect X — inline 처리).

### Onboarding

- **FR-X-070**: 첫 방문 (localStorage `hl-markets:visited` 없음) — Hero
  아래에 "Connect wallet to trade · or browse only" 옵션 카드.
- **FR-X-071**: 첫 trade 시도 (agent 없음) — EnableTradingModal 자동 (이미
  Phase K).
- **FR-X-072**: 첫 AI 분석 시도 (LLM key 없음) — sheet 안에 inline key 입력.

### Browse markets

- **FR-X-080**: `app/markets/page.tsx` — 현재 `/` 의 Markets 탭 흡수.
  OutcomeCard grid (Simple) / table-row (Pro).
- **FR-X-081**: `/markets/pending` = Pending tab.
- **FR-X-082**: `/markets/historical` = Historical tab.
- **FR-X-083**: `/markets` sub-nav = Markets / Pending / Historical 3 link.

---

## 5. Success Criteria

- **SC-X-1**: 첫 진입 사용자 (wallet X, AI key X) 가 viewport 첫 화면에 AI
  추천 5 outcome 카드 본다. 5초 이내.
- **SC-X-2**: 모바일 375px viewport — bottom nav 5 icon thumb 영역 내,
  각 44×44px tap area.
- **SC-X-3**: Outcome card click → bottom sheet open animation < 200ms (`reduced-motion` 시 0ms).
- **SC-X-4**: TradeFlow Step 1 → 2 → 3 transition < 300ms each. browser back
  → 이전 step 정상.
- **SC-X-5**: 신규 visitor 가 첫 trade 까지 3분 이내 (Connect → AI key 또는
  skip → outcome 선택 → Step 1/2/3).
- **SC-X-6**: 데스크탑 sidebar — 모든 page 에서 visible, Settings 포함.
- **SC-X-7**: AI ✨ inline icon 의 카드 cover rate 100% (모든 OutcomeCard /
  RecommendationCard / 카드 row).

---

## 6. Out of Scope (Phase X)

- 새 데이터 fetch / 새 backend endpoint (Phase X 는 UI/UX 만).
- 새 비즈니스 로직 (signing / placing / cancellation 모두 기존 사용).
- 다국어 microcopy localization (Phase Y 후속).
- A/B test infrastructure (analytics 0 — Constitution VIII).
- Mobile native app (PWA / Tauri / Capacitor 미고려).
- Light mode (현재 dark only — DESIGN.md D-002).

---

## 7. Phase 의 task graph 큰 그림

```
T-X-001 SiteShell + BottomNav + Sidebar foundation (1-2일)
   ↓
T-X-010 Home rewrite (AI hero + auto-explore + quick filters)
T-X-020 Discover page (Home 의 expanded)
T-X-030 Basket page (BasketSheet 풀 페이지화)
T-X-040 OutcomeDetailSheet (모달/sheet + URL sync)
T-X-050 TradeFlow 3-step (Step 1/2/3 page transition)
T-X-060 AI inline ✨ icon + AIAnalystSheet wrapper
T-X-070 Onboarding 3 단계 (welcome / enable trading / AI key)
T-X-080 Browse markets secondary (/markets sub-nav)
T-X-090 RightPanel desktop (Home/Discover lg+)
   ↓
T-X-099 Visual regression + migration cleanup (기존 / 페이지 deprecate)
```

세부 T-X-### 는 `specs/001-hl-markets/tasks.md` 의 Phase X 섹션 (다음 turn).

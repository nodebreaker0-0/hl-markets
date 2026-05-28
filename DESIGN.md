---
name: hl-markets Design v1
description: Polymarket outcome 카드 × 토스 친화 flow × Robinhood big-number — dark + mint, Simple/Pro 토글, 모바일 first.
version: alpha
colors:
  # Brand accent
  primary: "#7DFFD0"
  primary-bright: "#9FFFE0"
  primary-dim: "#5FE0B0"
  on-primary: "#0A0E14"
  # Surfaces (3-tier elevation by color)
  surface: "#0A0E14"
  surface-elevated: "#11151C"
  surface-overlay: "#1A2029"
  surface-input: "#070A0F"
  # Text hierarchy on dark surface
  on-surface: "#E5E9F0"
  on-surface-muted: "#9AA4B2"
  on-surface-subtle: "#5C6470"
  on-surface-disabled: "#3A4250"
  # Lines
  divider: "#1F2933"
  divider-strong: "#2A3340"
  # PnL / direction (글로벌 컨벤션 — up green, down red. 한국 토스의 ↑red 와 다름)
  accent-up: "#7DFFD0"
  accent-down: "#FF6B7A"
  accent-up-bg: "rgba(125, 255, 208, 0.12)"
  accent-down-bg: "rgba(255, 107, 122, 0.12)"
  # Status (운영 / system)
  status-ok: "#7DFFD0"
  status-warn: "#FFC857"
  status-warn-bg: "rgba(255, 200, 87, 0.12)"
  status-fail: "#FF6B7A"
  status-info: "#5BA3FF"
  status-info-bg: "rgba(91, 163, 255, 0.12)"
  # Focus ring (a11y)
  focus: "#9FFFE0"
typography:
  # Hero — 토스/Robinhood "숫자가 주인공" 패턴. 화면의 60% 차지.
  big-number:
    fontFamily: Inter
    fontSize: 3rem
    fontWeight: 700
    lineHeight: 1.0
    letterSpacing: -0.03em
    fontFeature: '"tnum"'
  big-number-md:
    fontFamily: Inter
    fontSize: 2.25rem
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: -0.02em
    fontFeature: '"tnum"'
  display:
    fontFamily: Inter
    fontSize: 2rem
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.02em
  h1:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1.25
  h2:
    fontFamily: Inter
    fontSize: 1.125rem
    fontWeight: 600
    lineHeight: 1.35
  # Body
  body-lg:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.55
  body-md:
    fontFamily: Inter
    fontSize: 0.9375rem
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Inter
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.45
  caption:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0.01em
  # Monospace — 숫자 / 가격 / 코인 양 / Pro 모드 column
  mono-md:
    fontFamily: JetBrains Mono
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.4
    fontFeature: '"tnum"'
  mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    fontWeight: 500
    lineHeight: 1.35
    fontFeature: '"tnum"'
  mono-big:
    fontFamily: JetBrains Mono
    fontSize: 1.25rem
    fontWeight: 600
    lineHeight: 1.2
    fontFeature: '"tnum"'
  # UI label
  label-caps:
    fontFamily: Inter
    fontSize: 0.6875rem
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0.08em
  button:
    fontFamily: Inter
    fontSize: 0.9375rem
    fontWeight: 600
    lineHeight: 1.2
rounded:
  none: "0px"
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  px: "1px"
  none: "0px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  base: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
components:
  # ----- Buttons -----
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 14px
  button-primary-hover:
    backgroundColor: "{colors.primary-bright}"
    textColor: "{colors.on-primary}"
  button-primary-active:
    backgroundColor: "{colors.primary-dim}"
    textColor: "{colors.on-primary}"
  button-primary-disabled:
    backgroundColor: "{colors.divider}"
    textColor: "{colors.on-surface-disabled}"
  button-secondary:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.on-surface}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 14px
  button-secondary-hover:
    backgroundColor: "{colors.surface-overlay}"
    textColor: "{colors.on-surface}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.on-surface}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 12px
  button-ghost-hover:
    backgroundColor: "{colors.surface-elevated}"
  # PnL 방향 버튼 (Polymarket buy YES / buy NO 패턴)
  button-up:
    backgroundColor: "{colors.accent-up-bg}"
    textColor: "{colors.accent-up}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 14px
  button-up-hover:
    backgroundColor: "rgba(125, 255, 208, 0.20)"
  button-down:
    backgroundColor: "{colors.accent-down-bg}"
    textColor: "{colors.accent-down}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 14px
  button-down-hover:
    backgroundColor: "rgba(255, 107, 122, 0.20)"
  # ----- Cards -----
  card:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 16px
  card-interactive:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 16px
  card-interactive-hover:
    backgroundColor: "{colors.surface-overlay}"
  # Outcome card (Polymarket 패턴 — left info + right big CTA)
  outcome-card:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 16px
  # Hero summary (Robinhood 패턴 — portfolio glance)
  hero-summary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.big-number}"
    rounded: "{rounded.none}"
    padding: 24px
  # ----- Inputs -----
  input:
    backgroundColor: "{colors.surface-input}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 14px
  input-focus:
    backgroundColor: "{colors.surface-input}"
    textColor: "{colors.on-surface}"
  # Big amount input (토스 패턴 — 큰 숫자 입력 + currency suffix)
  input-amount:
    backgroundColor: "transparent"
    textColor: "{colors.on-surface}"
    typography: "{typography.big-number-md}"
    rounded: "{rounded.none}"
    padding: 8px
  # ----- Badges / chips -----
  badge-up:
    backgroundColor: "{colors.accent-up-bg}"
    textColor: "{colors.accent-up}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.full}"
    padding: 4px
  badge-down:
    backgroundColor: "{colors.accent-down-bg}"
    textColor: "{colors.accent-down}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.full}"
    padding: 4px
  badge-info:
    backgroundColor: "{colors.status-info-bg}"
    textColor: "{colors.status-info}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.full}"
    padding: 4px
  badge-warn:
    backgroundColor: "{colors.status-warn-bg}"
    textColor: "{colors.status-warn}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.full}"
    padding: 4px
  # ----- Tables (Pro mode) -----
  table-header:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.none}"
    padding: 8px
  table-row:
    backgroundColor: "transparent"
    textColor: "{colors.on-surface}"
    typography: "{typography.mono-md}"
    rounded: "{rounded.none}"
    padding: 8px
  table-row-hover:
    backgroundColor: "{colors.surface-elevated}"
  # ----- Modal / overlay -----
  modal:
    backgroundColor: "{colors.surface-overlay}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.xl}"
    padding: 24px
  # ----- Step indicator (토스 multi-step flow 패턴) -----
  step-dot-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.full}"
    padding: 4px
  step-dot-inactive:
    backgroundColor: "{colors.divider}"
    textColor: "{colors.on-surface-subtle}"
    rounded: "{rounded.full}"
    padding: 4px
---

## Overview

**hl-markets v1** 은 HIP-4 outcome 시장의 public explorer + trading client.
디자인은 세 DNA 의 융합이다:

- **Polymarket** — outcome 카드 그리드, % chance 막대, right-aligned 큰 buy
  버튼. dark + mint accent.
- **토스(Toss)** — "숫자가 주인공" 큰 타이포 hero, 한 화면 한 액션, multi-step
  카드 flow (Step 1: 금액 → Step 2: 확인 → Step 3: 결과), 큰 sticky CTA.
- **Robinhood** — 흑백 미니멀 + 단일 portfolio summary hero (수익률 그래프 +
  점수 하나), fractional onboarding 친화도.

**Motif**: 다크 surface (3-tier elevation by color, shadow 0), single mint
accent, 큰 숫자가 화면 무게중심, dense table 은 Pro 모드 한정.

**Density 이중성**: 일반 대중 (Simple) ↔ 트레이더 (Pro). 같은 토큰 세트로
component variant 전환. SimpleTradeWidget / TradeWidget 토글 (J.6 패턴) 을
전 페이지로 확장.

---

## Colors

### Brand & accent
- **primary (`#7DFFD0`)** — HL mint. **유일한 saturated 컬러**. CTA, positive
  PnL, 진행 상태. 사용자 시각이 mint 만 따라가도록.
- **primary-bright / primary-dim** — hover / active variant. saturation 동일,
  lightness 만 ±10%.
- **on-primary (`#0A0E14`)** — mint 위 텍스트. AAA contrast (15.42:1).

### Surfaces (shadow 없이 color 만으로 elevation)
- **surface (`#0A0E14`)** — page base. 가장 어두움.
- **surface-elevated (`#11151C`)** — card / panel. z-axis +1.
- **surface-overlay (`#1A2029`)** — modal / dropdown. z-axis +2.
- **surface-input (`#070A0F`)** — input 영역. 카드보다 더 어두워서 입력 가능
  영역 명료.

### Text hierarchy on dark
- **on-surface (`#E5E9F0`)** — primary text. 14.2:1.
- **on-surface-muted (`#9AA4B2`)** — caption, secondary. 6.1:1.
- **on-surface-subtle (`#5C6470`)** — tertiary, helper. 3.2:1 (large text only).
- **on-surface-disabled (`#3A4250`)** — disabled state.

### PnL & direction (글로벌 컨벤션)
- **accent-up (`#7DFFD0`) / accent-down (`#FF6B7A`)** — green=up, red=down.
  HL trader 대부분 글로벌이라 미국 컨벤션. **한국 토스의 ↑red 와 다름** — 의식적
  결정. log: D-003.
- **accent-up-bg / accent-down-bg** — 12% alpha 배경. badge / button-up/down 용.

### Status (운영 — autobet, validator)
- **status-ok / warn / fail / info** + 각각 `-bg` (12% alpha).

### Focus
- **focus (`#9FFFE0`)** — focus ring. primary-bright 와 동일 — accessibility
  default ON.

---

## Typography

### Big-number 패턴 — 토스/Robinhood DNA의 핵심
`big-number` (3rem, weight 700, tnum) 가 화면의 hero. portfolio total / PnL
점수 / outcome % chance 같은 "사용자가 한 눈에 봐야 할 핵심 1개" 표현용.

`big-number-md` (2.25rem) 는 다음 hierarchy — 카드 안의 strong 숫자.

`mono-big` (1.25rem, JetBrains Mono, tnum) — 큰 숫자가 monospace 일 때 (개별
outcome 가격 / Pro 모드 table 의 highlighted cell).

### 본문
- **Inter** (variable, KR/JP/ZH Noto Sans fallback) — 모든 본문 + 헤더.
  0/O/1/l 명료 + 다국어 weight 일치.
- body-lg/md/sm 3-tier. lineHeight 1.45-1.55. 한국어 가독성 friendly.

### Monospace
- **JetBrains Mono** — 숫자 column / 가격 / coin amount / hex address / order id.
  Pro 모드 table row 의 default.
- `tnum` OpenType feature 강제 — 0/1/9 가 같은 폭으로 column align.

### Caps label
- `label-caps` — 큰 카드 안의 미니 카테고리 / "BUY YES" 같은 강조 short label.

### 다국어 fallback (CSS export 시)
```
font-family: "Inter", "Noto Sans KR", "Noto Sans JP", "Noto Sans SC", system-ui, sans-serif;
```

---

## Layout

### Breakpoints
- `base` (mobile, 0-640px) — 1열 grid, sticky bottom CTA.
- `md` (tablet, 641-1024px) — 2열 grid.
- `lg` (desktop, 1025-1440px) — 3-4열 grid.
- `xl` (1441px+) — 4열 + 사이드 panel.

max-width 1440px. 그 이상은 양 옆 여백.

### Density
- **Simple mode** — spacing scale 더 generous (base/lg/xl 위주). 카드 padding
  16-24px. 한 화면 한 액션.
- **Pro mode** — spacing scale 더 compact (xs/sm/md 위주). table row padding
  8px. 한 화면 많은 정보.

같은 token 두 모드 모두 사용, **컴포넌트 단위로 어떤 token 쓸지** 결정.

### Grid system
- 12-col grid (max-width 1440px).
- gap-base 16px (mobile) / gap-lg 24px (desktop).
- gutter 16px (mobile) / 32px (desktop).

---

## Elevation & Depth

**Shadow 0**. elevation 은 surface color 단계 (`surface` → `surface-elevated`
→ `surface-overlay`) 만으로 표현.

이유: dark mode 에서 shadow 가 의도하지 않은 글로우 효과 + 모바일에서 무거워
보임. surface color 시리즈가 더 정확한 hierarchy.

modal 만 예외 — 배경에 `bg-black/60` overlay 추가 (focus 강조).

---

## Shapes

- **rounded `md` (8px)** — default. 카드 / 버튼 / 입력. 너무 sharp 하지도
  않고 너무 둥글지도 않은 sweet spot. 토스 + Polymarket 둘 다 비슷한 값.
- **rounded `sm` (4px)** — badge / chip / status pill.
- **rounded `lg` (12px)** — 큰 카드, hero summary.
- **rounded `xl` (16px)** — modal / sheet.
- **rounded `full`** — avatar / step dot / pill badge.

곡선 없음. 모든 carve 가 모서리 rounded 만으로.

---

## Components

### Buttons (4 variant + 2 directional)
- **button-primary** — mint 배경 + dark 텍스트. 메인 CTA. padding 14px (모바일
  thumb 44px 보장).
- **button-secondary** — surface-elevated 배경 + light 텍스트. sub-action.
- **button-ghost** — transparent + hover 시 surface-elevated. inline action.
- **button-up / button-down** — Polymarket "Buy YES / Buy NO" 패턴. accent-up/down
  컬러의 12% bg + 같은 컬러 텍스트. directional 매수 / sell.

### Outcome card (Polymarket DNA)
- 좌측: outcome name (h2) + question title (caption) + 현재 % chance (big-number-md)
  + % chance 막대 (mint, 0-100%).
- 우측: 큰 CTA — `button-up` (Buy YES) / `button-down` (Buy NO).
- 모바일: 1열 stack. 우측 CTA 가 카드 하단 full-width.
- 데스크탑: 좌 60% / 우 40% flex.

### Hero summary (Robinhood DNA)
- Portfolio 페이지 상단.
- 큰 숫자 (big-number) = portfolio total value.
- 그 아래 caption — daily PnL 1줄 ("+$23.45 (+1.2%) today", green/red).
- 그 아래 sparkline 1개 — 7d/30d/all toggle.
- 그 아래 4 KPI (cost basis / realized / unrealized / open orders).

### Multi-step flow (토스 DNA)
- TradeWidget / BasketSheet 의 buy/sell.
- 모바일 sheet, 데스크탑 modal.
- 3 step:
  - **Step 1**: amount input (input-amount, big-number-md 폰트, currency suffix).
    아래 Quick-amount chips ($10 / $50 / $100 / Max).
  - **Step 2**: confirm — outcome name + side + amount + receive amount + fee
    1줄 + sign 1 button.
  - **Step 3**: result — big check icon + amount filled + view position CTA.
- 하단 step-dot 3개 (현재 progress 표시).

### Tables (Pro mode)
- table-header — surface 배경 + muted text + label-caps.
- table-row — transparent + mono-md (숫자 columns) + divider hairline.
- hover → surface-elevated.

### Modal / Sheet
- 모바일: bottom sheet, slide-up 200ms, rounded-top xl.
- 데스크탑: center modal, max-width 480px.
- 배경: `bg-black/60` backdrop.

### Step indicator
- 3개 circular dot, active 는 primary, inactive 는 divider.
- 두 dot 사이 hairline line.

---

## Do's and Don'ts

### Do
- mint 만 saturated. 다른 saturated 컬러 X (status info/warn/fail 만 예외).
- 숫자는 `mono-*` 또는 `big-number*` (tnum feature 필수).
- 색맹 보조: 가격 변동 ↑/↓ icon 항상 컬러와 함께.
- 모바일 button min-height 44px (`padding 14px`).
- 첫 page load 시 hero big-number 가 가장 먼저 보이도록.
- multi-step 은 카드 1개씩, 한 화면 한 액션.
- 한국어 텍스트 가능성 있는 모든 영역 Noto Sans KR fallback 검증.

### Don't
- 새 hex literal 코드에 hardcode 0건 (D-I). 토큰 추가는 DESIGN.md 먼저.
- shadow 로 elevation 표현 X (D-II 대안 — surface color 시리즈).
- 한 화면에 saturated 컬러 3개+ X.
- text-xs (0.75rem 미만) 본문 X — caption / label 한정.
- 토스 컨벤션 ↑red ↓blue 사용 금지 (D-003 결정 — 글로벌 ↑green ↓red 유지).
- 카드 안에 또 카드 (nested elevation) — surface color 단계만 사용, 더
  파지 X.
- modal 안 modal — Step 1/2/3 같은 progression 으로 풀 것.
- 모바일에서 multi-column 동시 표시 X — 1열 stack, scroll.
- AI Discovery / AIAnalyzePanel / autobet 페이지에서 결과를 작은 폰트로
  숨김 X — big-number 와 reasoning prose 동등 weight.

### 의식적 허용 (lint warning 12건)

design.md lint v0.1.0 alpha 의 `contrast-ratio` rule 은 알파 합성을 안 함 +
일부 토큰은 의도된 약함 / 미래 사용. 다음은 **의식적 허용** (Constitution
D-II "의식적 위반은 prose 에 명시" 정합):

1. **`button-up` / `button-down` / `badge-up` / `badge-down` / `badge-info` /
   `badge-warn`** (6건) — 12% alpha bg 위 같은 hue 텍스트. 실제 시각적
   합성 후 contrast 8-10:1 (background `#0A0E14` + alpha 12% overlay = composed
   `#1B2D29`). lint 가 알파 채널 무시한 false negative.

2. **`button-primary-disabled`** (1건, 1.46:1) — disabled 의 의도된 약함. 사용자가
   "이 button 은 click 불가" 를 시각적으로 즉시 인지하려면 contrast 가 약해야 함.
   동시에 button text 가 보이지 않아야 하는 건 아니라서 1.46:1 sweet spot.

3. **`step-dot-inactive`** (1건, 2.47:1) — 다음 step 의 placeholder. 사용자
   시각이 active dot 에만 집중하도록 inactive 는 약하게.

4. **Orphaned tokens** (`divider-strong`, `status-ok`, `status-fail`, `focus`)
   (4건) — 미래 사용 예정:
   - `divider-strong` → Pro 모드 table column separator (v2).
   - `status-ok` / `status-fail` → status row / alert banner 컴포넌트 (v2).
   - `focus` → CSS `:focus-visible` outline (component 단위 표현 어려움 — global
     CSS rule).
   현재 component 에 binding 없으나 토큰화는 필요 (코드에서 직접 hex 0건 규칙).

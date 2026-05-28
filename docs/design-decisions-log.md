# hl-markets Design Decisions Log

> 매 디자인 결정 1-3줄. token 만 보면 미래에 reasoning 복원 어려움 — 여기서.
> Format: D-NNN (날짜) — 결정 + 후보 + 이유 + 영향 토큰.

---

## D-001 (2026-05-29) — Starter = modern-trading-friendly variant

**후보**: heritage (페이퍼) / minimal-admin (라이트) / modern-trading (다크 + dense) /
modern-trading-friendly (다크 + dense + 토스 친화 흡수).

**결정**: **modern-trading-friendly** (커스텀 variant).

**이유**: Stage 1 답 — "Polymarket DNA × 토스 친화 flow × Robinhood big-number".
순수 modern-trading (HL trade 류) 는 dense 만 강조해서 일반 대중 onboarding 약함.
heritage / minimal-admin 은 dark + 트레이딩 톤과 안 맞음. 그래서 modern-trading
base + 토스/Robinhood 의 "big-number hero + multi-step flow + friendly density"
흡수한 sub-variant.

**영향**: 전 토큰 시리즈 + Simple/Pro 토글 components.

---

## D-002 (2026-05-29) — Primary = HL mint `#7DFFD0` 유지

**후보**: HL mint / Polymarket teal / 토스 blue / Robinhood green.

**결정**: **HL mint `#7DFFD0`**.

**이유**: CHARTER 의 HL 브랜드 일관성. hl-vote-web / hl-markets 룩앤필 통일.
Polymarket teal 도 mint 와 매우 가까워 위화감 없음. 토스 blue 는 HL DNA 와 충돌.
Robinhood green 은 mint 와 hue 다름 — 새로 채택 시 hl-vote-web 와 분기 위험.

**영향**: `colors.primary` + `accent-up` (PnL up) + `status-ok` 셋 다 같은 mint.

---

## D-003 (2026-05-29) — PnL 컨벤션 = ↑green ↓red (글로벌)

**후보**: ↑green ↓red (US/global) vs ↑red ↓blue (KR 토스/네이버 증권).

**결정**: **↑green ↓red** — 글로벌 컨벤션.

**이유**: HL trader 절대다수 글로벌. 한국 컨벤션은 한국 trader 외에는 헷갈림.
토스 친화 톤을 흡수하되 컬러 컨벤션 자체는 글로벌. 색맹 보조 ↑/↓ icon 으로 추가
구분 (한국 사용자 mistap 방지).

**영향**: `accent-up` / `accent-down` 토큰. 모든 PnL 표시 컴포넌트.

---

## D-004 (2026-05-29) — Shadow 사용 0, surface color 시리즈로 elevation

**후보**: shadow 사용 (Material design) / surface color 시리즈 / blur backdrop.

**결정**: **surface color 시리즈** (`surface` → `surface-elevated` → `surface-overlay`).

**이유**: dark mode 에서 shadow 가 의도하지 않은 글로우 효과. 모바일에서 무거워
보임. surface color 시리즈가 더 정확한 hierarchy + GPU 부담 0 + 토스 톤 매트
효과와 일치.

**예외**: modal 만 `bg-black/60` backdrop overlay 추가 (focus 강조).

**영향**: 모든 card / panel / modal 컴포넌트.

---

## D-005 (2026-05-29) — Big-number typography 시리즈 (3rem hero + tnum)

**후보**: 기존 display 만 사용 / big-number 별도 추가.

**결정**: **big-number / big-number-md / mono-big 세 토큰 신설**.

**이유**: 토스/Robinhood "숫자가 주인공" DNA 의 핵심 표현. 일반 display (2rem)
보다 큰 3rem + tabular-num (tnum) feature 강제. portfolio total / outcome %
chance / PnL 점수 같은 hero 숫자 통일된 표현.

**영향**: `typography.big-number`, `typography.big-number-md`, `typography.mono-big`
신설. PortfolioPage / OutcomeCard / AIDiscovery row 의 hero 숫자에 적용.

---

## D-006 (2026-05-29) — Simple/Pro 모드 분리 (J.6 패턴 확장)

**후보**: 단일 mode / Simple/Pro 토글 / 자동 detection.

**결정**: **Simple/Pro 토글** — 사용자 명시 선택.

**이유**: 사용자 직답 ("Simple/Pro 토글, Polymarket 실제 패턴"). 기존 J.6 의
SimpleTradeWidget ↔ TradeWidget 토글 패턴 전 페이지로 확장. Simple = 친화
big-number + multi-step + 큰 button. Pro = dense table + monospace + 한 화면
많은 정보.

**영향**: components.* 의 spacing/typography 선택이 mode 에 따라 다름. 토큰
시리즈는 동일, 컴포넌트 mapping 만 변화. PortfolioPage / OutcomeCardGrid /
DiscoveryResults 각각 mode-aware.

---

## D-007 (2026-05-29) — 다국어 fallback = Inter + Noto Sans (KR/JP/SC)

**후보**: Inter only / + Pretendard / + Noto Sans / Apple SD Gothic system.

**결정**: **Inter + Noto Sans KR + Noto Sans JP + Noto Sans SC**.

**이유**: 사용자가 광범위 다국어 요청. Pretendard 한국어 친화 좋지만 일본/중국
fallback 별도 필요. Noto Sans 시리즈가 변수 폰트 + W3C 권장 + weight 일치 +
무료. system-ui fallback 까지.

**영향**: 모든 typography 토큰의 fontFamily 가 CSS export 시 fallback 체인 확장.

---

## D-008 (2026-05-29) — Rounded `md` (8px) 가 default

**후보**: 4px sharp / 8px sweet spot / 12px friendly / 16px 토스 강.

**결정**: **8px (rounded.md) 가 카드 / 버튼 / 입력 default**.

**이유**: 4px sharp 는 Bloomberg 류 너무 차가움 + 일반 대중 onboarding 마찰.
16px+ 는 토스 톤 너무 강해서 HL DNA 와 충돌. 8px 가 Polymarket (8-10px) +
Linear (6-8px) + 토스 변형 (12-16px) 의 중간. 모바일에서 한 손 친밀.

**영향**: 모든 component variant.

---

## D-009 (2026-05-29) — multi-step flow 가 default (Step 1/2/3 카드)

**후보**: 단일 모달 (모든 input 한 화면) / multi-step flow / wizard with skip.

**결정**: **multi-step flow** — Step 1 amount → Step 2 confirm → Step 3 result.

**이유**: 사용자 직답 ("한 화면 한 액션, multi-step 을 명확한 단계로 — 토스 DNA").
TradeWidget / BasketSheet / AutobetTicker 의 confirm flow 가 multi-step 카드.
모바일에서 한 손 조작 + 토스 친화 톤. Pro 모드 사용자는 step skip 옵션 (Phase 추후).

**영향**: 새 component `step-dot-*` + multi-step layout pattern. TradeWidget /
BasketSheet 가 multi-step 으로 재구성.

---

## D-010 (2026-05-29) — Hero summary 한 페이지 한 개 (Robinhood 패턴)

**후보**: hero 안 씀 (info 분산) / 페이지 마다 1개 hero / 페이지 마다 multiple
hero.

**결정**: **페이지 마다 1개 hero** (Portfolio / Outcome detail / Discovery
result top).

**이유**: Robinhood 패턴 + 사용자 직답 ("portfolio summary — 수익률 그래프 + 점수
하나"). 사용자 시각이 first viewport 에서 가장 중요한 숫자 1개를 만나도록.
multiple hero 는 시각 분산.

**영향**: PortfolioPage 가 hero-summary 컴포넌트 1개. OutcomeDetail 도 % chance
big-number 1개. AIDiscovery 도 top 1 candidate 가 hero.

---

## D-011 (2026-05-29) — Outcome card = left info + right CTA (Polymarket)

**후보**: full-width card (CTA 하단) / horizontal split (left info + right CTA) /
overlay CTA on card hover.

**결정**: **horizontal split — left 60% info + right 40% CTA**.

**이유**: 사용자 직답 ("Outcome 카드 + % chance 막대 + 우측 큰 버튼" — Polymarket
패턴). 데스크탑은 한 row 에 multi-card grid (2-3열). 모바일은 1열 stack + CTA
가 카드 하단 full-width (한 손 조작).

**영향**: `components.outcome-card` 의 layout + responsive behavior.

---

## D-012 (2026-05-29) — Saturated 컬러 1개 + status 3개 (info/warn/fail)

**후보**: 모든 컬러 자유 / saturated 1개 + status 3개 / saturated 2개 (mint + warm).

**결정**: **saturated 1개 (mint) + status 3개 (info/warn/fail)** + accent-down (red).

**이유**: design Constitution D-III. 사용자 시각 1색만 따라가도록. mint =
brand/CTA, info=파랑(링크), warn=노랑(경고), fail=빨강(에러). accent-down 은
PnL 부정용 (status-fail 와 다른 hue — red 미세 더 따뜻).

**영향**: 코드 grep 으로 다른 saturated hex literal 검출 + 토큰화 강제.

---

## D-013 (2026-05-29) — Big-number 와 reasoning prose 동등 weight

**후보**: prose 작게 (숫자만 강조) / prose 동등 (토스 패턴) / prose 가 더 큰.

**결정**: **동등 weight** — AI Discovery / AIAnalyzePanel 의 fair % big-number
바로 옆에 reasoning bullets (body-md) 가 동등하게 보임.

**이유**: AI advisory only (Constitution XIV). 사용자가 fair % 만 보고 결정하면
위험. reasoning 도 같이 first viewport 에서 인지.

**영향**: AIAnalyzePanel / AIDiscovery row layout.

---

## D-014 (2026-05-29) — Lint warning 12건 의식적 허용

**후보**: warning 0 으로 토큰 조정 / 의식적 허용 + prose 명시 / hybrid.

**결정**: **의식적 허용 + DESIGN.md Do's and Don'ts 의 "의식적 허용" 섹션 명시**.

**이유**: lint 의 contrast-ratio rule 이 알파 채널 무시 (W3C 의 contrast 계산은
algebraic alpha 합성 필요, lint v0.1.0 alpha 가 미구현). 따라서:
- alpha-bg same-hue chip 6건은 실제 시각적으로 8-10:1 통과. lint false negative.
- disabled / inactive 약함은 의도된 visual cue.
- orphaned tokens 는 v2 컴포넌트 (status row, focus :focus-visible) 위한 미래
  사용. 지금 binding 없지만 token 정의는 D-I (코드 hex hardcode 0) 위해 필수.

토큰 변경으로 warning 줄이려면 alpha 18-20% 로 올려야 하는데 그러면 chip 의
"strong 인 듯 약한" 시각적 의도 (background 노이즈 안 만드는) 가 깨짐.

**영향**: DESIGN.md 의 "## Do's and Don'ts" 끝에 "의식적 허용" subsection 추가.
재실행 시 warning 12건 그대로, errors=0. lint pass (D-X verify gate 통과).

**Follow-up (v2)**: design.md lint 의 알파 합성 미구현 issue → upstream PR
또는 자체 lint plugin 작성.

---

## D-015 (2026-05-29) — design.md export 의 components/lineHeight/fontFamily 미지원

**발견 (W-8 도중)**: `npx @google/design.md export --format json-tailwind` 결과
가 **fontSize / spacing / borderRadius / colors / fontFamily 만** Tailwind 로
풀어줌. design.md 의 `components.*` 와 typography 의 `lineHeight` / `fontFamily`
는 export 산출물에서 누락 (v0.1.0 alpha 의 한계).

**영향**:
- `h-button`, `text-button` (component 단위) 같은 utility 작동 X → `min-h-[44px]`
  + spacing token 으로 대체.
- typography 의 lineHeight 가 generated 에 안 옴 → component 마다 `leading-*`
  utility 명시.

**대응**: 의식적 허용 — 코드 안에서 `min-h-[44px]`, `leading-snug` 같은
Tailwind built-in utility 보충. design.md upstream PR 또는 자체 lint plugin
은 follow-up.

**영향 토큰**: 모든 component variant 의 padding / height. follow-up D-020+ 에서.

---

## D-016 (2026-05-29) — Tailwind config 에서 JSON import = readFileSync

**발견 (W-26 fix)**: `import generated from './...json'` 가 Tailwind config
loader (Next.js dev mode) 와 호환 안 됨. Tailwind 가 config 컴파일 시 spread
가 적용 안 되어 새 token classes (`bg-primary` 등) 가 generation 안 됨.
chrome MCP 로 stylesheet 검사 시 `cssRulesFound: all false` 확인.

**대응**: `readFileSync(join(__dirname, 'tailwind.theme.generated.json')) +
JSON.parse` 패턴으로 변경. 모든 Tailwind config loader 호환.

**영향**: `tailwind.config.ts` 의 generated import 방식. `make design-export`
후 dev server restart 필요.

---

## D-017 (2026-05-29) — Layout max-width 768 → 1280

**발견 (데스크탑 visual regression)**: 기존 `max-w-3xl` (768px) 가 1440px+
wide 데스크탑 viewport 에서 콘텐츠 옹기종기 모임. Polymarket / Linear /
Robinhood 모두 max-w 1200~1440px 사용.

**대응**: `layout.tsx + 5 pages + SiteHeader` 일괄 `max-w-3xl → max-w-7xl`
(1280px). 모바일 / 태블릿 영향 0 (그 viewport 에서 `max-w-*` 가 viewport 폭
미만이라 무시), 데스크탑만 wide 펼침.

**영향**: 전 페이지 wrapper. 모바일 첫 진입 사용자에게 시각 변경 없음.

---

## D-018 (2026-05-29) — OutcomeCard standalone dual Buy → single View

**발견 (W-8 의 visual regression)**: OutcomeCard standalone variant 의 우측
듀얼 `↑ Buy YES` / `↓ Buy NO` 버튼이 시각적으로 "buy 버튼" 인데 실제는
parent `<Link>` 가 잡아서 detail 페이지로만 이동. **사용자 혼란** — Buy 인 줄
알고 click 했지만 detail 페이지로 점프.

**대응**: 단일 `View →` solid primary CTA 로 통일. dual Buy + quick trade
modal 연결은 W-10 후속 (`e.stopPropagation()` + modal trigger 구현 시).

**영향**: `components/OutcomeCard.tsx` 의 standalone variant. question variant
는 이미 단일 `View →` 였음.

---

## D-019 (2026-05-29) — BasketSheet 의 step indicator (single sheet, visual progress)

**결정 (W-11)**: BasketSheet 가 multi-page modal 이 아니라 단일 sheet 인데도
시각적 단계 표시 (`[1] EDIT → [2] REVIEW → [3] SIGN`). state 에 따라 active
dot 이 이동:
- 일반 (legs > 0, !busy, !err) → EDIT 활성
- err → REVIEW 활성 (사용자 확인 필요)
- busy → SIGN 활성

**이유**: 토스 multi-step DNA 의 시각적 단서. 사용자에게 "지금 무슨 단계인지"
명료. 실제 multi-page 로 분리하는 건 추후 (`step-dot-1` / `step-dot-2` 별도
view).

**영향**: `components/BasketSheet.tsx` 의 header 아래 step indicator.
DESIGN.md 의 `step-dot-active` / `step-dot-inactive` 토큰 binding.

---

## D-020 (2026-05-29) — Pro mode = dense table-row, Simple mode = card

**결정 (W-17/18/19)**: Simple/Pro 의 시각 분리:
- **Simple** = 카드 박스 (rounded-lg + 16px padding + hover bg-overlay) + big-number
  hero. Polymarket / 토스 / Robinhood 친화. 한 화면 더 적은 정보, 큰 hierarchy.
- **Pro** = 1-line table-row (grid-cols + 8px padding + border-b hairline). mono
  + tabular-nums. 한 화면에 6+ row. Bloomberg / Linear / HL trade 톤.

**적용된 컴포넌트**:
- `components/OutcomeCard.tsx` — Question / Standalone 둘 다 Pro variant.
- `app/portfolio/page.tsx` — Portfolio hero. Simple = big-number + 3 KPI grid /
  Pro = 1-line strip (Total · Unrealized · 4 KPI inline).
- `components/AIDiscovery.tsx` — RecommendationCard. Simple = card / Pro =
  6-col grid row (name · mkt% · fair% · edge · $ · add).

**Hook**: `useUiMode()` (lib/uiMode.ts, useSyncExternalStore + localStorage).
사용자 토글 = SiteHeader 의 UiModeToggle. default `simple` (대중 친화).

**영향**: 각 컴포넌트가 mode-aware. 새 컴포넌트는 두 variant 함께 정의 권장.
table-row variant 가 mono-sm + mono-md + tabular-nums 사용.

---

## (다음 결정은 여기 append)

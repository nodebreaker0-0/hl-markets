# Phase X Visual Regression Record

> 2026-05-29 · Phase X (전체 UI/UX 재설계 — "Polymarket × Robinhood × 토스 ×
> Notion AI" identity, AI-First Home, 5-icon nav, URL state machines) 의
> visual record. Chrome MCP 로 localhost:3000 testnet build 확인.
> 시각 변화 ground truth — 향후 phase 에서 rollback / 비교 시 reference.

---

## 1. 환경

- Desktop viewport: 1440 × 900 (반복 captured 1440 × 757 — Chrome chrome 빼고)
- Mobile viewport: 375 × 812 (iPhone 13/14 size)
- Network: testnet (`NEXT_PUBLIC_HL_NETWORK=testnet`)
- Wallet: `0xef22…d5ac` (session 연결됨)
- Browser: Chrome (Claude in Chrome MCP, save_to_disk false)
- Dev server: `npm run dev` after `make design-export`

---

## 2. 데스크탑 페이지별 결과

### 2.1 `/` Home (AI-First)

✅ Sidebar (280px fixed) — Brand "hl-markets" + caption "HYPERLIQUID · PREDICTION MARKETS"
✅ Nav 5-icon — 🏠 Home (active mint highlight) · ✨ Discover · 🛒 Basket · 📊 Portfolio · ⚙ Settings
✅ Footer slot — **SIMPLE / PRO toggle** (self-start, content-width), **TESTNET** badge (status-warn, content-width), 0xef22…d5ac wallet chip (full-width)
✅ Hero — "GOOD MORNING." (time-based) caption + "What do you want to bet on **today?**" display
✅ AIDiscovery panel — caption "✨ AI PICKS · LIVE DATA · EVERY ACTIVE MARKET" + helper prose + auto-explore textarea + 5 example query chips + "FIND OPPORTUNITIES" full-width primary CTA
✅ "OR BROWSE BY CATEGORY" — 5 pill chips ⚽ Sports / ₿ Crypto / 📊 Macro / 🗳 Politics / 🌦 Weather
✅ Manual browse hero card — "MANUAL BROWSE" caption + "Browse all markets" h1 + prose + dual CTA ("Trading markets →" primary + "Pending governance · Historical →" secondary)

### 2.2 `/discover` (AI Discovery)

✅ Sidebar — Discover active
✅ Header — "✨ AI DISCOVERY" caption + "Find your edge." h1
✅ "FILTER BY CATEGORY" — All (active mint pill) · Sports · Crypto · Macro · Politics · Weather
✅ AI Picks panel + auto-explore textarea + example chips + FIND OPPORTUNITIES CTA (Home 과 동일 컴포넌트)

### 2.3 `/markets` (Manual browse)

✅ Sidebar — no item highlight (markets 는 sidebar 미노출)
✅ Header — "BROWSE ALL MARKETS" caption + "Pending · Trading · Historical" h1
✅ "ENDING SOON" warning panel (status-warn 노란) — "1 MARKETS · SETTLEMENT EDGE CANDIDATES" + Recurring 카드
✅ 3-tab segmented control — Pending · **Markets** (active mint) · Historical
✅ Search input full-width
✅ Refresh chip 우상단 + "fresh as of … · HF live · auto-refresh 30s" status line
✅ 카드 그리드 (Simple mode) — BTC price bucket / 2026 World Cup champion (2-column lg+)
  - 좌측: title + leader + big % + options bar + "+44 more · view all →" (more options 시)
  - 우측: "View →" solid mint CTA
  - 하단 meta: question #823 · fallback #10231 · expires 137d 6h

### 2.4 `/basket` (Empty state)

✅ Sidebar — Basket active
✅ Center 60vh — 🛒 cart icon + "Your basket is empty." h1 + helper prose
✅ Dual CTA — "✨ Ask AI for picks" primary mint solid + "Browse all markets →" secondary

### 2.5 `/portfolio` (Simple mode)

✅ Sidebar — Portfolio active
✅ Header — "PORTFOLIO" caption + "0xef22…d5ac" wallet
✅ Hero card — TOTAL VALUE $21.19 (big-number) + ↓ $99.58 (−82.5%) UNREALIZED (accent-down)
✅ Metric row — COST BASIS $120.77 · REALIZED −$381.32 · HOLDINGS 2
✅ CONCENTRATION panel — HHI 50/100 + 2 bar (France 50% red · Germany 50% yellow) + "Concentrated — 2-3 outcomes carry the portfolio." prose
✅ HOLDINGS — France · Yes 카드 (63 shares · entry $30.52 · $10.65 · −$19.88 (−65.1%) · 4-stop slider 25/50/75/100 · CASH OUT 100% mint button)

### 2.6 `/portfolio` (Pro mode)

✅ Compact 1-line hero — TOTAL $21.19 / UNREALIZED ↓$99.58 (−82.5%) / COST BASIS / REALIZED / HOLDINGS 한 행에 다 배치
✅ Concentration + Holdings + OPEN ORDERS (No resting orders.) + RECENT FILLS 모두 dense table-row 변형

### 2.7 `/settings` (AI Analyst keys)

✅ Header — "SETTINGS" + "AI Analyst keys" + privacy prose
✅ Preferred provider toggle — Disable / **OpenAI** (active mint) / Anthropic
✅ KeyCard × N — OpenAI / Anthropic / Tavily / football-data / FRED / OpenWeather
  - 각 카드: title · masked savedKey · password input · Save / Test 버튼 · helper text
✅ ⚠ Privacy note (accent-down 박스)
✅ "Clear all keys" 버튼 (accent-down ring)
✅ "Other settings → Auto-bet rules" 링크 카드 (P2.7)

### 2.8 `/autobet`

✅ Header — "SETTINGS" caption + "Auto-bet" h1 + 설명 prose
✅ "Auto-bet is OFF" status box + ENABLE 버튼 (accent-down ring)
✅ CAPS — DAILY BUDGET $100 · PER-BET MAX $20 · MIN EDGE 8 pp · MIN CONFIDENCE Medium (default)
✅ CATEGORIES — ALLOW input + BLOCK hard skip (election, death, assassination default)
✅ DRY-RUN — "RUN NOW" 버튼
✅ RECENT AUTO-BETS (스크롤 하단)

### 2.9 OutcomeDetailSheet (`?sheet=outcome&id=10287`)

✅ Sheet 중앙 modal (desktop) — backdrop dim + 카드 박스
✅ Header — "OUTCOME #10287" caption + outcome name h2 + × close
✅ Big % — 50.0% YES (large display) + "No: 50.0%" inline (소형)
✅ Dual CTA — "↑ Buy Yes" green primary + "↓ Buy No" red primary
✅ Secondary CTA — "✨ Analyze with AI" 후 ring
✅ "Open full page →" footer link
✅ 배경 페이지 (Markets Pro) dimmed but visible

### 2.10 AIAnalystSheet (`?analyze=10287`)

✅ Sheet — "✨ AI ANALYST" caption + outcome name
✅ "AI Analyze (off)" 안내 패널 — "Add your own OpenAI or Anthropic key in **Settings**. hl-markets servers never see the key — direct browser → provider."
✅ Settings link 정확

### 2.11 TradeFlow Step 1 — Amount (`/trade?id=10287&step=1`)

✅ Step indicator — **1 AMOUNT** (active mint) · 2 CONFIRM · 3 DONE (3-segment progress)
✅ Header — "BUY YES ON" caption + outcome name h2 + "50.0% CURRENT YES" big %
✅ "HOW MUCH?" big $ input (mono large, $ prefix, divider 하단)
✅ Quick amount pills — $10 / $25 / $50 / $100
✅ Helper — "HL min $10. Buy fee 0 · sell fee applies later."
✅ "Continue →" full-width CTA (disabled when amount=0)

### 2.12 TradeFlow Step 2 — Confirm (`?step=2&amount=50`)

✅ Step indicator — 1✓ AMOUNT (done) · **2 CONFIRM** (active) · 3 DONE
✅ "REVIEW YOUR BET" caption + outcome name
✅ Summary card — Side: Yes / Bet: $50.00 / Current price: 0.0% / You get: 0 shares / Yes wins → you receive $0.00
  - 주: liquidity 없는 outcome 이라 0 shares (regression 아님)
✅ Helper — "IOC market at best ask + 2% slip · buy fee 0 (HIP-4) · sell fee 5 bps on close"
✅ Footer — "← Edit" link + "Place bet · $50" full-width primary CTA

### 2.13 실 fire 검증 — Buy graceful error + Sell live fill (T-X-103c)

테스트넷에서 click → real network fire 검증.

**Buy attempt** (`/trade?id=10287&step=2&side=yes&amount=10`):
- BTC ≥ $74,031 outcome 의 orderbook 이 비어있음 (liquidity 0).
- Place bet · $10 클릭 → red inline error: **"No sellers right now — try again in a moment."**
- error path 정상. button 은 재클릭 가능 상태 유지. step=3 redirect 안 일어남.
- → graceful degrade ✓

**Sell fire** (`/portfolio` Germany · Yes CASH OUT 100%):
- 95 shares @ best bid $0.111 → notional $10.55 (HL min $10 통과).
- 클릭 → agent sign (0 popup, IndexedDB privkey) → IOC submit.
- 5초 후 Portfolio 자동 refresh:
  - HOLDINGS 에서 Germany 카드 사라짐 ✓
  - RECENT FILLS 가장 위 `Sell 95 Germany @ 0.111 (-$79.71)` · `0s ago` 표시 ✓
  - $10.55 free USDC 회수, entry $90.25 → −$79.71 realized loss.
- HF response `statuses[0].filled` parse 정상.
- → placeMarketSell + agent signing + auto-refresh 한 사이클 모두 작동 ✓

---

## 3. 모바일 viewport (375 × 812)

### 3.1 Home — sidebar 숨김 + 상단 헤더

✅ Sidebar hidden (sm: 미만)
✅ 상단 헤더 — "hl-markets" brand + TESTNET badge 우측 (compact)
✅ Hero greeting + display 정상 wrap
✅ AI Picks panel + textarea + 5 example chip 세로 stack
✅ FIND OPPORTUNITIES full-width
✅ "OR BROWSE BY CATEGORY" 하단 진행

### 3.2 Markets — compact 1-line outcome row

✅ 3-tab pill (Pending / **Markets** / Historical) 컴팩트
✅ Refresh chip 정상
✅ Outcome row — "BTC price bucket · expires 2026-0…" + leader prose + 3 OPTS · 50% · expires 12h 12m 한 줄
✅ 2026 World Cup champion · 49 OPTS · 77% / May CPI · 51% 동일 패턴
✅ Pro-like 1-line density 가 자동 적용 (mobile space-saver)

### 3.3 OutcomeDetailSheet — bottom-sheet

✅ Mobile 에서는 modal 이 아닌 **하단 anchored sheet** — 화면 하단에 붙음
✅ 헤더 OUTCOME #10287 + 큰 outcome name + 50.0% YES 큰 표시
✅ Buy Yes / Buy No 풀폭 dual CTA
✅ Analyze with AI 풀폭 secondary
✅ "Open full page →" footer

### 3.4 Portfolio — Pro mode 자동 compact

✅ TOTAL $21.19 / UNREALIZED / COST BASIS / REALIZED / HOLDINGS 2 줄로 wrap
✅ CONCENTRATION + HOLDINGS card 정상 stack
✅ France · Yes / Germany · Yes 카드 — share entry + 4-stop slider + CASH OUT 100% 풀폭

---

## 4. P1~P3 fix verify (audit re-check)

| ID | Issue | Fix | Verify |
|---|---|---|---|
| P1.1 | Home hero prose 중복 | 제거 + AI Discovery 단일 entry | ✅ §2.1 |
| P1.2 | Discover 카테고리 필터 부재 | Filter by Category pill + Recent searches | ✅ §2.2 |
| P1.3 | ✨ Analyze 클릭 시 sheet nesting | Outcome sheet close → Analyst sheet open | ✅ §2.10 |
| P2.4 | Markets hero 과도 | "BROWSE ALL MARKETS" 캡션 + h1 minimal | ✅ §2.3 |
| P2.5 | OutcomeCard truncate 1줄 부족 | `sm:w-28` + `line-clamp-2` | ✅ §2.3 (BTC bucket title 2줄) |
| P2.7 | Settings ↔ Autobet disconnected | "Other settings" 링크 카드 추가 | ✅ §2.7 |
| P3.8 | Basket step indicator 없음 | Edit / Review / Sign 3-step indicator | ✅ (filled state — empty 라 검증 보류, 코드 확인 완료) |
| P3.10 | "Browse all markets" CTA weak | Manual browse hero card + dual CTA | ✅ §2.1 |
| **X** | **Sidebar footer flex stretch (Toggle/Badge)** | `items-start` + `self-start` + `w-fit` | ✅ §2.1 footer slot |

---

## 5. 디자인 토큰 일관성

✅ surface (#0e1714) · surface-elevated (#13201c) · primary (#5ce6c2 mint) · accent-down (red) · status-warn (yellow) — 전 페이지 동일
✅ Mono 폰트 (Geist Mono) — % / $ / tabular-nums 정렬 일관
✅ rounded-md / rounded-lg / rounded-xl / rounded-2xl 박스 위계 명확
✅ caption uppercase tracking-widest pattern — 모든 section header 일관

---

## 6. 미확인 항목

- Onboarding (`WelcomeOnboarding`) — 이미 visited 라 노출 안 됨, localStorage `hl-markets:visited` 삭제 후 재진입 필요. 코드 정상.
- AI Analyze 실 실행 — LLM key 입력 + Tavily 옵션 필요. §2.10 은 fallback state 검증.
- TradeFlow step 3 (DONE) — fill 발생 후 페이지. 검증은 U-7 testnet 실 발사로 같이 진행.
- Basket filled state (step indicator Edit/Review/Sign) — 코드 확인 완료, runtime 검증은 K-leg 추가 후. 다음 turn 에 별도 캡처.

---

## 7. 변경 history

| 날짜 | 변경 |
|---|---|
| 2026-05-29 | Phase X 의 visual regression record 초기 작성 (toggle width fix verify + 데스크탑/모바일 11 page 캡처) |

import type { Config } from 'tailwindcss';
import { readFileSync } from 'fs';
import { join } from 'path';

// Phase W — DESIGN.md v1 (single source of truth, Constitution D-IV).
// 토큰은 `/DESIGN.md` 에 정의 → `npx @google/design.md export --format
// json-tailwind` 로 `tailwind.theme.generated.json` 생성 → 여기서 load.
// 사람이 직접 hex 추가 X (D-I). 토큰 추가 / 변경은 DESIGN.md 부터 →
// `make design-export` → dev server restart (Tailwind 가 config 변경을 watch
// 안 함 — 첫 W-1~7 적용 시 dev restart 안 해서 새 token 클래스가 stylesheet
// 에 generation 안 된 버그 발견. W-26 fix).
//
// W-26: TS `import ... from 'foo.json'` 가 Tailwind 의 config loader 와
// 호환 안 됨 (Next.js dev 가 tsx config 컴파일 시 ESM/CJS interop 이슈).
// readFileSync + JSON.parse 가 모든 loader 에 안전.
const generated = JSON.parse(
  readFileSync(join(__dirname, 'tailwind.theme.generated.json'), 'utf-8'),
) as { theme: { extend: Record<string, unknown> } };

// generated JSON shape: { theme: { extend: { colors, fontSize, fontFamily,
// borderRadius, spacing } } }.
// design.md export 가 typography object 를 Tailwind 의 `fontSize` key→[size,
// {lineHeight, letterSpacing, fontFamily, fontWeight}] 튜플로 풀어준다.
const generatedExtend = generated.theme.extend;
const generatedColors = generatedExtend.colors as Record<string, string>;

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // DESIGN.md v1 의 모든 token (colors / typography / rounded / spacing
      // 등) 을 그대로 spread. 새 컴포넌트는 이 token 만 사용.
      ...generatedExtend,
      colors: {
        ...generatedColors,
        // Backwards-compat alias `hl.*` — Phase J/K/L/M/N/O/P/Q/R/S/T/U 코드가
        // `bg-hl-mint` / `text-hl-text` 등을 직접 쓰고 있어서 마이그레이션
        // (W-8 ~ W-15) 가 컴포넌트 별로 진행되는 동안 alias 유지. 완료 후
        // (W-23 visual regression 통과) 제거 — D-014 의 visual drift 결판.
        hl: {
          bg: generatedColors['surface'],
          surface: generatedColors['surface-elevated'],
          border: generatedColors['divider'],
          text: generatedColors['on-surface'],
          subtle: generatedColors['on-surface-muted'],
          mint: generatedColors['primary'],
          'mint-dim': generatedColors['primary-dim'],
        },
        // Status / governance indicator alias (Constitution IV 호환).
        // 마이그레이션 완료 후 직접 token 사용 (`status-warn` 등) 으로 전환.
        testnet: generatedColors['status-warn'],
        mainnet: generatedColors['status-fail'],
        yes: generatedColors['accent-up'],
        no: generatedColors['accent-down'],
      },
      fontFamily: {
        // 다국어 fallback chain (D-007). generated 의 fontFamily 는
        // typography token 별 (h1 / body-md 등) 분리되어 있어서 글로벌
        // default 는 여기서 명시.
        sans: [
          'Inter',
          'Noto Sans KR',
          'Noto Sans JP',
          'Noto Sans SC',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },
      // Shadow = 0 (D-004 — surface color 시리즈로 elevation). 기존 card /
      // card-hover shadow alias 는 Phase W 컴포넌트 마이그레이션 중 제거.
      // 호환 위해 비어있는 entry 1개만 (`hl-vote-web` 패턴 정합).
      boxShadow: {},
      backgroundImage: {
        // Hero radial — generated mint 토큰 사용 (W-2 의 hex hardcode 0건
        // 보장). 기존 `rgba(151,252,228, ...)` 를 새 mint `rgba(125,255,208, ...)`
        // 로 교체.
        'hero-radial':
          'radial-gradient(140% 90% at 50% 0%, rgba(125,255,208,0.10) 0%, rgba(125,255,208,0) 55%)',
      },
    },
  },
  plugins: [],
};

export default config;

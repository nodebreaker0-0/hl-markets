import type { Config } from 'tailwindcss';

// HL brand tokens — same palette as hl-vote-web (Constitution VII).
// Polymarket UX layout 만 차용, 색은 가져오지 않음.
// Mobile-first: base styles 부터 모바일 (Constitution VI). sm/md/lg breakpoint 활용.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        hl: {
          bg: '#0F1A1F',
          surface: '#142026',
          border: '#1E2C33',
          text: '#E5F2EF',
          subtle: '#7B8B8A',
          mint: '#97FCE4',
          'mint-dim': '#5BCFB7',
        },
        // Constitution IV / governance result indicators
        testnet: '#eab308',
        mainnet: '#dc2626',
        yes: '#97FCE4',
        no: '#dc2626',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.02) inset, 0 6px 24px -12px rgba(0,0,0,0.5)',
        'card-hover': '0 1px 0 rgba(151,252,228,0.06) inset, 0 12px 36px -12px rgba(0,0,0,0.6)',
      },
      backgroundImage: {
        'hero-radial':
          'radial-gradient(140% 90% at 50% 0%, rgba(151,252,228,0.10) 0%, rgba(151,252,228,0) 55%)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
};

export default config;

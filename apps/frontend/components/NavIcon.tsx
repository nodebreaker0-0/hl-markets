// Phase X-099 hotfix — Modern stroke icons replacing emoji nav glyphs.
//
// Hand-rolled SVG (no extra dependency). 24×24 viewBox, 1.5px stroke,
// rounded line caps/joins — Lucide / Phosphor style. currentColor 사용 →
// parent `text-primary` / `text-on-surface-muted` 그대로 작동.

import type { JSX } from 'react';

export type NavIconName = 'home' | 'discover' | 'basket' | 'portfolio' | 'settings';

interface NavIconProps {
  name: NavIconName;
  className?: string;
  /** Optional `size` (px). Default 20. */
  size?: number;
}

export function NavIcon({ name, className, size = 20 }: NavIconProps): JSX.Element {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };
  switch (name) {
    case 'home':
      // Simplified house — pitched roof + body, no door (cleaner).
      return (
        <svg {...props}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
        </svg>
      );
    case 'discover':
      // Sparkle / star (4-point) — AI / discovery vibe.
      return (
        <svg {...props}>
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
          <path d="M12 8.5 13.2 11l2.3 1-2.3 1L12 15.5 10.8 13 8.5 12l2.3-1L12 8.5z" />
        </svg>
      );
    case 'basket':
      // Shopping bag (handle arc + body) — modern, less retro than cart.
      return (
        <svg {...props}>
          <path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8z" />
          <path d="M9 8V6a3 3 0 0 1 6 0v2" />
        </svg>
      );
    case 'portfolio':
      // Trending-up bar chart hybrid — 3 vertical bars rising.
      return (
        <svg {...props}>
          <path d="M4 20h16" />
          <rect x="5.5" y="13" width="3" height="6" rx="0.5" />
          <rect x="10.5" y="9" width="3" height="10" rx="0.5" />
          <rect x="15.5" y="5" width="3" height="14" rx="0.5" />
        </svg>
      );
    case 'settings':
      // 6-tooth gear — clean, geometric.
      return (
        <svg {...props}>
          <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
          <path d="M19.4 13.6a1 1 0 0 0 .2-1.1l-.9-2.1a1 1 0 0 0-1-.6l-1.6.1a7 7 0 0 0-.8-.8l.1-1.6a1 1 0 0 0-.6-1l-2.1-.9a1 1 0 0 0-1.1.2l-1 1.3a7 7 0 0 0-1.2 0l-1-1.3a1 1 0 0 0-1.1-.2l-2.1.9a1 1 0 0 0-.6 1l.1 1.6a7 7 0 0 0-.8.8l-1.6-.1a1 1 0 0 0-1 .6l-.9 2.1a1 1 0 0 0 .2 1.1l1.3 1a7 7 0 0 0 0 1.2l-1.3 1a1 1 0 0 0-.2 1.1l.9 2.1a1 1 0 0 0 1 .6l1.6-.1c.2.3.5.5.8.8l-.1 1.6a1 1 0 0 0 .6 1l2.1.9a1 1 0 0 0 1.1-.2l1-1.3a7 7 0 0 0 1.2 0l1 1.3a1 1 0 0 0 1.1.2l2.1-.9a1 1 0 0 0 .6-1l-.1-1.6a7 7 0 0 0 .8-.8l1.6.1a1 1 0 0 0 1-.6l.9-2.1a1 1 0 0 0-.2-1.1l-1.3-1a7 7 0 0 0 0-1.2l1.3-1z" />
        </svg>
      );
  }
}

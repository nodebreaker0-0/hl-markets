// Phase W-16 — Simple / Pro UI mode toggle.
//
// DESIGN.md D-006 — density 이중성 해결책. 같은 토큰 시리즈로 컴포넌트가
// mode-aware 하게 변종 선택. 사용자 명시 선택 (auto-detection 없음).
//
//   Simple = 친화 big-number + multi-step + 큰 button (Polymarket / 토스 톤)
//   Pro    = dense table + monospace + 한 화면 많은 정보 (HL trade 톤)
//
// Storage: localStorage `hl-markets:ui-mode-v1`, default `'simple'`.
// 사용자 첫 진입 = Simple (대중 친화).
//
// Hook: useUiMode() — React 18 의 useSyncExternalStore 패턴으로 다중 tab /
// 동일 tab 의 여러 mount 지점 동기화.

'use client';

import { useSyncExternalStore } from 'react';

export type UiMode = 'simple' | 'pro';

const STORAGE_KEY = 'hl-markets:ui-mode-v1';
const DEFAULT_MODE: UiMode = 'simple';

// ---------------- read / write ----------------

function readMode(): UiMode {
  if (typeof window === 'undefined') return DEFAULT_MODE;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'simple' || v === 'pro') return v;
  } catch {
    /* storage blocked → default */
  }
  return DEFAULT_MODE;
}

export function setUiMode(mode: UiMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
    // Notify other listeners in this tab — `storage` event only fires cross-tab.
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: mode }));
  } catch {
    /* ignore */
  }
}

// ---------------- subscribe ----------------

const EVENT_NAME = 'hl-markets:ui-mode-change';

function subscribe(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onCustom = (): void => listener();
  const onStorage = (e: StorageEvent): void => {
    if (e.key === STORAGE_KEY) listener();
  };
  window.addEventListener(EVENT_NAME, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT_NAME, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}

// ---------------- hook ----------------

/** React hook — current UI mode + setter. SSR-safe (default during hydration). */
export function useUiMode(): { mode: UiMode; setMode: (m: UiMode) => void; toggle: () => void } {
  const mode = useSyncExternalStore(
    subscribe,
    readMode,
    () => DEFAULT_MODE, // server snapshot
  );
  return {
    mode,
    setMode: setUiMode,
    toggle: () => setUiMode(mode === 'simple' ? 'pro' : 'simple'),
  };
}

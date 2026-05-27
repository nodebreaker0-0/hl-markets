// Minimal pub-sub toast system. Components dispatch with `pushToast()`;
// the global <Toaster/> in app/layout listens and renders.

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastEvent {
  id: string;
  tone: ToastTone;
  message: string;
  /** Optional small body (e.g. "OID 12345"). */
  detail?: string;
  /** Auto-dismiss ms. 0 = sticky. Default 4000. */
  ttlMs?: number;
}

const CHANNEL = 'hl-markets:toast';

export function pushToast(t: Omit<ToastEvent, 'id'>): void {
  if (typeof window === 'undefined') return;
  const ev = new CustomEvent<ToastEvent>(CHANNEL, {
    detail: {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ttlMs: 4000,
      ...t,
    },
  });
  window.dispatchEvent(ev);
}

export function subscribeToasts(
  handler: (t: ToastEvent) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const fn = (e: Event): void => handler((e as CustomEvent<ToastEvent>).detail);
  window.addEventListener(CHANNEL, fn as EventListener);
  return () => window.removeEventListener(CHANNEL, fn as EventListener);
}

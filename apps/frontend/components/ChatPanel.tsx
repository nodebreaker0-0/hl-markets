'use client';

// Phase J.3 — per-market chat panel.
//
// Drops into /q?id=N and /o?id=N. Three states:
//   - wallet not connected → read-only message list + "Connect to chat"
//   - wallet connected, position < $1 → list + composer disabled + tooltip
//   - all clear → list + working composer
//
// Live updates over WebSocket; falls back to fetchChat for the initial page
// load and after reconnect to fill the gap.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  fetchChat,
  deleteChatMessage,
  fetchPosition,
  chatWsUrl,
  type ChatMessageView,
  type PositionResponse,
} from '@/lib/api';
import { CURRENT_NETWORK } from '@/lib/network';
import { useSession } from '@/lib/use-session';

const RECONNECT_INITIAL_MS = 1_000;
const RECONNECT_CAP_MS = 30_000;
const COMPOSER_MAX = 500;

function shortAddr(a: string): string {
  if (!a) return '';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return 'just now';
  const m = Math.floor(d / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

interface IncomingFrame {
  type: string;
  // SERVER_HELLO
  v?: number;
  roomKey?: string;
  you?: { address: string } | null;
  history?: ChatMessageView[];
  // ACK
  clientNonce?: string;
  id?: string;
  signedAt?: number;
  // BROADCAST
  message?: ChatMessageView;
  // BROADCAST_DELETED
  by?: string;
  // ERROR
  code?: string;
  message_?: string;
}

interface ChatPanelProps {
  marketKey: string; // `q:N` or `o:N`
  /** Tells the user "you need a position in this market" specifically. */
  marketTitle?: string;
}

export function ChatPanel({ marketKey, marketTitle }: ChatPanelProps) {
  const { session } = useSession();
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [composer, setComposer] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  /** address (lowercase) → full position snapshot. Backend already caches 30s. */
  const [positions, setPositions] = useState<Map<string, PositionResponse>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const pendingAcks = useRef<Map<string, () => void>>(new Map());
  const reconnectDelay = useRef<number>(RECONNECT_INITIAL_MS);
  const closedByUs = useRef<boolean>(false);
  /** Addresses that are currently being fetched — dedup parallel calls. */
  const inflight = useRef<Set<string>>(new Set());

  // Initial REST fetch on mount / marketKey change.
  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    fetchChat(CURRENT_NETWORK, marketKey, { limit: 50 })
      .then((resp) => {
        if (!cancelled) setMessages(resp.messages);
      })
      .catch((e) => {
        if (!cancelled) setErr((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [marketKey]);

  // Auto-scroll to bottom when new messages arrive (unless user scrolled up).
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);

  /** Fan-out: fetch position for every distinct address we haven't seen yet.
   *  Called whenever `messages` changes. Inflight dedup keeps it cheap. */
  useEffect(() => {
    const distinct = new Set<string>();
    for (const m of messages) {
      if (!m.address) continue;
      const a = m.address.toLowerCase();
      if (!positions.has(a) && !inflight.current.has(a)) distinct.add(a);
    }
    if (distinct.size === 0) return;
    for (const addr of distinct) {
      inflight.current.add(addr);
      fetchPosition(CURRENT_NETWORK, addr as `0x${string}`, marketKey)
        .then((p) => {
          setPositions((prev) => {
            const next = new Map(prev);
            next.set(addr, p);
            return next;
          });
        })
        .catch(() => {
          /* silently leave it unknown — badge falls back to "…" */
        })
        .finally(() => {
          inflight.current.delete(addr);
        });
    }
  }, [messages, marketKey, positions]);

  const handleFrame = useCallback((f: IncomingFrame) => {
    if (f.type === 'SERVER_HELLO') {
      if (Array.isArray(f.history)) setMessages(f.history);
      return;
    }
    if (f.type === 'ACK') {
      const nonce = f.clientNonce;
      if (nonce) {
        const resolve = pendingAcks.current.get(nonce);
        if (resolve) {
          resolve();
          pendingAcks.current.delete(nonce);
        }
      }
      return;
    }
    if (f.type === 'BROADCAST' && f.message) {
      const incoming = f.message;
      setMessages((prev) => {
        if (prev.some((m) => m.id === incoming.id)) return prev;
        return [...prev, incoming];
      });
      return;
    }
    if (f.type === 'BROADCAST_DELETED' && f.id) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === f.id ? { ...m, body: '', address: '', deleted: true } : m,
        ),
      );
      return;
    }
    if (f.type === 'ERROR') {
      const msg =
        f.message_ ||
        (f.code === 'no_position'
          ? `Minimum $1 position required to chat${marketTitle ? ` in ${marketTitle}` : ''}.`
          : f.code === 'rate_limited'
            ? 'Slow down — 10 messages per minute.'
            : f.code === 'automod_url'
              ? 'Link blocked — only hyperliquid / x / github links allowed.'
              : f.code === 'automod_profanity'
                ? 'Message blocked by automod.'
                : f.code === 'too_long'
                  ? 'Message too long (max 500 chars).'
                  : f.code === 'no_auth'
                    ? 'Sign in to chat.'
                    : `Error: ${f.code ?? 'unknown'}`);
      setErr(msg);
      // Also resolve any pending ack so the UI un-spinner.
      const nonce = f.clientNonce;
      if (nonce) {
        const resolve = pendingAcks.current.get(nonce);
        if (resolve) {
          resolve();
          pendingAcks.current.delete(nonce);
        }
      }
    }
  }, [marketTitle]);

  // WebSocket lifecycle — reconnect with backoff.
  useEffect(() => {
    closedByUs.current = false;
    let cancelled = false;

    const connect = (): void => {
      if (cancelled) return;
      const url = chatWsUrl(CURRENT_NETWORK, marketKey);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        reconnectDelay.current = RECONNECT_INITIAL_MS;
      };
      ws.onmessage = (e) => {
        try {
          handleFrame(JSON.parse(e.data) as IncomingFrame);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        setWsConnected(false);
        if (cancelled || closedByUs.current) return;
        const delay = reconnectDelay.current;
        reconnectDelay.current = Math.min(delay * 2, RECONNECT_CAP_MS);
        setTimeout(connect, delay);
      };
      ws.onerror = () => {
        /* close handler does the work */
      };
    };
    connect();

    return () => {
      cancelled = true;
      closedByUs.current = true;
      wsRef.current?.close();
    };
  }, [marketKey, handleFrame]);

  const send = useCallback(async () => {
    const body = composer.trim();
    if (!body || sending) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setErr('Not connected — reconnecting…');
      return;
    }
    setErr(null);
    setSending(true);
    const clientNonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // Wait for ACK or ERROR with this clientNonce, with a 5s timeout.
    const ackPromise = new Promise<void>((resolve) => {
      pendingAcks.current.set(clientNonce, resolve);
      setTimeout(() => {
        if (pendingAcks.current.has(clientNonce)) {
          pendingAcks.current.delete(clientNonce);
          resolve();
        }
      }, 5_000);
    });
    ws.send(JSON.stringify({ type: 'SEND', body, clientNonce }));
    await ackPromise;
    setComposer('');
    setSending(false);
  }, [composer, sending]);

  const onComposerKey = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const onDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this message?')) return;
    try {
      // Prefer WS for the BROADCAST_DELETED ripple, fall back to REST.
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'DELETE', id }));
      } else {
        await deleteChatMessage(id);
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, body: '', address: '', deleted: true } : m)),
        );
      }
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  const canSend = !!session;

  const composerHint = useMemo(() => {
    if (!session) return 'Connect a wallet to chat.';
    if (!wsConnected) return 'Reconnecting…';
    return 'Press Enter to send (Shift+Enter for a new line).';
  }, [session, wsConnected]);

  return (
    <section className="flex flex-col rounded-2xl border border-hl-border bg-hl-surface">
      <header className="flex items-center justify-between border-b border-hl-border px-4 py-2 text-xs text-hl-subtle">
        <span className="uppercase tracking-widest">Chat</span>
        <span className={clsx(wsConnected ? 'text-hl-mint' : 'text-hl-subtle/60')}>
          {wsConnected ? '● live' : '○ offline'}
        </span>
      </header>

      <div
        ref={listRef}
        className="max-h-96 min-h-[12rem] overflow-y-auto px-4 py-3 text-sm"
      >
        {messages.length === 0 && (
          <div className="py-6 text-center text-xs text-hl-subtle/70">
            No messages yet — be first.
          </div>
        )}
        {messages.map((m) => (
          <MessageRow
            key={m.id}
            m={m}
            self={session?.address.toLowerCase() === m.address.toLowerCase()}
            position={m.address ? positions.get(m.address.toLowerCase()) ?? null : null}
            onDelete={onDelete}
          />
        ))}
      </div>

      {err && (
        <div className="border-t border-hl-border bg-mainnet/5 px-4 py-1.5 text-[11px] text-mainnet">
          {err}
        </div>
      )}

      <footer className="border-t border-hl-border p-3">
        <textarea
          value={composer}
          onChange={(e) => setComposer(e.target.value.slice(0, COMPOSER_MAX))}
          onKeyDown={onComposerKey}
          rows={2}
          placeholder={canSend ? 'Say something…' : 'Connect to chat'}
          disabled={!canSend || sending}
          className={clsx(
            'w-full resize-none rounded-xl border border-hl-border bg-hl-bg px-3 py-2 text-sm text-hl-text placeholder:text-hl-subtle/60 focus:border-hl-mint focus:outline-none',
            !canSend && 'cursor-not-allowed opacity-60',
          )}
        />
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-hl-subtle">
          <span>{composerHint}</span>
          <span className={composer.length > COMPOSER_MAX - 50 ? 'text-mainnet' : ''}>
            {composer.length}/{COMPOSER_MAX}
          </span>
        </div>
      </footer>
    </section>
  );
}

function MessageRow({
  m,
  self,
  position,
  onDelete,
}: {
  m: ChatMessageView;
  self: boolean;
  position: PositionResponse | null;
  onDelete: (id: string) => void;
}) {
  if (m.deleted) {
    return (
      <div className="py-1.5 text-[11px] italic text-hl-subtle/50">message deleted</div>
    );
  }
  return (
    <div className="group py-1.5">
      <div className="flex items-baseline gap-2 text-[11px] text-hl-subtle">
        <span
          className={clsx(
            'font-mono',
            self ? 'text-hl-mint' : 'text-hl-text',
          )}
          title={m.address}
        >
          {shortAddr(m.address)}
        </span>
        <PositionBadge p={position} />
        <span>{timeAgo(m.signedAt)}</span>
        {self && (
          <button
            type="button"
            onClick={() => onDelete(m.id)}
            className="ml-auto opacity-0 transition-opacity hover:text-mainnet group-hover:opacity-100"
          >
            delete
          </button>
        )}
      </div>
      <div className="whitespace-pre-wrap break-words text-sm text-hl-text">{m.body}</div>
    </div>
  );
}

function PositionBadge({ p }: { p: PositionResponse | null }) {
  // null = not fetched yet. side === 'none' = fetched + empty.
  if (p === null) {
    return (
      <span className="rounded-full bg-hl-bg/40 px-1.5 py-0 text-[9px] text-hl-subtle/40">
        …
      </span>
    );
  }
  if (p.side === 'none' || p.shares <= 0 || p.holdings.length === 0) {
    return (
      <span className="rounded-full bg-hl-bg px-1.5 py-0 text-[9px] uppercase tracking-widest text-hl-subtle/60">
        no pos
      </span>
    );
  }
  // Primary holding (largest by USD). If the user has positions in multiple
  // outcomes in this question, we show the biggest and append "+N more" in
  // the tooltip so the badge stays compact.
  const primary = p.holdings[0]!;
  const isYes = primary.sideIdx === 0;
  const sharesShort = primary.shares >= 1000
    ? `${(primary.shares / 1000).toFixed(1)}K`
    : Math.round(primary.shares).toString();
  const extra = p.holdings.length - 1;
  const title = p.holdings
    .map((h) => `${h.outcomeName} ${h.sideName} · ${h.shares} shares · $${h.notional.toFixed(2)}`)
    .join('\n');
  return (
    <span
      className={clsx(
        'rounded-full px-1.5 py-0 text-[10px] font-semibold ring-1',
        isYes
          ? 'bg-hl-mint/15 text-hl-mint ring-hl-mint/40'
          : 'bg-mainnet/15 text-mainnet ring-mainnet/40',
      )}
      title={title}
    >
      {primary.outcomeName} {sharesShort} · ${primary.notional.toFixed(0)}
      {extra > 0 && <span className="ml-1 opacity-60">+{extra}</span>}
    </span>
  );
}

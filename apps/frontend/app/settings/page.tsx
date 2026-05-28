'use client';

// Phase M — /settings page.
// Manage LLM API keys (OpenAI / Anthropic). Keys live ONLY in this browser.

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { SiteHeader } from '@/components/SiteHeader';
import {
  loadKeys,
  saveKeys,
  clearKeys,
  testKey,
  type LlmKeys,
  type LlmProvider,
} from '@/lib/llm';
import { pushToast } from '@/lib/toast';

export default function SettingsPage(): JSX.Element {
  const [keys, setKeys] = useState<LlmKeys>({
    preferred: null,
    openai: null,
    anthropic: null,
    tavily: null,
    footballData: null,
    fred: null,
    openweather: null,
  });
  const [openaiInput, setOpenaiInput] = useState('');
  const [anthropicInput, setAnthropicInput] = useState('');
  const [tavilyInput, setTavilyInput] = useState('');
  const [footballInput, setFootballInput] = useState('');
  const [fredInput, setFredInput] = useState('');
  const [weatherInput, setWeatherInput] = useState('');
  const [testing, setTesting] = useState<LlmProvider | null>(null);

  useEffect(() => {
    const k = loadKeys();
    setKeys(k);
    setOpenaiInput(k.openai ?? '');
    setAnthropicInput(k.anthropic ?? '');
    setTavilyInput(k.tavily ?? '');
    setFootballInput(k.footballData ?? '');
    setFredInput(k.fred ?? '');
    setWeatherInput(k.openweather ?? '');
  }, []);

  const persist = (next: LlmKeys): void => {
    setKeys(next);
    saveKeys(next);
  };

  const onSetPreferred = (p: LlmProvider | null): void => {
    persist({ ...keys, preferred: p });
    pushToast({ tone: 'info', message: p ? `Preferred: ${p}` : 'Preferred cleared' });
  };

  const onSaveOpenai = (): void => {
    persist({ ...keys, openai: openaiInput.trim() || null });
    pushToast({ tone: 'success', message: 'OpenAI key saved (browser only)' });
  };
  const onSaveAnthropic = (): void => {
    persist({ ...keys, anthropic: anthropicInput.trim() || null });
    pushToast({ tone: 'success', message: 'Anthropic key saved (browser only)' });
  };

  const onTest = async (p: LlmProvider): Promise<void> => {
    const key = p === 'openai' ? openaiInput.trim() : anthropicInput.trim();
    if (!key) {
      pushToast({ tone: 'error', message: 'Enter a key first' });
      return;
    }
    setTesting(p);
    try {
      const r = await testKey(p, key);
      if (r.ok) {
        pushToast({ tone: 'success', message: `${p}: ✓ verified` });
        persist({
          ...keys,
          [p]: key,
          preferred: keys.preferred ?? p,
        });
      } else {
        pushToast({ tone: 'error', message: `${p}: ✕ ${r.detail ?? 'invalid'}` });
      }
    } finally {
      setTesting(null);
    }
  };

  const onClearAll = (): void => {
    if (!confirm('Clear all LLM keys from this browser?')) return;
    clearKeys();
    setKeys({ preferred: null, openai: null, anthropic: null });
    setOpenaiInput('');
    setAnthropicInput('');
    pushToast({ tone: 'info', message: 'All LLM keys cleared' });
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <SiteHeader />

      <header>
        <div className="text-xs uppercase tracking-widest text-hl-subtle">Settings</div>
        <h1 className="mt-1 text-xl font-semibold text-hl-text">AI Analyst keys</h1>
        <p className="mt-1 text-xs text-hl-subtle">
          Your keys are stored only in this browser (localStorage). hl-markets servers never see them. Each
          analysis is a direct browser→provider call.
        </p>
      </header>

      <section className="rounded-2xl border border-hl-border bg-hl-surface p-4">
        <div className="text-[10px] uppercase tracking-widest text-hl-subtle">Preferred provider</div>
        <div className="mt-2 inline-flex rounded-full bg-hl-bg p-0.5 ring-1 ring-hl-border">
          {(['none', 'openai', 'anthropic'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onSetPreferred(p === 'none' ? null : p)}
              className={clsx(
                'rounded-full px-3 py-1 text-xs transition',
                (keys.preferred ?? 'none') === p
                  ? 'bg-hl-mint/15 text-hl-mint'
                  : 'text-hl-subtle hover:text-hl-text',
              )}
            >
              {p === 'none' ? 'Disable' : p === 'openai' ? 'OpenAI' : 'Anthropic'}
            </button>
          ))}
        </div>
      </section>

      <KeyCard
        title="OpenAI API key"
        placeholder="sk-proj-..."
        value={openaiInput}
        onChange={setOpenaiInput}
        onSave={onSaveOpenai}
        onTest={() => void onTest('openai')}
        testing={testing === 'openai'}
        savedKey={keys.openai}
        helper="Model: gpt-4o-mini · ~$0.001 / analysis"
      />

      <KeyCard
        title="Anthropic API key"
        placeholder="sk-ant-..."
        value={anthropicInput}
        onChange={setAnthropicInput}
        onSave={onSaveAnthropic}
        onTest={() => void onTest('anthropic')}
        testing={testing === 'anthropic'}
        savedKey={keys.anthropic}
        helper="Model: claude-3-5-sonnet · ~$0.01 / analysis"
      />

      <KeyCard
        title="Tavily API key (optional — web search)"
        placeholder="tvly-..."
        value={tavilyInput}
        onChange={setTavilyInput}
        onSave={() => {
          persist({ ...keys, tavily: tavilyInput.trim() || null });
          pushToast({ tone: 'success', message: 'Tavily key saved' });
        }}
        onTest={() => {
          pushToast({
            tone: 'info',
            message: 'Tavily: live search runs every AI Analyze',
            detail: 'No separate test — try Analyze on any outcome.',
          });
        }}
        testing={false}
        savedKey={keys.tavily ?? null}
        helper="When set, AI Analyze fetches 5 web results before the LLM call · ~$0.00 / call on dev tier"
      />

      <section className="rounded-2xl border border-hl-border bg-hl-surface p-4">
        <div className="text-[10px] uppercase tracking-widest text-hl-subtle">
          Domain specialist data (optional · Phase T)
        </div>
        <p className="mt-1 text-xs text-hl-subtle">
          AI Basket Discovery automatically calls these APIs for each candidate
          when their key is set. Crypto uses CoinGecko (no key required).
        </p>
      </section>

      <KeyCard
        title="football-data.org (sports)"
        placeholder="your token"
        value={footballInput}
        onChange={setFootballInput}
        onSave={() => {
          persist({ ...keys, footballData: footballInput.trim() || null });
          pushToast({ tone: 'success', message: 'football-data key saved' });
        }}
        onTest={() => {
          pushToast({ tone: 'info', message: 'Live test happens during Discovery runs' });
        }}
        testing={false}
        savedKey={keys.footballData ?? null}
        helper="Free tier: ~10 calls/min · used to enrich sports outcomes (team form, H2H, league standing)"
      />

      <KeyCard
        title="FRED API (economics)"
        placeholder="your fred key"
        value={fredInput}
        onChange={setFredInput}
        onSave={() => {
          persist({ ...keys, fred: fredInput.trim() || null });
          pushToast({ tone: 'success', message: 'FRED key saved' });
        }}
        onTest={() => {
          pushToast({ tone: 'info', message: 'Live test happens during Discovery runs' });
        }}
        testing={false}
        savedKey={keys.fred ?? null}
        helper="St. Louis Fed · free · CPI, unemployment, GDP, fed funds rate, PPI"
      />

      <KeyCard
        title="OpenWeatherMap (weather)"
        placeholder="your owm key"
        value={weatherInput}
        onChange={setWeatherInput}
        onSave={() => {
          persist({ ...keys, openweather: weatherInput.trim() || null });
          pushToast({ tone: 'success', message: 'OpenWeather key saved' });
        }}
        onTest={() => {
          pushToast({ tone: 'info', message: 'Live test happens during Discovery runs' });
        }}
        testing={false}
        savedKey={keys.openweather ?? null}
        helper="Free tier: 60 calls/min · used for weather-bet outcomes"
      />

      <section className="rounded-2xl border border-mainnet/30 bg-mainnet/5 p-4 text-xs text-hl-text">
        <div className="font-semibold text-mainnet">⚠ Privacy note</div>
        <p className="mt-1 text-hl-subtle">
          Each AI Analyze click ships your outcome metadata + your API key directly to the provider you chose.
          Our backend (<code className="mono">hl-markets-api</code>) does not log or proxy these requests. Keys
          live only in this browser&apos;s localStorage. Browser XSS / extension hijack risks apply — the same risk
          model as the trading agent privkey (see{' '}
          <code className="mono">specs/.../agent.md</code>).
        </p>
      </section>

      <div>
        <button
          type="button"
          onClick={onClearAll}
          className="rounded-full border border-mainnet/40 bg-mainnet/10 px-4 py-2 text-xs font-semibold text-mainnet hover:bg-mainnet/15"
        >
          Clear all keys
        </button>
      </div>
    </main>
  );
}

function KeyCard({
  title,
  placeholder,
  value,
  onChange,
  onSave,
  onTest,
  testing,
  savedKey,
  helper,
}: {
  title: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onTest: () => void;
  testing: boolean;
  savedKey: string | null;
  helper: string;
}): JSX.Element {
  const masked = savedKey ? `${savedKey.slice(0, 7)}…${savedKey.slice(-4)}` : 'not set';
  return (
    <section className="rounded-2xl border border-hl-border bg-hl-surface p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-hl-text">{title}</div>
        <code className="mono text-[10px] text-hl-subtle">{masked}</code>
      </div>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-hl-border bg-hl-bg px-3 py-2 font-mono text-xs text-hl-text focus:border-hl-mint focus:outline-none"
          autoComplete="off"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSave}
            className="rounded-full border border-hl-border bg-hl-bg px-3 py-2 text-xs font-semibold text-hl-text hover:border-hl-mint"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onTest}
            disabled={testing}
            className={clsx(
              'rounded-full bg-hl-mint/15 px-3 py-2 text-xs font-semibold text-hl-mint ring-1 ring-hl-mint',
              testing && 'cursor-wait opacity-60',
            )}
          >
            {testing ? 'Testing…' : 'Test'}
          </button>
        </div>
      </div>
      <div className="mt-2 text-[10px] text-hl-subtle">{helper}</div>
    </section>
  );
}

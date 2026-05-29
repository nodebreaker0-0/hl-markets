'use client';

// Phase M — /settings page.
// Manage LLM API keys (OpenAI / Anthropic). Keys live ONLY in this browser.

import { useEffect, useState } from 'react';
import clsx from 'clsx';
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
    <div className="flex flex-col gap-6">
      

      <header>
        <div className="text-xs uppercase tracking-widest text-on-surface-muted">Settings</div>
        <h1 className="mt-1 text-xl font-semibold text-on-surface">AI Analyst keys</h1>
        <p className="mt-1 text-xs text-on-surface-muted">
          Your keys are stored only in this browser (localStorage). hl-markets servers never see them. Each
          analysis is a direct browser→provider call.
        </p>
      </header>

      <section className="rounded-2xl border border-divider bg-surface-elevated p-4">
        <div className="text-[10px] uppercase tracking-widest text-on-surface-muted">Preferred provider</div>
        <div className="mt-2 inline-flex rounded-full bg-surface p-0.5 ring-1 ring-divider">
          {(['none', 'openai', 'anthropic'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onSetPreferred(p === 'none' ? null : p)}
              className={clsx(
                'rounded-full px-3 py-1 text-xs transition',
                (keys.preferred ?? 'none') === p
                  ? 'bg-primary/15 text-primary'
                  : 'text-on-surface-muted hover:text-on-surface',
              )}
            >
              {p === 'none' ? 'Disable' : p === 'openai' ? 'OpenAI' : 'Anthropic'}
            </button>
          ))}
        </div>
      </section>

      {/* T-X-102 — Preferred provider 에 따라 해당 KeyCard 만 풀로 표시.
          비선택 provider 는 작은 "Add … key (optional)" 버튼 → 클릭 시 expand.
          Disable (preferred=null) 면 둘 다 풀로 표시 (초기 onboarding). */}
      {(keys.preferred === null || keys.preferred === 'openai') && (
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
          getKeyUrl="https://platform.openai.com/api-keys"
          getKeyHint="sign in → '+ Create new secret key' → copy sk-proj-…"
        />
      )}

      {(keys.preferred === null || keys.preferred === 'anthropic') && (
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
          getKeyUrl="https://console.anthropic.com/settings/keys"
          getKeyHint="sign in → 'Create Key' → copy sk-ant-…"
        />
      )}

      {/* 비선택 provider — collapsed link 로 표시. 사용자가 두 번째 key 도 등록하려면
          PREFERRED 토글에서 그 provider 로 바꿔서 입력하면 됨. */}
      {keys.preferred === 'openai' && (
        <CollapsedHint
          title={keys.anthropic ? 'Anthropic key saved (not preferred)' : 'Add Anthropic key (optional)'}
          hint={
            keys.anthropic
              ? 'Switch via PREFERRED PROVIDER above to use Anthropic.'
              : 'Switch via PREFERRED PROVIDER above to add a key.'
          }
        />
      )}
      {keys.preferred === 'anthropic' && (
        <CollapsedHint
          title={keys.openai ? 'OpenAI key saved (not preferred)' : 'Add OpenAI key (optional)'}
          hint={
            keys.openai
              ? 'Switch via PREFERRED PROVIDER above to use OpenAI.'
              : 'Switch via PREFERRED PROVIDER above to add a key.'
          }
        />
      )}

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
        getKeyUrl="https://app.tavily.com/home"
        getKeyHint="free · sign up → dashboard 우상단 'API Key'"
      />

      <section className="rounded-2xl border border-divider bg-surface-elevated p-4">
        <div className="text-[10px] uppercase tracking-widest text-on-surface-muted">
          Domain specialist data (optional · Phase T)
        </div>
        <p className="mt-1 text-xs text-on-surface-muted">
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
        getKeyUrl="https://www.football-data.org/client/register"
        getKeyHint="free · register → email 로 token 발송"
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
        getKeyUrl="https://fredaccount.stlouisfed.org/apikey"
        getKeyHint="free · St. Louis Fed account → 'Request API Key'"
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
        getKeyUrl="https://home.openweathermap.org/api_keys"
        getKeyHint="free · sign up → 'API keys' 탭 → default key 복사"
      />

      <section className="rounded-2xl border border-accent-down/30 bg-accent-down/5 p-4 text-xs text-on-surface">
        <div className="font-semibold text-accent-down">⚠ Privacy note</div>
        <p className="mt-1 text-on-surface-muted">
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
          className="rounded-full border border-accent-down/40 bg-accent-down/10 px-4 py-2 text-xs font-semibold text-accent-down hover:bg-accent-down/15"
        >
          Clear all keys
        </button>
      </div>

      {/* P2.7 — Settings 와 Autobet 연결. autobet 은 별도 page 라 link 만. */}
      <section className="mt-lg rounded-xl bg-surface-elevated p-lg">
        <div className="flex flex-col gap-1">
          <span className="text-caption uppercase tracking-widest text-on-surface-muted">
            Other settings
          </span>
          <h2 className="text-h2 font-semibold text-on-surface">Auto-bet rules</h2>
          <p className="text-body-sm text-on-surface-muted">
            Set daily cap / per-bet max / min edge / category filters for the
            5-min background scanner. Default OFF.
          </p>
        </div>
        <a
          href="/autobet"
          className="mt-md inline-flex items-center gap-2 rounded-md bg-surface px-base py-md text-button font-semibold text-on-surface transition-colors hover:bg-surface-overlay"
        >
          Open Auto-bet →
        </a>
      </section>
    </div>
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
  getKeyUrl,
  getKeyHint,
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
  /** Where to obtain the key (provider's API key page). */
  getKeyUrl?: string;
  /** Short step hint shown next to the "Get key" link (e.g. "free · sign up → API keys"). */
  getKeyHint?: string;
}): JSX.Element {
  const masked = savedKey ? `${savedKey.slice(0, 7)}…${savedKey.slice(-4)}` : 'not set';
  return (
    <section className="rounded-2xl border border-divider bg-surface-elevated p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-on-surface">{title}</div>
        <code className="mono text-[10px] text-on-surface-muted">{masked}</code>
      </div>
      {getKeyUrl && (
        // T-X-101 — key 발급 가이드. Settings 사용성 ↑ (사용자 own key 정책이지만
        // 어디서 받는지 모르면 정책 자체가 막힘).
        <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[10px] text-on-surface-muted">
          <a
            href={getKeyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary hover:underline"
          >
            Get key →
          </a>
          {getKeyHint && <span>· {getKeyHint}</span>}
        </div>
      )}
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-divider bg-surface px-3 py-2 font-mono text-xs text-on-surface focus:border-primary focus:outline-none"
          autoComplete="off"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSave}
            className="rounded-full border border-divider bg-surface px-3 py-2 text-xs font-semibold text-on-surface hover:border-primary"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onTest}
            disabled={testing}
            className={clsx(
              'rounded-full bg-primary/15 px-3 py-2 text-xs font-semibold text-primary ring-1 ring-primary',
              testing && 'cursor-wait opacity-60',
            )}
          >
            {testing ? 'Testing…' : 'Test'}
          </button>
        </div>
      </div>
      <div className="mt-2 text-[10px] text-on-surface-muted">{helper}</div>
    </section>
  );
}

// T-X-102 — 비선택 provider 의 작은 hint card.
function CollapsedHint({ title, hint }: { title: string; hint: string }): JSX.Element {
  return (
    <section className="rounded-2xl border border-divider/40 bg-surface-elevated/40 px-4 py-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="text-on-surface-muted">{title}</div>
        <span className="text-[10px] uppercase tracking-widest text-on-surface-subtle">collapsed</span>
      </div>
      <div className="mt-0.5 text-[10px] text-on-surface-subtle">{hint}</div>
    </section>
  );
}

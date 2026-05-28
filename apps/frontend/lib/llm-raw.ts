// Phase S — raw LLM call helpers shared by Phase M (single outcome) and
// Phase S (discovery batch). Both providers, system + user prompts in/out.

export type LlmProvider = 'openai' | 'anthropic';

/** OpenAI Chat Completions — gpt-4o-mini with optional JSON-strict mode. */
export async function analyzeOpenAiRaw(
  key: string,
  system: string,
  user: string,
  jsonMode = false,
): Promise<string> {
  const body: Record<string, unknown> = {
    model: 'gpt-4o-mini',
    temperature: 0.2,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const j = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return j.choices[0]?.message.content ?? '';
}

/** Anthropic Messages — claude-3-5-sonnet. */
export async function analyzeAnthropicRaw(
  key: string,
  system: string,
  user: string,
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-latest',
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  }
  const j = (await res.json()) as {
    content: { type: string; text: string }[];
  };
  return j.content.find((c) => c.type === 'text')?.text ?? '';
}

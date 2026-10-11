// Shared AI access for hub + standalone tool servers.
// Providers tried in order: AbetAPI (ABET_API_KEY) → any OpenAI-compatible
// endpoint (OPENAI_API_KEY + optional OPENAI_BASE_URL/OPENAI_MODEL).
// When no key is configured, tools fall back to their deterministic engines.

const AB = {
  get key() { return process.env.ABET_API_KEY; },
  get base() { return process.env.ABET_API_BASE || 'https://api.abetworks.com/v1'; },
  get model() { return process.env.ABET_MODEL || 'abet-core'; },
};
const OA = {
  get key() { return process.env.OPENAI_API_KEY; },
  get base() { return process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'; },
  get model() { return process.env.OPENAI_MODEL || 'gpt-4o-mini'; },
};

export function aiAvailable() {
  return Boolean(AB.key || OA.key);
}

export async function aiText(system, user, { maxTokens = 800, timeoutMs = 30000 } = {}) {
  const provider = AB.key ? AB : OA.key ? OA : null;
  if (!provider) throw new Error('ai-not-configured');
  const res = await fetch(`${provider.base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${provider.key}` },
    body: JSON.stringify({
      model: provider.model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`ai-error:${res.status}`);
  const j = await res.json();
  const text = j?.choices?.[0]?.message?.content;
  if (!text) throw new Error('ai-empty-response');
  return text;
}

// JSON-mode helper for engines that need structured AI output.
export async function aiJson(system, user, opts = {}) {
  const raw = await aiText(
    `${system}\nReply with ONLY a valid JSON object, no prose, no code fences.`,
    user, opts,
  );
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('ai-not-json');
  return JSON.parse(raw.slice(start, end + 1));
}

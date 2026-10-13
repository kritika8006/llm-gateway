// Each provider: { name, call(prompt) -> { text, tokensIn, tokensOut } }. Node 20+ has global fetch.
export function geminiModel(model) {
  return {
    name: `gemini:${model}`,
    async call(prompt) {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`gemini ${r.status}`);
      const d = await r.json();
      return { text: d.candidates[0].content.parts[0].text,
        tokensIn: d.usageMetadata?.promptTokenCount ?? 0, tokensOut: d.usageMetadata?.candidatesTokenCount ?? 0 };
    },
  };
}

export const ollama = {
  name: 'ollama',
  async call(prompt) {
    const r = await fetch(`${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OLLAMA_MODEL || 'llama3.2', prompt, stream: false }),
      signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error(`ollama ${r.status}`);
    const d = await r.json();
    return { text: d.response, tokensIn: d.prompt_eval_count ?? 0, tokensOut: d.eval_count ?? 0 };
  },
};

// Try providers in order; first success wins. The router decides the order.
export async function callWithFallback(providers, prompt) {
  const errors = [];
  for (const p of providers) {
    const t0 = Date.now();
    try {
      const out = await p.call(prompt);
      return { ...out, provider: p.name, latencyMs: Date.now() - t0, fallbackFrom: errors.map(e => e.provider) };
    } catch (e) {
      errors.push({ provider: p.name, error: e.message });
    }
  }
  const err = new Error('all providers failed');
  err.details = errors;
  throw err;
}
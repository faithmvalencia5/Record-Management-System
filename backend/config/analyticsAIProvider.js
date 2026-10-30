const PROVIDERS = [
  {
    id: "groq",
    label: "Groq",
    apiKey: () => process.env.GROQ_API_KEY,
    model: () => process.env.GROQ_MODEL || "openai/gpt-oss-20b",
    url: "https://api.groq.com/openai/v1/chat/completions",
  },
  {
    id: "cerebras",
    label: "Cerebras",
    apiKey: () => process.env.CEREBRAS_API_KEY,
    model: () => process.env.CEREBRAS_MODEL || "gpt-oss-120b",
    url: "https://api.cerebras.ai/v1/chat/completions",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    apiKey: () => process.env.OPENROUTER_API_KEY,
    model: () => process.env.OPENROUTER_MODEL || "openrouter/free",
    url: "https://openrouter.ai/api/v1/chat/completions",
  },
];

function parseProviderJson(raw, expectedKeys) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Provider returned invalid JSON.");
  }

  const insights = parsed?.insights;
  if (!insights || typeof insights !== "object" || Array.isArray(insights)) {
    throw new Error('Provider response must contain an "insights" object.');
  }

  for (const key of expectedKeys) {
    if (typeof insights[key] !== "string" || !insights[key].trim()) {
      throw new Error(`Provider response is missing a valid "${key}" insight.`);
    }
  }
  return insights;
}

async function requestProvider(provider, metrics, prompt, expectedKeys, maxTokens) {
  const apiKey = provider.apiKey();
  if (!apiKey) throw new Error("API key is not configured.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(provider.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(provider.id === "openrouter" ? {
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://record-management-system-black.vercel.app",
          "X-Title": "OSCA Record Management System Analytics",
        } : {}),
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: provider.model(),
        messages: [
          {
            role: "system",
            content: `${prompt}\n\nReturn only valid JSON. Do not use markdown fences. The JSON must have one top-level "insights" object containing these string keys: ${expectedKeys.join(", ")}.`,
          },
          { role: "user", content: JSON.stringify(metrics) },
        ],
        temperature: 0.2,
        max_completion_tokens: maxTokens,
        response_format: { type: "json_object" },
      }),
    });

    const responseText = await response.text();
    let result = {};
    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch {
      throw new Error(`HTTP ${response.status}: provider returned an unreadable API response.`);
    }

    if (!response.ok) {
      const message = result.error?.message || result.message || `HTTP ${response.status}`;
      throw new Error(`HTTP ${response.status}: ${String(message).slice(0, 500)}`);
    }

    const choice = result.choices?.[0];
    if (choice?.finish_reason === "length") {
      throw new Error("Provider response reached its completion-token limit.");
    }
    const raw = choice?.message?.content || "";
    return {
      insights: parseProviderJson(raw, expectedKeys),
      provider: provider.id,
      model: result.model || provider.model(),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function generateAnalyticsInsights(metrics, prompt, expectedKeys, maxTokens = 2500) {
  const failures = [];
  for (const provider of PROVIDERS) {
    if (!provider.apiKey()) {
      failures.push(`${provider.label}: API key not configured`);
      continue;
    }
    try {
      const result = await requestProvider(provider, metrics, prompt, expectedKeys, maxTokens);
      if (provider.id !== "groq") {
        console.info(`[Analytics AI] Using backup provider ${provider.label} (${result.model}).`);
      }
      return result;
    } catch (error) {
      const message = error?.name === "AbortError" ? "request timed out" : error.message;
      failures.push(`${provider.label}: ${message}`);
      console.warn(`[Analytics AI] ${provider.label} failed; trying next provider: ${message}`);
    }
  }
  throw new Error(`All analytics AI providers failed. ${failures.join(" | ")}`);
}

module.exports = { generateAnalyticsInsights };

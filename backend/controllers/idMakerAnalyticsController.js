const CARD_KEYS = ["production", "barangay", "aging", "monthly"];
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const GEMINI_TIMEOUT_MS = 30000;

const SYSTEM_PROMPT = `You write short descriptive insights for the Queue Analytics page of the ID Maker Portal (Senior Citizens Bureau). You receive a JSON object of pre-computed statistics for one card. Describe only what the data shows: totals, percentages, rankings, distributions, and comparison with the previous period. Rules: Use only numbers that appear in the JSON. Never calculate, estimate, round differently, or invent a figure. Do not give recommendations, instructions, predictions, or causes. Do not use 'should', 'increase', 'prioritize', 'process', 'will', 'because', or 'due to'. Do not judge or evaluate; the status label is set by the system. If a field is null or missing, leave that clause out. If the JSON has no data, output exactly: 'No data available for this period.' Format: one sentence with the lead statistic wrapped in **double asterisks**, then one or two short supporting sentences, 45 words maximum. Output only the insight text.`;

const BANNED_WORDS = [
  "should", "increase", "prioritize", "process", "will", "because",
  "concerning", "poor", "recommend", "recommendation", "suggest",
  "predict", "prediction", "cause", "causes", "normal", "elevated", "high",
];

const INSIGHT_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const insightCache = new Map();
const insightInFlight = new Map();

function getCachedInsight(key) {
  const entry = insightCache.get(key);

  if (!entry) return null;

  if (Date.now() >= entry.expiresAt) {
    insightCache.delete(key);
    return null;
  }

  return entry.value;
}

function cacheInsight(key, value) {
  insightCache.set(key, {
    value,
    expiresAt: Date.now() + INSIGHT_CACHE_TTL_MS,
  });
}

function numericTokens(value, output = new Set()) {
  if (typeof value === "number" && Number.isFinite(value)) {
    output.add(String(value));
  } else if (typeof value === "string") {
    for (const match of value.matchAll(/\d[\d,]*(?:\.\d+)?%?/g)) {
      output.add(match[0].replaceAll(",", "").replace(/%$/, ""));
    }
  } else if (Array.isArray(value)) {
    value.forEach((entry) => numericTokens(entry, output));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((entry) => numericTokens(entry, output));
  }
  return output;
}

function validateInsight(text, stats) {
  if (typeof text !== "string") return "response was not text";
  const cleaned = text.trim();
  if (!cleaned || cleaned.length > 1200) return "response was empty or too long";
  if (cleaned === "No data available for this period.") return null;

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length > 45) return "response exceeded the 45-word limit";

  const boldLead = cleaned.match(/^\*\*(.+?)\*\*/)?.[1];
  if (!boldLead || boldLead !== stats.expectedLead) {
    return "bold lead statistic did not match the computed lead";
  }

  const lower = cleaned.toLowerCase();
  for (const banned of BANNED_WORDS) {
    const expression = new RegExp(`\\b${banned}\\b`, "i");
    if (expression.test(lower)) return `response contained the prohibited term: ${banned}`;
  }
  if (/\bdue\s+to\b/i.test(cleaned)) return "response contained a prohibited causal phrase";

  const allowedNumbers = numericTokens(stats);
  for (const match of cleaned.matchAll(/\d[\d,]*(?:\.\d+)?%?/g)) {
    const normalized = match[0].replaceAll(",", "").replace(/%$/, "");
    if (!allowedNumbers.has(normalized)) return `response introduced an unsupported number: ${match[0]}`;
  }
  return null;
}

function containsPersonalDataKey(value) {
  const sensitiveKeys = new Set([
    "id", "applicationid", "application_id", "applicant", "applicantname",
    "name", "firstname", "middlename", "surname", "address", "dob",
    "dateofbirth", "gender", "photo", "signature", "controlno",
  ]);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) =>
    sensitiveKeys.has(key.toLowerCase().replace(/[-_]/g, "")) || containsPersonalDataKey(child)
  );
}

const ALLOWED_CARD_FIELDS = {
  production: ["hasData", "previousPeriodComparison", "total", "active", "queued", "inProduction", "printed", "inTransit", "completed", "queuedPercent", "productionPercent", "printedPercent", "transitPercent", "completedPercent", "queuedElevatedThresholdPercent", "statusLabel", "expectedLead", "fallback"],
  barangay: ["hasData", "previousPeriodComparison", "total", "ranking", "topThreePercent", "elevatedThresholdPercent", "statusLabel", "expectedLead", "fallback"],
  aging: ["hasData", "previousPeriodComparison", "active", "within24", "within24Percent", "from24To48", "from24To48Percent", "over48", "over48Percent", "oldestAge", "unknownTimestamps", "thresholdsHours", "elevatedThresholdPercent", "highThresholdPercent", "statusLabel", "expectedLead", "fallback"],
  monthly: ["hasData", "months", "latestMonth", "latestCount", "previousMonth", "previousCount", "comparison", "previousPeriodComparison", "completedTotal", "monthCount", "averagePerMonth", "completedWithoutTimestamp", "elevatedWhenLatestBelowPrevious", "statusLabel", "expectedLead", "fallback"],
};

function sanitizeCardStats(cardKey, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const sanitized = {};
  for (const field of ALLOWED_CARD_FIELDS[cardKey]) {
    if (!(field in input)) continue;
    const value = input[field];
    if (field === "ranking") {
      sanitized.ranking = Array.isArray(value) ? value.slice(0, 3).map((entry) => ({
        barangay: String(entry?.barangay || "").slice(0, 100),
        count: Number.isFinite(entry?.count) ? entry.count : null,
        percent: Number.isFinite(entry?.percent) ? entry.percent : null,
      })) : [];
    } else if (field === "months") {
      sanitized.months = Array.isArray(value) ? value.slice(0, 12).map((entry) => ({
        label: String(entry?.label || "").slice(0, 30),
        count: Number.isFinite(entry?.count) ? entry.count : null,
      })) : [];
    } else if (["expectedLead", "fallback", "oldestAge", "latestMonth", "previousMonth", "statusLabel", "comparison"].includes(field)) {
      sanitized[field] = value == null ? null : String(value).slice(0, field === "fallback" ? 800 : 180);
    } else if (field === "previousPeriodComparison") {
      sanitized[field] = cardKey === "monthly" && value && typeof value === "object"
        ? {
          latestMonth: String(value.latestMonth || "").slice(0, 30),
          latestCount: Number.isFinite(value.latestCount) ? value.latestCount : null,
          previousMonth: String(value.previousMonth || "").slice(0, 30),
          previousCount: Number.isFinite(value.previousCount) ? value.previousCount : null,
          direction: String(value.direction || "").slice(0, 20),
        }
        : null;
    } else if (field === "thresholdsHours") {
      sanitized[field] = Array.isArray(value) ? value.slice(0, 2).filter(Number.isFinite) : [];
    } else if (field === "hasData" || field === "elevatedWhenLatestBelowPrevious") {
      sanitized[field] = value === true;
    } else if (value === null) {
      sanitized[field] = null;
    } else {
      sanitized[field] = Number.isFinite(value) ? value : null;
    }
  }
  return sanitized;
}

async function requestGemini(stats) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const model = GEMINI_MODEL.replace(/^models\//, "");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{
            role: "user",
            parts: [{ text: JSON.stringify(stats) }],
          }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 180,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: { insight: { type: "STRING" } },
              required: ["insight"],
              propertyOrdering: ["insight"],
            },
          },
        }),
      }
    );

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Gemini request failed (${response.status}): ${result.error?.message || "unknown API error"}`);
    }

    const text = result.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("") || "";
    const parsed = JSON.parse(text);
    return parsed.insight;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestGroq(stats) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: "openai/gpt-oss-20b",
          messages: [
            {
              role: "system",
              content: `${SYSTEM_PROMPT}\n\nReturn your answer as a JSON object with one property named "insight", whose value is the insight text.`,
            },
            {
              role: "user",
              content: JSON.stringify(stats),
            },
          ],
          temperature: 0,
          max_completion_tokens: 250,
          response_format: { type: "json_object" },
        }),
      }
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        `Groq request failed (${response.status}): ${
          result.error?.message || "unknown API error"
        }`
      );
    }

    const content = result.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(content);

    if (typeof parsed.insight !== "string") {
      throw new Error("Groq returned an invalid insight response.");
    }

    return parsed.insight;
  } finally {
    clearTimeout(timeout);
  }
}

const generateIdMakerAnalyticsInsights = async (req, res) => {
  const cards = req.body?.cards;
  if (!cards || typeof cards !== "object" || Array.isArray(cards)) {
    return res.status(400).json({ success: false, message: "Computed card statistics are required." });
  }

  const serialized = JSON.stringify(cards);
  if (serialized.length > 16000) {
    return res.status(413).json({ success: false, message: "Analytics statistics payload is too large." });
  }
  if (containsPersonalDataKey(cards)) {
    return res.status(400).json({ success: false, message: "Personal applicant fields are not allowed in analytics insight requests." });
  }

  const sanitizedCards = Object.fromEntries(CARD_KEYS.map((key) => [
    key,
    sanitizeCardStats(key, cards[key]),
  ]));

  const insights = {};
  await Promise.all(CARD_KEYS.map(async (cardKey) => {
    const stats = sanitizedCards[cardKey];
    if (!stats || stats.hasData !== true) {
      insights[cardKey] = {
        text: "No data available for this period.",
        source: "fallback",
      };
      return;
    }

    try {
      const cacheKey = `${cardKey}:${JSON.stringify(stats)}`;

      // Reuse a previous successful AI insight if the stats are unchanged.
      const cached = getCachedInsight(cacheKey);
      if (cached) {
        insights[cardKey] = { ...cached, cached: true };
        return;
      }

      // Share an in-progress request if another call has the same stats.
      let pending = insightInFlight.get(cacheKey);

      if (!pending) {
        pending = requestGemini(stats)
          .then((text) => ({
            text,
            provider: "gemini",
          }))
          .catch(async (geminiError) => {
            console.warn(
              `[ID Maker analytics] Gemini failed; trying Groq: ${geminiError.message}`
            );

            const text = await requestGroq(stats);

            return {
              text,
              provider: "groq",
            };
          })
          .then(({ text, provider }) => {
            const validationFailure = validateInsight(text, stats);

            if (validationFailure) {
              console.warn(
                `[ID Maker analytics] Rejected ${provider} insight: ${validationFailure}`
              );

              return {
                text: stats.fallback,
                source: "fallback",
                reason: validationFailure,
              };
            }

            const result = {
              text: text.trim(),
              source: "ai",
              provider,
            };

            cacheInsight(cacheKey, result);
            return result;
          })
          .finally(() => {
            insightInFlight.delete(cacheKey);
          });
      }

      insights[cardKey] = await pending;
    } catch (error) {
      const reason = error.name === "AbortError" ? "AI provider request timed out" : error.message;
      console.warn(`[ID Maker analytics] AI provider ${cardKey} insight failed: ${reason}`);
      insights[cardKey] = { text: stats.fallback, source: "fallback", reason };
    }
  }));

  return res.status(200).json({
    success: true,
    configured: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GROQ_API_KEY),
    model: GEMINI_MODEL,
    insights,
  });
};

module.exports = {
  generateIdMakerAnalyticsInsights,
  SYSTEM_PROMPT,
  validateInsight,
  containsPersonalDataKey,
  sanitizeCardStats,
};

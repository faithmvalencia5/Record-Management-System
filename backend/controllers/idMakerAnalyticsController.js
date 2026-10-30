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

function normalizeInsightLead(text, stats) {
  if (typeof text !== "string") return text;
  const expectedLead = typeof stats?.expectedLead === "string"
    ? stats.expectedLead.trim()
    : "";
  if (!expectedLead) return text.trim();

  // The lead statistic is computed by the server. Do not rely on the model
  // to reproduce it character-for-character; retain its supporting sentence.
  const supportingText = text.trim()
    .replace(/^\*\*[\s\S]*?\*\*\s*/, "")
    .trim();

  return supportingText
    ? `**${expectedLead}** ${supportingText}`
    : `**${expectedLead}**`;
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

async function requestGroqBatch(statsByCard) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

  const cardKeys = Object.keys(statsByCard);
  if (!cardKeys.length) return {};
  const properties = Object.fromEntries(cardKeys.map((key) => [key, { type: "string" }]));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [
          {
            role: "system",
            content: `You are a concise analytics reporting assistant. You will receive statistics for multiple ID Maker analytics cards. Return ONLY one valid JSON object, with no markdown fences or extra text, in exactly this shape: {"insights": {"cardKey": "insight text"}}. The insights object must contain exactly these keys and no others: ${cardKeys.join(", ")}. Every value must be a string.

For each card, describe only what that card's supplied statistics show. Use only numbers present in that card's input; never calculate, estimate, round, or invent numbers. Do not give recommendations, instructions, predictions, or causes. Do not use these words: should, increase, prioritize, process, will, because, concerning, poor, recommend, recommendation, suggest, predict, prediction, cause, causes, normal, elevated, high, or the phrase due to. Do not judge or evaluate. If a field is null or missing, omit that clause. If hasData is false, use exactly "No data available for this period." Otherwise write no more than 45 words, with the exact expectedLead value wrapped at the beginning in **double asterisks**. Keep each insight to one sentence where possible. Escape JSON string characters correctly. Do not include personal data.`
          },
          { role: "user", content: JSON.stringify(statsByCard) }
        ],
        temperature: 0,
        max_completion_tokens: 1200,
        response_format: {
          type: "json_object"
        }
      })
    });

    const responseText = await response.text();
    let result = {};
    try { result = responseText ? JSON.parse(responseText) : {}; }
    catch { throw new Error("Groq returned an invalid API response."); }

    if (!response.ok) {
      const message =
        result.error?.message ||
        result.message ||
        responseText ||
        "Unknown Groq API error";

      const failedGeneration = result.error?.failed_generation;

      const diagnostic =
        typeof failedGeneration === "string" && failedGeneration.trim()
          ? ` | failed_generation: ${failedGeneration.slice(0, 1200)}`
          : "";

      throw new Error(
        `Groq request failed (${response.status}): ${message}${diagnostic}`
      );
    }

    const choice = result.choices?.[0];
    if (choice?.finish_reason === "length") {
      throw new Error("Groq reached its completion-token limit before finishing the JSON response.");
    }

    const generatedContent = choice?.message?.content || "";
    let parsed;
    try {
      parsed = JSON.parse(generatedContent);
    } catch {
      throw new Error(`Groq returned malformed JSON (finish_reason: ${choice?.finish_reason || "unknown"}; response_preview: ${generatedContent.slice(0, 500)})`);
    }

    if (!parsed.insights || typeof parsed.insights !== "object" || Array.isArray(parsed.insights)) {
      throw new Error("Groq returned JSON without a valid insights object.");
    }

    const unexpectedKeys = Object.keys(parsed.insights).filter((key) => !cardKeys.includes(key));
    const missingKeys = cardKeys.filter((key) => typeof parsed.insights[key] !== "string");
    if (unexpectedKeys.length || missingKeys.length) {
      throw new Error(`Groq JSON keys mismatch (missing/non-string: ${missingKeys.join(", ") || "none"}; unexpected: ${unexpectedKeys.join(", ") || "none"}).`);
    }

    return Object.fromEntries(cardKeys.map((key) => [key, parsed.insights[key]]));
  } finally {
    clearTimeout(timeout);
  }
}

const generateIdMakerAnalyticsInsights = async (req, res) => {
  const cards = req.body?.cards;
  if (!cards || typeof cards !== "object" || Array.isArray(cards)) return res.status(400).json({ success: false, message: "Computed card statistics are required." });

  const serialized = JSON.stringify(cards);
  if (serialized.length > 16000) return res.status(413).json({ success: false, message: "Analytics statistics payload is too large." });
  if (containsPersonalDataKey(cards)) return res.status(400).json({ success: false, message: "Personal applicant fields are not allowed in analytics insight requests." });

  const sanitizedCards = Object.fromEntries(CARD_KEYS.map((key) => [key, sanitizeCardStats(key, cards[key])]));
  const batchCacheKey = `batch:${JSON.stringify(sanitizedCards)}`;
  let pending = insightInFlight.get(batchCacheKey);

  if (!pending) {
    pending = (async () => {
      const insights = {};
      const needsAI = {};

      for (const cardKey of CARD_KEYS) {
        const stats = sanitizedCards[cardKey];
        if (!stats || stats.hasData !== true) {
          insights[cardKey] = { text: stats?.fallback || "No data available for this period.", source: "fallback" };
          continue;
        }
        const cacheKey = `${cardKey}:${JSON.stringify(stats)}`;
        const cached = getCachedInsight(cacheKey);
        if (cached) insights[cardKey] = { ...cached, cached: true };
        else needsAI[cardKey] = { stats, cacheKey };
      }

      const cardKeys = Object.keys(needsAI);
      if (!cardKeys.length) return insights;

      const geminiResults = await Promise.all(cardKeys.map(async (cardKey) => {
        try {
          return { cardKey, text: await requestGemini(needsAI[cardKey].stats), provider: "gemini" };
        } catch (error) {
          console.warn(`[ID Maker analytics] Gemini failed for ${cardKey}; will use Groq batch fallback: ${error.message}`);
          return { cardKey, error };
        }
      }));

      const failedKeys = geminiResults.filter((item) => item.error).map((item) => item.cardKey);
      let groqInsights = {};
      if (failedKeys.length) {
        const failedStats = Object.fromEntries(failedKeys.map((key) => [key, needsAI[key].stats]));
        try { groqInsights = await requestGroqBatch(failedStats); }
        catch (error) { console.warn(`[ID Maker analytics] Groq batch fallback failed: ${error.message}`); }
      }

      for (const item of geminiResults) {
        const key = item.cardKey;
        const stats = needsAI[key].stats;
        const provider = item.provider || (typeof groqInsights[key] === "string" ? "groq" : null);
        const rawCandidate = item.provider ? item.text : groqInsights[key];
        const candidate = provider === "groq"
          ? normalizeInsightLead(rawCandidate, stats)
          : rawCandidate;
        const validationFailure = provider ? validateInsight(candidate, stats) : "AI providers did not return an insight";

        if (validationFailure) {
          insights[key] = { text: stats.fallback || "No data available for this period.", source: "fallback", reason: validationFailure };
          continue;
        }

        const result = { text: candidate.trim(), source: "ai", provider };
        cacheInsight(needsAI[key].cacheKey, result);
        insights[key] = result;
      }
      return insights;
    })().finally(() => insightInFlight.delete(batchCacheKey));
    insightInFlight.set(batchCacheKey, pending);
  }

  const insights = await pending;
  return res.status(200).json({
    success: true,
    configured: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GROQ_API_KEY),
    model: GEMINI_MODEL,
    insights
  });
};

module.exports = {
  generateIdMakerAnalyticsInsights,
  SYSTEM_PROMPT,
  validateInsight,
  containsPersonalDataKey,
  sanitizeCardStats,
};

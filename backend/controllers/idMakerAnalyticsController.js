const CARD_KEYS = ["production", "barangay", "aging", "monthly"];
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const INSIGHT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const insightCache = new Map();

let geminiQuotaUntil = 0;
let geminiQuotaWarningLogged = false;

function getGeminiQuotaCooldownMs(message = "") {
  const retry = message.match(/Please retry in\s+(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?/i);
  if (retry) {
    const ms = (Number(retry[1] || 0) * 3600 + Number(retry[2] || 0) * 60 + Number(retry[3] || 0)) * 1000;
    if (ms > 0) return ms + 30000;
  }
  return 60 * 60 * 1000;
}

function noteGeminiQuotaFailure(error) {
  const message = String(error?.message || error || "");
  const quotaFailure = /429|quota|rate.?limit|free.?tier.*requests/i.test(message);
  if (!quotaFailure) return { coolingDown: false, newlyLimited: false };

  if (Date.now() < geminiQuotaUntil) return { coolingDown: true, newlyLimited: false };
  geminiQuotaUntil = Date.now() + getGeminiQuotaCooldownMs(message);
  const newlyLimited = !geminiQuotaWarningLogged;
  geminiQuotaWarningLogged = true;
  return { coolingDown: true, newlyLimited };
}

function geminiQuotaIsCoolingDown() {
  if (Date.now() >= geminiQuotaUntil) {
    geminiQuotaUntil = 0;
    geminiQuotaWarningLogged = false;
    return false;
  }
  return true;
}


function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getCachedInsights(key) {
  const entry = insightCache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    insightCache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheInsights(key, value) {
  insightCache.set(key, { value, expiresAt: Date.now() + INSIGHT_CACHE_TTL_MS });
}

function containsPersonalDataKey(value) {
  const sensitiveKeys = new Set([
    "id", "applicationid", "applicant", "applicantname", "name",
    "firstname", "middlename", "surname", "address", "dob",
    "dateofbirth", "gender", "photo", "signature", "controlno",
  ]);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) =>
    sensitiveKeys.has(key.toLowerCase().replace(/[-_]/g, "")) ||
    containsPersonalDataKey(child)
  );
}

const ALLOWED_CARD_FIELDS = {
  production: ["hasData", "previousPeriodComparison", "total", "active", "queued", "inProduction", "printed", "inTransit", "completed", "queuedPercent", "productionPercent", "printedPercent", "transitPercent", "completedPercent", "queuedElevatedThresholdPercent", "statusLabel", "expectedLead", "fallback"],
  barangay: ["hasData", "previousPeriodComparison", "total", "ranking", "topThreePercent", "elevatedThresholdPercent", "statusLabel", "expectedLead", "fallback"],
  aging: ["hasData", "previousPeriodComparison", "active", "within24", "within24Percent", "from24To48", "from24To48Percent", "over48", "over48Percent", "oldestAge", "unknownTimestamps", "thresholdsHours", "elevatedThresholdPercent", "highThresholdPercent", "statusLabel", "expectedLead", "fallback"],
  monthly: ["hasData", "months", "latestMonth", "latestCount", "previousMonth", "previousCount", "comparison", "previousPeriodComparison", "completedTotal", "monthCount", "averagePerMonth", "completedWithoutTimestamp", "elevatedWhenLatestBelowPrevious", "statusLabel", "expectedLead", "fallback"],
};

function sanitizeCardStats(cardKey, input) {
  if (!plainObject(input)) return {};
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
    } else if (field === "previousPeriodComparison") {
      sanitized.previousPeriodComparison = cardKey === "monthly" && plainObject(value)
        ? {
            latestMonth: String(value.latestMonth || "").slice(0, 30),
            latestCount: Number.isFinite(value.latestCount) ? value.latestCount : null,
            previousMonth: String(value.previousMonth || "").slice(0, 30),
            previousCount: Number.isFinite(value.previousCount) ? value.previousCount : null,
            direction: String(value.direction || "").slice(0, 20),
          }
        : null;
    } else if (field === "thresholdsHours") {
      sanitized.thresholdsHours = Array.isArray(value) ? value.slice(0, 2).filter(Number.isFinite) : [];
    } else if (["expectedLead", "fallback", "oldestAge", "latestMonth", "previousMonth", "statusLabel", "comparison"].includes(field)) {
      sanitized[field] = value == null ? null : String(value).slice(0, field === "fallback" ? 800 : 180);
    } else if (field === "hasData" || field === "elevatedWhenLatestBelowPrevious") {
      sanitized[field] = value === true;
    } else if (value === null) {
      sanitized[field] = null;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      sanitized[field] = value;
    } else {
      sanitized[field] = null;
    }
  }
  return sanitized;
}

function sanitizeCards(input) {
  if (!plainObject(input)) throw new Error("Computed card statistics are required.");
  return Object.fromEntries(CARD_KEYS.map((key) => [key, sanitizeCardStats(key, input[key])]));
}

function fallbackInsight(cardKey, stats = {}) {
  if (typeof stats.fallback === "string" && stats.fallback.trim()) return stats.fallback.trim();

  const n = (key) => Number.isFinite(stats[key]) ? stats[key].toLocaleString() : "0";
  const text = {
    production: `The production queue contains ${n("total")} applications: ${n("queued")} queued, ${n("inProduction")} in production, ${n("printed")} printed, ${n("inTransit")} in transit, and ${n("completed")} completed.`,
    barangay: `The chart summarizes ${n("total")} applications across the leading barangay groups.`,
    aging: `The aging summary covers ${n("active")} active applications: ${n("within24")} within 24 hours, ${n("from24To48")} between 24 and 48 hours, and ${n("over48")} over 48 hours.`,
    monthly: `The monthly chart summarizes ${n("completedTotal")} completed IDs across ${n("monthCount")} months.`,
  };
  return text[cardKey] || "Analytics data is available for this panel.";
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
  } else if (plainObject(value)) {
    Object.values(value).forEach((entry) => numericTokens(entry, output));
  }
  return output;
}

function validateInsight(text, stats) {
  if (typeof text !== "string") return "response was not text";
  const candidate = text.trim();
  if (!candidate || candidate.length > 1000) return "response was empty or too long";

  const nums = candidate.match(/\d[\d,]*(?:\.\d+)?%?/g) || [];
  const allowed = numericTokens(stats);
  const unsupported = nums.find((value) =>
    !allowed.has(value.replaceAll(",", "").replace(/%$/, ""))
  );
  return unsupported ? `response introduced an unsupported number: ${unsupported}` : null;
}

async function requestGemini(metrics, prompt) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("Gemini API key is not configured.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL.replace(/^models\//, ""))}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: prompt }] },
          contents: [{ role: "user", parts: [{ text: JSON.stringify(metrics) }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 700,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                insights: {
                  type: "OBJECT",
                  properties: Object.fromEntries(CARD_KEYS.map((key) => [key, { type: "STRING" }])),
                  required: CARD_KEYS,
                },
              },
              required: ["insights"],
            },
          },
        }),
      }
    );

    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error?.message || `Gemini returned HTTP ${response.status}`);
    const raw = body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
    const parsed = JSON.parse(raw);
    if (!plainObject(parsed.insights)) throw new Error("Gemini returned an invalid insights object.");
    return parsed.insights;
  } finally {
    clearTimeout(timer);
  }
}

async function requestGroq(metrics, prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
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
            content: `${prompt}\n\nReturn only a JSON object with an "insights" property. The "insights" property must contain all four requested analytics keys, each with a string value.`,
          },
          { role: "user", content: JSON.stringify(metrics) },
        ],
        temperature: 0.2,
        max_completion_tokens: 1200,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "id_maker_analytics_insights",
            strict: true,
            schema: {
              type: "object",
              properties: {
                insights: {
                  type: "object",
                  properties: Object.fromEntries(CARD_KEYS.map((key) => [key, { type: "string" }])),
                  required: CARD_KEYS,
                  additionalProperties: false,
                },
              },
              required: ["insights"],
              additionalProperties: false,
            },
          },
        },
      }),
    });

    const responseText = await response.text();
    let result = {};
    try { result = responseText ? JSON.parse(responseText) : {}; }
    catch { throw new Error("Groq returned an invalid API response."); }

    if (!response.ok) {
      console.error("[ID Maker analytics] Groq API error:", responseText);
      throw new Error(result.error?.message || result.message || `Groq returned HTTP ${response.status}`);
    }

    const choice = result.choices?.[0];
    if (choice?.finish_reason === "length") throw new Error("Groq reached its completion-token limit.");
    const raw = choice?.message?.content || "";
    const parsed = JSON.parse(raw);
    if (!plainObject(parsed.insights)) throw new Error("Groq returned an invalid insights object.");
    return parsed.insights;
  } finally {
    clearTimeout(timer);
  }
}

async function generateIdMakerAnalyticsInsights(req, res) {
  try {
    if (!plainObject(req.body?.cards)) {
      return res.status(400).json({ success: false, message: "Computed card statistics are required." });
    }
    if (JSON.stringify(req.body.cards).length > 16000) {
      return res.status(413).json({ success: false, message: "Analytics statistics payload is too large." });
    }
    if (containsPersonalDataKey(req.body.cards)) {
      return res.status(400).json({ success: false, message: "Personal applicant fields are not allowed in analytics insight requests." });
    }

    const metrics = sanitizeCards(req.body.cards);
    const cacheKey = JSON.stringify(metrics);
    const cached = getCachedInsights(cacheKey);
    if (cached) {
      return res.json({ success: true, configured: true, cached: true, model: MODEL, insights: cached });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;
    if (!apiKey && !groqKey) {
      const insights = Object.fromEntries(CARD_KEYS.map((key) => [
        key, { text: fallbackInsight(key, metrics[key]), source: "fallback" },
      ]));
      return res.json({ success: true, configured: false, insights });
    }

    const prompt = "You write descriptive insights for an ID Maker queue analytics dashboard. Return JSON with an 'insights' object containing a short string for each provided analytics key: production, barangay, aging, and monthly. Use only supplied aggregate statistics. Do not invent numbers, infer causes, identify individuals, or make eligibility decisions. Use simple professional English, 1-2 sentences and at most 35 words per insight. Explain only what the data shows.";
    let generated = {};
    let provider = "gemini";

    try {
      if (!apiKey) throw new Error("Gemini API key is not configured.");
      if (geminiQuotaIsCoolingDown()) {
        throw new Error("Gemini quota cooldown is active; routing directly to Groq.");
      }
      generated = await requestGemini(metrics, prompt);
    } catch (geminiError) {
      const quotaState = noteGeminiQuotaFailure(geminiError);
      if (quotaState.newlyLimited) {
        console.warn(`[ID Maker analytics] Gemini quota/rate limit reached; temporarily routing requests directly to Groq: ${geminiError.message}`);
      } else if (!quotaState.coolingDown) {
        console.warn(`[ID Maker analytics] Gemini failed; trying Groq: ${geminiError.message}`);
      }
      generated = await requestGroq(metrics, prompt);
      provider = "groq";
    }

    const insights = {};
    for (const key of CARD_KEYS) {
      const candidate = typeof generated[key] === "string" ? generated[key].trim() : "";
      const validationFailure = candidate ? validateInsight(candidate, metrics[key]) : "AI did not return an insight";
      insights[key] = candidate && !validationFailure
        ? { text: candidate, source: provider }
        : { text: fallbackInsight(key, metrics[key]), source: "fallback", ...(validationFailure ? { reason: validationFailure } : {}) };
    }

    if (Object.values(insights).every((item) => item.source === "gemini" || item.source === "groq")) {
      cacheInsights(cacheKey, insights);
    }
    return res.json({ success: true, configured: true, model: MODEL, insights });
  } catch (error) {
    console.warn(`[ID Maker analytics] Insight generation failed: ${error.message}`);
    try {
      const metrics = sanitizeCards(req.body?.cards || {});
      const insights = Object.fromEntries(CARD_KEYS.map((key) => [
        key, { text: fallbackInsight(key, metrics[key]), source: "fallback" },
      ]));
      return res.json({
        success: true,
        configured: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GROQ_API_KEY),
        insights,
      });
    } catch (_) {
      return res.status(500).json({ success: false, message: "Unable to generate ID Maker analytics insights." });
    }
  }
}

module.exports = {
  generateIdMakerAnalyticsInsights,
  containsPersonalDataKey,
  sanitizeCardStats,
};

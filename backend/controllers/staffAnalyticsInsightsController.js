const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const KEYS = ["applicationFlow", "queueMix", "replacementRequests", "readyForHandoff", "barangayWorkload", "ageDistribution", "issuanceOverTime", "turnaroundTime"];

const INSIGHT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const insightCache = new Map();

function getCachedStaffInsights(key) {
  const entry = insightCache.get(key);

  if (!entry) return null;

  if (Date.now() >= entry.expiresAt) {
    insightCache.delete(key);
    return null;
  }

  return entry.value;
}

function cacheStaffInsights(key, value) {
  insightCache.set(key, {
    value,
    expiresAt: Date.now() + INSIGHT_CACHE_TTL_MS,
  });
}

function plainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function sanitizeMetrics(input) {
  if (!plainObject(input)) throw new Error("Aggregate analytics metrics are required.");
  const out = {};
  for (const key of KEYS) {
    const item = input[key];
    if (!plainObject(item)) continue;
    out[key] = {};
    for (const [field, value] of Object.entries(item)) {
      if (/name|applicant|application_?id|address|phone|email|birth|dob|signature|photo|document|control_?no/i.test(field)) continue;
      if (typeof value === "number" && Number.isFinite(value)) out[key][field] = value;
      else if (typeof value === "string" && value.length <= 80) out[key][field] = value;
      else if (Array.isArray(value)) {
        out[key][field] = value.slice(0, 12).map((entry) => {
          if (!plainObject(entry)) return (typeof entry === "string" && entry.length <= 50) || (typeof entry === "number" && Number.isFinite(entry)) ? entry : null;
          const clean = {};
          for (const [k, v] of Object.entries(entry)) {
            if (/name|applicant|application_?id|address|phone|email|birth|dob|signature|photo|document|control_?no/i.test(k)) continue;
            if ((typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.length <= 50)) clean[k] = v;
          }
          return clean;
        });
      }
    }
  }
  return out;
}

function fallback(key, m = {}) {
  const n = (k) => Number.isFinite(m[k]) ? m[k].toLocaleString() : "0";
  const text = {
    applicationFlow: `The chart summarizes ${n("submitted")} submitted applications, ${n("approved")} approved or completed applications, and ${n("rejected")} rejected applications.`,
    queueMix: `The current queue contains ${n("total")} applications: ${n("pending")} pending, ${n("review")} under review, ${n("approved")} approved or completed, and ${n("rejected")} rejected.`,
    replacementRequests: `There are ${n("total")} replacement requests: ${n("pending")} pending, ${n("inProcess")} in process, ${n("completed")} completed, and ${n("rejected")} rejected.`,
    readyForHandoff: `${n("ready")} applications are currently marked ready for handoff to the ID Maker workflow.`,
    barangayWorkload: `The chart summarizes ${n("total")} applications across ${n("barangayCount")} barangay groups.`,
    ageDistribution: `The age distribution covers ${n("total")} applications with a recorded age.`,
    issuanceOverTime: `${n("issued")} applications are counted as issued or completed in the current year's monthly chart.`,
    turnaroundTime: m.averageDays == null ? "A processing-time summary is unavailable because there are not enough valid dates." : `The average recorded turnaround time is ${m.averageDays} days across ${n("sampleSize")} applications with usable dates.`
  };
  return text[key] || "Analytics data is available for this panel.";
}

async function requestStaffGroq(metrics, prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

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
              content: `${prompt}\n\nReturn only a JSON object with an "insights" property. The "insights" property must contain all eight requested analytics keys, each with a string value.`,
            },
            {
              role: "user",
              content: JSON.stringify(metrics),
            },
          ],
          temperature: 0.2,
          max_completion_tokens: 1800,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "staff_analytics_insights",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  insights: {
                    type: "object",
                    properties: Object.fromEntries(
                      KEYS.map((key) => [key, { type: "string" }])
                    ),
                    required: KEYS,
                    additionalProperties: false,
                  },
                },
                required: ["insights"],
                additionalProperties: false,
              },
            },
          },
        }),
      }
    );

    const responseText = await response.text();

    let result = {};

    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch {
      throw new Error("Groq returned an invalid JSON response.");
    }

    if (!response.ok) {
      console.error("[Groq] Full API error response:", responseText);

      const errorMessage =
        result.error?.message ||
        result.message ||
        responseText ||
        "Unknown Groq API error";

      throw new Error(
        `Groq request failed (${response.status}): ${errorMessage}`
      );
    }

    const raw = result.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(raw);

    if (!plainObject(parsed.insights)) {
      throw new Error("Groq returned an invalid insights response.");
    }

    return parsed.insights;
  } finally {
    clearTimeout(timer);
  }
}

async function generateStaffAnalyticsInsights(req, res) {
  try {
    if (!plainObject(req.body?.metrics)) return res.status(400).json({ success: false, message: "Aggregate analytics metrics are required." });
    if (JSON.stringify(req.body.metrics).length > 30000) return res.status(413).json({ success: false, message: "Analytics payload is too large." });
    const metrics = sanitizeMetrics(req.body.metrics);
    const cacheKey = JSON.stringify(metrics);
    const cachedInsights = getCachedStaffInsights(cacheKey);

    if (cachedInsights) {
      return res.json({
        success: true,
        configured: true,
        cached: true,
        model: MODEL,
        insights: cachedInsights,
      });
    }
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey && !process.env.GROQ_API_KEY) {
      const insights = Object.fromEntries(
        KEYS.map(k => [
          k,
          { text: fallback(k, metrics[k]), source: "fallback" }
        ])
      );

      return res.json({ success: true, configured: false, insights });
    }

    const prompt = "You write descriptive insights for an OSCA staff dashboard about senior citizen ID applications. Return JSON with an 'insights' object containing a short string for each provided analytics key. Use only supplied aggregate statistics. Do not invent numbers, infer causes, identify individuals, or make eligibility decisions. Use simple professional English, 1-2 sentences and at most 35 words per insight. Explain only what the data shows.";
    let generated = {};
    let provider = "gemini";

    try {
      if (!apiKey) {
        throw new Error("Gemini API key is not configured");
      }
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 30000);

      let response;

      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            MODEL.replace(/^models\//, "")
          )}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            signal: abort.signal,
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: prompt }] },
              contents: [{
                role: "user",
                parts: [{ text: JSON.stringify(metrics) }],
              }],
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 700,
                responseMimeType: "application/json",
                responseSchema: {
                  type: "OBJECT",
                  properties: {
                    insights: {
                      type: "OBJECT",
                      properties: Object.fromEntries(
                        KEYS.map(k => [k, { type: "STRING" }])
                      ),
                    },
                  },
                  required: ["insights"],
                },
              },
            }),
          }
        );
      } finally {
        clearTimeout(timer);
      }

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          body.error?.message || `Gemini returned HTTP ${response.status}`
        );
      }

      const raw = body.candidates?.[0]?.content?.parts
        ?.map(p => p.text || "")
        .join("") || "";

      const parsed = JSON.parse(raw);
      generated = plainObject(parsed.insights) ? parsed.insights : {};

    } catch (geminiError) {
      console.warn(
        `[Staff analytics] Gemini failed; trying Groq: ${geminiError.message}`
      );

      generated = await requestStaffGroq(metrics, prompt);
      provider = "groq";
    }

    const insights = {};
    for (const key of KEYS) {
      const candidate = typeof generated[key] === "string" ? generated[key].trim() : "";
      const nums = candidate.match(/\d[\d,]*(?:\.\d+)?%?/g) || [];
      const allowed = new Set((JSON.stringify(metrics[key] || {}).match(/\d[\d,]*(?:\.\d+)?%?/g) || []).map(v => v.replaceAll(",", "")));
      const hasUnsupportedNumber = nums.some(v => !allowed.has(v.replaceAll(",", "")));
      insights[key] = candidate && candidate.length <= 1000 && !hasUnsupportedNumber
        ? { text: candidate, source: provider }
        : { text: fallback(key, metrics[key]), source: "fallback" };
    }
    if (Object.values(insights).every((item) => item.source === "gemini" || item.source === "groq")) {
      cacheStaffInsights(cacheKey, insights);
    }
    return res.json({ success: true, configured: true, model: MODEL, insights });
  } catch (error) {
    console.warn("[Staff analytics] Gemini insight generation failed:", error.message);
    try {
      const metrics = sanitizeMetrics(req.body?.metrics || {});
      const insights = Object.fromEntries(KEYS.map(k => [k, { text: fallback(k, metrics[k]), source: "fallback" }]));
      return res.json({ success: true, configured: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GROQ_API_KEY), insights });
    } catch (_) {
      return res.status(500).json({ success: false, message: "Unable to generate analytics insights." });
    }
  }
}

module.exports = { generateStaffAnalyticsInsights };

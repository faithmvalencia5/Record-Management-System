const KEYS = ["applicationFlow", "queueMix", "replacementRequests", "readyForHandoff", "barangayWorkload", "seniorRegistrationsByBarangay", "demographics", "ageDistribution", "issuanceOverTime", "turnaroundTime"];

const { generateAnalyticsInsights } = require("../config/analyticsAIProvider");
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
  insightCache.set(key, { value, expiresAt: Date.now() + INSIGHT_CACHE_TTL_MS });
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
    applicationFlow: `${n("submitted")} applications are represented in the current-year flow, with ${n("approved")} approved or completed and ${n("rejected")} rejected. Staff should review the pending-to-approved progression regularly and check whether unresolved applications are accumulating.`,
    queueMix: `${n("pending")} applications are pending and ${n("review")} are under review out of ${n("total")} records. This unresolved workload may slow the next processing stages; prioritize the oldest pending and review cases and update their statuses after action.`,
    replacementRequests: `${n("pending")} of ${n("total")} replacement requests are pending and ${n("inProcess")} are in process. Review requests that have not moved forward and confirm whether documents or staff action are holding them up.`,
    readyForHandoff: `${n("ready")} applications are marked ready for ID Maker handoff. Check that these records are complete and visible to the ID Maker team, then coordinate the next production batch.`,
    barangayWorkload: `${n("total")} applications are distributed across ${n("barangayCount")} barangay groups. Compare the leading barangays in the chart and monitor whether workload is becoming concentrated; coordinate review capacity if one area consistently dominates.`,
    seniorRegistrationsByBarangay: (() => { const top = Array.isArray(m.topBarangays) ? m.topBarangays : []; const sum = top.reduce((total,item)=>total+(Number(item.count)||0),0); const leader = top[0]; return leader ? `${leader.label} has the highest registration count among the six leading barangays, with ${n("total")} total registrations across ${n("barangayCount")} barangay groups. Compare the leading areas and plan outreach or review capacity around sustained concentrations.` : "There is not enough barangay-level data to identify a leading registration area. Check barangay completeness before using this chart for workload planning."; })(),
    demographics: `${n("knownTotal")} records have a recognized sex value: ${n("female")} female and ${n("male")} male, while ${n("unknown")} records have missing or unrecognized values. Use the distribution to understand the current applicant profile and improve completeness of demographic records before drawing broader conclusions.`,
    ageDistribution: `${n("total")} applications have a recorded age for this distribution. Use the largest age groups to plan service and validation workload, while checking records with missing age values for data completeness.`,
    issuanceOverTime: `${n("issued")} applications are counted as issued or completed in the current-year monthly chart. Compare the monthly bars to identify changes in output and review workflow capacity if completed IDs begin to decline.`,
    turnaroundTime: m.averageDays == null ? "A reliable turnaround-time estimate is not available because there are not enough records with valid submission and completion dates. Ensure these dates are recorded so processing delays can be monitored." : `The average recorded turnaround time is ${m.averageDays} days across ${n("sampleSize")} applications with usable dates. Review long-running cases individually and check which processing stage is taking the most time.`
  };
  return text[key] || "Analytics data is available for this panel.";
}

async function generateStaffAnalyticsInsights(req, res) {
  try {
    if (!plainObject(req.body?.metrics)) return res.status(400).json({ success: false, message: "Aggregate analytics metrics are required." });
    if (JSON.stringify(req.body.metrics).length > 30000) return res.status(413).json({ success: false, message: "Analytics payload is too large." });
    const metrics = sanitizeMetrics(req.body.metrics);
    const cacheKey = JSON.stringify(metrics);
    const cachedInsights = getCachedStaffInsights(cacheKey);

    if (cachedInsights) {
      return res.json({ success: true, configured: true, cached: true, insights: cachedInsights });
    }

    const prompt = "You are an operational decision-support analyst for an OSCA senior-citizen application dashboard. For each of the ten analytics keys, write a useful insight, not a chart description: identify a supported trend, imbalance, backlog, delay, data-quality issue, or opportunity; explain why it matters operationally; and give one practical staff action. Use a short heading followed by exactly 2 concise sentences, maximum 35 words total per insight. For seniorRegistrationsByBarangay, compare the six leading barangays and recommend a practical workload or outreach action. For demographics, describe the female/male distribution cautiously and flag missing values; never infer needs or eligibility from sex. Use only supplied metrics. Do not invent figures, causes, or personal details. If no issue is evident, give a useful finding and monitoring action. Write clear, plain professional English.";
    const result = await generateAnalyticsInsights(metrics, prompt, KEYS, 1200);
    const generated = result.insights;
    const provider = result.provider;

    const insights = {};
    for (const key of KEYS) {
      const candidate = typeof generated[key] === "string" ? generated[key].trim() : "";
      const nums = candidate.match(/\d[\d,]*(?:\.\d+)?%?/g) || [];
      const allowed = new Set((JSON.stringify(metrics[key] || {}).match(/\d[\d,]*(?:\.\d+)?%?/g) || []).map(v => v.replaceAll(",", "")));
      const hasUnsupportedNumber = nums.some(v => !allowed.has(v.replaceAll(",", "")));
      insights[key] = candidate && candidate.length <= 1400 && !hasUnsupportedNumber
        ? { text: candidate, source: provider }
        : { text: fallback(key, metrics[key]), source: "fallback" };
    }
    if (Object.values(insights).every((item) => ["groq", "cerebras", "openrouter"].includes(item.source))) {
      cacheStaffInsights(cacheKey, insights);
    }
    return res.json({ success: true, configured: true, provider, model: result.model, insights });
  } catch (error) {
    console.warn("[Staff analytics] Multi-provider decision-support insight generation failed:", error.message);
    try {
      const metrics = sanitizeMetrics(req.body?.metrics || {});
      const insights = Object.fromEntries(KEYS.map(k => [k, { text: fallback(k, metrics[k]), source: "fallback" }]));
      return res.json({ success: true, configured: Boolean(process.env.GROQ_API_KEY || process.env.CEREBRAS_API_KEY || process.env.OPENROUTER_API_KEY), insights });
    } catch (_) {
      return res.status(500).json({ success: false, message: "Unable to generate analytics insights." });
    }
  }
}

module.exports = { generateStaffAnalyticsInsights };

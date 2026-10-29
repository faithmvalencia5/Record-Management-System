# Run from the root of the Record-Management-System repository:
#   python apply_gemini_staff_analytics.py
# Makes backups of changed files and does not store an API key.

from pathlib import Path
import shutil

ROOT = Path.cwd()

def read_file(name):
    p = ROOT / name
    if not p.exists():
        raise FileNotFoundError(f"Missing {name}. Run this from the repository root.")
    return p.read_text(encoding="utf-8")

def write_file(name, content):
    p = ROOT / name
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.exists() and p.read_text(encoding="utf-8") == content:
        return
    if p.exists() and not p.with_suffix(p.suffix + ".bak").exists():
        shutil.copy2(p, p.with_suffix(p.suffix + ".bak"))
    p.write_text(content, encoding="utf-8")

controller_path = "backend/controllers/staffAnalyticsInsightsController.js"
controller = r'''const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const KEYS = ["applicationFlow", "queueMix", "replacementRequests", "readyForHandoff", "barangayWorkload", "ageDistribution", "issuanceOverTime", "turnaroundTime"];

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

async function generateStaffAnalyticsInsights(req, res) {
  try {
    if (!plainObject(req.body?.metrics)) return res.status(400).json({ success: false, message: "Aggregate analytics metrics are required." });
    if (JSON.stringify(req.body.metrics).length > 12000) return res.status(413).json({ success: false, message: "Analytics payload is too large." });
    const metrics = sanitizeMetrics(req.body.metrics);
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      const insights = Object.fromEntries(KEYS.map(k => [k, { text: fallback(k, metrics[k]), source: "fallback" }]));
      return res.json({ success: true, configured: false, insights });
    }

    const prompt = "You write descriptive insights for an OSCA staff dashboard about senior citizen ID applications. Return JSON with an 'insights' object containing a short string for each provided analytics key. Use only supplied aggregate statistics. Do not invent numbers, infer causes, identify individuals, or make eligibility decisions. Use simple professional English, 1-3 sentences and at most 55 words per insight. Explain what the data shows.";
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 12000);
    let response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL.replace(/^models\//, ""))}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        signal: abort.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: prompt }] },
          contents: [{ role: "user", parts: [{ text: JSON.stringify(metrics) }] }],
          generationConfig: {
            temperature: 0.2, maxOutputTokens: 700, responseMimeType: "application/json",
            responseSchema: { type: "OBJECT", properties: { insights: { type: "OBJECT", properties: Object.fromEntries(KEYS.map(k => [k, { type: "STRING" }])) } }, required: ["insights"] }
          }
        })
      });
    } finally { clearTimeout(timer); }

    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error?.message || `Gemini returned HTTP ${response.status}`);
    const raw = body.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    const parsed = JSON.parse(raw);
    const generated = plainObject(parsed.insights) ? parsed.insights : {};
    const insights = {};
    for (const key of KEYS) {
      const candidate = typeof generated[key] === "string" ? generated[key].trim() : "";
      const nums = candidate.match(/\d[\d,]*(?:\.\d+)?%?/g) || [];
      const allowed = new Set((JSON.stringify(metrics[key] || {}).match(/\d[\d,]*(?:\.\d+)?%?/g) || []).map(v => v.replaceAll(",", "")));
      const hasUnsupportedNumber = nums.some(v => !allowed.has(v.replaceAll(",", "")));
      insights[key] = candidate && candidate.length <= 1000 && !hasUnsupportedNumber
        ? { text: candidate, source: "gemini" }
        : { text: fallback(key, metrics[key]), source: "fallback" };
    }
    return res.json({ success: true, configured: true, model: MODEL, insights });
  } catch (error) {
    console.warn("[Staff analytics] Gemini insight generation failed:", error.message);
    try {
      const metrics = sanitizeMetrics(req.body?.metrics || {});
      const insights = Object.fromEntries(KEYS.map(k => [k, { text: fallback(k, metrics[k]), source: "fallback" }]));
      return res.json({ success: true, configured: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY), insights });
    } catch (_) {
      return res.status(500).json({ success: false, message: "Unable to generate analytics insights." });
    }
  }
}

module.exports = { generateStaffAnalyticsInsights };
'''
write_file(controller_path, controller)

route_path = "backend/routes/staffAnalyticsInsightsRoutes.js"
routes = r'''const express = require("express");
const router = express.Router();
const { generateStaffAnalyticsInsights } = require("../controllers/staffAnalyticsInsightsController");
router.post("/", generateStaffAnalyticsInsights);
module.exports = router;
'''
write_file(route_path, routes)

server_path = "backend/server.js"
server = read_file(server_path)
if "staffAnalyticsInsightsRoutes" not in server:
    anchor = 'const replacementRoutes = require("./routes/replacementRoutes");'
    mount = 'app.use("/api/replacements", replacementRoutes);'
    if anchor not in server or mount not in server:
        raise RuntimeError("Could not locate backend route registration anchors in backend/server.js")
    server = server.replace(anchor, anchor + '\nconst staffAnalyticsInsightsRoutes = require("./routes/staffAnalyticsInsightsRoutes");', 1)
    server = server.replace(mount, mount + '\napp.use("/api/analytics-insights", staffAnalyticsInsightsRoutes);', 1)
    write_file(server_path, server)

staff_path = "staff.js"
staff = read_file(staff_path)
marker = "// GEMINI STAFF ANALYTICS INSIGHTS - BEGIN"
if marker not in staff:
    frontend = r'''
// GEMINI STAFF ANALYTICS INSIGHTS - BEGIN
const STAFF_ANALYTICS_INSIGHTS_API = "https://management-backend-3cij.onrender.com/api/analytics-insights";
let staffAnalyticsInsightRequest = 0;

function staffAnalyticsStatus(app) {
  return typeof normalizeApplicationStatus === "function" ? normalizeApplicationStatus(app.status) : String(app.status || "pending").toLowerCase();
}
function staffAnalyticsDate(app, fields) {
  for (const field of fields) {
    if (!app?.[field]) continue;
    const d = new Date(app[field]);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}
function buildStaffAnalyticsMetrics(applications) {
  const apps = Array.isArray(applications) ? applications : [];
  const now = new Date();
  const labels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthlySubmitted = Array(12).fill(0), monthlyIssued = Array(12).fill(0);
  const status = { pending: 0, review: 0, approved: 0, rejected: 0, total: apps.length };
  const barangays = {};
  const ages = {"60–64":0,"65–69":0,"70–74":0,"75–79":0,"80–84":0,"85+":0};
  let ready = 0, issued = 0, turnaroundSum = 0, turnaroundCount = 0;
  for (const app of apps) {
    const s = staffAnalyticsStatus(app);
    if (s === "pending") status.pending++;
    else if (s === "review") status.review++;
    else if (["approved","ready","issued","completed"].includes(s)) status.approved++;
    else if (s === "rejected") status.rejected++;
    if (s === "ready") ready++;
    const created = staffAnalyticsDate(app, ["created_at","submitted_at","application_date"]);
    const updated = staffAnalyticsDate(app, ["status_updated_at","updated_at"]) || created;
    if (created && created.getFullYear() === now.getFullYear()) monthlySubmitted[created.getMonth()]++;
    if (["issued","completed"].includes(s)) {
      issued++;
      if (updated && updated.getFullYear() === now.getFullYear()) monthlyIssued[updated.getMonth()]++;
    }
    if (["approved","ready","issued","completed"].includes(s) && created && updated && updated >= created) {
      turnaroundSum += (updated - created) / 86400000;
      turnaroundCount++;
    }
    const barangay = String(app.barangay_district || "Unknown").trim() || "Unknown";
    barangays[barangay] = (barangays[barangay] || 0) + 1;
    const age = Number(app.age);
    if (Number.isFinite(age)) {
      if (age >= 60 && age <= 64) ages["60–64"]++;
      else if (age <= 69 && age >= 65) ages["65–69"]++;
      else if (age <= 74 && age >= 70) ages["70–74"]++;
      else if (age <= 79 && age >= 75) ages["75–79"]++;
      else if (age <= 84 && age >= 80) ages["80–84"]++;
      else if (age >= 85) ages["85+"]++;
    }
  }
  const requests = Array.isArray(replacementRequests) ? replacementRequests : [];
  const replacement = { total: requests.length, pending: 0, inProcess: 0, completed: 0, rejected: 0 };
  requests.forEach(r => {
    const s = String(r.request_status || "Pending").toLowerCase().trim();
    if (s === "pending") replacement.pending++;
    else if (["under review","in process","ready for release"].includes(s)) replacement.inProcess++;
    else if (s === "completed") replacement.completed++;
    else if (s === "rejected") replacement.rejected++;
  });
  return {
    applicationFlow: { submitted: monthlySubmitted.reduce((a,b)=>a+b,0), approved: status.approved, rejected: status.rejected, months: labels.map((label,i)=>({label,count:monthlySubmitted[i]})) },
    queueMix: status,
    replacementRequests: replacement,
    readyForHandoff: { ready, total: apps.length },
    barangayWorkload: { total: apps.length, barangayCount: Object.keys(barangays).length, topBarangays: Object.entries(barangays).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([label,count])=>({label,count})) },
    ageDistribution: { total: Object.values(ages).reduce((a,b)=>a+b,0), groups: Object.entries(ages).map(([label,count])=>({label,count})) },
    issuanceOverTime: { issued: monthlyIssued.reduce((a,b)=>a+b,0), months: labels.map((label,i)=>({label,count:monthlyIssued[i]})) },
    turnaroundTime: { averageDays: turnaroundCount ? Math.round(turnaroundSum / turnaroundCount * 10) / 10 : null, sampleSize: turnaroundCount }
  };
}
function ensureStaffAnalyticsInsightAreas() {
  const mappings = [["Application Flow","applicationFlow"],["Queue Mix","queueMix"],["Replacement Applications Analytics","replacementRequests"],["Ready for Handoff","readyForHandoff"],["Barangay Workload","barangayWorkload"],["Age Group Distribution","ageDistribution"],["ID Issuance Over Time","issuanceOverTime"],["Turnaround Time","turnaroundTime"]];
  const cards = Array.from(document.querySelectorAll(".an-card"));
  for (const [title,key] of mappings) {
    const card = cards.find(node => node.querySelector(".an-card__title")?.textContent.trim() === title);
    if (!card || card.querySelector(`[data-ai-insight="${key}"]`)) continue;
    const box = document.createElement("div");
    box.dataset.aiInsight = key;
    box.style.cssText = "margin:0 18px 18px;padding:12px 14px;border:1px solid var(--border-color,#dbe3ef);border-radius:12px;background:var(--surface-muted,rgba(100,116,139,.06));font-size:13px;line-height:1.55";
    box.innerHTML = '<div style="display:flex;gap:7px;align-items:center;font-weight:700;margin-bottom:5px"><span aria-hidden="true">✦</span> AI-Driven Insight <span data-ai-source style="margin-left:auto;font-size:10px;opacity:.7">DATA SUMMARY</span></div><div data-ai-text>Preparing insight from current analytics…</div>';
    card.appendChild(box);
  }
}
function displayStaffAnalyticsInsights(insights) {
  ensureStaffAnalyticsInsightAreas();
  for (const [key,value] of Object.entries(insights || {})) {
    const area = document.querySelector(`[data-ai-insight="${key}"]`);
    if (!area) continue;
    area.querySelector("[data-ai-text]").textContent = String(value?.text || "Insight is currently unavailable.");
    area.querySelector("[data-ai-source]").textContent = value?.source === "gemini" ? "GEMINI AI" : "DATA SUMMARY";
  }
}
async function requestStaffAnalyticsInsights(applications) {
  ensureStaffAnalyticsInsightAreas();
  const id = ++staffAnalyticsInsightRequest;
  const metrics = buildStaffAnalyticsMetrics(applications);
  const n = (v) => Number(v || 0).toLocaleString();
  const fallback = {
    applicationFlow: {text:`The chart summarizes ${n(metrics.applicationFlow.submitted)} submissions during the current year.`,source:"fallback"},
    queueMix: {text:`The current queue contains ${n(metrics.queueMix.total)} applications, including ${n(metrics.queueMix.pending)} pending and ${n(metrics.queueMix.rejected)} rejected.`,source:"fallback"},
    replacementRequests: {text:`There are ${n(metrics.replacementRequests.total)} replacement requests: ${n(metrics.replacementRequests.pending)} pending, ${n(metrics.replacementRequests.inProcess)} in process, ${n(metrics.replacementRequests.completed)} completed, and ${n(metrics.replacementRequests.rejected)} rejected.`,source:"fallback"},
    readyForHandoff: {text:`${n(metrics.readyForHandoff.ready)} applications are currently marked ready for handoff.`,source:"fallback"},
    barangayWorkload: {text:`The chart summarizes ${n(metrics.barangayWorkload.total)} applications across ${n(metrics.barangayWorkload.barangayCount)} barangay groups.`,source:"fallback"},
    ageDistribution: {text:`The age distribution includes ${n(metrics.ageDistribution.total)} applications with a recorded age.`,source:"fallback"},
    issuanceOverTime: {text:`${n(metrics.issuanceOverTime.issued)} applications are counted as issued or completed in the current year's monthly chart.`,source:"fallback"},
    turnaroundTime: {text:metrics.turnaroundTime.averageDays == null ? "A processing-time summary is unavailable because there are not enough valid dates." : `The average recorded turnaround time is ${metrics.turnaroundTime.averageDays} days across ${n(metrics.turnaroundTime.sampleSize)} applications.`,source:"fallback"}
  };
  displayStaffAnalyticsInsights(fallback);
  try {
    const response = await fetch(STAFF_ANALYTICS_INSIGHTS_API, {method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({metrics})});
    const result = await response.json();
    if (id !== staffAnalyticsInsightRequest) return;
    if (!response.ok || !result.success) throw new Error(result.message || "Insight request failed");
    displayStaffAnalyticsInsights(result.insights || {});
  } catch (error) {
    console.warn("Staff analytics insights:", error.message);
  }
}
// GEMINI STAFF ANALYTICS INSIGHTS - END

'''
    anchor = "async function loadReplacementRequests() {"
    if anchor not in staff:
        raise RuntimeError("Could not find loadReplacementRequests() in staff.js")
    staff = staff.replace(anchor, frontend + "\n" + anchor, 1)

    # Recompute insights after replacement data is refreshed.
    anchor2 = '''    replacementRequests = Array.isArray(result.requests)
      ? result.requests
      : [];
    updateReplacementAnalytics(replacementRequests);'''
    if anchor2 not in staff:
        raise RuntimeError("Could not find replacement request assignment in staff.js")
    staff = staff.replace(anchor2, anchor2 + '''

    if (typeof requestStaffAnalyticsInsights === "function") {
      requestStaffAnalyticsInsights(typeof LIVE_APPLICATIONS !== "undefined" ? LIVE_APPLICATIONS : []);
    }''', 1)

    # Recompute insights after the application analytics chart is updated.
    anchor3 = '''      updateLiveAnalyticsCharts(
        applications
      );'''
    if anchor3 in staff:
        staff = staff.replace(anchor3, anchor3 + '''

      if (typeof requestStaffAnalyticsInsights === "function") {
        requestStaffAnalyticsInsights(applications);
      }''', 1)
    else:
        print("Warning: could not locate updateLiveAnalyticsCharts call; insights will refresh after replacement requests load.")
    write_file(staff_path, staff)

html_path = "staff.html"
html = read_file(html_path)
if 'staff.js?v=gemini-analytics-1' not in html:
    html = html.replace('staff.js?v=30', 'staff.js?v=gemini-analytics-1')
    write_file(html_path, html)

print("Gemini Staff Analytics changes applied.")
print("Next: configure GEMINI_API_KEY in the backend host's environment variables, redeploy the backend, then deploy the frontend.")
print("Backups use the .bak suffix. Review the changes before deploying.")

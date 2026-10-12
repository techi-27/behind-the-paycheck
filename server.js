import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "site-data.json");
const PORT = Number(process.env.PORT || 3000);
const MAX_BODY = 18_000;
const ISSUE_IDS = new Set([
  "loans", "family", "tax", "unemployment", "notice-period",
  "immediate-joining", "offer-letter", "unpaid-salary",
  "work-pressure", "job-insecurity", "salary-growth", "other"
]);

let data = { visitsByDay: {}, stories: [] };
let writeQueue = Promise.resolve();

async function loadData() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    const parsed = JSON.parse(await readFile(DATA_FILE, "utf8"));
    data = {
      visitsByDay: parsed.visitsByDay && typeof parsed.visitsByDay === "object" ? parsed.visitsByDay : {},
      stories: Array.isArray(parsed.stories) ? parsed.stories : []
    };
  } catch (error) {
    if (error.code !== "ENOENT") console.error("Could not read site data:", error.message);
    await persist();
  }
}
function persist() {
  const snapshot = JSON.stringify(data, null, 2);
  writeQueue = writeQueue.then(() => writeFile(DATA_FILE, snapshot, "utf8"));
  return writeQueue;
}
function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(JSON.stringify(payload));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > MAX_BODY) {
        reject(Object.assign(new Error("Submission is too large."), { status: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); }
      catch { reject(Object.assign(new Error("Please submit valid form data."), { status: 400 })); }
    });
    req.on("error", reject);
  });
}
function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date);
}
function safeStory(story) {
  return {
    id: story.id,
    categoryIds: story.categoryIds,
    categoryLabels: story.categoryLabels,
    text: story.text,
    createdAt: story.createdAt,
    day: story.day
  };
}
function stats() {
  const today = dayKey();
  const visitsToday = data.visitsByDay[today] || 0;
  const storiesToday = data.stories.filter(s => s.day === today).length;
  const categoryCounts = {};
  for (const id of ISSUE_IDS) categoryCounts[id] = 0;
  for (const story of data.stories) {
    for (const id of story.categoryIds) categoryCounts[id] = (categoryCounts[id] || 0) + 1;
  }
  const daily = {};
  for (const [day, count] of Object.entries(data.visitsByDay)) {
    daily[day] = { visits: count, stories: 0 };
  }
  for (const story of data.stories) {
    daily[story.day] ||= { visits: data.visitsByDay[story.day] || 0, stories: 0 };
    daily[story.day].stories++;
  }
  const recentDays = Object.keys(daily).sort().slice(-14).map(day => ({ day, ...daily[day] }));
  return {
    today, visitsToday, storiesToday, totalVisits: Object.values(data.visitsByDay).reduce((a, b) => a + b, 0),
    totalStories: data.stories.length, categoryCounts, recentDays
  };
}
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".png": "image/png", ".jpg": "image/jpeg",
  ".webp": "image/webp", ".json": "application/json; charset=utf-8"
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (req.method === "GET" && url.pathname === "/api/stats") return json(res, 200, stats());
    if (req.method === "GET" && url.pathname === "/api/stories") {
      const category = url.searchParams.get("category");
      const filtered = data.stories.filter(s => !category || s.categoryIds.includes(category))
        .slice().reverse().slice(0, 100).map(safeStory);
      return json(res, 200, { stories: filtered, total: data.stories.length });
    }
    if (req.method === "POST" && url.pathname === "/api/visit") {
      // Counts page visits only. No account, cookie, IP address, or visitor identifier is stored.
      // Ignore browser prefetch/prerender requests, which are not meaningful page visits.
      const purpose = req.headers["sec-purpose"] || req.headers["purpose"] || "";
      if (/prefetch|prerender/i.test(purpose)) return json(res, 200, { ok: true, counted: false });
      const today = dayKey();
      data.visitsByDay[today] = (data.visitsByDay[today] || 0) + 1;
      await persist();
      return json(res, 200, { ok: true, counted: true, visitsToday: data.visitsByDay[today] });
    }
    if (req.method === "POST" && url.pathname === "/api/stories") {
      const body = await readBody(req);
      const text = typeof body.text === "string" ? body.text.trim() : "";
      const categoryIds = Array.isArray(body.categoryIds) ? [...new Set(body.categoryIds.filter(id => ISSUE_IDS.has(id)))] : [];
      if (!categoryIds.length) return json(res, 400, { error: "Select at least one issue." });
      if (text.length < 20) return json(res, 400, { error: "Please share at least 20 characters so your experience has context." });
      if (text.length > 3000) return json(res, 400, { error: "Please keep your story under 3,000 characters." });
      if (/<\/?[a-z][\s\S]*>/i.test(text)) return json(res, 400, { error: "HTML is not accepted in stories." });
      const now = new Date();
      const story = {
        id: crypto.randomUUID(),
        categoryIds,
        categoryLabels: categoryIds,
        text,
        createdAt: now.toISOString(),
        day: dayKey(now)
      };
      data.stories.push(story);
      await persist();
      return json(res, 201, { ok: true, story: safeStory(story), stats: stats() });
    }
    if (req.method === "GET" || req.method === "HEAD") {
      const requested = url.pathname === "/" ? "/index.html" : url.pathname;
      const decoded = decodeURIComponent(requested);
      const filePath = path.resolve(PUBLIC_DIR, "." + decoded);
      if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== path.join(PUBLIC_DIR, "index.html")) {
        return json(res, 403, { error: "Forbidden" });
      }
      let content;
      try { content = await readFile(filePath); }
      catch { content = await readFile(path.join(PUBLIC_DIR, "404.html")).catch(() => Buffer.from("Not found")); return res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" }).end(content); }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "DENY",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
      });
      return req.method === "HEAD" ? res.end() : res.end(content);
    }
    return json(res, 405, { error: "Method not allowed." });
  } catch (error) {
    if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : "Something went wrong. Please try again." });
    if (!error.status) console.error(error);
  }
});

await loadData();
server.listen(PORT, () => console.log(`Behind the Paycheck running at http://localhost:${PORT}`));

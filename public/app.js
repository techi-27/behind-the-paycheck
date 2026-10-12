const ISSUE_LABELS = {
  loans: "Loans & EMIs", family: "Family responsibilities", tax: "Tax & take-home pay", "health-costs": "Healthcare expenses", "housing-costs": "Rent & housing costs", caregiving: "Caregiving responsibilities", "unexpected-expenses": "Unexpected expenses", "mental-load": "Personal stress & wellbeing", "personal-uncertainty": "Uncertainty about the future", "other-it": "Other IT workplace struggles",
  unemployment: "Unemployment & layoffs", "notice-period": "Notice period",
  "immediate-joining": "Immediate joining pressure", "offer-letter": "Offer letter issues",
  "notice-joining": "Notice period vs. joining demand", "offer-mismatch": "Budget / offer mismatch",
  "no-feedback": "No interview outcome", "documents-early": "Early document requests",
  "unpaid-overtime": "Unpaid extra hours", "low-hike": "Zero or very low salary hike",
  "unpaid-salary": "Unpaid or delayed salary", "work-pressure": "Work pressure & burnout",
  "job-insecurity": "Job insecurity", "salary-growth": "Salary growth", other: "Other struggles"
};
const STORAGE_KEY = "btp-ui-demo-stories";
const EMPLOYER_ISSUES = ["notice-joining", "offer-mismatch", "no-feedback", "documents-early", "unpaid-overtime", "low-hike"];
const numberFormat = new Intl.NumberFormat("en-IN");
const byId = id => document.getElementById(id);
function readStories() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}
function writeStories(stories) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stories)); return true; }
  catch { return false; }
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function formatDate(iso) {
  try { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(iso)); }
  catch { return "Recently"; }
}
function setText(id, value) {
  const element = byId(id);
  if (element) element.textContent = value;
}
function updateStats(stories) {
  setText("visits-today", "—");
  setText("stories-today", String(stories.filter(story => new Date(story.createdAt).toDateString() === new Date().toDateString()).length));
  setText("stories-total", String(stories.length));
  const counts = {};
  stories.forEach(story => (story.categoryIds || []).forEach(category => counts[category] = (counts[category] || 0) + 1));
  Object.keys(ISSUE_LABELS).forEach(category => {
    const element = byId(`count-${category}`);
    if (element) element.innerHTML = `${numberFormat.format(counts[category] || 0)} <small>demo reports</small>`;
  });
}
function renderCompanyLeaderboard() {
  const container = byId("company-leaderboard");
  if (!container) return;
  const issue = byId("company-issue-filter")?.value || EMPLOYER_ISSUES[0];
  const stories = readStories();
  const counts = new Map();
  stories.forEach(story => {
    const company = String(story.company || "").trim();
    if (!company || !(story.categoryIds || []).includes(issue)) return;
    const key = company.toLocaleLowerCase("en-IN");
    const current = counts.get(key) || { name: company, count: 0 };
    current.count += 1;
    counts.set(key, current);
  });
  const ranked = [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  if (!ranked.length) {
    container.innerHTML = '<div class="leaderboard-empty"><strong>No company rankings for this issue yet</strong><p>Submit a browser demo report with a company name and this issue selected to preview the ranking. This is not a shared public leaderboard.</p></div>';
    return;
  }
  container.innerHTML = ranked.map((item, index) => `<div class="company-rank-row"><span class="rank-number">${index + 1}</span><span class="rank-company"><strong>${escapeHTML(item.name)}</strong><small>Employee-reported demo entries</small></span><span class="rank-count"><strong>${numberFormat.format(item.count)}</strong><small>reports</small></span></div>`).join("");
}
function renderStories() {
  const container = byId("stories-list");
  if (!container) return;
  const filter = byId("story-filter")?.value || "";
  const stories = readStories().filter(story => !filter || (story.categoryIds || []).includes(filter));
  if (!stories.length) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">✳</span><h3>No browser demo reports yet</h3><p>Try a submission to preview how stories will appear. It will stay in this browser and won't be sent to a server.</p><a href="#share-story" class="text-link">Try the demo form ↗</a></div>`;
    return;
  }
  container.innerHTML = stories.slice().reverse().map(story => {
    const labels = (story.categoryIds || []).map(id => `<span class="story-tag">${escapeHTML(ISSUE_LABELS[id] || id)}</span>`).join("");
    const companyLine = story.company ? `<p class="story-company">Company mentioned: ${escapeHTML(story.company)} · local demo only</p>` : "";
    return `<article class="story-card"><div class="story-card-head"><span class="anonymous-label"><span class="anon-avatar">D</span> Browser demo</span><time>${escapeHTML(formatDate(story.createdAt))}</time></div><div class="story-tags">${labels}</div>${companyLine}<p class="story-copy">${escapeHTML(story.text)}</p><div class="story-card-foot"><span>Saved only in this browser</span><span class="story-id">DEMO</span></div></article>`;
  }).join("");
}
function showDemoNotice() {
  const notice = document.createElement("div");
  notice.className = "demo-notice";
  notice.setAttribute("role", "status");
  notice.innerHTML = "<strong>Prototype mode:</strong> submissions are saved only in this browser. They are not uploaded, shared publicly, or collected into a central dashboard.";
  const header = document.querySelector(".site-header");
  if (header) header.insertAdjacentElement("afterend", notice);
}
document.addEventListener("DOMContentLoaded", () => {
  setText("year", String(new Date().getFullYear()));
  showDemoNotice();
  const textArea = byId("story-text");
  const form = byId("story-form");
  const message = byId("form-message");
  const submit = byId("submit-story");
  const refresh = () => { const stories = readStories(); updateStats(stories); renderStories(); renderCompanyLeaderboard(); };
  textArea?.addEventListener("input", () => setText("char-count", `${textArea.value.length} / 3000`));
  document.querySelectorAll(".issue-card").forEach(card => {
    card.addEventListener("click", () => {
      const checkbox = document.querySelector(`input[name="category"][value="${CSS.escape(card.dataset.category)}"]`);
      if (checkbox) checkbox.checked = !checkbox.checked;
      byId("share-story")?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (checkbox) checkbox.focus({ preventScroll: true });
    });
  });
  byId("story-filter")?.addEventListener("change", renderStories);
  byId("company-issue-filter")?.addEventListener("change", renderCompanyLeaderboard);
  form?.addEventListener("submit", event => {
    event.preventDefault();
    const categories = [...document.querySelectorAll('input[name="category"]:checked')].map(input => input.value);
    const text = textArea?.value.trim() || "";
    if (!categories.length) { message.className = "form-message error"; message.textContent = "Please select at least one issue."; return; }
    if (text.length < 20) { message.className = "form-message error"; message.textContent = "Please share at least 20 characters."; textArea?.focus(); return; }
    if (!byId("consent")?.checked) { message.className = "form-message error"; message.textContent = "Please confirm you understand the demo submission terms."; return; }
    submit.disabled = true;
    const company = byId("company-name")?.value.trim() || "";
    const story = { id: `demo-${Date.now()}`, categoryIds: categories, text, company, createdAt: new Date().toISOString() };
    const stories = readStories();
    stories.push(story);
    if (!writeStories(stories)) {
      message.className = "form-message error";
      message.textContent = "This browser couldn't save the demo. Check local storage settings and try again.";
      submit.disabled = false;
      return;
    }
    form.reset();
    setText("char-count", "0 / 3000");
    message.className = "form-message success";
    message.textContent = "Demo saved in this browser only. It has not been uploaded or published publicly.";
    refresh();
    submit.disabled = false;
  });
  refresh();
});

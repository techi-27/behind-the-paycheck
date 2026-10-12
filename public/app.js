const ISSUE_LABELS = {
  loans: "Loans & EMIs", family: "Family responsibilities", tax: "Tax & take-home pay",
  unemployment: "Unemployment & layoffs", "notice-period": "Notice period",
  "immediate-joining": "Immediate joining pressure", "offer-letter": "Offer letter issues",
  "unpaid-salary": "Unpaid or delayed salary", "work-pressure": "Work pressure & burnout",
  "job-insecurity": "Job insecurity", "salary-growth": "Salary growth", other: "Other struggles"
};
const numberFormat = new Intl.NumberFormat("en-IN");
const byId = id => document.getElementById(id);

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Could not complete the request.");
  return body;
}
function setText(id, value) {
  const element = byId(id);
  if (element) element.textContent = numberFormat.format(value ?? 0);
}
function renderStats(data) {
  setText("visits-today", data.visitsToday);
  setText("stories-today", data.storiesToday);
  setText("stories-total", data.totalStories);
  for (const [category, count] of Object.entries(data.categoryCounts || {})) {
    const element = byId(`count-${category}`);
    if (element) element.innerHTML = `${numberFormat.format(count)} <small>reports</small>`;
  }
}
function formatDate(iso) {
  try { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(iso)); }
  catch { return "Recently"; }
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function renderStories(stories) {
  const container = byId("stories-list");
  if (!container) return;
  if (!stories.length) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">✳</span><h3>No reports in this view yet</h3><p>As employees share their experiences, reports will appear here.</p><a href="#share-story" class="text-link">Share your experience ↗</a></div>`;
    return;
  }
  container.innerHTML = stories.map(story => {
    const labels = (story.categoryIds || []).map(id => `<span class="story-tag">${escapeHTML(ISSUE_LABELS[id] || id)}</span>`).join("");
    return `<article class="story-card"><div class="story-card-head"><span class="anonymous-label"><span class="anon-avatar">A</span> Anonymous employee</span><time>${escapeHTML(formatDate(story.createdAt))}</time></div><div class="story-tags">${labels}</div><p class="story-copy">${escapeHTML(story.text)}</p><div class="story-card-foot"><span>Employee-reported experience</span><span class="story-id">#${escapeHTML(String(story.id).slice(0, 6).toUpperCase())}</span></div></article>`;
  }).join("");
}
async function refreshStats() {
  try { renderStats(await api("/api/stats")); }
  catch {
    for (const id of ["visits-today", "stories-today", "stories-total"]) byId(id).textContent = "—";
  }
}
async function refreshStories() {
  try {
    const category = byId("story-filter")?.value || "";
    const result = await api(`/api/stories${category ? `?category=${encodeURIComponent(category)}` : ""}`);
    renderStories(result.stories);
  } catch {
    const container = byId("stories-list");
    if (container) container.innerHTML = `<div class="empty-state"><h3>Stories are temporarily unavailable</h3><p>Please refresh the page in a moment.</p></div>`;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  byId("year").textContent = new Date().getFullYear();
  const textArea = byId("story-text");
  textArea?.addEventListener("input", () => { byId("char-count").textContent = `${textArea.value.length} / 3000`; });

  document.querySelectorAll(".issue-card").forEach(card => {
    card.addEventListener("click", () => {
      const category = card.dataset.category;
      const checkbox = document.querySelector(`input[name="category"][value="${CSS.escape(category)}"]`);
      if (checkbox) checkbox.checked = !checkbox.checked;
      byId("share-story").scrollIntoView({ behavior: "smooth", block: "start" });
      if (checkbox) checkbox.focus({ preventScroll: true });
    });
  });
  byId("story-filter")?.addEventListener("change", refreshStories);

  // A page visit is counted without cookies or a persistent visitor identifier.
  try { await api("/api/visit", { method: "POST", body: "{}" }); } catch {}
  await Promise.all([refreshStats(), refreshStories()]);

  byId("story-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const message = byId("form-message");
    const submit = byId("submit-story");
    const categories = [...document.querySelectorAll('input[name="category"]:checked')].map(input => input.value);
    const text = textArea.value.trim();
    if (!categories.length) { message.className = "form-message error"; message.textContent = "Please select at least one issue."; return; }
    if (text.length < 20) { message.className = "form-message error"; message.textContent = "Please share at least 20 characters."; textArea.focus(); return; }
    if (!byId("consent").checked) { message.className = "form-message error"; message.textContent = "Please confirm you understand the public submission terms."; return; }
    submit.disabled = true;
    submit.innerHTML = "Submitting…";
    message.className = "form-message";
    message.textContent = "";
    try {
      await api("/api/stories", { method: "POST", body: JSON.stringify({ categoryIds: categories, text }) });
      byId("story-form").reset();
      byId("char-count").textContent = "0 / 3000";
      message.className = "form-message success";
      message.textContent = "Your story has been published anonymously. Thank you for contributing to the employee-reported picture.";
      await Promise.all([refreshStats(), refreshStories()]);
      byId("stories").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      message.className = "form-message error";
      message.textContent = error.message;
    } finally {
      submit.disabled = false;
      submit.innerHTML = 'Submit anonymously <span aria-hidden="true">↗</span>';
    }
  });
});

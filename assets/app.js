// AI Daily Digest — frontend
const DATA_DIR = "./data";
const THEME_KEY = "aidd:theme";

const els = {
  status: document.getElementById("status"),
  statusMessage: document.querySelector(".status-message"),
  summary: document.getElementById("summary"),
  summaryDate: document.getElementById("summary-date"),
  summaryStats: document.getElementById("summary-stats"),
  summaryHeadline: document.getElementById("summary-headline"),
  summaryText: document.getElementById("summary-text"),
  topPicks: document.getElementById("top-picks"),
  categoryTabs: document.getElementById("category-tabs"),
  categories: document.getElementById("categories"),
  dateSelect: document.getElementById("date-select"),
  prevDate: document.getElementById("prev-date"),
  nextDate: document.getElementById("next-date"),
  themeToggle: document.getElementById("theme-toggle"),
  installButton: document.getElementById("install-button"),
  updateBanner: document.getElementById("update-banner"),
  reloadButton: document.getElementById("reload-button"),
  cardTpl: document.getElementById("card-template"),
  categoryTpl: document.getElementById("category-template"),
};

let availableDates = [];
let currentDate = null;
let deferredInstallPrompt = null;

// === Theme ===
function applyTheme(theme) {
  if (theme === "dark" || theme === "light") {
    document.documentElement.dataset.theme = theme;
  } else {
    delete document.documentElement.dataset.theme;
  }
}
function toggleTheme() {
  const current = document.documentElement.dataset.theme;
  let next;
  if (!current) {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    next = prefersDark ? "light" : "dark";
  } else {
    next = current === "dark" ? "light" : "dark";
  }
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch {}
}
applyTheme((() => { try { return localStorage.getItem(THEME_KEY); } catch { return null; } })());
els.themeToggle.addEventListener("click", toggleTheme);

// === Status helpers ===
function showStatus(message, isError = false) {
  els.status.classList.remove("hidden");
  els.status.classList.toggle("error", isError);
  els.statusMessage.textContent = message;
  els.summary.classList.add("hidden");
  if (els.topPicks) els.topPicks.classList.add("hidden");
  if (els.categoryTabs) els.categoryTabs.classList.add("hidden");
  els.categories.innerHTML = "";
}
function hideStatus() { els.status.classList.add("hidden"); }

// === Fetch ===
async function fetchJSON(url, { cache = "default" } = {}) {
  const bust = cache === "no-store" ? `?t=${Date.now()}` : "";
  const res = await fetch(url + bust, { cache });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

// === Date utilities ===
function formatDateJa(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const w = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  return `${y}年${m}月${d}日 (${w})`;
}

// === Index loading ===
async function loadIndex() {
  try {
    const data = await fetchJSON(`${DATA_DIR}/index.json`, { cache: "no-store" });
    availableDates = (data.entries || []).map((e) => e.date).filter(Boolean);
    populateDateSelect(data.entries || []);
    return data;
  } catch (err) {
    console.error("loadIndex failed", err);
    return null;
  }
}

function populateDateSelect(entries) {
  els.dateSelect.innerHTML = "";
  if (entries.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(まだデータがありません)";
    els.dateSelect.appendChild(opt);
    return;
  }
  for (const entry of entries) {
    const opt = document.createElement("option");
    opt.value = entry.date;
    const label = formatDateJa(entry.date);
    opt.textContent = entry.item_count
      ? `${label} ・ ${entry.item_count}件`
      : label;
    els.dateSelect.appendChild(opt);
  }
}

function updateDateNav() {
  const idx = availableDates.indexOf(currentDate);
  els.prevDate.disabled = idx < 0 || idx >= availableDates.length - 1;
  els.nextDate.disabled = idx <= 0;
  if (idx >= 0) els.dateSelect.value = currentDate;
}

// === Day rendering ===
function categoryFallbackLabel(id) {
  return {
    new_models: "新モデル・新発表",
    // 旧 ID（schema_version 1.x）
    tools: "ツール・SDK",
    research: "研究・論文",
    industry: "業界動向",
    // 新 ID（schema_version 2.x）
    tools_apps: "ツール・アプリ・SDK",
    agents: "エージェント・自律実行",
    multimodal: "マルチモーダル・生成",
    research_papers: "研究・論文",
    industry_business: "業界動向・ビジネス",
    regulation_policy: "規制・政策・安全",
    community_buzz: "コミュニティ反響",
    japan: "日本語ソース",
    china: "中華圏",
  }[id] || id;
}

const CATEGORY_ORDER = [
  "new_models",
  "tools_apps", "tools",
  "agents",
  "multimodal",
  "research_papers", "research",
  "industry_business", "industry",
  "regulation_policy",
  "community_buzz",
  "japan",
  "china",
];

function sortCategoriesForDisplay(categories) {
  return [...categories].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.id);
    const bi = CATEGORY_ORDER.indexOf(b.id);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });
}

function buildItemIndex(categories) {
  const idx = new Map();
  for (const cat of categories || []) {
    for (const item of (cat.items || [])) {
      idx.set(item.id, { ...item, _category: cat.id });
    }
  }
  return idx;
}

function scoreClass(total) {
  if (total >= 17) return "high";
  if (total >= 13) return "mid";
  return "low";
}

// === Figure rendering ===
const FIGURE_TONES = ["default", "primary", "success", "warning", "danger", "info"];

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function safeTone(t) {
  return FIGURE_TONES.includes(t) ? t : "default";
}

function renderSummaryCard(d) {
  const wrap = document.createElement("div");
  wrap.className = "fig-summary";

  const headline = (d.headline ?? "").trim();
  if (headline) {
    const h = document.createElement("div");
    h.className = "fig-summary-headline";
    h.textContent = headline;
    wrap.appendChild(h);
  }

  const tldr = (d.tldr ?? "").trim();
  if (tldr) {
    const t = document.createElement("div");
    t.className = "fig-summary-tldr";
    t.innerHTML = `<span class="fig-section-label">TL;DR</span><p class="fig-tldr-text">${escapeHtml(tldr)}</p>`;
    wrap.appendChild(t);
  }

  const points = Array.isArray(d.points) ? d.points.slice(0, 6) : [];
  if (points.length) {
    const detailsWrap = document.createElement("div");
    detailsWrap.className = "fig-summary-details";
    const lbl = document.createElement("span");
    lbl.className = "fig-section-label";
    lbl.textContent = "詳細";
    detailsWrap.appendChild(lbl);

    const list = document.createElement("ul");
    list.className = "fig-summary-points";
    for (const p of points) {
      const li = document.createElement("li");
      li.className = `fig-summary-point fig-tone-${safeTone(p.tone)}`;
      const icon = p.icon
        ? `<span class="fig-point-icon" aria-hidden="true">${escapeHtml(p.icon)}</span>`
        : `<span class="fig-point-icon fig-point-icon-empty" aria-hidden="true"></span>`;
      const note = p.note ? `<span class="fig-point-note">${escapeHtml(p.note)}</span>` : "";
      const description = p.description ? `<p class="fig-point-description">${escapeHtml(p.description)}</p>` : "";
      li.innerHTML = `
        ${icon}
        <div class="fig-point-body">
          <div class="fig-point-headline">
            <span class="fig-point-label">${escapeHtml(p.label ?? "")}</span>
            <span class="fig-point-value">${escapeHtml(p.value ?? "")}</span>
          </div>
          ${note}
          ${description}
        </div>`;
      list.appendChild(li);
    }
    detailsWrap.appendChild(list);
    wrap.appendChild(detailsWrap);
  }

  const context = (d.context ?? "").trim();
  if (context) {
    const c = document.createElement("div");
    c.className = "fig-summary-context";
    c.innerHTML = `<span class="fig-section-label">背景</span><p class="fig-context-text">${escapeHtml(context)}</p>`;
    wrap.appendChild(c);
  }

  const impact = (d.impact ?? "").trim();
  if (impact) {
    const im = document.createElement("div");
    im.className = "fig-summary-impact";
    im.innerHTML = `<span class="fig-section-label fig-section-label-impact">影響</span><p class="fig-impact-text">${escapeHtml(impact)}</p>`;
    wrap.appendChild(im);
  }

  return wrap;
}

function renderTextBlock(text, label, blockClass, labelClass = "fig-section-label") {
  if (!text || !text.trim()) return null;
  const wrap = document.createElement("div");
  wrap.className = blockClass;
  if (label) {
    const lbl = document.createElement("span");
    lbl.className = labelClass;
    lbl.textContent = label;
    wrap.appendChild(lbl);
  }
  const p = document.createElement("p");
  p.className = `${blockClass}-text`;
  p.textContent = text.trim();
  wrap.appendChild(p);
  return wrap;
}

function clampPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function renderComparison(d) {
  const wrap = document.createElement("div");
  wrap.className = "fig-cmp";

  const headline = (d.headline ?? "").trim();
  if (headline) {
    const h = document.createElement("div");
    h.className = "fig-cmp-headline";
    h.textContent = headline;
    wrap.appendChild(h);
  }

  const before = d.before || {};
  const after = d.after || {};
  const legend = document.createElement("div");
  legend.className = "fig-cmp-legend";
  legend.innerHTML = `
    <div class="fig-cmp-side fig-cmp-side-before">
      <span class="fig-cmp-side-tag">Before</span>
      <span class="fig-cmp-side-name">${escapeHtml(before.label || "")}</span>
      ${before.sublabel ? `<span class="fig-cmp-side-sub">${escapeHtml(before.sublabel)}</span>` : ""}
    </div>
    <span class="fig-cmp-arrow" aria-hidden="true">→</span>
    <div class="fig-cmp-side fig-cmp-side-after">
      <span class="fig-cmp-side-tag">After</span>
      <span class="fig-cmp-side-name">${escapeHtml(after.label || "")}</span>
      ${after.sublabel ? `<span class="fig-cmp-side-sub">${escapeHtml(after.sublabel)}</span>` : ""}
    </div>`;
  wrap.appendChild(legend);

  const metrics = Array.isArray(d.metrics) ? d.metrics.slice(0, 6) : [];
  if (metrics.length) {
    const list = document.createElement("ul");
    list.className = "fig-cmp-metrics";
    for (const m of metrics) {
      const li = document.createElement("li");
      const tone = safeTone(m.delta_tone);
      li.className = `fig-cmp-metric fig-tone-${tone}`;
      const beforePct = clampPct(m.before_pct);
      const afterPct = clampPct(m.after_pct);
      const beforeBar = beforePct == null ? 50 : beforePct;
      const afterBar = afterPct == null ? 50 : afterPct;
      const icon = m.icon ? `<span class="fig-cmp-icon" aria-hidden="true">${escapeHtml(m.icon)}</span>` : "";
      const delta = m.delta
        ? `<span class="fig-cmp-delta">${escapeHtml(m.delta)}</span>`
        : "";
      const note = m.note
        ? `<div class="fig-cmp-note">${escapeHtml(m.note)}</div>`
        : "";
      li.innerHTML = `
        <div class="fig-cmp-head">
          ${icon}
          <span class="fig-cmp-label">${escapeHtml(m.label || "")}</span>
          ${delta}
        </div>
        <div class="fig-cmp-bar-row fig-cmp-bar-row-before">
          <span class="fig-cmp-bar-name">${escapeHtml(before.label || "Before")}</span>
          <div class="fig-cmp-bar"><span class="fig-cmp-bar-fill fig-cmp-bar-fill-before" style="width:${beforeBar}%"></span></div>
          <span class="fig-cmp-bar-value">${escapeHtml(m.before || "")}</span>
        </div>
        <div class="fig-cmp-bar-row fig-cmp-bar-row-after">
          <span class="fig-cmp-bar-name">${escapeHtml(after.label || "After")}</span>
          <div class="fig-cmp-bar"><span class="fig-cmp-bar-fill fig-cmp-bar-fill-after" style="width:${afterBar}%"></span></div>
          <span class="fig-cmp-bar-value">${escapeHtml(m.after || "")}</span>
        </div>
        ${note}`;
      list.appendChild(li);
    }
    wrap.appendChild(list);
  }

  const narrative = renderTextBlock(d.narrative, "背景", "fig-narrative");
  if (narrative) wrap.appendChild(narrative);
  const impact = renderTextBlock(d.impact, "影響", "fig-impact", "fig-section-label fig-section-label-impact");
  if (impact) wrap.appendChild(impact);

  return wrap;
}

function renderMetricBars(d) {
  const wrap = document.createElement("div");
  wrap.className = "fig-mb";

  const headline = (d.headline ?? "").trim();
  if (headline) {
    const h = document.createElement("div");
    h.className = "fig-mb-headline";
    h.textContent = headline;
    wrap.appendChild(h);
  }

  const scale = d.scale && (d.scale.max_label || d.scale.unit);
  if (scale) {
    const s = document.createElement("div");
    s.className = "fig-mb-scale";
    const parts = [];
    if (d.scale.max_label) parts.push(`スケール: ${d.scale.max_label}`);
    if (d.scale.unit) parts.push(`単位: ${d.scale.unit}`);
    s.textContent = parts.join(" ・ ");
    wrap.appendChild(s);
  }

  const bars = Array.isArray(d.bars) ? d.bars.slice(0, 7) : [];
  if (bars.length) {
    const list = document.createElement("ul");
    list.className = "fig-mb-bars";
    for (const b of bars) {
      const li = document.createElement("li");
      const tone = safeTone(b.tone || "primary");
      li.className = `fig-mb-bar fig-tone-${tone}`;
      const pct = clampPct(b.pct) ?? 0;
      const basePct = clampPct(b.baseline_pct);
      const icon = b.icon ? `<span class="fig-mb-icon" aria-hidden="true">${escapeHtml(b.icon)}</span>` : "";
      const baseline = basePct != null
        ? `<span class="fig-mb-baseline" style="left:${basePct}%" aria-hidden="true"></span>
           <span class="fig-mb-baseline-tag" style="left:${basePct}%" title="${escapeHtml(b.baseline_label || "比較基準")}: ${basePct}">${escapeHtml(b.baseline_label || "基準")}</span>`
        : "";
      const delta = b.delta ? `<span class="fig-mb-delta">${escapeHtml(b.delta)}</span>` : "";
      const note = b.note ? `<span class="fig-mb-note">${escapeHtml(b.note)}</span>` : "";
      li.innerHTML = `
        <div class="fig-mb-head">
          ${icon}
          <span class="fig-mb-label">${escapeHtml(b.label || "")}</span>
          <span class="fig-mb-value">${escapeHtml(b.value || "")}</span>
        </div>
        <div class="fig-mb-track">
          <span class="fig-mb-fill" style="width:${pct}%"></span>
          ${baseline}
        </div>
        ${delta || note ? `<div class="fig-mb-meta">${delta}${note}</div>` : ""}`;
      list.appendChild(li);
    }
    wrap.appendChild(list);
  }

  const narrative = renderTextBlock(d.narrative, "背景", "fig-narrative");
  if (narrative) wrap.appendChild(narrative);
  const impact = renderTextBlock(d.impact, "影響", "fig-impact", "fig-section-label fig-section-label-impact");
  if (impact) wrap.appendChild(impact);

  return wrap;
}

function renderTimeline(d) {
  const wrap = document.createElement("div");
  wrap.className = "fig-tl";

  const headline = (d.headline ?? "").trim();
  if (headline) {
    const h = document.createElement("div");
    h.className = "fig-tl-headline";
    h.textContent = headline;
    wrap.appendChild(h);
  }

  const events = Array.isArray(d.events) ? d.events.slice(0, 7) : [];
  if (events.length) {
    const list = document.createElement("ol");
    list.className = "fig-tl-events";
    for (const ev of events) {
      const li = document.createElement("li");
      const status = ["past", "now", "upcoming"].includes(ev.status) ? ev.status : "past";
      const tone = safeTone(ev.tone || (status === "now" ? "primary" : "default"));
      li.className = `fig-tl-event fig-tl-status-${status} fig-tone-${tone}`;
      const desc = ev.description
        ? `<p class="fig-tl-desc">${escapeHtml(ev.description)}</p>`
        : "";
      li.innerHTML = `
        <span class="fig-tl-marker" aria-hidden="true"></span>
        <div class="fig-tl-body">
          <div class="fig-tl-meta">
            <span class="fig-tl-when">${escapeHtml(ev.when || "")}</span>
            ${status === "now" ? '<span class="fig-tl-now-badge">本日</span>' : ""}
          </div>
          <div class="fig-tl-label">${escapeHtml(ev.label || "")}</div>
          ${desc}
        </div>`;
      list.appendChild(li);
    }
    wrap.appendChild(list);
  }

  const narrative = renderTextBlock(d.narrative, "背景", "fig-narrative");
  if (narrative) wrap.appendChild(narrative);
  const impact = renderTextBlock(d.impact, "影響", "fig-impact", "fig-section-label fig-section-label-impact");
  if (impact) wrap.appendChild(impact);

  return wrap;
}

const FIGURE_RENDERERS = {
  "summary-card": renderSummaryCard,
  "comparison": renderComparison,
  "metric-bars": renderMetricBars,
  "timeline": renderTimeline,
};

function renderFigure(figure, mountEl) {
  if (!figure || !figure.type) return false;
  const renderer = FIGURE_RENDERERS[figure.type];
  if (!renderer) return false;
  const body = mountEl.querySelector(".figure-body");
  const caption = mountEl.querySelector(".figure-caption");
  if (!body || !caption) return false;
  try {
    body.replaceChildren(renderer(figure.data || {}));
    caption.textContent = figure.caption || "";
    if (!figure.caption) caption.classList.add("hidden");
    else caption.classList.remove("hidden");
    mountEl.setAttribute("aria-label", figure.alt || figure.caption || "図解");
    mountEl.dataset.figureType = figure.type;
    mountEl.removeAttribute("hidden");
    return true;
  } catch (err) {
    console.warn("figure render failed", figure.type, err);
    return false;
  }
}

function articleAnchorId(itemId) {
  return `article-${(itemId || "").replace(/[^\w\-]/g, "")}`;
}

function expandCard(card) {
  if (!card || card.dataset.expanded === "true") return;
  card.dataset.expanded = "true";
  const toggle = card.querySelector(".card-toggle");
  if (toggle) toggle.setAttribute("aria-expanded", "true");
}

function collapseCard(card) {
  if (!card || card.dataset.expanded === "false") return;
  card.dataset.expanded = "false";
  const toggle = card.querySelector(".card-toggle");
  if (toggle) toggle.setAttribute("aria-expanded", "false");
}

function renderCard(item) {
  const node = els.cardTpl.content.firstElementChild.cloneNode(true);
  node.dataset.itemId = item.id || "";
  node.dataset.expanded = "false";
  if (item.id) node.id = articleAnchorId(item.id);
  const toggle = node.querySelector(".card-toggle");
  if (toggle) toggle.setAttribute("aria-expanded", "false");
  const titleEl = node.querySelector(".card-title");
  const titleJaEl = node.querySelector(".card-title-ja");
  const lang = (item.lang || "").toLowerCase();
  node.dataset.lang = lang || "en";
  const hasTitleJa = typeof item.title_ja === "string" && item.title_ja.trim().length > 0;
  const titleEn = item.title || "";
  const titleJa = hasTitleJa ? item.title_ja.trim() : "";

  let primary = titleEn || "(無題)";
  let secondary = "";

  if (lang === "en") {
    primary = hasTitleJa ? titleJa : (titleEn || "(無題)");
  } else if (lang === "zh") {
    // 中文記事は title_ja を主、原題 (中文) を副
    primary = hasTitleJa ? titleJa : (titleEn || "(無題)");
    if (titleEn && titleEn !== titleJa) {
      secondary = titleEn;
    }
  } else {
    primary = titleEn || "(無題)";
    if (hasTitleJa && titleJa !== titleEn) {
      secondary = titleJa;
    }
  }

  titleEl.textContent = primary;
  titleJaEl.textContent = secondary;
  const sourceLabel = item.source_label || item.source || "";
  node.querySelector(".card-source").textContent = sourceLabel;
  node.querySelector(".card-date").textContent = item.published_at || "";
  const scoreEl = node.querySelector(".card-score");
  const total = item.scores?.total ?? 0;
  scoreEl.textContent = `★ ${total}`;
  scoreEl.classList.add(scoreClass(total));
  scoreEl.title = item.scores
    ? `重要度${item.scores.importance ?? "?"} / 深度${item.scores.depth ?? "?"} / 実用性${item.scores.practicality ?? "?"} / 鮮度${item.scores.freshness ?? "?"}`
    : "";

  node.querySelector(".card-summary").textContent = item.summary_ja || "";

  const figEl = node.querySelector(".card-figure");
  if (item.figure && figEl) renderFigure(item.figure, figEl);

  const ul = node.querySelector(".card-key-points");
  if (Array.isArray(item.key_points_ja)) {
    for (const point of item.key_points_ja) {
      const li = document.createElement("li");
      li.textContent = point;
      ul.appendChild(li);
    }
  }

  const tags = node.querySelector(".card-tags");
  if (Array.isArray(item.tags)) {
    for (const tag of item.tags) {
      const span = document.createElement("span");
      span.className = "tag";
      span.textContent = `#${tag}`;
      tags.appendChild(span);
    }
  }

  const link = node.querySelector(".card-link");
  link.href = item.url || "#";

  const shareBtn = node.querySelector(".card-share");
  if (navigator.share) {
    shareBtn.addEventListener("click", () => {
      navigator
        .share({
          title: item.title_ja || item.title || "",
          text: item.summary_ja || "",
          url: item.url,
        })
        .catch(() => {});
    });
  } else {
    shareBtn.classList.add("hidden");
  }

  return node;
}

function renderCategory(category) {
  const node = els.categoryTpl.content.firstElementChild.cloneNode(true);
  node.dataset.catId = category.id || "";
  node.querySelector(".category-title").textContent =
    category.label_ja || categoryFallbackLabel(category.id);
  const items = Array.isArray(category.items) ? category.items : [];
  node.querySelector(".category-count").textContent = `${items.length}件`;
  const container = node.querySelector(".category-items");
  for (const item of items) container.appendChild(renderCard(item));
  return node;
}

// === Top Picks rendering ===
function renderTopPicks(topPicks, itemIndex) {
  const section = els.topPicks;
  if (!section) return;
  const itemsEl = section.querySelector(".top-picks-items");
  const countEl = section.querySelector(".top-picks-count");
  if (!itemsEl || !countEl) return;
  itemsEl.innerHTML = "";

  if (!Array.isArray(topPicks) || topPicks.length === 0) {
    section.classList.add("hidden");
    return;
  }

  const sorted = [...topPicks].sort((a, b) => (a.rank || 99) - (b.rank || 99));
  countEl.textContent = `${sorted.length}件`;

  let appended = 0;
  for (const pick of sorted) {
    const item = itemIndex.get(pick.id);
    if (!item) continue;
    const card = renderCard(item);
    card.classList.add("top-pick-card");
    card.dataset.rank = String(pick.rank || "");
    itemsEl.appendChild(card);
    appended += 1;
  }

  if (appended === 0) {
    section.classList.add("hidden");
  } else {
    section.classList.remove("hidden");
  }
}

// === Category tabs ===
function renderCategoryTabs(populated) {
  const nav = els.categoryTabs;
  if (!nav) return;
  nav.innerHTML = "";
  if (!Array.isArray(populated) || populated.length <= 1) {
    nav.classList.add("hidden");
    return;
  }
  // "All" タブ
  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "cat-tab is-active";
  allBtn.dataset.catId = "all";
  const totalCount = populated.reduce((s, c) => s + (c.items?.length || 0), 0);
  allBtn.textContent = `All (${totalCount})`;
  allBtn.setAttribute("aria-pressed", "true");
  nav.appendChild(allBtn);
  for (const cat of populated) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cat-tab";
    btn.dataset.catId = cat.id;
    const lbl = cat.label_ja || categoryFallbackLabel(cat.id);
    btn.textContent = `${lbl} (${cat.items.length})`;
    btn.setAttribute("aria-pressed", "false");
    nav.appendChild(btn);
  }
  nav.classList.remove("hidden");
}

function filterCategoriesByTab(catId) {
  const sections = document.querySelectorAll("#categories .category");
  sections.forEach((sec) => {
    if (catId === "all") {
      sec.classList.remove("tab-hidden");
    } else {
      sec.classList.toggle("tab-hidden", sec.dataset.catId !== catId);
    }
  });
}

function renderDay(data) {
  hideStatus();
  els.summary.classList.remove("hidden");
  els.summaryDate.textContent = formatDateJa(data.date);
  els.summaryDate.dateTime = data.date;
  if (data.stats) {
    const topCount = data.stats.top_picks_count;
    const topSeg = topCount ? ` / Top ${topCount}` : "";
    els.summaryStats.textContent = `収集 ${data.stats.total_collected ?? "-"} / 選定 ${data.stats.selected ?? "-"}${topSeg}`;
  } else {
    els.summaryStats.textContent = "";
  }
  els.summaryHeadline.textContent = data.headline || "";
  els.summaryText.textContent = data.summary_ja || "";

  els.categories.innerHTML = "";
  const rawCategories = Array.isArray(data.categories) ? data.categories : [];
  const categories = sortCategoriesForDisplay(rawCategories);
  const populated = categories.filter((c) => Array.isArray(c.items) && c.items.length);

  // Top Picks (新スキーマのみ。旧スキーマは data.top_picks 未定義で section が hidden 維持)
  const itemIndex = buildItemIndex(categories);
  renderTopPicks(data.top_picks, itemIndex);

  if (populated.length === 0) {
    if (els.categoryTabs) els.categoryTabs.classList.add("hidden");
    showStatus("この日のニュースはまだありません");
    return;
  }

  // Category Tabs (populated <= 1 のとき hidden)
  renderCategoryTabs(populated);

  for (const category of populated) {
    els.categories.appendChild(renderCategory(category));
  }
}

async function loadDay(date) {
  showStatus(`${formatDateJa(date)} を読み込み中…`);
  const isLatest = availableDates[0] === date;
  const url = `${DATA_DIR}/${isLatest ? "latest" : date}.json`;
  const cacheMode = isLatest ? "no-store" : "default";
  try {
    const data = await fetchJSON(url, { cache: cacheMode });
    currentDate = data.date || date;
    renderDay(data);
    updateDateNav();
    document.title = `${formatDateJa(currentDate)} ・ AI Daily Digest`;
  } catch (err) {
    if (isLatest) {
      try {
        const data = await fetchJSON(`${DATA_DIR}/${date}.json`);
        currentDate = data.date || date;
        renderDay(data);
        updateDateNav();
        return;
      } catch (err2) {
        console.error(err2);
      }
    }
    console.error(err);
    showStatus("データの読み込みに失敗しました", true);
  }
}

// === Routing ===
function dateFromHash() {
  const m = location.hash.match(/^#(\d{4}-\d{2}-\d{2})$/);
  return m ? m[1] : null;
}

async function route() {
  const hashDate = dateFromHash();
  const date = hashDate && availableDates.includes(hashDate) ? hashDate : availableDates[0];
  if (!date) {
    showStatus("まだデータがありません。最初のニュースが配信されるとここに表示されます。");
    return;
  }
  if (date !== currentDate) await loadDay(date);
}

window.addEventListener("hashchange", route);

// === Card open/close (event delegation on categories + top-picks containers) ===
function attachCardEvents(rootEl) {
  if (!rootEl) return;
  rootEl.addEventListener("click", (e) => {
    const collapseBtn = e.target.closest(".card-collapse-bottom");
    if (collapseBtn) {
      const card = collapseBtn.closest(".card");
      if (!card) return;
      collapseCard(card);
      const cardTop = card.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top: Math.max(cardTop, 0), behavior: "smooth" });
      return;
    }
    const toggle = e.target.closest(".card-toggle");
    if (!toggle) return;
    const card = toggle.closest(".card");
    if (!card) return;
    const expanded = card.dataset.expanded === "true";
    if (expanded) collapseCard(card);
    else expandCard(card);
  });
}
attachCardEvents(els.categories);
attachCardEvents(els.topPicks);

// === Category tab click handler ===
if (els.categoryTabs) {
  els.categoryTabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".cat-tab");
    if (!btn) return;
    els.categoryTabs.querySelectorAll(".cat-tab").forEach((b) => {
      b.classList.remove("is-active");
      b.setAttribute("aria-pressed", "false");
    });
    btn.classList.add("is-active");
    btn.setAttribute("aria-pressed", "true");
    filterCategoriesByTab(btn.dataset.catId);
  });
}

els.dateSelect.addEventListener("change", (e) => {
  if (e.target.value) location.hash = `#${e.target.value}`;
});
els.prevDate.addEventListener("click", () => {
  const idx = availableDates.indexOf(currentDate);
  if (idx >= 0 && idx < availableDates.length - 1) {
    location.hash = `#${availableDates[idx + 1]}`;
  }
});
els.nextDate.addEventListener("click", () => {
  const idx = availableDates.indexOf(currentDate);
  if (idx > 0) location.hash = `#${availableDates[idx - 1]}`;
});

// === Swipe (touch) ===
let touchStartX = null;
let touchStartY = null;
document.addEventListener("touchstart", (e) => {
  if (e.touches.length !== 1) return;
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });
document.addEventListener("touchend", (e) => {
  if (touchStartX === null) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  touchStartX = touchStartY = null;
  if (Math.abs(dx) < 60 || Math.abs(dy) > 40) return;
  if (dx > 0) els.prevDate.click();
  else els.nextDate.click();
}, { passive: true });

// === PWA install button (Android Chrome) ===
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  els.installButton.classList.remove("hidden");
});
els.installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  try { await deferredInstallPrompt.userChoice; } catch {}
  deferredInstallPrompt = null;
  els.installButton.classList.add("hidden");
});

// === Service Worker ===
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .then((reg) => {
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              els.updateBanner.classList.remove("hidden");
            }
          });
        });
      })
      .catch((err) => console.warn("SW registration failed", err));
  });
}
els.reloadButton.addEventListener("click", () => location.reload());

// === Boot ===
(async function boot() {
  await loadIndex();
  await route();
})();

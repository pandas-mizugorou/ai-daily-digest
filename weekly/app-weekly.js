// AI Daily Digest — weekly summary frontend
const DATA_DIR = "../data";
const THEME_KEY = "aidd:theme";

const els = {
  status: document.getElementById("status"),
  statusMessage: document.querySelector(".status-message"),
  weeklySummary: document.getElementById("weekly-summary"),
  weekRange: document.getElementById("week-range"),
  weekStats: document.getElementById("week-stats"),
  weeklyHeadline: document.getElementById("weekly-headline"),
  weeklyText: document.getElementById("weekly-text"),
  weeklySections: document.getElementById("weekly-sections"),
  keywordCloud: document.getElementById("keyword-cloud"),
  watchlist: document.getElementById("watchlist"),
  weekSelect: document.getElementById("week-select"),
  prevWeek: document.getElementById("prev-week"),
  nextWeek: document.getElementById("next-week"),
  themeToggle: document.getElementById("theme-toggle"),
  sectionTpl: document.getElementById("weekly-section-template"),
  itemTpl: document.getElementById("weekly-item-template"),
};

let availableWeeks = [];
let currentWeek = null;
const dayCache = new Map(); // date -> day data

// === Theme (shared with main app) ===
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

// === Status ===
function showStatus(message, isError = false) {
  els.status.classList.remove("hidden");
  els.status.classList.toggle("error", isError);
  els.statusMessage.textContent = message;
  els.weeklySummary.classList.add("hidden");
  els.weeklySections.innerHTML = "";
  els.keywordCloud.classList.add("hidden");
  els.watchlist.classList.add("hidden");
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
function formatWeekRange(from, to) {
  return `${from} 〜 ${to}`;
}

// === Index loading ===
async function loadIndex() {
  try {
    const data = await fetchJSON(`${DATA_DIR}/weekly-index.json`, { cache: "no-store" });
    availableWeeks = (data.entries || []).map((e) => e.week).filter(Boolean);
    populateWeekSelect(data.entries || []);
    return data;
  } catch (err) {
    console.warn("loadIndex failed (weekly-index.json may not exist yet)", err);
    showStatus("週次サマリはまだ生成されていません。最初の週次は金曜朝に自動配信されます。");
    return null;
  }
}

function populateWeekSelect(entries) {
  els.weekSelect.innerHTML = "";
  if (entries.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(まだ週次データがありません)";
    els.weekSelect.appendChild(opt);
    return;
  }
  for (const entry of entries) {
    const opt = document.createElement("option");
    opt.value = entry.week;
    const range = entry.from && entry.to ? `${entry.from}〜${entry.to}` : "";
    const items = entry.top_count ? ` ・ Top ${entry.top_count}` : "";
    opt.textContent = `${entry.week}${range ? ` (${range})` : ""}${items}`;
    els.weekSelect.appendChild(opt);
  }
}

function updateWeekNav() {
  const idx = availableWeeks.indexOf(currentWeek);
  els.prevWeek.disabled = idx < 0 || idx >= availableWeeks.length - 1;
  els.nextWeek.disabled = idx <= 0;
  if (idx >= 0) els.weekSelect.value = currentWeek;
}

// === Day data lazy loader (item refs を本体に解決するため) ===
async function loadDayCached(date) {
  if (dayCache.has(date)) return dayCache.get(date);
  try {
    const data = await fetchJSON(`${DATA_DIR}/${date}.json`);
    dayCache.set(date, data);
    return data;
  } catch (err) {
    console.warn("loadDayCached failed", date, err);
    return null;
  }
}

async function resolveItemRefs(refs) {
  // refs: [{ id, date, rank, reason, category }, ...]
  const dates = [...new Set(refs.map((r) => r.date))];
  await Promise.all(dates.map((d) => loadDayCached(d)));
  const resolved = [];
  for (const ref of refs) {
    const day = dayCache.get(ref.date);
    if (!day) continue;
    let item = null;
    for (const cat of (day.categories || [])) {
      for (const it of (cat.items || [])) {
        if (it.id === ref.id) { item = { ...it, _category: cat.id }; break; }
      }
      if (item) break;
    }
    if (item) {
      resolved.push({ ...item, _date: ref.date, _rank: ref.rank, _reason: ref.reason });
    }
  }
  return resolved;
}

// === Render weekly sections ===
function renderWeeklyItem(item) {
  const node = els.itemTpl.content.firstElementChild.cloneNode(true);
  const link = node.querySelector(".weekly-item-link");
  link.href = item.url || "#";
  const rank = node.querySelector(".weekly-item-rank");
  if (item._rank) {
    rank.textContent = item._rank;
  } else {
    rank.classList.add("hidden");
  }
  node.querySelector(".weekly-item-date").textContent = item._date || item.published_at || "";
  const titleEl = node.querySelector(".weekly-item-title");
  const lang = (item.lang || "").toLowerCase();
  const titleJa = (item.title_ja || "").trim();
  const title = (item.title || "").trim();
  if (lang === "en" || lang === "zh") {
    titleEl.textContent = titleJa || title || "(無題)";
  } else {
    titleEl.textContent = title || titleJa || "(無題)";
  }
  // summary 抜粋 (180 字)
  const summary = (item.summary_ja || "").trim();
  node.querySelector(".weekly-item-summary").textContent =
    summary.length > 180 ? summary.slice(0, 178) + "…" : summary;
  node.querySelector(".weekly-item-source").textContent = item.source_label || item.source || "";
  return node;
}

async function renderSection(titleJa, refs) {
  if (!Array.isArray(refs) || refs.length === 0) return null;
  const node = els.sectionTpl.content.firstElementChild.cloneNode(true);
  node.querySelector(".weekly-section-title").textContent = titleJa;
  node.querySelector(".weekly-section-count").textContent = `${refs.length}件`;
  const ul = node.querySelector(".weekly-section-items");
  const items = await resolveItemRefs(refs);
  for (const item of items) {
    ul.appendChild(renderWeeklyItem(item));
  }
  return node;
}

function renderKeywordCloud(cloud) {
  if (!Array.isArray(cloud) || cloud.length === 0) {
    els.keywordCloud.classList.add("hidden");
    return;
  }
  const container = els.keywordCloud.querySelector(".kw-items");
  container.innerHTML = "";
  // count の最大値を基準にフォントサイズを決める (0.85rem - 1.6rem)
  const maxCount = Math.max(...cloud.map((c) => c.count));
  for (const c of cloud.slice(0, 30)) {
    const span = document.createElement("span");
    const ratio = c.count / maxCount;
    const fontSize = (0.85 + ratio * 0.75).toFixed(2);
    span.className = "kw-item";
    span.style.fontSize = `${fontSize}rem`;
    if (c.delta_vs_prev_week > 0) span.classList.add("kw-up");
    if (c.delta_vs_prev_week < 0) span.classList.add("kw-down");
    const deltaTxt = c.delta_vs_prev_week
      ? ` (${c.delta_vs_prev_week > 0 ? "+" : ""}${c.delta_vs_prev_week})`
      : "";
    span.textContent = `${c.keyword}${deltaTxt}`;
    span.title = `${c.count} 件${deltaTxt ? " 前週比" + deltaTxt : ""}`;
    container.appendChild(span);
  }
  els.keywordCloud.classList.remove("hidden");
}

function renderWatchlist(list) {
  if (!Array.isArray(list) || list.length === 0) {
    els.watchlist.classList.add("hidden");
    return;
  }
  const ul = els.watchlist.querySelector(".wl-items");
  ul.innerHTML = "";
  for (const w of list) {
    const li = document.createElement("li");
    li.className = "wl-item";
    const topic = document.createElement("div");
    topic.className = "wl-topic";
    topic.textContent = w.topic;
    const reason = document.createElement("div");
    reason.className = "wl-reason";
    reason.textContent = w.reason;
    li.appendChild(topic);
    li.appendChild(reason);
    if (w.watch_until) {
      const until = document.createElement("span");
      until.className = "wl-until";
      until.textContent = `〜 ${w.watch_until}`;
      li.appendChild(until);
    }
    ul.appendChild(li);
  }
  els.watchlist.classList.remove("hidden");
}

async function renderWeek(data) {
  hideStatus();
  els.weeklySummary.classList.remove("hidden");
  els.weekRange.textContent = formatWeekRange(data.from, data.to);
  if (data.stats) {
    els.weekStats.textContent = `収集 ${data.stats.total_collected_week ?? "-"} / 選定 ${data.stats.selected_items ?? "-"} / Top ${data.stats.top_count ?? "-"}`;
  } else {
    els.weekStats.textContent = "";
  }
  els.weeklyHeadline.textContent = data.headline || "";
  els.weeklyText.textContent = data.summary_ja || "";

  els.weeklySections.innerHTML = "";

  // セクション順序: top_10 → models_3 → papers_5 → community_buzz_3 → japan_3 → china_3
  const sections = [
    ["今週のトップ", data.top_10],
    ["注目モデル", data.models_3],
    ["今週の論文", data.papers_5],
    ["コミュニティ反響", data.community_buzz_3],
    ["日本ソース", data.japan_3],
    ["中華圏", data.china_3],
  ];

  for (const [title, refs] of sections) {
    const node = await renderSection(title, refs);
    if (node) els.weeklySections.appendChild(node);
  }

  renderKeywordCloud(data.keyword_cloud);
  renderWatchlist(data.watchlist_next_week);
}

async function loadWeek(week) {
  showStatus(`${week} を読み込み中…`);
  const isLatest = availableWeeks[0] === week;
  const url = `${DATA_DIR}/${isLatest ? "weekly-latest" : `weekly-${week}`}.json`;
  const cacheMode = isLatest ? "no-store" : "default";
  try {
    const data = await fetchJSON(url, { cache: cacheMode });
    currentWeek = data.week || week;
    await renderWeek(data);
    updateWeekNav();
    document.title = `${currentWeek} ・ AI Weekly Digest`;
  } catch (err) {
    if (isLatest) {
      try {
        const data = await fetchJSON(`${DATA_DIR}/weekly-${week}.json`);
        currentWeek = data.week || week;
        await renderWeek(data);
        updateWeekNav();
        return;
      } catch (err2) {
        console.error(err2);
      }
    }
    console.error(err);
    showStatus("週次データの読み込みに失敗しました", true);
  }
}

// === Routing ===
function weekFromHash() {
  const m = location.hash.match(/^#(\d{4}-W\d{2})$/);
  return m ? m[1] : null;
}

async function route() {
  const hashWeek = weekFromHash();
  const week = hashWeek && availableWeeks.includes(hashWeek) ? hashWeek : availableWeeks[0];
  if (!week) {
    showStatus("週次サマリはまだ生成されていません。最初の週次は金曜朝に自動配信されます。");
    return;
  }
  if (week !== currentWeek) await loadWeek(week);
}

window.addEventListener("hashchange", route);

els.weekSelect.addEventListener("change", (e) => {
  if (e.target.value) location.hash = `#${e.target.value}`;
});
els.prevWeek.addEventListener("click", () => {
  const idx = availableWeeks.indexOf(currentWeek);
  if (idx >= 0 && idx < availableWeeks.length - 1) {
    location.hash = `#${availableWeeks[idx + 1]}`;
  }
});
els.nextWeek.addEventListener("click", () => {
  const idx = availableWeeks.indexOf(currentWeek);
  if (idx > 0) location.hash = `#${availableWeeks[idx - 1]}`;
});

// === Service Worker (shared with main, registered relative to root) ===
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("../service-worker.js", { scope: "../" })
      .catch((err) => console.warn("SW registration failed", err));
  });
}

// === Boot ===
(async function boot() {
  await loadIndex();
  await route();
})();

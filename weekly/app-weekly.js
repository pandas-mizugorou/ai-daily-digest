// AI Daily Digest — weekly summary frontend
import { renderFigure } from "../assets/figure.js";
import { copyXDraft, hasXPost } from "../assets/xdraft.js";

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
  sectionTabs: document.getElementById("weekly-section-tabs"),
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

const WEEKLY_SECTIONS = [
  { id: "top_10",           label: "今週のトップ" },
  { id: "models_3",         label: "注目モデル" },
  { id: "papers_5",         label: "今週の論文" },
  { id: "community_buzz_3", label: "コミュニティ反響" },
  { id: "japan_3",          label: "日本ソース" },
  { id: "china_3",          label: "中華圏" },
];

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

// "2026-05-09" → "5/9" のように M/D へ短縮 (年は週番号側で表示する前提)
function formatWeekRangeShort(from, to) {
  const f = String(from || "").match(/^\d{4}-(\d{2})-(\d{2})$/);
  const t = String(to || "").match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!f || !t) return `${from}〜${to}`;
  return `${parseInt(f[1], 10)}/${parseInt(f[2], 10)} 〜 ${parseInt(t[1], 10)}/${parseInt(t[2], 10)}`;
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
    // 例: "2026-W20 (5/9〜5/15)" - 年は週番号に含まれるので日付からは省略、Top N は本文側に出るのでドロップダウンでは省く
    const range = entry.from && entry.to ? ` (${formatWeekRangeShort(entry.from, entry.to)})` : "";
    opt.textContent = `${entry.week}${range}`;
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
// 日次/検索と同じ details 展開カード (要約 + キーポイント + タグ + 図解 + 元記事リンク)
function renderWeeklyItem(item) {
  const node = els.itemTpl.content.firstElementChild.cloneNode(true);

  const rankBadge = node.querySelector(".weekly-rank-badge");
  if (item._rank) {
    rankBadge.textContent = `#${item._rank}`;
  } else {
    rankBadge.classList.add("hidden");
  }

  const lang = (item.lang || "").toLowerCase();
  const titleJa = (item.title_ja || "").trim();
  const title = (item.title || "").trim();
  const titleText =
    lang === "en" || lang === "zh" ? titleJa || title || "(無題)" : title || titleJa || "(無題)";
  node.querySelector(".weekly-title-text").textContent = titleText;

  node.querySelector(".search-card-source").textContent = item.source_label || item.source || "";
  node.querySelector(".search-card-date").textContent = item._date || item.published_at || "";
  node.querySelector(".search-card-score").textContent = `★ ${item.scores?.total ?? 0}`;

  node.querySelector(".search-card-text").textContent = item.summary_ja || "";

  const figEl = node.querySelector(".card-figure");
  if (item.figure && figEl) renderFigure(item.figure, figEl);

  const ul = node.querySelector(".search-card-points");
  for (const p of item.key_points_ja || []) {
    const li = document.createElement("li");
    li.textContent = p;
    ul.appendChild(li);
  }

  const tagWrap = node.querySelector(".search-card-tags");
  for (const t of item.tags || []) {
    const s = document.createElement("span");
    s.className = "tag";
    s.textContent = `#${t}`;
    tagWrap.appendChild(s);
  }

  node.querySelector(".search-card-link").href = item.url || "#";

  const xdraftBtn = node.querySelector(".card-xdraft");
  if (xdraftBtn && hasXPost(item)) {
    xdraftBtn.classList.remove("hidden");
    xdraftBtn.addEventListener("click", () => copyXDraft(item));
  }

  // 下部「閉じる」ボタン (日次 collapseCard と同じ挙動)
  node.querySelector(".card-collapse-bottom").addEventListener("click", () => {
    node.open = false;
    // 折りたたみ reflow 確定まで 2 フレーム待ち、ヘッダー実高分下げて *即時* スクロール
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const header = document.querySelector(".site-header");
        const headerH = header ? header.getBoundingClientRect().height : 0;
        const y = node.getBoundingClientRect().top + window.scrollY - headerH - 16;
        window.scrollTo(0, Math.max(0, y));
      })
    );
  });
  return node;
}

async function renderSection(titleJa, refs, sectionId) {
  if (!Array.isArray(refs) || refs.length === 0) return null;
  const node = els.sectionTpl.content.firstElementChild.cloneNode(true);
  if (sectionId) node.dataset.sectionId = sectionId;
  node.querySelector(".weekly-section-title").textContent = titleJa;
  node.querySelector(".weekly-section-count").textContent = `${refs.length}件`;
  const ul = node.querySelector(".weekly-section-items");
  const items = await resolveItemRefs(refs);
  for (const item of items) {
    ul.appendChild(renderWeeklyItem(item));
  }
  return node;
}

// === Section tabs (週次カテゴリ切替 UI、日次 renderCategoryTabs 相当) ===
function renderWeeklyTabs(populated) {
  // populated: [{ id, label, count }, ...] (count > 0 のみ)
  const nav = els.sectionTabs;
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
  allBtn.dataset.sectionId = "all";
  const totalCount = populated.reduce((s, c) => s + c.count, 0);
  allBtn.textContent = `すべて (${totalCount})`;
  allBtn.setAttribute("aria-pressed", "true");
  nav.appendChild(allBtn);
  // 各セクションタブ
  for (const sec of populated) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cat-tab";
    btn.dataset.sectionId = sec.id;
    btn.textContent = `${sec.label} (${sec.count})`;
    btn.setAttribute("aria-pressed", "false");
    nav.appendChild(btn);
  }
  nav.classList.remove("hidden");
}

function filterWeeklyBySection(sectionId) {
  const sections = els.weeklySections.querySelectorAll(".weekly-section");
  sections.forEach((sec) => {
    if (sectionId === "all") {
      sec.classList.remove("tab-hidden");
    } else {
      sec.classList.toggle("tab-hidden", sec.dataset.sectionId !== sectionId);
    }
  });
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

  // セクション順序: WEEKLY_SECTIONS の定義順 (top_10 → models_3 → papers_5 → ...)
  const populatedForTabs = [];
  for (const sec of WEEKLY_SECTIONS) {
    const refs = data[sec.id];
    const node = await renderSection(sec.label, refs, sec.id);
    if (node) {
      els.weeklySections.appendChild(node);
      populatedForTabs.push({ id: sec.id, label: sec.label, count: refs.length });
    }
  }

  renderWeeklyTabs(populatedForTabs);
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

// === Section tab click handler (日次 app.js の category tab handler と同パターン) ===
if (els.sectionTabs) {
  els.sectionTabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".cat-tab");
    if (!btn) return;
    els.sectionTabs.querySelectorAll(".cat-tab").forEach((b) => {
      b.classList.remove("is-active");
      b.setAttribute("aria-pressed", "false");
    });
    btn.classList.add("is-active");
    btn.setAttribute("aria-pressed", "true");
    filterWeeklyBySection(btn.dataset.sectionId);
  });
}

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

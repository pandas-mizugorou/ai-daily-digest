// AI Daily Digest — 検索ページ (Phase F-3)
import { renderFigure } from "../assets/figure.js";

const THEME_KEY = "aidd:theme";
const INDEX_URL = "../data/search-index.json";
const DAY_DIR = "../data";
const MAX_RESULTS = 100; // 絞り込み時の DOM 描画上限
const DEFAULT_RESULTS = 30; // 語/タグ未指定時の既定表示
const TOP_TAGS = 40; // タグチップに出す上位件数

const els = {
  status: document.getElementById("status"),
  statusMessage: document.querySelector(".status-message"),
  searchInput: document.getElementById("search-input"),
  tagChips: document.getElementById("tag-chips"),
  results: document.getElementById("search-results"),
  meta: document.getElementById("search-meta"),
  themeToggle: document.getElementById("theme-toggle"),
  resultTpl: document.getElementById("result-template"),
  tagChipTpl: document.getElementById("tag-chip-template"),
};

// === Theme (weekly/app-weekly.js と同一挙動) ===
function applyTheme(theme) {
  if (theme === "dark" || theme === "light") document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
function toggleTheme() {
  const cur = document.documentElement.dataset.theme;
  let next;
  if (!cur) next = window.matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark";
  else next = cur === "dark" ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch {}
}
applyTheme((() => { try { return localStorage.getItem(THEME_KEY); } catch { return null; } })());
els.themeToggle.addEventListener("click", toggleTheme);

let allItems = [];
const selectedTags = new Set();

function showStatus(msg, isError = false) {
  els.status.classList.remove("hidden");
  els.status.classList.toggle("error", isError);
  els.statusMessage.textContent = msg;
}
function hideStatus() { els.status.classList.add("hidden"); }

async function loadIndex() {
  showStatus("検索インデックスを読み込み中…");
  try {
    const res = await fetch(`${INDEX_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    allItems = Array.isArray(data.items) ? data.items : [];
    renderTagChips(Array.isArray(data.all_tags) ? data.all_tags : []);
    hideStatus();
    applyFilter();
  } catch (err) {
    console.warn("loadIndex failed", err);
    showStatus("検索インデックスを読み込めませんでした。時間をおいて再度お試しください。", true);
  }
}

function renderTagChips(allTags) {
  els.tagChips.innerHTML = "";
  for (const { tag, count } of allTags.slice(0, TOP_TAGS)) {
    const btn = els.tagChipTpl.content.firstElementChild.cloneNode(true);
    btn.textContent = `#${tag} (${count})`;
    btn.dataset.tag = tag;
    btn.addEventListener("click", () => {
      if (selectedTags.has(tag)) {
        selectedTags.delete(tag);
        btn.classList.remove("is-active");
        btn.setAttribute("aria-pressed", "false");
      } else {
        selectedTags.add(tag);
        btn.classList.add("is-active");
        btn.setAttribute("aria-pressed", "true");
      }
      applyFilter();
    });
    els.tagChips.appendChild(btn);
  }
}

function pickTitle(item) {
  const lang = (item.lang || "").toLowerCase();
  const ja = (item.title_ja || "").trim();
  const en = (item.title || "").trim();
  if (lang === "en" || lang === "zh") return ja || en || "(無題)";
  return en || ja || "(無題)";
}

function applyFilter() {
  const raw = els.searchInput.value.trim().toLowerCase();
  const terms = raw ? raw.split(/\s+/) : [];
  let matched = allItems.filter((it) => {
    if (selectedTags.size > 0) {
      const itTags = it.tags || [];
      if (![...selectedTags].some((t) => itTags.includes(t))) return false;
    }
    if (terms.length > 0) {
      const hay = (
        (it.title || "") + " " + (it.title_ja || "") + " " + (it.summary_ja || "") + " " +
        (it.tags || []).join(" ") + " " + (it.source_label || "")
      ).toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
  const total = matched.length;
  const noQuery = terms.length === 0 && selectedTags.size === 0;
  if (noQuery) matched = matched.slice(0, DEFAULT_RESULTS);
  else if (matched.length > MAX_RESULTS) matched = matched.slice(0, MAX_RESULTS);
  renderResults(matched, total, noQuery);
}

function renderResults(items, total, noQuery) {
  els.results.innerHTML = "";
  if (items.length === 0) {
    els.meta.textContent = "該当する記事がありません。キーワードやタグを変えてみてください。";
    return;
  }
  if (noQuery) {
    els.meta.textContent = `最新 ${items.length} 件を表示中（キーワードかタグで全 ${allItems.length} 件から絞り込めます）`;
  } else {
    els.meta.textContent =
      `${total} 件ヒット` + (total > items.length ? `（先頭 ${items.length} 件を表示。さらに絞り込んでください）` : "");
  }
  const frag = document.createDocumentFragment();
  for (const it of items) frag.appendChild(renderResultCard(it));
  els.results.appendChild(frag);
}

// 図解(figure)は索引に入れていない(肥大回避)ため、カード展開時に
// 該当日の日次 JSON を lazy fetch して取得する。同一日は Map でキャッシュ。
const dayCache = new Map(); // date -> day json | null

async function loadDayCached(date) {
  if (dayCache.has(date)) return dayCache.get(date);
  try {
    const res = await fetch(`${DAY_DIR}/${date}.json`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const j = await res.json();
    dayCache.set(date, j);
    return j;
  } catch {
    dayCache.set(date, null);
    return null;
  }
}

async function loadFigureInto(item, figEl) {
  if (!figEl) return;
  const day = await loadDayCached(item.date);
  if (!day) return;
  for (const cat of day.categories || []) {
    for (const it of cat.items || []) {
      if (it.id === item.id) {
        if (it.figure) renderFigure(it.figure, figEl);
        return;
      }
    }
  }
}

function renderResultCard(item) {
  const node = els.resultTpl.content.firstElementChild.cloneNode(true);
  node.querySelector(".search-card-title").textContent = pickTitle(item);
  node.querySelector(".search-card-source").textContent = item.source_label || item.source || "";
  node.querySelector(".search-card-date").textContent = item.date || "";
  node.querySelector(".search-card-score").textContent = `★ ${item.score ?? 0}`;
  node.querySelector(".search-card-text").textContent = item.summary_ja || "";
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

  // 初回展開時のみ figure を lazy fetch
  const figEl = node.querySelector(".card-figure");
  let figLoaded = false;
  node.addEventListener("toggle", () => {
    if (node.open && !figLoaded) {
      figLoaded = true;
      loadFigureInto(item, figEl);
    }
  });
  return node;
}

let debTimer = null;
els.searchInput.addEventListener("input", () => {
  clearTimeout(debTimer);
  debTimer = setTimeout(applyFilter, 150);
});

// === Service Worker (weekly と同一: ルート基準で登録) ===
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("../service-worker.js", { scope: "../" })
      .catch((err) => console.warn("SW registration failed", err));
  });
}

loadIndex();

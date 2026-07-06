// AI Daily Digest — 検索ページ (Phase F-3)
import { renderFigure } from "../assets/figure.js";
import { copyXDraft, hasXPost } from "../assets/xdraft.js";
import { faviconFor, sourceTypeChip } from "../assets/provenance.js";

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
  filterCategory: document.getElementById("filter-category"),
  filterSourceType: document.getElementById("filter-source-type"),
  filterScore: document.getElementById("filter-score"),
  filterPeriod: document.getElementById("filter-period"),
};

// 旧カテゴリID (schema 1.x) → 新ID (2.x)。索引には両方混在するため、フィルタでは
// 新IDに畳んで集計・照合する (旧「研究・論文」が別行で重複する B8 の解消)。
const CATEGORY_ALIAS = {
  tools: "tools_apps",
  research: "research_papers",
  industry: "industry_business",
};
const canonCategory = (id) => CATEGORY_ALIAS[id] || id || "";

// カテゴリ表示名 (app.js categoryFallbackLabel と同一対応。索引は ID しか持たないためここにも持つ)
const CATEGORY_LABEL = {
  new_models: "新モデル・新発表",
  tools_apps: "ツール・アプリ・SDK",
  agents: "エージェント・自律実行",
  multimodal: "マルチモーダル・生成",
  research_papers: "研究・論文",
  industry_business: "業界動向・ビジネス",
  regulation_policy: "規制・政策・安全",
  community_buzz: "コミュニティ反響",
  japan: "日本語ソース",
  china: "中華圏",
};
// provenance.js の SOURCE_TYPE_LABEL と同一対応 (チップは aria-hidden の視覚専用のため別持ち)
const SOURCE_TYPE_LABEL_LOCAL = {
  official: "公式",
  academic: "論文",
  aggregator: "まとめ",
  media: "メディア",
  community: "コミュ",
  japan_community: "日本コミュ",
  japan_corp: "日本企業",
  china: "中華圏",
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
    latestDate = data.date_to || (allItems[0]?.date ?? "");
    renderTagChips(Array.isArray(data.all_tags) ? data.all_tags : []);
    buildFilterOptions();
    applyUrlParams();
    hideStatus();
    applyFilter();
  } catch (err) {
    console.warn("loadIndex failed", err);
    showStatus("検索インデックスを読み込めませんでした。時間をおいて再度お試しください。", true);
  }
}

// === 絞り込みフィルタ (カテゴリ / 出典タイプ / スコア下限 / 期間) ===
let latestDate = "";

function fillSelect(sel, options, allLabel) {
  sel.innerHTML = "";
  const mk = (value, label) => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    return o;
  };
  sel.appendChild(mk("", allLabel));
  for (const { value, label } of options) sel.appendChild(mk(value, label));
}

function buildFilterOptions() {
  // カテゴリ / 出典タイプは索引に実在する値だけを件数付きで出す (空選択肢を並べない)
  const catCount = new Map();
  const typeCount = new Map();
  for (const it of allItems) {
    const cid = canonCategory(it.category);
    if (cid) catCount.set(cid, (catCount.get(cid) ?? 0) + 1);
    if (it.source_type) typeCount.set(it.source_type, (typeCount.get(it.source_type) ?? 0) + 1);
  }
  const catOrder = Object.keys(CATEGORY_LABEL);
  const cats = [...catCount.entries()]
    .sort((a, b) => {
      const ai = catOrder.indexOf(a[0]); const bi = catOrder.indexOf(b[0]);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    })
    .map(([id, n]) => ({ value: id, label: `${CATEGORY_LABEL[id] ?? id} (${n})` }));
  const types = [...typeCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => ({ value: id, label: `${SOURCE_TYPE_LABEL_LOCAL[id] ?? id} (${n})` }));
  fillSelect(els.filterCategory, cats, "カテゴリ: すべて");
  fillSelect(els.filterSourceType, types, "出典: すべて");
  fillSelect(els.filterScore, [
    { value: "17", label: "★17 以上" },
    { value: "15", label: "★15 以上" },
    { value: "12", label: "★12 以上" },
  ], "スコア: すべて");
  fillSelect(els.filterPeriod, [
    { value: "7", label: "直近 7 日" },
    { value: "30", label: "直近 30 日" },
    { value: "90", label: "直近 90 日" },
  ], "期間: すべて");
  for (const sel of [els.filterCategory, els.filterSourceType, els.filterScore, els.filterPeriod]) {
    sel.addEventListener("change", applyFilter);
  }
}

// data-tag セレクタ用のエスケープ (CSS.escape 欠落環境でも壊さない)
function escapeAttr(v) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(v);
  return String(v).replace(/["\\]/g, "\\$&");
}

// 日次ページのタグリンク (?tag=) やキーワード付き共有 (?q=) を受ける
function applyUrlParams() {
  const params = new URLSearchParams(location.search);
  const q = params.get("q");
  if (q) els.searchInput.value = q;
  const tag = params.get("tag");
  if (tag) {
    selectedTags.add(tag);
    let chip = null;
    try {
      chip = els.tagChips.querySelector(`[data-tag="${escapeAttr(tag)}"]`);
    } catch { /* 不正セレクタでも落とさない */ }
    if (chip) {
      chip.classList.add("is-active");
      chip.setAttribute("aria-pressed", "true");
    } else {
      // 上位40チップに無いタグ (全タグの98%) でも、解除できる活性チップを先頭に出す
      // (B6: これが無いと「解除UIの無い絞り込み」に陥る)
      els.tagChips.insertBefore(makeTagChip(tag), els.tagChips.firstChild);
    }
  }
}

// 期間フィルタの基準日: 索引の最新日 (配信が止まっていても「直近7日」が空にならない)
function periodCutoff(days) {
  const anchor = latestDate ? new Date(latestDate + "T00:00:00") : new Date();
  anchor.setDate(anchor.getDate() - (days - 1));
  const y = anchor.getFullYear();
  const m = String(anchor.getMonth() + 1).padStart(2, "0");
  const d = String(anchor.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// タグチップを 1 個生成 (クリックでトグル)。count 未指定なら件数を出さない。
function makeTagChip(tag, count) {
  const btn = els.tagChipTpl.content.firstElementChild.cloneNode(true);
  btn.textContent = count != null ? `#${tag} (${count})` : `#${tag}`;
  btn.dataset.tag = tag;
  const sync = () => {
    const on = selectedTags.has(tag);
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-pressed", String(on));
  };
  btn.addEventListener("click", () => {
    if (selectedTags.has(tag)) selectedTags.delete(tag);
    else selectedTags.add(tag);
    sync();
    applyFilter();
  });
  sync();
  return btn;
}

function renderTagChips(allTags) {
  els.tagChips.innerHTML = "";
  for (const { tag, count } of allTags.slice(0, TOP_TAGS)) {
    els.tagChips.appendChild(makeTagChip(tag, count));
  }
}

function pickTitle(item) {
  const lang = (item.lang || "").toLowerCase();
  const ja = (item.title_ja || "").trim();
  const en = (item.title || "").trim();
  if (lang === "en" || lang === "zh") return ja || en || "(無題)";
  return en || ja || "(無題)";
}

// 日付を M/D へ正規化（生ISO・日付混在を吸収）
function formatShortDate(value) {
  if (!value) return "";
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(value);
  return `${Number(m[2])}/${Number(m[3])}`;
}

function applyFilter() {
  const raw = els.searchInput.value.trim().toLowerCase();
  const terms = raw ? raw.split(/\s+/) : [];
  const fCat = els.filterCategory?.value || "";
  const fType = els.filterSourceType?.value || "";
  const fScore = Number(els.filterScore?.value || 0);
  const fDays = Number(els.filterPeriod?.value || 0);
  const cutoff = fDays > 0 ? periodCutoff(fDays) : "";
  let matched = allItems.filter((it) => {
    if (fCat && canonCategory(it.category) !== fCat) return false;
    if (fType && it.source_type !== fType) return false;
    if (fScore > 0 && !(typeof it.score === "number" && it.score >= fScore)) return false;
    if (cutoff && it.date < cutoff) return false;
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
  const noQuery = terms.length === 0 && selectedTags.size === 0 && !fCat && !fType && fScore === 0 && fDays === 0;
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
  const metaEl = node.querySelector(".search-card-meta");
  const sourceEl = node.querySelector(".search-card-source");
  sourceEl.textContent = item.source_label || item.source || "";
  if (item.url) metaEl.insertBefore(faviconFor(item.url), metaEl.firstChild);
  // source_type は検索インデックスには無い場合が多い → あれば出す（無ければ自動スキップ）
  const srcChip = sourceTypeChip(item.source_type);
  if (srcChip) sourceEl.insertAdjacentElement("afterend", srcChip);
  node.querySelector(".search-card-date").textContent = formatShortDate(item.date);
  // score 欠落 (null) は「★ 0/20」と誤読させず非表示
  const scoreEl = node.querySelector(".search-card-score");
  if (typeof item.score === "number") scoreEl.textContent = `★ ${item.score}/20`;
  else scoreEl.classList.add("hidden");
  node.querySelector(".search-card-text").textContent = item.summary_ja || "";
  // 本文 clamp + 「続きを読む」(figure と重複する長文を 2 行に、日次と統一)
  const sText = node.querySelector(".search-card-text");
  const sToggle = node.querySelector(".card-summary-toggle");
  if (sText && sToggle) {
    sToggle.addEventListener("click", () => {
      const clamped = sText.classList.toggle("clamped");
      sToggle.textContent = clamped ? "続きを読む" : "閉じる";
      sToggle.setAttribute("aria-expanded", String(!clamped));
    });
  }
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

  // 初回展開時のみ figure を lazy fetch
  const figEl = node.querySelector(".card-figure");
  let figLoaded = false;
  node.addEventListener("toggle", () => {
    if (node.open && !figLoaded) {
      figLoaded = true;
      loadFigureInto(item, figEl);
    }
    // 本文が 2 行を超える時だけ「続きを読む」を表示
    if (node.open && sText && sToggle && sText.classList.contains("clamped")) {
      requestAnimationFrame(() => {
        if (sText.scrollHeight - sText.clientHeight > 4) sToggle.classList.remove("hidden");
      });
    }
  });

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

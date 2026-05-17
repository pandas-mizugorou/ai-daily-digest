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
  weeklyLink: document.getElementById("weekly-link"),
  dateSelect: document.getElementById("date-select"),
  prevDate: document.getElementById("prev-date"),
  nextDate: document.getElementById("next-date"),
  themeToggle: document.getElementById("theme-toggle"),
  installButton: document.getElementById("install-button"),
  updateBanner: document.getElementById("update-banner"),
  reloadButton: document.getElementById("reload-button"),
  notifyButton: document.getElementById("notify-button"),
  pushDialog: document.getElementById("push-dialog"),
  pushSubJson: document.getElementById("push-sub-json"),
  pushCopyBtn: document.getElementById("push-copy-btn"),
  pushCloseBtn: document.getElementById("push-close-btn"),
  pushDialogMsg: document.getElementById("push-dialog-msg"),
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

// === ISO 8601 week number from YYYY-MM-DD ===
function isoWeekFromDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

// === Weekly link visibility ===
async function updateWeeklyLink(currentDate) {
  if (!els.weeklyLink) return;
  if (!currentDate) {
    els.weeklyLink.classList.add("hidden");
    return;
  }
  const week = isoWeekFromDate(currentDate);
  els.weeklyLink.href = `./weekly/#${week}`;
  // weekly-index.json を確認して該当週があれば表示
  try {
    const idx = await fetchJSON(`${DATA_DIR}/weekly-index.json`, { cache: "no-store" });
    const has = (idx.entries || []).some((e) => e.week === week);
    if (has) {
      els.weeklyLink.classList.remove("hidden");
    } else {
      els.weeklyLink.classList.add("hidden");
    }
  } catch {
    // weekly-index.json がまだ無いケース (Phase D 実行前) → 非表示
    els.weeklyLink.classList.add("hidden");
  }
}

function scoreClass(total) {
  if (total >= 17) return "high";
  if (total >= 13) return "mid";
  return "low";
}

// === Figure rendering ===
// 描画ロジックは assets/figure.js に分離 (日次/週次/検索で共有)。
import { renderFigure } from "./figure.js";

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
    updateWeeklyLink(currentDate);
    document.title = `${formatDateJa(currentDate)} ・ AI Daily Digest`;
  } catch (err) {
    if (isLatest) {
      try {
        const data = await fetchJSON(`${DATA_DIR}/${date}.json`);
        currentDate = data.date || date;
        renderDay(data);
        updateDateNav();
        updateWeeklyLink(currentDate);
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
      // 折りたたみ後にレイアウトが確定してから、カード先頭をヘッダー直下へ
      // (scroll-margin-top でヘッダー分オフセット。確実にそのカードが見える)
      requestAnimationFrame(() => {
        card.scrollIntoView({ block: "start", behavior: "smooth" });
      });
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
    navigator.serviceWorker.ready.then((reg) => initPush(reg)).catch(() => {});
  });
}
els.reloadButton.addEventListener("click", () => location.reload());

// === Web Push (Phase F-1) ===
// 公開鍵は公開前提。!!! scripts/send-push.mjs の VAPID_PUBLIC_KEY と必ず一致させること !!!
const VAPID_PUBLIC_KEY =
  "BJI7StzSqU0D1Sz_ZVNhFObbHF1ojf8rqv220YZxov0kQ-6C07vtGE1liXN2pnAZXcmRsMYHuKutrKVATUoGRAc";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function showPushDialog(json, msg) {
  if (!els.pushDialog) return;
  els.pushSubJson.value = json || "";
  els.pushDialogMsg.textContent = msg || "";
  if (typeof els.pushDialog.showModal === "function") els.pushDialog.showModal();
  else els.pushDialog.setAttribute("open", "");
}

async function initPush(reg) {
  if (!els.notifyButton) return;
  if (!("PushManager" in window) || !("Notification" in window) || !reg) return;
  // Push 対応環境でのみボタンを出す (iOS は A2HS した PWA のみ動作)
  els.notifyButton.classList.remove("hidden");

  async function refreshState() {
    let sub = null;
    try { sub = await reg.pushManager.getSubscription(); } catch {}
    if (Notification.permission === "denied") {
      els.notifyButton.setAttribute("aria-label", "通知はブロックされています");
    } else if (sub) {
      els.notifyButton.setAttribute("aria-label", "通知は登録済み（タップで購読情報を再表示）");
    } else {
      els.notifyButton.setAttribute("aria-label", "通知を有効化");
    }
  }
  await refreshState();

  els.notifyButton.addEventListener("click", async () => {
    if (Notification.permission === "denied") {
      showPushDialog("", "通知がブロックされています。ブラウザのサイト設定で許可してから再度お試しください。");
      return;
    }
    let sub = null;
    try { sub = await reg.pushManager.getSubscription(); } catch {}
    if (!sub) {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        showPushDialog("", "通知が許可されませんでした。");
        return;
      }
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      } catch (err) {
        showPushDialog("", "購読に失敗しました: " + (err?.message || err));
        return;
      }
    }
    await refreshState();
    showPushDialog(JSON.stringify(sub.toJSON(), null, 2), "");
  });

  els.pushCopyBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(els.pushSubJson.value);
      els.pushDialogMsg.textContent = "コピーしました。Claude Code に渡して subscriptions.json に登録してください。";
    } catch {
      els.pushSubJson.focus();
      els.pushSubJson.select();
      els.pushDialogMsg.textContent = "自動コピーできませんでした。手動で全選択してコピーしてください。";
    }
  });
  els.pushCloseBtn?.addEventListener("click", () => {
    if (typeof els.pushDialog.close === "function") els.pushDialog.close();
    else els.pushDialog.removeAttribute("open");
  });
}

// === Boot ===
(async function boot() {
  await loadIndex();
  await route();
})();

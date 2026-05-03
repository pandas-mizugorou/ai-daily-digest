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
    tools: "ツール・SDK",
    research: "研究・論文",
    industry: "業界動向",
    japan: "日本語ソース",
  }[id] || id;
}

function scoreClass(total) {
  if (total >= 17) return "high";
  if (total >= 13) return "mid";
  return "low";
}

function renderCard(item) {
  const node = els.cardTpl.content.firstElementChild.cloneNode(true);
  node.dataset.itemId = item.id || "";
  node.querySelector(".card-title").textContent = item.title || "(無題)";
  const titleJa = node.querySelector(".card-title-ja");
  if (item.title_ja && item.title_ja !== item.title) {
    titleJa.textContent = item.title_ja;
  }
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
  node.querySelector(".category-title").textContent =
    category.label_ja || categoryFallbackLabel(category.id);
  const items = Array.isArray(category.items) ? category.items : [];
  node.querySelector(".category-count").textContent = `${items.length}件`;
  const container = node.querySelector(".category-items");
  for (const item of items) container.appendChild(renderCard(item));
  return node;
}

function renderDay(data) {
  hideStatus();
  els.summary.classList.remove("hidden");
  els.summaryDate.textContent = formatDateJa(data.date);
  els.summaryDate.dateTime = data.date;
  if (data.stats) {
    els.summaryStats.textContent = `収集 ${data.stats.total_collected ?? "-"} / 選定 ${data.stats.selected ?? "-"}`;
  } else {
    els.summaryStats.textContent = "";
  }
  els.summaryHeadline.textContent = data.headline || "";
  els.summaryText.textContent = data.summary_ja || "";

  els.categories.innerHTML = "";
  const categories = Array.isArray(data.categories) ? data.categories : [];
  const populated = categories.filter((c) => Array.isArray(c.items) && c.items.length);
  if (populated.length === 0) {
    showStatus("この日のニュースはまだありません");
    return;
  }
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

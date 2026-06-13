// app-trends.js — トレンド + 品質ダッシュボード (Phase 2-5 / 3-2 / 3-3)
// data/stats.json (build-stats.mjs 生成) を読んで CSS バー中心に可視化する。依存ゼロ。

const THEME_KEY = "aidd:theme";
const STATS_URL = "../data/stats.json";

const els = {
  status: document.getElementById("status"),
  statusMessage: document.querySelector(".status-message"),
  meta: document.getElementById("trends-meta"),
  root: document.getElementById("trends-root"),
  themeToggle: document.getElementById("theme-toggle"),
};

// === Theme (他ページと同一) ===
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

// === DOM ヘルパ ===
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function section(title, note) {
  const s = el("section", "trends-section");
  const h = el("h2", "trends-section-title", title);
  s.appendChild(h);
  if (note) s.appendChild(el("p", "trends-section-note", note));
  return s;
}
// 横棒 1 行 (label, 数値表示, 0-100 の比率, 任意の tone)
function hbarRow(label, valueText, pct, tone) {
  const row = el("div", "tbar-row");
  row.appendChild(el("span", "tbar-label", label));
  const track = el("div", "tbar-track");
  const fill = el("div", "tbar-fill" + (tone ? ` tone-${tone}` : ""));
  fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  track.appendChild(fill);
  row.appendChild(track);
  row.appendChild(el("span", "tbar-value", valueText));
  return row;
}

function showStatus(msg, isError = false) {
  els.status.classList.remove("hidden");
  els.status.classList.toggle("error", isError);
  els.statusMessage.textContent = msg;
}
function hideStatus() { els.status.classList.add("hidden"); }

const CAT_LABEL = {
  new_models: "新モデル", tools_apps: "ツール", agents: "エージェント", multimodal: "マルチモーダル",
  research_papers: "研究・論文", industry_business: "業界", regulation_policy: "規制", community_buzz: "反響",
  japan: "日本語", china: "中華圏",
};
const FIG_LABEL = { comparison: "比較", "metric-bars": "棒グラフ", timeline: "時系列", "summary-card": "カード" };
const FIG_TONE = { comparison: "primary", "metric-bars": "success", timeline: "info", "summary-card": "warning" };

// === ① 収集ファネル推移 ===
function renderFunnel(daily) {
  const s = section("収集ファネル推移", "収集 → 重複排除 → 選定。直近の取得規模と選定率を追う。");
  const recent = daily.slice(-21);
  const maxCollected = Math.max(1, ...recent.map((d) => d.collected || 0));
  const chart = el("div", "funnel-chart");
  for (const d of recent) {
    const col = el("div", "funnel-col");
    col.title = `${d.date}\n収集 ${d.collected ?? "?"} / 重複排除後 ${d.dedup ?? "?"} / 選定 ${d.selected ?? "?"} / Top ${d.top_picks ?? "?"}`;
    const bars = el("div", "funnel-bars");
    const mk = (v, cls) => {
      const b = el("div", `funnel-seg ${cls}`);
      b.style.height = `${Math.round(((v || 0) / maxCollected) * 100)}%`;
      return b;
    };
    bars.append(mk(d.collected, "seg-collected"), mk(d.dedup, "seg-dedup"), mk(d.selected, "seg-selected"));
    col.appendChild(bars);
    col.appendChild(el("span", "funnel-x", d.date.slice(5))); // MM-DD
    chart.appendChild(col);
  }
  s.appendChild(chart);
  const legend = el("div", "trends-legend");
  legend.append(
    legendItem("seg-collected", "収集"),
    legendItem("seg-dedup", "重複排除後"),
    legendItem("seg-selected", "選定"),
  );
  s.appendChild(legend);
  return s;
}
function legendItem(cls, text) {
  const i = el("span", "trends-legend-item");
  i.append(el("span", `trends-legend-dot ${cls}`), document.createTextNode(text));
  return i;
}

// === ② グラウンディング修正推移 (品質) ===
function renderGrounding(daily) {
  const s = section("グラウンディング修正の推移", "要約・図・x_post の事実照合で修正/削除した主張の数。多い日は要約の事実精度が低下した兆候。");
  const recent = daily.slice(-21);
  const max = Math.max(3, ...recent.map((d) => d.grounding_flags || 0));
  const chart = el("div", "spark-chart");
  for (const d of recent) {
    const col = el("div", "spark-col");
    const g = d.grounding_flags || 0;
    col.title = `${d.date}: ${g} 件修正`;
    const b = el("div", "spark-bar" + (g > 8 ? " is-warn" : g > 0 ? " is-mid" : ""));
    b.style.height = `${Math.max(3, Math.round((g / max) * 100))}%`;
    col.appendChild(b);
    col.appendChild(el("span", "spark-x", d.date.slice(5)));
    chart.appendChild(col);
  }
  s.appendChild(chart);
  return s;
}

// === ③ カテゴリ充足率 ===
function renderCategoryFill(fill) {
  const s = section("カテゴリ充足率", "平均件数 ÷ 上限。低いカテゴリ=ソースが弱い。ソース追加・時間窓調整の判断材料。");
  const rows = Object.entries(fill).sort((a, b) => a[1].fill_rate - b[1].fill_rate);
  for (const [cid, v] of rows) {
    const pct = Math.round(v.fill_rate * 100);
    const tone = pct < 75 ? "warning" : pct < 90 ? "info" : "success";
    s.appendChild(hbarRow(`${CAT_LABEL[cid] || cid}`, `${v.avg}/${v.cap}・${pct}%`, pct, tone));
  }
  return s;
}

// === ④ 図解の型分布 (品質) ===
function renderFigures(stats) {
  const s = section("図解の型分布", `summary-card 比率 ${Math.round(stats.summary_card_share * 100)}%。視覚3型(比較/棒/時系列)が多いほど「一目で分かる」図解。card 偏重は要改善。`);
  const ft = stats.figure_types || {};
  const total = stats.figure_total || 1;
  for (const k of ["comparison", "metric-bars", "timeline", "summary-card"]) {
    const v = ft[k] || 0;
    s.appendChild(hbarRow(FIG_LABEL[k] || k, `${v}・${Math.round((v / total) * 100)}%`, (v / total) * 100, FIG_TONE[k]));
  }
  return s;
}

// === ⑤ スコア分布 ===
function renderScores(bands) {
  const s = section("スコア分布", "選定記事の合計スコア(20点満点)の帯別件数。");
  const total = Object.values(bands).reduce((a, b) => a + b, 0) || 1;
  const order = [["17-20", "必読", "success"], ["13-16", "押さえる", "info"], ["9-12", "余力があれば", "warning"], ["0-8", "選定外", "default"]];
  for (const [band, lbl, tone] of order) {
    const v = bands[band] || 0;
    s.appendChild(hbarRow(`${band}（${lbl}）`, `${v}・${Math.round((v / total) * 100)}%`, (v / total) * 100, tone));
  }
  return s;
}

// === ⑥ 急上昇キーワード ===
function renderRisingTags(rising, tags) {
  const s = section("急上昇キーワード", "直近7日 − その前7日。話題の移り変わりを追う。");
  if (!rising.length) { s.appendChild(el("p", "trends-empty", "（データ蓄積待ち）")); return s; }
  const wrap = el("div", "rising-chips");
  for (const t of rising) {
    const chip = el("span", "rising-chip");
    chip.append(el("span", "rising-tag", `#${t.tag}`), el("span", "rising-delta", `+${t.delta}`));
    chip.title = `直近7日 ${t.recent7} / 前7日 ${t.prev7} / 全期間 ${t.total}`;
    wrap.appendChild(chip);
  }
  s.appendChild(wrap);
  // 全期間トップタグも下部に
  const top = el("div", "alltime-tags");
  top.appendChild(el("span", "alltime-label", "全期間トップ："));
  for (const t of tags.slice(0, 18)) {
    const c = el("span", "alltime-tag", `#${t.tag} ${t.total}`);
    top.appendChild(c);
  }
  s.appendChild(top);
  return s;
}

// === ⑦ ソース健全性 ===
function renderSourceHealth(health, dayCount) {
  const s = section("ソース健全性", "skipped_sources の累積。連続失敗が多いソースは死亡疑い → sources.md のメンテ候補。");
  if (!health.length) { s.appendChild(el("p", "trends-empty", "（失敗ソースなし）")); return s; }
  const list = el("div", "health-list");
  for (const h of health.slice(0, 15)) {
    const row = el("div", "health-row");
    const sev = h.fail_days >= dayCount * 0.5 ? "is-dead" : h.fail_days >= dayCount * 0.25 ? "is-warn" : "";
    row.classList.add(...(sev ? [sev] : []));
    row.appendChild(el("span", "health-src", h.source));
    row.appendChild(el("span", "health-days", `${h.fail_days}/${dayCount}日 失敗`));
    if (h.sample_reason) row.appendChild(el("span", "health-reason", h.sample_reason));
    list.appendChild(row);
  }
  s.appendChild(list);
  return s;
}

// === Top Picks 内訳 (補足) ===
function renderTopPicks(stats) {
  const s = section("Top Picks の内訳", "必読に選ばれた記事のソースタイプ / カテゴリ分布。偏りの点検用。");
  const bySt = stats.top_picks_by_source_type || {};
  const byCat = stats.top_picks_by_category || {};
  const stTotal = Object.values(bySt).reduce((a, b) => a + b, 0) || 1;
  const catTotal = Object.values(byCat).reduce((a, b) => a + b, 0) || 1;
  s.appendChild(el("h3", "trends-subhead", "ソースタイプ別"));
  for (const [k, v] of Object.entries(bySt).sort((a, b) => b[1] - a[1])) {
    s.appendChild(hbarRow(k, `${v}・${Math.round((v / stTotal) * 100)}%`, (v / stTotal) * 100, "primary"));
  }
  s.appendChild(el("h3", "trends-subhead", "カテゴリ別"));
  for (const [k, v] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
    s.appendChild(hbarRow(CAT_LABEL[k] || k, `${v}・${Math.round((v / catTotal) * 100)}%`, (v / catTotal) * 100, "info"));
  }
  return s;
}

async function main() {
  try {
    const res = await fetch(`${STATS_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const stats = await res.json();
    hideStatus();
    els.meta.textContent = `${stats.date_from} 〜 ${stats.date_to}（${stats.day_count} 日分の集計）`;
    els.meta.classList.remove("hidden");
    const r = els.root;
    r.appendChild(renderFunnel(stats.daily || []));
    r.appendChild(renderGrounding(stats.daily || []));
    r.appendChild(renderCategoryFill(stats.category_fill || {}));
    r.appendChild(renderFigures(stats));
    r.appendChild(renderScores(stats.score_bands || {}));
    r.appendChild(renderRisingTags(stats.rising_tags || [], stats.tags || []));
    r.appendChild(renderTopPicks(stats));
    r.appendChild(renderSourceHealth(stats.source_health || [], stats.day_count || 1));
  } catch (err) {
    console.warn("trends load failed", err);
    showStatus("統計データを読み込めませんでした。`node scripts/build-stats.mjs` で data/stats.json を生成してください。", true);
  }
}

main();

// build-stats.mjs — トレンド + 品質ダッシュボード用の集計 (Phase 3-2 / 3-3 / 2-5)。依存ゼロ・冪等。
//
// data/<YYYY-MM-DD>.json を全部読み、/trends/ ページが描画する data/stats.json を生成する。
//   node scripts/build-stats.mjs
//
// 集計内容:
//   - daily        : 日次ファネル (collected→dedup→selected→top_picks) + grounding_flags の推移
//   - category_fill: カテゴリ別の平均件数 / 上限到達日数 (どのバッチが弱いか)
//   - figure_types : 図解 4 型の分布 + summary-card 比率 (視覚化品質の指標)
//   - score_bands  : 選定記事のスコア分布 (17-20 / 13-16 / 9-12 / 0-8)
//   - top_picks_by_*: Top Picks の source_type / category 内訳
//   - source_health: skipped_sources の連続失敗集計 (死亡疑いソース検出)
//   - tags         : タグ頻度 (全期間 total + 直近7日 vs その前7日の momentum)
//
// stats.json は公開対象 (search-index.json と同様 underscore なし)。digest ジョブの
// commit 前に build-search-index / build-feed と並べて実行する想定。

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = "data";
const OUT = path.join(DATA_DIR, "stats.json");
const DATE_RE = /^(\d{4}-\d{2}-\d{2})\.json$/;

// カテゴリ上限 (categories.md の定義)
const CATEGORY_CAPS = {
  new_models: 3, tools_apps: 3, agents: 2, multimodal: 2, research_papers: 3,
  industry_business: 2, regulation_policy: 1, community_buzz: 2, japan: 5, china: 2,
};
// 旧 ID → 新 ID
const CAT_ALIAS = { tools: "tools_apps", research: "research_papers", industry: "industry_business" };
const FIGURE_TYPES = ["comparison", "metric-bars", "timeline", "summary-card"];

function normCat(id) { return CAT_ALIAS[id] || id; }
function scoreBand(total) {
  if (total >= 17) return "17-20";
  if (total >= 13) return "13-16";
  if (total >= 9) return "9-12";
  return "0-8";
}
function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

async function main() {
  let files;
  try {
    files = (await readdir(DATA_DIR)).filter((f) => DATE_RE.test(f)).sort();
  } catch (err) {
    console.warn(`[stats] data/ を読めません: ${err.message}。中断。`);
    return;
  }
  if (files.length === 0) { console.warn("[stats] 日次ファイル 0 件。終了。"); return; }

  const daily = [];
  const catTotals = {}, catDaysAtCap = {}, catDaysPresent = {};
  const figureTypes = Object.fromEntries(FIGURE_TYPES.map((t) => [t, 0]));
  let figureTotal = 0;
  const scoreBands = { "17-20": 0, "13-16": 0, "9-12": 0, "0-8": 0 };
  const tpBySourceType = {}, tpByCategory = {};
  const sourceFail = {}; // source → { days: Set, lastDate, reason }
  const tagTotal = new Map();
  const tagByDate = new Map(); // date → Map(tag→count)
  const lastDate = files[files.length - 1].match(DATE_RE)[1];

  for (const f of files) {
    const date = f.match(DATE_RE)[1];
    let j;
    try { j = JSON.parse(await readFile(path.join(DATA_DIR, f), "utf8")); }
    catch (err) { console.warn(`[stats] ${f} skip: ${err.message}`); continue; }

    const s = j.stats || {};
    daily.push({
      date,
      collected: s.total_collected ?? null,
      dedup: s.after_dedup ?? null,
      selected: s.selected ?? null,
      top_picks: s.top_picks_count ?? null,
      grounding_flags: s.grounding_flags ?? 0,
    });

    // id→item と カテゴリ別件数
    const idIndex = new Map();
    const tagsOfDay = new Map();
    for (const cat of j.categories || []) {
      const cid = normCat(cat.id);
      const items = cat.items || [];
      catTotals[cid] = (catTotals[cid] || 0) + items.length;
      catDaysPresent[cid] = (catDaysPresent[cid] || 0) + 1;
      if (CATEGORY_CAPS[cid] != null && items.length >= CATEGORY_CAPS[cid]) {
        catDaysAtCap[cid] = (catDaysAtCap[cid] || 0) + 1;
      }
      for (const it of items) {
        idIndex.set(it.id, { ...it, _cat: cid });
        // figure 型
        const ft = it.figure?.type;
        if (ft && figureTypes[ft] != null) { figureTypes[ft]++; figureTotal++; }
        // スコア帯
        const tot = it.scores?.total;
        if (typeof tot === "number") scoreBands[scoreBand(tot)]++;
        // タグ
        for (const t of (Array.isArray(it.tags) ? it.tags : [])) {
          tagTotal.set(t, (tagTotal.get(t) || 0) + 1);
          tagsOfDay.set(t, (tagsOfDay.get(t) || 0) + 1);
        }
      }
    }
    tagByDate.set(date, tagsOfDay);

    // Top Picks 内訳
    for (const p of (j.top_picks || [])) {
      const it = idIndex.get(p.id);
      if (!it) continue;
      const st = it.source_type || "unknown";
      tpBySourceType[st] = (tpBySourceType[st] || 0) + 1;
      tpByCategory[it._cat] = (tpByCategory[it._cat] || 0) + 1;
    }

    // ソース健全性 (skipped_sources)
    for (const sk of (j.skipped_sources || [])) {
      const src = sk.source || "(unknown)";
      if (!sourceFail[src]) sourceFail[src] = { days: new Set(), lastDate: date, reason: sk.reason || "" };
      sourceFail[src].days.add(date);
      sourceFail[src].lastDate = date;
      sourceFail[src].reason = sk.reason || sourceFail[src].reason;
    }
  }

  // カテゴリ充足率
  const dayCount = daily.length;
  const categoryFill = {};
  for (const cid of Object.keys(CATEGORY_CAPS)) {
    const present = catDaysPresent[cid] || 0;
    categoryFill[cid] = {
      cap: CATEGORY_CAPS[cid],
      total: catTotals[cid] || 0,
      avg: dayCount ? Math.round(((catTotals[cid] || 0) / dayCount) * 100) / 100 : 0,
      days_at_cap: catDaysAtCap[cid] || 0,
      days_present: present,
      fill_rate: present && CATEGORY_CAPS[cid] ? Math.round(((catTotals[cid] || 0) / (present * CATEGORY_CAPS[cid])) * 100) / 100 : 0,
    };
  }

  // ソース健全性: 連続失敗日数の多い順
  const sourceHealth = Object.entries(sourceFail)
    .map(([source, v]) => ({ source, fail_days: v.days.size, last_fail: v.lastDate, sample_reason: (v.reason || "").slice(0, 80) }))
    .sort((a, b) => b.fail_days - a.fail_days)
    .slice(0, 30);

  // タグ momentum: 直近7日 vs その前7日
  const recent7 = new Set(), prev7 = new Set();
  for (let i = 0; i < daily.length; i++) {
    const d = daily[i].date;
    const ago = daysBetween(d, lastDate);
    if (ago <= 6) recent7.add(d);
    else if (ago <= 13) prev7.add(d);
  }
  const tagRecent = new Map(), tagPrev = new Map();
  for (const [date, tags] of tagByDate) {
    const target = recent7.has(date) ? tagRecent : prev7.has(date) ? tagPrev : null;
    if (!target) continue;
    for (const [t, c] of tags) target.set(t, (target.get(t) || 0) + c);
  }
  const tags = [...tagTotal.entries()]
    .map(([tag, total]) => {
      const r = tagRecent.get(tag) || 0, p = tagPrev.get(tag) || 0;
      return { tag, total, recent7: r, prev7: p, delta: r - p };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 60);
  const risingTags = [...tags]
    .filter((t) => t.delta > 0)
    .sort((a, b) => b.delta - a.delta || b.recent7 - a.recent7)
    .slice(0, 12);

  const summaryCardShare = figureTotal ? Math.round(((figureTypes["summary-card"] || 0) / figureTotal) * 100) / 100 : 0;

  const out = {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    date_from: daily[0]?.date,
    date_to: lastDate,
    day_count: dayCount,
    daily,
    category_fill: categoryFill,
    figure_types: figureTypes,
    figure_total: figureTotal,
    summary_card_share: summaryCardShare,
    score_bands: scoreBands,
    top_picks_by_source_type: tpBySourceType,
    top_picks_by_category: tpByCategory,
    source_health: sourceHealth,
    tags,
    rising_tags: risingTags,
  };

  await writeFile(OUT, JSON.stringify(out) + "\n", "utf8");
  console.log(
    `[stats] ${OUT} 生成: ${dayCount} 日 / figure ${figureTotal} (summary-card ${Math.round(summaryCardShare * 100)}%) / ` +
    `tags ${tags.length} / source_health ${sourceHealth.length} 件`,
  );
}

main().catch((err) => {
  console.warn(`[stats] 想定外エラー (無視して終了): ${err?.message}`);
});

// 検索インデックス生成 (Phase F-3)。
// data/<YYYY-MM-DD>.json を全部読み、検索用の軽量 data/search-index.json を作る。
// daily-digest.yml の digest ジョブで Commit の前に実行 (送信前処理と同じ後処理パターン)。
//
//   node scripts/build-search-index.mjs
//
// 設計方針:
// - 依存ゼロ (node 標準のみ)、冪等
// - figure / reaction_signal など重い・検索不要なフィールドは除外
// - 読めない日次ファイルはスキップして警告 (1 件でも失敗で全体を壊さない)
// - 生成に失敗 (item 0 件) なら既存 search-index.json を温存し空で上書きしない

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = "data";
const OUT_PATH = path.join(DATA_DIR, "search-index.json");
const DATE_RE = /^(\d{4}-\d{2}-\d{2})\.json$/;

async function main() {
  let files;
  try {
    files = (await readdir(DATA_DIR)).filter((f) => DATE_RE.test(f)).sort();
  } catch (err) {
    console.warn(`[search-index] data/ を読めません: ${err.message}。中断。`);
    return;
  }
  if (files.length === 0) {
    console.warn("[search-index] 日次ファイルが 0 件。既存 index を温存して終了。");
    return;
  }

  const items = [];
  const tagCount = new Map();
  let okFiles = 0;

  for (const f of files) {
    const date = f.match(DATE_RE)[1];
    let json;
    try {
      json = JSON.parse(await readFile(path.join(DATA_DIR, f), "utf8"));
    } catch (err) {
      console.warn(`[search-index] ${f} をスキップ: ${err.message}`);
      continue;
    }
    okFiles++;
    for (const cat of json.categories ?? []) {
      for (const it of cat.items ?? []) {
        const tags = Array.isArray(it.tags) ? it.tags : [];
        for (const t of tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
        items.push({
          id: it.id ?? "",
          date,
          title: it.title ?? "",
          title_ja: it.title_ja ?? "",
          summary_ja: it.summary_ja ?? "",
          key_points_ja: Array.isArray(it.key_points_ja) ? it.key_points_ja : [],
          tags,
          url: it.url ?? "",
          source: it.source ?? "",
          source_label: it.source_label ?? it.source ?? "",
          category: cat.id ?? it.category ?? "",
          lang: it.lang ?? "en",
          score: it.scores?.total ?? 0,
        });
      }
    }
  }

  if (items.length === 0) {
    console.warn(
      `[search-index] item 0 件 (読めたファイル ${okFiles}/${files.length})。既存 index を温存して終了。`,
    );
    return;
  }

  // 新しい日付 → 古い日付、同日は score 降順
  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.score - a.score));

  const allTags = [...tagCount.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  const dates = files.map((f) => f.match(DATE_RE)[1]);
  const out = {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    item_count: items.length,
    date_from: dates[0],
    date_to: dates[dates.length - 1],
    all_tags: allTags,
    items,
  };

  await writeFile(OUT_PATH, JSON.stringify(out) + "\n", "utf8");
  const kb = Math.round(Buffer.byteLength(JSON.stringify(out)) / 1024);
  console.log(
    `[search-index] 生成完了: ${items.length} items / ${allTags.length} tags / ${okFiles} files / ${kb}KB → ${OUT_PATH}`,
  );
}

main().catch((err) => {
  // digest ジョブを落とさない
  console.warn(`[search-index] 想定外エラー (無視して終了): ${err?.message}`);
});

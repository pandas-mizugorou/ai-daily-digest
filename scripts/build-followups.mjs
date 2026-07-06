// 続報トラッキング (Phase 3-1)。
// data/<YYYY-MM-DD>.json を全部読み、同一記事 (正規化 URL が一致) が複数日に
// 登場した「続報チェーン」を data/followups.json に書き出す。
//
//   node scripts/build-followups.mjs
//
// 設計方針:
// - 依存ゼロ (node 標準 + url-normalize.mjs のみ)、冪等 (毎回フルリビルド)
// - 連結キーは正規化 URL のみ。item.id は日をまたいで安定しない実測があるため使わない。
//   タイトル類似度などの曖昧な連結は誤リンク (偽の続報) を生むためやらない (正確性優先)。
// - 過去の日次 JSON は書き換えない (公開派生物として stats.json / search-index.json と同格)
// - 生成に失敗 (チェーン 0 本) なら既存 followups.json を温存し空で上書きしない
//
// 出力スキーマ:
//   chains[]  : { key, url, title, title_ja, first_seen, last_seen, count, occurrences[] }
//               occurrences[] = { date, id, category, rank? } (時系列昇順。rank は Top Picks 選出時のみ)
//   by_item   : { "date|id": { chain: <chains index>, nth: <この記事が何回目か 1-based> } }
//               フロントは (date, id) から O(1) で自分の所属チェーンを引ける

import { readdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { urlKey } from "./url-normalize.mjs";

const DATA_DIR = "data";
const OUT_PATH = path.join(DATA_DIR, "followups.json");
const DATE_RE = /^(\d{4}-\d{2}-\d{2})\.json$/;

async function main() {
  let files;
  try {
    files = (await readdir(DATA_DIR)).filter((f) => DATE_RE.test(f)).sort();
  } catch (err) {
    console.warn(`[followups] data/ を読めません: ${err.message}。中断。`);
    return;
  }
  if (files.length === 0) {
    console.warn("[followups] 日次ファイルが 0 件。既存 followups.json を温存して終了。");
    return;
  }

  // 正規化 URL → 出現リスト
  const byUrl = new Map();
  let okFiles = 0;
  for (const f of files) {
    const date = f.match(DATE_RE)[1];
    let json;
    try {
      json = JSON.parse(await readFile(path.join(DATA_DIR, f), "utf8"));
    } catch (err) {
      console.warn(`[followups] ${f} をスキップ: ${err.message}`);
      continue;
    }
    okFiles++;
    // Top Picks の rank を (date, id) で引けるようにしておく
    const rankOf = new Map();
    for (const tp of Array.isArray(json.top_picks) ? json.top_picks : []) {
      if (tp && typeof tp.id === "string") rankOf.set(tp.id, tp.rank);
    }
    for (const cat of json.categories ?? []) {
      for (const it of cat.items ?? []) {
        if (!it || typeof it.url !== "string" || it.url.trim() === "") continue;
        const key = urlKey(it.url);
        if (!byUrl.has(key)) byUrl.set(key, []);
        byUrl.get(key).push({
          date,
          id: typeof it.id === "string" ? it.id : "",
          category: cat.id ?? it.category ?? "",
          title: it.title ?? "",
          title_ja: it.title_ja ?? "",
          url: it.url,
          ...(rankOf.has(it.id) ? { rank: rankOf.get(it.id) } : {}),
        });
      }
    }
  }

  // 2 日以上に出現した URL のみチェーン化 (同日重複はチェーンにしない)
  const chains = [];
  for (const [key, occ] of byUrl) {
    const dates = new Set(occ.map((o) => o.date));
    if (dates.size < 2) continue;
    occ.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const last = occ[occ.length - 1];
    chains.push({
      key,
      url: last.url,
      title: last.title,
      title_ja: last.title_ja,
      first_seen: occ[0].date,
      last_seen: last.date,
      count: occ.length,
      occurrences: occ.map(({ date, id, category, rank }) => ({
        date, id, category, ...(rank != null ? { rank } : {}),
      })),
    });
  }
  chains.sort((a, b) => (a.last_seen < b.last_seen ? 1 : a.last_seen > b.last_seen ? -1 : b.count - a.count));

  if (chains.length === 0) {
    // データ揃い立ての初期状態でしか起きないはずだが、既存ファイルは温存する
    try {
      await access(OUT_PATH);
      console.warn("[followups] チェーン 0 本。既存 followups.json を温存して終了。");
      return;
    } catch { /* 初回は空でも書く */ }
  }

  const byItem = {};
  chains.forEach((c, ci) => {
    c.occurrences.forEach((o, oi) => {
      if (o.id) byItem[`${o.date}|${o.id}`] = { chain: ci, nth: oi + 1 };
    });
  });

  const out = {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    chain_count: chains.length,
    chains,
    by_item: byItem,
  };
  await writeFile(OUT_PATH, JSON.stringify(out) + "\n", "utf8");
  const kb = Math.round(Buffer.byteLength(JSON.stringify(out)) / 1024);
  console.log(
    `[followups] 生成完了: ${chains.length} チェーン (最長 ${chains.reduce((m, c) => Math.max(m, c.count), 0)} 回) / ${okFiles} files / ${kb}KB → ${OUT_PATH}`,
  );
}

main().catch((err) => {
  // digest ジョブを落とさない
  console.warn(`[followups] 想定外エラー (無視して終了): ${err?.message}`);
});

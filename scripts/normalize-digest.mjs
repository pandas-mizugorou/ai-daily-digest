// 図解スキーマ正規化 (Claude 出力後・commit 前)。
// data/<YYYY-MM-DD>.json 内の全 item.figure を、フラット旧スキーマ →
// 正準スキーマ ({type, data:{...}}) へ決定論的に書き換える。
// レンダラ (assets/figure.js) と同じ assets/figure-normalize.js を共有して
// 二重実装＝再ドリフトを防ぐ。
//
//   node scripts/normalize-digest.mjs data/2026-05-30.json
//   node scripts/normalize-digest.mjs --all          # data/*.json を全部
//
// 設計方針:
// - 依存ゼロ (node 標準 + 共有 ESM のみ)、冪等 (2 回目以降は変更ゼロ)
// - figure を 1 件も変更しなければファイルを書き換えない (差分ノイズ・整形churn回避)
// - alt / narrative / impact など「記事の意味」依存の欠落は補わない (創作禁止)。
//   それは validate-digest.mjs が警告する役割
// - 読めない / 壊れたファイルはスキップして警告 (1 件で全体を壊さない)

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeFigure } from "../assets/figure-normalize.js";

const DATA_DIR = "data";
const DATE_RE = /^(\d{4}-\d{2}-\d{2})\.json$/;

// obj 以下を再帰し、`figure` (object かつ string type を持つ) を見つけたら正規化して置換。
// 変更があった件数を返す。
function normalizeFiguresInPlace(root, refNow) {
  let changed = 0;
  const visit = (node) => {
    if (Array.isArray(node)) {
      for (const x of node) visit(x);
      return;
    }
    if (!node || typeof node !== "object") return;
    if (node.figure && typeof node.figure === "object" && typeof node.figure.type === "string") {
      const before = JSON.stringify(node.figure);
      const after = normalizeFigure(node.figure, refNow);
      const afterStr = JSON.stringify(after);
      if (afterStr !== before) {
        node.figure = after;
        changed++;
      }
    }
    for (const k of Object.keys(node)) {
      if (k === "figure") continue;
      visit(node[k]);
    }
  };
  visit(root);
  return changed;
}

async function processFile(file) {
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch (err) {
    console.warn(`[normalize] ${file} を読めません: ${err.message}。スキップ。`);
    return { file, changed: 0, skipped: true };
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    console.warn(`[normalize] ${file} は不正な JSON: ${err.message}。スキップ。`);
    return { file, changed: 0, skipped: true };
  }
  // timeline の status 判定は「そのダイジェストの日付」を基準にする (今日ではなく)。
  const refNow = data && typeof data.date === "string" && !isNaN(Date.parse(data.date))
    ? Date.parse(data.date)
    : undefined;
  const changed = normalizeFiguresInPlace(data, refNow);
  if (changed > 0) {
    await writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
    console.log(`[normalize] ${file}: ${changed} 件の figure を正準化`);
  } else {
    console.log(`[normalize] ${file}: 変更なし (既に正準 or figure なし)`);
  }
  return { file, changed, skipped: false };
}

async function main() {
  const args = process.argv.slice(2);
  let files = [];
  if (args.includes("--all")) {
    try {
      files = (await readdir(DATA_DIR))
        .filter((f) => DATE_RE.test(f))
        .sort()
        .map((f) => path.join(DATA_DIR, f));
    } catch (err) {
      console.warn(`[normalize] ${DATA_DIR}/ を読めません: ${err.message}。中断。`);
      return;
    }
  } else {
    files = args.filter((a) => !a.startsWith("--"));
  }
  if (files.length === 0) {
    console.warn("[normalize] 対象ファイルなし。使い方: node scripts/normalize-digest.mjs <data/YYYY-MM-DD.json | --all>");
    return;
  }
  let total = 0;
  for (const f of files) {
    const r = await processFile(f);
    total += r.changed;
  }
  console.log(`[normalize] 完了: 合計 ${total} 件の figure を正準化 (${files.length} ファイル)`);
}

main().catch((err) => {
  // フェイルセーフ: 正規化の失敗で公開パイプラインを止めない
  console.warn(`[normalize] 想定外エラー: ${err.message}。スキップ。`);
});

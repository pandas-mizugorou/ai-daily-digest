// 図解スキーマ検証ゲート (normalize の後・commit の前)。
// data/<YYYY-MM-DD>.json 内の全 item.figure が、レンダラが期待する正準契約
// (assets/digest-schema.json 相当) を満たすかを検証する。
//
//   node scripts/validate-digest.mjs data/2026-05-30.json
//   node scripts/validate-digest.mjs --all            # data/*.json を全部
//   node scripts/validate-digest.mjs <file> --strict  # errors>0 で exit 1
//
// 2 段階で問題を分類する:
//   - errors   : 構造破綻。図がまともに描画されない (data 欠落 / 型不正 / 必須配列が空 /
//                バー幅 _pct 欠落・範囲外 / 必須ラベル欠落)。normalize 後はほぼ 0 のはず。
//   - warnings : 「記事の意味」依存で normalize が補えない内容ギャップ
//                (alt 欠落/字数不足 / narrative・impact 欠落 / summary-card 偏重 等)。
//                → 生成プロンプト側で埋めるべき項目。品質改善の指標として可視化する。
//
// 設計方針: 依存ゼロ、フェイルセーフ。レポートを data/_validation/<date>.json に書き出し、
// 標準出力にも要約。CI では continue-on-error で公開を止めない (既定 exit 0)。

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { FIGURE_TYPES } from "../assets/figure-normalize.js";

const DATA_DIR = "data";
const REPORT_DIR = path.join(DATA_DIR, "_validation");
const DATE_RE = /^(\d{4}-\d{2}-\d{2})\.json$/;

const ALT_MIN = 60, ALT_MAX = 280;

const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const inRange = (v) => typeof v === "number" && isFinite(v) && v >= 0 && v <= 100;

// 1 つの figure を検証。{errors:[], warnings:[]} を返す (フィールド名のリスト)。
function validateFigure(fig) {
  const errors = [];
  const warnings = [];
  const E = (m) => errors.push(m);
  const W = (m) => warnings.push(m);

  if (!fig || typeof fig !== "object") { E("figure がオブジェクトでない"); return { errors, warnings }; }
  if (!FIGURE_TYPES.includes(fig.type)) { E(`type が不正: ${fig.type}`); return { errors, warnings }; }
  const d = fig.data;
  if (!d || typeof d !== "object") { E("data ラッパーが無い (フラットスキーマの疑い)"); return { errors, warnings }; }

  // alt は a11y 必須。normalize では補えないので warning (生成側で埋める)。
  if (!isStr(fig.alt)) W("alt 欠落 (a11y / スクリーンリーダー用)");
  else if (fig.alt.trim().length < ALT_MIN || fig.alt.trim().length > ALT_MAX) W(`alt 字数が範囲外 (${fig.alt.trim().length}字, 目安 ${ALT_MIN}-${ALT_MAX})`);

  if (!isStr(d.headline)) E("data.headline 欠落");

  if (fig.type === "comparison") {
    if (!isStr(d.before?.label)) E("before.label 欠落");
    if (!isStr(d.after?.label)) E("after.label 欠落");
    const m = Array.isArray(d.metrics) ? d.metrics : [];
    if (m.length < 2) E(`metrics が ${m.length} 件 (2-6 必須)`);
    else if (m.length > 6) W(`metrics が ${m.length} 件 (6 件超は詰まる)`);
    m.forEach((x, i) => {
      if (!isStr(x.label)) E(`metrics[${i}].label 欠落`);
      if (!isStr(x.before)) E(`metrics[${i}].before 欠落`);
      if (!isStr(x.after)) E(`metrics[${i}].after 欠落`);
      if (!inRange(x.before_pct)) E(`metrics[${i}].before_pct がバー幅にならない (${x.before_pct})`);
      if (!inRange(x.after_pct)) E(`metrics[${i}].after_pct がバー幅にならない (${x.after_pct})`);
      if (!isStr(x.delta_tone)) W(`metrics[${i}].delta_tone 欠落 (色分けされない)`);
    });
  } else if (fig.type === "metric-bars") {
    const b = Array.isArray(d.bars) ? d.bars : [];
    if (b.length < 2) E(`bars が ${b.length} 件 (2-7 必須、1 本では棒グラフの意味がない)`);
    else if (b.length > 7) W(`bars が ${b.length} 件 (7 件超は詰まる)`);
    b.forEach((x, i) => {
      if (!isStr(x.label)) E(`bars[${i}].label 欠落`);
      if (!isStr(x.value)) E(`bars[${i}].value 欠落`);
      if (!inRange(x.pct)) E(`bars[${i}].pct がバー幅にならない (${x.pct})`);
      if (!isStr(x.tone)) W(`bars[${i}].tone 欠落`);
    });
  } else if (fig.type === "timeline") {
    const ev = Array.isArray(d.events) ? d.events : [];
    if (ev.length < 2) E(`events が ${ev.length} 件 (2-7 必須)`);
    else if (ev.length > 7) W(`events が ${ev.length} 件 (7 件超は詰まる)`);
    ev.forEach((x, i) => {
      if (!isStr(x.when)) E(`events[${i}].when 欠落`);
      if (!isStr(x.label)) E(`events[${i}].label 欠落`);
      if (!["past", "now", "upcoming"].includes(x.status)) E(`events[${i}].status 不正 (${x.status})`);
      if (!isStr(x.description)) W(`events[${i}].description 欠落 (各イベントの中身)`);
    });
    if (!ev.some((x) => x.status === "now")) W("status=now のイベントが無い (当該ニュースが強調されない)");
  } else if (fig.type === "summary-card") {
    if (!isStr(d.tldr)) W("summary-card の tldr 欠落");
    const p = Array.isArray(d.points) ? d.points : [];
    if (p.length < 2) E(`points が ${p.length} 件 (2-6 必須)`);
    else if (p.length > 6) W(`points が ${p.length} 件 (6 件超)`);
    p.forEach((x, i) => {
      if (!isStr(x.label)) E(`points[${i}].label 欠落`);
      if (!isStr(x.value) && !isStr(x.description)) E(`points[${i}] が空 (value/description どちらも無い)`);
    });
    if (!isStr(d.context)) W("summary-card の context 欠落");
  }

  // narrative / impact は全型で強く推奨 (背景・読者影響)。normalize では補えない。
  if (fig.type !== "summary-card" && !isStr(d.narrative)) W("narrative 欠落 (業界文脈)");
  if (!isStr(d.impact)) W("impact 欠落 (読者への影響)");

  return { errors, warnings };
}

// data 以下を再帰し、figure を持つ item を集める (最寄りの id を文脈として保持)。
function collectFigures(root) {
  const found = [];
  const visit = (node, ctxId) => {
    if (Array.isArray(node)) { for (const x of node) visit(x, ctxId); return; }
    if (!node || typeof node !== "object") return;
    const id = isStr(node.id) ? node.id : ctxId;
    if (node.figure && typeof node.figure === "object") {
      found.push({ id: id || "(no id)", figure: node.figure });
    }
    for (const k of Object.keys(node)) {
      if (k === "figure") continue;
      visit(node[k], id);
    }
  };
  visit(root, null);
  return found;
}

async function processFile(file) {
  let data;
  try {
    data = JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    console.warn(`[validate] ${file} を読めない/不正 JSON: ${err.message}。スキップ。`);
    return null;
  }
  const figs = collectFigures(data);
  const byType = {};
  const errors = [];
  const warnings = [];
  for (const { id, figure } of figs) {
    byType[figure.type] = (byType[figure.type] || 0) + 1;
    const r = validateFigure(figure);
    r.errors.forEach((m) => errors.push({ id, type: figure.type, msg: m }));
    r.warnings.forEach((m) => warnings.push({ id, type: figure.type, msg: m }));
  }
  const summaryCardShare = figs.length ? (byType["summary-card"] || 0) / figs.length : 0;
  const report = {
    file,
    checked_figures: figs.length,
    by_type: byType,
    summary_card_share: Math.round(summaryCardShare * 100) / 100,
    error_count: errors.length,
    warning_count: warnings.length,
    errors,
    warnings,
  };
  return report;
}

function printReport(r) {
  const flat = (r.by_type["comparison"] || 0) + (r.by_type["metric-bars"] || 0) + (r.by_type["timeline"] || 0);
  console.log(`\n=== ${r.file} ===`);
  console.log(`  図解 ${r.checked_figures} 件  ${JSON.stringify(r.by_type)}`);
  console.log(`  summary-card 比率: ${Math.round(r.summary_card_share * 100)}%  / 視覚3型: ${flat} 件`);
  console.log(`  errors: ${r.error_count}  warnings: ${r.warning_count}`);
  const show = (arr, label, n = 12) => {
    if (!arr.length) return;
    console.log(`  --- ${label} (先頭 ${Math.min(n, arr.length)}/${arr.length}) ---`);
    arr.slice(0, n).forEach((e) => console.log(`    [${e.type}] ${e.id}: ${e.msg}`));
  };
  show(r.errors, "ERRORS");
  show(r.warnings, "WARNINGS");
}

async function main() {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  let files = [];
  if (args.includes("--all")) {
    try {
      files = (await readdir(DATA_DIR)).filter((f) => DATE_RE.test(f)).sort().map((f) => path.join(DATA_DIR, f));
    } catch (err) {
      console.warn(`[validate] ${DATA_DIR}/ を読めません: ${err.message}。中断。`);
      return;
    }
  } else {
    files = args.filter((a) => !a.startsWith("--"));
  }
  if (files.length === 0) {
    console.warn("[validate] 対象なし。使い方: node scripts/validate-digest.mjs <data/YYYY-MM-DD.json | --all> [--strict]");
    return;
  }

  let totalErrors = 0;
  const reports = [];
  for (const f of files) {
    const r = await processFile(f);
    if (!r) continue;
    reports.push(r);
    totalErrors += r.error_count;
    printReport(r);
    // 単一ファイル指定時は日付別レポートを書き出す
    if (!args.includes("--all")) {
      const m = path.basename(f).match(DATE_RE);
      if (m) {
        try {
          await mkdir(REPORT_DIR, { recursive: true });
          await writeFile(path.join(REPORT_DIR, `${m[1]}.json`), JSON.stringify(r, null, 2) + "\n", "utf8");
        } catch (err) {
          console.warn(`[validate] レポート書き出し失敗: ${err.message}`);
        }
      }
    }
  }

  // GitHub Actions のステップサマリにも要約を出す (あれば)
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = ["### 図解スキーマ検証", "", "| file | 図解 | summary-card | errors | warnings |", "|---|---|---|---|---|"];
    for (const r of reports) {
      lines.push(`| ${path.basename(r.file)} | ${r.checked_figures} | ${Math.round(r.summary_card_share * 100)}% | ${r.error_count} | ${r.warning_count} |`);
    }
    try { await writeFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n", { flag: "a" }); } catch { /* noop */ }
  }

  console.log(`\n[validate] 完了: ${reports.length} ファイル / errors 合計 ${totalErrors}`);
  if (strict && totalErrors > 0) {
    console.error(`[validate] --strict: errors ${totalErrors} 件のため exit 1`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  // フェイルセーフ: 検証自体の失敗で公開を止めない
  console.warn(`[validate] 想定外エラー: ${err.message}。スキップ。`);
});

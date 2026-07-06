// SKILL.md YAML frontmatter の検証 (2026-07-03 事故の再発防止)。
// b9a9554 で description をクォートなしに書き換えた際、値中の「引数: --dry-run」の
// コロンで YAML が壊れ、Claude Code が起動即エラー → digest 4 回連続未生成になった。
// push 時 (lint-skill.yml) にこのクラスの破損を検出して即座に気づけるようにする。
//
//   node scripts/lint-skill-frontmatter.mjs            # .claude/skills/**/SKILL.md を全部
//   node scripts/lint-skill-frontmatter.mjs <file...>  # 指定ファイルのみ
//
// 設計方針:
// - js-yaml が在れば厳密パース (CI では npm install --no-save js-yaml して使う)
// - 無ければ依存ゼロのヒューリスティック検査にフォールバック
//   (クォートなしスカラー値の途中に「: 」が現れる = 今回の事故と同型、を検出)
// - エラーがあれば exit 1

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const SKILLS_DIR = path.join(".claude", "skills");

async function findSkillFiles() {
  const files = [];
  try {
    for (const dir of await readdir(SKILLS_DIR, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      files.push(path.join(SKILLS_DIR, dir.name, "SKILL.md"));
    }
  } catch {
    /* skills ディレクトリ無し */
  }
  return files;
}

function extractFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
  return m ? m[1] : null;
}

// 依存ゼロのフォールバック検査。YAML の完全再実装はしない。
// 「key: 値 (クォートなし) の値の途中に ': ' が現れる」パターンだけを狙い撃つ。
// js-yaml が入らなかった環境の保険。YAML の完全再実装はしないので、CI (js-yaml あり)
// より検出力は落ちる。ここで狙い撃つのは誤検出ゼロで確実に判定できる破損クラスに限る:
//   (1) クォートなしの値中コロン (7/3 事故の実型)
//   (2) インデントへのタブ混入
//   (3) 前が値付きキーなのに次行が深くインデントされた誤ネスト
// それ以外の複雑な破損 (フロー記法の閉じ忘れ等) は js-yaml (CI 主経路) に委ねる。
// lineNo は「開始 --- を除いた本文」相対なので +2 してファイル行 (--- が 1 行目) に合わせる。
function heuristicCheck(fm) {
  const errors = [];
  const lines = fm.split(/\r?\n/);
  const fileLine = (i) => i + 2; // fm 本文 i 行目 = ファイル (i+1)+1 行目 (--- 分)
  let inBlockScalar = false;
  let blockIndent = 0;
  let prevKeyHadValue = false; // 直前のキー行が「値付き」だったか (値付きキーは子を持てない)
  let prevIndent = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inBlockScalar) {
      if (line.trim() === "" || line.search(/\S/) > blockIndent) continue;
      inBlockScalar = false;
    }
    if (line.trim() === "") continue;
    // タブインデント: YAML はインデントにタブを禁止 (js-yaml もエラー)
    if (/\t/.test(line.match(/^\s*/)[0])) {
      errors.push(`${fileLine(i)} 行目: インデントにタブ文字が使われています (YAML はタブ禁止)`);
      continue;
    }
    const kv = line.match(/^(\s*)([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const [, indent, , rawVal] = kv;
    // 値付きスカラーキーの直後に、より深いインデントのキーが来たら誤ネスト
    // (例: `name: test` の次行が `  description: ...`)
    if (prevKeyHadValue && indent.length > prevIndent) {
      errors.push(`${fileLine(i)} 行目: 値を持つキーの下がインデントされています (マッピングの誤ネスト/インデント異常の疑い)`);
    }
    const val = rawVal.trim();
    if (val === "" || val === "|" || val === ">" || /^[|>][+-]?$/.test(val)) {
      // 値なしキー or ブロックスカラー = 次行に内容が続くので「値なし」扱い (誤ネスト判定用)
      prevKeyHadValue = false;
      prevIndent = indent.length;
      if (/^[|>]/.test(val)) {
        inBlockScalar = true;
        blockIndent = indent.length;
      }
      continue;
    }
    const quoted = /^["'].*["']$/.test(val);
    if (!quoted && /\S: /.test(val)) {
      errors.push(
        `${fileLine(i)} 行目: クォートなしの値の途中に ": " があります (YAML が壊れる典型パターン)。値をダブルクォートで囲んでください → ${val.slice(0, 60)}…`,
      );
    }
    // 値付きスカラーキー: 次行が深インデントなら誤ネスト (上の判定で使う)
    prevKeyHadValue = true;
    prevIndent = indent.length;
  }
  return errors;
}

async function lintFile(file) {
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch (err) {
    return [`読めません: ${err.message}`];
  }
  const fm = extractFrontmatter(text);
  if (fm == null) return [`YAML frontmatter (--- ... ---) が見つかりません`];

  // js-yaml が入っていれば厳密パース。
  // js-yaml v4/v5 は純 ESM で default export を持たず named の `load` を出す。
  // 一方 CJS 版や古い版は default 側に載る。両対応するため `.load` の在り処で判定する
  // ((await import("js-yaml")).default だけ見ると v5 で undefined になり厳密パースが死ぬ)。
  let yaml = null;
  try {
    const mod = await import("js-yaml");
    if (typeof mod.load === "function") yaml = mod;
    else if (typeof mod.default?.load === "function") yaml = mod.default;
  } catch {
    /* フォールバックへ */
  }
  if (yaml) {
    try {
      const doc = yaml.load(fm);
      const errors = [];
      if (!doc || typeof doc !== "object") errors.push("frontmatter がオブジェクトになりません");
      else {
        if (typeof doc.name !== "string" || doc.name.trim() === "") errors.push("name がありません");
        if (typeof doc.description !== "string" || doc.description.trim() === "") errors.push("description がありません");
      }
      return errors;
    } catch (err) {
      return [`YAML パースエラー: ${err.message.split("\n")[0]}`];
    }
  }
  return heuristicCheck(fm);
}

async function main() {
  const args = process.argv.slice(2);
  const files = args.length > 0 ? args : await findSkillFiles();
  if (files.length === 0) {
    console.log("[lint-skill] 対象なし (SKILL.md が見つかりません)");
    return;
  }
  let failed = 0;
  for (const f of files) {
    const errors = await lintFile(f);
    if (errors.length === 0) {
      console.log(`[lint-skill] OK: ${f}`);
    } else {
      failed++;
      console.error(`[lint-skill] NG: ${f}`);
      for (const e of errors) console.error(`  - ${e}`);
    }
  }
  if (failed > 0) {
    console.error(`[lint-skill] ${failed} ファイルに問題があります`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`[lint-skill] 想定外エラー: ${err.message}`);
  process.exitCode = 1;
});

// build-feed.mjs — RSS 2.0 フィード生成 (Phase 2-3)。依存ゼロ・冪等。
//
// 2 本生成する:
//   feed.xml        … 1 エントリ = 1 日 (直近 30 日)。headline + 総括 + Top Picks タイトル列挙。
//                     「毎朝のダイジェスト全体」を RSS リーダーで追う人向け。
//   feed-items.xml  … 1 エントリ = 1 記事 (直近 14 日の Top Picks)。title_ja + summary_ja。
//                     「必読記事だけ」を流し読みする人向け。
//
//   node scripts/build-feed.mjs
//
// digest ジョブの commit 前に build-search-index.mjs と並べて実行する想定。
// 公開サイトは静的なので Atom より RSS 2.0 が枯れていて確実。Service Worker は
// data/*.json と同じ network-first 扱いにする (キャッシュ更新は SW VERSION 側で管理)。

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = "data";
const SITE = "https://pandas-mizugorou.github.io/ai-daily-digest";
const DATE_RE = /^(\d{4}-\d{2}-\d{2})\.json$/;
const DAY_FEED_LIMIT = 30;
const ITEM_FEED_DAYS = 14;

function xmlEscape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// YYYY-MM-DD (JST) → RFC822。digest は朝 5:00 JST 基準なので時刻はそれに寄せる。
function rfc822(ymd, hour = 5) {
  const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return new Date().toUTCString();
  // JST 05:00 を UTC に変換 (= 前日 20:00 UTC)
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hour - 9, 0, 0));
  return d.toUTCString();
}

function pickTitle(it) {
  const ja = (it.title_ja || "").trim();
  const en = (it.title || "").trim();
  const lang = (it.lang || "").toLowerCase();
  if (lang === "en" || lang === "zh") return ja || en || "(無題)";
  return en || ja || "(無題)";
}

async function readJson(file) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { return null; }
}

async function main() {
  let files;
  try {
    files = (await readdir(DATA_DIR)).filter((f) => DATE_RE.test(f)).sort().reverse(); // 新しい順
  } catch (err) {
    console.warn(`[feed] data/ を読めません: ${err.message}。中断。`);
    return;
  }
  if (files.length === 0) {
    console.warn("[feed] 日次ファイル 0 件。既存フィードを温存して終了。");
    return;
  }

  // --- feed.xml: 1 エントリ = 1 日 ---
  const dayItems = [];
  for (const f of files.slice(0, DAY_FEED_LIMIT)) {
    const date = f.match(DATE_RE)[1];
    const j = await readJson(path.join(DATA_DIR, f));
    if (!j) continue;
    const idIndex = new Map();
    for (const c of j.categories || []) for (const it of c.items || []) idIndex.set(it.id, it);
    const picks = (j.top_picks || [])
      .map((p) => idIndex.get(p.id)).filter(Boolean)
      .map((it) => `・${pickTitle(it)}`);
    const body = [
      j.summary_ja || j.headline || "",
      picks.length ? "\n\n【今日の必読】\n" + picks.join("\n") : "",
    ].join("");
    dayItems.push(
      `    <item>\n` +
      `      <title>${xmlEscape((j.headline || `AI Daily Digest ${date}`).slice(0, 140))}</title>\n` +
      `      <link>${SITE}/#${date}</link>\n` +
      `      <guid isPermaLink="false">aidd-day-${date}</guid>\n` +
      `      <pubDate>${rfc822(date)}</pubDate>\n` +
      `      <description>${xmlEscape(body)}</description>\n` +
      `    </item>`,
    );
  }
  const dayFeed =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0">\n  <channel>\n` +
    `    <title>AI Daily Digest</title>\n` +
    `    <link>${SITE}/</link>\n` +
    `    <description>押さえるべき AI / 生成 AI ニュースの日次ダイジェスト（今日の必読 Top 5-7 + カテゴリ別）</description>\n` +
    `    <language>ja</language>\n` +
    `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n` +
    dayItems.join("\n") + "\n" +
    `  </channel>\n</rss>\n`;
  await writeFile(path.join(DATA_DIR, "..", "feed.xml"), dayFeed, "utf8");

  // --- feed-items.xml: 1 エントリ = 1 記事 (直近 14 日の Top Picks) ---
  const itemEntries = [];
  const seen = new Set();
  for (const f of files.slice(0, ITEM_FEED_DAYS)) {
    const date = f.match(DATE_RE)[1];
    const j = await readJson(path.join(DATA_DIR, f));
    if (!j) continue;
    const idIndex = new Map();
    for (const c of j.categories || []) for (const it of c.items || []) idIndex.set(it.id, it);
    for (const p of (j.top_picks || [])) {
      const it = idIndex.get(p.id);
      if (!it || !it.url || seen.has(it.url)) continue;
      seen.add(it.url);
      itemEntries.push(
        `    <item>\n` +
        `      <title>${xmlEscape(pickTitle(it).slice(0, 160))}</title>\n` +
        `      <link>${xmlEscape(it.url)}</link>\n` +
        `      <guid isPermaLink="false">aidd-item-${xmlEscape(it.id || it.url)}</guid>\n` +
        `      <pubDate>${rfc822(it.published_at || date)}</pubDate>\n` +
        `      <source url="${SITE}/#${date}/${xmlEscape(it.id || "")}">AI Daily Digest ${date}</source>\n` +
        `      <description>${xmlEscape((it.summary_ja || "").slice(0, 600))}</description>\n` +
        `    </item>`,
      );
    }
  }
  const itemFeed =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0">\n  <channel>\n` +
    `    <title>AI Daily Digest — 必読記事</title>\n` +
    `    <link>${SITE}/</link>\n` +
    `    <description>AI Daily Digest の「今日の必読」記事のみ（直近 ${ITEM_FEED_DAYS} 日）</description>\n` +
    `    <language>ja</language>\n` +
    `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n` +
    itemEntries.join("\n") + "\n" +
    `  </channel>\n</rss>\n`;
  await writeFile(path.join(DATA_DIR, "..", "feed-items.xml"), itemFeed, "utf8");

  console.log(`[feed] feed.xml (${dayItems.length} 日) / feed-items.xml (${itemEntries.length} 記事) を生成`);
}

main().catch((err) => {
  console.warn(`[feed] 想定外エラー (無視して終了): ${err?.message}`);
});

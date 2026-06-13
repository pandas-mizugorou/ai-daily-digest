// collect.mjs — AI Daily Digest 収集層の決定論化 (SKILL.md Step 2-5 の機械化部分)
//
// ■ 何をするか:
//   RSS / JSON API で安定取得できるソース (約40-50) を Node の fetch で取得し、
//   SKILL.md Step 3 の中間スキーマに正規化して `data/_collected/<date>.json` に書き出す。
//   時間窓フィルタ (Step 5-A) と URL 正規化つき重複排除 (Step 4) まで決定論で済ませる。
//
// ■ なぜ:
//   従来は 60-80 ソースの取得・正規化・重複排除を Claude が WebFetch でやっていた。
//   そのうち RSS/API で取れる大半は機械的に可能で、LLM 本来の仕事 (スコアリング・選定・
//   日本語要約・図解・グラウンディング検証) ではない。収集を Node に逃がすことで
//   手動セッションのターン数・時間を大幅削減し、完全無料運用 (LLM 課金ゼロ) を維持する。
//
// ■ 役割分担:
//   - 本スクリプト: RSS/JSON で取れるソース (HN/arXiv/Qiita/Reddit/各種RSS/Semantic Scholar/
//     はてブ/日本企業ブログ/海外メディア/Substack学術/中華圏英語版)。
//   - Claude (WebFetch フォールバック): JS 描画/HTML スクレイプ/WebSearch が要るソース
//     (公式ブログ各社・Zenn・GitHub Trending・HF Trending・36Kr/量子位中文・Papers with Code 等)。
//   出力 `items` は Claude が読み込み、未取得バッチだけ WebFetch で補完して Step 6 以降を続ける。
//
// 使い方:
//   node scripts/collect.mjs                       # 今日(JST)を対象、現在時刻基準
//   node scripts/collect.mjs --date 2026-06-13     # 対象日を上書き
//   node scripts/collect.mjs --now 2026-06-13T05:00:00+09:00   # 鮮度計算の基準時刻を上書き
//   node scripts/collect.mjs --stdout              # ファイルに書かず stdout に要約 JSON

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { normalizeUrl, urlKey } from "./url-normalize.mjs";
import { parseFeed, stripTags } from "./feed-parse.mjs";

// ---------- 引数 ----------
const argv = process.argv.slice(2);
function argVal(name) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}
const TO_STDOUT = argv.includes("--stdout");
const NOW = argVal("--now") ? new Date(argVal("--now")) : new Date();
const NOW_MS = NOW.getTime();
// 対象日 (JST) — 出力ファイル名用。--date 優先、無ければ NOW を JST 日付に。
const TARGET_DATE =
  argVal("--date") ||
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(NOW); // YYYY-MM-DD

const FETCH_TIMEOUT_MS = 15000;
const CONCURRENCY = 8;
// ブラウザ風 UA + 緩い Accept。一部 CDN (Cloudflare 越しの theverge / venturebeat /
// Substack 等) は厳格な `application/rss+xml` Accept だと bot 判定で空応答を返すため、
// `*/*` に寄せて実フィードを取りにいく。
const UA = "Mozilla/5.0 (compatible; ai-daily-digest-collector/1.0; +https://github.com/pandas-mizugorou/ai-daily-digest)";

// ---------- HTTP ----------
async function httpGet(url, { json = false } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: json ? "application/json, */*" : "*/*" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return json ? await res.json() : await res.text();
  } finally {
    clearTimeout(t);
  }
}

// ---------- 文字列/日付ヘルパ ----------
// RSS/Atom パースは scripts/feed-parse.mjs に分離 (純粋関数・単体テスト可能)。
function toYmd(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr.trim());
  if (isNaN(d.getTime())) return "";
  // JST 日付に寄せる (published_at は YYYY-MM-DD / JST 運用)
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(d);
}
function parsedMs(dateStr) {
  if (!dateStr) return NaN;
  const d = new Date(dateStr.trim());
  return d.getTime();
}

// ---------- ソース定義 ----------
// kind: feed(汎用RSS/Atom) / hn / arxiv / qiita / semscholar
// 各 time_window_hours は sources.md の「ソース別動的時間窓」に準拠。
const HN_QUERIES = ["AI", "LLM", "Claude", "GPT", "agent"];
const QIITA_TAGS = [
  ["生成AI", 10], ["LLM", 10], ["Claude", 10], ["OpenAI", 5],
  ["Anthropic", 5], ["Agent", 5], ["RAG", 5], ["MCP", 5],
];
const SEMSCHOLAR_QUERIES = ["large language model", "AI agent", "retrieval augmented generation", "multimodal model"];
const HATENA_QUERIES = [["生成AI", 20], ["LLM", 20], ["Claude", 10]];

const FEED_SOURCES = [
  // --- 公式 (RSS があるもののみ) ---
  { id: "hf_blog", source: "huggingface", label: "Hugging Face Blog", type: "official", lang: "en", tw: 24, cat: "tools_apps", url: "https://huggingface.co/blog/feed.xml" },
  // --- 海外解説メディア ---
  { id: "techcrunch", source: "techcrunch", label: "TechCrunch AI", type: "media", lang: "en", tw: 24, cat: "industry_business", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { id: "theverge", source: "theverge", label: "The Verge AI", type: "media", lang: "en", tw: 24, cat: "industry_business", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
  { id: "venturebeat", source: "venturebeat", label: "VentureBeat AI", type: "media", lang: "en", tw: 24, cat: "industry_business", url: "https://venturebeat.com/category/ai/feed/" },
  { id: "wired_ai", source: "wired", label: "Wired AI", type: "media", lang: "en", tw: 48, cat: "industry_business", url: "https://www.wired.com/feed/tag/ai/latest/rss" },
  { id: "arstechnica_ai", source: "arstechnica", label: "Ars Technica AI", type: "media", lang: "en", tw: 24, cat: "industry_business", url: "https://arstechnica.com/ai/feed/" },
  { id: "mit_tr_ai", source: "mit_tech_review", label: "MIT Tech Review AI", type: "media", lang: "en", tw: 48, cat: "research_papers", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed" },
  { id: "stratechery", source: "stratechery", label: "Stratechery", type: "media", lang: "en", tw: 168, cat: "industry_business", url: "https://stratechery.com/feed/" },
  // --- 学術プラットフォーム (Substack/RSS) ---
  { id: "latent_space", source: "latent_space", label: "Latent Space", type: "academic", lang: "en", tw: 168, cat: "research_papers", url: "https://www.latent.space/feed" },
  { id: "import_ai", source: "import_ai", label: "Import AI", type: "academic", lang: "en", tw: 168, cat: "research_papers", url: "https://importai.substack.com/feed" },
  { id: "raschka", source: "sebastian_raschka", label: "Sebastian Raschka Magazine", type: "academic", lang: "en", tw: 336, cat: "research_papers", url: "https://magazine.sebastianraschka.com/feed" },
  { id: "lesswrong", source: "lesswrong", label: "LessWrong AI", type: "community", lang: "en", tw: 168, cat: "research_papers", url: "https://www.lesswrong.com/feed.xml?view=top-posts&postsLimit=15" },
  // --- 中華圏 (英語版) ---
  { id: "synced", source: "synced", label: "Synced / 机器之心", type: "china", lang: "en", tw: 168, cat: "china", url: "https://syncedreview.com/feed/" },
  { id: "chinai", source: "chinai", label: "ChinAI Newsletter", type: "china", lang: "en", tw: 168, cat: "china", url: "https://chinai.substack.com/feed" },
  { id: "qbitai", source: "qbitai", label: "量子位 QbitAI", type: "china", lang: "zh", tw: 168, cat: "china", url: "https://www.qbitai.com/feed" },
  // --- 日本企業テックブログ ---
  { id: "pfn", source: "preferred_networks", label: "Preferred Networks", type: "japan_corp", lang: "ja", tw: 168, cat: "japan", url: "https://tech.preferred.jp/ja/blog/feed/" },
  { id: "lycorp", source: "lycorp", label: "LINEヤフー Tech Blog", type: "japan_corp", lang: "ja", tw: 168, cat: "japan", url: "https://techblog.lycorp.co.jp/ja/feed/index.xml" },
  { id: "stockmark", source: "stockmark", label: "Stockmark Tech Blog", type: "japan_corp", lang: "ja", tw: 168, cat: "japan", url: "https://tech.stockmark.co.jp/feed" },
  { id: "sansan", source: "sansan", label: "Sansan Builders Box", type: "japan_corp", lang: "ja", tw: 168, cat: "japan", url: "https://buildersbox.corp-sansan.com/feed" },
  { id: "mercari", source: "mercari", label: "メルカリ Engineering", type: "japan_corp", lang: "ja", tw: 168, cat: "japan", url: "https://engineering.mercari.com/blog/feed.xml" },
  { id: "elyza", source: "elyza", label: "ELYZA (note)", type: "japan_corp", lang: "ja", tw: 168, cat: "japan", url: "https://note.com/elyza/rss" },
  // --- 日本語コミュニティ ---
  { id: "itmedia_ai", source: "itmedia", label: "ITmedia AI+", type: "japan_community", lang: "ja", tw: 48, cat: "japan", url: "https://rss.itmedia.co.jp/rss/2.0/aiplus.xml" },
  { id: "zenn_ai", source: "zenn", label: "Zenn AI", type: "japan_community", lang: "ja", tw: 48, cat: "japan", url: "https://zenn.dev/topics/ai/feed" },
  { id: "zenn_llm", source: "zenn", label: "Zenn LLM", type: "japan_community", lang: "ja", tw: 48, cat: "japan", url: "https://zenn.dev/topics/llm/feed" },
  { id: "hatena_it", source: "hatena", label: "はてブ IT ホットエントリ", type: "japan_community", lang: "ja", tw: 48, cat: "japan", url: "https://b.hatena.ne.jp/hotentry/it.rss" },
];

// Reddit は同時多発アクセスで 429 になりやすいため、専用に逐次取得 (間隔をあける)。
const REDDIT_SOURCES = [
  { id: "reddit_localllama", label: "r/LocalLLaMA", url: "https://www.reddit.com/r/LocalLLaMA/top.rss?t=day" },
  { id: "reddit_ml", label: "r/MachineLearning", url: "https://www.reddit.com/r/MachineLearning/top.rss?t=day" },
  { id: "reddit_singularity", label: "r/singularity", url: "https://www.reddit.com/r/singularity/top.rss?t=day" },
  { id: "reddit_claudeai", label: "r/ClaudeAI", url: "https://www.reddit.com/r/ClaudeAI/top.rss?t=day" },
  { id: "reddit_openai", label: "r/OpenAI", url: "https://www.reddit.com/r/OpenAI/top.rss?t=day" },
];

// ---------- 収集本体 ----------
const items = [];
const skipped = [];
const sourceStats = []; // {source, kind, fetched}

function pushItem(it) {
  if (!it.url || !it.title) return;
  items.push({
    id: it.id,
    source: it.source,
    source_label: it.source_label,
    source_type: it.source_type,
    title: it.title,
    url: it.url,
    published_at: it.published_at || "",
    summary_en: it.lang === "en" ? (it.excerpt || "") : "",
    raw_excerpt: it.excerpt || "",
    lang: it.lang,
    reaction_signal: it.reaction_signal ?? null,
    time_window_hours: it.time_window_hours,
    category_hint: it.category_hint || null,
    _ms: it._ms, // 時間窓フィルタ用の発行時刻 (出力前に落とす)
  });
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^\wÀ-ɏ]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "item";
}

async function collectFeed(def) {
  try {
    const xml = await httpGet(def.url);
    const entries = parseFeed(xml);
    let n = 0;
    for (const e of entries.slice(0, 25)) {
      if (!e.url || !e.title) continue;
      const reaction =
        def.reddit ? { kind: "reddit_top", min_score: 100 }
        : (e.hatenaCount != null ? { kind: "hatena", users: e.hatenaCount } : null);
      pushItem({
        id: `${def.id}-${slugify(e.title)}`,
        source: def.source, source_label: def.label, source_type: def.type,
        title: e.title, url: e.url, published_at: toYmd(e.dateRaw),
        excerpt: e.excerpt, lang: def.lang, reaction_signal: reaction,
        time_window_hours: def.tw, category_hint: def.cat,
        _ms: parsedMs(e.dateRaw),
      });
      n++;
    }
    sourceStats.push({ source: def.id, kind: "feed", fetched: n });
  } catch (err) {
    skipped.push({ source: def.id, reason: `feed fetch failed: ${err.message}` });
  }
}

async function collectReddit() {
  let total = 0;
  for (const def of REDDIT_SOURCES) {
    try {
      const xml = await httpGet(def.url);
      const entries = parseFeed(xml);
      for (const e of entries.slice(0, 12)) {
        if (!e.url || !e.title) continue;
        pushItem({
          id: `${def.id}-${slugify(e.title)}`,
          source: "reddit", source_label: def.label, source_type: "community",
          title: e.title, url: e.url, published_at: toYmd(e.dateRaw),
          excerpt: e.excerpt, lang: "en", reaction_signal: { kind: "reddit_top", min_score: 100 },
          time_window_hours: 48, category_hint: "community_buzz", _ms: parsedMs(e.dateRaw),
        });
        total++;
      }
    } catch (err) {
      skipped.push({ source: def.id, reason: `reddit RSS failed: ${err.message}` });
    }
    await new Promise((r) => setTimeout(r, 1800)); // 429 回避の間隔
  }
  sourceStats.push({ source: "reddit", kind: "reddit", fetched: total });
}

async function collectHN() {
  const since = Math.floor((NOW_MS - 48 * 3600 * 1000) / 1000);
  let total = 0;
  for (const q of HN_QUERIES) {
    const url = `https://hn.algolia.com/api/v1/search?tags=story&numericFilters=created_at_i>${since},points>=50&query=${encodeURIComponent(q)}&hitsPerPage=20`;
    try {
      const j = await httpGet(url, { json: true });
      for (const h of j.hits || []) {
        const link = h.url || `https://news.ycombinator.com/item?id=${h.objectID}`;
        pushItem({
          id: `hn-${h.objectID}`,
          source: "hacker_news", source_label: "Hacker News", source_type: "aggregator",
          title: h.title || "", url: link, published_at: toYmd(h.created_at),
          excerpt: h.story_text ? stripTags(h.story_text).slice(0, 400) : "",
          lang: "en", reaction_signal: { kind: "hn", points: h.points || 0 },
          time_window_hours: 48, category_hint: "community_buzz", _ms: parsedMs(h.created_at),
        });
        total++;
      }
    } catch (err) {
      skipped.push({ source: `hn:${q}`, reason: `HN API failed: ${err.message}` });
    }
  }
  // 議論深い投稿 (200pt+)
  const url2 = `https://hn.algolia.com/api/v1/search?tags=story&numericFilters=created_at_i>${since},points>=200&hitsPerPage=15`;
  try {
    const j = await httpGet(url2, { json: true });
    for (const h of j.hits || []) {
      const link = h.url || `https://news.ycombinator.com/item?id=${h.objectID}`;
      pushItem({
        id: `hn-${h.objectID}`,
        source: "hacker_news", source_label: "Hacker News (200pt+)", source_type: "community",
        title: h.title || "", url: link, published_at: toYmd(h.created_at),
        excerpt: "", lang: "en", reaction_signal: { kind: "hn", points: h.points || 0 },
        time_window_hours: 48, category_hint: "community_buzz", _ms: parsedMs(h.created_at),
      });
      total++;
    }
  } catch (err) {
    skipped.push({ source: "hn:200pt", reason: `HN API failed: ${err.message}` });
  }
  sourceStats.push({ source: "hacker_news", kind: "hn", fetched: total });
}

async function collectArxiv() {
  const url = "http://export.arxiv.org/api/query?search_query=cat:cs.CL+OR+cat:cs.AI+OR+cat:cs.LG&sortBy=submittedDate&sortOrder=descending&max_results=25";
  try {
    const xml = await httpGet(url);
    const entries = parseFeed(xml);
    let n = 0;
    for (const e of entries) {
      pushItem({
        id: `arxiv-${slugify(e.title)}`,
        source: "arxiv", source_label: "arXiv", source_type: "academic",
        title: e.title.replace(/\s+/g, " "), url: e.url, published_at: toYmd(e.dateRaw),
        excerpt: e.excerpt, lang: "en", reaction_signal: null,
        time_window_hours: 168, category_hint: "research_papers", _ms: parsedMs(e.dateRaw),
      });
      n++;
    }
    sourceStats.push({ source: "arxiv", kind: "arxiv", fetched: n });
  } catch (err) {
    skipped.push({ source: "arxiv", reason: `arXiv API failed: ${err.message}` });
  }
}

async function collectQiita() {
  let total = 0;
  for (const [tag, per] of QIITA_TAGS) {
    const url = `https://qiita.com/api/v2/tags/${encodeURIComponent(tag)}/items?per_page=${per}`;
    try {
      const arr = await httpGet(url, { json: true });
      for (const a of arr || []) {
        const likes = (a.likes_count || 0) + (a.stocks_count || 0);
        pushItem({
          id: `qiita-${a.id}`,
          source: "qiita", source_label: "Qiita", source_type: "japan_community",
          title: a.title || "", url: a.url || "", published_at: toYmd(a.created_at),
          excerpt: a.body ? stripTags(a.body).slice(0, 400) : "",
          lang: "ja", reaction_signal: { kind: "qiita", likes: a.likes_count || 0, stocks: a.stocks_count || 0 },
          time_window_hours: 48, category_hint: "japan", _ms: parsedMs(a.created_at),
        });
        total++;
      }
    } catch (err) {
      skipped.push({ source: `qiita:${tag}`, reason: `Qiita API failed: ${err.message}` });
    }
  }
  sourceStats.push({ source: "qiita", kind: "qiita", fetched: total });
}

async function collectHatena() {
  let total = 0;
  for (const [q, users] of HATENA_QUERIES) {
    const url = `https://b.hatena.ne.jp/search/text?q=${encodeURIComponent(q)}&users=${users}&sort=recent&mode=rss`;
    try {
      const xml = await httpGet(url);
      const entries = parseFeed(xml);
      for (const e of entries.slice(0, 15)) {
        pushItem({
          id: `hatena-${slugify(e.title)}`,
          source: "hatena", source_label: `はてブ検索:${q}`, source_type: "japan_community",
          title: e.title, url: e.url, published_at: toYmd(e.dateRaw),
          excerpt: e.excerpt, lang: "ja",
          reaction_signal: e.hatenaCount != null ? { kind: "hatena", users: e.hatenaCount } : { kind: "hatena", users: users },
          time_window_hours: 48, category_hint: "japan", _ms: parsedMs(e.dateRaw),
        });
        total++;
      }
    } catch (err) {
      skipped.push({ source: `hatena:${q}`, reason: `Hatena RSS failed: ${err.message}` });
    }
  }
  sourceStats.push({ source: "hatena_search", kind: "hatena", fetched: total });
}

async function collectSemScholar() {
  let total = 0;
  const year = TARGET_DATE.slice(0, 4);
  for (const q of SEMSCHOLAR_QUERIES) {
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&fields=title,abstract,year,url,citationCount,venue&limit=15&year=${year}`;
    try {
      const j = await httpGet(url, { json: true });
      for (const p of j.data || []) {
        if (!p.url || !p.title) continue;
        pushItem({
          id: `semschol-${p.paperId || slugify(p.title)}`,
          source: "semantic_scholar", source_label: "Semantic Scholar", source_type: "academic",
          title: p.title, url: p.url, published_at: "", // 年のみ。鮮度は窓内扱い
          excerpt: p.abstract ? stripTags(p.abstract).slice(0, 400) : "",
          lang: "en", reaction_signal: { kind: "semantic_scholar", citation_count: p.citationCount || 0 },
          time_window_hours: 168, category_hint: "research_papers", _ms: NaN,
        });
        total++;
      }
    } catch (err) {
      skipped.push({ source: `semscholar:${q}`, reason: `Semantic Scholar failed: ${err.message}` });
    }
    // rate limit 緩和 (無認証は厳しめ。3.5s 空けてもベストエフォート)
    await new Promise((r) => setTimeout(r, 3500));
  }
  sourceStats.push({ source: "semantic_scholar", kind: "semscholar", fetched: total });
}

// 並列プール
async function pool(tasks, n) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(n, tasks.length) }, async () => {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]().catch((e) => ({ _err: e }));
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  // フィード群を並列、専用 API は個別関数
  const feedTasks = FEED_SOURCES.map((def) => () => collectFeed(def));
  await pool(feedTasks, CONCURRENCY);
  await Promise.all([collectHN(), collectArxiv(), collectQiita(), collectHatena()]);
  await collectReddit();     // Reddit は逐次 (429 回避)
  await collectSemScholar(); // rate limit があるので最後に直列

  const rawCount = items.length;

  // --- Step 5-A: 時間窓フィルタ (published_at が分かるものだけ。不明 _ms は通す) ---
  const windowed = items.filter((it) => {
    const ms = it._ms;
    if (!ms || isNaN(ms)) return true; // 日付不明は後段 (Claude/鮮度) に委ねる
    const ageH = (NOW_MS - ms) / 3600000;
    if (ageH < -36) return false; // 未来日 36h 超は異常値として除外
    return ageH <= it.time_window_hours;
  });

  // --- Step 4: URL 正規化つき重複排除 (URL キー優先、URL 同一なら反響シグナルの濃い方を残す) ---
  const byKey = new Map();
  function reactionScore(r) {
    if (!r) return 0;
    return (r.users || 0) + (r.likes || 0) + (r.stocks || 0) + (r.points || 0) + (r.citation_count || 0) + (r.min_score || 0);
  }
  for (const it of windowed) {
    const key = urlKey(it.url);
    it.url = normalizeUrl(it.url); // 正規化後 URL を採用
    const prev = byKey.get(key);
    if (!prev || reactionScore(it.reaction_signal) > reactionScore(prev.reaction_signal)) {
      byKey.set(key, it);
    }
  }
  const deduped = [...byKey.values()];

  // 内部用フィールド _ms を落として出力
  const cleanItems = deduped.map(({ _ms, ...rest }) => rest);

  const bySourceType = {};
  for (const it of cleanItems) bySourceType[it.source_type] = (bySourceType[it.source_type] || 0) + 1;

  const out = {
    schema_version: "1.0",
    date: TARGET_DATE,
    generated_at: NOW.toISOString(),
    now_iso: NOW.toISOString(),
    source_count: FEED_SOURCES.length + REDDIT_SOURCES.length + 5, // feed + reddit + HN/arxiv/qiita/hatena/semscholar
    fetched_sources: sourceStats,
    skipped_sources: skipped,
    stats: {
      raw: rawCount,
      after_time_window: windowed.length,
      after_dedup: cleanItems.length,
      by_source_type: bySourceType,
    },
    items: cleanItems,
  };

  if (TO_STDOUT) {
    // stdout には items 本文を省いた要約を出す (検証用)
    console.log(JSON.stringify({ ...out, items: `[${cleanItems.length} items omitted]` }, null, 2));
    return;
  }

  const dir = path.join("data", "_collected");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${TARGET_DATE}.json`);
  await writeFile(file, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(
    `[collect] ${file}\n` +
    `  raw=${rawCount} → time_window=${windowed.length} → dedup=${cleanItems.length}\n` +
    `  by_source_type: ${JSON.stringify(bySourceType)}\n` +
    `  skipped: ${skipped.length} (${skipped.map((s) => s.source).slice(0, 8).join(", ")}${skipped.length > 8 ? " …" : ""})`,
  );
}

main().catch((err) => {
  console.error(`[collect] 致命的エラー: ${err.message}`);
  process.exitCode = 1;
});

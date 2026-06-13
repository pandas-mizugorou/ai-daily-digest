// feed-parse.mjs — 依存ゼロの寛容な RSS/Atom パーサ (純粋関数・I/O なし)
//
// collect.mjs から分離して単体テスト可能にしている。RSS 2.0 / Atom 1.0 双方の
// <item> / <entry> を共通の素片 { title, url, dateRaw, excerpt, hatenaCount } に落とす。
// 正規表現ベースで完全な XML パーサではないが、ニュース系フィードの実運用には十分。

export function decodeEntities(s) {
  if (!s) return "";
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x2F;/gi, "/").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => safeCp(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => safeCp(parseInt(n, 16)))
    .replace(/&amp;/g, "&"); // 最後に & を戻す
}
function safeCp(n) {
  try { return String.fromCodePoint(n); } catch { return ""; }
}

export function stripTags(s) {
  // 重要: CDATA 展開・実体参照デコードを先に行ってから HTML タグを除去する。
  // 先にタグ除去すると `<![CDATA[タイトル]]>` 全体が 1 個の "タグ" 扱いで消え、
  // CDATA 包みのタイトル (Substack / The Verge / Zenn 等) が空になる。
  const decoded = decodeEntities(String(s || ""));
  return decoded.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// block 内の最初の <tag>...</tag> 中身を返す (名前空間プレフィックス対応、属性許容)。
export function firstTag(block, tag) {
  const t = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // dc:date 等のエスケープ
  const m = block.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, "i"));
  return m ? m[1] : null;
}

// Atom の <link> は href 属性。rel="alternate" を優先、無ければ最初の href。
// RSS の <link>テキスト</link> も拾う。
export function linkOf(block, isAtom) {
  if (isAtom) {
    const alt = block.match(/<link[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']+)["']/i)
      || block.match(/<link[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']alternate["']/i);
    if (alt) return alt[1];
    const any = block.match(/<link[^>]*\bhref=["']([^"']+)["']/i);
    if (any) return any[1];
  }
  // RSS: <link>https://...</link>。CDATA や前後空白を除去。
  const rss = firstTag(block, "link");
  if (rss && stripTags(rss)) return stripTags(rss);
  // Atom でも href が取れなかった最後の保険
  const any = block.match(/<link[^>]*\bhref=["']([^"']+)["']/i);
  return any ? any[1] : "";
}

// RSS<item> / Atom<entry> を共通スキーマの素片に変換。
export function parseFeed(xml) {
  if (!xml || typeof xml !== "string") return [];
  // <entry> があれば Atom とみなす (RSS にも稀に entry はあるが item を優先するため
  // 「item が無く entry がある」ときのみ Atom 扱いにする)。
  const hasItem = /<item[\s>]/i.test(xml);
  const hasEntry = /<entry[\s>]/i.test(xml);
  const isAtom = hasEntry && !hasItem;
  const blocks = xml.match(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) || [];
  const out = [];
  for (const b of blocks) {
    const title = stripTags(firstTag(b, "title") || "");
    const url = decodeEntities(linkOf(b, isAtom) || "").trim();
    const dateRaw = stripTags(
      firstTag(b, "pubDate") || firstTag(b, "published") || firstTag(b, "updated") ||
      firstTag(b, "dc:date") || firstTag(b, "date") || ""
    );
    const descRaw =
      firstTag(b, "content:encoded") || firstTag(b, "description") ||
      firstTag(b, "summary") || firstTag(b, "content") || "";
    const hatenaRaw = firstTag(b, "hatena:bookmarkcount");
    out.push({
      title,
      url,
      dateRaw,
      excerpt: stripTags(descRaw).slice(0, 600),
      hatenaCount: hatenaRaw != null ? Number(stripTags(hatenaRaw)) : null,
    });
  }
  return out;
}

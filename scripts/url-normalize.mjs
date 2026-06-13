// url-normalize.mjs — URL 正規化ユーティリティ (依存ゼロ・ESM)
//
// 目的: 同一記事を指す URL のゆらぎ (トラッキングパラメータ・AMP・末尾スラッシュ・
// ホストの www / 大文字小文字・フラグメント) を吸収し、
//   1) 収集層 (collect.mjs) の重複排除
//   2) 既出ペナルティ (_seen.json) の URL ハッシュ照合
// を一貫させる。SKILL.md Step 4 / Step 5-B の前処理に相当する決定論部分。
//
// 使い方:
//   import { normalizeUrl, urlKey } from "./url-normalize.mjs";
//   normalizeUrl("https://www.example.com/post/?utm_source=x#top") // → "https://example.com/post"

// 除去するクエリパラメータ (トラッキング・解析・SNS 由来)。完全一致 + utm_ 前方一致。
const TRACKING_PARAMS = new Set([
  "fbclid", "gclid", "dclid", "gclsrc", "wbraid", "gbraid", "msclkid", "yclid",
  "igshid", "igsh", "ref", "ref_src", "ref_url", "referrer", "source", "src",
  "mc_cid", "mc_eid", "_hsenc", "_hsmi", "hsa_acc", "hsa_cam", "spm", "scm",
  "vero_id", "vero_conv", "oly_anon_id", "oly_enc_id", "__s", "ck_subscriber_id",
  "amp", "outputType", "guccounter", "guce_referrer", "guce_referrer_sig",
  "cmpid", "ncid", "sr_share", "taid", "tid", "trk", "trkCampaign", "at_medium",
  "at_campaign", "smid", "smtyp", "feature", "ITO", "from", "share", "s",
]);

function isTrackingParam(key) {
  const k = key.toLowerCase();
  if (k.startsWith("utm_")) return true;
  if (k.startsWith("pk_")) return true; // Matomo/Piwik
  if (k.startsWith("at_")) return true; // BBC/AddThis 系
  return TRACKING_PARAMS.has(k);
}

// AMP ホスト/パスの正規化候補を素のホストへ戻す (ベストエフォート)。
function deAmpHost(host) {
  // cdn.ampproject.org 経由 (www-example-com.cdn.ampproject.org) は復元が不確実なので触らない。
  // amp. プレフィックスのサブドメインのみ素に戻す (amp.example.com → example.com)。
  if (host.startsWith("amp.")) return host.slice(4);
  return host;
}

function deAmpPath(pathname) {
  // 末尾 /amp または /amp/ を除去 (例: /article/amp → /article)
  return pathname.replace(/\/amp\/?$/i, "");
}

/**
 * URL を正規化した文字列を返す。解析不能なら入力をそのまま返す (壊さない)。
 * - スキームは https に寄せる (http → https。ホスト比較の安定化目的。実フェッチには使わない前提)
 * - ホスト: 小文字化 + 先頭 www. 除去 + amp. 除去
 * - パス: AMP 末尾除去 + 末尾スラッシュ除去 (ルート "/" は保持)
 * - クエリ: トラッキングパラメータ除去 + 残りをキー昇順ソート
 * - フラグメント (#...): 除去 (記事 URL では大半が非本質)
 */
export function normalizeUrl(input) {
  if (typeof input !== "string" || input.trim() === "") return input;
  let u;
  try {
    u = new URL(input.trim());
  } catch {
    return input.trim();
  }
  // http/https 以外 (mailto: 等) は触らない
  if (u.protocol !== "http:" && u.protocol !== "https:") return input.trim();

  u.protocol = "https:";
  u.hostname = deAmpHost(u.hostname.toLowerCase().replace(/^www\./, ""));
  u.hash = "";

  // パス正規化
  let path = deAmpPath(u.pathname);
  if (path.length > 1) path = path.replace(/\/+$/, ""); // 末尾スラッシュ除去 (ルートは保持)
  u.pathname = path === "" ? "/" : path;

  // クエリ正規化: トラッキング除去 → キー昇順ソート
  const kept = [];
  for (const [k, v] of u.searchParams.entries()) {
    if (!isTrackingParam(k)) kept.push([k, v]);
  }
  kept.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1));
  u.search = "";
  for (const [k, v] of kept) u.searchParams.append(k, v);

  // デフォルトポート除去は URL が自動で行う。末尾の "?" だけ残る場合を除去。
  return u.toString().replace(/\?$/, "");
}

/**
 * 重複排除・_seen 照合用のキー。normalizeUrl と同一だが、用途を明示するためのエイリアス。
 * 将来 scheme を畳む等の差を入れたくなったらここで分岐する。
 */
export function urlKey(input) {
  return normalizeUrl(input);
}

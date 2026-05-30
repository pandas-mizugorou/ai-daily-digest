// === Provenance UI (共通モジュール) ===
// 日次 (app.js) / 週次 (app-weekly.js) / 検索 (app-search.js) で共有。
// 出典まわりを「発行元 favicon」+「source_type チップ」で充実させる。

// 記事 URL からホスト名を取り出す（失敗時 null）。
// item.source はベンダ ID（例 "anthropic_blog"）で実ホストと一致しないため、
// favicon は必ず URL のホスト名から引く。
function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// 発行元 favicon を <span class="favicon"> でラップして返す。
// 取得元は DuckDuckGo のみ（プライバシー配慮・Google 非経由）。これが本サイト
// 唯一の外部リクエスト。失敗 / オフライン時は color-dot にフォールバックし、
// 16px の枠は常に確保するのでレイアウトはずれない。
function faviconFor(url) {
  const wrap = document.createElement("span");
  wrap.className = "favicon";
  const host = hostnameOf(url);
  if (!host) {
    wrap.classList.add("favicon-fallback");
    return wrap;
  }
  const img = document.createElement("img");
  img.className = "favicon-img";
  img.src = `https://icons.duckduckgo.com/ip3/${host}.ico`;
  img.width = 16;
  img.height = 16;
  img.loading = "lazy";
  img.decoding = "async";
  img.alt = "";
  img.referrerPolicy = "no-referrer";
  img.addEventListener(
    "error",
    () => {
      wrap.classList.add("favicon-fallback");
      img.remove();
    },
    { once: true },
  );
  wrap.appendChild(img);
  return wrap;
}

// source_type を「出所の性格」を表す極小ラベルに対応づける。
// 未知 / 空の type は null を返す（= チップ非表示）。データを持たないページ
// （検索インデックス等）でも安全にスキップできる。
const SOURCE_TYPE_LABEL = {
  official: "公式",
  academic: "論文",
  aggregator: "まとめ",
  media: "メディア",
  community: "コミュ",
  japan_community: "日本コミュ",
  japan_corp: "日本企業",
  china: "中華圏",
};

function sourceTypeChip(sourceType) {
  const label = SOURCE_TYPE_LABEL[sourceType];
  if (!label) return null;
  const span = document.createElement("span");
  span.className = `src-chip src-chip-${sourceType}`;
  span.textContent = label;
  span.title = "出典の種類";
  return span;
}

export { faviconFor, sourceTypeChip };

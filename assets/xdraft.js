// X 投稿ネタ連携 (Phase F-2、日次/週次/検索で共有)
// カードの「X 用にコピー」ボタンから、記事情報を /x-post-drafter が
// 食いやすい整形テキストにしてクリップボードへ。ユーザーは Claude Code の
// セッションで /x-post-drafter を起動し Step 2A「直接指定」に貼り付ける。
// 静的サイト → ローカル Claude Code スキルは直接起動できないため
// (F-1 の購読登録と同じ橋渡し方式)。

// item は 3 ページで微妙に形が違う (日次=published_at/scores.total、
// 週次=_date、検索=date/score) ので安全に吸収する。
function pickTitle(item) {
  const lang = (item.lang || "").toLowerCase();
  const ja = (item.title_ja || "").trim();
  const en = (item.title || "").trim();
  if (lang === "en" || lang === "zh") return ja || en || "(無題)";
  return en || ja || "(無題)";
}

function buildXDraftText(item) {
  const title = pickTitle(item);
  const url = item.url || "";
  const summary = (item.summary_ja || "").trim();
  const points = Array.isArray(item.key_points_ja) ? item.key_points_ja : [];
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const source = item.source_label || item.source || "";
  const date = item._date || item.date || item.published_at || "";
  const score = item.scores?.total ?? item.score ?? "";

  const lines = [];
  lines.push(title);
  lines.push("");
  if (summary) lines.push(summary);
  if (points.length) {
    lines.push("");
    lines.push("▼ポイント");
    for (const p of points) lines.push(`- ${p}`);
  }
  lines.push("");
  if (url) lines.push(`URL: ${url}`);
  const meta = [];
  if (source) meta.push(source);
  if (date) meta.push(date);
  if (score !== "") meta.push(`スコア ${score}`);
  if (meta.length) lines.push(`ソース: ${meta.join(" / ")}`);
  if (tags.length) lines.push(`タグ: ${tags.join(", ")}`);
  return lines.join("\n");
}

let toastTimer = null;
function showToast(msg) {
  let el = document.getElementById("aidd-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "aidd-toast";
    el.className = "toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("toast-show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("toast-show"), 3500);
}

async function copyXDraft(item) {
  const text = buildXDraftText(item);
  try {
    await navigator.clipboard.writeText(text);
    showToast("X 下書き用にコピーしました。Claude Code で /x-post-drafter に貼り付けてください");
  } catch {
    // クリップボード API 不可環境のフォールバック: 一時 textarea で選択コピー
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch {}
    document.body.removeChild(ta);
    showToast(
      ok
        ? "X 下書き用にコピーしました。Claude Code で /x-post-drafter に貼り付けてください"
        : "自動コピーできませんでした。記事の要約を手動で /x-post-drafter に渡してください"
    );
  }
}

export { buildXDraftText, copyXDraft };

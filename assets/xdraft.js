// X 投稿文 直接コピー (Phase F-2 改訂、日次/週次/検索で共有)
// digest 生成時に Claude が Top Picks の各記事に作った x_post
// (そのまま X に投稿できる完成文) をクリップボードへ。ユーザーはスマホ等で
// そのまま X に貼って投稿できる。x_post を持たない記事ではボタンを出さない。

function hasXPost(item) {
  return typeof item?.x_post === "string" && item.x_post.trim().length > 0;
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
  if (!hasXPost(item)) {
    showToast("この記事には投稿文がありません");
    return;
  }
  const text = item.x_post.trim();
  const okMsg = "X 投稿文をコピーしました。そのまま X に貼り付けて投稿できます";
  try {
    await navigator.clipboard.writeText(text);
    showToast(okMsg);
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
    showToast(ok ? okMsg : "自動コピーできませんでした。投稿文を手動で選択してコピーしてください");
  }
}

export { copyXDraft, hasXPost };

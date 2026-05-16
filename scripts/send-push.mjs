// 日次ダイジェスト更新完了後に Web Push 通知を送る。
// daily-digest.yml の digest ジョブで「Commit and push」の直後に実行される。
//
//   VAPID_PRIVATE_KEY=<secret> node scripts/send-push.mjs
//
// 設計方針:
// - 購読 0 件 / VAPID_PRIVATE_KEY 未設定 / 送信失敗 でも exit 0 (digest を落とさない)
// - 410/404 を返したエンドポイントは「失効」としてログに出すだけ (自動削除はしない)
// - 公開鍵は公開情報なので定数で持つ。assets/app.js の VAPID_PUBLIC_KEY と一致させること

import { readFile } from "node:fs/promises";
import process from "node:process";

// !!! assets/app.js の VAPID_PUBLIC_KEY と必ず同じ値にすること !!!
const VAPID_PUBLIC_KEY =
  "BJI7StzSqU0D1Sz_ZVNhFObbHF1ojf8rqv220YZxov0kQ-6C07vtGE1liXN2pnAZXcmRsMYHuKutrKVATUoGRAc";
const VAPID_SUBJECT = "https://pandas-mizugorou.github.io/ai-daily-digest/";

const SUBS_PATH = "data/subscriptions.json";
const LATEST_PATH = "data/latest.json";

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    console.warn(`[send-push] ${path} を読めません: ${err.message}`);
    return null;
  }
}

function fmtTitle(dateStr) {
  // "2026-05-16" → "AI Daily Digest 5/16"
  const m = String(dateStr || "").match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!m) return "AI Daily Digest";
  return `AI Daily Digest ${parseInt(m[1], 10)}/${parseInt(m[2], 10)}`;
}

async function main() {
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!privateKey) {
    console.warn(
      "[send-push] VAPID_PRIVATE_KEY 未設定。GitHub Secret に登録すると通知が有効になります。スキップして正常終了します。",
    );
    return;
  }

  const subsFile = await readJson(SUBS_PATH);
  const subscriptions = subsFile?.subscriptions ?? [];
  if (subscriptions.length === 0) {
    console.log("[send-push] 購読が 0 件のためスキップします。");
    return;
  }

  const latest = await readJson(LATEST_PATH);
  if (!latest) {
    console.warn("[send-push] latest.json が読めないためスキップします。");
    return;
  }

  const payload = JSON.stringify({
    title: fmtTitle(latest.date),
    body: latest.headline || "今日の AI ニュースが更新されました",
    url: "./",
    tag: "aidd-daily",
  });

  let webpush;
  try {
    webpush = (await import("web-push")).default;
  } catch (err) {
    console.warn(`[send-push] web-push を読み込めません: ${err.message}。スキップします。`);
    return;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, privateKey);

  let ok = 0;
  let failed = 0;
  const expired = [];
  for (const sub of subscriptions) {
    const endpoint = sub?.endpoint || "(no endpoint)";
    try {
      await webpush.sendNotification(sub, payload);
      ok++;
    } catch (err) {
      failed++;
      const code = err?.statusCode;
      if (code === 404 || code === 410) {
        expired.push(endpoint);
        console.warn(`[send-push] 失効 (${code}): ${endpoint}`);
      } else {
        console.warn(`[send-push] 送信失敗 (${code ?? "?"}): ${endpoint} — ${err?.message}`);
      }
    }
  }

  console.log(
    `[send-push] 完了: 成功 ${ok} / 失敗 ${failed} / 失効 ${expired.length} (購読 ${subscriptions.length} 件)`,
  );
  if (expired.length > 0) {
    console.log(
      "[send-push] 失効エンドポイントは data/subscriptions.json から手動削除を検討してください:",
    );
    for (const e of expired) console.log("  - " + e);
  }
}

main().catch((err) => {
  // 何があっても digest ジョブは落とさない
  console.warn(`[send-push] 想定外エラー (無視して正常終了): ${err?.message}`);
});

// 日次ダイジェスト更新完了後に Web Push 通知を送る。
// daily-digest.yml の digest ジョブで「Commit and push」の直後に実行される。
//
//   VAPID_PRIVATE_KEY=<secret> SUBSCRIPTIONS_JSON='{...}' [SECRETS_PAT=<pat>] node scripts/send-push.mjs
//
// 設計方針:
// - 購読 0 件 / VAPID_PRIVATE_KEY 未設定 / 送信失敗 でも exit 0 (digest を落とさない)
// - 410/404 を返したエンドポイントは「失効」として購読リストから自動削除する (self-healing):
//     * 本番(Secret 由来) … SECRETS_PAT があれば SUBSCRIPTIONS_JSON Secret を sealed-box で書き戻す
//     * ローカル(ファイル由来) … data/subscriptions.json を上書き
//   SECRETS_PAT が無い本番では従来どおりログのみ (prune_skipped="no SECRETS_PAT")。
// - 実行結果を data/_push-status.json に必ず書き出す (workflow のアラート判定用。gitignore 済)。
// - 公開鍵は公開情報なので定数で持つ。assets/app.js の VAPID_PUBLIC_KEY と一致させること
// - 購読情報 (endpoint) は端末識別情報のため public リポジトリには含めない。
//   本番(GitHub Actions)は Secret 由来の SUBSCRIPTIONS_JSON を優先し、
//   ローカル開発のみ data/subscriptions.json (gitignore 済) にフォールバックする。

import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

// !!! assets/app.js の VAPID_PUBLIC_KEY と必ず同じ値にすること !!!
const VAPID_PUBLIC_KEY =
  "BJI7StzSqU0D1Sz_ZVNhFObbHF1ojf8rqv220YZxov0kQ-6C07vtGE1liXN2pnAZXcmRsMYHuKutrKVATUoGRAc";
// Apple の Web Push (web.push.apple.com) は VAPID subject が mailto: でないと
// 201 を返しても実配信しない (FCM は https でも可)。iOS 配信のため mailto: 必須。
const VAPID_SUBJECT = "mailto:ai-daily-digest-bot@users.noreply.github.com";

const SUBS_PATH = "data/subscriptions.json";
const LATEST_PATH = "data/latest.json";
// 実行結果サマリ。workflow の「Alert on push anomaly」ステップが読む。gitignore 済。
const STATUS_PATH = "data/_push-status.json";

// 失効購読の自動削除で SUBSCRIPTIONS_JSON Secret を書き戻す先 (sealed-box PUT)。
const OWNER = "pandas-mizugorou";
const REPO = "ai-daily-digest";
const SECRET_NAME = "SUBSCRIPTIONS_JSON";

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    console.warn(`[send-push] ${path} を読めません: ${err.message}`);
    return null;
  }
}

// 実行結果を data/_push-status.json に書く。workflow がこれを読んでアラート判定する。
// 早期 return も含め必ず 1 回呼ぶこと (ファイルが無ければアラートステップは何もしない)。
async function writeStatus(status) {
  try {
    await writeFile(STATUS_PATH, JSON.stringify(status, null, 2) + "\n", "utf8");
  } catch (err) {
    console.warn(`[send-push] ${STATUS_PATH} を書けません: ${err.message}`);
  }
}

// 購読の読込元: 本番では Secret 由来の SUBSCRIPTIONS_JSON 環境変数を優先。
// 未設定/パース不能ならローカルの data/subscriptions.json にフォールバックする。
// 返り値 { subs, fromSecret } の fromSecret は prune の書き戻し先判定に使う。
async function loadSubscriptions() {
  const raw = process.env.SUBSCRIPTIONS_JSON;
  if (raw && raw.trim()) {
    try {
      return { subs: JSON.parse(raw), fromSecret: true };
    } catch (err) {
      console.warn(
        `[send-push] SUBSCRIPTIONS_JSON env のパースに失敗 (${err.message})。${SUBS_PATH} にフォールバックします。`,
      );
    }
  }
  return { subs: await readJson(SUBS_PATH), fromSecret: false };
}

function fmtTitle(dateStr) {
  // "2026-05-16" → "AI Daily Digest 5/16"
  const m = String(dateStr || "").match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!m) return "AI Daily Digest";
  return `AI Daily Digest ${parseInt(m[1], 10)}/${parseInt(m[2], 10)}`;
}

// 失効を除いた survivors を SUBSCRIPTIONS_JSON Secret に sealed-box で書き戻す。
// 手順は set-secret.mjs と同一 (GET public-key → crypto_box_seal → PUT)。成功で true。
// libsodium-wrappers は遅延 import (未インストールでもこの関数を呼ぶまでクラッシュしない)。
async function pushSecretWriteback(payloadObj, token) {
  // set-secret.mjs と同じ payload 検証: subscriptions は 1 件以上、各 endpoint/keys 必須。
  const subs = payloadObj?.subscriptions;
  if (!Array.isArray(subs) || subs.length === 0) {
    throw new Error("writeback payload must be {subscriptions:[...]} with >=1 entry");
  }
  for (const s of subs) {
    if (!s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth) {
      throw new Error("a subscription is missing endpoint/keys");
    }
  }
  const value = JSON.stringify(payloadObj);
  const H = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "ai-daily-digest-send-push",
  };
  const pkRes = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/actions/secrets/public-key`,
    { headers: H },
  );
  if (!pkRes.ok) throw new Error(`public-key fetch failed: ${pkRes.status}`);
  const { key, key_id } = await pkRes.json();

  const sodium = (await import("libsodium-wrappers")).default;
  await sodium.ready;
  const enc = sodium.crypto_box_seal(
    sodium.from_string(value),
    sodium.from_base64(key, sodium.base64_variants.ORIGINAL),
  );
  const encrypted_value = sodium.to_base64(enc, sodium.base64_variants.ORIGINAL);

  const putRes = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/actions/secrets/${SECRET_NAME}`,
    { method: "PUT", headers: H, body: JSON.stringify({ encrypted_value, key_id }) },
  );
  if (putRes.status !== 201 && putRes.status !== 204) {
    throw new Error(`secret PUT failed: ${putRes.status}`);
  }
  return true;
}

async function main() {
  const ranAt = new Date().toISOString();
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!privateKey) {
    console.warn(
      "[send-push] VAPID_PRIVATE_KEY 未設定。GitHub Secret に登録すると通知が有効になります。スキップして正常終了します。",
    );
    await writeStatus({ ran: false, reason: "no_vapid_key", ran_at: ranAt });
    return;
  }

  const { subs: subsFile, fromSecret } = await loadSubscriptions();
  const subscriptions = subsFile?.subscriptions ?? [];
  if (subscriptions.length === 0) {
    console.log("[send-push] 購読が 0 件のためスキップします。");
    await writeStatus({ ran: false, reason: "no_subscriptions", total: 0, ran_at: ranAt });
    return;
  }

  const latest = await readJson(LATEST_PATH);
  if (!latest) {
    console.warn("[send-push] latest.json が読めないためスキップします。");
    await writeStatus({
      ran: false,
      reason: "no_latest",
      total: subscriptions.length,
      ran_at: ranAt,
    });
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
    await writeStatus({
      ran: false,
      reason: "no_webpush_module",
      total: subscriptions.length,
      ran_at: ranAt,
    });
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

  // === 失効購読の自動削除 (self-healing) ===
  // 410/404 を返した端末は購読が死んでいる。survivors だけ残して書き戻す。
  let pruned = 0;
  let pruneSkipped = null;
  if (expired.length > 0) {
    const survivors = subscriptions.filter((s) => !expired.includes(s?.endpoint));
    const pat = process.env.SECRETS_PAT?.trim();
    if (survivors.length === 0) {
      // 全滅。空 payload は書き戻さない (Secret 検証も弾く)。手動再購読が必要。
      pruneSkipped = "all_expired";
      console.warn("[send-push] 全購読が失効。自動削除は見送り (空にしない)。再購読が必要です。");
    } else if (fromSecret && pat) {
      try {
        await pushSecretWriteback({ subscriptions: survivors }, pat);
        pruned = expired.length;
        console.log(
          `[send-push] 失効 ${pruned} 件を SUBSCRIPTIONS_JSON Secret から自動削除しました (残 ${survivors.length} 件)。`,
        );
      } catch (err) {
        pruneSkipped = `writeback_failed: ${err.message}`;
        console.warn(`[send-push] Secret 書き戻しに失敗 (無視して継続): ${err.message}`);
      }
    } else if (!fromSecret) {
      try {
        await writeFile(
          SUBS_PATH,
          JSON.stringify({ subscriptions: survivors }, null, 2) + "\n",
          "utf8",
        );
        pruned = expired.length;
        console.log(
          `[send-push] 失効 ${pruned} 件を ${SUBS_PATH} から自動削除しました (残 ${survivors.length} 件)。`,
        );
      } catch (err) {
        pruneSkipped = `file_write_failed: ${err.message}`;
        console.warn(`[send-push] ${SUBS_PATH} 書き戻しに失敗: ${err.message}`);
      }
    } else {
      // fromSecret かつ SECRETS_PAT 無し → 従来どおりログのみ
      pruneSkipped = "no SECRETS_PAT";
      console.log(
        "[send-push] SECRETS_PAT 未設定のため失効購読を自動削除できません。SUBSCRIPTIONS_JSON Secret から手動削除を検討してください:",
      );
      for (const e of expired) console.log("  - " + e);
    }
  }

  await writeStatus({
    ran: true,
    ok,
    failed,
    expired: expired.length,
    pruned,
    prune_skipped: pruneSkipped,
    total: subscriptions.length,
    from_secret: fromSecret,
    ran_at: ranAt,
  });
}

main().catch(async (err) => {
  // 何があっても digest ジョブは落とさない
  console.warn(`[send-push] 想定外エラー (無視して正常終了): ${err?.message}`);
  try {
    await writeStatus({ ran: false, reason: `unexpected_error: ${err?.message}` });
  } catch {}
});

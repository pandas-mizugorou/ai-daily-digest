// AI Daily Digest を定時に起動する外部トリガー Worker。
//
// 背景:
//   GitHub Actions の schedule(cron) はこのリポジトリで実発火が +3〜15h 遅延し、
//   5:00 JST 配信の締切を守れない(実測)。workflow_dispatch は遅延なく即時発火する
//   ため、信頼できる Cloudflare Cron(wrangler.toml の [triggers].crons)から
//   この Worker の scheduled ハンドラ経由で dispatch を叩く。
//
//   workflow 側の冪等ガードが remote-aware なので、万一 GitHub の schedule cron が
//   先に当日分を生成していても二重生成は起きない(inputs 無し dispatch は guard を尊重)。
//
// 必要な Secret:
//   GITHUB_TOKEN ... fine-grained PAT。対象リポジトリ pandas-mizugorou/ai-daily-digest、
//                    権限 Actions = Read and write。`wrangler secret put GITHUB_TOKEN` で登録。

const OWNER = "pandas-mizugorou";
const REPO = "ai-daily-digest";
const WORKFLOW = "daily-digest.yml";
const REF = "main";

async function dispatch(env) {
  if (!env.GITHUB_TOKEN) {
    return { ok: false, status: 0, body: "GITHUB_TOKEN secret is not set" };
  }
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ai-digest-trigger-worker",
      "Content-Type": "application/json",
    },
    // inputs 無し = workflow 側の冪等ガードを尊重する(既に当日分が在れば skip)。
    body: JSON.stringify({ ref: REF }),
  });
  // 成功は 204 No Content。失敗時は本文にエラーが入る。
  const body = res.status === 204 ? "" : await res.text();
  return { ok: res.status === 204, status: res.status, body };
}

export default {
  // Cloudflare Cron が呼ぶ本番経路。
  async scheduled(event, env, ctx) {
    const r = await dispatch(env);
    if (!r.ok) {
      console.error(`dispatch failed: ${r.status} ${r.body}`);
      // 例外を投げると Cloudflare のダッシュボードで失敗として可視化される。
      throw new Error(`workflow_dispatch failed: ${r.status} ${r.body}`);
    }
    console.log(`workflow_dispatch ok (status ${r.status}) for ${OWNER}/${REPO} ${WORKFLOW}@${REF}`);
  },

  // 疎通確認用の health エンドポイント。
  //   - 既定(GET /)         : 設定状況を返すだけ。dispatch はしない(誤爆・悪用防止)。
  //   - GET /trigger?key=…  : TRIGGER_KEY(任意の Secret)が一致したときだけ実 dispatch。
  //     TRIGGER_KEY 未設定時は 403。実トリガーの手動テストは GitHub の "Run workflow"
  //     ボタン、または `wrangler dev` + scheduled テストでも可能。
  async fetch(req, env, ctx) {
    const u = new URL(req.url);
    if (u.pathname === "/trigger") {
      if (!env.TRIGGER_KEY || u.searchParams.get("key") !== env.TRIGGER_KEY) {
        return new Response("forbidden", { status: 403 });
      }
      const r = await dispatch(env);
      return Response.json(r, { status: r.ok ? 200 : 502 });
    }
    return Response.json({
      worker: "ai-digest-trigger",
      target: `${OWNER}/${REPO} ${WORKFLOW}@${REF}`,
      cron_utc: "30 18 * * * (= 03:30 JST)",
      github_token_set: Boolean(env.GITHUB_TOKEN),
      manual_trigger: env.TRIGGER_KEY ? "GET /trigger?key=<TRIGGER_KEY>" : "disabled (set TRIGGER_KEY secret to enable)",
    });
  },
};

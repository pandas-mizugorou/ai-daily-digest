# ai-digest-trigger — 配信時刻を確定させる外部トリガー Worker

GitHub Actions の `schedule`(cron) は、このリポジトリで**実発火が +3〜15 時間遅延**し
(実測: 15:07 UTC 指定が 22:38 UTC = 07:38 JST に発火)、**5:00 JST 配信の締切を守れない**。

`workflow_dispatch` は遅延なく即時発火するため、**信頼できる Cloudflare Cron** から
この Worker 経由で `daily-digest.yml` を dispatch して配信時刻を確定させる。
GitHub 側の `schedule` cron は**保険(フォールバック)として残してある**ので、Worker が
落ちても従来どおり(遅延あり)では配信される。冪等ガードにより二重生成は起きない。

```
Cloudflare Cron (03:30 JST / 18:30 UTC、定時)
        │  scheduled()
        ▼
  GitHub workflow_dispatch  ──►  daily-digest.yml(冪等ガードを尊重)
        │                              │ 生成 ~20-30 分
        ▼                              ▼
   即時発火(遅延なし)            ~04:00 JST までに配信完了
```

---

## セットアップ(初回のみ・所要 5 分)

### 1. GitHub の fine-grained PAT を発行

1. https://github.com/settings/personal-access-tokens/new を開く
2. **Resource owner**: `pandas-mizugorou`
3. **Repository access**: *Only select repositories* → `ai-daily-digest`
4. **Permissions** → *Repository permissions* → **Actions** を **Read and write** に
   (他は不要。最小権限)
5. **Expiration** は任意(切れたら再発行 → 手順 4 をやり直す)
6. 生成されたトークン(`github_pat_…`)をコピー

### 2. デプロイ

```sh
cd infra/digest-trigger-worker
npm install
npx wrangler login                 # ブラウザが開く。Cloudflare アカウントで許可
npx wrangler secret put GITHUB_TOKEN   # ↑でコピーした PAT を貼り付け
npx wrangler deploy
```

`Cron Triggers ... schedule: 30 18 * * *` がデプロイ出力に出れば登録完了。

### 3. 動作確認

```sh
# 設定が読めているか(GET / は dispatch しない health チェック)
curl https://ai-digest-trigger.<your-subdomain>.workers.dev/
#  → {"github_token_set": true, "cron_utc": "30 18 * * * (= 03:30 JST)", ...}
```

実際のトリガー経路をテストしたいときは、いずれか:
- **GitHub UI**: Actions → "AI Daily Digest" → **Run workflow**(= 本 Worker と同じ
  `workflow_dispatch`。冪等ガードがあるので当日分が既にあれば skip される)
- **ローカル scheduled テスト**:
  ```sh
  npx wrangler dev --test-scheduled
  # 別ターミナルで:
  curl "http://localhost:8787/__scheduled?cron=30+18+*+*+*"
  ```

---

## 運用メモ

- **配信時刻を変える**: `wrangler.toml` の `[triggers].crons`(UTC)を編集して
  `npx wrangler deploy`。例: `0 19 * * *` = 04:00 JST。
- **ログを見る**: `npx wrangler tail`(リアルタイム)/ Cloudflare ダッシュボードの
  Workers → ai-digest-trigger → Logs。dispatch 失敗時は例外で失敗扱いになる。
- **PAT が切れたら**: dispatch が 401 になる。手順 1 で再発行 →
  `npx wrangler secret put GITHUB_TOKEN` で更新。
- **手動トリガーを Web で叩けるようにする(任意)**: `npx wrangler secret put TRIGGER_KEY`
  で任意のキーを登録すると `GET /trigger?key=<TRIGGER_KEY>` で実 dispatch できる。
  未設定なら `/trigger` は 403(誤爆・悪用防止)。
- **コスト**: Cloudflare Workers 無料枠(10 万 req/日、Cron Triggers 込み)で十分。
  GitHub Actions も従来と同じ(発火元が変わるだけ)。

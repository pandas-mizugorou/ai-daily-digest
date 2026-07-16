# AI Daily Digest

押さえるべき AI / 生成 AI ニュースを毎朝 5:00 JST に自動収集して GitHub Pages へ配信するダイジェストサイト。60超のソースを4軸スコアリングで「必読 Top Picks ＋カテゴリ別」に自動編成する。

**▶ デモ: https://pandas-mizugorou.github.io/ai-daily-digest/**

- 静的サイト（HTML + CSS + JS のみ。ビルド不要）
- スマホファースト + レスポンシブ + PWA（ホーム画面追加・オフライン閲覧対応）
- データ更新は **GitHub Actions**（`.github/workflows/daily-digest.yml`）または手動実行（`/ai-daily-digest`）から `git push` で反映
- スキル本体は [`~/.claude/skills/ai-daily-digest/`](file://~/.claude/skills/ai-daily-digest/) に配置（リポジトリ同梱の [`.claude/skills/ai-daily-digest/`](.claude/skills/ai-daily-digest/) が SSOT。`scripts/sync-skill.ps1` でローカルへ同期）

> **運用状況（2026-06）**: 6/15 の Anthropic サブスク課金変更（Agent SDK / Claude Code GitHub Actions が
> サブスク枠と分離された別枠クレジット化）に備え、自動配信ワークフローを**一時停止中**。当面は手動実行で更新する。
> 詳細は下記「自動更新の仕組み」を参照。

## 公開 URL

```
https://pandas-mizugorou.github.io/ai-daily-digest/
```

## ディレクトリ構成

```
ai-daily-digest/
├── index.html              # 骨格（PWA メタタグ・テンプレート）
├── manifest.webmanifest    # PWA マニフェスト
├── service-worker.js       # オフラインキャッシュ
├── offline.html            # オフライン時のフォールバック
├── assets/
│   ├── app.js              # JSON fetch + カード描画
│   ├── styles.css          # スマホファースト + ダークモード
│   ├── favicon.svg
│   └── icons/              # 192 / 512 / maskable / apple-touch
└── data/
    ├── index.json          # 過去日付一覧（全期間保持。90 日ロールオーバーは 2026-07-06 廃止）
    ├── latest.json         # 最新日（CDN キャッシュ回避用）
    ├── 2026-05-03.json     # 日次データ本体
    └── followups.json      # 続報チェーン（build-followups.mjs が毎朝生成）
```

## ローカル動作確認

ファイルを `file://` で直接開くと CORS で fetch が失敗する。簡易 HTTP サーバーを使う:

```powershell
# Python が入っていれば
cd C:\dev\personal\ai-daily-digest
python -m http.server 8000

# または Node.js が入っていれば
npx serve .
```

ブラウザで `http://localhost:8000/` を開く。

## 初回セットアップ

```powershell
cd C:\dev\personal\ai-daily-digest
git init
git branch -M main
git add .
git commit -m "init: AI Daily Digest static site"

# GitHub にパブリックリポジトリ ai-daily-digest を作ったあと:
git remote add origin https://github.com/<USER>/ai-daily-digest.git
git push -u origin main
```

GitHub の Settings → Pages → Source: `Deploy from a branch` / Branch: `main` / Folder: `/ (root)` を有効化。1〜2 分で公開される。

## スマホからのアクセス

公開 URL を以下のいずれかでスマホで開く。

### iPhone（Chrome 利用者）

ホーム画面に追加するときは **一度だけ Safari** で開く必要があります（iOS Chrome 単体では「ホーム画面に追加」が出ない仕様のため）。

1. iPhone の **Safari** で公開 URL を開く
2. 共有ボタン → 「ホーム画面に追加」
3. 以後は Chrome / ホーム画面アイコンどちらから開いても OK

### Android

1. Chrome で公開 URL を開く
2. インストールプロンプトが出たら追加 / または右上メニューから「アプリをインストール」

### URL を渡す導線

- Slack / Discord / メモアプリにブックマーク
- PC で開いた URL を `Ctrl+L` → スマホへ AirDrop / 共有

## 通知（Web Push, Phase F-1）

日次ダイジェストの更新が完了した直後（平常 JST 02:00 前後）に、その日の headline をスマホへ Push 通知できる。

### 初回セットアップ（運用者が 1 回だけ）

1. **VAPID 鍵生成**: `node scripts/gen-vapid.mjs` を実行
   - 出力された `VAPID_PUBLIC_KEY` を `assets/app.js` と `scripts/send-push.mjs` の定数に反映（既に埋め込み済みなら不要）
   - 出力された `VAPID_PRIVATE_KEY` を GitHub リポジトリ **Settings → Secrets and variables → Actions** に `VAPID_PRIVATE_KEY` という名前で登録（絶対に公開しない）
2. 秘密鍵を登録するまで `Send push notification` ステップは「未設定」ログを出して正常スキップする（digest は落ちない）

### 端末ごとの購読登録

1. スマホ / PC でサイトを開き、ヘッダーの 🔔 をタップ
2. 通知を許可 → 表示された購読 JSON を「コピー」
3. その JSON を **GitHub Secret `SUBSCRIPTIONS_JSON`** に追加する（端末識別情報のため public リポジトリには置かず Secret で管理。ローカル検証時のみ `data/subscriptions.json`＝`.gitignore` 済みを使う）
4. 以降、日次更新完了時にこの端末へ通知が届く。端末を増やすときは 1–3 を繰り返す

### 注意

- **iOS は Safari でホーム画面に追加した PWA でのみ Web Push が動作**（iOS Safari の仕様）。A2HS 後にアプリから開いて 🔔 を許可すること
- 通知タイミングは固定時刻ではなく「更新完了の直後」（深夜帯のことが多い）。鳴らしたくない時間帯は端末側のサイレント設定で調整
- 失効した購読（端末側で通知を切る等）は Actions ログに警告が出る。`data/subscriptions.json` から手動削除する

## 検索（Phase F-3）

ヘッダーの 🔍 から専用検索ページ `/search/` を開く。過去全期間の記事をクライアントサイドで横断検索できる。

- **フリーワード**: タイトル / 日本語タイトル / 要約 / タグ / ソースを対象に部分一致。スペース区切りは AND
- **タグチップ**: 出現回数上位 40 タグ。複数選択は OR。フリーワードとは AND
- **既定表示**: 語もタグも未指定なら最新 30 件（探索の入口）
- 結果カードはタップでその場展開（要約 + キーポイント + タグ + 元記事リンク）

検索インデックス `data/search-index.json` は digest ジョブが `scripts/build-search-index.mjs` で毎日再生成（figure 等を除いた軽量版）。Service Worker は latest.json と同じ network-first で扱う。

日次・週次・検索の 3 ページは**同一の展開カード**（要約 + キーポイント + タグ + 図解 + 元記事リンク）を共有する。図解描画は `assets/figure.js` に共通化。検索カードの図解のみ、索引肥大回避のため展開時に該当日 JSON を lazy fetch する。

## X 投稿文の直接コピー（Phase F-2）

**Top Picks（必読 5-7 件）の記事**に、そのまま X に投稿できる完成文 `x_post` を digest 生成時に Claude が事前生成する（ペルソナ準拠＝「である」調 / 絵文字≤1 / ハッシュタグ0 / 本文 ~120 字 + 元記事 URL、X 無料アカウントでも投稿可）。

日次・週次・検索の各カード展開部に、x_post を持つ記事だけ「**𝕏 投稿文をコピー**」ボタンが出る。押すと投稿文がそのままクリップボードにコピーされ、スマホでも X に貼って即投稿できる（x-post-drafter を経由しない）。

- 生成ルール: `references/x-persona.md`（Vault の persona.yaml の複製・手動同期）+ `assets/prompt-templates/x-post.md`。**記事内の事実のみ**（figure と同等の事実厳格さ）
- 対象は Top Picks のみ。それ以外・実装前の過去記事にはボタンを出さない
- フロントのコピー処理は `assets/xdraft.js` に共通化（3 ページ共有）。検索は `search-index.json` に x_post を含めて対応

## 更新の仕組み

### 手動実行（現行の主経路）

ローカルで Claude Code に `/ai-daily-digest` と依頼すると、当日分を生成して push する。
収集の大半は **`scripts/collect.mjs`（決定論収集）**が担い、Claude は WebFetch 補完（公式ブログ中心）+
スコアリング・選定・日本語要約・図解・グラウンディング検証に集中する。

```bash
# スキルが内部で実行する収集ステップ（単体でも回せる）
node scripts/collect.mjs --date 2026-06-13   # data/_collected/<date>.json に候補プールを生成
```

引数: `--weekly-only`（週次のみ再生成）/ `--date YYYY-MM-DD`（過去日のバックフィル）/ `--dry-run`（push しない）。

### 自動実行（GitHub Actions・現在停止中）

`.github/workflows/daily-digest.yml` が多重 cron（00:07/00:27/00:47 JST）+ Cloudflare Worker（`infra/digest-trigger-worker`、
03:30 JST に `workflow_dispatch`）で発火し、`claude-code-action` 経由でスキルを実行して push する。
`watchdog.yml`（異常検知 Issue）/ `retry-failed.yml`（1回自動再実行）が安全網。

**2026-06 時点では本体・watchdog ともに手動無効化（`disabled_manually`）し、Cloudflare Worker の cron も
空にしている**（6/15 課金変更の様子見）。再開する場合は Actions の各ワークフローを有効化し、
`infra/digest-trigger-worker/wrangler.toml` の cron を戻して `wrangler deploy` する。

必要な GitHub Secret: `CLAUDE_CODE_OAUTH_TOKEN`（`claude setup-token` で発行・1年有効）、
`VAPID_PRIVATE_KEY` / `SUBSCRIPTIONS_JSON`（Web Push）、`SECRETS_PAT`（失効購読の自動削除）。

## データスキーマ

各日のデータは `data/<YYYY-MM-DD>.json`（`schema_version: "2.0"`）。

- `categories[].id`: 10 カテゴリ `new_models` / `tools_apps` / `agents` / `multimodal` / `research_papers` / `industry_business` / `regulation_policy` / `community_buzz` / `japan` / `china`（旧 ID `tools` / `research` / `industry` は後方互換で残置）
- `top_picks[]`: 今日の必読 5-7 件（`categories[].items[].id` を参照）
- `items[].scores`: `{ importance, depth, practicality, freshness, total }`（各 5 点・計 20 点）+ `source_type_bias` / `seen_penalty`
- `items[].figure`: 図解（4 型: comparison / metric-bars / timeline / summary-card）
- `headline` / `summary_ja`: その日全体のヘッドラインと総括

詳しくは [`.claude/skills/ai-daily-digest/assets/digest-schema.json`](.claude/skills/ai-daily-digest/assets/digest-schema.json)。

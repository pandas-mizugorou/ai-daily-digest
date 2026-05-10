# JSON 生成 → git push 手順

## 前提

- リポジトリ: `https://github.com/<USER>/ai-daily-digest`（パブリック）
- ローカル作業ディレクトリ: `C:\dev\personal\ai-daily-digest\`（手動実行時）
- routine 環境では一時的に `git clone` してワーキングコピー化

## ファイル更新ルール

各実行で更新するファイル:

```
data/<YYYY-MM-DD>.json     # 当日のニュース本体（既存なら上書き、schema_version: "2.0"）
data/latest.json           # 当日の内容を複製
data/index.json            # 直近 90 日のエントリ一覧を更新（top_picks_count も格納）
data/archive/<year>.json   # 90 日超のロールオーバー先（必要時のみ）
data/_seen.json            # 直近 90 日に push した URL ハッシュ + last_seen_count（リポジトリ管理）
data/weekly-YYYY-WW.json   # 週次サマリ（金曜のみ生成、Phase D）
data/weekly-latest.json    # 週次最新（Phase D）
data/weekly-index.json     # 週次過去一覧（Phase D）
```

**`data/_seen.json` はリポジトリ管理に移行**（Phase A 以降）。`.gitignore` から `data/_seen.json` を削除して push する運用に統一。理由:
- routine 環境は毎回 `git clone` するため、ローカル FS だけでは永続化できない
- URL の SHA1 ハッシュ + プレフィックス 50 字のみで個人情報リスクなし
- リポジトリで一元管理することで、手動実行と routine の既出ペナルティが一貫する

### `data/_seen.json` のスキーマ（Phase A 以降）

```jsonc
{
  "version": "2.0",
  "updated_at": "2026-05-10T05:00:00+09:00",
  "retention_days": 90,
  "entries": {
    "<sha1_url>": {
      "url_prefix": "https://www.anthropic.com/news/",  // デバッグ用に最初の 50 字だけ
      "first_seen_at": "2026-05-09",
      "last_seen_at": "2026-05-10",
      "last_seen_count": 2
    }
  }
}
```

更新ルール:
- 新規 URL: `entries[sha1] = { url_prefix, first_seen_at: today, last_seen_at: today, last_seen_count: 1 }`
- 既存 URL: `last_seen_at = today; last_seen_count += 1`
- `last_seen_at` が `today - 90d` より古いエントリは削除
- 想定サイズ: 200-400KB（gzip 後 50-100KB、Pages 配信に支障なし）
- 500KB を超えたら `last_seen_count == 1` で `last_seen_at` 60 日以上前のエントリを優先削除

## index.json の更新ロジック

```jsonc
{
  "updated_at": "<ISO8601>",
  "entries": [
    { "date": "2026-05-10", "headline": "...", "item_count": 22, "top_picks_count": 6 },
    { "date": "2026-05-09", "headline": "...", "item_count": 18, "top_picks_count": 5 }
    // 直近 90 日まで
  ]
}
```

- 当日エントリがあれば `headline` / `item_count` / `top_picks_count` を更新、なければ先頭に追加
- 91 件目以降は `entries` から削除し、`data/archive/<year>.json` の `entries` に追記
- `top_picks_count` は schema_version=2.0 以降のみ。1.x データは未定義（フロントは optional 扱い）

## git push 手順

### 手動実行（ローカル PC）

```powershell
cd C:\dev\personal\ai-daily-digest
git pull --rebase origin main
# (スキルが data/ を更新)
git add data/
git commit -m "daily digest: 2026-05-03 (6 items)"
git push origin main
```

### routine（クラウド側）

routine 環境ではローカル FS にアクセスできない前提なので、毎回クローン:

```bash
TMPDIR=$(mktemp -d)
git clone --depth 1 "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_USER}/ai-daily-digest.git" "$TMPDIR/repo"
cd "$TMPDIR/repo"
git config user.email "ai-daily-digest-bot@users.noreply.github.com"
git config user.name "AI Daily Digest Bot"
# (スキルが data/ を更新)
git add data/
git commit -m "daily digest: ${DATE} (${N} items)"
git push origin main
cd / && rm -rf "$TMPDIR"
```

**routine 環境変数**:
- `GITHUB_TOKEN`: PAT（`repo` 権限のみ）
- `GITHUB_USER`: GitHub ユーザー名

`/schedule` 登録時に `--secret GITHUB_TOKEN=...` で渡す。

## 認証戦略の優先順位

| 案 | 内容 | 採用判断 |
|---|---|---|
| **A. PAT 環境変数** | `https://x-access-token:$GITHUB_TOKEN@github.com/...` | **第一候補** |
| B. `gh auth login --with-token` | routine 永続セッションが gh 認証を保てるか不明 | A が動かない場合に検証 |
| C. GitHub Contents API | `WebFetch` で `PUT /repos/{owner}/{repo}/contents/{path}` を叩く | git CLI 不可な場合 |

## Contents API フォールバック（git CLI 不可時）

git CLI が routine 環境で利用不可だった場合の代替実装:

```
PUT https://api.github.com/repos/<USER>/ai-daily-digest/contents/data/<YYYY-MM-DD>.json
Authorization: Bearer <GITHUB_TOKEN>
Content-Type: application/json

{
  "message": "daily digest: 2026-05-03",
  "content": "<base64-encoded-json>",
  "sha": "<existing-sha-if-update>"
}
```

各ファイル（`<date>.json` / `latest.json` / `index.json`）を順次 `PUT` する。`sha` は既存ファイル更新時に必要なので、事前に `GET` でファイル情報を取得。

複数ファイル更新ではコミットが分かれて Pages デプロイが多重化するため、**Tree API + Refs API** で 1 コミットにまとめるのが理想:

1. `GET /git/refs/heads/main` で main の sha 取得
2. `POST /git/blobs` で各ファイルの blob 作成
3. `POST /git/trees` で tree 作成
4. `POST /git/commits` で commit 作成
5. `PATCH /git/refs/heads/main` で main を進める

実装は `assets/prompt-templates/contents-api-push.md` を参照（必要時に追加）。

## トラブルシュート

### push 失敗: 認証エラー

- PAT の有効期限切れ → 新しい PAT を生成して `--secret GITHUB_TOKEN` を更新
- PAT のスコープ不足 → `repo` スコープが必要（パブリックリポジトリでも `public_repo` 推奨）

### push 失敗: コンフリクト

- 手動実行と routine の二重実行 → routine 側で `git pull --rebase` を冒頭に必ず実行
- それでも衝突 → ローカル `data/<date>.json` を破棄して routine の最新を採用

### Pages デプロイされない

- Settings → Pages → Source が `main` / root か確認
- Actions タブで Pages build & deployment ワークフローを確認
- ブラウザのキャッシュ → DevTools → Disable cache で再読込
- CDN キャッシュ → 10 分待つ、または `?v=<commit-sha>` クエリで強制更新

### 同記事が連日出続ける

- `data/_seen.json` の URL ハッシュ + `last_seen_count` が正しく蓄積されているか確認
- 段階化ペナルティ（last_seen_count=1 で -1、=2 で -2、=3+ で -3）が反映されているか scoring ステップでログ出力
- リポジトリ管理に切り替わっているか（`.gitignore` から `data/_seen.json` を削除済か）確認

## 週次サマリ（金曜のみ）の書き込みルール

`/ai-daily-digest` Phase D 以降。詳細は `references/weekly.md` 参照。

### 書き込み対象ファイル

```
data/weekly-YYYY-WW.json     # 当週の本体 (例: weekly-2026-W19.json)
data/weekly-latest.json      # 最新週の複製
data/weekly-index.json       # 過去週一覧
```

`weekly-YYYY-WW` の `WW` は ISO 8601 週番号（2 桁、ゼロ埋め）。

### weekly-index.json のスキーマ

```jsonc
{
  "updated_at": "<ISO8601>",
  "entries": [
    { "week": "2026-W19", "from": "2026-05-04", "to": "2026-05-10", "headline": "...", "top_count": 10, "selected_items": 50 },
    { "week": "2026-W18", "from": "2026-04-27", "to": "2026-05-03", "headline": "...", "top_count": 10, "selected_items": 48 }
  ]
}
```

- 当週エントリがあれば更新、なければ先頭に追加
- 過去 52 週まで保持（1 年）

### 週次の commit & push

日次の commit & push 完了後、別 commit として:

```powershell
git add data/weekly-*.json data/weekly-latest.json data/weekly-index.json
git commit -m "weekly digest: 2026-W19 (top 10)"
git push origin main
```

デイリーと週次を別 commit にする理由:
- デプロイのトリガーが分離される（Pages の build 履歴がきれい）
- 週次失敗時にデイリーが影響を受けない
- 週次の re-run を `git revert` 1 発でできる

### 失敗時のエラーレポート

週次生成失敗時は:

```jsonc
// data/_errors/weekly-2026-W19.json
{
  "week": "2026-W19",
  "from": "2026-05-04",
  "to": "2026-05-10",
  "generated_at": "...",
  "error_type": "insufficient_data | aggregation_failed | prompt_error",
  "details": "...",
  "available_dates": ["2026-05-08", "2026-05-09", "2026-05-10"]  // 3 日未満なら insufficient_data
}
```

このエラーレポートも別 commit で push し、GitHub 上で可視化する。

## 失敗時のエラーレポート

選定 0 件の場合や push 失敗の場合、`data/_errors/<YYYY-MM-DD>.json` を生成して push し、GitHub 上でエラーが見られるようにする:

```json
{
  "date": "2026-05-03",
  "generated_at": "...",
  "error_type": "selection_zero",
  "details": "WebFetch のうち 8/10 が失敗。3 件以上の有効ソースが取れなかった",
  "skipped_sources": [...],
  "raw_collected": [...]
}
```

routine プロンプト側で「失敗時は data/_errors/ に push」を明示。

---
name: ai-daily-digest
description: AI / 生成 AI 関連のニュースを毎朝 5 時 JST に自動収集し、4 軸（重要度 / 技術深度 / 実用性 / 鮮度）でスコアリングして上位 5-7 件をカテゴリ分けし、GitHub Pages 上の静的サイト（ai-daily-digest）に JSON として push するスキル。Anthropic / OpenAI / DeepMind / Meta / Microsoft / Mistral / xAI / Nvidia / Hugging Face / Cohere の公式ブログ、Hacker News、arXiv、Hugging Face Trending、GitHub Trending、日本語ソース（Qiita / Zenn / ITmedia AI+）を巡回する。技術的キャッチアップ目的（X 発信のバイラル軸ではない）。手動実行も可能で、ユーザーが「今日のAIニュース」「daily digest」「AI まとめ」「ニュースサイト更新」「digest 実行」「AI 日次」「AIニュース更新」などに言及したら使うこと。/x-topic-radar とはスコア軸・出力先・読者が異なるため別スキルとして実装される。完全無料で動作（WebFetch / WebSearch + git CLI のみ）。定期実行は /schedule で routine として登録される。`--dry-run` 引数で push せずローカルファイル生成のみも可能。
---

# AI Daily Digest スキル

## このスキルが行うこと

毎朝 5:00 JST に AI / 生成 AI 関連のニュースを自動収集 → 4 軸スコアリング → カテゴリ分け → JSON 生成 → GitHub に push して GitHub Pages を更新する。

**新規ターン用語の定義**:
- 「ターゲット日」 = `today` 引数または現在の日本時間日付（`YYYY-MM-DD`）
- 「リポジトリ」 = `C:\dev\personal\ai-daily-digest\`（手動実行時）または `git clone` した一時ワーキングコピー（routine 実行時）

## トリガー

- ユーザーが「今日の AI ニュース」「daily digest」「AI まとめ」「ニュースサイト更新」「digest 実行」「digest を更新」と発言
- `/schedule` で登録した routine が cron `0 20 * * *` (UTC = JST 5:00) で発火

## 関連ドキュメント

実行前に読み込んで判断材料にする:

- `references/sources.md` — 巡回ソース一覧と取得方法・フォールバック
- `references/scoring.md` — 4 軸スコアリングの判定基準
- `references/persona.md` — 「押さえるべき」とみなす基準
- `references/publish.md` — JSON 生成 → git push の具体手順とトラブルシュート
- `assets/digest-schema.json` — 出力 JSON の Schema（参考、`figure` フィールド含む）
- `assets/prompt-templates/extract-article.md` — WebFetch 用記事抽出
- `assets/prompt-templates/score-articles.md` — 4 軸スコアリング
- `assets/prompt-templates/summarize-ja.md` — 日本語要約 + 図解情報生成（同一プロンプト）
- `assets/prompt-templates/figure-design.md` — 図解 (`figure`) 設計の 10 原則・型ごとの記法

## 実行フロー（Step 1-10）

### Step 1: リポジトリ準備

**手動実行（ローカル PC）の場合**:
- `C:\dev\personal\ai-daily-digest\` の `git status` を確認
- 未コミット変更があればユーザーに通知して停止
- `git pull --rebase origin main`

**routine（クラウド側）の場合**:
- 一時ディレクトリに `git clone https://x-access-token:$GITHUB_TOKEN@github.com/<USER>/ai-daily-digest.git`
- 完了後にディレクトリを破棄（ローカル FS にアクセスできない前提）

### Step 2: ソース並列取得

`references/sources.md` に従い、以下を**並列バッチ**で取得:

- **バッチ 1（公式ブログ 10 並列）**: Anthropic / OpenAI / DeepMind / Meta / Microsoft / Mistral / xAI / Nvidia / Hugging Face Blog / Cohere
- **バッチ 2（アグリゲータ）**: HN Algolia 5 クエリ + arXiv 1 + HF Trending Models 1 + HF Trending Datasets 1
- **バッチ 3（補助）**: Reddit r/MachineLearning + r/LocalLLaMA + Qiita + Zenn + ITmedia AI+

各ソースで失敗した場合は `references/sources.md` のフォールバックを実行し、`skipped_sources` に理由を記録する。

### Step 3: 共通スキーマへ正規化

各記事を以下の中間スキーマにマッピング:
```
{ id, source, source_label, title, title_ja(後で生成), url, published_at, summary_en, raw_excerpt, lang }
```

### Step 4: 重複排除

- URL 完全一致で 1 件に統合
- タイトルの Jaccard 類似度（5-gram）が 0.6 以上で同一記事と判定して統合

### Step 5: 既出ペナルティ適用

`data/_seen.json`（直近 30 日に push 済みの URL ハッシュ集合）を読み、既出記事には `freshness` スコアを **-2** する（同じ記事が連日トップに来る防止）。`_seen.json` は `.gitignore` 対象だが routine ではリポジトリ内に保持して push する運用も可。

### Step 6: 4 軸スコアリング

`references/scoring.md` の判定基準と `references/persona.md` のフィルタ基準で各記事を採点:
- importance / depth / practicality / freshness（各 5 点・計 20 点）

ペルソナフィルタで完全除外する記事は削除。

### Step 7: カテゴリ分類 + Top N 選定

スコア降順で並べ、以下の配分で上位 5-7 件を選定:

| カテゴリ | id | 上限 |
|---|---|---|
| 新モデル・新発表 | `new_models` | 2 |
| ツール・SDK | `tools` | 2 |
| 研究・論文 | `research` | 2 |
| 業界動向 | `industry` | 1 |
| 日本語ソース | `japan` | 1 |

**英語比率**: `japan` 以外で 4 件以上を確保する（70% ルール）。

### Step 8: 日本語要約 + 図解情報生成

選定された Top N（最大 7 件）のみ、**1 つのプロンプトで併せて生成**:
- `title_ja` を生成（必要な場合）
- `summary_ja`（3-5 行）を生成
- `key_points_ja`（2-4 個）を生成
- `figure` を生成（**任意**：明確な数字がある記事のみ）

`assets/prompt-templates/summarize-ja.md` のプロンプトを使用。`figure` の作り方は `assets/prompt-templates/figure-design.md` を参照（10 原則 + 型ごとの記法）。**記事に明確な数字がない場合は `figure` を省略**する（無理に作ると事実誤りリスク）。

### Step 9: JSON 書き込み + 更新

- `data/<YYYY-MM-DD>.json` を書き込み（既存なら上書き）
- `data/latest.json` を同内容で上書き
- `data/index.json` の `entries` 先頭に当日のエントリを追加（既存なら更新）。直近 90 日のみ保持
- 90 日超のエントリは `data/archive/<year>.json` に追記
- 全体ヘッドライン `headline` と `summary_ja`（日全体の総括）を生成

### Step 10: commit & push + 通知

```
git add data/
git commit -m "daily digest: <YYYY-MM-DD> (N items)"
git push origin main
```

ユーザーに以下を通知:
- 公開 URL: `https://<USER>.github.io/ai-daily-digest/#<YYYY-MM-DD>`
- 統計: 収集件数 / 重複排除後 / 選定件数
- スコア分布: Top 件のスコア合計平均
- 失敗ソース: `skipped_sources` の中身

## 引数

| 引数 | 効果 |
|---|---|
| `--dry-run` | push しない。`data/` への書き込みのみで終了 |
| `--date YYYY-MM-DD` | ターゲット日を上書き（過去日の再生成用） |
| `--no-push` | commit のみで push を行わない |
| `--manual` | 手動実行モード（ローカル `C:\dev\` を使う。routine モードと区別） |

## 失敗時の振る舞い

- WebFetch が一部失敗 → `skipped_sources` に記録して継続。**3 件以上選定できれば push する**
- 選定 0 件 → push せずに終了。`data/_errors/<date>.json` を出力（routine 経由なら push して可視化）
- git push 失敗（認証エラー等）→ ユーザーに通知して `--dry-run` 結果を保持

## /x-topic-radar との棲み分け

| 観点 | `/x-topic-radar` | **`/ai-daily-digest`** |
|---|---|---|
| 目的 | X 投稿のネタ選定 | 技術キャッチアップ |
| スコア軸 | 鮮度 / ペルソナ適合 / 差別化 / **バイラル** | 鮮度 / **重要度 / 技術深度 / 実用性** |
| 出力先 | Google Drive のローカル MD | **GitHub Pages 公開サイト** |
| 想定読者 | ユーザー本人（X 発信用） | ユーザー本人 + 一般読者 |

ソース取得 URL リストは一部共通だが、スコアリングと出力は完全に独立している。

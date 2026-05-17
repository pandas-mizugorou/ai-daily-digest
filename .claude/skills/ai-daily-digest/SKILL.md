---
name: ai-daily-digest
description: AI / 生成 AI 関連のニュースを毎朝 5 時 JST に自動収集し、4 軸（重要度 / 技術深度 / 実用性 / 鮮度）+ ソースタイプ補正でスコアリングして「今日の必読 Top 5-7（top_picks）」+「カテゴリ別 15-20 件」の二段構成（合計 20-27 件）で配信するスキル。10 カテゴリ（new_models / tools_apps / agents / multimodal / research_papers / industry_business / regulation_policy / community_buzz / japan / china）に分類して GitHub Pages 上の静的サイト（ai-daily-digest）に JSON として push する。巡回ソースは公式ブログ（Anthropic / OpenAI / DeepMind / Meta / Microsoft / Mistral / xAI / Nvidia / Hugging Face / Cohere）+ アグリゲータ（Hacker News / arXiv / Hugging Face Trending / GitHub Trending）+ 海外解説メディア（TechCrunch / The Verge / VentureBeat / Wired / Stratechery 等）+ 学術プラットフォーム（Papers with Code / Semantic Scholar / OpenReview / Latent Space / Import AI / The Batch）+ コミュニティ議論層（Reddit r/LocalLLaMA・r/MachineLearning 等の `top.rss` / HN コメント / X 公開トレンド）+ 中華圏（36Kr AI / 量子位 / 機器之心 / ChinAI Newsletter）+ 日本語ソース（PFN / ELYZA / Sakana AI / LINEヤフー / CyberAgent AI Lab / Stockmark / メルカリ / Sansan の企業テックブログ、はてなブックマーク、Qiita / Zenn / ITmedia AI+）の合計 60-80 ソース。時間窓はソース別に動的（公式速報=24h / 解説論文中華圏=7d / コミュニティ=48h）。日本語ソースは反響ブースト（はてブ・いいね数）を加味して 5 件選定。金曜は週次サマリ（top_10 / papers_5 / models_3 / community_buzz_3 / japan_3 / china_3 / keyword_cloud / watchlist_next_week）も追加生成。技術的キャッチアップ目的（X 発信のバイラル軸ではない）。手動実行も可能で、ユーザーが「今日のAIニュース」「daily digest」「AI まとめ」「ニュースサイト更新」「digest 実行」「AI 日次」「AIニュース更新」などに言及したら使うこと。/x-topic-radar とはスコア軸・出力先・読者が異なるため別スキルとして実装される。完全無料で動作（WebFetch / WebSearch + git CLI のみ）。定期実行は /schedule で routine として登録される。`--dry-run` 引数で push せずローカルファイル生成のみも可能、`--weekly-only` で週次サマリのみ再生成可能。
---

# AI Daily Digest スキル

## このスキルが行うこと

毎朝 5:00 JST に AI / 生成 AI 関連のニュースを自動収集 → 4 軸スコアリング + ソースタイプ補正 → 10 カテゴリ分け → 「今日の必読 Top 5-7（top_picks）」+「カテゴリ別 15-20 件」の二段構成で JSON 生成 → GitHub に push して GitHub Pages を更新する。日本語ソースは反響シグナル（はてブ・いいね）を加味して 5 件採用し、合計 **20-27 件** をユーザーに提供する。金曜は追加で週次サマリ（`data/weekly-YYYY-WW.json`）も生成する。

**新規ターン用語の定義**:
- 「ターゲット日」 = `today` 引数または現在の日本時間日付（`YYYY-MM-DD`）
- 「リポジトリ」 = `C:\dev\personal\ai-daily-digest\`（手動実行時）または `git clone` した一時ワーキングコピー（routine 実行時）

## トリガー

- ユーザーが「今日の AI ニュース」「daily digest」「AI まとめ」「ニュースサイト更新」「digest 実行」「digest を更新」と発言
- `/schedule` で登録した routine が cron `0 20 * * *` (UTC = JST 5:00) で発火

## 関連ドキュメント

実行前に読み込んで判断材料にする:

- `references/sources.md` — 巡回ソース一覧と取得方法・フォールバック・`time_window_hours`
- `references/scoring.md` — 4 軸スコアリング + ソースタイプ補正 + 既出ペナルティ段階化
- `references/persona.md` — 「押さえるべき」とみなす基準 + community_buzz / agents 定義
- `references/categories.md` — 10 カテゴリの定義・判定優先順・旧 ID マッピング
- `references/publish.md` — JSON 生成 → git push の具体手順 + `_seen.json` 永続化方針
- `references/weekly.md` — 週次サマリ（金曜のみ）の仕様（Phase D で追加）
- `assets/digest-schema.json` — 出力 JSON の Schema（top_picks / source_type / 10 カテゴリ）
- `assets/digest-weekly-schema.json` — 週次サマリの JSON Schema（Phase D で追加）
- `assets/prompt-templates/extract-article.md` — WebFetch 用記事抽出
- `assets/prompt-templates/score-articles.md` — 4 軸スコアリング + カテゴリ判定
- `assets/prompt-templates/select-top-picks.md` — Top Picks 5-7 件選定
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

### Step 2: ソース並列取得（バッチ 1-7、合計 60-80 ソース）

`references/sources.md` に従い、以下を**並列バッチ**で取得（バッチ単位で独立メッセージ、間に 1-2 秒待機）:

- **バッチ 1（公式ブログ 10 並列、source_type: official、time_window_hours: 24）**: Anthropic / OpenAI / DeepMind / Meta / Microsoft / Mistral / xAI / Nvidia / Hugging Face Blog / Cohere
- **バッチ 2（アグリゲータ 8-10、source_type: aggregator/academic）**: HN Algolia 5 クエリ (48h) + arXiv 1 (168h) + HF Trending Models 1 (168h) + HF Trending Datasets 1 (168h) + GitHub Trending 1 (24h)
- **バッチ 3-A（日本企業テックブログ 8 並列、source_type: japan_corp、time_window_hours: 168）**: Preferred Networks / ELYZA (note) / Sakana AI / LINEヤフー / CyberAgent AI Lab / Stockmark / メルカリ engineering / Sansan Builders Box
- **バッチ 3-B（日本コミュニティ 6-8 並列、source_type: japan_community、time_window_hours: 48）**: はてなブックマーク（生成AI / LLM / Claude 検索 + hotentry/it.rss）+ Qiita 拡張タグ（生成AI / LLM / Claude / OpenAI / Anthropic / Agent / RAG / MCP）+ Zenn 拡張トピック（ai / 生成ai / llm / claude / openai / agent）+ ITmedia AI+
- **バッチ 4（海外解説メディア 8 並列、source_type: media、time_window_hours: ソース別）**: TechCrunch AI (24h) / The Verge AI (24h) / VentureBeat AI (24h) / Wired AI (48h) / The Information (WebSearch, 48h) / Stratechery (168h) / MIT Technology Review AI (48h) / Ars Technica AI (24h)
- **バッチ 5（学術プラットフォーム 8 並列、source_type: academic、time_window_hours: 168/336）**: Papers with Code Trending (168h) / Papers with Code SoTA (168h) / Semantic Scholar API 4 並列クエリ (168h) / OpenReview (336h) / Latent Space (Substack, 168h) / Import AI (168h) / The Batch (168h) / Sebastian Raschka Magazine (336h)
- **バッチ 6（コミュニティ議論層 8 並列、source_type: community、time_window_hours: 48）**: Reddit r/LocalLLaMA / r/MachineLearning / r/singularity / r/ClaudeAI / r/OpenAI の `top.rss?t=day` + HN 拡張 200pt 以上 + X 公開トレンド (WebSearch) + LessWrong AI tag (168h)
- **バッチ 7（中華圏 5-6 並列、source_type: china、time_window_hours: 168）**: 36Kr AI / 量子位 (QbitAI) / 機器之心 (Synced 英語版優先) / ChinAI Newsletter (Substack 英語) / HF daily-papers / Zhihu (WebSearch)

各ソースで失敗した場合は `references/sources.md` のフォールバックを実行し、`skipped_sources` に理由を記録する。**はてブ検索 / Qiita API / Reddit RSS / Semantic Scholar から取得した反響シグナル（users / likes / points / citation_count）は中間スキーマに `reaction_signal` として保存**し、Step 6 のスコアリングで使う。

**source_type の付与**: 各ソースに `references/sources.md` の表で定義された `source_type` を中間スキーマに付与。Step 6 で `source_type_bias` の判定に使う。

### Step 3: 共通スキーマへ正規化

各記事を以下の中間スキーマにマッピング:
```
{ id, source, source_label, source_type, title, title_ja(後で生成), url, published_at, summary_en, raw_excerpt, lang, reaction_signal, time_window_hours }
```

- `source_type`: `references/sources.md` の表に従い `official` / `media` / `academic` / `community` / `china` / `japan_corp` / `japan_community` / `aggregator` のいずれかを付与
- `time_window_hours`: ソース定義から継承
- `lang`: `en` / `ja` / `zh` / `other`

`reaction_signal` の種類:
- はてブ取得記事: `{ kind: "hatena", users: <int> }`
- Qiita: `{ kind: "qiita", likes: <int>, stocks: <int> }`
- Zenn: `{ kind: "zenn", liked: <int> }`
- HN: `{ kind: "hn", points: <int> }`
- Reddit Top RSS: `{ kind: "reddit_top", min_score: 100 }` （RSS から取得不可なため Top 入りで仮定）
- Semantic Scholar: `{ kind: "semantic_scholar", citation_count: <int> }`
- X 公開トレンド: `{ kind: "x_trend" }` （詳細メトリクスなし、トレンド入りで採用）

### Step 4: 重複排除

- URL 完全一致で 1 件に統合
- タイトルの Jaccard 類似度（5-gram）が 0.6 以上で同一記事と判定して統合

### Step 5: 時間窓フィルタ + 既出ペナルティ適用

**5-A: 時間窓フィルタ**

`references/sources.md` の各ソースに付与された `time_window_hours` を読み、各記事の `published_at` がその窓内にない場合は除外する（`_excluded: outside_time_window`）。デフォルトは 24h、論文・解説・中華圏は 168h（7d）、コミュニティは 48h。

**5-B: 既出ペナルティ（段階化）**

`data/_seen.json`（直近 90 日に push 済みの URL ハッシュ集合 + `last_seen_count`）を読み、`last_seen_count` に応じて段階的に `freshness` を減点:

| `last_seen_count` | freshness 減点 |
|---|---|
| 1 | -1 |
| 2 | -2 |
| 3 以上 | -3 |
| `first_seen_at` が 30 日以上前 | 追加で -3（古い記事の再注目を除外） |

`data/_seen.json` は **リポジトリ管理に移行**（`.gitignore` から除外、URL ハッシュ + プレフィックス 50 字のみで個人情報リスクなし）。詳細は `references/publish.md` 参照。

### Step 6: 4 軸スコアリング + ソースタイプ補正

`references/scoring.md` の判定基準と `references/persona.md` のフィルタ基準で各記事を採点:
- importance / depth / practicality / freshness（各 5 点・計 20 点）

**ソースタイプ補正**（`source_type_bias`、importance に加減算後 1-5 でクリップ）:
- official: +0 / media: -1 / academic: +1 / community: -1 / china: +0 / japan_corp: +0 / japan_community: +0 / aggregator: +0

**適用順序**:
1. 通常の 4 軸採点
2. `source_type_bias` を `importance` に加算（5 でクリップ、1 で下限）
3. 反響ブースト（はてブ・Qiita・Zenn・HN）を `importance` に加算（5 でクリップ）
4. 時間窓フィルタ + 既出ペナルティ `freshness` 減点（Step 5 で適用済み）
5. ペルソナフィルタで除外判定

ペルソナフィルタで完全除外する記事は削除。

### Step 7: カテゴリ分類 + 件数選定（10 カテゴリ）

スコア降順で並べ、以下の配分で **上位 18-25 件** を選定（合計上限 25 件、実運用平均 18-22 件）:

| カテゴリ | id | 上限 | 定義 |
|---|---|---|---|
| 新モデル・新発表 | `new_models` | 3 | フロンティアラボ・主要 OSS の新モデル発表・モデルファミリーアップデート |
| ツール・アプリ・SDK | `tools_apps` | 3 | SDK / API / IDE 統合 / OSS フレームワーク / 商用エンドユーザーアプリ |
| エージェント・自律実行 | `agents` | 2 | 自律エージェント / マルチエージェント / Computer Use / ツール呼び出し系 |
| マルチモーダル・生成 | `multimodal` | 2 | 画像・動画・音声生成・統合モデル・3D 生成 |
| 研究・論文 | `research_papers` | 3 | arXiv 論文・学術プラットフォーム・解説論考（Latent Space / Import AI / The Batch） |
| 業界動向・ビジネス | `industry_business` | 2 | M&A / 資金調達 / パートナーシップ / 大型契約 / 主要メディアの戦略解説 |
| 規制・政策・安全 | `regulation_policy` | 1 | EU AI Act / 各国規制 / 安全性研究 / アライメント論考 |
| コミュニティ反響 | `community_buzz` | 2 | Reddit / HN / X で大きく話題になった事例・議論・実体験投稿 |
| 日本語ソース | `japan` | **5** | 日本企業テックブログ + 日本コミュニティ反響 |
| 中華圏 | `china` | 2 | 中国の AI 企業・研究機関・政策・コミュニティ |

**カテゴリ判定**: 1 記事は 1 カテゴリのみ所属。判定優先順は `regulation_policy` > `agents` > `multimodal` > `new_models` > `tools_apps` > `research_papers` > `industry_business` > `community_buzz` > `japan` > `china`（左ほど狭く具体的な定義を優先）。詳細は `references/categories.md` を参照。

**後方互換**: 旧 ID（`tools` / `research` / `industry`）は schema enum に残置。新規生成時は新 ID を使うが、過去日のデータは旧 ID のまま読める。

**日本語ソース選定の細則**:
- 反響ブースト適用後のスコアで `japan` カテゴリから 5 件選定
- 同一ドメイン（同じ企業ブログ等）から最大 2 件まで
- はてブ・Qiita / Zenn likes が完全 0 の個人記事は原則除外
- 5 件埋まらない場合は空き枠を許容（無理に他カテゴリから振り分けない）

**英語比率**: `japan` 以外で 13-20 件を確保する（合計 18-25 件中、日本語 5 件 + 英語 13-20 件）。

### Step 7.5: Top Picks 選定（5-7 件、必読キューレーション層）

`assets/prompt-templates/select-top-picks.md` に従い、Step 7 で選定した全件から「必読 Top 5-7」を抽出:

```
1. 必読フラグ自動付与:
   - importance>=4 AND (depth+practicality)>=7、または
   - 公式ソース（anthropic/openai/google_deepmind/meta_ai 等）AND importance>=4、または
   - 強い反響シグナル（はてブ>=100 / HN>=500pt / Reddit Top>=300）
2. 必読フラグ付き全件を最大 4 件まで picks に投入（合計スコア降順）
3. 残り枠（target=6）をスコア順 + カテゴリ多様性 + ソース多様性のラウンドロビンで補充
4. japan 最低 1 件保証（必読でない英語記事と swap）
5. importance>=4 の china があれば 1 件保証（条件付き、強制ではない）
```

`top_picks[]` は **id 参照のみ**（`{ "id": "...", "rank": 1, "reason": "..." }`）。本体データは `categories[].items[]` 内に持つことでデータ重複ゼロ。

### Step 8: 日本語要約 + 図解情報生成

選定された Top N（**最大 25 件**）のみ、**1 つのプロンプトで併せて生成**:
- `title_ja` を生成（**英語ソースでは必須・意訳の和文見出し**。フロントは `lang === "en"` のとき title_ja のみをカード上段に表示するため、生成品質が UI 体験を直接決める）
- `summary_ja`（3-5 行）を生成
- `key_points_ja`（2-4 個）を生成
- `figure` を生成（**全記事必須**：4 型 comparison / metric-bars / timeline / summary-card のいずれか）

`assets/prompt-templates/summarize-ja.md` のプロンプトを使用。`figure` の作り方は `assets/prompt-templates/figure-design.md` を参照（10 原則 + 型ごとの記法）。**figure は全記事で必須**（数字が乏しい記事は summary-card で記事内の事実・固有名詞・主張を構造化）。**記事にない数字や推測の追加は厳禁**（事実誤りリスクの回避は「省略」ではなく「記事内の事実のみ使用」で担保）。

### Step 8.5: X 投稿文生成（Top Picks のみ）

Step 7.5 で選定した Top Picks（5-7 件）の item にだけ `x_post`（string、そのまま X に投稿できる完成文）を 1 つ生成する。`assets/prompt-templates/x-post.md` と `references/x-persona.md` に厳密に従う（「である」調 / 一人称「私」/ ハッシュタグ 0 / 絵文字 ≤1 / 本文 120 字目安 + 空行 + 元記事 URL）。**記事内の事実のみ**（誇張・推測・記事に無い数字は禁止。X に直接投稿されるため figure と同等の事実厳格さ）。Top Picks 以外の item には付けない。

### Step 9: JSON 書き込み + 更新

- `data/<YYYY-MM-DD>.json` を書き込み（既存なら上書き）。`schema_version: "2.0"` / `top_picks[]` / `categories[]` / `stats.by_category` / `stats.top_picks_count` を含む
- `data/latest.json` を同内容で上書き
- `data/index.json` の `entries` 先頭に当日のエントリを追加（既存なら更新）。直近 90 日のみ保持。`top_picks_count` も格納
- 90 日超のエントリは `data/archive/<year>.json` に追記
- `data/_seen.json` を更新（`last_seen_count` をインクリメント、新規 URL は `first_seen_at` に当日追加）
- 全体ヘッドライン `headline` と `summary_ja`（日全体の総括）を生成

### Step 10: commit & push + 通知

```
git add data/
git commit -m "daily digest: <YYYY-MM-DD> (N items)"
git push origin main
```

ユーザーに以下を通知:
- 公開 URL: `https://<USER>.github.io/ai-daily-digest/#<YYYY-MM-DD>`
- 統計: 収集件数 / 重複排除後 / 選定件数 / Top Picks 件数 / カテゴリ別件数
- スコア分布: Top Picks の平均スコア / 全選定の平均スコア
- 失敗ソース: `skipped_sources` の中身

### Step 11: 週次サマリ生成（金曜のみ）

`today.weekday() == 4` (Friday in JST、`TZ=Asia/Tokyo` で計算) のときのみ、日次の push 完了後に追加実行する。詳細仕様は `references/weekly.md` および `assets/prompt-templates/weekly-summary.md` 参照。

**`--no-weekly` 引数で金曜でもスキップ可能。`--weekly-only` で週次のみ再生成可能（その場合 Step 1-10 を skip）。**

1. **入力読み込み**: `data/<YYYY-MM-DD>.json` の直近 7 日分（金曜から遡って 7 日 = 過去の土〜金）を読む。ISO 週番号 `YYYY-WW` を計算
2. **前週データ読み込み**: `data/weekly-latest.json` を読み（前週比 delta 計算用、無ければ null）
3. **統合 + 重複排除**: 全 `categories[].items[]` をマージ、URL 完全一致 / タイトル類似度 0.8 以上で同一視
4. **top_10 選定**: 全日の `top_picks[]` を最大 7 件まで取り込み + スコア順補充（同一 source 2 件まで、カテゴリ多様性保証）。5-12 件で確定
5. **カテゴリ別選定**: `papers_5` (research_papers / academic、最大 7) / `models_3` (new_models、最大 5) / `community_buzz_3` / `japan_3` / `china_3` を選定（各最大 5）
6. **keyword_cloud 集計**: 全 items の `tags[]` を集計、上位 20 個、`prev_week_data` と比較して `delta_vs_prev_week` を算出
7. **watchlist_next_week 抽出**: `summary_ja` / `key_points_ja` から「予定 / 今後 / 近日 / Q2-Q4 2026 / upcoming / next week / expected / rumored / 公開予定」キーワードを正規表現抽出。固有名詞（モデル名・企業名）を `topic` に、3-8 件
8. **headline / summary_ja 生成**: 週全体の総括を 300-500 字で（リード + 詳細 + 業界文脈 + 来週への含意）
9. **書き込み**: `data/weekly-YYYY-WW.json` / `data/weekly-latest.json` / `data/weekly-index.json` を更新
10. **commit & push**: `git add data/weekly-*.json data/weekly-latest.json data/weekly-index.json && git commit -m "weekly digest: YYYY-WW (top N)" && git push origin main`
11. **通知**: 「週次サマリ URL: `https://<USER>.github.io/ai-daily-digest/weekly/#YYYY-WW`」を追加

**失敗時の振る舞い**:
- 週次生成失敗 → デイリー push は完了済み、`data/_errors/weekly-YYYY-WW.json` を別 commit で push
- 過去 7 日のうち 3 日未満しかデータが無い → 週次生成をスキップ
- top_10 が 5 件未満 → 5 件未満で出力（無理に埋めない）

週次は **独立処理** として実装し、Step 1-10 のデイリー処理が完了してから別の git commit で push する（デイリーと週次のデプロイを分離）。

## 引数

| 引数 | 効果 |
|---|---|
| `--dry-run` | push しない。`data/` への書き込みのみで終了 |
| `--date YYYY-MM-DD` | ターゲット日を上書き（過去日の再生成用） |
| `--no-push` | commit のみで push を行わない |
| `--manual` | 手動実行モード（ローカル `C:\dev\` を使う。routine モードと区別） |
| `--weekly-only` | Step 11（週次サマリ）のみ実行。日次（Step 1-10）はスキップ。週次の再生成・修正用 |
| `--no-weekly` | 金曜でも Step 11（週次サマリ）をスキップ |

## 失敗時の振る舞い

- WebFetch が一部失敗 → `skipped_sources` に記録して継続。**3 件以上選定できれば push する**
- 選定 0 件 → push せずに終了。`data/_errors/<date>.json` を出力（routine 経由なら push して可視化）
- git push 失敗（認証エラー等）→ ユーザーに通知して `--dry-run` 結果を保持
- 週次サマリ（Step 11）失敗 → デイリー push は完了させ、`data/_errors/weekly-<YYYY-WW>.json` を別出力

## /x-topic-radar との棲み分け

| 観点 | `/x-topic-radar` | **`/ai-daily-digest`** |
|---|---|---|
| 目的 | X 投稿のネタ選定 | 技術キャッチアップ |
| スコア軸 | 鮮度 / ペルソナ適合 / 差別化 / **バイラル** | 鮮度 / **重要度 / 技術深度 / 実用性** |
| 出力先 | Google Drive のローカル MD | **GitHub Pages 公開サイト** |
| 想定読者 | ユーザー本人（X 発信用） | ユーザー本人 + 一般読者 |

ソース取得 URL リストは一部共通だが、スコアリングと出力は完全に独立している。

# 週次サマリ（金曜のみ生成）

`/ai-daily-digest` Phase D 以降。日次の push 完了後、**金曜のみ**追加で週次サマリを生成する。

## 発火タイミング

- **金曜の routine 実行時**: `today.weekday() == 4` (Friday in JST、`TZ=Asia/Tokyo` で計算)
- 通常の日次 JSON を生成・push した直後に追加で実行
- 週の範囲: 直近 7 日（金曜から遡って 7 日 = 過去の土〜金）
- ISO 8601 週番号 `YYYY-WW` で命名（例: `2026-W19`）

`--no-weekly` 引数で金曜でもスキップ可能。`--weekly-only` で週次のみ再生成可能。

## 入力

- `data/<YYYY-MM-DD>.json` の **直近 7 日分** を読み込む
- 各日の `categories[].items[]` を全部マージし `week_items` として保持
- 重複排除: 同一 URL は 1 件に統合（複数日にまたがって出た場合は最新の `published_at` を採用）
- 各日の `top_picks[]` を尊重（top_picks に入っていた item は `top_10` 候補として優先度高）

## 出力

```
data/weekly-YYYY-WW.json     # 当週の本体
data/weekly-latest.json      # 最新週の複製 (フロント高速アクセス用)
data/weekly-index.json       # 過去週一覧 (週次の date_select 用)
```

## スキーマ

`assets/digest-weekly-schema.json` を参照。主要フィールド:

- `week`: ISO 週番号（例: "2026-W19"）
- `from` / `to`: 週開始・終了日
- `headline` / `summary_ja`: 週全体のヘッドラインと総括（300-500 字）
- `stats`: 集計統計（total_collected_week / after_dedup / selected_items / top_count）
- `top_10` (5-12 件): 今週のトップニュース、必読性重視
- `papers_5` (最大 7): 今週の論文（research_papers から）
- `models_3` (最大 5): 今週の注目モデル（new_models から importance 順）
- `community_buzz_3` (最大 5): 今週のコミュニティ反響
- `japan_3` / `china_3` (各最大 5): 日本・中華圏ソースから
- `keyword_cloud`: 頻出タグ + 前週比 `delta_vs_prev_week`
- `watchlist_next_week` (最大 8): 来週の watch list
- `week_items_index`: 過去 7 日の全 item を id 参照（本文は `data/<date>.json` から遅延 fetch）

## 選定アルゴリズム

### top_10 選定
1. 過去 7 日の全 `top_picks[]` を統合（必読性が高い）→ 最大 7 件まで取り込み
2. 残り枠を全 items から `scores.total` 降順で補充、ただし以下を保証:
   - 同一 URL 重複排除済み
   - 同一 source は 2 件まで
   - カテゴリ多様性（new_models / research_papers / industry_business から各 1 件以上）
3. 5-12 件で確定

### papers_5 / models_3 / community_buzz_3
- それぞれのカテゴリから `scores.total` 降順で抽出
- papers_5 は research_papers + Latent Space / Import AI / The Batch (academic source_type) からも拾う
- models_3 は new_models + multimodal の重要モデルから

### japan_3 / china_3
- カテゴリ `japan` / `china` からスコア順
- 反響シグナルを優先（はてブ users / Qiita likes / Reddit min_score）

### keyword_cloud
- 全 items の `tags[]` を集計
- 上位 20 個まで保持
- 前週の `weekly-YYYY-W(N-1).json` を読み込んで `delta_vs_prev_week` を計算
  - 新規キーワード（前週に無い）→ delta = count
  - 消失キーワード（今週に無い）→ keyword_cloud に含めない

### watchlist_next_week
- `summary_ja` / `key_points_ja` 内のキーワードを正規表現で抽出:
  - "予定" / "今後" / "近日" / "数週間以内" / "Q2/Q3/Q4 2026" / "upcoming" / "next week" / "expected" / "rumored"
- 抽出した文の前後の固有名詞（モデル名・企業名）を `topic` に
- 抽出元 item を `source_item_id` に格納
- 3-8 件、importance 順で絞り込み

## 失敗時の振る舞い

- 過去 7 日のうち 3 日未満しかデータが無い場合: 週次生成をスキップ、`data/_errors/weekly-YYYY-WW.json` を出力
- top_10 が 5 件未満しか集まらない場合: 5 件未満で出力（無理に埋めない）
- `keyword_cloud` 集計に失敗: 空配列で出力（致命的でない）
- 週次生成全体が失敗 → デイリー push は完了済み、`data/_errors/weekly-YYYY-WW.json` を別 commit でpush

## フロント側の表示（Phase E）

- 通常の日次ページ最下部に「今週のサマリを見る →」リンクを表示
- リンク先: `/weekly/#YYYY-WW`
- 週次ページ (`weekly/index.html`) は別 PWA エントリ
- 詳細は `assets/prompt-templates/weekly-summary.md` および `weekly/app-weekly.js` 参照

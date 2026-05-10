# 週次サマリ生成プロンプト（Step 11、Phase D 以降）

過去 7 日間の `data/<YYYY-MM-DD>.json` を統合し、`data/weekly-YYYY-WW.json` を生成する。

## 入力

- `week`: ISO 週番号（例: "2026-W19"）
- `from` / `to`: 週開始・終了日（土〜金）
- `daily_files`: 直近 7 日分の `data/<date>.json` の配列
- `prev_week_data`: 前週の `data/weekly-latest.json`（前週比 delta 計算用、無ければ null）

## プロンプト本文

```
過去 7 日間の AI Daily Digest 日次データを統合し、週次サマリを生成してください。

【入力】
{
  "week": "2026-W19",
  "from": "2026-05-04",
  "to": "2026-05-10",
  "daily_files": [
    {
      "date": "2026-05-04",
      "headline": "...",
      "summary_ja": "...",
      "top_picks": [{ "id": "...", "rank": 1, "reason": "..." }, ...],
      "categories": [
        {
          "id": "new_models",
          "items": [
            {
              "id": "2026-05-04-001",
              "title": "...",
              "title_ja": "...",
              "url": "...",
              "source": "...",
              "source_type": "official",
              "category": "new_models",
              "scores": { "importance": 5, "depth": 4, "practicality": 4, "freshness": 5, "total": 18 },
              "tags": ["claude-5", "opus", "anthropic"],
              "summary_ja": "...",
              "key_points_ja": [...]
            }
          ]
        }
      ]
    },
    // ... 7 日分
  ],
  "prev_week_data": { "keyword_cloud": [...] } | null
}

【処理】

Step 1: 統合 + 重複排除
- 全 daily_files の categories[].items[] をマージ
- URL 完全一致 / タイトル類似度 0.8 以上で同一視
- 統合された items を `all_items` とする

Step 2: top_10 選定
- 全 daily_files の top_picks[] を統合 → 最大 7 件まで取り込み (必読性高)
- 残り枠を all_items から scores.total 降順で補充
  - 同一 source は 2 件まで
  - カテゴリ多様性: new_models / research_papers / industry_business / agents から各 1 件以上
- 5-12 件で確定。各 item を { id, date, rank, reason } で参照

Step 3: papers_5 / models_3 / community_buzz_3 / japan_3 / china_3 選定
- papers_5: category in [research_papers] OR source_type == "academic" → scores.total 降順、最大 7
- models_3: category == "new_models" → importance 順、最大 5
- community_buzz_3: category == "community_buzz" OR source_type == "community" → reaction_signal あり優先、最大 5
- japan_3: category == "japan" → reaction_signal (hatena.users / qiita.likes) 優先、最大 5
- china_3: category == "china" → 最大 5 (該当なしは空配列)

Step 4: keyword_cloud 集計
- 全 all_items の tags[] を集計
- 上位 20 個まで
- prev_week_data.keyword_cloud と比較して delta_vs_prev_week を計算
  - 新規キーワード: delta = count
  - 既存キーワード: delta = today_count - prev_count

Step 5: watchlist_next_week 抽出
- 全 all_items の summary_ja / key_points_ja から以下のキーワードを正規表現で検索:
  ["予定", "今後", "近日", "数週間以内", "Q2 2026", "Q3 2026", "Q4 2026",
   "upcoming", "next week", "next month", "expected", "rumored", "公開予定"]
- 該当文の前後 60 字を抽出
- 文中の固有名詞 (モデル名 / 企業名) を topic に
- importance >= 3 の item から優先抽出
- 3-8 件、importance 順で絞り込み

Step 6: headline / summary_ja 生成
- headline: その週で最も重要だった 1-2 件のニュースを 1 文でまとめる (60-120 字)
- summary_ja: 週全体の総括を 300-500 字で
  - リード: その週のテーマ (例: "今週は OpenAI の新モデル発表と EU AI Act の最終可決が同時進行")
  - 詳細: 主要 4-6 ニュースの要点
  - 業界文脈: トレンド・前週との連続性
  - 来週への含意

【出力 JSON】
{
  "week": "2026-W19",
  "from": "2026-05-04",
  "to": "2026-05-10",
  "generated_at": "<ISO8601、JST>",
  "schema_version": "1.0",
  "headline": "<60-120 字>",
  "summary_ja": "<300-500 字>",
  "stats": {
    "total_collected_week": <int>,
    "after_dedup": <int>,
    "selected_items": <int>,
    "top_count": <int>
  },
  "top_10": [
    { "id": "2026-05-10-001", "date": "2026-05-10", "rank": 1, "reason": "...", "category": "new_models" },
    ...
  ],
  "papers_5": [{ "id": "...", "date": "..." }, ...],
  "models_3": [{ "id": "...", "date": "..." }, ...],
  "community_buzz_3": [{ "id": "...", "date": "..." }, ...],
  "japan_3": [{ "id": "...", "date": "..." }, ...],
  "china_3": [{ "id": "...", "date": "..." }, ...],
  "keyword_cloud": [
    { "keyword": "agents", "count": 18, "delta_vs_prev_week": 6 },
    ...
  ],
  "watchlist_next_week": [
    {
      "topic": "Anthropic Claude 5 series",
      "reason": "Opus 5 公開済み / Sonnet 5 が来週公開予定",
      "watch_until": "2026-05-15",
      "source_item_id": "2026-05-08-001"
    },
    ...
  ],
  "week_items_index": [
    { "id": "2026-05-10-001", "date": "2026-05-10", "category": "new_models", "source": "google_deepmind" },
    ...
  ]
}

【ルール】
- 出力は JSON のみ。前置きなし
- top_10 は 5-12 件、5 件未満なら無理に埋めない
- 各 item は id 参照のみ。本文データは複製しない
- watchlist は 3-8 件、見つからなければ空配列
- 日付は すべて YYYY-MM-DD 形式 (JST)
- summary_ja は 300 字未満なら密度不足、500 字超なら冗長
```

## エラー時のフォールバック

- 過去 7 日のうち 3 日未満しかデータが無い → 週次生成をスキップ、`data/_errors/weekly-YYYY-WW.json` を出力
- top_10 が 5 件未満 → 5 件未満で出力（無理に埋めない）
- `keyword_cloud` 集計失敗 → 空配列で出力（致命的でない）
- prev_week_data が無い → 全 keyword の delta = count として出力

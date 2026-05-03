# WebFetch 用記事抽出プロンプト

公式ブログ系の WebFetch に渡すプロンプトの雛形。

## 標準テンプレート

```
このページから直近 5 件以下の記事をリストアップしてください。
各記事について以下を JSON 形式で抽出してください:

- title (string): 記事の原題
- url (string): 絶対 URL
- published_at (string, "YYYY-MM-DD"): 公開日。記載がなければ null
- summary_en (string): 2 行以内の英語要約 (記事冒頭から抜粋ベース。冒頭が要約として機能しない場合は本文から重要な事実を抽出)
- author (string): 著者名。記載がなければ null

判定ルール:
- 直近 7 日以内に公開されたもののみを優先 (古いプレスリリースは除外)
- カテゴリは "blog post" "press release" "research" のいずれかに分類できるなら type フィールドに記載
- ナビゲーション・フッター・サイドバーは無視。本文記事のみ

出力フォーマット (JSON 配列のみ。前置きなし):
[
  {"title": "...", "url": "...", "published_at": "...", "summary_en": "...", "author": "..."}
]
```

## ベンダー別の追加指示

### Anthropic / OpenAI / DeepMind / Meta / Microsoft / Mistral / xAI / Cohere / Nvidia

標準テンプレートでそのまま OK。`research` カテゴリの記事は別配列で返してもらう。

### Hugging Face Blog

```
追加: コミュニティ投稿と公式記事を区別してください (community: true/false)。
公式記事を優先してください。
```

### arXiv API

WebFetch ではなく直接 API を叩く。Atom XML をパースする想定。
プロンプト不要（構造化データを直接処理）。

### Hacker News Algolia

WebFetch ではなく直接 API を叩く。JSON をパースする想定。
プロンプト不要。

## 失敗時の WebSearch フォールバック

WebFetch が 403 / タイムアウトの場合、以下の WebSearch クエリで代替:

```
site:<domain>/blog 2026
site:<domain>/news 2026
```

検索結果の上位 5 件を WebFetch で個別取得。

## 重要事項

- **ページ全体の要約は不要**。記事のリストだけを返してもらう
- `published_at` が取れない記事は後段の鮮度スコアで困るので、無理せず null のままにし、後で URL のパスから推定する（例: `/2026/05/03/...`）
- 抽出件数が 0 件の場合は `skipped_sources` に "no recent articles" として記録

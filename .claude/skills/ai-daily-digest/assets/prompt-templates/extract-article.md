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

### バッチ 4: 海外解説メディア（RSS 優先）

**TechCrunch / The Verge / VentureBeat / Wired / MIT Technology Review / Ars Technica / Stratechery**

```
このページは AI 関連メディアの記事一覧 (RSS feed または HTML)。直近 5 件以下の AI / 生成 AI 関連記事を抽出してください。

各記事について JSON で:
- title (string): 記事原題
- url (string): 絶対 URL
- published_at (string, "YYYY-MM-DD"): 公開日 (RSS の <pubDate> または HTML の date 属性)
- summary_en (string): 2-3 行の英語要約 (RSS の <description> または記事冒頭)
- author (string): 著者名 (任意)
- content_type (string): "news" | "analysis" | "opinion" | "press" のいずれか

判定ルール:
- AI / LLM / generative AI / agent / multimodal を主題とする記事のみ
- ベンダープレスの転載 (PR Newswire 経由など) は除外
- ペイウォール記事は title + url + summary_en のみで OK (本文取得不要)

出力フォーマット (JSON 配列のみ、前置きなし)
```

**The Information のみ特殊**: 有料記事中心のため WebSearch 経由で:

```
WebSearch クエリ: site:theinformation.com AI 2026

検索結果上位 5 件から:
- title (string): 記事タイトル
- url (string): 絶対 URL
- published_at (string): 検索結果スニペットから推定
- summary_en (string): 検索結果スニペットの 1-2 文 (本文非公開のため最低限)

本文取得は試みない。タイトル + URL + 1 行で十分なカードリンクとして提示する。
```

### バッチ 5: 学術プラットフォーム

**Papers with Code / OpenReview**: WebFetch (HTML) で標準テンプレートと同じ抽出。`citationCount` または upvote 相当のシグナルを取得できる場合は `reaction_signal` に含める。

**Latent Space / Import AI / The Batch / Sebastian Raschka (Substack RSS)**: RSS の `<content:encoded>` 全文取得可能。プロンプト:

```
このページは AI 解説 Substack の RSS feed。直近 5 件以下の記事を抽出してください。

各記事について:
- title: 原題
- url: 記事 URL
- published_at: <pubDate> から YYYY-MM-DD
- summary_en: <content:encoded> の冒頭 800-1500 字を要約 (記事の主題 + 主要論点 3 つ)
- author: <dc:creator> または <author>

判定ルール:
- 論文解説・技術レビュー・週次まとめが対象
- 完全広告記事 (sponsorship 全文) は除外
- 出力 JSON 配列のみ
```

**Semantic Scholar API**: 直接 API レスポンス JSON を処理。プロンプト不要。

```
GET https://api.semanticscholar.org/graph/v1/paper/search?query={QUERY}&fields=title,abstract,authors,year,url,citationCount,venue&limit=20&year=2026

レスポンスから:
- paperId → id
- title → title
- url → url (paper page)
- year → published_at の年部分 (月日不明なら 01-01)
- abstract → summary_en (先頭 500 字)
- citationCount → reaction_signal.citation_count
- authors[].name → author (筆頭著者)
- venue → tags の 1 つ
```

### バッチ 6: コミュニティ議論層

**Reddit RSS (`top.rss?t=day`)**: 各 subreddit の RSS を WebFetch。プロンプト:

```
このページは Reddit subreddit の Top RSS feed (1 日のトップ投稿)。直近 5-10 件を抽出してください。

各投稿について:
- title (string): 投稿タイトル (<title> から、ただし "<author> on <subreddit>: " 形式の prefix があれば除去)
- url (string): リンク投稿なら外部 URL、テキスト投稿なら Reddit スレッド URL (<link> または <feedburner:origLink>)
- external_url (string, 任意): リンク投稿の場合の元記事 URL
- published_at (string): <pubDate> から YYYY-MM-DD
- summary_en (string): <description> の冒頭 500 字 (HTML タグ除去)
- subreddit (string): "r/LocalLLaMA" など

判定ルール:
- AI / LLM / モデル発表 / 実装報告 / 議論を主題とする投稿のみ
- ミーム・画像のみ・shitpost は除外 (タイトルが煽り表現のみのものなど)
- meta-discussion (subreddit の運営話) は除外
- reaction_signal: { kind: "reddit_top", min_score: 100 } を全件に付与 (Top RSS にいる時点で閾値超え)

出力 JSON 配列のみ
```

**HN 拡張 (200pt 以上)**: 既存 HN Algolia の拡張版。`numericFilters=points>=200` を追加して直接 API を叩く。プロンプト不要、レスポンス JSON を処理。

**X 公開トレンド**: WebSearch で:

```
WebSearch クエリ: site:x.com OR site:twitter.com "Claude" OR "GPT" OR "Llama" min_replies:50

検索結果上位 5 件から:
- title: ツイート抜粋 (140 字以内)
- url: ツイート URL
- summary_en: ツイート全文 (取得できる範囲で)
- author: ツイート主のハンドル
- reaction_signal: { kind: "x_trend" }

ツイート本文はそのまま記事化せず、「言及されている外部 URL」がある場合は external_url に格納してそちらを記事候補とする。
```

**LessWrong (RSS)**: 標準テンプレートと同じ。`tags` に "ai_safety" / "alignment" を含める。

### バッチ 7: 中華圏

詳細は Phase C のセクションを参照（バッチ 7 の中文要約は `summarize-ja.md` で zh→ja 変換指示を追加）。標準テンプレートで title / url / published_at / summary_en (中文または英語) を抽出する。中文記事は `lang: "zh"` を必ず付与。

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

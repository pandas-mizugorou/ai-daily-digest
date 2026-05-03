# 巡回ソース一覧

並列実行は最大 10 並列（1 メッセージ内の WebFetch tool call の上限）。

## バッチ 1: 公式ブログ（英語・10 並列 WebFetch）

| ベンダー | URL | プロンプト | フォールバック |
|---|---|---|---|
| Anthropic | `https://www.anthropic.com/news` | "List the latest 5 articles with title, URL, publish date, and 2-line summary" | research ページ → WebSearch `site:anthropic.com 2026` |
| OpenAI | `https://openai.com/blog` | 同上 | **403 既知**：最初から WebSearch `site:openai.com/blog 2026` を使用 |
| Google DeepMind | `https://deepmind.google/discover/blog/` | 同上 | `https://blog.google/technology/ai/` |
| Meta AI | `https://ai.meta.com/blog/` | 同上 | WebSearch `site:ai.meta.com/blog 2026` |
| Microsoft AI | `https://blogs.microsoft.com/ai/` | 同上 | Azure AI ブログ `https://azure.microsoft.com/en-us/blog/topics/ai-machine-learning/` |
| Mistral | `https://mistral.ai/news/` | 同上 | WebSearch `site:mistral.ai 2026` |
| xAI | `https://x.ai/news` | 同上 | WebSearch `site:x.ai 2026` |
| Nvidia AI | `https://blogs.nvidia.com/blog/category/deep-learning/` | 同上 | WebSearch `site:blogs.nvidia.com generative AI 2026` |
| Hugging Face Blog | `https://huggingface.co/blog` | 同上 | RSS `https://huggingface.co/blog/feed.xml` |
| Cohere | `https://cohere.com/blog` | 同上 | WebSearch `site:cohere.com/blog 2026` |

**プロンプトテンプレート**は `assets/prompt-templates/extract-article.md`。

## バッチ 2: アグリゲータ・論文・リポジトリ

### Hacker News（Algolia API、5 クエリ並列）

`https://hn.algolia.com/api/v1/search?tags=front_page&numericFilters=created_at_i>{24h前のepoch},points>=50&query={QUERY}`

5 クエリ:
1. `query=AI`
2. `query=LLM`
3. `query=Claude`
4. `query=GPT`
5. `query=agent`

レスポンス JSON から `hits[].title / url / created_at / points / objectID` を抽出。

### arXiv API

```
http://export.arxiv.org/api/query?search_query=cat:cs.CL+OR+cat:cs.AI+OR+cat:cs.LG&sortBy=submittedDate&sortOrder=descending&max_results=20
```

WebFetch でレスポンス（Atom XML）を取得し、Entry の title / summary / link を抽出。論文は通常 100 件以上ヒットするため、`scoring.md` の論文判定基準（ベンチマーク・新手法・公開実装あり）でフィルタ。

### Hugging Face Trending

| URL | 用途 |
|---|---|
| `https://huggingface.co/models?sort=trending` | 直近トレンドのモデル |
| `https://huggingface.co/datasets?sort=trending` | 直近トレンドのデータセット |
| `https://huggingface.co/spaces?sort=trending` | デモ Space |

### GitHub Trending

```
https://github.com/trending?since=daily
```

WebFetch で取得し、リポジトリ名・説明・スター数を抽出。`topic:llm topic:ai` キーワードでフィルタ。

## バッチ 3: 補助・日本語ソース

### Reddit

```
https://www.reddit.com/r/MachineLearning/top.json?t=day&limit=10
https://www.reddit.com/r/LocalLLaMA/top.json?t=day&limit=10
```

User-Agent ヘッダーが必要（Reddit は anonymous bot をブロックするため `User-Agent: ai-daily-digest/1.0` のような明示が望ましい）。WebFetch がカスタムヘッダーを送れない場合は、本文 HTML からの抽出にフォールバック。

### Qiita タグ API（無認証）

```
https://qiita.com/api/v2/tags/生成AI/items?per_page=10
https://qiita.com/api/v2/tags/LLM/items?per_page=5
```

レスポンス JSON から `title / url / created_at / user.id` を抽出。

### Zenn

```
https://zenn.dev/topics/ai
https://zenn.dev/topics/生成ai
```

HTML から記事一覧を抽出。

### ITmedia AI+

```
https://www.itmedia.co.jp/aiplus/
```

トップページから新着記事を抽出。

## 並列実行ルール

- **1 メッセージ内で最大 10 並列 WebFetch**
- バッチ 1 → 待機 → バッチ 2 → 待機 → バッチ 3 の順
- 各バッチ間でレート制限を踏まないため、必要なら 1-2 秒の待機
- WebSearch は WebFetch より低速だが並列可

## レート制限の目安

- WebFetch: 1 routine 実行で 25 回程度（公式ブログ 10 + Reddit 2 + HF 3 + GitHub 1 + Zenn 2 + ITmedia 1 + 予備）
- WebSearch: 1 routine 実行で 5-8 回程度（フォールバック用）
- Algolia / Qiita / arXiv API は外部 API なので WebFetch でも軽い

## 既知の問題

| ソース | 症状 | 対策 |
|---|---|---|
| OpenAI | WebFetch 403 | WebSearch `site:openai.com` で代替（`/x-topic-radar` で実証済み） |
| Reddit | anonymous で API 403 | `old.reddit.com/r/<sub>/top/?t=day` の HTML を WebFetch |
| Hugging Face Spaces | JS で動的描画 | RSS や API がない場合は最初の HTML スナップショットから抽出 |
| arXiv | 量が多すぎる | `scoring.md` の論文除外基準を厳格に |

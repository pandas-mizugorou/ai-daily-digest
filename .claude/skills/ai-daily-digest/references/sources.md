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

## バッチ 3-A: 日本企業テックブログ（並列 8 WebFetch）

日本のAI実装最前線。投稿頻度は週〜月ペースだが、技術深度が高く実装ノウハウが詰まっている。

| ソース | URL | プロンプト | フォールバック |
|---|---|---|---|
| Preferred Networks Tech Blog | `https://tech.preferred.jp/ja/blog/` | "List the latest 5 AI/ML/LLM-related articles with title, URL, publish date, and 2-line summary in Japanese" | RSS `/feed/` → WebSearch |
| ELYZA (note) | `https://note.com/elyza/` | 同上 | WebSearch `site:note.com/elyza` |
| Sakana AI Blog | `https://sakana.ai/blog/` | 同上 | 英語版 `https://sakana.ai/blog/` も可 |
| LINEヤフー Tech Blog | `https://techblog.lycorp.co.jp/ja` | "AI/LLM タグの最新 5 記事を抽出" | RSS `https://techblog.lycorp.co.jp/ja/feed/index.xml` |
| CyberAgent AI Lab | `https://cyberagent.ai/blog/` | 同上 | WebSearch `site:cyberagent.ai/blog AI` |
| Stockmark Tech Blog | `https://tech.stockmark.co.jp/blog/` | 同上 | RSS |
| メルカリ engineering (AI tag) | `https://engineering.mercari.com/blog/tags/ai/` | 同上 | WebSearch `site:engineering.mercari.com AI` |
| Sansan Builders Box | `https://buildersbox.corp-sansan.com/archive/category/AI` | 同上 | RSS |

**選定基準**: タイトルや抽出文に「LLM」「生成AI」「Agent」「RAG」「Claude」「GPT」「Anthropic」「OpenAI」「fine-tuning」「ベクトル検索」「マルチモーダル」のキーワードがあるものを優先。

## バッチ 3-B: 日本語コミュニティ・反響軸（並列 6-8）

### はてなブックマーク（**反響軸の主役**）

```
https://b.hatena.ne.jp/search/text?q=%E7%94%9F%E6%88%90AI&users=20&sort=recent&safe=on
https://b.hatena.ne.jp/search/text?q=LLM&users=20&sort=recent&safe=on
https://b.hatena.ne.jp/search/text?q=Claude&users=10&sort=recent&safe=on
https://b.hatena.ne.jp/hotentry/it.rss
```

WebFetch で HTML / RSS を取得し、各エントリから `title / url / users（ブクマ数）/ date` を抽出。

**重要**: ここで取得した `users`（ブクマ数）は `scoring.md` の **はてブブースト**でスコアに加算される。

| クエリ | 閾値 | 用途 |
|---|---|---|
| `生成AI` | users≥20 | 日本コミュニティで反響のある AI 記事 |
| `LLM` | users≥20 | LLM 系の実装・解説記事 |
| `Claude` | users≥10 | Claude 関連の実装ノウハウ（ニッチ寄りのため閾値低め） |
| `hotentry/it.rss` | users≥30 (RSS自動) | IT 全体のホットエントリから AI 系をフィルタ |

### Qiita 拡張タグ API（並列、無認証）

```
https://qiita.com/api/v2/tags/生成AI/items?per_page=10
https://qiita.com/api/v2/tags/LLM/items?per_page=10
https://qiita.com/api/v2/tags/Claude/items?per_page=10
https://qiita.com/api/v2/tags/OpenAI/items?per_page=5
https://qiita.com/api/v2/tags/Anthropic/items?per_page=5
https://qiita.com/api/v2/tags/Agent/items?per_page=5
https://qiita.com/api/v2/tags/RAG/items?per_page=5
https://qiita.com/api/v2/tags/MCP/items?per_page=5
```

レスポンス JSON から `title / url / created_at / user.id / likes_count / stocks_count` を抽出。`likes_count + stocks_count` を「反響」シグナルとして利用（≥20 で +1、≥50 で +2 加点）。

### Zenn 拡張トピック

```
https://zenn.dev/topics/ai
https://zenn.dev/topics/生成ai
https://zenn.dev/topics/llm
https://zenn.dev/topics/claude
https://zenn.dev/topics/openai
https://zenn.dev/topics/agent
```

HTML から記事一覧を抽出。各記事の `liked_count` を反響シグナルとして利用。

### ITmedia AI+

```
https://www.itmedia.co.jp/aiplus/
```

トップページから新着記事を抽出（メディア記事として残置）。

## 並列実行ルール

- **1 メッセージ内で最大 10 並列 WebFetch**
- 推奨実行順: バッチ 1（公式 10）→ バッチ 2（HN/arXiv/HF/GH 8-10）→ バッチ 3-A（日本企業 8）→ バッチ 3-B（コミュニティ 6-8）
- 各バッチ間でレート制限を踏まないため、必要なら 1-2 秒の待機
- WebSearch は WebFetch より低速だが並列可

## レート制限の目安（拡充後）

- WebFetch: 1 routine 実行で 35-45 回程度（公式 10 + HN 5 + HF 3 + GitHub 1 + arXiv 1 + 日本企業 8 + はてブ 4 + Qiita 8 + Zenn 6 + ITmedia 1）
- WebSearch: 1 routine 実行で 5-8 回程度（フォールバック用）
- Algolia / Qiita / arXiv API は外部 API なので WebFetch でも軽い

## 既知の問題

| ソース | 症状 | 対策 |
|---|---|---|
| OpenAI | WebFetch 403 | WebSearch `site:openai.com` で代替（`/x-topic-radar` で実証済み） |
| Reddit | anonymous で API 403 | バッチ 3 から削除（不安定なため）。必要時のみ `old.reddit.com/r/<sub>/top/?t=day` HTML を WebFetch |
| Hugging Face Spaces | JS で動的描画 | RSS や API がない場合は最初の HTML スナップショットから抽出 |
| arXiv | 量が多すぎる | `scoring.md` の論文除外基準を厳格に |
| 企業テックブログ | 投稿頻度が低い (週〜月) | 7 日以内の記事を許容（freshness 1 でも採用候補） |
| はてブ検索 | 動的読み込み | RSS フィード `?mode=rss` を優先、HTML はフォールバック |

# 巡回ソース一覧

並列実行は最大 10 並列（1 メッセージ内の WebFetch tool call の上限）。バッチ単位で独立メッセージで投げ、間に 1-2 秒の待機を入れてレート制限を回避する。

## ソース別動的時間窓（time_window_hours）

各ソースには `time_window_hours` が付与されている。Step 5 のフィルタで時間窓外を `_excluded: outside_time_window` で除外する。詳細は `references/scoring.md` の「freshness（鮮度）」章を参照。

| ソースタイプ | 時間窓 |
|---|---|
| 公式・速報・GitHub Trending・TechCrunch 系 | 24h |
| HN / Wired / VentureBeat 拡張 / MIT Tech Review / 日本コミュニティ / Reddit / X | 48h |
| arXiv / HF Models / 日本企業ブログ / Stratechery / 学術プラットフォーム / 中華圏 | 168h (7d) |
| OpenReview / Sebastian Raschka | 336h (14d) |

## バッチ 1: 公式ブログ（英語・10 並列 WebFetch、source_type: official、time_window_hours: 24）

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

## バッチ 2: アグリゲータ・論文・リポジトリ（source_type: aggregator/academic）

### Hacker News（Algolia API、5 クエリ並列、source_type: aggregator、time_window_hours: 48）

`https://hn.algolia.com/api/v1/search?tags=front_page&numericFilters=created_at_i>{24h前のepoch},points>=50&query={QUERY}`

5 クエリ:
1. `query=AI`
2. `query=LLM`
3. `query=Claude`
4. `query=GPT`
5. `query=agent`

レスポンス JSON から `hits[].title / url / created_at / points / objectID` を抽出。

### arXiv API（source_type: academic、time_window_hours: 168）

```
http://export.arxiv.org/api/query?search_query=cat:cs.CL+OR+cat:cs.AI+OR+cat:cs.LG&sortBy=submittedDate&sortOrder=descending&max_results=20
```

WebFetch でレスポンス（Atom XML）を取得し、Entry の title / summary / link を抽出。論文は通常 100 件以上ヒットするため、`scoring.md` の論文判定基準（ベンチマーク・新手法・公開実装あり）でフィルタ。

### Hugging Face Trending（source_type: aggregator、time_window_hours: 168）

| URL | 用途 |
|---|---|
| `https://huggingface.co/models?sort=trending` | 直近トレンドのモデル |
| `https://huggingface.co/datasets?sort=trending` | 直近トレンドのデータセット |
| `https://huggingface.co/spaces?sort=trending` | デモ Space |

### GitHub Trending（source_type: aggregator、time_window_hours: 24）

```
https://github.com/trending?since=daily
```

WebFetch で取得し、リポジトリ名・説明・スター数を抽出。`topic:llm topic:ai` キーワードでフィルタ。

## バッチ 3-A: 日本企業テックブログ（並列 8 WebFetch、source_type: japan_corp、time_window_hours: 168）

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

## バッチ 3-B: 日本語コミュニティ・反響軸（並列 6-8、source_type: japan_community、time_window_hours: 48）

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

## バッチ 4: 海外解説メディア（並列 8 WebFetch、source_type: media、time_window_hours: ソース別）

公式ブログだけでは拾えない業界文脈・規制・買収・戦略解説を補完する。RSS を第一手段、HTML パースをフォールバック。同一トピックで公式ブログと重複したら公式優先。

| ソース | URL | フェッチ方式 | 時間窓 | カテゴリ寄り | 優先度 |
|---|---|---|---|---|---|
| TechCrunch AI | `https://techcrunch.com/category/artificial-intelligence/feed/` (RSS) → HTML `https://techcrunch.com/category/artificial-intelligence/` | RSS / WebFetch | 24h | industry_business / new_models | 高 |
| The Verge AI | `https://www.theverge.com/rss/ai-artificial-intelligence/index.xml` (RSS) → HTML `https://www.theverge.com/ai-artificial-intelligence` | RSS / WebFetch | 24h | industry_business / regulation_policy | 高 |
| VentureBeat AI | `https://venturebeat.com/category/ai/feed/` (RSS) → HTML `https://venturebeat.com/category/ai/` | RSS / WebFetch | 24h | industry_business / new_models | 高 |
| Wired AI | `https://www.wired.com/feed/tag/ai/latest/rss` (RSS) → HTML `https://www.wired.com/tag/artificial-intelligence/` | RSS / WebFetch | 48h | industry_business / regulation_policy | 中 |
| The Information (公開記事のみ) | WebSearch `site:theinformation.com AI 2026` | WebSearch | 48h | industry_business | 中（有料記事のため本文は取らずタイトル + URL のみカード化）|
| Stratechery (Free posts) | `https://stratechery.com/feed/` (RSS) → HTML `https://stratechery.com/category/articles/` | RSS / WebFetch | 168h | industry_business | 低（週 1-2 本ペースの長文論考。`<content:encoded>` 全文取得可） |
| MIT Technology Review AI | `https://www.technologyreview.com/topic/artificial-intelligence/feed` (RSS) → HTML `https://www.technologyreview.com/topic/artificial-intelligence/` | RSS / WebFetch | 48h | research_papers / industry_business | 中 |
| Ars Technica AI | `https://feeds.arstechnica.com/arstechnica/ai` (RSS) → HTML `https://arstechnica.com/ai/` | RSS / WebFetch | 24h | industry_business / community_buzz | 中 |

**設計判断**:
- The Information は有料記事中心。WebSearch でタイトル + 1 行スニペットのみ拾い、本文は取らずカードリンクのみ提示する
- Stratechery は週 1-2 本の長文論考。RSS から `<content:encoded>` 全文を取得できるため WebFetch 1 発で深い要約が作れる
- Wired と The Verge は内容が重なりやすい → タイトル類似度 0.5 で同一視して重複排除を強化
- TechCrunch / VentureBeat は速報性重視で 24h 窓、Wired / MIT Tech Review は深掘り解説重視で 48h 窓

## バッチ 5: 学術プラットフォーム（並列 8、source_type: academic、time_window_hours: 168）

論文の元情報 (arXiv) は既存バッチ 2 で取れているが、それを「他者がどう評価したか」「実装解説が公開されているか」を捕捉するレイヤーを追加する。

| ソース | URL | フェッチ方式 | 時間窓 | カテゴリ寄り | 優先度 |
|---|---|---|---|---|---|
| Papers with Code Trending | `https://paperswithcode.com/` | WebFetch (HTML) | 168h | research_papers | 高 |
| Papers with Code SoTA Updates | `https://paperswithcode.com/sota` | WebFetch (HTML) | 168h | research_papers | 中 |
| Semantic Scholar Search API | `https://api.semanticscholar.org/graph/v1/paper/search?query={QUERY}&fields=title,abstract,authors,year,url,citationCount&limit=20&year=2026` | API (JSON) | 168h | research_papers | 高 |
| OpenReview Forum | `https://openreview.net/group?id=NeurIPS.cc/2026` (年次更新) | WebFetch (HTML) | 336h | research_papers | 中 |
| Latent Space (Substack) | `https://www.latent.space/feed` (RSS) → HTML `https://www.latent.space/` | RSS | 168h | research_papers / agents | 高（Swyx 解説の質が高い）|
| Import AI (Jack Clark) | `https://importai.substack.com/feed` (RSS) | RSS | 168h | research_papers / regulation_policy | 高 |
| The Batch (Andrew Ng / DeepLearning.AI) | `https://www.deeplearning.ai/the-batch/feed/` (RSS) → HTML `https://www.deeplearning.ai/the-batch/` | RSS / WebFetch | 168h | research_papers / industry_business | 中 |
| Sebastian Raschka Magazine | `https://magazine.sebastianraschka.com/feed` (RSS) | RSS | 336h | research_papers | 中 |

**Semantic Scholar API クエリ（4 並列）**:
1. `query=large+language+model`
2. `query=AI+agent`
3. `query=retrieval+augmented+generation`
4. `query=multimodal+model`

レスポンスから `paperId / title / abstract / authors / year / url / citationCount / venue` を抽出。`citationCount` を `reaction_signal` として活用（kind: "semantic_scholar", citation_count: N）。**100 req/5min** の rate limit があるため並列度は 4、5 分以上空けて再実行。

**設計判断**:
- OpenReview は API があるが公開エンドポイントが頻繁に変わるため、フォーラム HTML を WebFetch して Title 抽出が安定。査読中論文 (`status=under_review`) は除外
- Latent Space / Import AI / The Batch は Substack RSS が安定。`<content:encoded>` 全文取得可能なため、週次サマリの「論文 5 本」採用元として最適
- Sebastian Raschka は毎月 1-2 本だが論文解説の品質が高く、`research_papers` の保険ソースとして残置

## バッチ 6: コミュニティ議論層（並列 8、source_type: community、time_window_hours: 48）

論文や速報の前後で、エンジニアコミュニティで実際に議論されているトピック・実装報告を拾う。Reddit Top RSS は **無認証で 401 にならない**（`top.rss?t=day`）。

| ソース | URL | フェッチ方式 | 時間窓 | カテゴリ寄り | 優先度 |
|---|---|---|---|---|---|
| Reddit r/LocalLLaMA Top | `https://www.reddit.com/r/LocalLLaMA/top.rss?t=day` | RSS | 48h | community_buzz / new_models | 高 |
| Reddit r/MachineLearning Top | `https://www.reddit.com/r/MachineLearning/top.rss?t=day` | RSS | 48h | community_buzz / research_papers | 高 |
| Reddit r/singularity Top | `https://www.reddit.com/r/singularity/top.rss?t=day` | RSS | 48h | community_buzz | 中 |
| Reddit r/ClaudeAI Top | `https://www.reddit.com/r/ClaudeAI/top.rss?t=day` | RSS | 48h | community_buzz / tools_apps | 中 |
| Reddit r/OpenAI Top | `https://www.reddit.com/r/OpenAI/top.rss?t=day` | RSS | 48h | community_buzz / new_models | 中 |
| HN 拡張 (200pt 以上の議論記事) | `https://hn.algolia.com/api/v1/search?tags=story&numericFilters=created_at_i>{48h前のepoch},points>=200` | API | 48h | community_buzz | 高（既存 HN ロジック流用）|
| X 公開トレンド | WebSearch `site:x.com OR site:twitter.com "Claude" OR "GPT" OR "Llama" min_replies:50` | WebSearch | 48h | community_buzz | 中 |
| LessWrong AI tag | `https://www.lesswrong.com/feed.xml?view=top-posts&postsLimit=10` (RSS) → HTML `https://www.lesswrong.com/tag/ai` | RSS / WebFetch | 168h | research_papers / regulation_policy | 低 |

**Reddit RSS の正規化**:
Reddit RSS の `<title>` は `<author> on <subreddit>` 形式ではなく、ほぼ「投稿タイトル」がそのまま入る（`top.rss?t=day` の場合）。`<link>` から記事元 URL を抽出（投稿が記事リンクなら外部 URL、テキスト投稿なら Reddit スレッド URL）。`<description>` から投稿本文プレビューを取得。

**設計判断**:
- Reddit RSS は upvote 数を直接含まないため、「Top RSS にいる時点で閾値クリア済み」と見なし `kind: "reddit_top", min_score: 100` として扱う
- HN 拡張は既存バッチ 2 の HN Algolia と棲み分け: バッチ 2 は AI/LLM/Claude/GPT/agent 5 クエリで広く拾い、バッチ 6 は **points>=200 のみ**で議論深い投稿を厳選
- X 公開トレンドは API 廃止以後、WebSearch で `site:x.com` を叩くのが現実解。Tweet そのものは記事化せず「言及のあった URL を拾う」用途に限定
- LessWrong は AI safety 論考が多く、`community_buzz` ではなく `research_papers / regulation_policy` 寄りに拾うことが多い。スコアリングで自動判定

## バッチ 7: 中華圏（並列 5-6、source_type: china、time_window_hours: 168）

中国の AI 企業・研究機関・政策・コミュニティの最新動向を補捉する。海外 IP からも基本アクセス可能（CloudFlare 越しでも通常応答）。**英語版が用意されているソース（機器之心 → Synced、ChinAI Newsletter）を第一候補**にし、本家中文版は WebFetch 補強で対応する。

| ソース | URL | フェッチ方式 | 時間窓 | 言語 | カテゴリ寄り | 優先度 |
|---|---|---|---|---|---|---|
| 36Kr AI | `https://36kr.com/information/AI/` | WebFetch (HTML) | 168h | zh | china / industry_business | 高 |
| 量子位 (QbitAI) | `https://www.qbitai.com/feed` (RSS、存在確認) → HTML `https://www.qbitai.com/` | RSS / WebFetch | 168h | zh | china / new_models | 高 |
| 機器之心 (Synced 英語版) | `https://syncedreview.com/feed/` (RSS、英語) | RSS | 168h | en | china / research_papers | 高 |
| 機器之心 (本家中文) | `https://www.jiqizhixin.com/` | WebFetch (HTML) | 168h | zh | china / research_papers | 中（Synced 失敗時のみ） |
| ChinAI Newsletter (Jeff Ding) | `https://chinai.substack.com/feed` (RSS) | RSS | 168h | en | china / regulation_policy | 中（中国 AI 政策・産業動向の英語要約） |
| HF daily-papers (中華系著者抽出) | `https://huggingface.co/papers` | WebFetch (HTML) | 168h | en | research_papers / china | 中 |
| Zhihu (知乎) AI トピック | WebSearch `site:zhihu.com 大模型 OR LLM 2026` | WebSearch | 168h | zh | china | 低（API なし、log-in 必須なため） |

**設計判断**:
- **量子位 RSS の存在確認**: 過去存在実績はあるが断続的に消える。RSS 404 の場合は `https://www.qbitai.com/` のトップページを WebFetch して HTML から記事リスト抽出するフォールバック
- **機器之心は Synced (英語) 優先**: 英語版なら Step 8 の翻訳負荷が下がる。Synced で取れなかった記事のみ本家中文版を補強
- **ChinAI Newsletter** は Substack 配信で英語、月 1-2 本ペース。中国 AI 政策・産業動向の英語要約として最良の入り口
- **HF daily-papers** は中華系研究者の論文が多く混じる。著者所属 (affiliation) に "Tsinghua" / "Peking" / "Shanghai AI Lab" / "DeepSeek" / "Alibaba" / "Baidu" / "Tencent" / "ByteDance" / "Zhipu" / "Moonshot" 等が含まれる論文を `china` カテゴリ寄りに抽出
- **Zhihu** は WebSearch 経由でタイトル + URL のみ拾う（API なし・log-in 必須なため本文取得困難）
- 中国国営メディア (CCTV / 人民日報) の AI 記事は政治的バイアスが強いため除外

**中文記事の取り扱い (lang: "zh")**:
- 中間スキーマで `lang: "zh"` を必ず付与
- raw_excerpt は中文のまま保持（Step 8 で日本語化）
- title は中文タイトルのまま、Step 8 で `title_ja` を意訳生成
- 固有名詞・モデル名は英語表記を保持（Qwen / DeepSeek / Kimi / Baichuan / Zhipu / 01.AI 等）
- 中文の人名・機関名は中文のまま（例: 阿里巴巴 / 北京大学）

## 並列実行ルール

- **1 メッセージ内で最大 10 並列 WebFetch**
- 推奨実行順: バッチ 1（公式 10）→ バッチ 2（HN/arXiv/HF/GH 8-10）→ バッチ 3-A（日本企業 8）→ バッチ 3-B（日本コミュニティ 6-8）→ **バッチ 4（海外解説 8）→ バッチ 5（学術 8）→ バッチ 6（コミュニティ 8）→ バッチ 7（中華圏 5-6）**
- 各バッチ間でレート制限を踏まないため、必要なら 1-2 秒の待機
- WebSearch は WebFetch より低速だが並列可
- **routine 環境では `timeout-minutes: 45-60` 推奨**（バッチ 1-7 の合計実行時間 12-20 分を見込む）

## レート制限の目安（Phase B-C 完了後）

- WebFetch: 1 routine 実行で **60-80 回程度**（公式 10 + HN 5 + HF 3 + GitHub 1 + arXiv 1 + 日本企業 8 + はてブ 4 + Qiita 8 + Zenn 6 + ITmedia 1 + 海外解説 8 + 学術 8 + Reddit/HN/X 8 + LessWrong 1 + 中華圏 5-6）
- WebSearch: 1 routine 実行で **8-12 回程度**（フォールバック + The Information / X 公開トレンド / 中華圏フォールバック）
- API: HN Algolia / Qiita / arXiv / Semantic Scholar は外部 API なので WebFetch でも軽い
- Semantic Scholar API: **100 req/5min** rate limit、4 並列クエリに留める

## 既知の問題

| ソース | 症状 | 対策 |
|---|---|---|
| OpenAI | WebFetch 403 | WebSearch `site:openai.com` で代替（`/x-topic-radar` で実証済み） |
| Reddit (旧) | anonymous で API 403 | **`top.rss?t=day` 形式の RSS は無認証で動作**（バッチ 6 で正式採用） |
| Hugging Face Spaces | JS で動的描画 | RSS や API がない場合は最初の HTML スナップショットから抽出 |
| arXiv | 量が多すぎる | `scoring.md` の論文除外基準を厳格に |
| 企業テックブログ | 投稿頻度が低い (週〜月) | 7 日以内の記事を許容（freshness 1 でも採用候補） |
| はてブ検索 | 動的読み込み | RSS フィード `?mode=rss` を優先、HTML はフォールバック |
| The Information | 有料記事中心 | WebSearch でタイトル + 1 行のみ拾い本文取得は省略 |
| Stratechery | Free 記事は限定的 | 週次サマリ素材として時間窓 168h で運用 |
| Semantic Scholar | rate limit 100req/5min | クエリ並列度を 4 に絞り 5 分以上空ける |
| Reddit RSS | upvote 数取得不可 | 「Top RSS にいる時点で閾値クリア」と見なし min_score: 100 を仮定 |
| X 公開トレンド | API 廃止 | WebSearch `site:x.com` でタイトル + 元 URL を拾う |
| 量子位 RSS | 断続的に 404 | HTML トップページの WebFetch にフォールバック |
| 機器之心 中文版 | CloudFlare ブロック可能性 | Synced (英語版) を第一候補、本家は補強のみ |
| Zhihu | API なし / log-in 必須 | WebSearch 経由でタイトル + URL のみ |
| 36Kr / 量子位 中文 | 中文記事 | lang: "zh" で取得し Step 8 で日本語化 |

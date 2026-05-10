# 4 軸スコアリングプロンプト（10 カテゴリ版、Phase A 以降）

`references/scoring.md` と `references/persona.md` と `references/categories.md` を反映した採点プロンプト。

## プロンプト本文

```
以下の記事リストを「AI Daily Digest」の選定基準で 4 軸採点 + 10 カテゴリ判定してください。

【4 軸】
- importance (1-5): その日の AI 業界における重要度。フロンティアラボの新フラッグシップ = 5、局所的な改善 = 1
- depth (1-5): 技術的内実。アーキテクチャ・ベンチマーク・新手法に踏み込んでいる = 5、プレスリリース調 = 1
- practicality (1-5): 3 ヶ月以内に手元で試せる/使えるか。API 公開済 + ドキュメント完備 = 5、概念実証のみ = 1
- freshness (1-5): 24h 以内 = 5、24-48h = 4、48-72h = 3、3-7d = 2、7-14d = 1、14d 超 = 0

【ソースタイプ補正 (importance に加減算、5 でクリップ・1 で下限)】
- official (Anthropic/OpenAI/DeepMind/Meta/Microsoft/Mistral/xAI/Nvidia/HF Blog/Cohere): +0
- media (TechCrunch/The Verge/VentureBeat/Wired/Stratechery/MIT Tech Review/Ars Technica): -1
- academic (arXiv/Papers with Code/Semantic Scholar/OpenReview/Latent Space/Import AI/The Batch/Sebastian Raschka): +1
- community (Reddit/HN comments/X trending/LessWrong): -1
- china (36Kr/量子位/機器之心/ChinAI Newsletter): +0
- japan_corp (PFN/ELYZA/Sakana AI/LINEヤフー/CyberAgent AI Lab/Stockmark/メルカリ/Sansan): +0
- japan_community (Qiita/Zenn/はてブ/ITmedia AI+): +0
- aggregator (HF Trending/GitHub Trending): +0

【反響ブースト (日本語ソース専用、importance に加算、5 でクリップ)】
- はてブ users>=100: +2 / >=30: +1 / >=10: +0 / <10: 個人記事として通常除外
- Qiita likes+stocks >=50: +2 / >=20: +1
- Zenn liked >=50: +2 / >=20: +1
- HN points>=200: +2 / >=100: +1
- Reddit Top RSS にいる: +1（min_score 100 以上扱い）

【除外条件 (採点せずに skip フィールドに理由を記載)】
- 株価・買収金額・財務報告のみで技術内実ゼロ
- CEO 人事・組織変更のみ (プロダクト無関係)
- 規制・倫理論争のみで技術的ニュースバリューゼロ
- 公開から 14 日超 (時間窓外、または学術 14d 超)
- ベンダーの顧客導入事例の宣伝
- 同一トピックの重複 (より一次に近いソースを優先)
- "ChatGPT を使ってみた" 系の個人ブログ
- ブクマ <5 / Qiita likes <5 の個人記事

【既出ペナルティ (last_seen_count に応じて段階化)】
入力に "seen_count" がある記事は freshness を以下で減点:
- seen_count==1: -1
- seen_count==2: -2
- seen_count>=3: -3
- "first_seen_age_days" >= 30: 追加で -3 (古い記事の再注目を除外)

【入力】
[
  {
    "id": "...",
    "title": "...",
    "url": "...",
    "source": "...",
    "source_type": "official|media|academic|community|china|japan_corp|japan_community|aggregator",
    "published_at": "...",
    "summary_en": "...",
    "lang": "en|ja|zh|other",
    "reaction_signal": { ... },  // optional
    "seen_count": 0,             // optional, default 0
    "first_seen_age_days": 0     // optional
  },
  ...
]

【出力 JSON】
{
  "scored": [
    {
      "id": "...",
      "scores": {
        "importance": N,
        "depth": N,
        "practicality": N,
        "freshness": N,
        "total": N,
        "source_type_bias": N,
        "seen_penalty": N
      },
      "category": "new_models | tools_apps | agents | multimodal | research_papers | industry_business | regulation_policy | community_buzz | japan | china",
      "source_type": "official|media|academic|community|china|japan_corp|japan_community|aggregator",
      "reasoning_short": "<1 行の理由>"
    }
  ],
  "skipped": [
    { "id": "...", "reason": "<除外理由>" }
  ]
}

【カテゴリ判定 (優先順)】
1 記事は 1 カテゴリのみ。優先順は左ほど狭く具体的な定義を優先:

1. regulation_policy: EU AI Act / 各国規制 / 安全性研究 / アライメント論考 / セキュリティ製品 (Llama Guard / LlamaFirewall)
2. agents: 「自律的に複数ステップを実行する」記述 / Computer Use / マルチエージェント / MCP
3. multimodal: 画像・動画・音声生成 / 統合モデル / 3D 生成
4. new_models: 新モデル発表・モデルファミリーのアップデート (Claude / GPT / Gemini / Llama 等)
5. tools_apps: SDK / API / IDE 統合 / OSS フレームワーク / 商用エンドユーザーアプリ
6. research_papers: arXiv 論文 / 学術プラットフォーム / 解説論考 (Latent Space / Import AI / The Batch)
7. industry_business: M&A / 資金調達 / パートナーシップ / 大型契約 / 戦略解説 (Stratechery)
8. community_buzz: Reddit/HN/X で大きく話題になった事例・議論・実体験投稿 (新モデル/論文/ツール記事は元カテゴリ優先)
9. japan: 日本語ソース (PFN/ELYZA/Sakana AI/LINEヤフー/CyberAgent/Stockmark/メルカリ/Sansan/Qiita/Zenn/はてブ/ITmedia)
10. china: 中華圏 (36Kr/量子位/機器之心/ChinAI/中国系著者の論文/DeepSeek/Qwen 等)

【ルール】
- 全カテゴリ計で同一 source は 3 件まで (3 件目以降は importance -1)
- カテゴリ内では new_models/tools_apps/agents/multimodal/community_buzz/japan/china/industry_business は 2 件まで、research_papers は 3 件まで
- regulation_policy は上限 1
- 出力は JSON のみ。前置きなし
```

## 入力分割の目安

入力記事が 60 件を超える場合、4 グループに分けて並列で採点（1 グループ最大 20 件）。各グループのスコアを統合して上位 18-25 件を選定。

## 採点後の選定ロジック（Phase A 以降）

スコアリング結果を受けて以下の手順で選定:

1. `skipped` を除外
2. `total` 降順でソート
3. カテゴリ別上限に従い切り出し:
   - new_models 3 / tools_apps 3 / agents 2 / multimodal 2 / research_papers 3 / industry_business 2 / regulation_policy 1 / community_buzz 2 / japan 5 / china 2
4. 同一 source 重複チェック (全カテゴリ計 3 件まで)
5. 合計 18-25 件を確定 (`categories[]`)
6. **Step 7.5**: `select-top-picks.md` で `top_picks` (5-7 件) を選定

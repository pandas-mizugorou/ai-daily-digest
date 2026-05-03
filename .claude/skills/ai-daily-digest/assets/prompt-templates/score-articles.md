# 4 軸スコアリングプロンプト

`references/scoring.md` と `references/persona.md` を反映した採点プロンプト。

## プロンプト本文

```
以下の記事リストを「AI Daily Digest」の選定基準で 4 軸採点してください。

【4 軸】
- importance (1-5): その日の AI 業界における重要度。フロンティアラボの新フラッグシップ = 5、局所的な改善 = 1
- depth (1-5): 技術的内実。アーキテクチャ・ベンチマーク・新手法に踏み込んでいる = 5、プレスリリース調 = 1
- practicality (1-5): 3 ヶ月以内に手元で試せる/使えるか。API 公開済 + ドキュメント完備 = 5、概念実証のみ = 1
- freshness (1-5): 24h 以内 = 5、24-48h = 4、48-72h = 3、3-7d = 2、7d 超 = 1

【除外条件 (採点せずに skip フィールドに理由を記載)】
- 株価・買収金額・財務報告のみで技術内実ゼロ
- CEO 人事・組織変更のみ (プロダクト無関係)
- 規制・倫理論争のみ
- 公開から 7 日超
- ベンダーの顧客導入事例の宣伝
- 同一トピックの重複 (より一次に近いソースを優先)
- "ChatGPT を使ってみた" 系の個人ブログ

【既出ペナルティ】
入力に "seen": true のフラグがある記事は、上記の freshness を -2 する。

【入力】
[
  { "id": "...", "title": "...", "url": "...", "source": "...", "published_at": "...", "summary_en": "...", "seen": false },
  ...
]

【出力 JSON】
{
  "scored": [
    {
      "id": "...",
      "scores": { "importance": N, "depth": N, "practicality": N, "freshness": N, "total": N },
      "category": "new_models" | "tools" | "research" | "industry" | "japan",
      "reasoning_short": "<1 行の理由>"
    }
  ],
  "skipped": [
    { "id": "...", "reason": "<除外理由>" }
  ]
}

【カテゴリ判定】
- new_models: 新モデル発表・モデルファミリーのアップデート (Claude / GPT / Gemini / Llama 等)
- tools: SDK / API / IDE 統合 / OSS フレームワーク
- research: arXiv 論文・公式 research blog
- industry: ベンダー戦略・規格・主要ニュースメディア
- japan: 日本語ソース (Qiita / Zenn / ITmedia)

【ルール】
- 同一 source からは 2 件以上選ばない (3 件目以降は importance -1)
- 出力は JSON のみ。前置きなし
```

## 入力分割の目安

入力記事が 30 件を超える場合、3 グループに分けて並列で採点（1 グループ最大 15 件）。各グループのスコアを統合して上位 5-7 件を選定。

## 採点後の選定ロジック

スコアリング結果を受けて以下の手順で選定:

1. `skipped` を除外
2. `total` 降順でソート
3. カテゴリ別の上限（new_models 2 / tools 2 / research 2 / industry 1 / japan 1）に従い切り出し
4. 同一 source 重複チェック
5. 英語比率 70% を確保（japan を最大 1 件に絞る）
6. 最終 5-7 件を確定

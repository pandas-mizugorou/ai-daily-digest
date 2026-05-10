# Top Picks 選定プロンプト（Step 7.5、Phase A 以降）

Step 7 で選定した 18-25 件から「今日の必読 Top 5-7」を抽出する。スコア順だけでは新モデル発表 5 連発で埋まる日が出るため、**スコア + 多様性 + 必読フラグ**のハイブリッドで選定する。

## アルゴリズム概要

```
1. 必読フラグ自動付与:
   - importance>=4 AND (depth+practicality)>=7、または
   - 公式ソース AND importance>=4、または
   - 強い反響シグナル（はてブ>=100 / HN>=500pt / Reddit Top>=300）
2. 必読フラグ付き全件を最大 4 件まで picks に投入（合計スコア降順）
3. 残り枠を「未採用カテゴリ × 未採用 source」のラウンドロビンで補充
4. japan 最低 1 件保証（必読でない英語記事と swap）
5. importance>=4 の china があれば 1 件保証（条件付き、強制ではない）
```

## プロンプト本文

```
以下の選定済み記事リスト（カテゴリ別、合計 18-25 件）から、「今日の必読 Top 5-7」を選んでください。

【必読フラグ付与条件 (must_read)】
以下のいずれかを満たす記事は must_read = true:
- scores.importance >= 4 AND (scores.depth + scores.practicality) >= 7
- source が ["anthropic", "openai", "google_deepmind", "meta_ai", "microsoft_ai", "nvidia"] のいずれか AND scores.importance >= 4
- reaction_signal.kind == "hatena" AND reaction_signal.users >= 100
- reaction_signal.kind == "hn" AND reaction_signal.points >= 500
- reaction_signal.kind == "reddit_top" AND reaction_signal.min_score >= 300

【選定アルゴリズム】
target = 6 (Range: 5-7)

Step 1: must_read=true 全件から合計スコア降順で最大 4 件を picks に投入
Step 2: 残り枠 (target - len(picks)) を以下の優先度で補充:
  - First pass: 候補をスコア降順で走査し、未採用カテゴリ AND 未採用 source の記事を picks に追加
  - Second pass: First pass で枠が埋まらなかったら、未採用 source の中から最高スコアを追加
  - Third pass: それでも残ったら、スコア降順で機械的に追加

Step 3: japan 最低 1 件保証
  - picks に japan カテゴリが 0 件で、かつ全 items に japan があれば、
    必読フラグなしの英語記事 1 件と swap

Step 4: china 条件保証（オプション）
  - importance >= 4 の china 記事があれば、必読フラグなしの 1 件と swap
  - 該当なしなら強制しない

【入力】
{
  "all_items": [
    {
      "id": "2026-05-10-001",
      "title": "...",
      "source": "google_deepmind",
      "source_type": "official",
      "category": "new_models",
      "scores": { "importance": 5, "depth": 4, "practicality": 4, "freshness": 5, "total": 18 },
      "reaction_signal": null
    },
    ...
  ]
}

【出力 JSON】
{
  "top_picks": [
    {
      "id": "2026-05-10-001",
      "rank": 1,
      "reason": "must_read:importance5+depth4+practicality4"
    },
    {
      "id": "2026-05-10-002",
      "rank": 2,
      "reason": "must_read:source=meta_ai+importance4"
    },
    {
      "id": "2026-05-10-006",
      "rank": 3,
      "reason": "japan_guaranteed"
    },
    {
      "id": "2026-05-10-008",
      "rank": 4,
      "reason": "diversity:china+importance4"
    },
    {
      "id": "2026-05-10-009",
      "rank": 5,
      "reason": "score_top:research_papers"
    },
    {
      "id": "2026-05-10-007",
      "rank": 6,
      "reason": "score_top:japan+practicality5"
    }
  ]
}

【ルール】
- top_picks は 5-7 件 (target=6)
- rank は 1 から連番
- reason は短いタグ + コロン区切り (デバッグ用、フロントは非表示)
- 同一 source は top_picks 内で 1 件まで
- 出力は JSON のみ。前置きなし
```

## 設定パラメータ（references/scoring.md 内に持つ想定）

```yaml
top_picks:
  target_count: 6           # 5-7 の中央値
  must_read_max: 4          # 必読フラグの自動取り込み上限
  category_diversity: true  # 同一カテゴリ 2 件目以降にペナルティ
  source_diversity: true    # 同一ソース 2 件目以降にペナルティ
  japan_guaranteed: 1       # japan 最低件数
  china_conditional: 1      # importance >= 4 の china 記事があれば 1 件
```

## reason フィールドのタグ一覧

`reason` は固定タグから選んで `:` で詳細を付ける（フロントは表示しないが、運用デバッグで効く）:

- `must_read:importanceN+depthN+practicalityN` — Step 1 必読フラグ
- `must_read:source=<source_id>+importanceN` — 公式ソース必読
- `must_read:hatena>=100` / `must_read:hn>=500` / `must_read:reddit>=300` — 反響シグナル必読
- `diversity:<category>` — Step 2 多様性枠
- `japan_guaranteed` — Step 3 japan 保証
- `china_conditional:importance>=4` — Step 4 china 条件保証
- `score_top:<category>+<reason>` — Step 2 スコア順補充
- `swap_for_japan` / `swap_for_china` — swap で押し出された旨

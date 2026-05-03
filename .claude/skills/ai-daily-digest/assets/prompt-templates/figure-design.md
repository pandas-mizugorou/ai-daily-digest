# 図解 (`figure`) 設計プロンプト — 視覚で直感的に分かる図解を 4 型から選択

## 目標

ユーザーは原則として**元記事を開かない**。生成されたカードと図解だけで、AI / 生成 AI ニュースの**核心・詳細・背景・影響**を正確に理解したい。

そのために図解は「**目で量・順序・対比が掴める視覚的構造**」を持ち、同時に**数字・ラベル・補足説明**を漏れなく含める。視覚化と情報量を両立させるのが核心方針。

## 4 つの図解型 — 記事の性質に応じて選ぶ

| 型 | 適用するべき記事 | 視覚の核 |
|---|---|---|
| `comparison` | 旧 vs 新 / 自社 vs 他社 / 規制前 vs 規制後 など**対比構造**を持つ記事 | 左右 2 列の横棒グラフ並列。差分を視覚で把握 |
| `metric-bars` | ベンチマーク結果 / 性能スコア / 機能評価 など**3-7 個の数値指標**が並ぶ記事 | 横棒グラフの一覧。値の大小と相対位置が一目瞭然 |
| `timeline` | ロードマップ / 段階的展開 / バージョン履歴 など**時系列イベント**を持つ記事 | 縦タイムライン軸。past / now / upcoming を視覚で区別 |
| `summary-card` | 上記 3 型に当てはまらない**質的解説や複数観点が混在**する記事 (フォールバック) | 5 セクション構造化テキスト |

### 型選択フロー

```
記事に「旧 vs 新」「A 社 vs B 社」のような明示的な対比軸はあるか？
  YES → comparison
  NO  → 数値指標が 3-7 個並んでいるか (ベンチマーク・スコアなど)？
          YES → metric-bars
          NO  → 時系列イベントが 3-7 個並んでいるか (ロードマップ・段階展開)？
                  YES → timeline
                  NO  → summary-card (フォールバック)
```

**判断基準**: 視覚化して**何が一目で分かるか**を優先する。同じ記事を `summary-card` でも `metric-bars` でも書ける場合、後者の方が「直感的に分かる」ので metric-bars を選ぶ。

## 共通原則 — 全型で守る 10 原則

1. **元記事を読まなくても完結すること**: 数字・固有名詞・背景・影響を漏れなく
2. **`headline` は核心を 1 行に**: 主役 + 主要数字を必ず含める
3. **記事に書いていない数字・事実は禁物**: 創作禁止。値が記事から取れないなら省略
4. **数値はバーの長さに正規化**: `pct` `before_pct` `after_pct` `baseline_pct` は 0-100 で記事中の最大値を 100 として正規化 (例: MMLU 94.4 → 94.4 / GSM8K 96.1 → 96.1)
5. **色 (`tone` `delta_tone`) で意味を区別**: 改善 = `success` / 悪化 = `danger` / 据え置き・情報 = `info` / 警告 = `warning` / 強調 = `primary`
6. **`alt` は 60-280 字必須**: 図に表れている全情報を文章として読める形で書く (アクセシビリティ)
7. **`narrative` `impact` は強く推奨**: 単なる前置き禁止。業界文脈と読者影響を踏み込んで
8. **ラベルは短く**: モバイル前提。指標名は 16 字以内、イベント名は 50 字以内
9. **アイコン絵文字は意味と整合**: 性能 = 📈 / 価格 = 💰 / 速度 = ⚡ / 公開 = ✅ / 警告 = ⚠️ など
10. **記事に具体性が乏しいときは figure を省略**: 数字も固有名詞もないニュースに無理やり作らない

---

## 型 1: `comparison` — 旧 vs 新 比較

### 構造

```
┌─ HEADLINE ─────────────────────────────────────┐
│ Claude Opus 5: 主要 4 指標で前世代を全面更新    │
├──────────────────────┬─────────────────────────┤
│ Before: Opus 4.5     │ After: Opus 5           │
├──────────────────────┼─────────────────────────┤
│ 📈 MMLU              │                         │
│ ████████░░  82.4    │ ██████████ 94.4 +12pt │
│                      │                         │
│ 📜 Context           │                         │
│ ██░░░░░░░░  200K    │ ██████████ 1M    5x   │
│                      │                         │
│ ⚡ Tool 遅延         │                         │
│ ██████████  100ms   │ ███████░░░ 70ms  -30% │
│                      │                         │
│ 💰 価格              │                         │
│ ██████████  $15     │ ██████████ $15   据置  │
├──────────────────────┴─────────────────────────┤
│ NARRATIVE: 直近 6 ヶ月のフロンティアラボ競争で…│
│ IMPACT: コードベース全体を 1 リクエストで…     │
└────────────────────────────────────────────────┘
```

### スキーマ

```json
{
  "type": "comparison",
  "caption": "<図解の主題、≤30字、任意>",
  "alt": "<60-280字、必須>",
  "data": {
    "headline": "<16-80字、必須>",
    "before": {
      "label": "<比較元名 1-24字、必須>",
      "sublabel": "<副題 ≤30字、任意>"
    },
    "after": {
      "label": "<比較先名 1-24字、必須>",
      "sublabel": "<副題 ≤30字、任意>"
    },
    "metrics": [
      {
        "icon": "<絵文字、任意>",
        "label": "<指標名 2-16字、必須>",
        "before": "<旧値 1-20字、必須>",
        "after": "<新値 1-20字、必須>",
        "before_pct": <0-100、バー長 任意>,
        "after_pct": <0-100、バー長 任意>,
        "delta": "<差分 ≤20字、強く推奨>",
        "delta_tone": "success | warning | danger | info | default",
        "note": "<条件・補足 ≤80字、任意>"
      },
      ... (3-6 件、必須)
    ],
    "narrative": "<60-200字、強く推奨>",
    "impact": "<30-160字、強く推奨>"
  }
}
```

### `before_pct` / `after_pct` の決め方

- **同じ指標内で正規化**: その metric の「比較できる最大値」を 100 として算出
  - 例: MMLU の場合、上限 100 → before_pct=82.4 / after_pct=94.4
  - 例: コンテキストの場合、after が最大 1M なので before_pct=20 / after_pct=100
  - 例: 価格の場合、両方 $15 なら before_pct=after_pct=80（同じ長さで「据置」が視覚化される）
- **遅延・コストなど「小さい方が良い」指標**は値が小さいほどバーを短く（直感に合わせる）
- **絶対値が無い**指標 (定性的) は等しいバー長 (両方 50 など) にして delta テキストで示す

### `delta_tone` の決め方

| delta_tone | ケース |
|---|---|
| `success` | 改善 (性能向上 / コスト減 / 速度向上) |
| `danger` | 悪化 (性能低下 / 価格上昇 / 廃止) |
| `info` | 据え置き / 情報のみ |
| `warning` | 制約あり / 限定 / preview |
| `default` | 中立 |

### Good 例: モデル更新

記事: 「Anthropic introduces Claude Opus 5 with 1M context, 1.4x faster reasoning」

```json
{
  "type": "comparison",
  "caption": "Claude Opus 4.5 → 5",
  "alt": "Claude Opus 4.5 → 5 の主要 4 指標を比較。MMLU は 82.4 → 94.4 (+12pt)、コンテキスト 200K → 1M (5 倍)、ツール呼び出し遅延 100ms → 70ms (-30%)、API 価格 $15/1M output は据え置き。性能・容量・速度の全面アップグレード後も価格を維持し、即移行可能。",
  "data": {
    "headline": "Claude Opus 5: 性能・容量・速度を全面更新、価格は据え置き",
    "before": { "label": "Opus 4.5", "sublabel": "2026年1月版" },
    "after":  { "label": "Opus 5",   "sublabel": "2026年5月発表" },
    "metrics": [
      {
        "icon": "📈",
        "label": "MMLU",
        "before": "82.4",
        "after": "94.4",
        "before_pct": 82.4,
        "after_pct": 94.4,
        "delta": "+12pt",
        "delta_tone": "success",
        "note": "推論系 SoTA 更新、HumanEval も 95.2"
      },
      {
        "icon": "📜",
        "label": "コンテキスト",
        "before": "200K",
        "after": "1M tokens",
        "before_pct": 20,
        "after_pct": 100,
        "delta": "5x 拡張",
        "delta_tone": "success",
        "note": "Needle-in-Haystack 99.7% 保持"
      },
      {
        "icon": "⚡",
        "label": "ツール遅延",
        "before": "100ms",
        "after": "70ms",
        "before_pct": 100,
        "after_pct": 70,
        "delta": "-30%",
        "delta_tone": "success",
        "note": "エージェント連鎖の体感速度が改善"
      },
      {
        "icon": "💰",
        "label": "価格 (出力)",
        "before": "$15 / 1M",
        "after": "$15 / 1M",
        "before_pct": 60,
        "after_pct": 60,
        "delta": "据え置き",
        "delta_tone": "info",
        "note": "入力 $3 / 出力 $15 を維持"
      }
    ],
    "narrative": "直近 6 ヶ月で OpenAI / Google も長文対応モデルを発表したが、長文時のレイテンシや価格上昇が課題だった。Anthropic は 3 軸全てを同時改善+価格据え置きで対抗。",
    "impact": "コードベース全体を 1 リクエストで読み込むエージェント、低遅延ツール連鎖、長文 RAG なしの直接読み込みなど、これまで実用レベルに届かなかった設計が現実的に。"
  }
}
```

### Bad 例

❌ 比較軸が無いのに無理やり comparison を使う (例: 単一モデルの初リリースを「ベースライン vs 自社」で書く)
→ Good: それは metric-bars にする

❌ before_pct と after_pct がバラバラのスケールで比較不能
→ Good: 同じ指標内では同じスケールで正規化する

---

## 型 2: `metric-bars` — 横棒グラフ一覧

### 構造

```
┌─ HEADLINE ─────────────────────────────────────┐
│ Claude Opus 5: ベンチマーク 5 指標で SoTA 更新 │
├────────────────────────────────────────────────┤
│ 📈 MMLU       ██████████ 94.4   +12pt vs 4.5  │
│ 🔢 GSM8K      ██████████ 96.1   +5pt          │
│ 🐛 SWE-bench  ████████░░ 78.4   +13pt         │
│ 🐍 HumanEval  ██████████ 95.2   +8pt          │
│ 🎓 GPQA       ███████░░░ 72.5   +9pt          │
│                                                │
│ ━━ Opus 5  比較対象: ┄┄ Opus 4.5              │
├────────────────────────────────────────────────┤
│ NARRATIVE: 推論系・コード系・科学系で全面 SoTA │
│ IMPACT: エージェント実装で精度・速度の両立が…  │
└────────────────────────────────────────────────┘
```

### スキーマ

```json
{
  "type": "metric-bars",
  "caption": "<図解の主題、≤30字、任意>",
  "alt": "<60-280字、必須>",
  "data": {
    "headline": "<16-80字、必須>",
    "scale": {
      "max_label": "<100% 時の意味 ≤24字、任意>",
      "unit": "<単位 ≤16字、任意>"
    },
    "bars": [
      {
        "icon": "<絵文字、任意>",
        "label": "<指標名 2-24字、必須>",
        "value": "<実測値 1-20字、必須>",
        "pct": <0-100、必須>,
        "baseline_pct": <0-100、比較基準 任意>,
        "baseline_label": "<比較基準名 ≤24字、任意>",
        "delta": "<差分 ≤20字、任意>",
        "tone": "default | primary | success | warning | danger | info",
        "note": "<1 行補足 ≤100字、任意>"
      },
      ... (3-7 件、必須)
    ],
    "narrative": "<60-200字、強く推奨>",
    "impact": "<30-160字、強く推奨>"
  }
}
```

### `pct` の決め方

- 各 bar の値を**そのまま % として**扱える場合 (MMLU, HumanEval などスコア 0-100) はそのまま入れる
- 単位が異なる指標を混ぜる場合は記事中の**最大値を 100 として正規化**
- `baseline_pct` は前世代や他社のスコア。あれば 1 本の点線として描画される

### `tone` の決め方

| tone | ケース |
|---|---|
| `primary` | 主役の指標 (記事内で最も強調すべきもの) |
| `success` | 改善 / 大幅向上 |
| `default` | 中立 |
| `info` | 情報 / 客観的事実 |
| `warning` / `danger` | 通常は使わない (metric-bars は性能の良さを示す用途が中心) |

### Good 例: ベンチマーク発表

記事: 「Anthropic releases benchmark suite for Claude Opus 5」

```json
{
  "type": "metric-bars",
  "caption": "Opus 5 ベンチマーク",
  "alt": "Claude Opus 5 のベンチマーク 5 指標。MMLU 94.4 (前世代 +12pt)、GSM8K 96.1 (+5pt)、SWE-bench 78.4 (+13pt)、HumanEval 95.2 (+8pt)、GPQA 72.5 (+9pt)。推論・コード・科学系全てで SoTA を更新。",
  "data": {
    "headline": "Claude Opus 5: 主要 5 ベンチマークで全面 SoTA 更新",
    "scale": { "max_label": "上限 100", "unit": "pt" },
    "bars": [
      {
        "icon": "📈",
        "label": "MMLU",
        "value": "94.4",
        "pct": 94.4,
        "baseline_pct": 82.4,
        "baseline_label": "Opus 4.5",
        "delta": "+12pt",
        "tone": "primary",
        "note": "推論系の標準ベンチマーク、SoTA 更新"
      },
      {
        "icon": "🔢",
        "label": "GSM8K",
        "value": "96.1",
        "pct": 96.1,
        "baseline_pct": 91.0,
        "delta": "+5pt",
        "tone": "success",
        "note": "数学推論、5K 件の小学校算数"
      },
      {
        "icon": "🐛",
        "label": "SWE-bench Verified",
        "value": "78.4",
        "pct": 78.4,
        "baseline_pct": 65.1,
        "delta": "+13pt",
        "tone": "success",
        "note": "実 GitHub Issue 解決率、エージェント設定で測定"
      },
      {
        "icon": "🐍",
        "label": "HumanEval",
        "value": "95.2",
        "pct": 95.2,
        "baseline_pct": 87.0,
        "delta": "+8pt",
        "tone": "success",
        "note": "Python コード生成"
      },
      {
        "icon": "🎓",
        "label": "GPQA Diamond",
        "value": "72.5",
        "pct": 72.5,
        "baseline_pct": 63.5,
        "delta": "+9pt",
        "tone": "success",
        "note": "大学院レベルの科学質問"
      }
    ],
    "narrative": "推論系 (MMLU/GPQA)、数学系 (GSM8K)、コード系 (SWE-bench/HumanEval) の全領域で SoTA を更新。特に SWE-bench の +13pt はエージェント設定の改善が大きい。",
    "impact": "コード生成・自動デバッグエージェントの精度が実用ラインを超え、人間の介入なしで小〜中規模のタスク完遂が現実的に。"
  }
}
```

### Bad 例

❌ 単一指標しか無い記事に metric-bars を使う (1 本のバーは意味がない)
→ Good: summary-card にして points で表現

❌ pct を全部 100 にしてしまう (差が見えない)
→ Good: 値の差を視覚化できるよう正規化する

---

## 型 3: `timeline` — 縦タイムライン

### 構造

```
┌─ HEADLINE ─────────────────────────────────────┐
│ Claude 4 → 5 ロードマップ: 5 月 Opus 5 公開    │
├────────────────────────────────────────────────┤
│ ●─ 2025/05  Opus 4.0 GA                       │
│ │   フラッグシップ刷新、初の RLAIF 完全採用   │
│ │                                             │
│ ●─ 2026/01  Opus 4.5 + Sonnet 4.6             │
│ │   コンテキスト 200K、ツール使用精度向上     │
│ │                                             │
│ ◉─ 2026/05  Opus 5 GA  ← 本日                │
│ │   1M tokens、性能 +14%、価格据え置き        │
│ │                                             │
│ ○─ 2026/06  Sonnet 5 公開予定                 │
│ │   小型版を Opus 5 アーキテクチャで再構築    │
│ │                                             │
│ ○─ 2026 Q3  Haiku 5 公開予定                  │
│     エッジ用途向け軽量モデル                  │
├────────────────────────────────────────────────┤
│ NARRATIVE: 半年サイクルで主要 3 グレード …    │
│ IMPACT: 同アーキテクチャでサイズ違い 3 種が…  │
└────────────────────────────────────────────────┘
```

### スキーマ

```json
{
  "type": "timeline",
  "caption": "<図解の主題、≤30字、任意>",
  "alt": "<60-280字、必須>",
  "data": {
    "headline": "<16-80字、必須>",
    "events": [
      {
        "when": "<時点 2-24字、必須>",
        "label": "<イベント名 2-50字、必須>",
        "description": "<内容 40-140字、強く推奨>",
        "status": "past | now | upcoming",
        "tone": "default | primary | success | warning | danger | info"
      },
      ... (3-7 件、必須、時系列順)
    ],
    "narrative": "<60-200字、強く推奨>",
    "impact": "<30-160字、強く推奨>"
  }
}
```

### `status` の決め方

- `past`: すでに完了したイベント。`●` (塗りつぶし円) で描画
- `now`: 「今このニュースで起きたこと」「現時点の話題」。`◉` (二重円) で強調描画。**1 つだけ**指定するのが基本
- `upcoming`: 将来予定のイベント。`○` (白抜き円) で描画

### Good 例: ロードマップ発表

記事: 「Anthropic shares Claude 5 family roadmap」

```json
{
  "type": "timeline",
  "caption": "Claude 5 ファミリー予定",
  "alt": "Claude 4 → 5 のロードマップ。2025/05 に Opus 4.0 GA、2026/01 に Opus 4.5 と Sonnet 4.6、本日 2026/05 に Opus 5 GA、2026/06 に Sonnet 5 公開予定、2026 Q3 に Haiku 5 公開予定。半年サイクルで主要 3 グレードを刷新する戦略。",
  "data": {
    "headline": "Claude 5 ファミリー: 半年で Opus → Sonnet → Haiku を順次公開",
    "events": [
      {
        "when": "2025/05",
        "label": "Opus 4.0 GA",
        "description": "フラッグシップを刷新、初の RLAIF 完全採用。当時の SoTA を獲得。",
        "status": "past",
        "tone": "default"
      },
      {
        "when": "2026/01",
        "label": "Opus 4.5 + Sonnet 4.6 リリース",
        "description": "コンテキスト 200K へ拡張、ツール使用精度を大幅向上。中間世代として位置付け。",
        "status": "past",
        "tone": "default"
      },
      {
        "when": "2026/05",
        "label": "Opus 5 GA",
        "description": "本日発表。MMLU 94.4 (+12pt)、コンテキスト 1M tokens、価格据え置き。フラッグシップを完全刷新。",
        "status": "now",
        "tone": "primary"
      },
      {
        "when": "2026/06",
        "label": "Sonnet 5 公開予定",
        "description": "Opus 5 と同アーキテクチャの小型版。コスト最適化エージェント向け。価格 $3/1M output 想定。",
        "status": "upcoming",
        "tone": "info"
      },
      {
        "when": "2026 Q3",
        "label": "Haiku 5 公開予定",
        "description": "エッジ用途向け軽量モデル。レイテンシ 50ms 以下、$1/1M 想定。Sonnet 5 リリース後を予定。",
        "status": "upcoming",
        "tone": "info"
      }
    ],
    "narrative": "Opus 4 系列は約 1 年でスケールしたが、Opus 5 ロードマップは半年で Opus → Sonnet → Haiku の主要 3 グレードを順次公開する圧縮スケジュール。",
    "impact": "同アーキテクチャでサイズ違いの 3 モデルが揃う見込みで、Opus → Sonnet への置き換えによるコスト最適化や、Haiku によるエッジ展開が今年中に視野に入る。"
  }
}
```

### Bad 例

❌ 同日のイベント 1 件しかないのに timeline を使う
→ Good: summary-card で書く

❌ status を全部 past にする (今のニュースが分からない)
→ Good: 当該ニュースのイベントを `now` に指定

---

## 型 4: `summary-card` — フォールバック (5 セクション構造)

### 適用条件

- 上記 3 型 (comparison / metric-bars / timeline) のいずれにも当てはまらない
- 質的な解説、複数観点の混在、ガイドライン記事、ポジションペーパーなど

### 構造 (既存)

```
┌─ HEADLINE ──────────────────────────────┐  20-80字
├─ TL;DR ─────────────────────────────────┤  60-180字
├─ DETAILS (points 3-6) ──────────────────┤  各項目に description
├─ CONTEXT ───────────────────────────────┤  60-200字
├─ IMPACT ────────────────────────────────┤  30-160字
└─────────────────────────────────────────┘
```

### スキーマ

```json
{
  "type": "summary-card",
  "caption": "<図解の主題、≤30字、任意>",
  "alt": "<60-280字、必須>",
  "data": {
    "headline": "<20-80字、必須>",
    "tldr": "<60-180字、必須>",
    "points": [
      {
        "icon": "<絵文字、任意>",
        "label": "<2-12字>",
        "value": "<1-36字>",
        "note": "<≤50字>",
        "description": "<40-160字、極力埋める>",
        "tone": "default | primary | success | warning | danger | info"
      },
      ... (3-6 件、必須)
    ],
    "context": "<60-200字、強く推奨>",
    "impact": "<30-160字、強く推奨>"
  }
}
```

### 採用判断

`summary-card` は便利だがテキスト主体になりやすい。**comparison / metric-bars / timeline で書ける記事はそちらを優先**する。

---

## アイコン (絵文字) 一覧

| 観点 | 絵文字 |
|---|---|
| 性能・スコア | 📈 🎯 ⭐ 🏆 |
| 速度・レイテンシ | ⚡ ⏱️ 🚀 |
| コスト・価格 | 💰 💵 💸 |
| コンテキスト・容量 | 📜 📦 💾 |
| ツール・SDK | 🔧 🛠️ 🐍 (Py) 📘 (TS) |
| API・接続 | 🌐 🔌 |
| 公開・GA | ✅ 🎉 |
| 警告・制限 | ⚠️ ⏸️ |
| 廃止・撤退 | 🚫 ❌ |
| データ・統計 | 📊 📉 🔢 |
| ベンチマーク種別 | 🐛 (SWE) 🎓 (GPQA) 🔢 (GSM) 🐍 (HumanEval) |
| 環境 | 🖥️ 💻 |
| 時間・スケジュール | 📅 ⏰ |
| ユーザー・チーム | 👥 |
| ドキュメント | 📖 |
| ライセンス | 📄 |
| セキュリティ | 🔒 |

## 省略の基準 — figure を出力しない条件

以下のいずれかに当てはまる場合は `figure` を**完全に省略**する:

- 記事に具体的な数字・固有名詞が一切ない
- 数値指標・対比軸・時系列のいずれも抽出できない
- どの型を選んでも 3 件以上の有効なポイント (points / metrics / bars / events) を埋められない
- 記事に書かれていない情報を補わないと埋められない (創作必須になる)

無理に作ると **「事実誤り」リスク**が上がる。ない場合は省略が正解。

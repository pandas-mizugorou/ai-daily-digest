# 4 軸スコアリング基準

各記事を 4 軸で 1-5 点採点し、合計（最大 20 点）でランキング。

## importance（重要度）

その日の AI / 生成 AI 業界における**ニュースバリュー**。「翌日同僚と議論できるか」「業界の地図が変わるか」を基準に判定。

| 点数 | 基準 |
|---|---|
| 5 | フロンティアラボの新フラッグシップモデル発表、業界標準の変更、大型 M&A 完了など、**業界全体に影響する**メガニュース |
| 4 | 主要ベンダーの新機能・新製品、有名 OSS の major release、孫引きされやすい研究 |
| 3 | 主要ベンダーの中規模リリース、注目論文、二次情報源で取り上げられる話題 |
| 2 | ベンダーのマイナーアップデート、研究の継続的進歩 |
| 1 | 局所的な改善、特定ユースケースのみ意味のある話題 |

## depth（技術深度）

技術的内実・新規性。「単なる広報リリースではないか」を判定。

| 点数 | 基準 |
|---|---|
| 5 | 技術的アーキテクチャ・ベンチマーク・新手法の核心が含まれる。論文・モデルカード・詳細な技術ブログ |
| 4 | 主要な技術ポイントは説明されているが、内部実装は限定的 |
| 3 | 技術ハイライトは触れられているが詳細は別ページ参照 |
| 2 | 機能リスト中心で技術内実は薄い |
| 1 | プレスリリース調・実質ゼロ。**通常はペルソナフィルタで除外** |

## practicality（実用性）

ユーザー（個人開発者・AI エンジニア・X 発信者）が**3 ヶ月以内に手元で試せる/使える**かどうか。

| 点数 | 基準 |
|---|---|
| 5 | API 公開済み + ドキュメント完備 + 価格明示。即試せる |
| 4 | API 公開だが waitlist あり、または OSS 公開済 |
| 3 | 限定 preview / 公開予定明示 |
| 2 | 研究段階で実装が公開されている（PoC レベル） |
| 1 | 概念実証のみ・プロプライエタリ・利用不可 |

## freshness（鮮度）

公開からの経過時間。**routine 実行時刻（朝 5 時 JST）基準**。

| 点数 | 基準 |
|---|---|
| 5 | 直近 24 時間以内 |
| 4 | 24-48 時間以内 |
| 3 | 48-72 時間以内 |
| 2 | 3-7 日以内 |
| **1** | **7-14 日以内**（学術・週次論考枠：Stratechery / Sebastian Raschka / OpenReview など 7d 超でもこの枠で許容） |
| 0 | 14 日超（通常は除外）|

**ソース別動的時間窓**: `references/sources.md` の各ソースに `time_window_hours` を付与し、Step 5 のフィルタで時間窓外を `_excluded: outside_time_window` で除外する。窓内であれば上記 freshness 表で採点する。

| ソースタイプ | 時間窓 | 該当 |
|---|---|---|
| 公式・速報・GitHub Trending | 24h | Anthropic / OpenAI / Google / Meta / Microsoft / Mistral / xAI / Nvidia / HF Blog / Cohere / TechCrunch / The Verge / VentureBeat / Ars Technica |
| HN / 海外メディア / 日本コミュニティ / Reddit / X | 48h | HN / Wired / VentureBeat 拡張 / MIT Tech Review / はてブ / Qiita / Zenn / ITmedia / Reddit / X |
| arXiv / HF Models / 日本企業ブログ / Stratechery / 学術 / 中華圏 | 168h (7d) | arXiv / HF Trending / PFN / ELYZA / Sakana AI / LINEヤフー / CyberAgent / Stockmark / メルカリ / Sansan / Stratechery / Papers with Code / Semantic Scholar / Latent Space / Import AI / The Batch / 36Kr / 量子位 / 機器之心 / ChinAI |
| OpenReview / Sebastian Raschka | 336h (14d) | OpenReview / sebastianraschka.com |

**既出ペナルティ（段階化）**: `data/_seen.json`（直近 90 日に push 済みの URL ハッシュ + `last_seen_count` + `first_seen_at`）を読み、`last_seen_count` に応じて段階的に `freshness` を減点:

| `last_seen_count` | freshness 減点 |
|---|---|
| 1 | -1 |
| 2 | -2 |
| 3 以上 | -3 |
| `first_seen_at` が 30 日以上前 | 追加で -3（古い記事の再注目を除外） |

`data/_seen.json` の管理仕様は `references/publish.md` を参照（リポジトリ管理に移行、URL ハッシュ + プレフィックスのみで個人情報リスクなし）。

**日本企業テックブログの例外**: 日本企業のテックブログ（Preferred Networks / ELYZA / Sakana AI / LINEヤフー / CyberAgent AI Lab / Stockmark / メルカリ / Sansan）は投稿頻度が週〜月単位のため、**7 日以内なら freshness は最低 2 を保証**。優れた実装記事を週次更新の遅延で取りこぼさないため。

## ソースタイプ別 importance bias（source_type_bias）

各ソースに `source_type` を付与し、`importance` を加減算する。一次情報を優先しつつ、メディア二次情報を控えめに、学術論考を厚めに評価するための補正。

| source_type | bias | 適用例 | 理由 |
|---|---|---|---|
| `official` | +0 | Anthropic / OpenAI / DeepMind / Meta / Microsoft / Mistral / xAI / Nvidia / HF Blog / Cohere | ベースライン。一次情報の重要性は importance に織り込み済み |
| `media` | -1 | TechCrunch / The Verge / VentureBeat / Wired / Stratechery / MIT Tech Review / Ars Technica | 二次情報（公式の言い直し）に重複しやすいため減点 |
| `academic` | +1 | arXiv / Papers with Code / Semantic Scholar / OpenReview / Latent Space / Import AI / The Batch / Sebastian Raschka | 技術深度が高く、一過性のニュースより長く価値が残るため加点 |
| `community` | -1 | Reddit / HN コメント / X 公開トレンド / LessWrong | 個人の主観・未検証情報が多いため減点（reaction_signal で別途加点） |
| `china` | +0 | 36Kr / 量子位 / 機器之心 / ChinAI Newsletter | 中華圏は別カテゴリで存在感を確保するため bias なし |
| `japan_corp` | +0 | PFN / ELYZA / Sakana AI / LINEヤフー / CyberAgent AI Lab / Stockmark / メルカリ / Sansan | 既存ロジックで importance に織り込み済み |
| `japan_community` | +0 | Qiita / Zenn / はてブ / ITmedia AI+ | reaction_signal で別途加点済み |
| `aggregator` | +0 | HF Trending / GitHub Trending | スコア集計済みなので bias なし |

**適用順序**:
1. 通常の 4 軸採点
2. **`source_type_bias` を `importance` に加算（5 でクリップ、1 で下限）**
3. 反響ブーストを `importance` に加算（5 でクリップ）
4. 既出ペナルティ `freshness` 減点（Step 5 で適用済み）
5. ペルソナフィルタで除外判定

## 反響ブースト（Reaction Boost）— 日本語ソース専用の追加加点

日本語ソース（Qiita / Zenn / はてブ / 企業テックブログ）に対しては、コミュニティでの反響シグナルを `importance` に加算する。これは「日本コミュニティで実際に話題になっている記事」を機械的に拾うため。

### はてなブックマーク数

| ブクマ数 | importance 加算 |
|---|---|
| ≥ 100 | **+2** |
| ≥ 30 | **+1** |
| ≥ 10 | +0（最低ライン、選定対象） |
| < 10 | 個人記事として通常は除外 |

### Qiita / Zenn のいいね数

| likes_count + stocks_count（Qiita） / liked_count（Zenn） | importance 加算 |
|---|---|
| ≥ 50 | **+2** |
| ≥ 20 | **+1** |
| < 20 | +0 |

### 上限

反響ブーストを加算しても `importance` は **5 を超えない**（クリッピング）。

### 適用順序（再掲、ソースタイプ補正と整合）

1. 通常の 4 軸採点
2. `source_type_bias` を `importance` に加算（5 でクリップ、1 で下限）
3. 反響ブーストを `importance` に加算（5 でクリップ）
4. 時間窓フィルタ + 既出ペナルティ `freshness` 段階化（Step 5 で適用済み）
5. ペルソナフィルタで除外判定

## 合計スコアの読み方

| 合計 | 解釈 | UI 表示色 |
|---|---|---|
| 17-20 | 必読・最重要 | 緑（high） |
| 13-16 | 押さえておくべき | 黄（mid） |
| 9-12 | 余力があれば | 灰（low） |
| 0-8 | 通常は選定外 | — |

## カテゴリ別の論文（research）追加判定

arXiv 論文は量が多すぎるため、以下の**少なくとも 1 つ**を満たすもののみ採用候補とする:

- 公開実装あり（GitHub に code link）
- 既存ベンチマークで SoTA を更新
- 新ベンチマーク・新評価手法を提案
- 主要ラボの著者が含まれる（Anthropic / OpenAI / DeepMind / Meta / FAIR / Google Research など）
- 引用されているソーシャルバズ（HN front page / Twitter で大きく言及）

サーベイ論文・既存手法の小改良・特定タスクのみのチューニングは原則除外（depth は高いが importance が低い）。

## 日本語ソース（japan カテゴリ）の選定基準

### 優先する記事タイプ

1. **日本企業のテックブログ実装記事**（PFN / ELYZA / Sakana AI / LINEヤフー / CyberAgent AI Lab / Stockmark / メルカリ / Sansan）
   - 社内導入事例・自社モデル開発・自社サービスの AI 統合
2. **はてブ ≥30 のバズ記事** — 日本コミュニティで実際に反響がある証拠
3. **Qiita / Zenn の人気実装記事**（likes ≥20）— 具体的なコード・設定・ベンチマークを含むもの
4. **国産モデル・国産ツール**（Japanese LLM / Sakana / ELYZA / RWKV-Japanese 等）
5. **日本市場特有の動向** — 規制・大手企業の AI 採用・人材市場

### 完全除外

- 英語記事の単純翻訳ニュース（一次情報を英語ソースで取れば良い）
- "ChatGPT を使ってみた" 系の入門個人記事
- ブクマ < 5 / Qiita likes < 5 の個人記事（反響なし）
- 学習教材・スクール広告・受験・資格系
- アフィリエイト主体の比較記事

### 定義

ここでいう「日本語ソース」とは記事 URL が以下のいずれかのドメイン配下にあるもの:
- `tech.preferred.jp` / `note.com/elyza` / `sakana.ai/blog` / `techblog.lycorp.co.jp` / `cyberagent.ai` / `tech.stockmark.co.jp` / `engineering.mercari.com` / `buildersbox.corp-sansan.com` （日本企業テックブログ）
- `qiita.com` / `zenn.dev` （コミュニティ）
- `b.hatena.ne.jp` 経由で参照される日本語記事
- `itmedia.co.jp/aiplus/`
- その他 `lang=ja` の記事

英語ソースでも同じ記事を翻訳した日本語記事があれば、英語版を採用する（一次情報優先）。

## ベンダー偏り対策（10 カテゴリ・25 件運用版）

件数倍増（Phase A 以降、合計上限 25 件）に伴い、上限を以下に緩和:

| 範囲 | 同一 source 上限 | 3 件目以降のペナルティ |
|---|---|---|
| 全カテゴリ計 | 3 件 | importance -1 |
| `new_models` 内 | 2 件 | importance -1 |
| `tools_apps` 内 | 2 件 | importance -1 |
| `agents` 内 | 2 件 | importance -1 |
| `multimodal` 内 | 2 件 | importance -1 |
| `research_papers` 内 | 3 件 | importance -1 |
| `industry_business` 内 | 2 件 | importance -1 |
| `regulation_policy` 内 | 1 件 | （上限 1 のため自然に制約） |
| `community_buzz` 内 | 2 件 | importance -1 |
| `japan` 内 | 2 件 | 既存維持 |
| `china` 内 | 2 件 | importance -1 |

**Top Picks 選定アルゴリズム（Step 7.5 / `select-top-picks.md`）で「同一 source 回避」を別途強制**するため、カテゴリ内では 2-3 件入れても top_picks には 1 件だけ採用される運用。

## 同点時のタイブレーク

合計スコア同点の場合の優先順位:
1. `importance` が高い方
2. `practicality` が高い方
3. `published_at` が新しい方
4. `source` が公式ブログ（一次情報）の方
5. `source_type == "academic"`（学術論考）の方
6. `source_type == "official"`（公式）の方

## figure 型の事前ヒューリスティック判定

Step 8 の要約・図解生成プロンプトに `figure_type_hint` として渡し、LLM の選択を安定化させる。**ヒントは参考扱い**で、LLM が記事内容に応じて最終判断する（強制ではない）。

```python
def hint_figure_type(item):
    title = item.title.lower() + " " + (item.summary_en or "").lower()

    # 1. ベンチマーク数値が複数並ぶ → metric-bars
    benchmark_keywords = ["mmlu", "gsm8k", "humaneval", "swe-bench", "gpqa", "benchmark", "score", "ベンチマーク"]
    if any(b in title for b in benchmark_keywords) and title.count(",") >= 2:
        return "metric-bars"

    # 2. 旧 vs 新 / before-after / vs / 比較 → comparison
    comparison_keywords = [" vs ", "before", "after", "比較", "対比", "→", "->"]
    if any(c in title for c in comparison_keywords):
        return "comparison"

    # 3. ロードマップ・段階展開・タイムライン → timeline
    timeline_keywords = ["roadmap", "timeline", "schedule", "rollout", "launch plan", "ロードマップ", "段階", "ステップ"]
    if any(t in title for t in timeline_keywords):
        return "timeline"

    # 4. それ以外 → summary-card (フォールバック)
    return "summary-card"
```

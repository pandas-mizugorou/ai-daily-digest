# 10 カテゴリ定義

`/ai-daily-digest` Phase A 以降の出力カテゴリ定義。1 記事は **必ず 1 カテゴリのみ**に所属させる（多重所属禁止、フロント描画の単純化のため）。

## カテゴリ一覧

| id | label_ja | label_en | 上限 | 定義 | 例 |
|---|---|---|---|---|---|
| `new_models` | 新モデル・新発表 | New Models | 3 | フロンティアラボおよび主要 OSS の新モデル発表・モデルファミリーアップデート・新マルチモーダルモデル | Claude Opus 5 / Gemini 4 / Llama 4 / DeepSeek-V4 |
| `tools_apps` | ツール・アプリ・SDK | Tools & Apps | 3 | SDK / API / IDE 統合 / OSS フレームワーク / 商用エンドユーザーアプリ | Transformers v5 / ChatGPT Excel / Claude Code 機能追加 |
| `agents` | エージェント・自律実行 | Agents | 2 | 自律エージェント / マルチエージェント / Computer Use / ツール呼び出し系 | Claude Managed Agents / OpenAI Workspace Agents / Devin |
| `multimodal` | マルチモーダル・生成 | Multimodal | 2 | 画像・動画・音声生成・統合モデル・3D 生成 | Veo 4 / Sora / Stable Diffusion / TTS モデル |
| `research_papers` | 研究・論文 | Research | 3 | arXiv 論文・学術プラットフォーム・解説論考（Latent Space / Import AI / The Batch） | 新ベンチマーク / 新手法 / SoTA 更新 |
| `industry_business` | 業界動向・ビジネス | Industry & Business | 2 | M&A / 資金調達 / パートナーシップ / 大型契約 / 主要メディアの戦略解説 | Anthropic-SpaceX 契約 / Stratechery 論考 |
| `regulation_policy` | 規制・政策・安全 | Regulation & Policy | 1 | EU AI Act / 各国規制 / 安全性研究 / アライメント論考 | LlamaFirewall / Llama Guard 4 / EU 規制 |
| `community_buzz` | コミュニティ反響 | Community Buzz | 2 | Reddit / HN / X で大きく話題になった事例・議論・実体験投稿 | r/LocalLLaMA top / HN 1000pt 越え |
| `japan` | 日本語ソース | Japan | **5** | 日本企業テックブログ + 日本語コミュニティ（既存仕様維持） | PFN / ELYZA / Qiita / Zenn / はてブ |
| `china` | 中華圏 | China | 2 | 中国の AI 企業・研究機関・政策・コミュニティ | DeepSeek / Qwen / 36Kr / 量子位 |

**合計上限**: 3 + 3 + 2 + 2 + 3 + 2 + 1 + 2 + 5 + 2 = **25 件**（実運用平均 18-22 件）

## カテゴリ判定の優先順位

1 記事を 1 カテゴリに振る時、以下の順で**先にマッチしたものを優先**:

1. `regulation_policy` ← 規制・安全・アライメントが主題なら必ずここ
2. `agents` ← 「自律的に複数ステップを実行する」記述があれば
3. `multimodal` ← 画像・動画・音声生成が主題なら
4. `new_models` ← 新モデル発表・モデルファミリーのアップデート
5. `tools_apps` ← SDK / API / IDE 統合 / アプリ
6. `research_papers` ← arXiv 論文 / 学術解説論考
7. `industry_business` ← M&A・資金調達・戦略解説
8. `community_buzz` ← 議論・賛否・実体験投稿（新モデル / 論文 / ツール記事は元カテゴリを優先）
9. `japan` ← URL ドメインまたは `lang=ja`
10. `china` ← 中国の AI 企業・研究機関・政策（中国本土ソースまたは中国系著者の英語記事）

左ほど狭く具体的な定義を優先する。例:
- 「Llama 4 + Llama Guard 4 同時公開」→ `new_models` を主にして、Llama Guard 4 は別 item として `regulation_policy` に分割するか、key_points で言及
- 「Reddit で話題の Claude Code 設定例」→ `community_buzz` ではなく `tools_apps`（元カテゴリ優先）
- 「中国系著者の自律エージェント論文」→ `agents` を主、`china` は副ラベル（タグで補強）

## カテゴリ定義の運用注意

- `agents` は `tools_apps` と境界が曖昧。判定ルール: 「自律的に複数ステップを実行する」記述があれば `agents`、それ以外は `tools_apps`
- `multimodal` は `new_models` と重なる時、新モデル発表自体が画像・動画生成中心なら `multimodal` 優先
- `community_buzz` は重複しやすいため、新モデル / 論文 / ツール記事は元カテゴリを優先し、`community_buzz` には「議論・賛否・実体験投稿」のみ入れる
- `japan` は反響ブースト後の枠（5 件保証）。同一ドメインから最大 2 件まで
- `china` は中国本土の AI 企業・研究機関・政策が主題のもの。中国系著者の英語論文も含むが、論文性が強ければ `research_papers` 優先

## 旧 ID マッピング（後方互換）

旧 5 カテゴリと新 10 カテゴリの対応表。**旧 ID は schema enum に残置**し、フロントは旧 → 新ラベルマッピングを保持して既存 8 日分の JSON もそのまま読める。

| 旧 ID | 新 ID | label_ja（共通） | 備考 |
|---|---|---|---|
| `new_models` | `new_models` | 新モデル・新発表 | 維持 |
| `tools` | `tools_apps` | ツール・アプリ・SDK | リネーム |
| `research` | `research_papers` | 研究・論文 | リネーム |
| `industry` | `industry_business` | 業界動向・ビジネス | リネーム |
| `japan` | `japan` | 日本語ソース | 維持 |
| — | `agents` | エージェント・自律実行 | **新規** |
| — | `multimodal` | マルチモーダル・生成 | **新規** |
| — | `regulation_policy` | 規制・政策・安全 | **新規** |
| — | `community_buzz` | コミュニティ反響 | **新規** |
| — | `china` | 中華圏 | **新規** |

**新規生成時は新 ID を使う**。過去日のデータ（schema_version=1.x）は旧 ID のまま、フロント側 `categoryFallbackLabel()` がラベル変換する。

## カテゴリ別の選定基準（補足）

### `new_models`
- フラッグシップ発表（Claude / GPT / Gemini / Llama / Mistral / DeepSeek 等）
- モデルファミリーの大幅アップデート（major version）
- 重要な OSS モデルの公開（Hugging Face Trending 上位）
- マイナーアップデートは `tools_apps` または skip

### `tools_apps`
- 主要 SDK のメジャーリリース（Transformers / LangChain / LlamaIndex / vLLM 等）
- IDE 統合・開発ツール（Claude Code / Cursor / Devin / Copilot）
- 商用エンドユーザーアプリの新機能（ChatGPT / Claude Desktop / Perplexity / NotebookLM）

### `agents`
- 自律エージェントフレームワーク（Anthropic Managed Agents / Workspace Agents / AutoGPT 系）
- ツール呼び出し・MCP（Model Context Protocol）関連
- マルチエージェント協調・Computer Use
- 「人間の介入なしに複数タスクを完遂する」が主題のもの

### `multimodal`
- 画像生成（Midjourney / Stable Diffusion / DALL-E 系）
- 動画生成（Sora / Veo / Runway 等）
- 音声生成（TTS / 音声クローン / リアルタイム会話）
- マルチモーダル統合モデル（テキスト + 画像 + 動画 + 音声）
- 3D 生成（NeRF / Gaussian Splatting 系）

### `research_papers`
- arXiv 公開実装ありの論文（GitHub link 必須）
- 既存ベンチマーク SoTA 更新
- 新ベンチマーク・新評価手法の提案
- 主要ラボの著者（Anthropic / OpenAI / DeepMind / Meta / FAIR / Google Research）
- 解説論考（Latent Space / Import AI / The Batch / Sebastian Raschka）
- サーベイ論文・既存手法の小改良は原則除外（depth は高いが importance が低い）

### `industry_business`
- M&A・大型契約・資金調達（Series 規模で B 以上、または $100M 以上）
- 戦略解説（Stratechery / The Information の深い分析記事）
- パートナーシップ発表（Anthropic-AWS、OpenAI-Microsoft 等）
- 業界マップを変える買収・離合集散

### `regulation_policy`
- EU AI Act / 米国 AI 規制 / 中国 AI 規制
- 安全性研究（red teaming / jailbreak / adversarial attack）
- アライメント論考（LessWrong / Anthropic Safety blog 系）
- AI セキュリティ製品（Llama Guard / LlamaFirewall / Prompt Guard）

### `community_buzz`
- Reddit `top.rss?t=day` のトップ投稿（r/LocalLLaMA / r/MachineLearning / r/singularity / r/ClaudeAI / r/OpenAI）
- HN 1000pt 越えで議論が長い投稿
- X 公開トレンドで大きく言及された事例
- LessWrong AI tag のトップ論考
- **新モデル / 論文 / ツール記事は元カテゴリを優先**、ここには「議論・賛否・実体験投稿」のみ

### `japan`
- 日本企業テックブログ実装記事（PFN / ELYZA / Sakana AI / LINEヤフー / CyberAgent AI Lab / Stockmark / メルカリ / Sansan）
- はてブ ≥30 のバズ記事
- Qiita / Zenn の人気実装記事（likes ≥20）
- 国産モデル・国産ツール
- 日本市場特有の動向

### `china`
- 36Kr AI / 量子位 / 機器之心（中文または英語版 Synced）
- ChinAI Newsletter（Jeff Ding、英語）
- 中国 AI 企業（DeepSeek / Alibaba Qwen / Zhipu / Moonshot Kimi / Baichuan / 01.AI）の発表
- 中国系著者の AI 関連論文（中国本土所属）
- HF daily-papers の中華系研究者論文

## カテゴリ別件数の運用イメージ

実運用での想定（2026-05 時点想定値、Phase A 直後・Phase B 待ち）:

| カテゴリ | Phase A 想定件数 | Phase B 後想定件数 |
|---|---|---|
| new_models | 1-3 | 2-3 |
| tools_apps | 1-3 | 2-3 |
| agents | 0-1 | 1-2 |
| multimodal | 0-1 | 1-2 |
| research_papers | 1-2 | 2-3 |
| industry_business | 1-2 | 1-2 |
| regulation_policy | 0-1 | 0-1 |
| community_buzz | 0 | 1-2 |
| japan | 3-5 | 4-5 |
| china | 0 | 1-2 |
| **合計** | **8-18** | **15-25** |

Phase A は新ソース未追加のため、agents / multimodal / regulation_policy / community_buzz / china は空または 1 件程度。**フロント側は populated.filter で空カテゴリを非表示**にしているため UI 上は問題なし。

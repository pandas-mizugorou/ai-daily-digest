# 「押さえるべき」ペルソナ定義

## 想定読者

このダイジェストの第一読者は**ユーザー本人**。第二に、URL を共有された一般読者。

ユーザー本人の属性:
- 個人開発者 + AI エンジニア + X 発信者
- 副業で AI 関連の発信（@pandas_ai_lab）
- 既存スキル群（`/x-topic-radar`, `/x-post-drafter` 他）で X 用 PDCA を回している
- AI / 生成 AI ツールやモデルを業務でも自分の発信でも使う立場

## 「押さえるべき」と判定する 4 視点

### 1. 同僚と議論できるか（社会的価値）

翌日同僚との雑談・打ち合わせで「あれ知ってる？」と話題に出るレベルか。X で発信したらフォロワーから反応がある話題か。

→ `importance` の判定軸

### 2. 技術内実があるか（深さの価値）

広報・マーケティングの上滑りではなく、**実装レベルの新規性・ベンチマーク・アーキテクチャの工夫**に踏み込んでいるか。

→ `depth` の判定軸

### 3. 自分が試せるか（実用価値）

3 ヶ月以内に手元（API・OSS・ハンズオン）で触れる可能性。「読んだだけで終わる」記事より「触れる」記事を優先。

→ `practicality` の判定軸

### 4. 鮮度（時間価値）

24 時間以内が理想。古い記事を毎日掘り返すサイトには価値がない。

→ `freshness` の判定軸

## 完全除外する記事タイプ

以下は採点する前にフィルタで落とす:

- 株価・買収金額・財務報告のみで技術内実ゼロ
- CEO の人事・退職・組織変更のみ（プロダクトに影響する場合を除く）
- 規制・倫理論争のみで技術的ニュースバリューゼロ
- 公開から 7 日超（**日本企業テックブログは例外的に許容**：投稿頻度が週〜月単位のため）
- ベンダーの顧客導入事例の宣伝記事
- ありふれた "ChatGPT を使ってみた" 系のノウハウ記事（個人ブログ・Qiita で頻発）
- 機械翻訳された他言語記事の二次流通（一次情報を英語ソースで取れば良い）
- 同一ニュースの重複（Step 4 の重複排除を強化）
- **ブクマ < 5 / Qiita likes < 5 の個人記事**（反響なしの個人記事は除外）
- 学習教材・スクール広告・受験・資格・アフィリエイト主体の比較記事

## 優先する記事タイプ

### 英語ソース
- フロンティアラボの**一次情報**（公式ブログ）
- 主要 OSS の major release（Hugging Face / GitHub Trending）
- 公開実装ありの研究論文（arXiv + GitHub link）
- 主要メディアの**深い解説**（The Verge / TechCrunch のディープダイブ）

### 日本語ソース（japan カテゴリ・5 件枠）
- **日本企業テックブログの実装記事**（PFN / ELYZA / Sakana AI / LINEヤフー / CyberAgent AI Lab / Stockmark / メルカリ / Sansan）— 社内導入事例・自社モデル開発・自社サービスの AI 統合
- **はてブ ≥30 のバズ記事** — 日本コミュニティで実際に反響がある証拠
- **Qiita / Zenn の人気実装記事**（likes ≥20）— 具体的なコード・設定・ベンチマークを含むもの
- **国産モデル・国産ツール**（Japanese LLM / Sakana / ELYZA / RWKV-Japanese 等）
- **日本市場特有の動向** — 規制・大手企業の AI 採用・人材市場
- **国内エンジニアの実装知見**（Qiita / Zenn のいいね多い記事）

## ベンダー偏り回避

特定ベンダー（特に Anthropic）に偏らないよう、選定時に同一 source は最大 2 件まで。3 件目以降は除外または `importance -1` で再評価。詳細は `scoring.md` の「ベンダー偏り対策（10 カテゴリ・25 件運用版）」を参照。

## 新カテゴリ別の追加判定（Phase A 以降）

### `agents`（エージェント・自律実行）
- 「自律的に複数ステップを実行する」記述があれば `agents`（`tools_apps` ではなく）
- ツール呼び出し / Computer Use / マルチエージェント協調 / MCP 関連
- 例: Claude Managed Agents / OpenAI Workspace Agents / Devin / AutoGPT 系
- 単に「LLM をツールから呼び出す」だけは `tools_apps` 寄り

### `multimodal`（マルチモーダル・生成）
- 画像 / 動画 / 音声 / 3D 生成が主題
- 統合モデル（テキスト + 画像 + 動画 + 音声）
- 新モデル発表でも生成能力中心なら `new_models` ではなく `multimodal` 優先
- 例: Veo 4 / Sora / Stable Diffusion / TTS モデル

### `regulation_policy`（規制・政策・安全）
- EU AI Act / 米国 AI 規制 / 中国 AI 規制
- 安全性研究（red teaming / jailbreak / adversarial attack）
- アライメント論考（LessWrong / Anthropic Safety blog）
- AI セキュリティ製品（Llama Guard / LlamaFirewall / Prompt Guard）

### `community_buzz`（コミュニティ反響）
- Reddit `top.rss?t=day` のトップ投稿（r/LocalLLaMA / r/MachineLearning / r/ClaudeAI / r/OpenAI / r/singularity）
- HN 1000pt 越えで議論が長い投稿
- X 公開トレンドで大きく言及された事例
- LessWrong AI tag のトップ論考
- **新モデル / 論文 / ツール記事は元カテゴリを優先**、ここには「議論・賛否・実体験投稿」のみ

### `china`（中華圏）
- 36Kr AI / 量子位 (QbitAI) / 機器之心 (Synced) / ChinAI Newsletter
- 中国 AI 企業（DeepSeek / Alibaba Qwen / Zhipu / Moonshot Kimi / Baichuan / 01.AI）の発表
- 中国系著者の AI 関連論文（中国本土所属）
- HF daily-papers の中華系研究者論文
- 中文記事は `lang: "zh"` を付与し、Step 8 で日本語要約と `title_ja` を生成

## ジャンルの方向性

- **興味関心の中心**: LLM / Agent / RAG / Tool use / マルチモーダル / 開発ツール / SDK
- **薄めに扱う**: 画像生成（速報性が低くトレンドが動きにくい）、音声生成、ロボティクス
- **追加で拾う**: AI 開発文化（Claude Code / Cursor / Devin など）、IDE 統合、CI/CD 連携

## 文体・要約の方針

- **タイトル**: 英語ソース (`lang === "en"`) は `title_ja` を表示主体とする (フロントカード上段に **title_ja のみ**を出す)。日本語ソースは原題をそのまま使い、必要に応じて `title_ja` で意訳併記
- **title_ja の品質基準**: 直訳ではなく「一目で内容が分かる意訳」。40-70 字、主役 + アクション + 主要数字、固有名詞は英語表記を保持
- **summary_ja**: 「である調」で 3-5 行。技術的事実を中心に、感想・推測は入れない
- **key_points_ja**: 2-4 個の箇条書き。具体的な数字・名前を含む（"〜が改善" ではなく "〜が 1.4 倍に向上"）
- **headline**（日全体）: その日のトップニュースを 1 文で要約。ユーザーが見出しだけ読んでも価値がわかること

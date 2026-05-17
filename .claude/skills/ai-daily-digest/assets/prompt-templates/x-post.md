# X 投稿文 (x_post) 生成プロンプト（Top Picks のみ）

Top Picks に選定した 5-7 件の各 item に、そのまま X に投稿できる完成文 `x_post`
(string) を 1 つ生成する。`references/x-persona.md` のペルソナに厳密に従う。

## 形式（必ず守る）

```
<投稿本文>

<元記事の url>
```

- 本文 + 空行 1 つ + 元記事 URL（その item の `url` をそのまま）
- 本文は **120 字目安**。X 無料アカウントでも投稿できるよう、weighted カウント
  (全角1.0 / 半角0.5 / URL23固定 / 改行1) で 本文 + 改行 + URL ≈ 140 以内に収める
- 1 文目で記事の核心（フック）。読者が「何が起きたか」を即理解できる
- ペルソナ準拠: 「である」調 / 一人称「私」/ ハッシュタグ 0 / 絵文字 ≤1 / 改行多用しない

## 厳守事項（figure と同じ事実厳格さ）

- **記事内の事実のみ**を書く。誇張・推測・記事に無い数字や主張を足さない
  （x_post は X に直接出るため、事実誤りは致命的）
- 数値・固有名詞は `summary_ja` / `key_points_ja` に出たものだけを使う
- 煽り・過度な比較・未確認の評価をしない
- 日本語で書く（英語の固有名詞・製品名は原表記でよい）

## 出力例（イメージ・形式の参考）

記事「Anthropic が Claude for Legal を正式ローンチ」の場合:

```
Anthropic が Claude for Legal を正式ローンチした。Thomson Reuters・LexisNexis と連携し契約レビューや判例調査を支援するという。主要 LLM がリーガルテックに本格参入する動きであり、士業の業務フローへの影響は大きいと私は考える。

https://www.anthropic.com/news/claude-for-legal
```

## 注意

- `x_post` は **Top Picks に選ばれた item のみ**に付与。それ以外の item には付けない
- 1 item につき 1 案（配列でなく string）
- 既存の `title_ja` / `summary_ja` / `key_points_ja` / `figure` は従来どおり全件生成。
  `x_post` はそれに追加する Top Picks 限定フィールド

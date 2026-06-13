// ============================================================================
// digest-collect.js — ai-daily-digest 収集層 Workflow（Step 2 + Step 3 相当）
// ----------------------------------------------------------------------------
// 既存 Step 2（60-80 ソースをメインの1コンテキストで並列バッチ WebFetch）を、
// バッチ単位の収集サブエージェントに置き換える。各エージェントは
// references/sources.md の該当「## バッチ N」を読み、自分のバッチのソースだけを
// fetch して**中間スキーマの構造化 item のみ**を返す（生 HTML をメイン文脈に溜めない）。
//
// 非破壊原則:
//   - source 一覧・time_window・フォールバックの SSOT は references/sources.md のまま。
//     このスクリプトはバッチの「分担」だけを持ち、URL は一切複製しない。
//   - 返す中間スキーマは SKILL.md Step 3 と同一。Step 4（重複排除）以降は従来どおり
//     メインスレッドが実行する（スコアリング・カテゴリ・グラウンディング・git push 不変）。
//   - 失敗時はメインスレッドが従来の Step 2 並列バッチ取得にフォールバックする。
//
// 起動例:
//   Workflow({ scriptPath: ".../assets/digest-collect.js",
//              args: { skillDir: "C:/Users/ookawa/.claude/skills/ai-daily-digest",
//                      nowIso: "2026-05-30T05:00:00+09:00" } })
// ============================================================================

export const meta = {
  name: 'digest-collect',
  description: 'AI Daily Digest の60-80ソースをバッチ別収集エージェントで取得し構造化itemのみ返す',
  phases: [
    { title: 'Collect', detail: '7バッチを並列に収集（各エージェントが sources.md の担当バッチを fetch+正規化）' },
  ],
}

// args は本来オブジェクトだが、環境によっては JSON 文字列で届くため防御的にパース
let A = args || {}
if (typeof A === 'string') { try { A = JSON.parse(A) } catch (e) { A = {} } }
const SKILL_DIR = A.skillDir || 'C:/Users/ookawa/.claude/skills/ai-daily-digest'
const SOURCES_DOC = A.sourcesDocPath || (SKILL_DIR + '/references/sources.md')
const EXTRACT_TMPL = SKILL_DIR + '/assets/prompt-templates/extract-article.md'
const NOW_ISO = A.nowIso || '(現在時刻はメインスレッドから未指定。published_at はソース表記のまま残す)'

// バッチの「分担」のみ定義。実際の URL/プロンプト/フォールバックは sources.md が SSOT。
const BATCHES = [
  { key: 'batch1',  heading: '## バッチ 1: 公式ブログ',              source_type: 'official' },
  { key: 'batch2',  heading: '## バッチ 2: アグリゲータ・論文・リポジトリ', source_type: 'aggregator/academic' },
  { key: 'batch3a', heading: '## バッチ 3-A: 日本企業テックブログ',    source_type: 'japan_corp' },
  { key: 'batch3b', heading: '## バッチ 3-B: 日本語コミュニティ・反響軸', source_type: 'japan_community' },
  { key: 'batch4',  heading: '## バッチ 4: 海外解説メディア',          source_type: 'media' },
  { key: 'batch5',  heading: '## バッチ 5: 学術プラットフォーム',      source_type: 'academic' },
  { key: 'batch6',  heading: '## バッチ 6: コミュニティ議論層',        source_type: 'community' },
  { key: 'batch7',  heading: '## バッチ 7: 中華圏',                    source_type: 'china' },
]

const COLLECT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true, // reaction_signal の形がソース別に異なるため許容
        properties: {
          id: { type: 'string' },
          source: { type: 'string' },
          source_label: { type: 'string' },
          source_type: { type: 'string', enum: ['official', 'media', 'academic', 'community', 'china', 'japan_corp', 'japan_community', 'aggregator'] },
          title: { type: 'string' },
          url: { type: 'string' },
          published_at: { type: 'string', description: '分かれば ISO8601。不明ならソース表記のまま' },
          summary_en: { type: 'string' },
          raw_excerpt: { type: 'string', description: '本文の短い抜粋（長文の生 HTML は入れない）' },
          lang: { type: 'string', enum: ['en', 'ja', 'zh', 'other'] },
          reaction_signal: { type: ['object', 'null'], description: 'はてブ/Qiita/Zenn/HN/Reddit/SemanticScholar の反響シグナル。無ければ null' },
          time_window_hours: { type: 'number' },
        },
        required: ['id', 'source', 'source_type', 'title', 'url', 'lang'],
      },
    },
    skipped_sources: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { source: { type: 'string' }, reason: { type: 'string' } },
        required: ['source', 'reason'],
      },
    },
  },
  required: ['items', 'skipped_sources'],
}

function collectPrompt(b) {
  return [
    `あなたは AI ニュース収集エージェント。担当は references/sources.md の「${b.heading}」のバッチのみ。`,
    '',
    '## 手順',
    `1. Read で ${SOURCES_DOC} を開き、「${b.heading}」セクション（次の "## バッチ" 見出しの直前まで）に列挙された全ソースを把握する。`,
    `2. そのバッチの各ソースを、表に書かれた URL・プロンプト・取得方法（WebFetch / WebSearch / API）で取得する。`,
    `3. ソースが失敗したら、表の「フォールバック」列の手順を実行する。それでも取れなければ skipped_sources に {source, reason} を記録する。`,
    `4. 記事抽出のプロンプトテンプレートは ${EXTRACT_TMPL} を参照（必要なら Read）。`,
    '5. 取得した各記事を中間スキーマ item にマッピングして返す:',
    '   - source_type は sources.md の表で定義された値を付与（このバッチの既定: ' + b.source_type + '）',
    '   - time_window_hours はソース定義から継承（sources.md の「ソース別動的時間窓」表）',
    '   - 反響シグナル（はてブ users / Qiita likes,stocks / Zenn liked / HN points / Reddit top / Semantic Scholar citation_count）が取れたら reaction_signal に入れる',
    '   - title_ja は生成しない（後段で生成）。raw_excerpt は本文の短い抜粋のみ（長文 HTML は入れない）',
    `   - published_at は最終スキーマに合わせ YYYY-MM-DD 形式で返す（ISO タイムスタンプは日付部分のみに切り詰め、不明なら空文字）。現在時刻の基準は ${NOW_ISO}`,
    '   - lang は en/ja/zh/other',
    '   - id は "<source>-<短いslug>" で一意化',
    '',
    '出力は指定スキーマに厳密に従う。**生 HTML や長文本文は返さない**（構造化 item と短い抜粋のみ）。',
  ].join('\n')
}

phase('Collect')
const results = (await parallel(
  BATCHES.map(b => () =>
    agent(collectPrompt(b), { label: `collect:${b.key}`, phase: 'Collect', schema: COLLECT_SCHEMA })
      .then(r => ({ ...r, _batch: b.key }))
  )
)).filter(Boolean)

const items = results.flatMap(r => Array.isArray(r.items) ? r.items : [])
const skipped = results.flatMap(r => Array.isArray(r.skipped_sources) ? r.skipped_sources : [])

log(`Collect 完了: ${items.length} items / skipped ${skipped.length} / 成功バッチ ${results.length}/${BATCHES.length}`)

return {
  ok: items.length > 0,
  items,
  skipped_sources: skipped,
  batchesSucceeded: results.map(r => r._batch),
  itemCount: items.length,
}

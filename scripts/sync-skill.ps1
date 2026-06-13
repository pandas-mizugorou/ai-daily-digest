# sync-skill.ps1 — スキル定義の SSOT 同期 (repo → ローカル ~/.claude/skills/)
#
# ■ 単一の正本 (SSOT) はこのリポジトリの `.claude/skills/ai-daily-digest/`。
#   - GitHub Actions (daily-digest.yml) はリポジトリ同梱のこのコピーを読む。
#   - 手動実行 (`/ai-daily-digest`) はローカル `~/.claude/skills/ai-daily-digest/` を読む。
#   2 経路で別々のコピーを持つため放置するとドリフトする (実際に 2026-06 時点で
#   SKILL.md / scoring.md / summarize-ja.md が双方向に食い違っていた)。本スクリプトは
#   リポジトリ側を正本として **repo → ローカルへ一方向ミラー** し、食い違いを解消する。
#
# ■ 運用ルール:
#   スキル (SKILL.md / references/ / assets/) を編集するときは **必ずリポジトリ側を編集**し、
#   その後このスクリプトを実行してローカルへ反映する。ローカル側を直接編集しないこと
#   (次回 sync で上書きされる)。
#
# ■ digest-collect.js について:
#   `assets/digest-collect.js` は手動実行時に Workflow ツールでバッチ別収集を行うための
#   ローカル専用スクリプト (CI は Workflow ツールを持たないため使わない)。SSOT 化のため
#   リポジトリにも追跡しているので、本ミラーで repo→ローカル両方に存在する。
#
# 使い方:
#   pwsh -File scripts/sync-skill.ps1            # 実行 (リポジトリルートから)
#   pwsh -File scripts/sync-skill.ps1 -WhatIf    # 差分プレビュー (コピーせず一覧のみ)

[CmdletBinding(SupportsShouldProcess = $true)]
param()

$ErrorActionPreference = 'Stop'

# リポジトリルート (このスクリプトの 1 つ上) を基準に解決
$repoRoot = Split-Path -Parent $PSScriptRoot
$src = Join-Path $repoRoot '.claude\skills\ai-daily-digest'
$dst = Join-Path $env:USERPROFILE '.claude\skills\ai-daily-digest'

if (-not (Test-Path $src)) {
    Write-Error "正本が見つかりません: $src"
    exit 1
}

Write-Host "SSOT スキル同期 (repo → ローカル)" -ForegroundColor Cyan
Write-Host "  src: $src"
Write-Host "  dst: $dst"
Write-Host ""

if ($PSCmdlet.ShouldProcess($dst, "robocopy /MIR (repo を正本にミラー)")) {
    # /MIR = ミラー (dst 側の余分なファイルは削除して src と一致させる)。
    # digest-collect.js は src にも含むため削除されない。
    # /XO は使わない (タイムスタンプに関係なく常に src で上書き = 正本を強制)。
    # /NFL /NDL = ファイル/ディレクトリ列挙を抑制、/NJH /NJS = ヘッダ/サマリ抑制。
    & robocopy $src $dst /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
    $rc = $LASTEXITCODE
    # robocopy の終了コード: 0-7 は成功 (0=変更なし, 1=コピー, 3=コピー+削除 等)。8 以上が異常。
    if ($rc -ge 8) {
        Write-Error "robocopy が異常終了しました (exit $rc)。"
        exit $rc
    }
    Write-Host "同期完了 (robocopy exit $rc / 0-7 は正常)。" -ForegroundColor Green
}
else {
    # -WhatIf: 差分を列挙のみ (/L = list only)
    & robocopy $src $dst /MIR /L /NJH /NJS /NP
    Write-Host "（-WhatIf: 上記は実行されません。実反映は -WhatIf なしで）" -ForegroundColor Yellow
}

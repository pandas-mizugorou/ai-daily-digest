# 定期実行インフラと運用（ai-daily-digest）

SKILL.md「トリガー」節から外出しした定期実行インフラの詳細（2026-07 時点）。スケジュール変更・発火しない等の障害調査時に読む。

## 主経路: Cloudflare Worker Cron

- **定時自動実行（主経路）**: Cloudflare Worker `infra/digest-trigger-worker`（ai-digest-trigger）の Worker Cron が `30 18 * * *` UTC（= 03:30 JST）に発火し、GitHub API の workflow_dispatch で `daily-digest.yml` を即時起動する（GitHub Actions の schedule は実発火が +3〜15h 遅延した実測があるため、5:00 JST 配信を確定させる外部トリガー。詳細は Worker の wrangler.toml 冒頭コメント）

## 保険経路: GitHub Actions schedule

- **保険（フォールバック）**: GitHub Actions のスケジュール (`.github/workflows/daily-digest.yml`) cron 3 本 `7/27/47 15 * * *` (UTC 15:07/15:27/15:47 = JST 00:07/00:27/00:47)。Worker 経由と多重発火しても冪等ガードで最初の 1 本のみ生成

## トリガー多重化の設計

- Worker Cron（1 本・確実な定時）＋ Actions cron（3 本・遅延前提の保険）の二重化で「5:00 JST までに必ず 1 回生成」を担保する
- 多重発火は冪等ガード（同一ターゲット日の生成済み判定）で吸収し、最初の 1 本のみが実生成する

## 障害時の切り分け

1. サイトが朝更新されていない → GitHub Actions の実行履歴（daily-digest.yml）を確認
2. workflow_dispatch の起動記録が無い → Cloudflare Worker（ai-digest-trigger）の Cron 実行ログを確認（wrangler / ダッシュボード）
3. Actions は走ったが失敗 → 実行ログの Step（collect / 生成 / push）で切り分け。`data/_errors/<date>.json` の有無も確認
4. 手動リカバリ: ローカルで `/ai-daily-digest --date <YYYY-MM-DD>` を実行（過去日の再生成）

## 変更履歴（廃止済み仕様の記録）

- **2026-07-06: 「90 日ロールオーバー → `data/archive/`」を廃止**。`data/index.json` の `entries` は全期間保持（トリムしない）。エントリは 1 件 200B 程度で年間 70KB 台にしかならず、分割はナビ欠落・検索不整合のリスクだけが残るため

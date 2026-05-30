// === 図解スキーマ正規化（共有モジュール） ===
// レンダラ (assets/figure.js) と CI スクリプト (scripts/normalize-digest.mjs /
// scripts/validate-digest.mjs) で **同一の正規化ロジック** を使うための単一の真実。
// （かつて生成側フラットスキーマ↔レンダラ期待スキーマの不一致で図が空になったため、
//  ロジックの二重実装＝再ドリフトを避ける目的でここに集約する）
//
// 生成パイプラインが出力しがちな「フラットな簡易スキーマ」と、正準スキーマ
// ({type, data:{...}}) の双方を受け付け、各 renderer / 契約が期待する data 形に寄せる。
//   フラット例 (comparison): {type, title, left_label, right_label, metrics:[{name,left,right,delta}]}
//   → 正準: {headline, before:{label}, after:{label},
//            metrics:[{label,before,after,before_pct,after_pct,delta,delta_tone}]}
// data ラッパー欠落 / 旧フィールド名 / 正規化バー幅 (_pct) 不在を吸収する。
//
// 注意: alt / narrative / impact など「記事の意味」に依存する欠落は正規化では補えない
//       （創作になるため）。それらは生成側で埋めるべきで、validate-digest.mjs が警告する。

export function parseNum(s) {
  if (s == null) return null;
  const m = String(s).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

// delta テキストから tone を推定（赤の誤発火を避け、確信が持てないものは中立に倒す）
export function toneFromDelta(delta) {
  const s = String(delta || "").trim();
  if (!s) return "default";
  if (/(±0|±\s*0|据え置き|横ばい|変わらず|same|unchanged)/i.test(s)) return "info";
  if (/(^\+|増|向上|改善|新記録|更新|up\b|↑|新|x$|倍)/i.test(s)) return "success";
  return "default"; // 「-67%」など"良い減少"もあるため負号だけで danger にはしない
}

function normalizeComparison(f) {
  const d = f.data;
  if (d && (d.before || d.after || (Array.isArray(d.metrics) && d.metrics.some((m) => m && (m.before != null || m.before_pct != null))))) return d;
  const rawMetrics = Array.isArray(f.metrics) ? f.metrics : (d && d.metrics) || [];
  const metrics = rawMetrics.map((m) => {
    const before = m.before ?? m.left;
    const after = m.after ?? m.right;
    const bn = parseNum(before), an = parseNum(after);
    let before_pct = m.before_pct ?? null, after_pct = m.after_pct ?? null;
    if (before_pct == null && after_pct == null) {
      if (bn != null && an != null) {
        const mx = Math.max(Math.abs(bn), Math.abs(an)) || 1;
        before_pct = Math.round((Math.abs(bn) / mx) * 100);
        after_pct = Math.round((Math.abs(an) / mx) * 100);
      } else if (an != null) {
        before_pct = 0; after_pct = 100; // 新規登場（before が「—」等）: 0 → 満杯
      } else if (bn != null) {
        before_pct = 100; after_pct = 0; // 廃止・消滅: 満杯 → 0
      } else {
        before_pct = 50; after_pct = 50; // 定性的（両側とも数値なし）: 等長バー + delta テキストで示す
      }
    }
    return {
      icon: m.icon,
      label: m.label ?? m.name ?? "",
      before: before ?? "",
      after: after ?? "",
      before_pct, after_pct,
      delta: m.delta ?? "",
      delta_tone: m.delta_tone ?? toneFromDelta(m.delta),
      note: m.note,
    };
  });
  return {
    headline: (d && d.headline) ?? f.headline ?? f.title ?? "",
    before: (d && d.before) ?? { label: f.left_label ?? "Before" },
    after: (d && d.after) ?? { label: f.right_label ?? "After" },
    metrics,
    narrative: (d && d.narrative) ?? f.narrative,
    impact: (d && d.impact) ?? f.impact,
  };
}

function normalizeMetricBars(f) {
  const d = f.data;
  if (d && Array.isArray(d.bars) && d.bars.some((b) => b && b.pct != null)) return d;
  const rawBars = Array.isArray(f.bars) ? f.bars : (d && d.bars) || [];
  const nums = rawBars.map((b) => parseNum(b.value)).filter((v) => v != null);
  const mx = nums.length ? Math.max(...nums) : 100;
  const allPct = nums.length > 0 && nums.every((v) => v >= 0 && v <= 100);
  const norm = (v) => (v == null ? 0 : Math.round(Math.min(100, (Math.abs(v) / (mx || 1)) * 100)));
  const bars = rawBars.map((b) => {
    const v = parseNum(b.value);
    return {
      icon: b.icon,
      label: b.label ?? b.name ?? "",
      value: b.value != null ? String(b.value) : "",
      pct: b.pct != null ? b.pct : (allPct ? (v ?? 0) : norm(v)),
      baseline_pct: b.baseline_pct,
      baseline_label: b.baseline_label,
      delta: b.delta,
      tone: b.tone || "primary",
      note: b.note,
    };
  });
  // threshold（実用水準などの基準）を全バー共通の baseline 線に反映
  if (f.threshold && f.threshold.value != null) {
    const bp = allPct ? f.threshold.value : norm(parseNum(f.threshold.value));
    bars.forEach((b) => {
      if (b.baseline_pct == null) {
        b.baseline_pct = bp;
        b.baseline_label = b.baseline_label || f.threshold.label || "基準";
      }
    });
  }
  return {
    headline: (d && d.headline) ?? f.headline ?? f.title ?? "",
    scale: (d && d.scale) ?? { unit: f.unit },
    bars,
    narrative: (d && d.narrative) ?? f.narrative,
    impact: (d && d.impact) ?? f.impact,
  };
}

function normalizeTimeline(f, refNow) {
  const d = f.data;
  if (d && Array.isArray(d.events) && d.events.some((e) => e && e.when != null)) return d;
  const raw = Array.isArray(f.events) ? f.events : (d && d.events) || [];
  const now = refNow != null ? refNow : Date.now();
  const parsed = raw.map((e) => {
    const t = Date.parse(String(e.date || e.when || "").replace(/\//g, "-"));
    return { e, t: isNaN(t) ? null : t };
  });
  // 「今」= 基準日以前で最も新しいイベント
  let nowIdx = -1, latestPast = -Infinity;
  parsed.forEach((p, i) => {
    if (p.t != null && p.t <= now && p.t > latestPast) { latestPast = p.t; nowIdx = i; }
  });
  if (nowIdx === -1 && parsed.length) nowIdx = parsed.length - 1; // 日付不明なら末尾を now
  const events = parsed.map((p, i) => {
    const e = p.e;
    let status = e.status;
    if (!status) {
      if (p.t != null && p.t > now) status = "upcoming";
      else if (i === nowIdx) status = "now";
      else status = "past";
    }
    return {
      when: e.when ?? e.date ?? "",
      label: e.label ?? "",
      description: e.description ?? e.value ?? "",
      status,
      tone: e.tone,
    };
  });
  return {
    headline: (d && d.headline) ?? f.headline ?? f.title ?? "",
    events,
    narrative: (d && d.narrative) ?? f.narrative,
    impact: (d && d.impact) ?? f.impact,
  };
}

function normalizeSummaryCard(f) {
  const d = f.data;
  if (d && (d.tldr != null || (Array.isArray(d.points) && d.points.some((p) => p && "value" in p)))) return d;
  const rawPts = Array.isArray(f.points) ? f.points : (d && d.points) || [];
  const points = rawPts.map((p) => ({
    icon: p.icon,
    label: p.label ?? "",
    // フラット schema の point は {label, description} で description が実質「値」。value 欄に出す。
    value: p.value ?? p.description ?? "",
    note: p.note,
    description: p.value != null ? p.description : "",
    tone: p.tone,
  }));
  return {
    headline: (d && d.headline) ?? f.headline ?? f.title ?? "",
    tldr: (d && d.tldr) ?? f.tldr ?? "",
    points,
    context: (d && d.context) ?? f.context,
    impact: (d && d.impact) ?? f.impact,
  };
}

const FIGURE_NORMALIZERS = {
  "comparison": normalizeComparison,
  "metric-bars": normalizeMetricBars,
  "timeline": normalizeTimeline,
  "summary-card": normalizeSummaryCard,
};

export const FIGURE_TYPES = Object.keys(FIGURE_NORMALIZERS);

// 図解の data 部だけを正準化して返す（レンダラ用）。
// refNow: timeline の status 判定に使う基準時刻 (ms)。省略時は現在時刻。
export function normalizeFigureData(figure, refNow) {
  if (!figure || !figure.type) return {};
  const n = FIGURE_NORMALIZERS[figure.type];
  return n ? n(figure, refNow) : (figure.data || {});
}

// 図解オブジェクト全体を正準形 {type, caption?, alt?, data:{...}} に整える（ディスク保存用）。
// alt / caption は補えないので既存値があれば保持する（無ければ undefined のまま → validate が警告）。
export function normalizeFigure(figure, refNow) {
  if (!figure || !figure.type) return figure;
  const out = { type: figure.type, data: normalizeFigureData(figure, refNow) };
  if (figure.caption != null) out.caption = figure.caption;
  if (figure.alt != null) out.alt = figure.alt;
  return out;
}

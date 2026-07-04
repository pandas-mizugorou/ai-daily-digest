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

// metrics が「そのまま描ける」形か (全 metric が数値バー幅 before_pct/after_pct を 0-100 で持つ)。
// 1 つでも欠けると renderer が 50/50 フォールバックになるため、未正準として作り直す。
function comparisonMetricsRenderable(metrics) {
  const inRange = (v) => typeof v === "number" && isFinite(v) && v >= 0 && v <= 100;
  return Array.isArray(metrics) && metrics.length > 0 && metrics.every((m) => m && inRange(m.before_pct) && inRange(m.after_pct));
}

function normalizeComparison(f) {
  const d = f.data;
  // 早期リターンは「before/after ラベル」だけでなく「metrics まで描画可能」なときのみ。
  // (ラベルはあるが _pct 欠落 → renderer 50/50 になるケースを作り直して明示的に幅を入れる。)
  if (d && (d.before || d.after) && comparisonMetricsRenderable(d.metrics)) return d;
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

// 最初の非空白文字列を返す (?? は "" を素通しするため、空文字プレースホルダを
// 次の候補へフォールバックさせたいときに使う)。
function firstNonBlank(...vals) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim() !== "") return v;
    if (typeof v === "number" && isFinite(v)) return String(v);
  }
  return "";
}

// timeline イベントが正準か (レンダラがそのまま描ける形か)。
// when が非空文字列 かつ status が既定 3 値 のときのみ正準とみなす。
function timelineEventsCanonical(events) {
  const ok = new Set(["past", "now", "upcoming"]);
  return Array.isArray(events) && events.length > 0 && events.every(
    (e) => e && typeof e.when === "string" && e.when.trim() !== "" && ok.has(e.status),
  );
}

function normalizeTimeline(f, refNow) {
  const d = f.data;
  // 早期リターンは「全イベントが正準 (非空 when + 正しい status)」のときだけ。
  // 一部でも when:"" のプレースホルダ (time が別キーの手順型など) を含むなら作り直す。
  if (d && timelineEventsCanonical(d.events)) return d;
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
      // 生成側が when/date/time いずれのキーで時点を返しても拾う
      // (time は "Step 1" のような手順ラベル型タイムラインで使われる)。
      // 空文字プレースホルダは次候補へフォールバック (?? では素通ししてしまうため)。
      when: firstNonBlank(e.when, e.date, e.time),
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

// summary-card の 1 point を正準オブジェクト {label,value,...} に寄せる。
// 受け付ける入力: (a) 文字列 (生成が箇条書き文字列だけ返した場合) →
//   その文字列を value に載せる、(b) {label, description} だけのフラット obj →
//   description を value に、(c) 既に正準な {label, value, ...} obj → そのまま整形。
// レンダラ (figure.js) は p.label / p.value を参照するため、これらが欠けると
// 「空の箇条書き」になって図が壊れる。ここで必ず value を確保する。
function normalizePoint(p) {
  if (typeof p === "string") return { label: "", value: p.trim(), tone: undefined };
  // 数値・真偽値などプリミティブは文字列化して value に載せる (取りこぼし防止)。
  if (p == null || typeof p !== "object") return { label: "", value: p == null ? "" : String(p) };
  return {
    icon: p.icon,
    label: p.label ?? "",
    // フラット schema の point は {label, description} で description が実質「値」。value 欄に出す。
    value: p.value ?? p.description ?? "",
    note: p.note,
    description: p.value != null ? p.description : "",
    tone: p.tone,
  };
}

// point が既に正準か (レンダラがそのまま描ける形か) を判定。
// 「文字列 point が 1 つでもある」または「value も description も持たない obj がある」なら未正準。
function pointsAreCanonical(points) {
  return Array.isArray(points) && points.length > 0 && points.every(
    (p) => p && typeof p === "object" && (typeof p.value === "string" || typeof p.description === "string"),
  );
}

function normalizeSummaryCard(f) {
  const d = f.data;
  // 早期リターンは「points まで正準」な場合のみ。tldr の有無で判定してはいけない
  // (tldr があっても points が文字列配列のことがあり、その場合レンダラで空箇条書きになる)。
  if (d && d.tldr != null && pointsAreCanonical(d.points)) return d;
  const rawPts = Array.isArray(f.points) ? f.points : (d && d.points) || [];
  const points = rawPts.map(normalizePoint);
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

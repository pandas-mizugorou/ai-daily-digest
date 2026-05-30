// === Figure rendering (共通モジュール) ===
// 日次 (app.js) / 週次 (app-weekly.js) / 検索 (app-search.js) で共有。
// 元は assets/app.js にあったものをロジック無改変で移設し renderFigure を export。

const FIGURE_TONES = ["default", "primary", "success", "warning", "danger", "info"];

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function safeTone(t) {
  return FIGURE_TONES.includes(t) ? t : "default";
}

// delta の符号方向を矢印グリフでも示す（色だけに頼らない＝色覚多様性に強い）。
// success=改善↑ / danger=悪化↓ / warning=横ばい→ / それ以外は無し
function deltaGlyph(tone) {
  return tone === "success" ? "↑" : tone === "danger" ? "↓" : tone === "warning" ? "→" : "";
}

function renderSummaryCard(d) {
  const wrap = document.createElement("div");
  wrap.className = "fig-summary";

  const headline = (d.headline ?? "").trim();
  if (headline) {
    const h = document.createElement("div");
    h.className = "fig-summary-headline";
    h.textContent = headline;
    wrap.appendChild(h);
  }

  const tldr = (d.tldr ?? "").trim();
  if (tldr) {
    const t = document.createElement("div");
    t.className = "fig-summary-tldr";
    t.innerHTML = `<span class="fig-section-label">TL;DR</span><p class="fig-tldr-text">${escapeHtml(tldr)}</p>`;
    wrap.appendChild(t);
  }

  const points = Array.isArray(d.points) ? d.points.slice(0, 6) : [];
  if (points.length) {
    const detailsWrap = document.createElement("div");
    detailsWrap.className = "fig-summary-details";
    const lbl = document.createElement("span");
    lbl.className = "fig-section-label";
    lbl.textContent = "詳細";
    detailsWrap.appendChild(lbl);

    const list = document.createElement("ul");
    list.className = "fig-summary-points";
    for (const p of points) {
      const li = document.createElement("li");
      li.className = `fig-summary-point fig-tone-${safeTone(p.tone)}`;
      const icon = p.icon
        ? `<span class="fig-point-icon" aria-hidden="true">${escapeHtml(p.icon)}</span>`
        : `<span class="fig-point-icon fig-point-icon-empty" aria-hidden="true"></span>`;
      const note = p.note ? `<span class="fig-point-note">${escapeHtml(p.note)}</span>` : "";
      const description = p.description ? `<p class="fig-point-description">${escapeHtml(p.description)}</p>` : "";
      li.innerHTML = `
        ${icon}
        <div class="fig-point-body">
          <div class="fig-point-headline">
            <span class="fig-point-label">${escapeHtml(p.label ?? "")}</span>
            <span class="fig-point-value">${escapeHtml(p.value ?? "")}</span>
          </div>
          ${note}
          ${description}
        </div>`;
      list.appendChild(li);
    }
    detailsWrap.appendChild(list);
    wrap.appendChild(detailsWrap);
  }

  const context = (d.context ?? "").trim();
  if (context) {
    const c = document.createElement("div");
    c.className = "fig-summary-context";
    c.innerHTML = `<span class="fig-section-label">背景</span><p class="fig-context-text">${escapeHtml(context)}</p>`;
    wrap.appendChild(c);
  }

  const impact = (d.impact ?? "").trim();
  if (impact) {
    const im = document.createElement("div");
    im.className = "fig-summary-impact";
    im.innerHTML = `<span class="fig-section-label fig-section-label-impact">影響</span><p class="fig-impact-text">${escapeHtml(impact)}</p>`;
    wrap.appendChild(im);
  }

  return wrap;
}

function renderTextBlock(text, label, blockClass, labelClass = "fig-section-label") {
  if (!text || !text.trim()) return null;
  const wrap = document.createElement("div");
  wrap.className = blockClass;
  if (label) {
    const lbl = document.createElement("span");
    lbl.className = labelClass;
    lbl.textContent = label;
    wrap.appendChild(lbl);
  }
  const p = document.createElement("p");
  p.className = `${blockClass}-text`;
  p.textContent = text.trim();
  wrap.appendChild(p);
  return wrap;
}

function clampPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function renderComparison(d) {
  const wrap = document.createElement("div");
  wrap.className = "fig-cmp";

  const headline = (d.headline ?? "").trim();
  if (headline) {
    const h = document.createElement("div");
    h.className = "fig-cmp-headline";
    h.textContent = headline;
    wrap.appendChild(h);
  }

  const before = d.before || {};
  const after = d.after || {};
  const legend = document.createElement("div");
  legend.className = "fig-cmp-legend";
  legend.innerHTML = `
    <div class="fig-cmp-side fig-cmp-side-before">
      <span class="fig-cmp-side-tag">Before</span>
      <span class="fig-cmp-side-name">${escapeHtml(before.label || "")}</span>
      ${before.sublabel ? `<span class="fig-cmp-side-sub">${escapeHtml(before.sublabel)}</span>` : ""}
    </div>
    <span class="fig-cmp-arrow" aria-hidden="true">→</span>
    <div class="fig-cmp-side fig-cmp-side-after">
      <span class="fig-cmp-side-tag">After</span>
      <span class="fig-cmp-side-name">${escapeHtml(after.label || "")}</span>
      ${after.sublabel ? `<span class="fig-cmp-side-sub">${escapeHtml(after.sublabel)}</span>` : ""}
    </div>`;
  wrap.appendChild(legend);

  const metrics = Array.isArray(d.metrics) ? d.metrics.slice(0, 6) : [];
  if (metrics.length) {
    const list = document.createElement("ul");
    list.className = "fig-cmp-metrics";
    for (const m of metrics) {
      const li = document.createElement("li");
      const tone = safeTone(m.delta_tone);
      li.className = `fig-cmp-metric fig-tone-${tone}`;
      const beforePct = clampPct(m.before_pct);
      const afterPct = clampPct(m.after_pct);
      const beforeBar = beforePct == null ? 50 : beforePct;
      const afterBar = afterPct == null ? 50 : afterPct;
      const icon = m.icon ? `<span class="fig-cmp-icon" aria-hidden="true">${escapeHtml(m.icon)}</span>` : "";
      const cmpGlyph = deltaGlyph(tone);
      const delta = m.delta
        ? `<span class="fig-cmp-delta">${cmpGlyph ? `<span class="fig-delta-arrow" aria-hidden="true">${cmpGlyph}</span>` : ""}${escapeHtml(m.delta)}</span>`
        : "";
      const note = m.note
        ? `<div class="fig-cmp-note">${escapeHtml(m.note)}</div>`
        : "";
      li.innerHTML = `
        <div class="fig-cmp-head">
          ${icon}
          <span class="fig-cmp-label">${escapeHtml(m.label || "")}</span>
          ${delta}
        </div>
        <div class="fig-cmp-bar-row fig-cmp-bar-row-before">
          <span class="fig-cmp-bar-name">${escapeHtml(before.label || "Before")}</span>
          <div class="fig-cmp-bar"><span class="fig-cmp-bar-fill fig-cmp-bar-fill-before" style="width:${beforeBar}%"></span></div>
          <span class="fig-cmp-bar-value">${escapeHtml(m.before || "")}</span>
        </div>
        <div class="fig-cmp-bar-row fig-cmp-bar-row-after">
          <span class="fig-cmp-bar-name">${escapeHtml(after.label || "After")}</span>
          <div class="fig-cmp-bar"><span class="fig-cmp-bar-fill fig-cmp-bar-fill-after" style="width:${afterBar}%"></span></div>
          <span class="fig-cmp-bar-value">${escapeHtml(m.after || "")}</span>
        </div>
        ${note}`;
      list.appendChild(li);
    }
    wrap.appendChild(list);
  }

  const narrative = renderTextBlock(d.narrative, "背景", "fig-narrative");
  if (narrative) wrap.appendChild(narrative);
  const impact = renderTextBlock(d.impact, "影響", "fig-impact", "fig-section-label fig-section-label-impact");
  if (impact) wrap.appendChild(impact);

  return wrap;
}

function renderMetricBars(d) {
  const wrap = document.createElement("div");
  wrap.className = "fig-mb";

  const headline = (d.headline ?? "").trim();
  if (headline) {
    const h = document.createElement("div");
    h.className = "fig-mb-headline";
    h.textContent = headline;
    wrap.appendChild(h);
  }

  const scale = d.scale && (d.scale.max_label || d.scale.unit);
  if (scale) {
    const s = document.createElement("div");
    s.className = "fig-mb-scale";
    const parts = [];
    if (d.scale.max_label) parts.push(`スケール: ${d.scale.max_label}`);
    if (d.scale.unit) parts.push(`単位: ${d.scale.unit}`);
    s.textContent = parts.join(" ・ ");
    wrap.appendChild(s);
  }

  const bars = Array.isArray(d.bars) ? d.bars.slice(0, 7) : [];
  if (bars.length) {
    const list = document.createElement("ul");
    list.className = "fig-mb-bars";
    for (const b of bars) {
      const li = document.createElement("li");
      const tone = safeTone(b.tone || "primary");
      li.className = `fig-mb-bar fig-tone-${tone}`;
      const pct = clampPct(b.pct) ?? 0;
      const basePct = clampPct(b.baseline_pct);
      const icon = b.icon ? `<span class="fig-mb-icon" aria-hidden="true">${escapeHtml(b.icon)}</span>` : "";
      const baseline = basePct != null
        ? `<span class="fig-mb-baseline" style="left:${basePct}%" aria-hidden="true"></span>
           <span class="fig-mb-baseline-tag" style="left:${basePct}%" title="${escapeHtml(b.baseline_label || "比較基準")}: ${basePct}">${escapeHtml(b.baseline_label || "基準")}</span>`
        : "";
      const mbGlyph = deltaGlyph(tone);
      const delta = b.delta ? `<span class="fig-mb-delta">${mbGlyph ? `<span class="fig-delta-arrow" aria-hidden="true">${mbGlyph}</span>` : ""}${escapeHtml(b.delta)}</span>` : "";
      const note = b.note ? `<span class="fig-mb-note">${escapeHtml(b.note)}</span>` : "";
      li.innerHTML = `
        <div class="fig-mb-head">
          ${icon}
          <span class="fig-mb-label">${escapeHtml(b.label || "")}</span>
          <span class="fig-mb-value">${escapeHtml(b.value || "")}</span>
        </div>
        <div class="fig-mb-track">
          <span class="fig-mb-fill" style="width:${pct}%"></span>
          ${baseline}
        </div>
        ${delta || note ? `<div class="fig-mb-meta">${delta}${note}</div>` : ""}`;
      list.appendChild(li);
    }
    wrap.appendChild(list);
  }

  const narrative = renderTextBlock(d.narrative, "背景", "fig-narrative");
  if (narrative) wrap.appendChild(narrative);
  const impact = renderTextBlock(d.impact, "影響", "fig-impact", "fig-section-label fig-section-label-impact");
  if (impact) wrap.appendChild(impact);

  return wrap;
}

function renderTimeline(d) {
  const wrap = document.createElement("div");
  wrap.className = "fig-tl";

  const headline = (d.headline ?? "").trim();
  if (headline) {
    const h = document.createElement("div");
    h.className = "fig-tl-headline";
    h.textContent = headline;
    wrap.appendChild(h);
  }

  const events = Array.isArray(d.events) ? d.events.slice(0, 7) : [];
  if (events.length) {
    const list = document.createElement("ol");
    list.className = "fig-tl-events";
    for (const ev of events) {
      const li = document.createElement("li");
      const status = ["past", "now", "upcoming"].includes(ev.status) ? ev.status : "past";
      const tone = safeTone(ev.tone || (status === "now" ? "primary" : "default"));
      li.className = `fig-tl-event fig-tl-status-${status} fig-tone-${tone}`;
      const desc = ev.description
        ? `<p class="fig-tl-desc">${escapeHtml(ev.description)}</p>`
        : "";
      li.innerHTML = `
        <span class="fig-tl-marker" aria-hidden="true"></span>
        <div class="fig-tl-body">
          <div class="fig-tl-meta">
            <span class="fig-tl-when">${escapeHtml(ev.when || "")}</span>
            ${status === "now" ? '<span class="fig-tl-now-badge">本日</span>' : ""}
          </div>
          <div class="fig-tl-label">${escapeHtml(ev.label || "")}</div>
          ${desc}
        </div>`;
      list.appendChild(li);
    }
    wrap.appendChild(list);
  }

  const narrative = renderTextBlock(d.narrative, "背景", "fig-narrative");
  if (narrative) wrap.appendChild(narrative);
  const impact = renderTextBlock(d.impact, "影響", "fig-impact", "fig-section-label fig-section-label-impact");
  if (impact) wrap.appendChild(impact);

  return wrap;
}

const FIGURE_RENDERERS = {
  "summary-card": renderSummaryCard,
  "comparison": renderComparison,
  "metric-bars": renderMetricBars,
  "timeline": renderTimeline,
};

// === スキーマ正規化アダプタ ===
// 生成パイプラインが出力する「フラットな簡易スキーマ」と、正準スキーマ ({type, data:{...}}) の
// 双方を受け付け、各 renderer が期待する data 形に寄せる。
// フラット例 (comparison): {type, title, left_label, right_label, metrics:[{name,left,right,delta}]}
// → 正準: {headline, before:{label}, after:{label}, metrics:[{label,before,after,before_pct,after_pct,delta,delta_tone}]}
// data ラッパー欠落 / 旧フィールド名 / 正規化バー幅 (_pct) 不在を吸収する。
function parseNum(s) {
  if (s == null) return null;
  const m = String(s).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

// delta テキストから tone を推定（赤の誤発火を避け、確信が持てないものは中立に倒す）
function toneFromDelta(delta) {
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

function normalizeTimeline(f) {
  const d = f.data;
  if (d && Array.isArray(d.events) && d.events.some((e) => e && e.when != null)) return d;
  const raw = Array.isArray(f.events) ? f.events : (d && d.events) || [];
  const now = new Date().getTime();
  const parsed = raw.map((e) => {
    const t = Date.parse(String(e.date || e.when || "").replace(/\//g, "-"));
    return { e, t: isNaN(t) ? null : t };
  });
  // 「今」= 今日以前で最も新しいイベント
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

function normalizeFigureData(figure) {
  const n = FIGURE_NORMALIZERS[figure.type];
  return n ? n(figure) : (figure.data || {});
}

function renderFigure(figure, mountEl) {
  if (!figure || !figure.type) return false;
  const renderer = FIGURE_RENDERERS[figure.type];
  if (!renderer) return false;
  const body = mountEl.querySelector(".figure-body");
  const caption = mountEl.querySelector(".figure-caption");
  if (!body || !caption) return false;
  try {
    body.replaceChildren(renderer(normalizeFigureData(figure)));
    caption.textContent = figure.caption || "";
    if (!figure.caption) caption.classList.add("hidden");
    else caption.classList.remove("hidden");
    mountEl.setAttribute("aria-label", figure.alt || figure.caption || "図解");
    mountEl.dataset.figureType = figure.type;
    mountEl.removeAttribute("hidden");
    return true;
  } catch (err) {
    console.warn("figure render failed", figure.type, err);
    return false;
  }
}

export { renderFigure };

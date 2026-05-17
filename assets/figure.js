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
      const delta = m.delta
        ? `<span class="fig-cmp-delta">${escapeHtml(m.delta)}</span>`
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
      const delta = b.delta ? `<span class="fig-mb-delta">${escapeHtml(b.delta)}</span>` : "";
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

function renderFigure(figure, mountEl) {
  if (!figure || !figure.type) return false;
  const renderer = FIGURE_RENDERERS[figure.type];
  if (!renderer) return false;
  const body = mountEl.querySelector(".figure-body");
  const caption = mountEl.querySelector(".figure-caption");
  if (!body || !caption) return false;
  try {
    body.replaceChildren(renderer(figure.data || {}));
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

// Analyze page: interactive exploration of what analysis.py computed (ML + CV).
// Charts are hand-drawn SVG (small data) or canvas (thousands of points).
"use strict";

const AN = { index: null, ds: null, tab: "overview", token: 0, posters: new Set(), redraw: null };
const AN_TABS = [
  ["overview", "Overview"], ["films", "Films"], ["genres", "Genres"], ["latent", "Latent space"],
  ["segments", "Viewer segments"], ["genome", "Tag genome"], ["posters", "Posters (CV)"],
];
const FEATURE_LABELS = {
  brightness: "Brightness", contrast: "Contrast", saturation: "Saturation", colorfulness: "Colourfulness",
  edge_density: "Edge density", warmth: "Warmth (red − blue)", dark_share: "Share of dark pixels",
  entropy: "Tonal entropy", aspect_ratio: "Aspect ratio",
};

/* ---------- small helpers ---------- */
const compact = value => {
  const n = num(value), a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};
const pct = (value, digits = 1) => `${num(value).toFixed(digits)}%`;
const anApi = path => api(`/api/analysis${path}`);
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const hasPoster = id => AN.posters.has(num(id));
const thumbUrl = id => `/posters/${num(id)}/thumb`;
const thumb = (id, title) => `<span class="an-thumb" style="--h:${hueFor(id)}">${hasPoster(id) ? `<img src="${thumbUrl(id)}" alt="" loading="lazy">` : ""}<span>${esc(parseTitle(title).name.slice(0, 1))}</span></span>`;
const filmName = title => { const t = parseTitle(title); return `${esc(t.name)}${t.year ? ` <span class="mono muted">${esc(t.year)}</span>` : ""}`; };

function anCard(title, note, content, cls = "") {
  return `<article class="an-card ${cls}"><h3>${title}</h3>${note ? `<p class="report-note">${note}</p>` : ""}${content}</article>`;
}

function niceTicks(min, max, count = 4) {
  const span = (max - min) || Math.abs(max) || 1;
  const raw = span / count, mag = 10 ** Math.floor(Math.log10(raw)), err = raw / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const ticks = [];
  for (let t = Math.floor(min / step) * step; t <= Math.ceil(max / step) * step + step / 2; t += step) ticks.push(+t.toFixed(10));
  return ticks;
}

/* ---------- SVG charts ---------- */
function svgBars({ labels, values, W = 560, H = 220, yFmt = compact, every = 1, tip = null, marks = [] }) {
  const L = 52, R = 8, T = 12, B = 34;
  const ticks = niceTicks(0, Math.max(...values, 0) || 1), top = ticks[ticks.length - 1];
  const bw = (W - L - R) / values.length;
  const y = v => T + (1 - v / top) * (H - T - B);
  return `<figure class="svg-chart"><svg viewBox="0 0 ${W} ${H}" role="img">
    ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${L - 8}" y="${y(t) + 4}" class="tick" text-anchor="end">${yFmt(t)}</text>`).join("")}
    ${values.map((v, i) => `<rect x="${L + i * bw + bw * 0.14}" y="${y(v)}" width="${Math.max(bw * 0.72, 1)}" height="${Math.max(y(0) - y(v), 0)}" class="bar ${marks.includes(i) ? "bar-mark" : ""}"><title>${esc(tip ? tip(i) : `${labels[i]}: ${yFmt(v)}`)}</title></rect>`).join("")}
    ${labels.map((l, i) => (i % every === 0 ? `<text x="${L + i * bw + bw / 2}" y="${H - B + 16}" class="tick" text-anchor="middle">${esc(l)}</text>` : "")).join("")}
  </svg></figure>`;
}

function svgLines({ xs, series, W = 560, H = 220, yMin = null, yMax = null, yFmt = v => v.toFixed(2), xFmt = String, xEvery = 1, diagonal = false }) {
  const L = 52, R = 90, T = 12, B = 34;
  const all = series.flatMap(s => s.values).filter(v => v != null);
  const ticks = niceTicks(yMin ?? Math.min(...all), yMax ?? Math.max(...all));
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const x = v => L + (v - x0) / ((x1 - x0) || 1) * (W - L - R);
  const y = v => T + (hi - v) / ((hi - lo) || 1) * (H - T - B);
  const path = values => values.map((v, i) => (v == null ? "" : `${i && values[i - 1] != null ? "L" : "M"}${x(xs[i]).toFixed(1)},${y(v).toFixed(1)}`)).join("");
  return `<figure class="svg-chart"><svg viewBox="0 0 ${W} ${H}" role="img">
    ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${L - 8}" y="${y(t) + 4}" class="tick" text-anchor="end">${yFmt(t)}</text>`).join("")}
    ${xs.map((v, i) => (i % xEvery === 0 ? `<text x="${x(v)}" y="${H - B + 16}" class="tick" text-anchor="middle">${esc(xFmt(v))}</text>` : "")).join("")}
    ${diagonal ? `<line x1="${x(x0)}" y1="${y(lo)}" x2="${x(x1)}" y2="${y(hi)}" class="line-train"/>` : ""}
    ${series.map(s => `<path d="${path(s.values)}" class="${s.cls || "line-test"}"/>`).join("")}
    ${series.map(s => { const i = s.values.map((v, j) => (v == null ? -1 : j)).filter(j => j >= 0).pop(); return i == null ? "" : `<text x="${x(xs[i]) + 8}" y="${y(s.values[i]) + 4}" class="series ${s.muted ? "muted-series" : ""}">${esc(s.label)}</text>`; }).join("")}
  </svg></figure>`;
}

// Horizontal bars from zero, or (dot: true) a dot plot for values on a zoomed axis, where
// bars would exaggerate differences. Optional ci draws a whisker of ± ci(row).
function hBars(rows, { value, label, fmt = v => v.toFixed(2), ci = null, min = null, max = null, note = null, dot = false }) {
  const values = rows.map(value);
  const spread = i => (ci ? ci(rows[i]) : 0);
  const lo = min ?? Math.min(dot ? Infinity : 0, ...values.map((v, i) => v - spread(i)));
  const hi = max ?? Math.max(...values.map((v, i) => v + spread(i)));
  const pad = dot ? (hi - lo) * 0.05 : 0;
  const pos = v => ((v - (lo - pad)) / ((hi - lo + 2 * pad) || 1)) * 100;
  return `<div class="hbars">${rows.map((row, i) => `<div class="hbar-row"><span class="hbar-label">${label(row)}</span>
    <span class="hbar-track ${dot ? "is-dot" : ""}">${ci ? `<b class="hbar-ci" style="left:${pos(values[i] - spread(i)).toFixed(2)}%;width:${(pos(values[i] + spread(i)) - pos(values[i] - spread(i))).toFixed(2)}%"></b>` : ""}${dot ? `<em style="left:${pos(values[i]).toFixed(2)}%"></em>` : `<i style="width:${pos(values[i]).toFixed(2)}%"></i>`}</span>
    <span class="mono hbar-value">${fmt(values[i])}</span>${note ? `<span class="muted hbar-note">${note(row)}</span>` : ""}</div>`).join("")}
    ${dot ? `<div class="hbar-axis"><span></span><span class="mono muted">${fmt(lo - pad)}</span><span class="mono muted">${fmt(hi + pad)}</span></div>` : ""}</div>`;
}

/* ---------- canvas scatter with hover + click ---------- */
function scatter(el, points, { x, y, xLog = false, color, radius = 2.6, xLabel = "", yLabel = "", tip, onClick, height = 440, axes = true, image = null, outline = false }) {
  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(el.clientWidth, 300), H = height;
  const [L, R, T, B] = axes ? [52, 14, 12, 40] : [12, 12, 12, 12];  // map projections have no meaningful units
  el.innerHTML = `<canvas style="width:${W}px;height:${H}px"></canvas><div class="an-tip" hidden></div>`;
  const canvas = el.querySelector("canvas"), tipEl = el.querySelector(".an-tip");
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const xv = points.map(p => (xLog ? Math.log10(Math.max(x(p), 1)) : x(p))), yv = points.map(y);
  const xt = xLog ? niceTicks(Math.floor(Math.min(...xv)), Math.ceil(Math.max(...xv)), 5).filter(Number.isInteger) : niceTicks(Math.min(...xv), Math.max(...xv), 5);
  const yt = niceTicks(Math.min(...yv), Math.max(...yv), 4);
  const X = v => L + (v - xt[0]) / ((xt[xt.length - 1] - xt[0]) || 1) * (W - L - R);
  const Y = v => T + (yt[yt.length - 1] - v) / ((yt[yt.length - 1] - yt[0]) || 1) * (H - T - B);
  const px = points.map((_, i) => [X(xv[i]), Y(yv[i])]);
  const draw = (hover = -1) => {
    ctx.clearRect(0, 0, W, H);
    if (axes) {
      ctx.font = "11px 'IBM Plex Mono', monospace";
      ctx.strokeStyle = cssVar("--line"); ctx.fillStyle = cssVar("--muted"); ctx.lineWidth = 1;
      yt.forEach(t => { ctx.beginPath(); ctx.moveTo(L, Y(t)); ctx.lineTo(W - R, Y(t)); ctx.stroke(); ctx.textAlign = "right"; ctx.fillText(Number.isInteger(t) ? String(t) : t.toFixed(1), L - 8, Y(t) + 4); });
      xt.forEach(t => { ctx.textAlign = "center"; ctx.fillText(xLog ? compact(10 ** t) : compact(t), X(t), H - B + 16); });
      ctx.font = "11px Archivo, sans-serif"; ctx.textAlign = "center";
      if (xLabel) ctx.fillText(xLabel, (L + W - R) / 2, H - 6);
      if (yLabel) { ctx.save(); ctx.translate(12, (T + H - B) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(yLabel, 0, 0); ctx.restore(); }
    }
    const ring = cssVar("--line-strong");
    points.forEach((p, i) => {
      const img = image ? images.get(image(p)) : null;
      if (img && img.complete && img.naturalWidth) {  // poster thumbnails, 2:3
        ctx.globalAlpha = 1;
        ctx.drawImage(img, px[i][0] - 10, px[i][1] - 15, 20, 30);
        return;
      }
      ctx.globalAlpha = p._dim ? 0.18 : 0.8;
      ctx.fillStyle = color(p);
      ctx.beginPath(); ctx.arc(px[i][0], px[i][1], p._dim ? radius * 0.8 : radius, 0, Math.PI * 2); ctx.fill();
      if (outline) { ctx.globalAlpha = 1; ctx.strokeStyle = ring; ctx.lineWidth = 1; ctx.stroke(); }
    });
    ctx.globalAlpha = 1;
    if (hover >= 0) {
      ctx.strokeStyle = cssVar("--text"); ctx.lineWidth = 2;
      if (image) ctx.strokeRect(px[hover][0] - 12, px[hover][1] - 17, 24, 34);
      else { ctx.beginPath(); ctx.arc(px[hover][0], px[hover][1], radius + 4, 0, Math.PI * 2); ctx.stroke(); }
    }
  };
  // thumbnails load asynchronously; redraw (at most once a frame) as they arrive
  const images = new Map();
  let pending = false;
  // a short timer rather than requestAnimationFrame, which browsers pause in background tabs
  const later = () => { if (!pending) { pending = true; setTimeout(() => { pending = false; draw(); }, 60); } };
  if (image) {
    points.forEach(p => {
      const url = image(p);
      if (url && !images.has(url)) { const img = new Image(); img.onload = later; img.src = url; images.set(url, img); }
    });
  }
  const nearest = event => {
    const box = canvas.getBoundingClientRect(), mx = event.clientX - box.left, my = event.clientY - box.top;
    let best = -1, bestD = 100;
    px.forEach(([a, b], i) => { if (points[i]._dim) return; const d = (a - mx) ** 2 + (b - my) ** 2; if (d < bestD) { bestD = d; best = i; } });
    return [best, mx, my];
  };
  canvas.addEventListener("mousemove", event => {
    const [i, mx, my] = nearest(event);
    draw(i);
    canvas.style.cursor = i >= 0 && onClick ? "pointer" : "default";
    if (i < 0) { tipEl.hidden = true; return; }
    tipEl.innerHTML = tip(points[i]);
    tipEl.hidden = false;
    tipEl.style.left = `${Math.min(mx + 14, W - 230)}px`;
    tipEl.style.top = `${Math.max(my - 10, 0)}px`;
  });
  canvas.addEventListener("mouseleave", () => { tipEl.hidden = true; draw(); });
  canvas.addEventListener("click", event => { const [i] = nearest(event); if (i >= 0 && onClick) onClick(points[i]); });
  draw();
  return { redraw: () => draw() };
}

function ratingColor(mean) {
  // blue (low) -> grey -> gold (high), over the range most films fall in
  const t = Math.max(0, Math.min(1, (num(mean) - 2.9) / 1.4));
  const a = [111, 143, 216], m = [134, 140, 146], b = [217, 178, 92];
  const mix = (p, q, s) => p.map((v, i) => Math.round(v + (q[i] - v) * s));
  const c = t < 0.5 ? mix(a, m, t * 2) : mix(m, b, (t - 0.5) * 2);
  return `rgb(${c.join(",")})`;
}

/* ---------- page shell ---------- */
async function renderAnalyze(params) {
  const token = ++AN.token;
  AN.tab = AN_TABS.some(([id]) => id === params.get("tab")) ? params.get("tab") : AN.tab;
  view().innerHTML = `<div class="wrap analyze">
    <header class="page-head"><p class="kicker">Analyze · machine learning + computer vision</p><h1>Explore the data</h1>
      <p>Interactive analysis of the MovieLens ratings: scale and long tail, genres, the latent factors matrix factorization learns, viewer segments, the tag genome, and what poster images say. Computed offline by <code>analysis.py</code>.</p></header>
    <div class="an-bar"><div class="an-datasets" id="an-datasets" role="group" aria-label="Dataset"></div><p class="report-meta" id="an-meta"></p></div>
    <nav class="an-tabs" id="an-tabs" role="tablist" aria-label="Analysis views"></nav>
    <div id="an-body" class="an-body"><div class="skeleton" style="height:320px"></div></div></div>`;
  try {
    AN.index = await api("/api/analysis");
  } catch (error) {
    $("#an-body").innerHTML = errorBlock(error.message);
    return;
  }
  if (token !== AN.token) return;
  AN.posters = new Set(AN.index.poster_ids || []);
  const ids = AN.index.datasets.map(d => d.id);
  if (!ids.length) {
    $("#an-body").innerHTML = `<div class="notice"><div><b>Nothing analysed yet.</b> Run <code>python download_data.py</code> (MovieLens 25M) and <code>python analysis.py</code>, then reload.</div></div>`;
    return;
  }
  const wanted = params.get("ds");
  AN.ds = ids.includes(wanted) ? wanted : ids.includes(AN.ds) ? AN.ds : (ids.includes("ml-25m") ? "ml-25m" : ids[0]);
  $("#an-datasets").innerHTML = AN.index.datasets.map(d => `<button type="button" data-ds="${d.id}" aria-pressed="${d.id === AN.ds}"><b>${esc(d.label)}</b><span class="mono">${compact(d.size.ratings)} ratings · ${compact(d.size.films_rated)} films</span></button>`).join("");
  $("#an-tabs").innerHTML = AN_TABS.map(([id, label]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${id === AN.tab}">${label}</button>`).join("");
  $$("#an-datasets [data-ds]").forEach(b => b.addEventListener("click", () => { AN.ds = b.dataset.ds; anGo(); }));
  $$("#an-tabs [data-tab]").forEach(b => b.addEventListener("click", () => { AN.tab = b.dataset.tab; anGo(); }));
  anShow();
}

function anGo() {
  history.replaceState(null, "", `#/analyze?ds=${AN.ds}&tab=${AN.tab}`);
  $$("#an-datasets [data-ds]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.ds === AN.ds)));
  $$("#an-tabs [data-tab]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === AN.tab)));
  anShow();
}

async function anShow() {
  const token = ++AN.token;
  const body = $("#an-body");
  const d = AN.index.datasets.find(x => x.id === AN.ds);
  $("#an-meta").innerHTML = `Built ${esc(new Date(d.generated_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }))} · rebuild with <code>python analysis.py</code>`;
  body.innerHTML = `<div class="skeleton" style="height:320px"></div>`;
  AN.redraw = null;
  const renderers = { overview: anOverview, films: anFilms, genres: anGenres, latent: anLatent, segments: anSegments, genome: anGenome, posters: anPosters };
  try {
    const html = await renderers[AN.tab](d);
    if (token !== AN.token) return;
    body.innerHTML = html.html ?? html;
    html.after?.();
  } catch (error) {
    if (token === AN.token) body.innerHTML = `<div class="notice"><div><b>Couldn't load this view.</b> ${esc(error.message)}</div></div>`;
  }
}

window.addEventListener("resize", () => { clearTimeout(AN._resize); AN._resize = setTimeout(() => AN.redraw?.(), 200); });

/* ---------- 1. Overview ---------- */
async function anOverview() {
  const s = await anApi(`/${AN.ds}/summary`);
  const z = s.size, v = s.viewers, lt = s.long_tail;
  const years = s.per_year.filter(y => y.ratings >= 100);
  const halfStart = s.per_year.find(y => y.half_star_share > 0.02)?.year;
  const decades = s.release_decades.filter(d => d.ratings >= 100);
  const totalRatings = s.rating_scale.reduce((a, r) => a + r.count, 0);
  const wholeShare = s.rating_scale.filter(r => r.stars % 1 === 0).reduce((a, r) => a + r.count, 0) / totalRatings * 100;
  const modeStars = s.rating_scale.reduce((a, r) => (r.count > a.count ? r : a)).stars;
  const earlyMean = decades.slice(0, 4).reduce((a, d) => a + d.mean, 0) / Math.max(decades.slice(0, 4).length, 1);
  const lateMean = decades.slice(-2).reduce((a, d) => a + d.mean, 0) / Math.max(decades.slice(-2).length, 1);
  const activity = num(v.activity_vs_mean_r);
  const list = key => s.lists[key].map((f, i) => `<li><span class="mono muted">${i + 1}</span>${thumb(f.movieId, f.title)}<span class="an-film">${filmName(f.title)}<span class="muted">${esc(String(f.genres || "").split("|").slice(0, 3).join(", "))}</span></span>
    <span class="mono">${compact(f.n)}</span><span class="mono gold">${num(f.mean).toFixed(2)}</span><span class="mono muted">±${num(f.std).toFixed(2)}</span></li>`).join("");
  const lists = [["top_rated", "Top rated", `Bayesian average, ${fmt(s.settings.bayes_prior)} pseudo-ratings of prior, ${fmt(s.settings.list_min)}+ ratings`],
    ["most_rated", "Most rated", "Raw popularity"], ["most_divisive", "Most divisive", `Largest spread of ratings, ${fmt(s.settings.list_min)}+ ratings`],
    ["hidden_gems", "Hidden gems", `Highest mean among films with ${s.settings.gems[0]}–${s.settings.gems[1]} ratings`], ["lowest_rated", "Lowest rated", "Bottom Bayesian average"]];
  return {
    html: `
    <div class="dataset an-kpis">
      <div><span class="label">Ratings</span><b>${fmt(z.ratings)}</b><span>${z.first_year}–${z.last_year}, mean ${num(z.mean_rating).toFixed(2)}</span></div>
      <div><span class="label">Viewers</span><b>${fmt(z.users)}</b><span>median ${fmt(v.median_ratings)} ratings each</span></div>
      <div><span class="label">Films</span><b>${fmt(z.films_rated)}</b><span>rated, of ${fmt(z.films_catalog)} listed</span></div>
      <div><span class="label">Sparsity</span><b>${num(z.sparsity_pct).toFixed(2)}%</b><span>of viewer × film pairs empty</span></div>
      <div><span class="label">${s.genome ? "Tag genome" : "Viewer tags"}</span><b>${s.genome ? `${fmt(s.genome.tags)} × ${compact(s.genome.films)}` : fmt(z.tags)}</b><span>${s.genome ? "tags × films, relevance 0–1" : "free-text tags"}</span></div>
    </div>
    <div class="an-grid">
      ${anCard("Rating scale", `Number of ratings at each star value; gold bars are whole stars. ${halfStart ? `Half stars appear from ${halfStart}, when MovieLens added them.` : ""} ${pct(wholeShare, 0)} of ratings are whole stars, and ${modeStars} is the most common rating.`,
        svgBars({ labels: s.rating_scale.map(r => r.stars), values: s.rating_scale.map(r => r.count), marks: s.rating_scale.map((r, i) => (r.stars % 1 ? -1 : i)) }))}
      ${anCard("Ratings per year", "Volume by the year the rating was made, not the film's release.",
        svgBars({ labels: years.map(y => `'${String(y.year).slice(2)}`), values: years.map(y => y.ratings), every: Math.ceil(years.length / 12), tip: i => `${years[i].year}: ${fmt(years[i].ratings)} ratings, ${fmt(years[i].active_users)} active viewers, ${fmt(years[i].new_users)} new` }))}
      ${anCard("The long tail", `A few films get most of the attention. The top 1% of films hold ${pct(lt.top_1pct_share)} of all ratings; ${pct(lt.films_with_10_or_fewer_pct, 0)} of films have 10 or fewer. Gini coefficient ${num(lt.gini).toFixed(2)} (0 = equal, 1 = one film gets everything).`,
        svgLines({ xs: [0, ...lt.curve.map(c => c.films_pct)], series: [{ values: [0, ...lt.curve.map(c => c.ratings_pct)], label: "ratings share" }], yMin: 0, yMax: 100, yFmt: t => `${t}%`, xFmt: t => `${t}%`, xEvery: 3, diagonal: true }))}
      ${anCard("Average rating by year", "Mean rating and the share given as half stars, by rating year.",
        svgLines({ xs: years.map(y => y.year), series: [{ values: years.map(y => y.mean), label: "mean rating" }], yFmt: t => t.toFixed(2), xEvery: Math.ceil(years.length / 8) }))}
      ${anCard("How active are viewers?", `Viewers by number of ratings. Median ${fmt(v.median_ratings)}, most active ${fmt(v.max_ratings)}. ${Math.abs(activity) < 0.05 ? "Activity and generosity are unrelated" : `More active viewers rate slightly ${activity < 0 ? "lower" : "higher"}`} (r = ${activity.toFixed(2)} between log activity and mean rating).`,
        svgBars({ labels: v.per_count.map(b => (b.to == null ? `${compact(b.from)}+` : compact(b.from))), values: v.per_count.map(b => b.count), tip: i => { const b = v.per_count[i]; return `${fmt(b.from)}${b.to == null ? "+" : `–${fmt(b.to)}`} ratings: ${fmt(b.count)} viewers`; } }))}
      ${anCard("How generous are viewers?", `Each viewer's average rating. ${pct(v.harsh_pct)} average under 3 stars; ${pct(v.generous_pct)} average 4 or more. Typical spread within one viewer: ±${num(v.std_median).toFixed(2)} stars.`,
        svgBars({ labels: v.mean_hist.map(b => b.from.toFixed(2)), values: v.mean_hist.map(b => b.count), every: 2, tip: i => `mean ${v.mean_hist[i].from.toFixed(2)}–${(v.mean_hist[i].from + 0.25).toFixed(2)}: ${fmt(v.mean_hist[i].count)} viewers` }))}
      ${anCard(earlyMean > lateMean + 0.05 ? "Older films score higher" : "Mean rating by release decade", `Mean rating by release decade (ratings-weighted): ${earlyMean.toFixed(2)} for the earliest decades vs ${lateMean.toFixed(2)} for the latest. ${earlyMean > lateMean + 0.05 ? "Old films still in the catalog are the ones people seek out, so this is survivorship, not a golden age." : ""}`,
        svgLines({ xs: decades.map(d => d.decade), series: [{ values: decades.map(d => d.mean), label: "mean rating" }], xFmt: d => `${d}s`, xEvery: 2 }))}
      ${anCard("Films per rating count", "How many films have 1, 2–4, 5–9 … ratings. Most of the catalog sits at the left.",
        svgBars({ labels: s.films_per_count.map(b => compact(b.from)), values: s.films_per_count.map(b => b.count), tip: i => { const b = s.films_per_count[i]; return `${fmt(b.from)}${b.to == null ? "+" : `–${fmt(b.to)}`} ratings: ${fmt(b.count)} films`; } }))}
    </div>
    <section class="an-section"><div class="section-head"><h2>Ranked lists</h2><div class="tabs" id="an-lists">${lists.map(([k, l], i) => `<button type="button" data-list="${k}" aria-pressed="${i === 0}">${l}</button>`).join("")}</div></div>
      <p class="report-note" id="an-list-note">${lists[0][2]}</p>
      <div class="an-list-head mono"><span>#</span><span></span><span>Film</span><span>Ratings</span><span>Mean</span><span>Spread</span></div>
      <ol class="an-list" id="an-list">${list("top_rated")}</ol></section>`,
    after: () => $$("#an-lists [data-list]").forEach(b => b.addEventListener("click", () => {
      $$("#an-lists [data-list]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      $("#an-list").innerHTML = list(b.dataset.list);
      $("#an-list-note").textContent = lists.find(l => l[0] === b.dataset.list)[2];
    })),
  };
}

/* ---------- 2. Films ---------- */
async function anFilms() {
  const s = await anApi(`/${AN.ds}/summary`);
  const big = AN.ds !== "ml-latest-small";
  const state = { q: "", genre: "", year_from: "", year_to: "", min_ratings: big ? 100 : 10, sort: "bayes", order: "desc", offset: 0 };
  const html = `
    <form class="an-filters" id="an-film-form" onsubmit="return false">
      <label>Title<input id="f-q" type="search" placeholder="e.g. star wars"></label>
      <label>Genre<select id="f-genre"><option value="">All genres</option>${s.genres.names.map(g => `<option>${esc(g)}</option>`).join("")}</select></label>
      <label>Released<span class="an-range"><input id="f-from" type="number" placeholder="from" min="1874" max="2025"><input id="f-to" type="number" placeholder="to" min="1874" max="2025"></span></label>
      <label>Min. ratings<input id="f-min" type="number" min="0" value="${state.min_ratings}"></label>
      <label>Sort by<select id="f-sort"><option value="bayes">Bayesian score</option><option value="n">Ratings</option><option value="mean">Mean rating</option><option value="std">Spread (divisive)</option><option value="year">Release year</option><option value="title">Title</option></select></label>
      <label>Order<select id="f-order"><option value="desc">High to low</option><option value="asc">Low to high</option></select></label>
    </form>
    <div id="an-inspect" class="an-inspect" hidden></div>
    ${anCard("Popularity vs. rating", "Each dot is a film matching the filters (up to the 1,500 most-rated). Popular films regress toward the middle; the extremes are almost all films with few ratings. Click a dot to inspect it.", `<div class="an-scatter" id="an-film-scatter"></div>`, "wide")}
    <div id="an-film-table"></div>`;
  const load = async () => {
    const params = new URLSearchParams(Object.entries(state).filter(([, v]) => v !== ""));
    const data = await anApi(`/${AN.ds}/movies?${params}`);
    const plot = () => scatter($("#an-film-scatter"), data.scatter.map(([id, n, mean, title]) => ({ id, n, mean, title })), {
      x: p => p.n, y: p => p.mean, xLog: true, xLabel: "ratings (log scale)", yLabel: "mean rating",
      color: p => ratingColor(p.mean), tip: p => `<b>${filmName(p.title)}</b><br><span class="mono">${fmt(p.n)} ratings · ${num(p.mean).toFixed(2)}</span>`,
      onClick: p => anInspect(p.id),
    });
    if (data.scatter.length) { plot(); AN.redraw = plot; } else $("#an-film-scatter").innerHTML = `<p class="muted">No films match.</p>`;
    $("#an-film-table").innerHTML = `<div class="section-head"><h2>${fmt(data.total)} films<span class="count">median ${fmt(data.stats.median_ratings)} ratings</span></h2>
      <div class="an-pager"><button type="button" class="chip" id="an-prev" ${state.offset ? "" : "disabled"}>Previous</button><span class="mono muted">${fmt(state.offset + 1)}–${fmt(Math.min(state.offset + 50, data.total))}</span><button type="button" class="chip" id="an-next" ${state.offset + 50 < data.total ? "" : "disabled"}>Next</button></div></div>
      <div class="table-wrap"><table class="film-table an-table"><thead><tr><th>Film</th><th>Genres</th><th class="num">Ratings</th><th class="num">Mean</th><th class="num">Spread</th><th class="num">Bayesian</th><th class="num">Rated</th></tr></thead>
      <tbody>${data.rows.map(r => `<tr data-film="${r.movieId}"><td><div class="film-cell">${thumb(r.movieId, r.title)}<div>${filmName(r.title)}</div></div></td><td class="muted">${esc(String(r.genres || "").split("|").slice(0, 3).join(", "))}</td>
        <td class="num">${fmt(r.n)}</td><td class="num">${r.mean.toFixed(2)}</td><td class="num muted">±${r.std.toFixed(2)}</td><td class="num gold">${r.bayes.toFixed(2)}</td><td class="num muted">${r.first ?? ""}–${r.last ?? ""}</td></tr>`).join("")}</tbody></table></div>`;
    $$("#an-film-table [data-film]").forEach(tr => tr.addEventListener("click", () => anInspect(num(tr.dataset.film))));
    $("#an-prev")?.addEventListener("click", () => { state.offset = Math.max(0, state.offset - 50); load(); });
    $("#an-next")?.addEventListener("click", () => { state.offset += 50; load(); });
  };
  return {
    html,
    after: () => {
      let timer = null;
      const bind = (id, key, event = "change") => $(id).addEventListener(event, e => {
        state[key] = e.target.value; state.offset = 0;
        clearTimeout(timer); timer = setTimeout(load, 250);
      });
      bind("#f-q", "q", "input"); bind("#f-genre", "genre"); bind("#f-from", "year_from"); bind("#f-to", "year_to");
      bind("#f-min", "min_ratings"); bind("#f-sort", "sort"); bind("#f-order", "order");
      load();
    },
  };
}

/* A film under the microscope: stats, neighbours by rating patterns, and (25M) its tag profile. */
async function anInspect(movieId) {
  const box = $("#an-inspect");
  if (!box) return;
  box.hidden = false;
  box.innerHTML = `<div class="skeleton" style="height:140px"></div>`;
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  const d = AN.index.datasets.find(x => x.id === AN.ds);
  const [similar, genome] = await Promise.all([
    anApi(`/${AN.ds}/similar?movie_id=${movieId}`).catch(e => ({ error: e.message })),
    d.genome ? anApi(`/${AN.ds}/genome/film?movie_id=${movieId}`).catch(e => ({ error: e.message })) : Promise.resolve(null),
  ]);
  const film = similar.film || genome?.film;
  const rows = items => items.map(f => `<li>${thumb(f.movieId, f.title)}<span class="an-film">${filmName(f.title)}</span><span class="mono muted">${num(f.score).toFixed(2)}</span></li>`).join("");
  box.innerHTML = `<div class="an-inspect-head">${film ? `${thumb(film.movieId, film.title)}<div><h3>${filmName(film.title)}</h3><p class="mono muted">${fmt(film.n)} ratings · mean ${num(film.mean).toFixed(2)}${AN.ds === "ml-latest-small" ? ` · <a class="link-more" href="#/film/${film.movieId}">Open film page</a>` : ""}</p></div>` : ""}
      <button type="button" class="icon-btn" id="an-inspect-close" aria-label="Close">✕</button></div>
    <div class="an-inspect-grid">
      <div><span class="label">Nearest by rating patterns (latent factors)</span>${similar.similar ? `<ol class="an-mini">${rows(similar.similar.slice(0, 8))}</ol>` : `<p class="muted">${esc(similar.error || "")}</p>`}</div>
      ${genome ? `<div><span class="label">Signature tags (tag genome, above average)</span>${genome.signature_tags ? `<div class="tag-list">${genome.signature_tags.slice(0, 12).map(t => `<span class="tag">${esc(t.tag)}<span class="mono">${t.relevance.toFixed(2)}</span></span>`).join("")}</div>` : `<p class="muted">${esc(genome.error)}</p>`}</div>
      <div><span class="label">Nearest by tag genome</span>${genome.by_genome ? `<ol class="an-mini">${rows(genome.by_genome.slice(0, 8))}</ol>` : ""}</div>` : ""}
    </div>`;
  $("#an-inspect-close").addEventListener("click", () => { box.hidden = true; });
}

/* ---------- 3. Genres ---------- */
async function anGenres() {
  const s = await anApi(`/${AN.ds}/summary`);
  const g = s.genres;
  const stats = [...g.stats].filter(x => x.ratings > 0);
  const names = g.names;
  const cell = 26, lab = 110, size = names.length * cell;
  const heat = `<figure class="svg-chart an-heat"><svg viewBox="0 0 ${lab + size + 4} ${lab + size + 4}" role="img" aria-label="Genre co-occurrence lift">
    ${names.map((n, i) => `<text x="${lab - 6}" y="${lab + i * cell + cell / 2 + 4}" class="tick" text-anchor="end">${esc(n)}</text><text transform="translate(${lab + i * cell + cell / 2 + 4},${lab - 6}) rotate(-60)" class="tick">${esc(n)}</text>`).join("")}
    ${g.lift.map((row, i) => row.map((v, j) => {
      if (i === j) return `<rect x="${lab + j * cell}" y="${lab + i * cell}" width="${cell - 1}" height="${cell - 1}" class="heat-diag"><title>${esc(names[i])}: ${fmt(g.cooccurrence[i][j])} films</title></rect>`;
      const l = v ? Math.log2(v) : -3, a = Math.min(Math.abs(l) / 2.5, 1);
      const colour = l >= 0 ? `rgba(217,178,92,${a.toFixed(2)})` : `rgba(111,143,216,${a.toFixed(2)})`;
      return `<rect x="${lab + j * cell}" y="${lab + i * cell}" width="${cell - 1}" height="${cell - 1}" fill="${colour}"><title>${esc(names[i])} + ${esc(names[j])}: ${fmt(g.cooccurrence[i][j])} films, lift ${v ?? 0}×</title></rect>`;
    }).join("")).join("")}
  </svg></figure>`;
  const decadeSeries = genre => g.by_decade.map(d => (d.films >= 20 ? d.genre_share[genre] * 100 : null));
  const byMean = [...stats].sort((a, b) => b.mean - a.mean);
  // strongest genre pairings (enough shared films to matter) and the most standalone genre
  const pairs = [];
  names.forEach((a, i) => names.forEach((b, j) => {
    if (j > i && a !== "IMAX" && b !== "IMAX" && g.cooccurrence[i][j] >= 30 && g.lift[i][j]) pairs.push([a, b, g.lift[i][j]]);  // IMAX is a format
  }));
  pairs.sort((p, q) => q[2] - p[2]);
  const loner = names.map((n, i) => [n, g.cooccurrence[i].reduce((a, c, j) => a + (j === i ? 0 : c), 0) / Math.max(g.cooccurrence[i][i], 1)])
    .filter(([n]) => n !== "IMAX").sort((p, q) => p[1] - q[1])[0];
  return {
    html: `<div class="an-grid">
      ${anCard("Average rating by genre", `Ratings-weighted mean. ${byMean.slice(0, 3).map(x => esc(x.genre)).join(", ")} score highest; ${esc(byMean[byMean.length - 1].genre)} lowest. Genres are only labels on a film, so these differences partly reflect which films get labelled.`,
        hBars(byMean, { value: x => x.mean, label: x => esc(x.genre), dot: true, fmt: v => v.toFixed(2), note: x => `${compact(x.ratings)} ratings` }))}
      ${anCard("How much each genre is watched", "Share of all ratings going to films carrying each genre (a film can carry several, so shares add up to more than 100%).",
        hBars(stats, { value: x => x.ratings / s.size.ratings * 100, label: x => esc(x.genre), min: 0, fmt: v => `${v.toFixed(0)}%`, note: x => `${fmt(x.films)} films` }))}
      ${anCard("Which genres travel together", `Lift = how much more often two genres share a film than chance would predict (gold = together more often, blue = less; hover for numbers). Strongest pairings: ${pairs.slice(0, 3).map(([a, b, l]) => `${esc(a)} + ${esc(b)} (×${l.toFixed(1)})`).join(", ")}. ${loner ? `${esc(loner[0])} films carry the fewest other genres (${loner[1].toFixed(2)} on average).` : ""}`, heat, "wide")}
      ${anCard("Genre share over the decades", "Share of released films carrying the chosen genre, by release decade.",
        `<label class="an-inline">Genre <select id="an-decade-genre">${names.map(n => `<option ${n === "Horror" ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label><div id="an-decade-chart"></div>`, "wide")}
    </div>`,
    after: () => {
      const plot = () => {
        const genre = $("#an-decade-genre").value;
        $("#an-decade-chart").innerHTML = svgLines({ xs: g.by_decade.map(d => d.decade), series: [{ values: decadeSeries(genre), label: genre }], yMin: 0, yFmt: t => `${t.toFixed(0)}%`, xFmt: d => `${d}s`, W: 900, H: 240 });
      };
      $("#an-decade-genre").addEventListener("change", plot);
      plot();
    },
  };
}

/* ---------- 4. Latent space ---------- */
async function anLatent() {
  const l = await anApi(`/${AN.ds}/latent`);
  const s = await anApi(`/${AN.ds}/summary`);
  const energy = l.energy_pct.reduce((a, b) => a + b, 0);
  const cvc = l.content_vs_collab;
  const overlap = Object.entries(cvc.overlap_at_10).sort((a, b) => b[1] - a[1]);
  const best = overlap[0];
  const state = { proj: "s", colour: "rating", genre: "", find: "" };
  const html = `
    <div class="an-grid">
      ${anCard("What matrix factorization learns", `${esc(l.method)}. ${l.factors} factors for ${fmt(l.users)} viewers × ${fmt(l.films)} films; together they explain ${energy.toFixed(1)}% of the variation left after the biases. Each bar is one factor's share: no single taste axis dominates.`,
        svgBars({ labels: l.energy_pct.map((_, i) => i + 1), values: l.energy_pct, yFmt: v => `${v.toFixed(1)}%`, every: Math.ceil(l.energy_pct.length / 12) }))}
      ${anCard("Is content similarity the same as taste?", `For ${fmt(cvc.sample)} films, how many of the 10 nearest films by rating patterns are also among the 10 nearest by content. ${best[0] !== "random" ? `The ${esc(best[0])} matches ${(best[1] / cvc.overlap_at_10.random).toFixed(0)}× better than chance${cvc.overlap_at_10.genre && best[0] !== "genre" ? `, ${(best[1] / cvc.overlap_at_10.genre).toFixed(1)}× better than genres` : ""}.` : ""}`,
        hBars(overlap.map(([k, v]) => ({ k, v })), { value: x => x.v * 100, label: x => esc(x.k), min: 0, max: Math.max(...overlap.map(o => o[1] * 100)) * 1.1, fmt: v => `${v.toFixed(1)}%` }))}
    </div>
    <section class="an-section">
      <div class="section-head"><div><h2>Map of ${fmt(l.map.length)} films</h2><p>Each film's factor vector, squeezed to 2-D; nearby films are liked by the same people (films with ${fmt(l.map_min_ratings)}+ ratings). The model never sees genres, so highlight one to see whether it rediscovers it from ratings alone. Animation, for example, forms tight islands; compare a broad label like Drama.</p></div></div>
      <div class="an-controls">
        <div class="tabs" id="an-proj"><button type="button" data-proj="s" aria-pressed="true">t-SNE</button><button type="button" data-proj="p" aria-pressed="false">PCA</button></div>
        <label class="an-inline">Colour <select id="an-colour"><option value="rating">by mean rating</option>${s.genres.names.map(n => `<option value="${esc(n)}">highlight ${esc(n)}</option>`).join("")}</select></label>
        <label class="an-inline">Find <input id="an-find" type="search" placeholder="title…"></label>
        <span class="an-legend" id="an-legend"></span>
      </div>
      <div id="an-inspect" class="an-inspect" hidden></div>
      <div class="an-scatter tall" id="an-map"></div>
      <p class="report-note">t-SNE keeps local neighbourhoods (clusters are meaningful, distances between clusters are not); PCA keeps the two strongest global directions. Click a film to see its nearest neighbours.</p>
    </section>`;
  const plot = () => {
    const find = state.find.trim().toLowerCase();
    const points = l.map.map(p => ({ ...p, _dim: (state.colour !== "rating" && !String(p.g).split("|").includes(state.colour)) || (find.length > 1 && !p.t.toLowerCase().includes(find)) }));
    const handle = scatter($("#an-map"), points, {
      x: p => p[state.proj][0], y: p => p[state.proj][1], height: 560, radius: 2.8, axes: false,
      color: p => (state.colour === "rating" ? ratingColor(p.m) : cssVar("--gold")),
      tip: p => `<b>${filmName(p.t)}</b><br><span class="muted">${esc(String(p.g).split("|").join(", "))}</span><br><span class="mono">${fmt(p.n)} ratings · ${num(p.m).toFixed(2)}</span>`,
      onClick: p => anInspect(p.id),
    });
    $("#an-legend").innerHTML = state.colour === "rating"
      ? `<span class="an-swatch" style="background:${ratingColor(2.9)}"></span>≤2.9 <span class="an-swatch" style="background:${ratingColor(3.6)}"></span>3.6 <span class="an-swatch" style="background:${ratingColor(4.3)}"></span>≥4.3`
      : `${points.filter(p => !p._dim).length} ${esc(state.colour)} films highlighted`;
    return handle;
  };
  return {
    html,
    after: () => {
      AN.redraw = plot;
      plot();
      $$("#an-proj [data-proj]").forEach(b => b.addEventListener("click", () => {
        state.proj = b.dataset.proj;
        $$("#an-proj [data-proj]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
        plot();
      }));
      $("#an-colour").addEventListener("change", e => { state.colour = e.target.value; plot(); });
      $("#an-find").addEventListener("input", e => { state.find = e.target.value; plot(); });
    },
  };
}

/* ---------- 5. Viewer segments ---------- */
async function anSegments() {
  const l = await anApi(`/${AN.ds}/latent`);
  const segs = [...l.segments].sort((a, b) => b.users - a.users);
  const years = segs.map(x => x.active_from);
  const spread = Math.max(...years) - Math.min(...years);
  const letter = i => String.fromCharCode(65 + i);
  return `
    <p class="prose an-intro">k-means (k = ${segs.length}) on each viewer's unit-length factor vector groups people whose ratings deviate from the average in the same direction. Genre lift shows what a segment likes more than everyone else does (×1.5 = 50% more often among its 4–5 star ratings).
    ${spread >= 4 ? `<b>The segments are partly eras:</b> their typical first ratings range from ${Math.min(...years)} to ${Math.max(...years)}. What was in the catalog, and in cinemas, when someone was active shapes their factor vector alongside genre taste.` : ""}</p>
    <div class="an-segments">${segs.map((x, i) => `<article class="an-seg">
      <header><span class="an-seg-id">${letter(i)}</span><div><h3>Segment ${letter(i)}</h3><p class="mono muted">${pct(x.share_pct)} of viewers · ${fmt(x.users)}</p></div></header>
      <div class="an-seg-stats"><div><span class="label">Active</span><b class="mono">${x.active_from === x.active_to ? x.active_from : `${x.active_from}–${x.active_to}`}</b></div><div><span class="label">Median ratings</span><b class="mono">${fmt(x.median_ratings)}</b></div><div><span class="label">Mean given</span><b class="mono">${num(x.mean_given).toFixed(2)}</b></div></div>
      <span class="label">Leans toward</span>
      <div class="tag-list">${x.genres.slice(0, 5).map(gn => `<span class="tag">${esc(gn.genre)}<span class="mono">×${gn.lift.toFixed(2)}</span></span>`).join("") || '<span class="muted">no genre stands out</span>'}</div>
      <span class="label">Rates higher than everyone else</span>
      <ol class="an-mini">${x.loves.slice(0, 5).map(f => `<li>${thumb(f.movieId, f.title)}<span class="an-film">${filmName(f.title)}</span><span class="mono good">+${num(f.delta).toFixed(2)}</span></li>`).join("")}</ol>
      <span class="label">Watches more than everyone else</span>
      <ol class="an-mini">${x.watches.slice(0, 5).map(f => `<li>${thumb(f.movieId, f.title)}<span class="an-film">${filmName(f.title)}</span><span class="mono muted">×${num(f.lift).toFixed(1)}</span></li>`).join("")}</ol>
    </article>`).join("")}</div>`;
}

/* ---------- 6. Tag genome ---------- */
async function anGenome(d) {
  if (!d.genome) {
    return `<div class="notice"><div><b>The tag genome is part of MovieLens 25M.</b> Switch to it above. It scores 1,128 tags (like "dystopia", "twist ending", "visually stunning") from 0 to 1 for 13,816 films, learned from viewer tags, reviews and ratings: a dense content description that genres can't match.</div></div>`;
  }
  const { tags } = await anApi(`/${AN.ds}/genome/tags`);
  const html = `
    <p class="prose an-intro">Each film in the genome has a relevance score from 0 to 1 for each of ${fmt(tags.length)} tags, predicted by GroupLens from viewer tags, reviews and ratings. It's a 1,128-dimensional content vector, and on the Latent space tab it agrees with rating-based similarity far more than genres do.</p>
    <div class="an-grid">
      <article class="an-card"><h3>Browse by tag</h3><p class="report-note">Films the genome scores highest for a tag.</p>
        <div class="an-controls"><label class="an-inline">Tag <input id="g-tag" list="g-tags" placeholder="e.g. dystopia" value="dystopia"></label><datalist id="g-tags">${tags.map(t => `<option value="${esc(t.tag)}">`).join("")}</datalist>
        <label class="an-inline">Min. ratings <select id="g-min"><option>100</option><option selected>1000</option><option>10000</option></select></label></div>
        <div id="g-tag-out"></div></article>
      <article class="an-card"><h3>A film's tag profile</h3><p class="report-note">Its most over-represented tags, then its nearest films by tag genome versus by shared genres.</p>
        <div class="an-controls">${anPicker("g-film")}</div><div id="g-film-out"></div></article>
    </div>`;
  const loadTag = async () => {
    const name = $("#g-tag").value.trim().toLowerCase();
    const tag = tags.find(t => t.tag.toLowerCase() === name);
    if (!tag) { $("#g-tag-out").innerHTML = `<p class="muted">Pick a tag from the list.</p>`; return; }
    const data = await anApi(`/${AN.ds}/genome/tag?tag_id=${tag.id}&min_ratings=${$("#g-min").value}`);
    $("#g-tag-out").innerHTML = `<ol class="an-mini">${data.films.slice(0, 15).map(f => `<li>${thumb(f.movieId, f.title)}<span class="an-film">${filmName(f.title)}</span>
      <span class="an-rel"><i style="width:${(f.relevance * 100).toFixed(0)}%"></i></span><span class="mono muted">${f.relevance.toFixed(2)}</span></li>`).join("")}</ol>`;
  };
  const loadFilm = async movieId => {
    const out = $("#g-film-out");
    try {
      const f = await anApi(`/${AN.ds}/genome/film?movie_id=${movieId}`);
      const list = items => `<ol class="an-mini">${items.map(x => `<li>${thumb(x.movieId, x.title)}<span class="an-film">${filmName(x.title)}</span><span class="mono muted">${num(x.score).toFixed(2)}</span></li>`).join("")}</ol>`;
      out.innerHTML = `<p class="explain-title">${filmName(f.film.title)} <span class="mono muted">${fmt(f.film.n)} ratings</span></p>
        ${hBars(f.signature_tags.slice(0, 10), { value: t => t.relevance, label: t => esc(t.tag), min: 0, max: 1, fmt: v => v.toFixed(2), note: t => `+${t.above_average.toFixed(2)} vs avg` })}
        <div class="report-two tight"><div><span class="label">Nearest by tag genome</span>${list(f.by_genome.slice(0, 8))}</div><div><span class="label">Nearest by shared genres</span>${list(f.by_genre.slice(0, 8))}</div></div>`;
    } catch (error) { out.innerHTML = `<p class="muted">${esc(error.message)}</p>`; }
  };
  return {
    html,
    after: () => {
      $("#g-tag").addEventListener("change", loadTag);
      $("#g-min").addEventListener("change", loadTag);
      anSetupPicker("g-film", loadFilm);
      loadTag();
      loadFilm(79132);
    },
  };
}

function anPicker(id) {
  return `<div class="picker" data-anpicker="${id}"><label class="sr-only" for="${id}">Film</label><input id="${id}" type="search" placeholder="Search ${AN.index.datasets.find(x => x.id === AN.ds).size.films_catalog.toLocaleString("en-US")} films…" autocomplete="off"><div class="picker-results" hidden></div></div>`;
}

function anSetupPicker(id, onPick) {
  const root = $(`[data-anpicker="${id}"]`), input = $("input", root), list = $(".picker-results", root);
  let timer = null;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    if (input.value.trim().length < 2) { list.hidden = true; return; }
    timer = setTimeout(async () => {
      const { results } = await anApi(`/${AN.ds}/search?q=${encodeURIComponent(input.value.trim())}`).catch(() => ({ results: [] }));
      list.innerHTML = results.map(f => `<button type="button" data-id="${f.movieId}">${filmName(f.title)} <span class="mono muted">${compact(f.n)}</span></button>`).join("") || '<div class="search-empty">No match.</div>';
      list.hidden = false;
    }, 200);
  });
  list.addEventListener("click", event => {
    const b = event.target.closest("[data-id]");
    if (!b) return;
    list.hidden = true;
    input.value = b.textContent.replace(/\s+\S+$/, "").trim();
    onPick(num(b.dataset.id));
  });
}

/* ---------- 7. Posters (computer vision) ---------- */
async function anPosters() {
  let p;
  try {
    p = await anApi("/posters");
  } catch (error) {
    return `<div class="notice"><div><b>Poster analysis not built yet.</b> ${fmt(AN.index.posters_on_disk)} posters are on disk. Run <code>python download_data.py --posters-only --posters 1000</code> to fetch more, then <code>python analysis.py --posters-only</code>.</div></div>`;
  }
  const features = ["brightness", "saturation", "colorfulness", "dark_share", "warmth", "edge_density", "contrast", "entropy"];
  const state = { feature: "brightness" };
  const exp = p.genre_prediction;
  const bestAuc = e => Math.max(e.auc_scalar, e.auc_full);
  const histogramGain = exp.length ? exp.reduce((a, e) => a + (e.auc_full - e.auc_scalar), 0) / exp.length : 0;
  const expNote = exp.length
    ? ` ${esc(exp[0].genre)} is the most recognisable (AUC ${bestAuc(exp[0]).toFixed(2)}), ${esc(exp[exp.length - 1].genre)} the least (${bestAuc(exp[exp.length - 1]).toFixed(2)}). ${histogramGain < 0
      ? `On average the colour histogram lowers AUC by ${Math.abs(histogramGain).toFixed(2)}: with ${fmt(p.posters)} posters its 108 bins add more noise than signal, so the 9 interpretable features are the better model.`
      : `The colour histogram adds ${histogramGain.toFixed(2)} AUC on average.`}`
    : "";
  const html = `<div id="p-root">
    <p class="prose an-intro">${fmt(p.posters)} posters analysed (${fmt(AN.index.posters_on_disk)} on disk; ratings from ${esc(p.ratings_source)}). For each: brightness, contrast, saturation, colourfulness (Hasler–Süsstrunk), edge density, warmth, share of dark pixels, tonal entropy, a 5-colour k-means palette and a 108-bin HSV colour histogram. Classical computer vision, no neural network, so every number is interpretable.</p>
    <div class="an-grid">
      ${anCard("Can you guess the genre from the poster?", `Logistic regression, 5-fold cross-validated ROC AUC (0.5 = coin flip, 1 = perfect), one genre vs. the rest. "Scalar" uses the 9 interpretable features; "full" adds the 108-bin colour histogram.${expNote}`,
        `<div class="table-wrap"><table class="film-table report-table compact"><thead><tr><th>Genre</th><th class="num">Posters</th><th class="num">AUC scalar</th><th class="num">AUC full</th><th>Strongest cues</th></tr></thead><tbody>
        ${exp.map(e => `<tr><td>${esc(e.genre)}</td><td class="num muted">${e.positives}</td><td class="num ${e.auc_scalar >= 0.7 ? "good" : ""}">${e.auc_scalar.toFixed(2)}<span class="muted"> ±${e.auc_scalar_sd.toFixed(2)}</span></td><td class="num ${e.auc_full >= 0.7 ? "good" : ""}">${e.auc_full.toFixed(2)}<span class="muted"> ±${e.auc_full_sd.toFixed(2)}</span></td>
          <td class="muted">${e.drivers.map(dr => `${dr.weight > 0 ? "more" : "less"} ${esc(FEATURE_LABELS[dr.feature].toLowerCase())}`).join(", ")}</td></tr>`).join("")}</tbody></table></div>`, "wide")}
      ${anCard("Genre profiles", "Mean of the chosen feature per genre, with a 95% confidence interval. Where intervals don't overlap, the genres' posters really differ.",
        `<label class="an-inline">Feature <select id="p-feature">${features.map(f => `<option value="${f}">${FEATURE_LABELS[f]}</option>`).join("")}</select></label><div id="p-genre-bars"></div>`)}
      ${anCard("Genre palettes", "The six colours that cover most of each genre's posters (k-means over every poster's palette, weighted by area).",
        `<div class="an-palettes">${p.genres.map(g => `<div class="an-palette"><span>${esc(g.genre)}<span class="mono muted"> ${g.posters}</span></span><span class="an-strip">${g.palette.map(c => `<i style="background:${c.color};flex:${c.share}" title="${c.color} · ${(c.share * 100).toFixed(0)}%"></i>`).join("")}</span></div>`).join("")}</div>`)}
      ${anCard("Posters over the decades", "Mean brightness, saturation and dark-pixel share by release decade.",
        svgLines({ xs: p.decades.map(x => x.decade), series: [{ values: p.decades.map(x => x.brightness), label: "brightness" }, { values: p.decades.map(x => x.saturation), label: "saturation", cls: "line-alt" }, { values: p.decades.map(x => x.dark_share), label: "dark share", cls: "line-train", muted: true }], yMin: 0, yFmt: t => t.toFixed(2), xFmt: x => `${x}s` }))}
      ${anCard("Does the poster predict the rating?", "Pearson correlation between each feature and a film's mean rating or its popularity (log ratings). |r| under 0.1 is negligible even when p is small.",
        `<div class="table-wrap"><table class="film-table report-table compact"><thead><tr><th>Feature</th><th class="num">r (rating)</th><th class="num">p</th><th class="num">r (popularity)</th><th class="num">p</th></tr></thead><tbody>
        ${p.correlations.map(c => `<tr><td>${FEATURE_LABELS[c.feature]}</td><td class="num ${Math.abs(c.r_mean) >= 0.1 ? "" : "muted"}">${c.r_mean.toFixed(2)}</td><td class="num muted">${c.p_mean < 0.001 ? "<0.001" : c.p_mean.toFixed(3)}</td><td class="num ${Math.abs(c.r_popularity) >= 0.1 ? "" : "muted"}">${c.r_popularity.toFixed(2)}</td><td class="num muted">${c.p_popularity < 0.001 ? "<0.001" : c.p_popularity.toFixed(3)}</td></tr>`).join("")}</tbody></table></div>`)}
    </div>
    <section class="an-section">
      <div class="section-head"><div><h2>Poster map</h2><p>Posters placed by visual similarity (t-SNE of standardized colour and composition features), so posters that look alike sit together. Hover to enlarge, click to find look-alikes.</p></div>
        <div class="tabs" id="p-mode"><button type="button" data-mode="posters" aria-pressed="true">Posters</button><button type="button" data-mode="dots" aria-pressed="false">Dominant colour</button></div></div>
      <div class="an-scatter tall" id="p-map"></div>
      <div id="p-similar"></div>
    </section>
    <section class="an-section">
      <div class="section-head"><h2>Extremes</h2><label class="an-inline">Feature <select id="p-extreme">${features.map(f => `<option value="${f}">${FEATURE_LABELS[f]}</option>`).join("")}</select></label></div>
      <div id="p-extremes"></div>
    </section></div>`;
  const genreBars = () => {
    const f = state.feature;
    const rows = [...p.genres].sort((a, b) => b.features[f].mean - a.features[f].mean);
    $("#p-genre-bars").innerHTML = hBars(rows, { value: g => g.features[f].mean, ci: g => g.features[f].ci, label: g => esc(g.genre), fmt: v => v.toFixed(3), note: g => `${g.posters}`, dot: true });
  };
  const posterCard = (f, score) => `<a class="an-poster" href="${AN.ds === "ml-latest-small" ? `#/film/${f.movieId}` : "#"}" data-film="${f.movieId}" title="${esc(f.title)}">${hasPoster(f.movieId) ? `<img src="/posters/${f.movieId}" alt="" loading="lazy">` : ""}<span>${filmName(f.title)}</span>${score != null ? `<span class="mono muted">${score.toFixed(2)}</span>` : ""}</a>`;
  const similar = async movieId => {
    const out = $("#p-similar");
    try {
      const data = await anApi(`/posters/similar?movie_id=${movieId}`);
      out.innerHTML = `<h3 class="report-h3">Posters that look like ${filmName(data.film.title)}</h3><div class="an-posters">${posterCard(data.film)}${data.similar.map(f => posterCard(f, f.score)).join("")}</div>`;
      out.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) { out.innerHTML = `<p class="muted">${esc(error.message)}</p>`; }
  };
  const extremes = () => {
    const f = $("#p-extreme").value, ex = p.examples[f];
    $("#p-extremes").innerHTML = `<div class="report-two"><div><span class="label">Lowest ${esc(FEATURE_LABELS[f].toLowerCase())}</span><div class="an-posters">${ex.low.map(x => posterCard(x)).join("")}</div></div>
      <div><span class="label">Highest ${esc(FEATURE_LABELS[f].toLowerCase())}</span><div class="an-posters">${ex.high.map(x => posterCard(x)).join("")}</div></div></div>`;
  };
  return {
    html,
    after: () => {
      $("#p-feature").addEventListener("change", e => { state.feature = e.target.value; genreBars(); });
      genreBars();
      let mode = "posters";
      const plot = () => scatter($("#p-map"), p.map, {
        x: q => q.s[0], y: q => q.s[1], height: 560, radius: 4.5, color: q => q.c, axes: false, outline: true,
        image: mode === "posters" ? q => (hasPoster(q.id) ? thumbUrl(q.id) : null) : null,
        tip: q => `${hasPoster(q.id) ? `<img src="/posters/${q.id}" alt="">` : ""}<b>${filmName(q.t)}</b><br><span class="mono">brightness ${num(q.b).toFixed(2)}</span>`,
        onClick: q => similar(q.id),
      });
      AN.redraw = plot;
      plot();
      $$("#p-mode [data-mode]").forEach(b => b.addEventListener("click", () => {
        mode = b.dataset.mode;
        $$("#p-mode [data-mode]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
        plot();
      }));
      $("#p-extreme").addEventListener("change", extremes);
      extremes();
      $("#p-root").addEventListener("click", event => {
        const card = event.target.closest(".an-poster[data-film]");
        if (card && AN.ds !== "ml-latest-small") { event.preventDefault(); similar(num(card.dataset.film)); }
      });
    },
  };
}

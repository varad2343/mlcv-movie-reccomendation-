// moctale — film recommendations front end.
"use strict";

const VERDICTS = [
  { key: "Perfection", pct: "perfection_pct" },
  { key: "Go for it", pct: "goforit_pct" },
  { key: "Timepass", pct: "timepass_pct" },
  { key: "Skip", pct: "skip_pct" },
];
const REVIEW_SORTS = [["newest", "Newest"], ["highest", "Highest rated"], ["lowest", "Lowest rated"]];

/* ---------- helpers ---------- */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const view = () => $("#view");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function safeUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url, location.origin);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch { return ""; }
}
const verdictClass = key => `v-${String(key || "").replace(/\s+/g, "-")}`;
const hueFor = id => Math.abs(num(id) * 2654435761) % 360;
const fmt = n => num(n).toLocaleString("en-US");

/** "Godfather, The (1972)" -> { name: "The Godfather", year: "1972" } */
function parseTitle(raw) {
  let name = String(raw || "").trim();
  let year = "";
  const match = name.match(/\s*\((\d{4})\)\s*$/);
  if (match) { year = match[1]; name = name.slice(0, match.index); }
  name = name.replace(/\s*\([^()]+\)$/, "");  // "Sanjuro (Tsubaki Sanjûrô)" -> "Sanjuro"
  name = name.replace(/^(.+?), (The|A|An|Les|La|Le|L'|Il|Das|Der|Die)$/, (_, base, article) => `${article}${article.endsWith("'") ? "" : " "}${base}`);
  return { name, year };
}
const genresOf = movie => String(movie.genres || "").split("|").filter(g => g && g !== "(no genres listed)");

function getVisitorId() {
  let id = null;
  try { id = localStorage.getItem("moctale-visitor-id"); } catch { /* storage blocked */ }
  if (!id) {
    id = globalThis.crypto?.randomUUID?.() || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const v = Math.random() * 16 | 0;
      return (c === "x" ? v : (v & 0x3 | 0x8)).toString(16);
    });
    try { localStorage.setItem("moctale-visitor-id", id); } catch { /* ignore */ }
  }
  return id;
}
function getViewer() {
  let id = 1;
  try { id = num(localStorage.getItem("moctale-viewer"), 1); } catch { /* ignore */ }
  return Math.min(610, Math.max(1, Math.round(id) || 1));
}
function setViewer(id) {
  const clean = Math.min(610, Math.max(1, Math.round(num(id, 1))));
  try { localStorage.setItem("moctale-viewer", String(clean)); } catch { /* ignore */ }
  $("#viewer-input").value = clean;
  return clean;
}

function toast(message, type = "info", ms = 3800) {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  $("#toast-region").append(el);
  setTimeout(() => el.remove(), ms);
}

const cache = new Map();
async function api(url, options) {
  const cacheable = !options;
  if (cacheable && cache.has(url)) return cache.get(url);
  const request = fetch(url, options).then(async response => {
    let data = null;
    try { data = await response.json(); } catch { /* non-JSON */ }
    if (!response.ok || (data && data.success === false)) throw new Error(data?.error || `Request failed (${response.status})`);
    return data;
  });
  if (cacheable) {
    cache.set(url, request);
    request.catch(() => cache.delete(url));
  }
  return request;
}
const qs = params => new URLSearchParams({ visitor_id: getVisitorId(), ...params }).toString();

/* ---------- pieces ---------- */
function poster(movie, { size = "", credit = false } = {}) {
  const { name } = parseTitle(movie.title);
  const src = safeUrl(movie.poster_url || movie.details?.poster || "");
  const attribution = movie.poster_attribution;
  const creditHtml = credit && src && attribution
    ? `<a class="poster-credit" href="${esc(safeUrl(attribution.source_url))}" target="_blank" rel="noopener noreferrer">${esc(attribution.artist || "Unknown")} · ${esc(attribution.license || "Open license")}</a>`
    : "";
  return `<div class="poster ${size} ${src ? "has-image" : ""}" data-film="${num(movie.movieId)}" style="--h:${hueFor(movie.movieId)}">
    <div class="poster-fallback" aria-hidden="true"><b>${esc(name)}</b></div>
    ${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">` : ""}${creditHtml}</div>`;
}

function verdictTag(moctale, { votes = false } = {}) {
  if (!moctale?.verdict) return "";
  const n = num(moctale.vote_count);
  const suffix = votes ? (moctale.estimated ? " · predicted" : ` · ${fmt(n)} ${n === 1 ? "vote" : "votes"}`) : "";
  return `<span class="verdict ${verdictClass(moctale.verdict)}">${esc(moctale.verdict)}${suffix}</span>`;
}

function filmCard(movie, note = "") {
  const { name, year } = parseTitle(movie.title);
  return `<a class="film-card" href="#/film/${num(movie.movieId)}" title="${esc(movie.title)}">
    ${poster(movie)}
    <span class="film-line"><span class="film-title">${esc(name)}</span><span class="film-year">${esc(year)}</span></span>
    <span class="film-sub">${verdictTag(movie.moctale)}${note ? `<span class="mono">${esc(note)}</span>` : ""}</span>
  </a>`;
}

function meter(moctale) {
  if (!moctale) return "";
  const bars = VERDICTS.map(v => `<i class="${verdictClass(v.key)}" style="flex:${num(moctale[v.pct])} 1 0"></i>`).join("");
  const legend = VERDICTS.map(v => `<span class="verdict ${verdictClass(v.key)}">${v.key} ${Math.round(num(moctale[v.pct]))}%</span>`).join("");
  return `<div class="meter-bar" role="img" aria-label="Verdict mix">${bars}</div><div class="meter-legend">${legend}</div>`;
}

function reviewParagraphs(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[*_]{1,2}([^*_\n]+)[*_]{1,2}/g, "$1")
    .split(/\n\s*\n|\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${esc(p)}</p>`)
    .join("");
}
const shortDate = iso => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
};
const scoreChip = rating => (rating == null ? "" : `<span class="score-chip">${num(rating).toFixed(0)}/10</span>`);

function reviewCard(review) {
  const { name } = parseTitle(review.title);
  const plain = String(review.content || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return `<a class="review-card" href="#/film/${num(review.movieId)}">
    ${poster({ movieId: review.movieId, title: review.title, poster_url: review.poster }, { size: "small" })}
    <div>
      <div class="review-top"><b>${esc(name)}</b><span aria-hidden="true">·</span><span>${esc(review.author)}</span>${scoreChip(review.rating)}${criticScores(review).slice(0, 2).map(([k, v]) => `<span class="critic-chip">${shortCritic[k]} ${esc(v)}</span>`).join("")}</div>
      <p class="review-excerpt">${esc(plain)}</p>
    </div>
  </a>`;
}

function reviewItem(review) {
  const long = String(review.content || "").length > 700;
  const wiki = review.source === "wikipedia";
  const byline = wiki
    ? "<b>Wikipedia</b><span class=\"muted\">Summary of published critics' reviews</span>"
    : `<b>${esc(review.author)}</b>${scoreChip(review.rating)}<span class="mono muted">${esc(shortDate(review.created_at))}</span>`;
  return `<article class="review">
    <div class="avatar" aria-hidden="true">${wiki ? "W" : esc(String(review.author || "?").trim().charAt(0))}</div>
    <div class="review-body">
      <div class="review-top">${byline}</div>
      <div class="review-text ${long ? "clamped" : ""}">${reviewParagraphs(review.content)}</div>
      <div class="review-actions">
        ${long ? `<button type="button" class="text-btn" data-expand>${wiki ? "Read more" : "Read the full review"}</button>` : ""}
        ${review.url ? `<a class="text-btn" href="${esc(safeUrl(review.url))}" target="_blank" rel="noopener noreferrer">Read on ${esc(review.source_name || "source")} ↗</a>` : ""}
      </div>
    </div>
  </article>`;
}

function syncNotice() {
  return `<div class="notice"><div><b>No film details cached yet.</b> Posters, summaries and critical reception come from Wikipedia. Run <code>python wikipedia_source.py --popular 500</code> and reload.</div></div>`;
}

// Rotten Tomatoes, Metacritic, IMDb, in that order, as [label, value] pairs.
const CRITIC_ORDER = ["Rotten Tomatoes", "Metacritic", "IMDb"];
const criticScores = details => CRITIC_ORDER.filter(k => details?.critic_scores?.[k]).map(k => [k, details.critic_scores[k]]);
const shortCritic = { "Rotten Tomatoes": "RT", Metacritic: "MC", IMDb: "IMDb" };

const skeletonRow = n => `<div class="row">${Array.from({ length: n }, () => '<div><div class="skeleton poster"></div><div class="skeleton sk-line"></div></div>').join("")}</div>`;
const errorBlock = message => `<div class="wrap"><div class="empty"><b>That didn't load.</b>${esc(message)}</div></div>`;

/* ---------- views ---------- */
let STATS = null;

async function renderHome() {
  const viewer = getViewer();
  view().innerHTML = `<section class="hero" id="hero"><div class="wrap"><div class="hero-copy"><div class="skeleton sk-line" style="width:240px"></div><div class="skeleton" style="height:84px;width:420px"></div></div></div></section>
    <div class="wrap">
      <section class="section" id="more"></section>
      <section class="section" id="because"></section>
      <section class="section" id="taste"></section>
      <section class="section split"><div id="top-mini"></div><div class="split-side" id="latest-mini"></div></section>
    </div>`;
  const recsPromise = api(`/api/recommend/user?${qs({ user_id: viewer, top_n: 13 })}`);
  loadTopMini();
  loadLatestMini();
  try {
    const data = await recsPromise;
    // Lead with the best match that has artwork; fetch details for it if none is cached yet.
    const recs = data.recommendations;
    const pick = recs.slice(0, 4).find(m => m.details?.poster) || recs[0];
    const rest = recs.filter(m => m !== pick);
    renderHero(pick, viewer);
    if (pick && !pick.details) {
      api(`/api/movies/${num(pick.movieId)}?${qs({ user_id: viewer })}`)
        .then(detail => { if ($("#hero") && detail.details) renderHero({ ...pick, details: detail.details }, viewer); })
        .catch(() => {});
    }
    $("#more").innerHTML = `<div class="section-head"><div><h2>More for viewer #${viewer}</h2><p>Taste, genre and poster similarity, re-ranked so the list doesn't repeat itself</p></div></div>
      <div class="row">${rest.map(m => filmCard(m, `${Math.round(num(m.hybrid_score) * 100)}%`)).join("")}</div>`;
    renderTaste(data.profile);
    const favorite = data.profile.top_favorites?.[0];
    if (favorite) loadBecause(favorite, viewer, new Set(data.recommendations.map(m => num(m.movieId))));
  } catch (error) {
    $("#hero").innerHTML = errorBlock(error.message);
  }
}

function renderHero(movie, viewer) {
  const hero = $("#hero");
  if (!movie) return;
  const { name, year } = parseTitle(movie.title);
  const t = movie.details || {};
  hero.style.setProperty("--h", hueFor(movie.movieId));
  const runtime = t.runtime ? `<span class="mono">${t.runtime} min</span>` : "";
  const cert = t.certification ? `<span class="mono">${esc(t.certification)}</span>` : "";
  const director = t.director ? `<span>Directed by ${esc(t.director)}</span>` : "";
  const poster = !t.backdrop && t.poster_large ? `<img class="hero-poster" src="${esc(safeUrl(t.poster_large))}" alt="Poster for ${esc(name)}">` : "";
  hero.classList.toggle("has-poster", Boolean(poster));
  hero.innerHTML = `${t.backdrop ? `<img class="hero-backdrop" src="${esc(safeUrl(t.backdrop))}" alt="">` : ""}
    ${poster ? `<img class="hero-glow" src="${esc(safeUrl(t.poster))}" alt="">` : ""}
    <div class="wrap hero-grid"><div class="hero-copy">
      <p class="kicker">Top pick for viewer #${viewer}</p>
      <h1>${esc(name)}</h1>
      <div class="meta"><span class="mono">${esc(year)}</span>${runtime}${cert}<span>${esc(genresOf(movie).join(" · "))}</span>${director}</div>
      ${t.overview ? `<p class="hero-overview">${esc(t.overview)}</p>` : ""}
      <div class="figures">
        ${criticScores(t).map(([k, v]) => `<div class="figure"><span class="label">${k}</span><b>${esc(v)}</b></div>`).join("")}
        ${t.rating != null ? `<div class="figure"><span class="label">${esc(t.source_name)}</span><b>${num(t.rating).toFixed(1)}</b></div>` : ""}
        <div class="figure"><span class="label">Predicted</span><b>${num(movie.predicted_rating).toFixed(1)} ★</b></div>
        <div class="figure"><span class="label">Match</span><b>${Math.round(num(movie.hybrid_score) * 100)}%</b></div>
        <div class="figure"><span class="label">Moctale</span>${verdictTag(movie.moctale, { votes: true })}</div>
      </div>
      <div class="hero-actions"><a class="btn btn-primary" href="#/film/${num(movie.movieId)}">View film</a><a class="btn btn-outline" href="#/browse?film=${num(movie.movieId)}">Find similar</a></div>
    </div>${poster}</div>
    ${t.backdrop ? `<span class="hero-credit">Backdrop: ${esc(t.source_name)}</span>` : ""}`;
}

function renderTaste(profile) {
  const genres = (profile.genre_share || []).slice(0, 5);
  const top = Math.max(...genres.map(g => num(g.share)), 1);
  const style = profile.moctale_style || {};
  $("#taste").innerHTML = `<div class="section-head"><div><h2>Viewer #${num(profile.userId)} at a glance</h2><p>What the recommendations above are built from</p></div></div>
    <div class="taste">
      <div class="taste-id"><b>${esc(profile.rating_style_label || "")}</b><p>${fmt(profile.total_ratings)} films rated, mostly ${esc(genres[0]?.genre || "varied genres")}.</p></div>
      <div><h3 class="label">Ratings</h3><div class="stats">
        <div><b>${num(profile.average_rating).toFixed(2)}</b><span class="label">Average</span></div>
        <div><b>±${num(profile.rating_stddev).toFixed(2)}</b><span class="label">Spread</span></div>
        <div><b>${Math.round(num(profile.endpoint_rating_share))}%</b><span class="label">½ or 5 stars</span></div>
        <div><b>${Math.round(num(profile.submission_velocity_per_month))}</b><span class="label">Per month</span></div>
      </div></div>
      <div><h3 class="label">Genres</h3><div class="bars">${genres.map(g => `<div class="bar"><span>${esc(g.genre)}</span><i style="--w:${num(g.share) / top * 100}%"></i><b>${Math.round(num(g.share))}%</b></div>`).join("")}</div></div>
      <div><h3 class="label">Verdicts given</h3>${meter(style)}</div>
    </div>`;
}

async function loadBecause(favorite, viewer, alreadyShown) {
  const { name } = parseTitle(favorite.title);
  const box = $("#because");
  box.innerHTML = `<div class="section-head"><div><h2>Because viewer #${viewer} gave ${esc(name)} ${num(favorite.rating)} stars</h2><p>Films with a similar feel</p></div></div>${skeletonRow(6)}`;
  try {
    const data = await api(`/api/recommend/movie?${qs({ query: favorite.title, user_id: viewer, top_n: 18 })}`);
    if (!$("#because")) return;
    const fresh = data.recommendations.filter(m => !alreadyShown.has(num(m.movieId))).slice(0, 6);
    box.innerHTML = `<div class="section-head"><div><h2>Because viewer #${viewer} gave ${esc(name)} ${num(favorite.rating)} stars</h2><p>Films with a similar feel</p></div><a class="link-more" href="#/browse?film=${num(data.target.movieId)}">See all</a></div>
      <div class="row">${fresh.map(m => filmCard(m)).join("")}</div>`;
  } catch {
    box.innerHTML = "";
  }
}

function topTable(movies, { compact = false } = {}) {
  const head = compact
    ? '<tr><th>#</th><th>Film</th><th class="num">Score</th><th class="num">Ratings</th></tr>'
    : '<tr><th>#</th><th>Film</th><th>Genres</th><th class="num">Bayesian</th><th class="num">Average</th><th class="num">Ratings</th><th class="num">Tomatometer</th><th class="num">Metacritic</th><th>Moctale</th></tr>';
  const rows = movies.map((m, i) => {
    const { name, year } = parseTitle(m.title);
    const film = `<div class="film-cell">${poster(m, { size: "small" })}<div><a href="#/film/${num(m.movieId)}">${esc(name)}</a><span>${esc(year)}</span></div></div>`;
    return compact
      ? `<tr data-href="#/film/${num(m.movieId)}"><td class="rank">${i + 1}</td><td>${film}</td><td class="num gold">${num(m.bayesian_score).toFixed(2)}</td><td class="num">${fmt(m.rating_count)}</td></tr>`
      : `<tr data-href="#/film/${num(m.movieId)}"><td class="rank">${i + 1}</td><td>${film}</td><td class="muted">${esc(genresOf(m).slice(0, 3).join(", "))}</td>
          <td class="num gold">${num(m.bayesian_score).toFixed(2)}</td><td class="num">${num(m.raw_average).toFixed(2)}</td><td class="num">${fmt(m.rating_count)}</td>
          <td class="num">${esc(m.details?.critic_scores?.["Rotten Tomatoes"] || "—")}</td><td class="num">${esc(m.details?.critic_scores?.Metacritic || "—")}</td><td>${verdictTag(m.moctale)}</td></tr>`;
  }).join("");
  return `<div class="table-wrap"><table class="film-table"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
}

async function loadTopMini() {
  const box = $("#top-mini");
  try {
    const data = await api(`/api/top-rated?${qs({ top_n: 6 })}`);
    if (!$("#top-mini")) return;
    box.innerHTML = `<div class="section-head"><div><h2>Top rated on MovieLens</h2><p>Bayesian average, so a handful of votes can't top the list</p></div><a class="link-more" href="#/top">See all</a></div>${topTable(data.movies, { compact: true })}`;
  } catch (error) { box.innerHTML = ""; }
}

async function loadLatestMini() {
  const box = $("#latest-mini");
  try {
    const data = await api("/api/reviews/latest?limit=3");
    if (!$("#latest-mini")) return;
    box.innerHTML = `<div class="section-head"><div><h2>What critics said</h2><p>Critical reception, as summarized on Wikipedia</p></div><a class="link-more" href="#/reviews">See all</a></div>
      ${data.reviews.length ? data.reviews.map(reviewCard).join("") : syncNotice()}`;
  } catch { box.innerHTML = ""; }
}

async function renderFilm(movieId) {
  view().innerHTML = `<div class="film-page"><div class="film-backdrop"></div><div class="wrap"><div class="film-head"><div class="skeleton poster"></div><div class="film-info"><div class="skeleton" style="height:72px;width:60%"></div><div class="skeleton sk-line" style="width:40%"></div></div></div></div></div>`;
  let data;
  try {
    data = await api(`/api/movies/${movieId}?${qs({ user_id: getViewer() })}`);
  } catch (error) {
    view().innerHTML = errorBlock(error.message);
    return;
  }
  const { movie, details: t } = data;
  const tm = t || {};
  const { name, year } = parseTitle(movie.title);
  document.title = `${name} (${year}) — moctale`;
  const ml = movie.movielens;
  const criticNotes = { "Rotten Tomatoes": "critics positive", Metacritic: "weighted critic score", IMDb: "user rating" };
  const facts = [
    ...criticScores(tm).map(([k, v]) => [k, v, criticNotes[k]]),
    tm.rating != null ? [tm.source_name, num(tm.rating).toFixed(1), `${fmt(tm.rating_count)} votes`] : null,
    ml ? ["MovieLens", num(ml.mean).toFixed(2), `${fmt(ml.count)} ratings · ${ml.rank ? `rank #${ml.rank}` : "unranked"}`] : ["MovieLens", "—", "no ratings yet"],
  ].filter(Boolean).slice(0, 4);
  const myVote = movie.moctale?.my_vote;
  const links = [
    t?.url ? `<a class="link-more" href="${esc(safeUrl(t.url))}" target="_blank" rel="noopener noreferrer">${esc(t.source_name)} ↗</a>` : "",
    movie.imdb_url ? `<a class="link-more" href="${esc(safeUrl(movie.imdb_url))}" target="_blank" rel="noopener noreferrer">IMDb ↗</a>` : "",
  ].join("");
  const tags = (data.tags || []).slice(0, 14);
  const onlyReception = data.reviews.length > 0 && data.reviews.every(r => r.source === "wikipedia");
  const backdrop = tm.backdrop
    ? `<img src="${esc(safeUrl(tm.backdrop))}" alt="">`
    : (tm.poster ? `<img class="blurred" src="${esc(safeUrl(tm.poster))}" alt="">` : "");

  view().innerHTML = `<div class="film-page" style="--h:${hueFor(movie.movieId)}">
    <div class="film-backdrop">${backdrop}</div>
    <div class="wrap">
      <div class="film-head">
        <div class="film-side">
          ${poster({ ...movie, poster_url: tm.poster_large || movie.poster_url }, { credit: true })}
          <div><p class="label" style="margin:0 0 8px">Your verdict</p>
            <div class="vote-list" role="group" aria-label="Your verdict">${VERDICTS.map(v => `<button type="button" class="vote-btn ${verdictClass(v.key)}" data-vote="${v.key}" aria-pressed="${myVote === v.key}">${v.key}</button>`).join("")}</div>
          </div>
        </div>
        <div class="film-info">
          <h1>${esc(name)}</h1>
          <div class="meta"><span class="mono">${esc(year)}</span>${tm.runtime ? `<span class="mono">${tm.runtime} min</span>` : ""}${tm.certification ? `<span class="mono">${esc(tm.certification)}</span>` : ""}${tm.language ? `<span class="mono">${esc(tm.language.toUpperCase())}</span>` : ""}<span>${esc(genresOf(movie).join(" · "))}</span>${tm.director ? `<span>Directed by ${esc(tm.director)}</span>` : ""}</div>
          ${tm.tagline ? `<p class="tagline">“${esc(tm.tagline)}”</p>` : ""}
          ${tm.overview ? `<p class="overview">${esc(tm.overview)}</p>` : ""}
          <div class="facts">${facts.map(([k, v, n]) => `<div class="fact"><span class="label">${k}</span><b>${v}</b><span>${esc(n)}</span></div>`).join("")}</div>
          <div id="film-meter"><div class="meter-head"><span class="label">Moctale verdict</span>${verdictTag(movie.moctale, { votes: true })}</div>${meter(movie.moctale)}</div>
          ${tags.length ? `<div><p class="label" style="margin:0 0 10px">Tagged by MovieLens viewers</p><div class="tag-list">${tags.map(g => `<span class="tag">${esc(g.tag)}${g.viewers > 1 ? `<span class="mono">${g.viewers}</span>` : ""}</span>`).join("")}</div></div>` : ""}
          <div class="film-links">${links}</div>
          ${t ? "" : `<div class="notice"><div><b>No details found for this film.</b> It has no matching English Wikipedia article.</div></div>`}
        </div>
      </div>
      <div class="film-body">
        <section>
          <div class="section-head"><h2>${onlyReception ? "Critical reception" : "Reviews"}${onlyReception ? "" : `<span class="count">${fmt(data.review_count)}</span>`}</h2>
            ${data.review_count > 1 ? `<div class="tabs" role="group" aria-label="Sort reviews">${REVIEW_SORTS.map(([k, l], i) => `<button type="button" data-sort="${k}" aria-pressed="${i === 0}">${l}</button>`).join("")}</div>` : ""}
          </div>
          <div id="review-list">${data.reviews.length ? data.reviews.map(reviewItem).join("") : `<div class="empty"><b>No reviews yet.</b>The Wikipedia article for this film has no critical reception section.</div>`}</div>
        </section>
        <aside>
          <div class="section-head"><h2>More like this</h2></div>
          <div class="similar-list">${data.similar.map(m => {
            const p = parseTitle(m.title);
            return `<a class="similar" href="#/film/${num(m.movieId)}">${poster(m, { size: "small" })}<div><b>${esc(p.name)}</b><span>${esc(p.year)}</span></div>${verdictTag(m.moctale)}</a>`;
          }).join("")}</div>
        </aside>
      </div>
    </div>
  </div>`;
  window.scrollTo(0, 0);
  $$(".vote-btn").forEach(button => button.addEventListener("click", () => castVote(movie.movieId, button)));
  $$(".tabs [data-sort]").forEach(button => button.addEventListener("click", () => sortReviews(movie.movieId, button)));
}

async function sortReviews(movieId, button) {
  $$(".tabs [data-sort]").forEach(b => b.setAttribute("aria-pressed", String(b === button)));
  const data = await api(`/api/movies/${movieId}/reviews?sort=${button.dataset.sort}&limit=20`);
  $("#review-list").innerHTML = data.reviews.map(reviewItem).join("");
}

async function castVote(movieId, button) {
  const vote = button.dataset.vote;
  $$(".vote-btn").forEach(b => { b.disabled = true; });
  try {
    const data = await api(`/api/movies/${movieId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitor_id: getVisitorId(), vote }),
    });
    $$(".vote-btn").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.vote === vote)));
    $("#film-meter").innerHTML = `<div class="meter-head"><span class="label">Moctale verdict</span>${verdictTag(data.moctale, { votes: true })}</div>${meter(data.moctale)}`;
    cache.clear();
    toast(`Saved your verdict: ${vote}. Your recommendations will use it.`);
  } catch (error) {
    toast(error.message || "Couldn't save your verdict.", "error");
  } finally {
    $$(".vote-btn").forEach(b => { b.disabled = false; });
  }
}

async function renderBrowse(params) {
  const filmId = params.get("film");
  const starts = [["Toy Story (1995)", "Toy Story"], ["Inception (2010)", "Inception"], ["Godfather, The (1972)", "The Godfather"], ["Spirited Away (Sen to Chihiro no kamikakushi) (2001)", "Spirited Away"], ["Pulp Fiction (1994)", "Pulp Fiction"], ["Amelie (Fabuleux destin d'Amélie Poulain, Le) (2001)", "Amélie"]];
  view().innerHTML = `<div class="wrap">
    <header class="page-head"><p class="kicker">Browse</p><h1>Start from a film you love</h1><p>Search above, or pick one of these. Matches mix genre, poster style and how viewer #${getViewer()} rates.</p>
      <div class="meta" style="margin-top:16px">${starts.map(([q, l]) => `<button type="button" class="chip" data-query="${esc(q)}">${esc(l)}</button>`).join("")}</div></header>
    <section class="section" id="browse-results"></section></div>`;
  $$("[data-query]").forEach(b => b.addEventListener("click", () => loadSimilar(b.dataset.query)));
  if (filmId) loadSimilar(filmId);
}

async function loadSimilar(query) {
  const box = $("#browse-results");
  box.innerHTML = skeletonRow(6);
  try {
    const data = await api(`/api/recommend/movie?${qs({ query, user_id: getViewer(), top_n: 18 })}`);
    const t = data.target;
    const { name, year } = parseTitle(t.title);
    $$("[data-query]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.query === t.title)));
    box.innerHTML = `<div class="section-head"><div><h2>Like ${esc(name)} <span class="count">${esc(year)}</span></h2><p>${esc(genresOf(t).join(" · "))}</p></div><a class="link-more" href="#/film/${num(t.movieId)}">Open ${esc(name)}</a></div>
      <div class="meta" id="verdict-filter" style="margin-bottom:24px">${["All", ...VERDICTS.map(v => v.key)].map((k, i) => `<button type="button" class="chip" data-filter="${esc(k)}" aria-pressed="${i === 0}">${esc(k)}</button>`).join("")}</div>
      <div class="grid">${data.recommendations.map(m => `<div data-verdict="${esc(m.moctale?.verdict || "")}">${filmCard(m, `${Math.round(num(m.hybrid_score) * 100)}%`)}</div>`).join("")}</div>`;
    $$("[data-filter]", box).forEach(b => b.addEventListener("click", () => {
      $$("[data-filter]", box).forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      $$(".grid > [data-verdict]", box).forEach(card => { card.hidden = b.dataset.filter !== "All" && card.dataset.verdict !== b.dataset.filter; });
    }));
  } catch (error) {
    box.innerHTML = `<div class="empty"><b>No match for that title.</b>${esc(error.message)}</div>`;
  }
}

async function renderTop() {
  view().innerHTML = `<div class="wrap"><header class="page-head"><p class="kicker">Top rated</p><h1>The films that hold up</h1><p>Ranked by a Bayesian average over the MovieLens ratings. Films need at least 50 ratings, and each score is pulled toward the overall mean until enough people agree.</p></header><section class="section" id="top-list">${skeletonRow(6)}</section></div>`;
  try {
    const data = await api(`/api/top-rated?${qs({ top_n: 30 })}`);
    $("#top-list").innerHTML = topTable(data.movies);
  } catch (error) { $("#top-list").innerHTML = errorBlock(error.message); }
}

async function renderReviews() {
  view().innerHTML = `<div class="wrap"><header class="page-head"><p class="kicker">Reviews</p><h1>What critics said</h1><p>How critics received each film, as summarized on Wikipedia, with Rotten Tomatoes and Metacritic scores. Open a film for the full text and what MovieLens viewers tagged it.</p></header><section class="section" id="feed"></section></div>`;
  try {
    const data = await api("/api/reviews/latest?limit=30");
    $("#feed").innerHTML = data.reviews.length ? `<div class="feed">${data.reviews.map(reviewCard).join("")}</div>` : syncNotice();
  } catch (error) { $("#feed").innerHTML = errorBlock(error.message); }
}

/* ---------- Data: project report ---------- */
const REPORT_SECTIONS = [
  ["problem", "Problem and data"],
  ["approach", "Approach"],
  ["results", "Experiments and results"],
  ["inside", "Inside the model"],
  ["built", "What we built"],
  ["limits", "Limitations and next steps"],
  ["patterns", "Rating patterns"],
];
const f3 = n => num(n).toFixed(3);
const f4 = n => num(n).toFixed(4);
const signed = (n, digits = 3) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}`;

async function renderData() {
  const s = STATS || {};
  view().innerHTML = `<div class="wrap report">
    <header class="page-head">
      <p class="kicker">ML project report · Movie recommendation system</p>
      <h1>Collaborative filtering, content-based filtering, and a hybrid</h1>
      <p>What we built on the MovieLens dataset, how matrix factorization and similarity metrics drive the recommendations, and how each model scored in our evaluation.</p>
      <p class="report-meta" id="report-meta">Loading evaluation results…</p>
    </header>
    <nav class="report-toc" aria-label="Report sections">${REPORT_SECTIONS.map(([id, label], i) => `<a href="#/data" data-jump="${id}"><span class="mono">${i + 1}</span>${label}</a>`).join("")}</nav>
    <div id="report-body"><div class="skeleton" style="height:320px;margin-top:40px"></div></div>
  </div>`;
  $$(".report-toc [data-jump]").forEach(a => a.addEventListener("click", event => {
    event.preventDefault();
    document.getElementById(`r-${a.dataset.jump}`)?.scrollIntoView({ behavior: "smooth" });
  }));
  let m;
  try {
    m = (await api("/api/report")).metrics;
  } catch (error) {
    $("#report-meta").textContent = "";
    $("#report-body").innerHTML = `<div class="notice" style="margin-top:32px"><div><b>No evaluation results yet.</b> Run <code>python evaluate.py</code> (about 5 minutes), then reload this page.</div></div>`;
    return;
  }
  $("#report-meta").innerHTML = `Evaluated ${esc(new Date(m.generated_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }))} · ${m.settings.folds}-fold cross-validation · seed ${m.settings.seed} · Surprise ${esc(m.environment.surprise)} · reproduce with <code>python evaluate.py</code>`;
  $("#report-body").innerHTML = [reportProblem(m, s), reportApproach(m), reportResults(m), reportInside(), reportBuilt(s), reportLimits(m), reportPatterns()].join("");
  setupInside();
}

function reportSection(id, index, title, body, lead = "") {
  return `<section class="report-section" id="r-${id}">
    <div class="report-side"><span class="mono">${index}</span></div>
    <div class="report-main"><h2>${title}</h2>${lead ? `<p class="report-lead">${lead}</p>` : ""}${body}</div>
  </section>`;
}

function reportProblem(m, s) {
  const d = m.dataset;
  return reportSection("problem", 1, "Problem and data", `
    <div class="prose">
      <p><b>Task.</b> Recommend films a person hasn't seen yet, ranked by how much they're likely to enjoy them. We cover both families from the brief: <b>collaborative filtering</b> (learn from the ratings of everyone) and <b>content-based filtering</b> (learn from what a film is). A hybrid combines them.</p>
      <p><b>Data.</b> The MovieLens Small dataset (GroupLens, Harper &amp; Konstan 2015): explicit ratings from 0.5 to 5 stars in half-star steps, each tied to a user, a film and a timestamp. We add genre labels, free-text viewer tags, IMDb/TMDB links, and film details from Wikipedia/Wikidata for display.</p>
    </div>
    <div class="dataset report-figures">
      <div><span class="label">Ratings</span><b>${fmt(d.ratings)}</b><span>mean ${num(d.mean_rating).toFixed(2)} stars</span></div>
      <div><span class="label">Users</span><b>${fmt(d.users)}</b><span>median ${fmt(d.ratings_per_user_median)} ratings each</span></div>
      <div><span class="label">Films rated</span><b>${fmt(d.rated_movies)}</b><span>of ${fmt(d.catalog_movies)} in the catalog</span></div>
      <div><span class="label">Sparsity</span><b>${num(d.sparsity_pct).toFixed(1)}%</b><span>of the user × film matrix is empty</span></div>
      <div><span class="label">Long tail</span><b>${num(d.movies_with_one_rating_pct).toFixed(0)}%</b><span>of films have a single rating</span></div>
    </div>
    <div class="prose"><p>The ratings matrix is ${num(d.sparsity_pct).toFixed(1)}% empty, and ${num(d.movies_with_one_rating_pct).toFixed(0)}% of films have only one rating. Comparing users row by row has little overlap to work with, and a film with no ratings is invisible to collaborative filtering (the <i>cold-start</i> problem). Both facts shaped the design below. ${num(d.liked_share_pct).toFixed(0)}% of ratings are 4 stars or more, which we treat as "liked" when scoring top-10 lists.</p></div>`);
}

function reportApproach(m) {
  const p = m.settings.app_svd;
  const methods = [
    ["Collaborative", "Matrix factorization (SVD)", `Each user <i>u</i> and film <i>i</i> gets a vector of ${p.n_factors} latent factors. A rating is predicted as
      <div class="formula">r̂<sub>ui</sub> = μ + b<sub>u</sub> + b<sub>i</sub> + p<sub>u</sub> · q<sub>i</sub></div>
      μ is the global mean, b<sub>u</sub> and b<sub>i</sub> are user and film biases, and the dot product captures taste. The factors are learned by stochastic gradient descent, minimizing squared error on known ratings plus L2 regularization λ(b<sub>u</sub>² + b<sub>i</sub>² + ‖p<sub>u</sub>‖² + ‖q<sub>i</sub>‖²). Settings: ${p.n_factors} factors, ${p.n_epochs} epochs, learning rate ${p.lr_all}, λ = ${p.reg_all}.`, "recommend.py · get_svd_model"],
    ["Collaborative", "Neighbourhood (user KNN)", `Predict a rating from the <i>k</i> most similar users who rated the film, weighted by similarity. We compared four similarity metrics:
      <ul class="metric-list">
        <li><b>Cosine</b>: angle between two users' rating vectors</li>
        <li><b>Mean squared difference</b>: 1 / (MSD + 1) over co-rated films</li>
        <li><b>Pearson</b>: correlation after subtracting each user's mean, so a harsh rater and a generous one can still agree</li>
        <li><b>Pearson-baseline</b>: correlation of residuals after removing the baseline biases, shrunk toward 0 when few films are shared</li>
      </ul>`, "evaluate.py"],
    ["Content-based", "Genre TF-IDF + cosine", `Each film's genres (${m.dataset.genre_terms} terms) become a TF-IDF vector, so a rare genre like Film-Noir carries more weight than Drama. Similarity is the cosine of two vectors: 1 for identical genre profiles, 0 for none in common. It works for a brand-new user who names one film they like, and for a film nobody has rated.`, "recommend.py · init_content_based"],
    ["Hybrid", "Weighted blend + MMR re-rank", `The shown score is 50% SVD (predicted rating scaled to 0–1) + 30% genre similarity to the films the viewer rated 4+ + 20% poster similarity. A missing signal's weight is shared out among the others. Then <b>maximal marginal relevance</b> picks films one at a time by 0.82 × relevance − 0.18 × (highest similarity to a film already picked), so the list doesn't fill up with near-duplicates. Similarity there is poster cosine when both films have poster vectors, genre cosine otherwise.`, "recommend.py · _combine_scores, _mmr_order"],
    ["Computer vision", "Poster embeddings (ResNet-18)", `A pretrained ResNet-18 with its classifier removed turns each poster into a 512-dimensional vector; cosine similarity of these vectors is the "poster" signal. <b>Currently inactive</b>: it needs PyTorch (<code>requirements-vision.txt</code>) and local poster files, neither of which is installed, so its 20% is redistributed.`, "visual_embeddings.py"],
    ["Ranking", "Bayesian average", `"Top rated" uses (n · mean + 50 · μ) / (n + 50): a film's mean is pulled toward the global mean μ until it has enough ratings, so a film with three 5-star ratings can't outrank one with three hundred.`, "app.py · _movielens_stats"],
  ];
  return reportSection("approach", 2, "Approach", `
    <div class="pipeline" aria-label="Recommendation pipeline">
      <div class="pipe-col"><span class="label">Signals</span><div class="pipe-box">Ratings → SVD <span class="mono">50%</span></div><div class="pipe-box">Genres → TF-IDF cosine <span class="mono">30%</span></div><div class="pipe-box muted-box">Posters → ResNet-18 <span class="mono">20%</span></div></div>
      <div class="pipe-arrow" aria-hidden="true">→</div>
      <div class="pipe-col"><span class="label">Combine</span><div class="pipe-box">Weighted blend</div><div class="pipe-box">MMR diversity re-rank</div></div>
      <div class="pipe-arrow" aria-hidden="true">→</div>
      <div class="pipe-col"><span class="label">Output</span><div class="pipe-box">Top-N unseen films</div><div class="pipe-box">Why: match %, taste / genre split</div></div>
    </div>
    <div class="method-grid">${methods.map(([family, name, body, where]) => `<article class="method"><span class="label">${family}</span><h3>${name}</h3><div class="prose">${body}</div><span class="method-where mono">${where}</span></article>`).join("")}</div>`,
    "Two families of recommender, a hybrid on top, and two supporting pieces.");
}

function reportResults(m) {
  const rows = [...m.rating_prediction].sort((a, b) => a.rmse - b.rmse);
  const baseline = m.rating_prediction.find(r => r.model.startsWith("Global"));
  const random = m.rating_prediction.find(r => r.model.startsWith("Random"));
  const app = m.rating_prediction.find(r => r.model.includes("used in the app"));
  const best = rows[0];
  const knn = rows.filter(r => r.family === "neighbourhood");
  const sweep = m.factor_sweep;
  const firstF = sweep[0], lastF = sweep[sweep.length - 1];
  const rank = [...m.ranking].sort((a, b) => b.precision_at_10 - a.precision_at_10);
  const randomRank = m.ranking.find(r => r.model.startsWith("Random"));
  const h = m.hybrid_vs_svd;
  const findings = [
    `<b>${esc(best.model)}</b> had the lowest error (RMSE ${f4(best.rmse)}), ${((1 - best.rmse / random.rmse) * 100).toFixed(0)}% below random guessing and ${(baseline.rmse - best.rmse).toFixed(3)} below the bias-only baseline.`,
    `The tuned SVD used in the app scored ${f4(app.rmse)} ± ${f4(app.rmse_std)}. Biases alone already reach ${f4(baseline.rmse)}: most of what's predictable is "this user rates high" and "this film is liked"; the latent factors add the last ${(baseline.rmse - app.rmse).toFixed(3)}.`,
    `Similarity metric matters for KNN: ${esc(knn[0].similarity.replace("_", "-"))} (${f4(knn[0].rmse)}) beat ${esc(knn[knn.length - 1].similarity.replace("_", "-"))} (${f4(knn[knn.length - 1].rmse)}). Metrics that correct for each user's rating scale and shrink sparse overlaps do better on data this sparse.`,
    `More latent factors keep lowering training error (${f4(firstF.train_rmse)} → ${f4(lastF.train_rmse)} from ${firstF.factors} to ${lastF.factors} factors) while test error moves only ${f4(firstF.test_rmse)} → ${f4(lastF.test_rmse)}. The widening train/test gap is the model fitting its training ratings ever more closely; with λ = ${m.settings.app_svd.reg_all}, test error hasn't started rising yet, so extra factors cost fit time more than accuracy.`,
    `For top-10 lists, ${esc(rank[0].model)} had the best precision@10 (${(rank[0].precision_at_10 * 100).toFixed(1)}%, against ${(randomRank.precision_at_10 * 100).toFixed(1)}% for random ordering). Lowest RMSE and best ranking don't have to be the same model.`,
    hybridFinding(h),
  ];
  const table = `<div class="table-wrap"><table class="film-table report-table">
    <thead><tr><th>Model</th><th>Family</th><th class="num">RMSE</th><th class="num">± sd</th><th class="num">MAE</th><th class="num">vs bias baseline</th><th class="num">Fit (s)</th></tr></thead>
    <tbody>${rows.map(r => {
      const delta = r.rmse - baseline.rmse;
      return `<tr class="${r === app ? "is-app" : ""}"><td>${esc(r.model)}${r === app ? ' <span class="app-tag">in app</span>' : ""}</td><td class="muted">${esc(r.family)}</td>
        <td class="num">${f4(r.rmse)}</td><td class="num muted">${f4(r.rmse_std)}</td><td class="num">${f4(r.mae)}</td>
        <td class="num ${delta < 0 ? "good" : delta > 0 ? "bad" : "muted"}">${r === baseline ? "—" : signed(delta)}</td><td class="num muted">${num(r.fit_seconds).toFixed(1)}</td></tr>`;
    }).join("")}</tbody></table></div>`;
  return reportSection("results", 3, "Experiments and results", `
    <h3 class="report-h3">Key findings</h3>
    <ol class="findings">${findings.map(f => `<li>${f}</li>`).join("")}</ol>

    <h3 class="report-h3">3.1 Rating prediction</h3>
    <p class="report-note">${m.settings.folds}-fold cross-validation on all ${fmt(m.dataset.ratings)} ratings; lower is better. RMSE penalizes big misses; MAE is the average miss in stars. User-based KNN uses k = 40.</p>
    ${table}

    <div class="report-two">
      <div>
        <h3 class="report-h3">3.2 Latent factors: fit vs. generalization</h3>
        <p class="report-note">SVD with the app's settings, varying only the number of factors. 80/20 split.</p>
        ${factorChart(sweep)}
      </div>
      <div>
        <h3 class="report-h3">3.3 Similarity metrics and neighbourhood size</h3>
        <p class="report-note">User KNN, ${m.settings.folds}-fold RMSE by similarity metric, then Pearson-baseline RMSE by k.</p>
        <div class="table-wrap"><table class="film-table report-table compact">
          <thead><tr><th>Similarity</th><th class="num">RMSE</th><th class="num">MAE</th></tr></thead>
          <tbody>${knn.map(r => `<tr><td>${esc(r.similarity.replace("_", "-"))}</td><td class="num">${f4(r.rmse)}</td><td class="num">${f4(r.mae)}</td></tr>`).join("")}</tbody></table></div>
        <div class="table-wrap"><table class="film-table report-table compact" style="margin-top:16px">
          <thead><tr><th>Neighbours k</th>${m.k_sweep.map(r => `<th class="num">${r.k}</th>`).join("")}</tr></thead>
          <tbody><tr><td>RMSE</td>${m.k_sweep.map(r => `<td class="num">${f4(r.test_rmse)}</td>`).join("")}</tr></tbody></table></div>
      </div>
    </div>

    <div class="report-two">
      <div>
        <h3 class="report-h3">3.4 Top-10 ranking quality</h3>
        <p class="report-note">For each test user, rank their held-out films by predicted rating. A film is relevant if they actually rated it ${m.settings.liked_threshold}+; it counts as recommended if predicted ${m.settings.liked_threshold}+ and in the top ${m.settings.top_n}. Only films the user actually rated are ranked, and most ratings are positive, so even random ordering scores well; read each model against that floor.</p>
        <div class="table-wrap"><table class="film-table report-table compact">
          <thead><tr><th>Model</th><th class="num">Precision@10</th><th class="num">Recall@10</th></tr></thead>
          <tbody>${rank.map(r => `<tr><td>${esc(r.model)}</td><td class="num">${(r.precision_at_10 * 100).toFixed(1)}%</td><td class="num">${(r.recall_at_10 * 100).toFixed(1)}%</td></tr>`).join("")}</tbody></table></div>
      </div>
      <div>
        <h3 class="report-h3">3.5 What the hybrid score and the re-rank change</h3>
        <p class="report-note">Top-10 lists for ${h.users} random users. Diversity = 1 − mean genre cosine between titles in a list (higher = more varied).</p>
        ${hybridTable(h)}
      </div>
    </div>`, "Every number on this page comes from outputs/report/metrics.json, written by evaluate.py.");
}

function hybridTable(h) {
  const cols = [["Plain SVD", h.svd], ...(h.hybrid ? [["Hybrid", h.hybrid]] : []), ["Hybrid + MMR (app)", h.hybrid_mmr]];
  const row = (label, pick) => `<tr><td>${label}</td>${cols.map(([, v]) => `<td class="num">${pick(v)}</td>`).join("")}</tr>`;
  return `<div class="table-wrap"><table class="film-table report-table compact">
    <thead><tr><th></th>${cols.map(([l]) => `<th class="num">${l}</th>`).join("")}</tr></thead>
    <tbody>
      ${row("Catalog coverage", v => `${num(v.coverage_pct).toFixed(1)}%`)}
      ${row("Distinct titles recommended", v => fmt(v.unique_titles))}
      ${row("Genre diversity within a list", v => f3(v.genre_diversity))}
      ${row("Median ratings per recommended film", v => num(v.median_ratings_per_title).toFixed(0))}
    </tbody></table></div>`;
}

function hybridFinding(h) {
  const svd = h.svd, mmr = h.hybrid_mmr, hyb = h.hybrid;
  if (!hyb) {
    return `Across ${h.users} users, hybrid + MMR lists cover ${num(mmr.coverage_pct).toFixed(1)}% of the catalog versus ${num(svd.coverage_pct).toFixed(1)}% for plain SVD; genre diversity ${f3(mmr.genre_diversity)} versus ${f3(svd.genre_diversity)}.`;
  }
  const narrower = hyb.genre_diversity < svd.genre_diversity;
  const recovered = mmr.genre_diversity - hyb.genre_diversity;
  return `Adding genre similarity to the score makes lists ${narrower ? "narrower" : "broader"} (genre diversity ${f3(svd.genre_diversity)} → ${f3(hyb.genre_diversity)}): it pulls toward the genres a viewer already rates highly. The MMR re-rank ${recovered > 0 ? `wins back ${recovered.toFixed(3)} of that (→ ${f3(mmr.genre_diversity)})` : `changes it by ${signed(recovered)}`}, and the three variants recommend ${fmt(svd.unique_titles)}, ${fmt(hyb.unique_titles)} and ${fmt(mmr.unique_titles)} distinct titles across ${h.users} users.`;
}

function factorChart(sweep) {
  const W = 560, H = 250, L = 56, R = 76, T = 16, B = 40;
  const xs = sweep.map(r => Math.log(r.factors));
  const values = sweep.flatMap(r => [r.test_rmse, r.train_rmse]);
  const lo = Math.floor(Math.min(...values) * 20) / 20, hi = Math.ceil(Math.max(...values) * 20) / 20;
  const x = v => L + (v - xs[0]) / (xs[xs.length - 1] - xs[0]) * (W - L - R);
  const y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  const ticks = [];
  for (let t = lo; t <= hi + 1e-9; t += 0.05) ticks.push(+t.toFixed(2));
  const line = key => sweep.map((r, i) => `${i ? "L" : "M"}${x(xs[i]).toFixed(1)},${y(r[key]).toFixed(1)}`).join("");
  const last = sweep[sweep.length - 1];
  return `<figure class="svg-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Train and test RMSE by number of SVD factors">
    ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${L - 8}" y="${y(t) + 4}" class="tick" text-anchor="end">${t.toFixed(2)}</text>`).join("")}
    ${sweep.map((r, i) => `<text x="${x(xs[i])}" y="${H - B + 18}" class="tick" text-anchor="middle">${r.factors}</text>`).join("")}
    <text x="${(L + W - R) / 2}" y="${H - 4}" class="axis" text-anchor="middle">latent factors (log scale)</text>
    <path d="${line("train_rmse")}" class="line-train"/>
    <path d="${line("test_rmse")}" class="line-test"/>
    ${sweep.map((r, i) => `<circle cx="${x(xs[i])}" cy="${y(r.test_rmse)}" r="3" class="dot-test"/><circle cx="${x(xs[i])}" cy="${y(r.train_rmse)}" r="3" class="dot-train"/>`).join("")}
    <text x="${W - R + 8}" y="${y(last.test_rmse) + 4}" class="series">test</text>
    <text x="${W - R + 8}" y="${y(last.train_rmse) + 4}" class="series muted-series">train</text>
  </svg></figure>`;
}

function reportInside() {
  const pairs = [[1, 2355, "Toy Story · A Bug's Life"], [79132, 2571, "Inception · The Matrix"], [318, 356, "Shawshank · Forrest Gump"], [260, 1196, "Star Wars IV · V"], [1, 2959, "Toy Story · Fight Club"]];
  return reportSection("inside", 4, "Inside the model", `
    <div class="inside-block">
      <h3 class="report-h3">4.1 One prediction, term by term</h3>
      <p class="report-note">The app's trained SVD, opened up. Pick a film; the viewer is the one selected in the header.</p>
      <div class="inside-controls">${filmPicker("explain")}</div>
      <div id="explain-out" class="explain"></div>
    </div>
    <div class="inside-block">
      <h3 class="report-h3">4.2 Three ways to measure similarity</h3>
      <p class="report-note">Genre cosine uses only what a film is. Factor cosine compares the SVD item vectors q<sub>i</sub>. Pearson correlates the ratings of people who rated both.</p>
      <div class="meta" id="pair-chips">${pairs.map(([a, b, l], i) => `<button type="button" class="chip" data-a="${a}" data-b="${b}" aria-pressed="${i === 0}">${esc(l)}</button>`).join("")}</div>
      <div id="similarity-out" class="similarity"></div>
    </div>
    <div class="inside-block">
      <h3 class="report-h3">4.3 Nearest neighbours: learned factors vs. genres</h3>
      <p class="report-note">Closest films by SVD item-vector cosine (films with 20+ ratings) next to closest by genre TF-IDF.</p>
      <div class="inside-controls">${filmPicker("neighbors")}</div>
      <div id="neighbors-out" class="neighbors"></div>
    </div>`, "Live calls to the model the site runs on, so the formulas above can be checked against real numbers.");
}

function filmPicker(id) {
  return `<div class="picker" data-picker="${id}"><label class="sr-only" for="picker-${id}">Film</label>
    <input id="picker-${id}" type="search" placeholder="Search a film…" autocomplete="off"><div class="picker-results" hidden></div></div>`;
}

function setupPicker(id, onPick) {
  const root = $(`[data-picker="${id}"]`);
  const input = $("input", root), list = $(".picker-results", root);
  let timer = null;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { list.hidden = true; return; }
    timer = setTimeout(async () => {
      const results = await api(`/api/movies/search?${qs({ q })}`).catch(() => []);
      list.innerHTML = results.slice(0, 6).map(r => `<button type="button" data-id="${num(r.movieId)}">${esc(parseTitle(r.title).name)} <span class="mono muted">${esc(parseTitle(r.title).year)}</span></button>`).join("") || '<div class="search-empty">No match.</div>';
      list.hidden = false;
    }, 180);
  });
  list.addEventListener("click", event => {
    const button = event.target.closest("[data-id]");
    if (!button) return;
    list.hidden = true;
    input.value = button.textContent.trim();
    onPick(num(button.dataset.id));
  });
}

function setupInside() {
  setupPicker("explain", loadExplain);
  setupPicker("neighbors", loadNeighbors);
  $$("#pair-chips [data-a]").forEach(chip => chip.addEventListener("click", () => {
    $$("#pair-chips [data-a]").forEach(c => c.setAttribute("aria-pressed", String(c === chip)));
    loadSimilarity(num(chip.dataset.a), num(chip.dataset.b));
  }));
  loadExplain(79132);
  loadSimilarity(1, 2355);
  loadNeighbors(79132);
}

async function loadExplain(movieId) {
  const out = $("#explain-out");
  out.dataset.movie = movieId;
  try {
    const e = await api(`/api/report/explain?user_id=${getViewer()}&movie_id=${movieId}`);
    const { name, year } = parseTitle(e.title);
    if (e.cold_start) {
      out.innerHTML = `<p class="prose"><b>${esc(name)}</b> has no ratings, so SVD has no vector q<sub>i</sub> for it. The model falls back to μ + b<sub>u</sub> = ${num(e.prediction).toFixed(2)}. This is the cold-start case the content-based model covers.</p>`;
      return;
    }
    const maxAbs = Math.max(...e.top_factors.map(f => Math.abs(f.product)), 0.001);
    out.innerHTML = `<p class="explain-title">Viewer #${e.user_id} × <b>${esc(name)}</b> <span class="mono muted">${esc(year)}</span>${e.actual != null ? ` · actually rated <b class="mono">${e.actual}</b> (in training data)` : " · not rated by this viewer"}</p>
      <div class="equation">
        <div><span class="label">global mean μ</span><b>${f3(e.global_mean)}</b></div><span class="op">+</span>
        <div><span class="label">user bias b<sub>u</sub></span><b>${signed(e.user_bias)}</b><span class="eq-note">${fmt(e.user_ratings)} ratings</span></div><span class="op">+</span>
        <div><span class="label">film bias b<sub>i</sub></span><b>${signed(e.item_bias)}</b><span class="eq-note">${fmt(e.item_ratings)} ratings</span></div><span class="op">+</span>
        <div><span class="label">p<sub>u</sub> · q<sub>i</sub></span><b>${signed(e.interaction)}</b><span class="eq-note">${e.factors} factors</span></div><span class="op">=</span>
        <div class="eq-result"><span class="label">predicted</span><b>${num(e.prediction).toFixed(2)} ★</b>${Math.abs(e.raw - e.prediction) > 0.005 ? `<span class="eq-note">clipped from ${f3(e.raw)}</span>` : ""}</div>
      </div>
      <p class="report-note">The six factors contributing most to p<sub>u</sub> · q<sub>i</sub>. Factors have no labels; SVD learns them from rating patterns alone.</p>
      <div class="factor-bars">${e.top_factors.map(f => `<div class="factor-row"><span class="mono">#${f.factor}</span>
        <span class="factor-track"><i class="${f.product < 0 ? "neg" : "pos"}" style="--w:${Math.abs(f.product) / maxAbs * 50}%"></i></span>
        <span class="mono">${signed(f.product)}</span><span class="mono muted">${f3(f.user).replace("-", "−")} × ${f3(f.item).replace("-", "−")}</span></div>`).join("")}</div>`;
  } catch (error) { out.innerHTML = `<p class="muted">${esc(error.message)}</p>`; }
}

async function loadSimilarity(a, b) {
  const out = $("#similarity-out");
  try {
    const s = await api(`/api/report/similarity?a=${a}&b=${b}`);
    const bar = (label, value, note) => `<div class="sim-row"><span>${label}</span>
      <span class="sim-track">${value == null ? "" : `<i class="${value < 0 ? "neg" : "pos"}" style="--w:${Math.min(Math.abs(value), 1) * 50}%"></i>`}</span>
      <b class="mono">${value == null ? "n/a" : signed(value)}</b><span class="muted">${note}</span></div>`;
    out.innerHTML = `<p class="explain-title"><b>${esc(parseTitle(s.a.title).name)}</b> <span class="muted">${esc(s.a.genres.join(", "))}</span><br><b>${esc(parseTitle(s.b.title).name)}</b> <span class="muted">${esc(s.b.genres.join(", "))}</span></p>
      <p class="report-note">Bars run from −1 (left) through 0 (centre line) to +1 (right).</p>
      ${bar("Genre cosine (content)", s.genre_cosine, "shared genre profile")}
      ${bar("Factor cosine (SVD q<sub>i</sub>)", s.factor_cosine, "learned from ratings")}
      ${bar("Pearson (co-ratings)", s.pearson, `${fmt(s.co_raters)} people rated both`)}`;
  } catch (error) { out.innerHTML = `<p class="muted">${esc(error.message)}</p>`; }
}

async function loadNeighbors(movieId) {
  const out = $("#neighbors-out");
  try {
    const n = await api(`/api/report/neighbors?movie_id=${movieId}`);
    const list = (items, empty) => items.length
      ? `<ol>${items.map(i => `<li><a href="#/film/${num(i.movieId)}">${esc(parseTitle(i.title).name)}</a><span class="mono muted">${f3(i.score)}</span></li>`).join("")}</ol>`
      : `<p class="muted">${empty}</p>`;
    out.innerHTML = `<p class="explain-title">Neighbours of <b>${esc(parseTitle(n.title).name)}</b> <span class="muted">(${fmt(n.rating_count)} ratings)</span></p>
      <div class="report-two tight"><div><span class="label">By SVD factors</span>${list(n.by_factor, "Needs 20+ ratings to have a stable factor vector.")}</div>
      <div><span class="label">By genre TF-IDF</span>${list(n.by_genre, "No genres listed.")}</div></div>`;
  } catch (error) { out.innerHTML = `<p class="muted">${esc(error.message)}</p>`; }
}

function reportBuilt(s) {
  const f = s.films || {};
  const parts = [
    ["Recommendation engine", "recommend.py", "SVD (Surprise), genre TF-IDF, hybrid scoring, MMR re-ranking, Bayesian top list, cold-start verdict model (ExtraTrees)."],
    ["Evaluation", "evaluate.py", "Cross-validation, factor and k sweeps, precision/recall@10, diversity and coverage. Writes the numbers on this page."],
    ["Web API", "app.py (Flask)", "Recommendations per viewer and per film, film pages, search, votes, reviews, and the model-internals endpoints used in section 4."],
    ["Film data pipeline", "wikipedia_source.py · film_store.py", `Matches films to Wikidata by IMDb ID; caches posters, summaries, runtimes, directors, critic scores and critical-reception text in SQLite (${fmt(f.films)} films, ${fmt(f.reviews)} reviews so far). TMDB is an optional second source.`],
    ["Feedback loop", "instance/moctale_votes.sqlite3", "Visitors' verdicts (Perfection / Go for it / Timepass / Skip) become positive or negative taste seeds that immediately change their recommendations."],
    ["Offline data at scale", "download_data.py · analysis.py", "MovieLens 25M (25M ratings, 62k films, 162k viewers, tag genome) and 1,000 poster images stored locally; analysed with a 48-factor PureSVD, t-SNE, k-means viewer segments and poster colour features. Explore it on the Analyze tab."],
    ["Interface", "templates · static", "Seven views (For you, Browse, Top rated, Reviews, Analyze, film page, this report), designed in Figma first, responsive to phone width."],
  ];
  return reportSection("built", 5, "What we built", `<div class="built-grid">${parts.map(([name, file, text]) => `<article><h3>${name}</h3><span class="mono muted">${file}</span><p>${text}</p></article>`).join("")}</div>`);
}

function reportLimits(m) {
  const items = [
    ["Offline metrics only.", "RMSE and precision@10 measure agreement with past ratings, not whether people enjoy what they're shown. An A/B test or the in-app votes would be the next measure."],
    ["The hybrid isn't scored on accuracy.", "Section 3.5 shows what the re-rank changes (coverage, diversity), but predicted ratings for the blended score aren't directly comparable, so its RMSE isn't reported."],
    ["Item-based KNN left out.", "A full film-by-film similarity matrix is ~750 MB here; user-based KNN (610 × 610) stands in for the neighbourhood family."],
    ["Deep poster embeddings are wired but off.", "Classical computer vision (colour, composition, palettes, a genre-from-poster classifier) now runs on 1,000 local posters on the Analyze tab. The ResNet-18 embeddings that would feed the recommender's 20% visual signal still need PyTorch (requirements-vision.txt)."],
    ["Small, old, explicit data.", `${fmt(m.dataset.users)} users who each rated at least ${m.dataset.ratings_per_user_min} films, 1996–2018. Implicit signals (views, skips) and newer films aren't represented.`],
    ["Cold start is only partly solved.", "New films get genre-based matches and a predicted verdict, but no collaborative signal until people rate them."],
  ];
  return reportSection("limits", 6, "Limitations and next steps", `<ul class="limits">${items.map(([t, d]) => `<li><b>${t}</b> ${d}</li>`).join("")}</ul>`);
}

function reportPatterns() {
  const charts = [
    ["rating_distribution.png", "Rating distribution", "How often the community chose each star rating.", 1280, 640],
    ["genre_average_rating.png", "Average rating by genre", "Which genres receive the warmest reception.", 1280, 800],
    ["weighted_vs_raw_comparison.png", "Bayesian vs. raw average", "Why a rating backed by more votes is a steadier signal.", 1600, 1280],
    ["monthly_average_rating.png", "Rating activity over time", "When MovieLens ratings were submitted, 1996–2018.", 1600, 640],
  ];
  return reportSection("patterns", 7, "Rating patterns", `<div class="charts">${charts.map(([f, h, p, w, ht]) => `<article class="chart"><h3>${h}</h3><p>${p}</p><figure><img src="/outputs/moctale/${f}" alt="${esc(h)}" loading="lazy" width="${w}" height="${ht}"></figure></article>`).join("")}</div>`, "Exploratory charts from moctale_analysis.py.");
}

/* ---------- fill in missing posters ---------- */
// Cards render at once; films not cached yet get their poster from one batched lookup.
async function fillPosters(root = document) {
  const pending = $$(".poster[data-film]:not(.has-image):not([data-pending])", root);
  const ids = [...new Set(pending.map(el => el.dataset.film))].slice(0, 24);
  if (!ids.length) return;
  const batch = pending.filter(el => ids.includes(el.dataset.film));
  batch.forEach(el => { el.dataset.pending = ""; });
  try {
    const { films } = await api("/api/films/details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ids.map(Number) }),
    });
    batch.forEach(el => {
      const src = safeUrl(films[el.dataset.film]?.poster || "");
      if (!src) return;
      el.insertAdjacentHTML("beforeend", `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">`);
      el.classList.add("has-image");
    });
  } catch { /* placeholders stay */ }
  if (pending.length > batch.length) fillPosters(root);
}

/* ---------- search ---------- */
function setupSearch() {
  const input = $("#search-input");
  const list = $("#search-results");
  let timer = null;
  let active = -1;
  const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); active = -1; };
  const highlight = index => {
    const items = $$(".search-item", list);
    active = (index + items.length) % items.length;
    items.forEach((item, i) => item.classList.toggle("is-active", i === active));
    items[active]?.scrollIntoView({ block: "nearest" });
  };
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { close(); return; }
    timer = setTimeout(async () => {
      try {
        const results = await api(`/api/movies/search?${qs({ q })}`);
        list.innerHTML = results.length
          ? results.slice(0, 8).map(m => {
            const { name, year } = parseTitle(m.title);
            return `<a class="search-item" role="option" href="#/film/${num(m.movieId)}"><span class="thumb">${poster(m, { size: "small" })}</span><span><b>${esc(name)}</b><span class="mono">${esc(year)}</span> <span>${esc(genresOf(m).slice(0, 2).join(", "))}</span></span></a>`;
          }).join("")
          : `<div class="search-empty">No films match “${esc(q)}”.</div>`;
        list.hidden = false;
        input.setAttribute("aria-expanded", "true");
        active = -1;
      } catch { close(); }
    }, 180);
  });
  input.addEventListener("keydown", event => {
    if (list.hidden) return;
    if (event.key === "ArrowDown") { event.preventDefault(); highlight(active + 1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); highlight(active - 1); }
    else if (event.key === "Enter") {
      const item = $$(".search-item", list)[active] || $(".search-item", list);
      if (item) { event.preventDefault(); location.hash = item.getAttribute("href"); }
    } else if (event.key === "Escape") close();
  });
  list.addEventListener("click", () => { close(); input.value = ""; });
  document.addEventListener("click", event => { if (!event.target.closest(".search")) close(); });
}

/* ---------- router ---------- */
async function route() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const [path, query = ""] = hash.split("?");
  const params = new URLSearchParams(query);
  const parts = path.split("/").filter(Boolean);
  const name = parts[0] || "home";
  $$(".nav-links a").forEach(a => {
    if (a.dataset.route === name) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.title = "moctale — film recommendations";
  if (name !== "film") window.scrollTo(0, 0);
  if (name === "film" && parts[1]) return renderFilm(num(parts[1]));
  if (name === "browse") return renderBrowse(params);
  if (name === "top") return renderTop();
  if (name === "reviews") return renderReviews();
  if (name === "data") return renderData();
  if (name === "analyze") return renderAnalyze(params);
  return renderHome();
}

document.addEventListener("DOMContentLoaded", async () => {
  setViewer(getViewer());
  setupSearch();
  const onViewer = value => {
    setViewer(value);
    if (!location.hash || location.hash === "#/" || location.hash.startsWith("#/browse")) route();
    else if (location.hash.startsWith("#/data") && $("#explain-out")) loadExplain(num($("#explain-out").dataset.movie) || 79132);
  };
  $("#viewer-input").addEventListener("change", event => onViewer(event.target.value));
  $("#viewer-random").addEventListener("click", () => onViewer(1 + Math.floor(Math.random() * 610)));
  document.addEventListener("click", event => {
    const expand = event.target.closest("[data-expand]");
    if (expand) {
      expand.closest(".review-body").querySelector(".review-text").classList.remove("clamped");
      expand.remove();
      return;
    }
    const row = event.target.closest("tr[data-href]");
    if (row && !event.target.closest("a")) location.hash = row.dataset.href;
  });
  document.addEventListener("error", event => {
    if (event.target?.matches?.(".poster img, .hero-backdrop, .film-backdrop img")) event.target.remove();
  }, true);
  window.addEventListener("hashchange", route);
  let fillTimer = null;
  new MutationObserver(() => {
    clearTimeout(fillTimer);
    fillTimer = setTimeout(() => fillPosters(view()), 250);
  }).observe(view(), { childList: true, subtree: true });
  try {
    STATS = await api("/api/stats");
    const f = STATS.films || {};
    $("#footer-status").textContent = f.films ? `${fmt(f.films)} films · ${fmt(f.reviews)} reviews cached` : "No film details cached yet";
  } catch { /* stats are optional */ }
  route();
});

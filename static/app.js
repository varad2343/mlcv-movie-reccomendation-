// MovieLens Recommendation System Client App with Moctale Meter

document.addEventListener('DOMContentLoaded', () => {
  // Navigation Tabs
  const tabs = document.querySelectorAll('.nav-tab');
  const panels = document.querySelectorAll('.tab-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetPanel = tab.dataset.tab;
      tabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      panels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const activePanel = document.getElementById(`panel-${targetPanel}`);
      if (activePanel) {
        activePanel.classList.add('active');
      }

      if (targetPanel === 'toprated') {
        loadTopRated();
      }
    });
  });

  // Load Overview Stats
  fetchStats();

  // Setup Collaborative Filtering Handlers
  setupCollaborative();

  // Setup Content-Based Filtering Handlers
  setupContentBased();
});

// Fetch Dataset Stats
async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) return;
    const data = await res.json();
    document.getElementById('stat-ratings').textContent = Number(data.total_ratings).toLocaleString();
    document.getElementById('stat-users').textContent = Number(data.total_users).toLocaleString();
    document.getElementById('stat-movies').textContent = Number(data.total_movies).toLocaleString();
    document.getElementById('stat-mean').textContent = `${data.global_mean} ★`;
  } catch (err) {
    console.warn('Could not fetch dataset stats:', err);
  }
}

// -------------------------------------------------------------
// Tab 1: Collaborative Filtering
// -------------------------------------------------------------
function setupCollaborative() {
  const userInput = document.getElementById('user-id-input');
  const topNSelect = document.getElementById('user-top-n');
  const fetchBtn = document.getElementById('btn-fetch-user-recs');
  const randomBtn = document.getElementById('btn-random-user');
  const presets = document.querySelectorAll('.sample-presets .chip[data-user-id]');

  const runCollaborative = async () => {
    const userId = parseInt(userInput.value, 10);
    const topN = parseInt(topNSelect.value, 10) || 5;

    if (isNaN(userId) || userId < 1 || userId > 610) {
      alert('Please enter a valid User ID between 1 and 610.');
      return;
    }

    const loading = document.getElementById('user-recs-loading');
    const grid = document.getElementById('user-recs-grid');
    const profileBox = document.getElementById('user-profile-box');

    loading.classList.remove('hidden');
    grid.innerHTML = '';

    try {
      const res = await fetch(`/api/recommend/user?user_id=${userId}&top_n=${topN}`);
      const data = await res.json();

      if (!data.success) {
        alert(data.error || 'Failed to fetch recommendations.');
        return;
      }

      // Render User Profile Box with Moctale Style
      const profile = data.profile;
      document.getElementById('user-avatar').textContent = `#${profile.userId}`;
      document.getElementById('user-name').textContent = `User Profile #${profile.userId}`;
      document.getElementById('user-total-ratings').textContent = `${profile.total_ratings} movies rated`;
      document.getElementById('user-avg-rating').textContent = `Avg Rating: ${profile.average_rating} / 5.0`;

      // Add Moctale style tag if present
      let styleHtml = '';
      if (profile.moctale_style) {
        const s = profile.moctale_style;
        styleHtml = `<span class="badge badge-info" style="font-size:0.75rem;">Moctale Taste: 🌟 ${s.perfection_pct}% Perfection &bull; 👍 ${s.goforit_pct}% Go for it &bull; ⏳ ${s.timepass_pct}% Timepass</span>`;
      }
      
      const userMetaBox = document.querySelector('.user-stats-tags');
      if (userMetaBox) {
        userMetaBox.innerHTML = `
          <span class="badge badge-info">${profile.total_ratings} movies rated</span>
          <span class="badge badge-warning">Avg: ${profile.average_rating} / 5.0</span>
          ${styleHtml}
        `;
      }

      const favsList = document.getElementById('user-favorites-list');
      favsList.innerHTML = profile.top_favorites.map(f => `
        <div class="fav-item">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <div class="fav-rating">★ ${f.rating.toFixed(1)} / 5.0</div>
            ${f.moctale_verdict ? `<span style="font-size:0.72rem; font-weight:700;">${f.moctale_verdict}</span>` : ''}
          </div>
          <div class="fav-title" title="${f.title}">${f.title}</div>
          <div class="fav-genres">${f.genres}</div>
        </div>
      `).join('');
      profileBox.classList.remove('hidden');

      // Render Recommendations Grid
      document.getElementById('user-results-title').textContent = `Top ${topN} Unseen Recommendations for User #${userId}`;
      document.getElementById('user-results-count').textContent = `${data.recommendations.length} recommendations`;

      grid.innerHTML = data.recommendations.map((m, i) => createMovieCard(m, i + 1, 'Predicted Rating', `${m.predicted_rating.toFixed(2)} ★`)).join('');

    } catch (err) {
      console.error(err);
      alert('An error occurred while generating recommendations.');
    } finally {
      loading.classList.add('hidden');
    }
  };

  fetchBtn.addEventListener('click', runCollaborative);

  randomBtn.addEventListener('click', () => {
    userInput.value = Math.floor(Math.random() * 610) + 1;
    runCollaborative();
  });

  presets.forEach(chip => {
    chip.addEventListener('click', () => {
      userInput.value = chip.dataset.userId;
      runCollaborative();
    });
  });

  // Run automatically for default user #1
  runCollaborative();
}

// -------------------------------------------------------------
// Tab 2: Content-Based Filtering
// -------------------------------------------------------------
function setupContentBased() {
  const searchInput = document.getElementById('movie-search-input');
  const dropdown = document.getElementById('search-autocomplete');
  const topNSelect = document.getElementById('movie-top-n');
  const fetchBtn = document.getElementById('btn-fetch-movie-recs');
  const movieChips = document.querySelectorAll('.movie-chip');

  let debounceTimer = null;

  // Search autocomplete
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = searchInput.value.trim();
    if (query.length < 2) {
      dropdown.classList.add('hidden');
      dropdown.innerHTML = '';
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/movies/search?q=${encodeURIComponent(query)}`);
        const results = await res.json();
        if (results.length === 0) {
          dropdown.classList.add('hidden');
          return;
        }

        dropdown.innerHTML = results.map(m => `
          <div class="autocomplete-item" data-title="${m.title}">
            <div>
              <div class="autocomplete-title">${m.title}</div>
              <div class="autocomplete-genres">${m.genres}</div>
            </div>
            <span class="badge badge-neutral">${m.moctale ? m.moctale.verdict_display : 'Select'}</span>
          </div>
        `).join('');
        dropdown.classList.remove('hidden');

        dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
          item.addEventListener('click', () => {
            searchInput.value = item.dataset.title;
            dropdown.classList.add('hidden');
            runContentBased();
          });
        });
      } catch (e) {
        console.warn(e);
      }
    }, 200);
  });

  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });

  const runContentBased = async () => {
    const query = searchInput.value.trim();
    const topN = parseInt(topNSelect.value, 10) || 5;

    if (!query) {
      alert('Please enter a movie title to find recommendations.');
      return;
    }

    const loading = document.getElementById('movie-recs-loading');
    const grid = document.getElementById('movie-recs-grid');
    loading.classList.remove('hidden');
    grid.innerHTML = '';

    try {
      const res = await fetch(`/api/recommend/movie?query=${encodeURIComponent(query)}&top_n=${topN}`);
      const data = await res.json();

      if (!data.success) {
        alert(data.error || 'Failed to find similar movies.');
        return;
      }

      // Render Anchor Movie Box with Moctale Vibe Chart
      const target = data.target;
      document.getElementById('target-movie-title').textContent = target.title;
      const targetGenres = document.getElementById('target-movie-genres');
      
      let vibeHtml = '';
      if (target.moctale && target.moctale.vibe_chart) {
        vibeHtml = `
          <div style="margin-top:10px;">
            <div style="font-size:0.75rem; font-weight:700; color:var(--badge-blue); text-transform:uppercase; letter-spacing:0.04em;">Moctale Vibe Chart:</div>
            <div class="vibe-chart-container">
              ${Object.entries(target.moctale.vibe_chart).map(([genre, pct]) => `
                <span class="vibe-chip"><strong>${genre}</strong>: ${pct}%</span>
              `).join('')}
            </div>
          </div>
        `;
      }

      const consensusBadge = target.moctale ? `
        <span class="moctale-verdict-tag ${getBadgeClass(target.moctale.verdict)}" style="margin-left:8px;">
          ${target.moctale.verdict_display} (${target.moctale.perfection_pct}% Perfection | ${target.moctale.goforit_pct}% Go for it)
        </span>
      ` : '';

      targetGenres.innerHTML = `
        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
          ${(target.genres || '').split('|').map(g => `<span class="genre-tag">${g}</span>`).join('')}
          ${consensusBadge}
        </div>
        ${vibeHtml}
      `;

      // Render Recommendations Grid
      document.getElementById('movie-results-count').textContent = `${data.recommendations.length} recommendations`;
      grid.innerHTML = data.recommendations.map((m, i) => {
        const matchPct = (m.similarity_score * 100).toFixed(1);
        return createMovieCard(m, i + 1, 'Genre Similarity', `${matchPct}% Match`, true);
      }).join('');

    } catch (err) {
      console.error(err);
      alert('An error occurred while finding similar movies.');
    } finally {
      loading.classList.add('hidden');
    }
  };

  fetchBtn.addEventListener('click', runContentBased);

  movieChips.forEach(chip => {
    chip.addEventListener('click', () => {
      searchInput.value = chip.dataset.title;
      runContentBased();
    });
  });

  // Run initial query
  runContentBased();
}

// -------------------------------------------------------------
// Tab 3: Top Rated Movies
// -------------------------------------------------------------
let topRatedLoaded = false;
async function loadTopRated() {
  if (topRatedLoaded) return;

  const loading = document.getElementById('top-rated-loading');
  const grid = document.getElementById('top-rated-grid');
  loading.classList.remove('hidden');

  try {
    const res = await fetch('/api/top-rated?top_n=15');
    const data = await res.json();

    if (data.success) {
      grid.innerHTML = data.movies.map((m, i) => {
        return createMovieCard(
          m, 
          i + 1, 
          `Bayesian Score (${m.rating_count} reviews)`, 
          `${m.bayesian_score.toFixed(2)} ★`,
          false,
          `Raw Avg: ${m.raw_average.toFixed(2)} ★`
        );
      }).join('');
      topRatedLoaded = true;
    }
  } catch (err) {
    console.error(err);
  } finally {
    loading.classList.add('hidden');
  }
}

function getBadgeClass(verdict) {
  if (verdict === 'Perfection') return 'badge-perfection';
  if (verdict === 'Go for it') return 'badge-goforit';
  if (verdict === 'Timepass') return 'badge-timepass';
  return 'badge-skip';
}

// Helper: Reusable Movie Card HTML with Moctale Meter
function createMovieCard(movie, rank, statLabel, statValue, isBlue = false, extraSub = '') {
  const genreTags = (movie.genres || '').split('|').map(g => `<span class="genre-tag">${g}</span>`).join('');
  
  const imdbBtn = movie.imdb_url ? `
    <a href="${movie.imdb_url}" target="_blank" rel="noopener" class="imdb-link" title="Open on IMDb">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
      IMDb
    </a>
  ` : '';

  let moctaleHtml = '';
  if (movie.moctale) {
    const m = movie.moctale;
    const badgeClass = getBadgeClass(m.verdict);
    moctaleHtml = `
      <div class="moctale-bar-wrapper">
        <div class="moctale-bar-header">
          <span class="moctale-verdict-tag ${badgeClass}">${m.verdict_display}</span>
          <span>${m.vote_count ? `${m.vote_count} votes` : 'Consensus'}</span>
        </div>
        <div class="moctale-meter-track" title="Perfection: ${m.perfection_pct}% | Go for it: ${m.goforit_pct}% | Timepass: ${m.timepass_pct}% | Skip: ${m.skip_pct}%">
          <div class="meter-seg meter-seg-perfection" style="width: ${m.perfection_pct}%;"></div>
          <div class="meter-seg meter-seg-goforit" style="width: ${m.goforit_pct}%;"></div>
          <div class="meter-seg meter-seg-timepass" style="width: ${m.timepass_pct}%;"></div>
          <div class="meter-seg meter-seg-skip" style="width: ${m.skip_pct}%;"></div>
        </div>
        <div class="moctale-percentages-row">
          <span class="moctale-pct-item"><span class="pct-dot dot-perfection"></span>${m.perfection_pct}%</span>
          <span class="moctale-pct-item"><span class="pct-dot dot-goforit"></span>${m.goforit_pct}%</span>
          <span class="moctale-pct-item"><span class="pct-dot dot-timepass"></span>${m.timepass_pct}%</span>
          <span class="moctale-pct-item"><span class="pct-dot dot-skip"></span>${m.skip_pct}%</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="movie-card">
      <div>
        <div class="card-top">
          <div class="card-rank">#${rank}</div>
          ${imdbBtn}
        </div>
        <h4 class="movie-title">${movie.title}</h4>
        <div class="genres-row">${genreTags}</div>
        ${moctaleHtml}
      </div>
      <div class="card-bottom">
        <div class="rating-stat">
          <span class="stat-sub">${statLabel} ${extraSub ? `&bull; ${extraSub}` : ''}</span>
          <span class="stat-main ${isBlue ? 'score-blue' : ''}">${statValue}</span>
        </div>
      </div>
    </div>
  `;
}

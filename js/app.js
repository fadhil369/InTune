/**
 * app.js — Main controller: UI, pages, liked songs, downloads, toasts
 */
const App = (() => {
  let likedSongs = JSON.parse(localStorage.getItem('intune_liked') || '[]');
  let downloads  = JSON.parse(localStorage.getItem('intune_downloads') || '[]');
  let currentSong = null;
  let currentPage = 'home';
  let searchTimeout = null;

  function init() {
    Discovery.buildGenreGrid();
    Discovery.loadTrending();
    Pairing.init();
    setupSearch();
    setupProgressClick();
    renderLiked();
    renderDownloads();
    updateHeroGreeting();
    // Handle pair-input enter
    document.getElementById('pair-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') Pairing.connectAs('guest');
    });
    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(o => {
      o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
    });
  }

  function updateHeroGreeting() {
    const h = new Date().getHours();
    const greet = h < 12 ? 'Good Morning 🌅' : h < 17 ? 'Good Afternoon ☀️' : 'Good Evening 🌙';
    const el = document.querySelector('.hero-title');
    if (el) el.textContent = greet + ' 🎶';
  }

  function setupSearch() {
    const input = document.getElementById('search-input');
    input.addEventListener('input', e => {
      const q = e.target.value.trim();
      clearTimeout(searchTimeout);
      if (q.length < 2) return;
      showPage('search');
      document.getElementById('search-heading').textContent = `Results for "${q}"`;
      showResultsLoading();
      searchTimeout = setTimeout(async () => {
        const results = await Discovery.search(q);
        renderResultList(results);
      }, 500);
    });
  }

  function setupProgressClick() {
    // Volume on desktop already handled inline
  }

  function showPage(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + name)?.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.getElementById('nav-' + name)?.classList.add('active');
    document.querySelectorAll('.mob-btn').forEach(b => b.classList.remove('active'));
    const mbn = { home:'mobn-home', search:'mobn-search', liked:'mobn-liked', downloads:'mobn-dl' }[name];
    if (mbn) document.getElementById(mbn)?.classList.add('active');
    currentPage = name;
  }

  // ── Song Rendering ──

  function showSongRow(rowId, songs, loading) {
    const row = document.getElementById(rowId);
    if (!row) return;
    row.innerHTML = '';
    if (loading) {
      for (let i = 0; i < 8; i++) {
        const sk = document.createElement('div');
        sk.className = 'song-card skeleton';
        sk.style.cssText = 'height:200px;flex-shrink:0;width:155px';
        row.appendChild(sk);
      }
      return;
    }
    if (!songs || !songs.length) {
      row.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:8px">Nothing found.</p>';
      return;
    }
    songs.forEach((song, i) => {
      const card = document.createElement('div');
      card.className = 'song-card fade-in';
      card.innerHTML = `
        <button class="song-card-dl" title="Download" onclick="Player.downloadById(${JSON.stringify(song).replace(/"/g, '&quot;')});event.stopPropagation()">⬇</button>
        <img class="song-card-thumb" src="${song.thumb}" alt="${esc(song.title)}" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'130\\' height=\\'130\\'%3E%3Crect width=\\'130\\' height=\\'130\\' fill=\\'%23222\\' rx=\\'8\\'/%3E%3Ctext x=\\'50%25\\' y=\\'55%25\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' font-size=\\'40\\'%3E🎵%3C/text%3E%3C/svg%3E'">
        <div class="song-card-title">${esc(song.title)}</div>
        <div class="song-card-artist">${esc(song.artist)}</div>
        <button class="song-card-play-btn" onclick="event.stopPropagation()">▶</button>`;
      card.onclick = () => { Player.setQueue(songs, i); };
      row.appendChild(card);
    });
  }

  function showResultsLoading() {
    const list = document.getElementById('result-list');
    list.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const sk = document.createElement('div');
      sk.style.cssText = 'height:46px;border-radius:10px;margin-bottom:4px';
      sk.className = 'skeleton';
      list.appendChild(sk);
    }
  }

  function renderResultList(songs, highlightId) {
    const list = document.getElementById('result-list');
    list.innerHTML = '';
    if (!songs.length) {
      list.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:16px">No results found. Try a different search.</p>';
      return;
    }
    songs.forEach((song, i) => {
      const item = document.createElement('div');
      item.className = 'result-item' + (song.id === highlightId ? ' playing' : '');
      item.id = 'ri-' + song.id;
      item.innerHTML = `
        <span class="result-num">
          ${song.id === highlightId
            ? '<div class="playing-bars"><div class="pb"></div><div class="pb"></div><div class="pb"></div></div>'
            : (i + 1)}
        </span>
        <img class="result-thumb" src="${song.thumb}" alt="" loading="lazy" onerror="this.src=''">
        <div class="result-info">
          <div class="result-title">${esc(song.title)}</div>
          <div class="result-artist">${esc(song.artist)}</div>
        </div>
        <span class="result-dur">${fmtDur(song.duration)}</span>
        <div class="result-actions">
          <button class="rbtn" title="Like" onclick="App.toggleLikeSong(${JSON.stringify(song).replace(/"/g,'&quot;')});event.stopPropagation()">❤️</button>
          <button class="rbtn" title="Download" onclick="Player.downloadById(${JSON.stringify(song).replace(/"/g,'&quot;')});event.stopPropagation()">⬇</button>
        </div>`;
      item.onclick = () => { Player.setQueue(songs, i); };
      list.appendChild(item);
    });
  }

  function fmtDur(s) {
    if (!s) return '';
    s = +s;
    const m = Math.floor(s / 60), sec = s % 60;
    return `${m}:${sec.toString().padStart(2,'0')}`;
  }

  function esc(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── On Song Changed ──
  function onSongChanged(song) {
    currentSong = song;
    // Highlight in result list
    document.querySelectorAll('.result-item').forEach(el => el.classList.remove('playing'));
    document.getElementById('ri-' + song.id)?.classList.add('playing');
    // Update liked state
    const liked = likedSongs.some(s => s.id === song.id);
    const btn = document.getElementById('btn-like');
    if (btn) { btn.textContent = liked ? '❤️' : '♡'; btn.classList.toggle('liked', liked); }
    const btnFp = document.getElementById('btn-like-fp');
    if (btnFp) { btnFp.textContent = liked ? '❤️' : '♡'; btnFp.classList.toggle('liked', liked); }
  }

  // ── Liked Songs ──
  function toggleLike() {
    if (!currentSong) return;
    toggleLikeSong(currentSong);
    const liked = likedSongs.some(s => s.id === currentSong.id);
    const btn = document.getElementById('btn-like');
    if (btn) { btn.textContent = liked ? '❤️' : '♡'; btn.classList.toggle('liked', liked); }
    const btnFp = document.getElementById('btn-like-fp');
    if (btnFp) { btnFp.textContent = liked ? '❤️' : '♡'; btnFp.classList.toggle('liked', liked); }
  }

  function toggleLikeSong(song) {
    const idx = likedSongs.findIndex(s => s.id === song.id);
    if (idx === -1) { likedSongs.push(song); toast('Added to Liked Songs ❤️', 'success'); }
    else { likedSongs.splice(idx, 1); toast('Removed from Liked Songs', 'info'); }
    localStorage.setItem('intune_liked', JSON.stringify(likedSongs));
    renderLiked();
  }

  function renderLiked() {
    const list = document.getElementById('liked-list');
    if (!list) return;
    if (!likedSongs.length) {
      list.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:16px">Like songs to see them here.</p>';
      return;
    }
    renderResultList.call(null, likedSongs, null);
    // Reuse the result-list but render into liked-list
    list.innerHTML = '';
    likedSongs.forEach((song, i) => {
      const item = document.createElement('div');
      item.className = 'result-item';
      item.innerHTML = `
        <span class="result-num">${i+1}</span>
        <img class="result-thumb" src="${song.thumb}" alt="" loading="lazy">
        <div class="result-info">
          <div class="result-title">${esc(song.title)}</div>
          <div class="result-artist">${esc(song.artist)}</div>
        </div>
        <span class="result-dur">${fmtDur(song.duration)}</span>
        <div class="result-actions">
          <button class="rbtn" onclick="App.toggleLikeSong(${JSON.stringify(song).replace(/"/g,'&quot;')});event.stopPropagation()">🗑️</button>
          <button class="rbtn" onclick="Player.downloadById(${JSON.stringify(song).replace(/"/g,'&quot;')});event.stopPropagation()">⬇</button>
        </div>`;
      item.onclick = () => Player.setQueue(likedSongs, i);
      list.appendChild(item);
    });
  }

  // ── Downloads ──
  function addDownload(song, url) {
    if (!downloads.find(d => d.id === song.id)) {
      downloads.unshift({ ...song, downloadUrl: url, date: Date.now() });
      localStorage.setItem('intune_downloads', JSON.stringify(downloads));
      renderDownloads();
    }
  }

  function renderDownloads() {
    const list = document.getElementById('downloads-list');
    const empty = document.getElementById('dl-empty');
    if (!list) return;
    list.innerHTML = '';
    if (!downloads.length) { empty && (empty.style.display = ''); return; }
    empty && (empty.style.display = 'none');
    downloads.forEach((song, i) => {
      const item = document.createElement('div');
      item.className = 'result-item';
      item.innerHTML = `
        <span class="result-num">⬇</span>
        <img class="result-thumb" src="${song.thumb}" alt="" loading="lazy">
        <div class="result-info">
          <div class="result-title">${esc(song.title)}</div>
          <div class="result-artist">${esc(song.artist)}</div>
        </div>
        <div class="result-actions" style="opacity:1">
          <button class="rbtn" onclick="window.open('${song.downloadUrl}','_blank');event.stopPropagation()">📥</button>
          <button class="rbtn" onclick="App.removeDownload(${i});event.stopPropagation()">🗑️</button>
        </div>`;
      item.onclick = () => Player.playSong(song);
      list.appendChild(item);
    });
  }

  function removeDownload(i) {
    downloads.splice(i, 1);
    localStorage.setItem('intune_downloads', JSON.stringify(downloads));
    renderDownloads();
  }

  // ── Pair Code ──
  function copyPairCode() {
    const code = Pairing.getCode();
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => toast('Pair code copied! 📋', 'success')).catch(() => {});
    document.getElementById('pair-modal').classList.add('open');
  }

  // ── Toasts ──
  function toast(msg, type = 'info') {
    const wrap = document.getElementById('toast-wrap');
    const icons = { success:'✅', error:'❌', info:'ℹ️' };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `${icons[type]} ${msg}`;
    wrap.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    showPage, showSongRow, showResultsLoading, renderResultList,
    onSongChanged, toggleLike, toggleLikeSong, addDownload, removeDownload,
    copyPairCode, toast,
  };
})();

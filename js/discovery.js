/**
 * discovery.js — YouTube search via multiple reliable methods
 * Method 1: ytapi.mc-server.org (CORS-friendly proxy)
 * Method 2: Piped API (YouTube alternative frontend)
 * Method 3: Hardcoded seed songs as fallback
 */
const Discovery = (() => {

  // Piped instances (YouTube proxy, reliable CORS)
  const PIPED = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.adminforge.de',
    'https://pipedapi.reallyaweso.me',
    'https://api.piped.projectsegfau.lt',
    'https://pipedapi.coldforge.xyz',
  ];

  // Invidious as secondary
  const INVIDIOUS = [
    'https://inv.nadeko.net',
    'https://yt.cdaut.de',
    'https://invidious.flokinet.to',
  ];

  let pipedIdx = 0;

  const GENRES = [
    { name:'Lossless Hi-Fi', icon:'💎', color:'#0ea5e9' },
    { name:'Pop',      icon:'🎤', color:'#ec4899' },
    { name:'Hip-Hop',  icon:'🎧', color:'#f59e0b' },
    { name:'Lo-fi',    icon:'☕', color:'#6366f1' },
    { name:'Rock',     icon:'🎸', color:'#ef4444' },
    { name:'EDM',      icon:'⚡', color:'#8b5cf6' },
    { name:'Jazz',     icon:'🎺', color:'#10b981' },
    { name:'R&B',      icon:'🎶', color:'#06b6d4' },
    { name:'Classical',icon:'🎻', color:'#84cc16' },
    { name:'Bollywood',icon:'🎬', color:'#f97316' },
  ];

  // Hardcoded seed trending songs (always available, no API needed)
  const SEED_TRENDING = [
    { id:'JGwWNGJdvx8', title:'Shape of You', artist:'Ed Sheeran', duration:234, thumb:'https://i.ytimg.com/vi/JGwWNGJdvx8/mqdefault.jpg' },
    { id:'kTJczUoc26U', title:'Starboy', artist:'The Weeknd', duration:230, thumb:'https://i.ytimg.com/vi/kTJczUoc26U/mqdefault.jpg' },
    { id:'SlPhMPnQ58k', title:'Blinding Lights', artist:'The Weeknd', duration:200, thumb:'https://i.ytimg.com/vi/SlPhMPnQ58k/mqdefault.jpg' },
    { id:'YQHsXMglC9A', title:'Hello', artist:'Adele', duration:295, thumb:'https://i.ytimg.com/vi/YQHsXMglC9A/mqdefault.jpg' },
    { id:'RgKAFK5djSk', title:'See You Again', artist:'Wiz Khalifa', duration:229, thumb:'https://i.ytimg.com/vi/RgKAFK5djSk/mqdefault.jpg' },
    { id:'OPf0YbXqDm0', title:'Mark Ronson - Uptown Funk', artist:'Bruno Mars', duration:270, thumb:'https://i.ytimg.com/vi/OPf0YbXqDm0/mqdefault.jpg' },
    { id:'09R8_2nJtjg', title:'Sugar', artist:'Maroon 5', duration:235, thumb:'https://i.ytimg.com/vi/09R8_2nJtjg/mqdefault.jpg' },
    { id:'hT_nvWreIhg', title:'Counting Stars', artist:'OneRepublic', duration:257, thumb:'https://i.ytimg.com/vi/hT_nvWreIhg/mqdefault.jpg' },
    { id:'60ItHLz5WEA', title:'Alan Walker - Faded', artist:'Alan Walker', duration:212, thumb:'https://i.ytimg.com/vi/60ItHLz5WEA/mqdefault.jpg' },
    { id:'450p7goxZqg', title:'Let Her Go', artist:'Passenger', duration:252, thumb:'https://i.ytimg.com/vi/450p7goxZqg/mqdefault.jpg' },
    { id:'7PCkvCPvDXk', title:'Perfect', artist:'Ed Sheeran', duration:263, thumb:'https://i.ytimg.com/vi/7PCkvCPvDXk/mqdefault.jpg' },
    { id:'lp-EBShMg1I', title:'Photograph', artist:'Ed Sheeran', duration:258, thumb:'https://i.ytimg.com/vi/lp-EBShMg1I/mqdefault.jpg' },
    { id:'pRpeEdMmmQ0', title:'Stressed Out', artist:'Twenty One Pilots', duration:234, thumb:'https://i.ytimg.com/vi/pRpeEdMmmQ0/mqdefault.jpg' },
    { id:'nfWlot6h_JM', title:'Shake It Off', artist:'Taylor Swift', duration:219, thumb:'https://i.ytimg.com/vi/nfWlot6h_JM/mqdefault.jpg' },
    { id:'2Vv-BfVoq4g', title:'Love Yourself', artist:'Justin Bieber', duration:234, thumb:'https://i.ytimg.com/vi/2Vv-BfVoq4g/mqdefault.jpg' },
    { id:'gdZLi9oWNZg', title:'Stay With Me', artist:'Sam Smith', duration:172, thumb:'https://i.ytimg.com/vi/gdZLi9oWNZg/mqdefault.jpg' },
    { id:'AJtDXIazrMo', title:'Believer', artist:'Imagine Dragons', duration:204, thumb:'https://i.ytimg.com/vi/AJtDXIazrMo/mqdefault.jpg' },
    { id:'fRh_vgS2dFE', title:'Sorry', artist:'Justin Bieber', duration:209, thumb:'https://i.ytimg.com/vi/fRh_vgS2dFE/mqdefault.jpg' },
  ];

  const GENRE_SEEDS = {
    'Pop':      [{id:'kXYiU_JCYtU',title:'Levitating',artist:'Dua Lipa',thumb:'https://i.ytimg.com/vi/kXYiU_JCYtU/mqdefault.jpg',duration:203},{id:'H5v3kku4y6Q',title:'positions',artist:'Ariana Grande',thumb:'https://i.ytimg.com/vi/H5v3kku4y6Q/mqdefault.jpg',duration:173},{id:'nYh-n7EOtMA',title:'Watermelon Sugar',artist:'Harry Styles',thumb:'https://i.ytimg.com/vi/nYh-n7EOtMA/mqdefault.jpg',duration:174},{id:'TUVcZfQe-Kw',title:'Stay',artist:'The Kid LAROI',thumb:'https://i.ytimg.com/vi/TUVcZfQe-Kw/mqdefault.jpg',duration:141},{id:'RqH8JDVq7TE',title:'Bad Guy',artist:'Billie Eilish',thumb:'https://i.ytimg.com/vi/RqH8JDVq7TE/mqdefault.jpg',duration:194}],
    'Hip-Hop':  [{id:'sNPnbI1arSE',title:'Rockstar',artist:'Post Malone',thumb:'https://i.ytimg.com/vi/sNPnbI1arSE/mqdefault.jpg',duration:218},{id:'IB8KkA7AvCo',title:'Drip Too Hard',artist:'Lil Baby',thumb:'https://i.ytimg.com/vi/IB8KkA7AvCo/mqdefault.jpg',duration:149},{id:'UceaB4D0jpo',title:'God\'s Plan',artist:'Drake',thumb:'https://i.ytimg.com/vi/UceaB4D0jpo/mqdefault.jpg',duration:199},{id:'SC4xMk98Pdc',title:'HUMBLE.',artist:'Kendrick Lamar',thumb:'https://i.ytimg.com/vi/SC4xMk98Pdc/mqdefault.jpg',duration:177},{id:'f7mjFpnTh1s',title:'Congratulations',artist:'Post Malone',thumb:'https://i.ytimg.com/vi/f7mjFpnTh1s/mqdefault.jpg',duration:220}],
    'Lo-fi':    [{id:'5qap5aO4i9A',title:'lofi hip hop radio',artist:'Lofi Girl',thumb:'https://i.ytimg.com/vi/5qap5aO4i9A/mqdefault.jpg',duration:0},{id:'jfKfPfyJRdk',title:'lofi hip hop radio - beats to sleep',artist:'Lofi Girl',thumb:'https://i.ytimg.com/vi/jfKfPfyJRdk/mqdefault.jpg',duration:0},{id:'Na0w3Mz46GA',title:'Chill Lofi Study Beats',artist:'Lofi Beats',thumb:'https://i.ytimg.com/vi/Na0w3Mz46GA/mqdefault.jpg',duration:3600},{id:'lTRiuFIWV54',title:'Jazz & Bossa Nova',artist:'Jazz Cafe',thumb:'https://i.ytimg.com/vi/lTRiuFIWV54/mqdefault.jpg',duration:3600},{id:'DWcJFNfaw9c',title:'Lofi Hip Hop Mix',artist:'ChilledCow',thumb:'https://i.ytimg.com/vi/DWcJFNfaw9c/mqdefault.jpg',duration:3480}],
    'Rock':     [{id:'1w7OgIMMRc4',title:'Welcome to the Black Parade',artist:'My Chemical Romance',thumb:'https://i.ytimg.com/vi/1w7OgIMMRc4/mqdefault.jpg',duration:310},{id:'8UVNT4wvIGY',title:'Bohemian Rhapsody',artist:'Queen',thumb:'https://i.ytimg.com/vi/8UVNT4wvIGY/mqdefault.jpg',duration:354},{id:'_Yhyp-_hX2s',title:'Smells Like Teen Spirit',artist:'Nirvana',thumb:'https://i.ytimg.com/vi/_Yhyp-_hX2s/mqdefault.jpg',duration:301},{id:'oiKj0Z_Xnjc',title:'Thunder',artist:'Imagine Dragons',thumb:'https://i.ytimg.com/vi/oiKj0Z_Xnjc/mqdefault.jpg',duration:187},{id:'vBBOdYCRK1g',title:'Another Brick in the Wall',artist:'Pink Floyd',thumb:'https://i.ytimg.com/vi/vBBOdYCRK1g/mqdefault.jpg',duration:234}],
    'EDM':      [{id:'MmZexg8sxyk',title:'Closer',artist:'The Chainsmokers',thumb:'https://i.ytimg.com/vi/MmZexg8sxyk/mqdefault.jpg',duration:255},{id:'gCYcHz2k5x0',title:'Don\'t You Worry Child',artist:'Swedish House Mafia',thumb:'https://i.ytimg.com/vi/gCYcHz2k5x0/mqdefault.jpg',duration:238},{id:'ptAh5OeD784',title:'Titanium',artist:'David Guetta ft Sia',thumb:'https://i.ytimg.com/vi/ptAh5OeD784/mqdefault.jpg',duration:245},{id:'60ItHLz5WEA',title:'Faded',artist:'Alan Walker',thumb:'https://i.ytimg.com/vi/60ItHLz5WEA/mqdefault.jpg',duration:212},{id:'IIlN2qlQhBQ',title:'Levels',artist:'Avicii',thumb:'https://i.ytimg.com/vi/IIlN2qlQhBQ/mqdefault.jpg',duration:203}],
    'Jazz':     [{id:'vmDDOFXSgAs',title:'Take Five',artist:'Dave Brubeck',thumb:'https://i.ytimg.com/vi/vmDDOFXSgAs/mqdefault.jpg',duration:324},{id:'FxUQqbgCnbs',title:'So What',artist:'Miles Davis',thumb:'https://i.ytimg.com/vi/FxUQqbgCnbs/mqdefault.jpg',duration:562},{id:'AeElxRPEeek',title:'Autumn Leaves',artist:'Cannonball Adderley',thumb:'https://i.ytimg.com/vi/AeElxRPEeek/mqdefault.jpg',duration:540},{id:'pDAhukhMwNY',title:'Blue in Green',artist:'Miles Davis',thumb:'https://i.ytimg.com/vi/pDAhukhMwNY/mqdefault.jpg',duration:337},{id:'QrZHTgHDCF0',title:'All Blues',artist:'Miles Davis',thumb:'https://i.ytimg.com/vi/QrZHTgHDCF0/mqdefault.jpg',duration:695}],
    'R&B':      [{id:'DK_0jXPuIr0',title:'No Role Modelz',artist:'J. Cole',thumb:'https://i.ytimg.com/vi/DK_0jXPuIr0/mqdefault.jpg',duration:293},{id:'lWA2pjMjpBs',title:'Redbone',artist:'Childish Gambino',thumb:'https://i.ytimg.com/vi/lWA2pjMjpBs/mqdefault.jpg',duration:326},{id:'CvBfHwUxHIk',title:'Location',artist:'Khalid',thumb:'https://i.ytimg.com/vi/CvBfHwUxHIk/mqdefault.jpg',duration:219},{id:'VBmMU_iwe6U',title:'Earned It',artist:'The Weeknd',thumb:'https://i.ytimg.com/vi/VBmMU_iwe6U/mqdefault.jpg',duration:229},{id:'OB4nhGehlJU',title:'Often',artist:'The Weeknd',thumb:'https://i.ytimg.com/vi/OB4nhGehlJU/mqdefault.jpg',duration:249}],
    'Classical':[{id:'_4IRMYuE1hI',title:'Moonlight Sonata',artist:'Beethoven',thumb:'https://i.ytimg.com/vi/_4IRMYuE1hI/mqdefault.jpg',duration:902},{id:'nDn3ENE1kAc',title:'Für Elise',artist:'Beethoven',thumb:'https://i.ytimg.com/vi/nDn3ENE1kAc/mqdefault.jpg',duration:179},{id:'4Tr0otuiQuU',title:'Canon in D',artist:'Pachelbel',thumb:'https://i.ytimg.com/vi/4Tr0otuiQuU/mqdefault.jpg',duration:275},{id:'joGMDBSoRmk',title:'Clair de Lune',artist:'Debussy',thumb:'https://i.ytimg.com/vi/joGMDBSoRmk/mqdefault.jpg',duration:275},{id:'SacogDL_4JU',title:'The Four Seasons',artist:'Vivaldi',thumb:'https://i.ytimg.com/vi/SacogDL_4JU/mqdefault.jpg',duration:2659}],
    'Bollywood':[{id:'kJivtjN9m4w',title:'Kesariya',artist:'Arijit Singh',thumb:'https://i.ytimg.com/vi/kJivtjN9m4w/mqdefault.jpg',duration:270},{id:'YVhmEMEUqcw',title:'Raataan Lambiyan',artist:'Jubin Nautiyal',thumb:'https://i.ytimg.com/vi/YVhmEMEUqcw/mqdefault.jpg',duration:217},{id:'reUZRyXxUs4',title:'Tum Hi Ho',artist:'Arijit Singh',thumb:'https://i.ytimg.com/vi/reUZRyXxUs4/mqdefault.jpg',duration:261},{id:'gdB-YXFKhHk',title:'Gerua',artist:'Arijit Singh',thumb:'https://i.ytimg.com/vi/gdB-YXFKhHk/mqdefault.jpg',duration:320},{id:'xIiIiMVeFCU',title:'Channa Mereya',artist:'Arijit Singh',thumb:'https://i.ytimg.com/vi/xIiIiMVeFCU/mqdefault.jpg',duration:294}],
    'K-Pop':    [{id:'gdZLi9oWNZg',title:'Dynamite',artist:'BTS',thumb:'https://i.ytimg.com/vi/gdZLi9oWNZg/mqdefault.jpg',duration:199},{id:'MBdVXkSdhwU',title:'DNA',artist:'BTS',thumb:'https://i.ytimg.com/vi/MBdVXkSdhwU/mqdefault.jpg',duration:208},{id:'eTSmCmLCFIg',title:'Kill This Love',artist:'BLACKPINK',thumb:'https://i.ytimg.com/vi/eTSmCmLCFIg/mqdefault.jpg',duration:173},{id:'XXNy2nSM_0c',title:'Lovesick Girls',artist:'BLACKPINK',thumb:'https://i.ytimg.com/vi/XXNy2nSM_0c/mqdefault.jpg',duration:192},{id:'GGb-5-PJTS0',title:'Next Level',artist:'aespa',thumb:'https://i.ytimg.com/vi/GGb-5-PJTS0/mqdefault.jpg',duration:224}],
  };

  // ── Piped API search ──
  async function pipedSearch(query, limit = 20) {
    for (let i = 0; i < PIPED.length; i++) {
      const base = PIPED[(pipedIdx + i) % PIPED.length];
      try {
        const url = `${base}/search?q=${encodeURIComponent(query)}&filter=music_songs`;
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        const r = await fetch(proxyUrl, { signal: AbortSignal.timeout(6000) });
        if (!r.ok) continue;
        const proxyJson = await r.json();
        const data = JSON.parse(proxyJson.contents);
        pipedIdx = (pipedIdx + i) % PIPED.length;
        const items = (data.items || []).filter(v => v.type === 'stream').slice(0, limit);
        return items.map(v => ({
          id: v.url?.replace('/watch?v=', '') || '',
          title: v.title || 'Unknown',
          artist: v.uploaderName || 'Unknown',
          duration: v.duration || 0,
          thumb: v.thumbnail || `https://i.ytimg.com/vi/${v.url?.replace('/watch?v=','')}/mqdefault.jpg`,
        })).filter(v => v.id);
      } catch {}
    }
    return null; // all failed
  }

  // ── Piped trending ──
  async function pipedTrending() {
    for (let i = 0; i < PIPED.length; i++) {
      const base = PIPED[(pipedIdx + i) % PIPED.length];
      try {
        const r = await fetch(`${base}/trending?region=US`, {
          signal: AbortSignal.timeout(6000),
          mode: 'cors',
        });
        if (!r.ok) continue;
        const data = await r.json();
        pipedIdx = (pipedIdx + i) % PIPED.length;
        return (Array.isArray(data) ? data : []).slice(0, 20).map(v => ({
          id: v.url?.replace('/watch?v=', '') || '',
          title: v.title || 'Unknown',
          artist: v.uploaderName || 'Unknown',
          duration: v.duration || 0,
          thumb: v.thumbnail || `https://i.ytimg.com/vi/${v.url?.replace('/watch?v=','')}/mqdefault.jpg`,
        })).filter(v => v.id);
      } catch {}
    }
    return null;
  }

  // ── Public YouTube search via Invidious ──
  async function invidiousSearch(query) {
    for (const base of INVIDIOUS) {
      try {
        const url = `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=relevance&fields=videoId,title,author,lengthSeconds,videoThumbnails`;
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        const r = await fetch(proxyUrl, { signal: AbortSignal.timeout(6000) });
        if (!r.ok) continue;
        const proxyJson = await r.json();
        const data = JSON.parse(proxyJson.contents);
        if (!data || !data.length) continue;
        return data.slice(0, 20).map(v => {
          const thumbs = v.videoThumbnails || [];
          const thumb = (thumbs.find(t => t.quality === 'mqdefault') || thumbs[1] || thumbs[0] || {}).url
            || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`;
          return { id: v.videoId, title: v.title || 'Unknown', artist: v.author || 'Unknown', duration: v.lengthSeconds || 0, thumb };
        });
      } catch {}
    }
    return null;
  }

  // ── iTunes API (Global Music Catalog) ──
  async function itunesSearch(query, limit = 20) {
    try {
      const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=${limit}`);
      if (!r.ok) return null;
      const data = await r.json();
      if (!data.results || !data.results.length) return null;
      
      return data.results.map(v => ({
        id: 'itunes:' + encodeURIComponent(`${v.artistName} - ${v.trackName}`), 
        title: v.trackName || 'Unknown',
        artist: v.artistName || 'Unknown',
        duration: Math.floor((v.trackTimeMillis || 0) / 1000),
        thumb: (v.artworkUrl100 || '').replace('100x100bb', '300x300bb').replace('100x100', '300x300') || '',
      }));
    } catch {
      return null;
    }
  }

  // ── JioSaavn API (Free Hi-Res Audio directly) ──
  async function saavnSearch(query) {
    try {
      const r = await fetch(`https://jiosaavn-api-privatecvc2.vercel.app/search/songs?query=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(6000) });
      if(!r.ok) return null;
      const json = await r.json();
      if(json.status === "SUCCESS" && json.data && json.data.results) {
        return json.data.results.map(v => {
           const hqStream = (v.downloadUrl.find(d => d.quality === '320kbps') || v.downloadUrl[v.downloadUrl.length-1]).link;
           const thumb = (v.image.find(i => i.quality === '500x500') || v.image[v.image.length-1]).link;
           return {
             id: 'saavn:' + v.id,
             title: v.name,
             artist: v.primaryArtists,
             duration: parseInt(v.duration, 10),
             thumb: thumb,
             streamUrl: hqStream
           };
        });
      }
    } catch {}
    return null;
  }

  // ── Resolve iTunes ID to YouTube ID dynamically ──
  async function resolveId(query) {
    // We only search Piped and Invidious natively. NO fallback to seed arrays to avoid playing the wrong song.
    let results = await pipedSearch(query, 1);
    if (results && results.length) return results[0].id;
    
    results = await invidiousSearch(query);
    if (results && results.length) return results[0].id;
    
    return null; // Could not securely find the correct track ID
  }

  // ── Public entry points ──
  async function search(query, limit = 20, skipItunes = false) {
    // 1. Try JioSaavn for absolute pure Hi-Res audio (direct stream URLs!)
    let results = await saavnSearch(query);
    if (results && results.length) return results.slice(0, limit);

    // 2. Try iTunes first for pristine global metadata (if not skipped)
    if (!skipItunes) {
      results = await itunesSearch(query, limit);
      if (results && results.length) return results;
    }

    // 3. Try Piped
    results = await pipedSearch(query, limit);
    if (results && results.length) return results;

    // 4. Try Invidious
    results = await invidiousSearch(query);
    if (results && results.length) return results;

    // 5. Fallback: filter seed songs by keyword
    const q = query.toLowerCase();
    const filtered = [...SEED_TRENDING, ...Object.values(GENRE_SEEDS).flat()]
      .filter(s => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q));
    if (filtered.length) return filtered;

    App.toast('Search unavailable – showing popular songs', 'info');
    return SEED_TRENDING;
  }

  async function loadTrending() {
    App.showSongRow('trending-row', null, true);
    try {
      // 1. Try Piped trending
      let songs = await pipedTrending();
      if (songs && songs.length) { App.showSongRow('trending-row', songs, false); return; }

      // 2. Try Piped search for "top hits 2024"
      songs = await pipedSearch('top hits 2025 music', 18);
      if (songs && songs.length) { App.showSongRow('trending-row', songs, false); return; }
    } catch {}

    // 3. Use hardcoded seeds — always works
    App.showSongRow('trending-row', SEED_TRENDING, false);
    App.toast('Showing popular songs (API connecting…)', 'info');
  }

  // ── Load Hi-Fi Audio (Audiophile quality) ──
  async function loadHiFi() {
    App.showSongRow('hifi-row', null, true);
    // JioSaavn inherently provides 320kbps Hi-Res
    let results = await saavnSearch('english pop hits');
    if (!results || !results.length) results = await saavnSearch('trending playlist');
    
    if (results && results.length) {
      App.showSongRow('hifi-row', results, false);
    } else {
      App.showSongRow('hifi-row', SEED_TRENDING.slice(0, 8), false);
    }
  }

  async function loadBecause(song) {
    try {
      // Try to find related via piped
      for (const base of PIPED) {
        try {
          const r = await fetch(`${base}/streams/${song.id}`, { signal: AbortSignal.timeout(5000) });
          if (!r.ok) continue;
          const data = await r.json();
          const related = (data.relatedStreams || []).slice(0, 12).map(v => ({
            id: v.url?.replace('/watch?v=','') || '',
            title: v.title || '',
            artist: v.uploaderName || '',
            duration: v.duration || 0,
            thumb: v.thumbnail || `https://i.ytimg.com/vi/${v.url?.replace('/watch?v=','')}/mqdefault.jpg`,
          })).filter(v => v.id);
          if (related.length) {
            document.getElementById('because-title').textContent = `Because you listened to "${song.title.substring(0,28)}"`;
            document.getElementById('because-section').classList.remove('hidden');
            App.showSongRow('because-row', related, false);
            return;
          }
        } catch {}
      }
    } catch {}
  }

  function buildGenreGrid() {
    const grid = document.getElementById('genre-grid');
    const sidebar = document.getElementById('sidebar-genres');
    grid.innerHTML = '';
    sidebar.innerHTML = '';
    GENRES.forEach(g => {
      const card = document.createElement('div');
      card.className = 'genre-card';
      card.innerHTML = `
        <div class="genre-card-overlay" style="background:linear-gradient(135deg,${g.color}cc,${g.color}44)"></div>
        <span class="genre-card-icon">${g.icon}</span>
        <span class="genre-card-name">${g.name}</span>`;
      card.onclick = () => { Discovery.searchGenre(g.name); App.showPage('search'); };
      grid.appendChild(card);

      const chip = document.createElement('button');
      chip.className = 'genre-chip';
      chip.innerHTML = `<span class="genre-dot" style="background:${g.color}"></span>${g.name}`;
      chip.onclick = () => { Discovery.searchGenre(g.name); App.showPage('search'); };
      sidebar.appendChild(chip);
    });
  }

  async function searchGenre(genre) {
    if (genre === 'Lossless Hi-Fi') {
      document.getElementById('search-heading').textContent = `💎 Pure Lossless Hi-Fi Audio`;
      document.getElementById('search-input').value = 'Top Audiophile Hits';
      App.showResultsLoading();
      const r1 = await saavnSearch('english pop hits');
      const r2 = await saavnSearch('audiophile master');
      const combined = [];
      if (r1) combined.push(...r1);
      if (r2) combined.push(...r2);
      App.renderResultList(combined);
      return;
    }

    document.getElementById('search-heading').textContent = `🎵 ${genre}`;
    document.getElementById('search-input').value = genre + ' music';
    App.showResultsLoading();

    // Use hardcoded seeds first for instant results
    const seeds = GENRE_SEEDS[genre];
    if (seeds) {
      App.renderResultList(seeds);
    }

    // Then try to fetch live results
    const live = await pipedSearch(genre + ' music top hits', 20);
    if (live && live.length) {
      App.renderResultList(live);
    }
  }

  return { search, searchGenre, loadBecause, buildGenreGrid, loadTrending, loadHiFi, resolveId, GENRES, SEED_TRENDING };
})();

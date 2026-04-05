/**
 * player.js — YouTube IFrame API wrapper
 * Precision sync: every play/pause/seek/load fires a timestamped Pairing.sendSync()
 */
const Player = (() => {
  let ytPlayer = null;
  let ytReady = false;
  let currentSong = null;
  let queue = [];
  let queueIndex = -1;
  let shuffle = false;
  let repeat = 'none'; // 'none'|'one'|'all'
  let muted = false;
  let lastVol = 80;
  let progressRAF = null;
  let isRemoteAction = false; // flag: don't echo back remote actions to host

  // ── HTML5 Audio for Hi-Res ──
  let useHires = false;
  const audioPlayer = new Audio();
  audioPlayer.addEventListener('play', () => {
    setPlayBtn(false); startProgress();
    if (!isRemoteAction) Pairing.sendSync({ type: 'play', videoId: currentSong?.id, position: audioPlayer.currentTime });
  });
  audioPlayer.addEventListener('pause', () => {
    setPlayBtn(true); stopProgress();
    if (!isRemoteAction) Pairing.sendSync({ type: 'pause', position: audioPlayer.currentTime });
  });
  audioPlayer.addEventListener('ended', () => {
    stopProgress();
    if (repeat === 'one') { audioPlayer.currentTime = 0; audioPlayer.play(); } else next();
  });

  // ── YouTube API Ready ──
  window.onYouTubeIframeAPIReady = () => {
    ytPlayer = new YT.Player('yt-player', {
      height: '1',
      width: '1',
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: () => { ytReady = true; setVolume(80); },
        onStateChange: onStateChange,
        onError: e => {
          console.warn('YT error', e.data);
          // Error 150/101 = embedding restricted – try next in queue
          App.toast('This track is restricted, skipping…', 'error');
          setTimeout(next, 1000);
        },
      },
    });
  };

  function onStateChange(e) {
    const S = YT.PlayerState;
    if (e.data === S.PLAYING) {
      setPlayBtn(false);
      startProgress();
      if (!isRemoteAction) {
        Pairing.sendSync({
          type: 'play',
          videoId: currentSong?.id,
          position: ytPlayer.getCurrentTime(),
        });
      }
    } else if (e.data === S.PAUSED) {
      setPlayBtn(true);
      stopProgress();
      if (!isRemoteAction) {
        Pairing.sendSync({
          type: 'pause',
          position: ytPlayer.getCurrentTime(),
        });
      }
    } else if (e.data === S.ENDED) {
      stopProgress();
      if (repeat === 'one') { ytPlayer.seekTo(0); ytPlayer.playVideo(); }
      else next();
    }
  }

  // ── Play a song ──
  async function playSong(song, addToQueue = true, startPos = 0) {
    if (!ytReady && !song.streamUrl) { App.toast('Player loading…', 'info'); return; }

    // Resolve iTunes placeholder ID dynamically
    if (song.id && song.id.startsWith('itunes:')) {
      const query = decodeURIComponent(song.id.substring(7));
      App.toast('Finding optimal audio stream...', 'info');
      
      currentSong = song;
      updateNowPlaying(song);
      App.onSongChanged(song);
      
      const realId = await Discovery.resolveId(query);
      if (realId) {
        song.id = realId; 
      } else {
        App.toast('Audio stream not available.', 'error');
        return;
      }
    }

    currentSong = song;

    if (addToQueue) {
      queueIndex = queue.findIndex(s => s.id === song.id);
      if (queueIndex === -1) { queue.push(song); queueIndex = queue.length - 1; }
    }

    // Force HTML5 audio if JioSaavn stream URL exists directly
    if (song.streamUrl || useHires) {
      if (ytReady) ytPlayer.pauseVideo();
      const url = song.streamUrl || await getHqAudioUrl(song.id);
      if (url) {
        audioPlayer.src = url;
        audioPlayer.currentTime = startPos;
        audioPlayer.play().catch(e => console.warn('Hires autoplay prevented', e));
      } else if (!song.streamUrl) {
        App.toast('Hi-Res stream failed, falling back to standard', 'error');
        useHires = false;
        document.getElementById('btn-hires-toggle').innerHTML = '🎧 HQ: OFF';
        document.getElementById('btn-hires-toggle').style.background = 'rgba(255,255,255,0.1)';
        if (ytReady) { ytPlayer.loadVideoById({ videoId: song.id, startSeconds: startPos, suggestedQuality: 'small' }); ytPlayer.playVideo(); }
      }
    } else {
      audioPlayer.pause();
      if (ytReady) { ytPlayer.loadVideoById({ videoId: song.id, startSeconds: startPos, suggestedQuality: 'small' }); ytPlayer.playVideo(); }
    }

    updateNowPlaying(song);
    App.onSongChanged(song);
    Discovery.loadBecause(song);

    // Only host sends load sync
    if (!isRemoteAction) {
      Pairing.sendSync({
        type: 'load',
        videoId: song.id,
        title: song.title,
        artist: song.artist,
        thumb: song.thumb,
        streamUrl: song.streamUrl,
        duration: song.duration,
        position: startPos,
        isPlaying: true,
      });
    }
  }

  function setQueue(songs, startIndex = 0) {
    queue = [...songs];
    queueIndex = Math.max(0, Math.min(startIndex, songs.length - 1));
    if (queue[queueIndex]) playSong(queue[queueIndex], false, 0);
  }

  async function getHqAudioUrl(id) {
    try {
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent('https://pipedapi.kavin.rocks/streams/'+id)}`;
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
      if(res.ok) {
        const proxyJson = await res.json();
        const data = JSON.parse(proxyJson.contents);
        if(data.audioStreams && data.audioStreams.length) {
          data.audioStreams.sort((a,b) => b.bitrate - a.bitrate);
          return data.audioStreams[0].url;
        }
      }
    } catch {}
    
    try {
      const res = await fetch('https://api.cobalt.tools/api/json', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${id}`, aFormat: 'mp3', isAudioOnly: true })
      });
      const data = await res.json();
      if(data.url) return data.url;
    } catch {}
    return null;
  }

  // ── Controls ──
  function toggleHires() {
    useHires = !useHires;
    const btn = document.getElementById('btn-hires-toggle');
    if (useHires) {
      btn.innerHTML = '🎧 HQ: ON';
      btn.style.background = 'linear-gradient(135deg, #ec4899, #8b5cf6)';
      if (currentSong && !currentSong.streamUrl) { const t = getCurrentTime(); playSong(currentSong, false, t); }
    } else {
      btn.innerHTML = '🎧 HQ: OFF';
      btn.style.background = 'rgba(255,255,255,0.1)';
      if (currentSong && !currentSong.streamUrl) { const t = audioPlayer.currentTime; audioPlayer.pause(); playSong(currentSong, false, t); }
    }
  }

  function togglePlay() {
    if (!currentSong) return;
    if (useHires || currentSong.streamUrl) {
      if (audioPlayer.paused) audioPlayer.play(); else audioPlayer.pause();
      return;
    }
    if (!ytReady) return;
    const state = ytPlayer.getPlayerState();
    if (state === YT.PlayerState.PLAYING) ytPlayer.pauseVideo();
    else ytPlayer.playVideo();
  }

  function prev() {
    if (!ytReady) return;
    if (ytPlayer.getCurrentTime() > 3) { seekTo(0, true); return; }
    if (!queue.length) return;
    queueIndex = (queueIndex - 1 + queue.length) % queue.length;
    playSong(queue[queueIndex], false);
    if (!isRemoteAction) Pairing.sendSync({ type: 'prev' });
  }

  function next() {
    if (!queue.length) return;
    if (shuffle) {
      let ni;
      do { ni = Math.floor(Math.random() * queue.length); } while (queue.length > 1 && ni === queueIndex);
      queueIndex = ni;
    } else {
      if (repeat === 'all') queueIndex = (queueIndex + 1) % queue.length;
      else queueIndex = Math.min(queueIndex + 1, queue.length - 1);
    }
    playSong(queue[queueIndex], false);
    if (!isRemoteAction) Pairing.sendSync({ type: 'next' });
  }

  // seekTo: pct (0-100) or absolute seconds
  function seekTo(val, isAbsolute = false) {
    if (!currentSong) return;
    const isHtmlAudio = useHires || !!currentSong.streamUrl;
    const dur = isHtmlAudio ? audioPlayer.duration : (ytReady ? ytPlayer.getDuration() : 0);
    const pos = isAbsolute ? val : (dur || 0) * val / 100;
    
    if (isHtmlAudio) audioPlayer.currentTime = pos;
    else if (ytReady) ytPlayer.seekTo(pos, true);
    
    if (!isRemoteAction) {
      Pairing.sendSync({ type: 'seek', position: pos });
    }
  }

  function setVolume(v) {
    lastVol = +v;
    if (ytReady && ytPlayer) ytPlayer.setVolume(+v);
    audioPlayer.volume = Math.max(0, Math.min(1, (+v)/100));
    const icon = document.getElementById('vol-icon');
    if (icon) icon.textContent = +v === 0 ? '🔇' : +v < 40 ? '🔉' : '🔊';
    const slider = document.getElementById('vol-slider');
    if (slider && +slider.value !== +v) slider.value = v;
    muted = +v === 0;
  }

  function toggleMute() {
    if (muted) setVolume(lastVol || 80);
    else { lastVol = (useHires || (currentSong && currentSong.streamUrl)) ? audioPlayer.volume * 100 : ytPlayer.getVolume(); setVolume(0); }
  }

  function toggleShuffle() {
    shuffle = !shuffle;
    document.getElementById('btn-shuffle').classList.toggle('active', shuffle);
    App.toast(shuffle ? 'Shuffle on 🔀' : 'Shuffle off', 'info');
  }

  function toggleRepeat() {
    const modes = ['none','one','all'];
    const icons = { none:'⟲', one:'🔂', all:'🔁' };
    const idx = modes.indexOf(repeat);
    repeat = modes[(idx + 1) % modes.length];
    const btn = document.getElementById('btn-repeat');
    btn.classList.toggle('active', repeat !== 'none');
    btn.textContent = icons[repeat];
    App.toast('Repeat: ' + repeat, 'info');
  }

  // ── Remote control (called by pairing.js on guest side) ──
  function remoteControl(msg) {
    const isHtmlAudioTarget = msg.streamUrl || (currentSong && !!currentSong.streamUrl) || useHires;

    if (!ytReady && !isHtmlAudioTarget) {
      // Queue up the action for when player is ready
      setTimeout(() => remoteControl(msg), 500);
      return;
    }

    isRemoteAction = true;
    
    const isHtmlAudio = currentSong && !!currentSong.streamUrl || useHires;

    if (msg.type === 'load' || msg.type === 'state') {
      const song = { 
        id: msg.videoId, 
        title: msg.title || '', 
        artist: msg.artist || '', 
        thumb: msg.thumb || '',
        streamUrl: msg.streamUrl,
        duration: msg.duration
      };
      playSong(song, true, msg.position || 0);
      // If host was playing, make sure we play too
      if (msg.isPlaying !== false) {
        setTimeout(() => { 
          if ((song.streamUrl || useHires) && audioPlayer.paused) audioPlayer.play().catch(()=>{});
          else if (ytReady && ytPlayer) ytPlayer.playVideo(); 
        }, 1000);
      }
    }
    else if (msg.type === 'play') {
      if (isHtmlAudio) {
        if (msg.position !== undefined) audioPlayer.currentTime = msg.position;
        audioPlayer.play().catch(()=>{});
      } else {
        if (msg.position !== undefined) ytPlayer.seekTo(msg.position, true);
        ytPlayer.playVideo();
      }
    }
    else if (msg.type === 'pause') {
      if (isHtmlAudio) {
        if (msg.position !== undefined) audioPlayer.currentTime = msg.position;
        audioPlayer.pause();
      } else {
        if (msg.position !== undefined) ytPlayer.seekTo(msg.position, true);
        ytPlayer.pauseVideo();
      }
    }
    else if (msg.type === 'seek') {
      if (isHtmlAudio) audioPlayer.currentTime = msg.position || 0;
      else ytPlayer.seekTo(msg.position || 0, true);
    }
    else if (msg.type === 'next') {
      next();
    }
    else if (msg.type === 'prev') {
      prev();
    }

    setTimeout(() => { isRemoteAction = false; }, 200);
  }

  // ── Progress bar ──
  function startProgress() {
    stopProgress();
    function tick() {
      if (!currentSong) return;
      let cur = 0, dur = 0, isPlaying = false;
      const isHtmlAudio = useHires || !!currentSong.streamUrl;
      
      if (isHtmlAudio) {
        cur = audioPlayer.currentTime || 0;
        dur = audioPlayer.duration || currentSong.duration || 0;
        isPlaying = !audioPlayer.paused;
      } else if (ytReady && ytPlayer) {
        cur = ytPlayer.getCurrentTime() || 0;
        dur = ytPlayer.getDuration() || 0;
        isPlaying = ytPlayer.getPlayerState() === YT.PlayerState.PLAYING;
      }
      
      if (!isPlaying) return;
      const pct = dur ? (cur / dur * 100) : 0;
      document.getElementById('progress-fill').style.width = pct + '%';
      document.getElementById('progress-thumb').style.left = pct + '%';
      document.getElementById('t-cur').textContent = fmtTime(cur);
      document.getElementById('t-tot').textContent = fmtTime(dur);
      progressRAF = requestAnimationFrame(tick);
    }
    progressRAF = requestAnimationFrame(tick);
  }

  function stopProgress() {
    if (progressRAF) cancelAnimationFrame(progressRAF);
    progressRAF = null;
  }

  function fmtTime(s) {
    s = Math.floor(s || 0);
    return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
  }

  function setPlayBtn(paused) {
    const btn = document.getElementById('btn-play');
    if (btn) btn.textContent = paused ? '▶' : '⏸';
  }

  function updateNowPlaying(song) {
    document.getElementById('np-title').textContent = song.title;
    document.getElementById('np-artist').textContent = song.artist;
    const thumb = document.getElementById('np-thumb');
    thumb.src = song.thumb || '';
    thumb.classList.add('active');
    document.title = `${song.title} — InTune`;
  }

  // ── Progress track click/drag ──
  document.addEventListener('DOMContentLoaded', () => {
    const track = document.getElementById('progress-track');
    if (!track) return;
    let dragging = false;

    function pct(e) {
      const rect = track.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      return Math.max(0, Math.min(100, x / rect.width * 100));
    }

    track.addEventListener('click', e => seekTo(pct(e)));
    track.addEventListener('mousedown', () => {
      dragging = true;
      document.addEventListener('mousemove', onDrag);
      document.addEventListener('mouseup', onUp);
    });
    function onDrag(e) { if (dragging) seekTo(pct(e)); }
    function onUp() { dragging = false; document.removeEventListener('mousemove', onDrag); document.removeEventListener('mouseup', onUp); }

    track.addEventListener('touchstart', () => { dragging = true; }, { passive: true });
    track.addEventListener('touchmove', e => { if (dragging) seekTo(pct(e)); }, { passive: true });
    track.addEventListener('touchend', () => { dragging = false; });
  });

  // ── Download via Cobalt.tools ──
  async function download() {
    if (!currentSong) { App.toast('No song playing', 'error'); return; }
    
    let targetId = currentSong.id;
    if (targetId.startsWith('itunes:')) {
      App.toast('Resolving audio track...', 'info');
      const q = decodeURIComponent(targetId.substring(7));
      targetId = await Discovery.resolveId(q);
      if (!targetId) { App.toast('Track not available for download.', 'error'); return; }
      currentSong.id = targetId;
    }

    App.toast('Preparing download…', 'info');
    try {
      const res = await fetch('https://api.cobalt.tools/api/json', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `https://www.youtube.com/watch?v=${targetId}`,
          aFormat: 'mp3',
          isAudioOnly: true,
          filenamePattern: 'basic',
        }),
      });
      const data = await res.json();
      if (data.url) {
        App.addDownload(currentSong, data.url);
        const a = document.createElement('a');
        a.href = data.url; a.download = `${currentSong.title}.mp3`; a.target = '_blank'; a.click();
        App.toast('⬇ Download started!', 'success');
      } else { fallbackDownload(targetId); }
    } catch { fallbackDownload(targetId); }
  }

  function fallbackDownload(targetId) {
    if (!targetId) return;
    window.open(`https://www.y2mate.com/youtube-mp3/${targetId}`, '_blank');
    App.toast('Opening download page…', 'info');
  }

  function downloadById(song) {
    const prev = currentSong;
    currentSong = song;
    download().finally(() => { if (prev) currentSong = prev; });
  }

  function getCurrentTime() {
    if (currentSong && currentSong.streamUrl || useHires) return audioPlayer.currentTime || 0;
    return ytReady && ytPlayer ? (ytPlayer.getCurrentTime() || 0) : 0;
  }

  function setPlaybackRate(rate) {
    if (isNaN(rate) || !isFinite(rate)) return;
    const clamped = Math.max(0.5, Math.min(2.0, rate));
    audioPlayer.playbackRate = clamped;
    if (ytReady && ytPlayer && typeof ytPlayer.setPlaybackRate === 'function') {
      ytPlayer.setPlaybackRate(clamped);
    }
  }

  return {
    playSong, setQueue, togglePlay, prev, next, seekTo, toggleHires,
    setVolume, toggleMute, toggleShuffle, toggleRepeat,
    remoteControl, download, downloadById, setPlaybackRate,
    getCurrent: () => currentSong,
    getState: () => {
      const isHtmlAudio = currentSong && currentSong.streamUrl || useHires;
      if (isHtmlAudio) return audioPlayer.paused ? 2 : 1; 
      return ytReady && ytPlayer ? ytPlayer.getPlayerState() : -1;
    },
    getCurrentTime,
  };
})();

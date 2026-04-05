/**
 * pairing.js — High-precision PeerJS sync with latency compensation + drift correction
 *
 * How it works:
 * 1. Host pings guest → measures RTT → knows one-way latency
 * 2. Every sync message carries server timestamp + player position
 * 3. Guest compensates: actualPos = sentPos + (elapsed + latency/2)
 * 4. Host sends heartbeat every 1.5s → guest corrects drift if > 0.8s
 * 5. On play/pause/seek → instant precise sync with timestamp
 */
const Pairing = (() => {
  let peer = null;
  let conn = null;
  let myCode = null;
  let role = null;       // 'host' | 'guest'
  let latency = 0;       // estimated one-way latency in ms
  let heartbeatTimer = null;
  let pingTimer = null;
  let pingStartTime = 0;
  let isSyncing = false; // prevent re-entrant sync

  // ── Code generation ──
  function genCode() {
    return Math.floor(1000000000 + Math.random() * 9000000000).toString();
  }

  // ── Host: init ──
  function initHost() {
    myCode = genCode();
    // Use default reliable PeerJS cloud server rather than hardcoding IP/ports
    peer = new Peer(myCode);

    peer.on('open', id => {
      showPairCode(id);
      App.toast('🔗 Pair code ready! Share it to sync another device.', 'success');
    });

    peer.on('connection', c => {
      // If already have a connection, close old one
      if (conn && conn.open) conn.close();
      conn = c;
      setupHostConn(conn);
    });

    peer.on('error', e => {
      console.warn('[Pairing] host error', e.type);
      App.toast('Pairing error: ' + e.type, 'error');
    });
  }

  function setupHostConn(c) {
    c.on('open', () => {
      role = 'host';
      showPairBanner('Guest device connected!');
      App.toast('📱 Device paired! Music will stay in sync.', 'success');

      // Measure latency immediately
      measureLatency(c);

      // Send current playback state immediately
      setTimeout(() => sendCurrentState(c), 300);

      // Start heartbeat — sends position every 1.5s for drift correction
      startHeartbeat(c);
    });

    c.on('data', msg => {
      if (!msg || !msg.type) return;
      if (msg.type === 'pong') {
        // Calculate RTT, estimate one-way latency
        const rtt = Date.now() - pingStartTime;
        latency = Math.round(rtt / 2);
        console.log(`[Pairing] Latency: ${latency}ms (RTT: ${rtt}ms)`);
        return;
      }
      
      // Allow two-way party control (Guest -> Host)
      if (['play', 'pause', 'seek', 'next', 'prev', 'load', 'state'].includes(msg.type)) {
        handleSyncMsg(msg);
      }
    });

    c.on('close', () => {
      stopHeartbeat();
      hidePairBanner();
      App.toast('Paired device disconnected', 'info');
      latency = 0;
    });
    c.on('error', e => console.warn('[Pairing] conn error', e));
  }

  // ── Guest: connect ──
  function connectAsGuest(code) {
    code = code.trim().replace(/\D/g, '');
    if (code.length !== 10) { App.toast('Enter a valid 10-digit code', 'error'); return; }

    if (peer) { try { peer.destroy(); } catch {} peer = null; }

    // Use default reliable PeerJS cloud server
    peer = new Peer();

    peer.on('open', () => {
      role = 'guest';
      App.toast('Connecting to host…', 'info');
      conn = peer.connect(code, { reliable: true, serialization: 'json' });
      setupGuestConn(conn);
    });

    peer.on('error', e => App.toast('Could not pair: ' + e.type, 'error'));
  }

  function setupGuestConn(c) {
    c.on('open', () => {
      showPairBanner('Synced with host device!');
      App.toast('✅ Paired! Syncing music…', 'success');
    });

    c.on('data', msg => {
      if (!msg || !msg.type) return;

      if (msg.type === 'ping') {
        // Reply immediately for latency measurement
        c.send({ type: 'pong', ts: msg.ts });
        return;
      }

      handleSyncMsg(msg);
    });

    c.on('close', () => { hidePairBanner(); App.toast('Lost connection to host', 'info'); role = null; });
    c.on('error', e => console.warn('[Pairing] guest conn error', e));
  }

  // ── Latency measurement (host pings guest, guest pongs back) ──
  function measureLatency(c) {
    pingStartTime = Date.now();
    c.send({ type: 'ping', ts: pingStartTime });
    // Re-measure every 10s to track change
    pingTimer = setInterval(() => {
      if (c && c.open) { pingStartTime = Date.now(); c.send({ type: 'ping', ts: pingStartTime }); }
    }, 10000);
  }

  // ── Host: send current player state to guest ──
  function sendCurrentState(c) {
    const cur = Player.getCurrent();
    if (!cur) return;
    const position = Player.getCurrentTime();
    const isPlaying = Player.getState() === 1; // YT PLAYING = 1
    c.send({
      type: 'state',
      videoId: cur.id,
      title: cur.title,
      artist: cur.artist,
      thumb: cur.thumb,
      streamUrl: cur.streamUrl,
      duration: cur.duration,
      position,
      isPlaying,
      ts: Date.now(),
    });
  }

  // ── Host: heartbeat every 1.5s (position sync for drift correction) ──
  function startHeartbeat(c) {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (c && c.open && Player.getState() === 1) { // only when playing
        c.send({
          type: 'heartbeat',
          position: Player.getCurrentTime(),
          ts: Date.now(),
        });
      }
    }, 1500);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (pingTimer) clearInterval(pingTimer);
    heartbeatTimer = null;
    pingTimer = null;
  }

  // ── Receive + apply messages with latency compensation (Bi-directional) ──
  function handleSyncMsg(msg) {
    if (isSyncing) return;
    isSyncing = true;
    setTimeout(() => isSyncing = false, 100);

    // Calculate how much time passed since host sent this
    const networkDelay = (Date.now() - msg.ts) / 1000; // in seconds

    if (msg.type === 'state' || msg.type === 'load') {
      // Load or state sync: load the video + seek to compensated position
      const compensatedPos = (msg.position || 0) + networkDelay;
      Player.remoteControl({
        type: 'load',
        videoId: msg.videoId,
        title: msg.title,
        artist: msg.artist,
        thumb: msg.thumb,
        streamUrl: msg.streamUrl,
        duration: msg.duration,
        position: compensatedPos,
        isPlaying: msg.isPlaying !== false,
      });
    }
    else if (msg.type === 'play') {
      const compensatedPos = (msg.position || 0) + networkDelay;
      Player.remoteControl({ type: 'play', position: compensatedPos });
    }
    else if (msg.type === 'pause') {
      // For pause, seek to exact position (no time has passed logically)
      Player.remoteControl({ type: 'pause', position: msg.position || 0 });
    }
    else if (msg.type === 'seek') {
      Player.remoteControl({ type: 'seek', position: msg.position || 0 });
    }
    else if (msg.type === 'heartbeat') {
      if (role === 'host') return; // Only Guest aligns drift to Host
      
      const expectedPos = (msg.position || 0) + networkDelay + (latency / 1000) + 0.01;
      const actualPos = Player.getCurrentTime();
      const drift = expectedPos - actualPos; // Positive = we are behind
      
      if (Math.abs(drift) > 1.5 && Math.abs(drift) < 30) {
        // Hard seek if very out of sync > 1.5s
        console.log(`[Pairing] Hard seek for drift: ${drift.toFixed(2)}s`);
        Player.remoteControl({ type: 'seek', position: expectedPos });
        Player.setPlaybackRate(1.0);
      } else if (Math.abs(drift) > 0.02) {
        // Millisecond precision pitching: seamlessly adjust speed to catch up or wait
        const rate = 1.0 + (drift * 0.15); // e.g. 0.1s drift = 1.015x speed
        Player.setPlaybackRate(rate);
      } else {
        // We are perfectly in sync
        Player.setPlaybackRate(1.0);
      }
    }
    else if (msg.type === 'next') {
      Player.remoteControl({ type: 'next' });
    }
    else if (msg.type === 'prev') {
      Player.remoteControl({ type: 'prev' });
    }
  }

  // ── Public: send event (Bi-directional Party Mode) ──
  function sendSync(msg) {
    if (!conn || !conn.open) return;
    try {
      conn.send({ ...msg, ts: Date.now() });
    } catch (e) {
      console.warn('[Pairing] sendSync failed', e);
    }
  }

  // ── UI helpers ──
  function showPairCode(code) {
    myCode = code;
    document.getElementById('pair-code-text').textContent = code;
    document.getElementById('pair-code-badge').classList.remove('hidden');
    document.getElementById('modal-pair-code').textContent = code;
  }

  function showPairBanner(text) {
    document.getElementById('pair-banner-text').textContent = text;
    document.getElementById('pair-banner').classList.remove('hidden');
  }

  function hidePairBanner() {
    document.getElementById('pair-banner').classList.add('hidden');
  }

  function getCode() { return myCode; }

  return {
    init: initHost,
    connectAs: (_, code) => connectAsGuest(code || document.getElementById('pair-input').value),
    sendSync,
    getCode,
  };
})();

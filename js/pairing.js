/**
 * pairing.js — High-precision PeerJS sync with latency compensation + drift correction 
 * Multi-Device Star Topology (1 Host to N Guests)
 */
const Pairing = (() => {
  let peer = null;
  let conns = [];        // Array of active connections
  let myCode = null;
  let role = null;       // 'host' | 'guest'
  let heartbeatTimer = null;
  let pingTimer = null;
  let isSyncing = false; // prevent re-entrant sync

  // Guest latency estimation
  let guestLatency = 0; 

  // ── Code generation ──
  function genCode() {
    return Math.floor(1000000000 + Math.random() * 9000000000).toString();
  }

  // ── Host: init ──
  function initHost() {
    myCode = genCode();
    peer = new Peer(myCode);

    peer.on('open', id => {
      showPairCode(id);
      App.toast('🔗 Pair code ready! Share it to sync another device.', 'success');
    });

    peer.on('connection', c => {
      // Accept unlimited guests!
      conns.push(c);
      setupHostConn(c);
    });

    peer.on('error', e => {
      console.warn('[Pairing] host error', e.type);
      App.toast('Pairing error: ' + e.type, 'error');
    });
  }

  function setupHostConn(c) {
    c.on('open', () => {
      role = 'host';
      updateConnectedBanner();
      App.toast('📱 Guest device paired!', 'success');

      c.pingStartTime = Date.now();
      c.send({ type: 'ping', ts: c.pingStartTime });

      setTimeout(() => sendCurrentState(c), 300);

      // Start global heartbeat if not already running
      startHeartbeat();
      startPingLoop();
    });

    c.on('data', msg => {
      if (!msg || !msg.type) return;
      if (msg.type === 'pong') {
        const rtt = Date.now() - (c.pingStartTime || Date.now());
        c.latency = Math.round(rtt / 2);
        return;
      }
      
      // Relay commands from Guest A to Guest B, C...
      if (['play', 'pause', 'seek', 'next', 'prev', 'load', 'state'].includes(msg.type)) {
        conns.forEach(guestConn => {
          if (guestConn.peer !== c.peer && guestConn.open) {
             guestConn.send({ ...msg, ts: Date.now() });
          }
        });
        handleSyncMsg(msg, c.latency || 0);
      }
    });

    c.on('close', () => {
      conns = conns.filter(conn => conn !== c);
      updateConnectedBanner();
      if (conns.length === 0) {
        stopTimers();
        hidePairBanner();
        App.toast('All devices disconnected', 'info');
      }
    });

    c.on('error', e => console.warn('[Pairing] conn error', e));
  }

  // ── Guest: connect ──
  function connectAsGuest(code) {
    code = code.trim().replace(/\D/g, '');
    if (code.length !== 10) { App.toast('Enter a valid 10-digit code', 'error'); return; }

    if (peer) { try { peer.destroy(); } catch {} peer = null; }

    peer = new Peer();

    peer.on('open', () => {
      role = 'guest';
      App.toast('Connecting to host…', 'info');
      const c = peer.connect(code, { reliable: true, serialization: 'json' });
      conns = [c]; // Guest only ever has 1 connection to Host
      setupGuestConn(c);
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
        c.send({ type: 'pong', ts: msg.ts });
        return;
      }

      handleSyncMsg(msg, guestLatency);
    });

    c.on('close', () => { 
      conns = []; 
      hidePairBanner(); 
      App.toast('Lost connection to host', 'info'); 
      role = null; 
    });
    c.on('error', e => console.warn('[Pairing] guest conn error', e));
  }

  // ── Pinging logic ──
  function startPingLoop() {
    if (pingTimer) return;
    pingTimer = setInterval(() => {
      conns.forEach(c => {
        if (c.open && role === 'host') {
          c.pingStartTime = Date.now();
          c.send({ type: 'ping', ts: c.pingStartTime });
        }
      });
    }, 10000);
  }

  // ── Host: send current player state to a specific new guest ──
  function sendCurrentState(c) {
    const cur = Player.getCurrent();
    if (!cur || !c.open) return;
    const position = Player.getCurrentTime();
    const isPlaying = Player.getState() === 1 || Player.getState() === 2; 
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

  // ── Host: universal heartbeat sync ──
  function startHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(() => {
      const state = Player.getState();
      if (state === 1 || state === 2) {
        conns.forEach(c => {
          if (c.open) {
            c.send({
              type: 'heartbeat',
              position: Player.getCurrentTime(),
              ts: Date.now(),
            });
          }
        });
      }
    }, 1500);
  }

  function stopTimers() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (pingTimer) clearInterval(pingTimer);
    heartbeatTimer = null;
    pingTimer = null;
  }

  // ── Receive + apply messages (Bi-directional Party Mode) ──
  function handleSyncMsg(msg, specificLatency = 0) {
    const networkDelay = (Date.now() - msg.ts) / 1000; 

    if (msg.type === 'state' || msg.type === 'load') {
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
      Player.remoteControl({ type: 'pause', position: msg.position || 0 });
    }
    else if (msg.type === 'seek') {
      Player.remoteControl({ type: 'seek', position: msg.position || 0 });
    }
    else if (msg.type === 'heartbeat') {
      if (role === 'host') return; 
      
      const expectedPos = (msg.position || 0) + networkDelay + (specificLatency / 1000) + 0.01;
      const actualPos = Player.getCurrentTime();
      const drift = expectedPos - actualPos;
      
      if (Math.abs(drift) > 1.5 && Math.abs(drift) < 30) {
        console.log(`[Pairing] Hard seek for drift: ${drift.toFixed(2)}s`);
        Player.remoteControl({ type: 'seek', position: expectedPos });
        Player.setPlaybackRate(1.0);
      } else if (Math.abs(drift) > 0.02) {
        const rate = 1.0 + (drift * 0.15); 
        Player.setPlaybackRate(rate);
      } else {
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

  // ── Public: send event to all connected devices ──
  function sendSync(msg) {
    if (conns.length === 0) return;
    const payload = { ...msg, ts: Date.now() };
    conns.forEach(c => {
      try {
        if (c.open) c.send(payload);
      } catch (e) {
        console.warn('[Pairing] sendSync failed', e);
      }
    });
  }

  // ── UI helpers ──
  function showPairCode(code) {
    myCode = code;
    document.getElementById('pair-code-text').textContent = code;
    document.getElementById('pair-code-badge').classList.remove('hidden');
    document.getElementById('modal-pair-code').textContent = code;
  }

  function updateConnectedBanner() {
    if (conns.length > 0) {
      const text = conns.length === 1 ? '1 Device Linked' : `${conns.length} Devices Linked`;
      showPairBanner(text);
    }
  }

  function showPairBanner(text) {
    document.getElementById('pair-banner-text').textContent = text;
    document.getElementById('pair-banner').classList.remove('hidden');
  }

  function hidePairBanner() {
    document.getElementById('pair-banner').classList.add('hidden');
  }

  return {
    init: initHost,
    connectAs: (_, code) => connectAsGuest(code || document.getElementById('pair-input').value),
    sendSync,
    getCode: () => myCode,
  };
})();

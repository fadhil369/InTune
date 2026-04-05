/**
 * bluetooth.js — Web Bluetooth API dual-speaker management
 *
 * Connects up to 2 BT audio devices (a2dp-sink profile).
 * Uses AudioContext.setSinkId() where available (Chrome 110+) to route
 * YouTube player audio to selected BT outputs.
 */
const BT = (() => {
  const MAX_DEVICES = 2;
  let devices = []; // { id, name, device, connected, sinkId }

  function openModal() {
    renderDevices();
    document.getElementById('bt-modal').classList.add('open');
  }

  function closeModal() {
    document.getElementById('bt-modal').classList.remove('open');
  }

  async function scan() {
    if (!navigator.bluetooth) {
      App.toast('Web Bluetooth not supported. Use Chrome on Android/Desktop.', 'error');
      return;
    }
    if (devices.filter(d => d.connected).length >= MAX_DEVICES) {
      App.toast('Maximum 2 speakers connected. Disconnect one first.', 'error');
      return;
    }
    try {
      App.toast('Scanning for speakers…', 'info');
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service'],
      });
      const existing = devices.find(d => d.id === device.id);
      if (!existing) {
        devices.push({ id: device.id, name: device.name || 'Bluetooth Speaker', device, connected: false, sinkId: null });
      }
      renderDevices();
      await connect(device.id);
    } catch (e) {
      if (e.name !== 'NotFoundError') App.toast('Bluetooth scan failed: ' + e.message, 'error');
    }
  }

  async function connect(id) {
    const d = devices.find(x => x.id === id);
    if (!d) return;
    try {
      const gatt = await d.device.gatt.connect();
      d.connected = true;
      App.toast(`✅ ${d.name} connected!`, 'success');

      // setSinkId for audio routing (Chrome 110+)
      await trySetSinkId(d);

      d.device.addEventListener('gattserverdisconnected', () => {
        d.connected = false;
        renderDevices();
        App.toast(`${d.name} disconnected`, 'info');
      });
    } catch (e) {
      App.toast(`Could not connect to ${d.name}: ${e.message}`, 'error');
    }
    renderDevices();
  }

  async function trySetSinkId(d) {
    try {
      // Get available audio output devices
      const outputs = await navigator.mediaDevices.enumerateDevices();
      const audioOut = outputs.filter(dev => dev.kind === 'audiooutput');
      // Find matching BT device by name (best effort)
      const match = audioOut.find(o => o.label.toLowerCase().includes(d.name.toLowerCase().split(' ')[0]));
      if (match && match.deviceId) {
        d.sinkId = match.deviceId;
        const ytFrame = document.getElementById('yt-player');
        if (ytFrame && ytFrame.setSinkId) {
          await ytFrame.setSinkId(match.deviceId);
          App.toast(`Audio routed to ${d.name}`, 'success');
        }
      }
    } catch {}
  }

  function disconnect(id) {
    const d = devices.find(x => x.id === id);
    if (!d) return;
    try { d.device.gatt.disconnect(); } catch {}
    d.connected = false;
    renderDevices();
    App.toast(`${d.name} disconnected`, 'info');
  }

  function renderDevices() {
    const list = document.getElementById('bt-device-list');
    if (!list) return;
    list.innerHTML = '';
    if (devices.length === 0) {
      list.innerHTML = '<p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">No speakers found. Click Scan below.</p>';
      return;
    }
    devices.forEach(d => {
      const el = document.createElement('div');
      el.className = 'bt-device' + (d.connected ? ' connected' : '');
      el.innerHTML = `
        <div class="bt-info">
          <span class="bt-name">🔵 ${d.name}</span>
          <span class="bt-status">${d.connected ? '● Connected' : 'Not connected'}</span>
        </div>
        <button class="btn-connect ${d.connected ? 'disco' : ''}" onclick="BT.${d.connected ? 'disconnect' : 'connect'}('${d.id}')">
          ${d.connected ? 'Disconnect' : 'Connect'}
        </button>`;
      list.appendChild(el);
    });
  }

  return { openModal, closeModal, scan, connect, disconnect };
})();

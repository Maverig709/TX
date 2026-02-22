// TX Messenger - ultra-lightweight client

const EMOJIS = ['😀','😊','😂','❤️','👍','🔥','🎉','✨','🤔','😢','🙏','👋','💯','👀','🤝','📎','📷','📄','🔒','✅'];
const IMAGE_TYPES = ['image/jpeg','image/png','image/gif','image/webp'];
const FILE_ICONS = {
  'application/pdf': '📕',
  'application/msword': '📘',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📘',
  'application/zip': '📦',
  'application/x-rar-compressed': '📦',
  'default': '📄'
};

let socket, roomId, userName, myId;
let peerConnections = {};
let localStream = null;
let micOn = true;
let speakerOn = true;
let inCall = false;

const joinPanel = document.getElementById('join');
const chatPanel = document.getElementById('chat');
const joinForm = document.getElementById('joinForm');
const roomLabel = document.getElementById('roomLabel');
const userCount = document.getElementById('userCount');
const messagesEl = document.getElementById('messages');
const typingEl = document.getElementById('typingIndicator');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const fileInput = document.getElementById('fileInput');
const attachBtn = document.getElementById('attachBtn');
const emojiBtn = document.getElementById('emojiBtn');
const emojiPicker = document.getElementById('emojiPicker');
const connectionStatus = document.getElementById('connectionStatus');
const joinCallBtn = document.getElementById('joinCallBtn');
const micBtn = document.getElementById('micBtn');
const speakerBtn = document.getElementById('speakerBtn');
const dropHint = messagesEl.querySelector('.drop-hint');

// Join
joinForm.addEventListener('submit', (e) => {
  e.preventDefault();
  userName = (document.getElementById('userName').value.trim() || 'Guest');
  roomId = (document.getElementById('roomId').value.trim() || 'lobby').toLowerCase();
  // Switch to chat panel first so UI updates even if socket fails
  joinPanel.classList.add('hidden');
  chatPanel.classList.remove('hidden');
  roomLabel.textContent = `#${roomId}`;
  connect();
});

document.getElementById('back').addEventListener('click', () => {
  if (socket) socket.disconnect();
  location.reload();
});

function connect() {
  if (typeof io === 'undefined') {
    connectionStatus.textContent = 'Socket.io not loaded. Open via http://localhost:3000';
    connectionStatus.classList.add('error');
    return;
  }
  connectionStatus.textContent = 'Connecting…';
  connectionStatus.classList.remove('error');
  socket = io();
  socket.on('connect', () => {
    myId = socket.id;
    connectionStatus.textContent = '';
    socket.emit('join', { roomId, userName });
  });
  socket.on('connect_error', () => {
    connectionStatus.textContent = 'Connection failed. Is the server running?';
    connectionStatus.classList.add('error');
  });
  socket.on('users', updateUserCount);
  socket.on('history', (msgs) => msgs.forEach(appendMessage));
  socket.on('message', appendMessage);
  socket.on('typing', ({ name }) => {
    typingEl.textContent = `${name} typing...`;
    typingEl.classList.remove('hidden');
  });
  socket.on('stopTyping', () => { typingEl.classList.add('hidden'); });
  socket.on('peer-joined-call', ({ id }) => {
    if (inCall && id !== myId && !peerConnections[id]) createOffer(id);
  });
  socket.on('webrtc-offer', async ({ from, offer }) => {
    const pc = getOrCreatePC(from);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('webrtc-answer', { to: from, answer });
  });
  socket.on('webrtc-answer', async ({ from, answer }) => {
    const pc = peerConnections[from];
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
  });
  socket.on('webrtc-ice', async ({ from, candidate }) => {
    const pc = peerConnections[from];
    if (pc && candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate));
  });
}

function updateUserCount(users) {
  const n = users.length;
  userCount.textContent = n ? `${n} online` : '';
}

// Messages
messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;
  sendMessage({ text });
  messageInput.value = '';
  socket?.emit('stopTyping');
});

messageInput.addEventListener('input', () => {
  if (!socket?.connected) return;
  if (messageInput.value) socket.emit('typing');
  else socket.emit('stopTyping');
});
let typingTimeout;
messageInput.addEventListener('keydown', () => {
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => socket?.emit('stopTyping'), 1500);
});

function sendMessage({ text = '', files = [] }) {
  if (socket?.connected) socket.emit('message', { text, files });
}

function appendMessage(msg) {
  const mine = msg.userId === myId;
  const div = document.createElement('div');
  div.className = `msg ${mine ? 'mine' : 'other'}`;
  div.dataset.id = msg.id;
  let filesHtml = '';
  if (msg.files && msg.files.length) {
    filesHtml = msg.files.map(f => renderFile(f)).join('');
  }
  div.innerHTML = `
    <span class="msg-name">${escapeHtml(msg.userName)}</span>
    <div class="msg-content">
      ${msg.text ? `<div class="msg-text">${escapeHtml(msg.text)}</div>` : ''}
      ${filesHtml ? `<div class="msg-files">${filesHtml}</div>` : ''}
      <div class="msg-status">${msg.delivered ? '✓' : ''}</div>
    </div>
  `;
  const dropHintEl = messagesEl.querySelector('.drop-hint');
  messagesEl.insertBefore(div, dropHintEl);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderFile(f) {
  const isImg = f.mimetype && IMAGE_TYPES.includes(f.mimetype);
  const icon = FILE_ICONS[f.mimetype] || FILE_ICONS['default'];
  if (isImg) {
    return `<a class="msg-file" href="${f.url}" target="_blank" rel="noopener"><img src="${f.url}" alt="${escapeHtml(f.name)}"></a>`;
  }
  return `<a class="msg-file" href="${f.url}" target="_blank" rel="noopener">${icon} ${escapeHtml(f.name)}</a>`;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// Emoji
emojiBtn.addEventListener('click', () => {
  emojiPicker.classList.toggle('hidden');
  if (!emojiPicker.classList.contains('hidden') && !emojiPicker.querySelector('.emoji-grid')) {
    const grid = document.createElement('div');
    grid.className = 'emoji-grid';
    EMOJIS.forEach(emoji => {
      const span = document.createElement('span');
      span.textContent = emoji;
      span.onclick = () => {
        messageInput.value += emoji;
        messageInput.focus();
      };
      grid.appendChild(span);
    });
    emojiPicker.appendChild(grid);
  }
});
document.addEventListener('click', (e) => {
  if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) emojiPicker.classList.add('hidden');
});

// Attach & Drag-drop
attachBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => handleFiles(fileInput.files));

['dragenter','dragover','dragleave','drop'].forEach(ev => {
  messagesEl.addEventListener(ev, (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
});
messagesEl.addEventListener('dragover', () => messagesEl.classList.add('dragover'));
messagesEl.addEventListener('dragleave', () => messagesEl.classList.remove('dragover'));
messagesEl.addEventListener('drop', (e) => {
  messagesEl.classList.remove('dragover');
  handleFiles(e.dataTransfer.files);
});

async function handleFiles(files) {
  if (!files.length) return;
  const uploads = [];
  for (const f of files) {
    const form = new FormData();
    form.append('file', f);
    try {
      const res = await fetch('/upload', { method: 'POST', body: form });
      const data = await res.json();
      uploads.push({ url: data.url, name: data.name, mimetype: data.mimetype });
    } catch (err) {
      console.error('Upload failed', err);
    }
  }
  if (uploads.length) sendMessage({ text: messageInput.value.trim(), files: uploads });
  messageInput.value = '';
  fileInput.value = '';
}

// Audio (WebRTC)
const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function getOrCreatePC(peerId) {
  if (peerConnections[peerId]) return peerConnections[peerId];
  const pc = new RTCPeerConnection(rtcConfig);
  peerConnections[peerId] = pc;
  if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  pc.ontrack = (e) => {
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.muted = !speakerOn;
    audio.srcObject = e.streams[0];
    audio.dataset.peer = peerId;
    document.body.appendChild(audio);
  };
  pc.onicecandidate = (e) => {
    if (e.candidate) socket.emit('webrtc-ice', { to: peerId, candidate: e.candidate });
  };
  pc.onconnectionstatechange = () => {
    if (['disconnected','failed','closed'].includes(pc.connectionState)) {
      document.querySelector(`audio[data-peer="${peerId}"]`)?.remove();
      delete peerConnections[peerId];
    }
  };
  return pc;
}

async function createOffer(peerId) {
  const pc = getOrCreatePC(peerId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('webrtc-offer', { to: peerId, offer });
}

joinCallBtn.addEventListener('click', async () => {
  if (inCall) {
    inCall = false;
    localStream?.getTracks().forEach(t => t.stop());
    localStream = null;
    Object.values(peerConnections).forEach(pc => pc.close());
    peerConnections = {};
    document.querySelectorAll('audio[data-peer]').forEach(a => a.remove());
    joinCallBtn.textContent = '📞';
    joinCallBtn.classList.remove('in-call');
    micBtn.classList.add('hidden');
    speakerBtn.classList.add('hidden');
    return;
  }
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    inCall = true;
    joinCallBtn.textContent = '📴';
    joinCallBtn.classList.add('in-call');
    micBtn.classList.remove('hidden');
    speakerBtn.classList.remove('hidden');
    socket.emit('join-call');
  } catch (err) {
    console.warn('Mic access denied', err);
  }
});

micBtn.addEventListener('click', () => {
  micOn = !micOn;
  micBtn.classList.toggle('muted', !micOn);
  if (localStream) localStream.getAudioTracks().forEach(t => { t.enabled = micOn; });
});

speakerBtn.addEventListener('click', () => {
  speakerOn = !speakerOn;
  speakerBtn.classList.toggle('active', speakerOn);
  document.querySelectorAll('audio[data-peer]').forEach(a => { a.muted = !speakerOn; });
});

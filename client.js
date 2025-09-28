const SIGNALING = (new URL(location.href)).origin.replace(/^http/, 'ws') + '/ws';

let ws;
let localStream;
let myId;
const pcs = {};
const audios = {};

const pcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

async function start() {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  ws = new WebSocket(SIGNALING);
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "join", room: "main", name: "Player" }));
  };
  ws.onmessage = async (evt) => {
    const data = JSON.parse(evt.data);
    if (data.type === "id") myId = data.id;
    else if (data.type === "peers") for (const p of data.peers) await createOffer(p.id);
    else if (data.type === "offer") await handleOffer(data);
    else if (data.type === "answer") await handleAnswer(data);
    else if (data.type === "candidate") await handleCandidate(data);
    else if (data.type === "peer-left") removePeer(data.id);
  };
}

async function createOffer(peerId) {
  if (pcs[peerId]) return;
  const pc = new RTCPeerConnection(pcConfig);
  pcs[peerId] = pc;
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  pc.onicecandidate = e => {
    if (e.candidate) ws.send(JSON.stringify({ type: "candidate", to: peerId, from: myId, candidate: e.candidate }));
  };
  pc.ontrack = e => attachRemoteStream(peerId, e.streams[0]);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: "offer", to: peerId, from: myId, sdp: pc.localDescription }));
}

async function handleOffer(msg) {
  const peerId = msg.from;
  const pc = new RTCPeerConnection(pcConfig);
  pcs[peerId] = pc;
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  pc.onicecandidate = e => {
    if (e.candidate) ws.send(JSON.stringify({ type: "candidate", to: peerId, from: myId, candidate: e.candidate }));
  };
  pc.ontrack = e => attachRemoteStream(peerId, e.streams[0]);
  await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  ws.send(JSON.stringify({ type: "answer", to: peerId, from: myId, sdp: pc.localDescription }));
}

async function handleAnswer(msg) {
  const pc = pcs[msg.from];
  if (pc) await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
}

async function handleCandidate(msg) {
  const pc = pcs[msg.from];
  if (pc) await pc.addIceCandidate(msg.candidate);
}

function attachRemoteStream(peerId, stream) {
  const audio = document.createElement("audio");
  audio.autoplay = true;
  audio.srcObject = stream;
  document.body.appendChild(audio);
  audios[peerId] = audio;
}

function removePeer(peerId) {
  if (pcs[peerId]) { pcs[peerId].close(); delete pcs[peerId]; }
  if (audios[peerId]) { audios[peerId].remove(); delete audios[peerId]; }
}

start();

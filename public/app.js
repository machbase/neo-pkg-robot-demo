import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

const canvas = document.getElementById('scene');
const timeline = document.getElementById('timeline');
const playButton = document.getElementById('playButton');
const skipBackLargeButton = document.getElementById('skipBackLargeButton');
const skipBackButton = document.getElementById('skipBackButton');
const skipForwardButton = document.getElementById('skipForwardButton');
const skipForwardLargeButton = document.getElementById('skipForwardLargeButton');
const speedSelect = document.getElementById('speedSelect');
const resetViewButton = document.getElementById('resetViewButton');
const datasetLabel = document.getElementById('datasetLabel');
const sourceLabel = document.getElementById('sourceLabel');
const frameIdLabel = document.getElementById('frameId');
const episodeIdLabel = document.getElementById('episodeId');
const gripperLabel = document.getElementById('gripper');
const eeSpeedLabel = document.getElementById('eeSpeed');
const taskLabel = document.getElementById('taskLabel');
const timeLabel = document.getElementById('timeLabel');
const frameQueryMsLabel = document.getElementById('frameQueryMs');
const windowQueryMsLabel = document.getElementById('windowQueryMs');
const signalRowsLabel = document.getElementById('signalRows');
const eventCountLabel = document.getElementById('eventCount');
const phaseLabel = document.getElementById('phaseLabel');
const anomalyLabel = document.getElementById('anomalyLabel');
const energyLabel = document.getElementById('energyLabel');
const signalChart = document.getElementById('signalChart');
const chartRangeLabel = document.getElementById('chartRange');
const eventQueryMsLabel = document.getElementById('eventQueryMs');
const eventList = document.getElementById('eventList');
const eventRail = document.getElementById('eventRail');
const currentTimeBubble = document.getElementById('currentTimeBubble');
const startTimeLabel = document.getElementById('startTimeLabel');
const endTimeLabel = document.getElementById('endTimeLabel');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x101114, 1);
if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x101114, 55, 165);

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 500);
camera.position.set(7.2, -11.4, 6.4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(1.8, 0, 1.8);
controls.maxPolarAngle = Math.PI * 0.49;

const grid = new THREE.GridHelper(28, 28, 0x45515d, 0x252b32);
scene.add(grid);

const stageMaterial = new THREE.MeshStandardMaterial({
  color: 0x1a2026,
  metalness: 0.38,
  roughness: 0.46,
  transparent: true,
  opacity: 0.78
});
const stage = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 6.2, 0.08, 96), stageMaterial);
stage.position.set(2.0, 0, -0.04);
scene.add(stage);

const stageRing = new THREE.Mesh(
  new THREE.TorusGeometry(3.7, 0.018, 8, 128),
  new THREE.MeshBasicMaterial({ color: 0x18c5a3, transparent: true, opacity: 0.5 })
);
stageRing.rotation.x = Math.PI / 2;
stageRing.position.set(2.0, 0, 0.02);
scene.add(stageRing);

scene.add(new THREE.HemisphereLight(0xc6def2, 0x1e242c, 1.65));
const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(8, -9, 14);
scene.add(key);
const fill = new THREE.DirectionalLight(0x7fd8c8, 0.8);
fill.position.set(-8, 5, 7);
scene.add(fill);
const rim = new THREE.DirectionalLight(0x8fb7ff, 1.1);
rim.position.set(-7, 8, 9);
scene.add(rim);

const robot = new THREE.Group();
scene.add(robot);

const jointGroups = [];
const linkLengths = [1.15, 2.25, 1.85, 1.55, 1.15, 0.85, 0.58];
const jointAxes = ['z', 'y', 'y', 'x', 'y', 'x', 'z'];

const matGraphite = new THREE.MeshStandardMaterial({ color: 0x2b333b, metalness: 0.72, roughness: 0.28 });
const matShell = new THREE.MeshStandardMaterial({ color: 0xdde6ea, metalness: 0.18, roughness: 0.31 });
const matJoint = new THREE.MeshStandardMaterial({ color: 0x60717f, metalness: 0.82, roughness: 0.22 });
const matDarkJoint = new THREE.MeshStandardMaterial({ color: 0x20262d, metalness: 0.75, roughness: 0.2 });
const matTeal = new THREE.MeshStandardMaterial({ color: 0x18c5a3, emissive: 0x06463c, metalness: 0.34, roughness: 0.18 });
const matAmber = new THREE.MeshStandardMaterial({ color: 0xf2b84b, emissive: 0x3a2504, metalness: 0.32, roughness: 0.2 });

function accentMaterial(index) {
  return index % 3 === 1 ? matAmber : index % 3 === 2 ? matJoint : matTeal;
}

function makeHorizontalCylinder(length, radius, mat, segments) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, segments || 32),
    mat
  );
  mesh.rotation.z = Math.PI / 2;
  mesh.position.x = length / 2;
  return mesh;
}

function makeLink(length, radius, index) {
  const group = new THREE.Group();
  const railOffset = radius * 0.92;
  const upper = makeHorizontalCylinder(length, radius * 0.62, matShell, 36);
  const lower = makeHorizontalCylinder(length, radius * 0.62, matShell, 36);
  upper.position.y = railOffset;
  lower.position.y = -railOffset;
  group.add(upper);
  group.add(lower);

  const spine = makeHorizontalCylinder(length * 0.92, radius * 0.32, matGraphite, 24);
  spine.position.x = length * 0.5;
  spine.position.z = radius * 0.78;
  group.add(spine);

  const glow = makeHorizontalCylinder(length * 0.72, Math.max(0.018, radius * 0.16), accentMaterial(index), 16);
  glow.position.x = length * 0.5;
  glow.position.z = -radius * 0.92;
  group.add(glow);

  const capA = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.76, 24, 14), matGraphite);
  const capB = capA.clone();
  capA.position.set(0, 0, 0);
  capB.position.set(length, 0, 0);
  group.add(capA);
  group.add(capB);
  return group;
}

function makeJoint(radius, index) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(radius, 34, 22), matDarkJoint);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.72, 28, 18), matJoint);
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.92, radius * 0.055, 8, 48), accentMaterial(index));
  const ringB = ringA.clone();
  ringA.rotation.y = Math.PI / 2;
  ringB.rotation.x = Math.PI / 2;
  group.add(core);
  group.add(shell);
  group.add(ringA);
  group.add(ringB);
  return group;
}

function buildRobot() {
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.82, 1.05, 0.5, 64),
    matGraphite
  );
  base.position.z = 0.24;
  robot.add(base);
  const baseTop = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.7, 0.24, 64), matShell);
  baseTop.position.z = 0.62;
  robot.add(baseTop);
  const baseGlow = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.028, 8, 96), matTeal);
  baseGlow.rotation.x = Math.PI / 2;
  baseGlow.position.z = 0.51;
  robot.add(baseGlow);

  let parent = robot;
  let cursor = new THREE.Group();
  cursor.position.z = 0.86;
  parent.add(cursor);

  for (let i = 0; i < 7; i++) {
    const joint = new THREE.Group();
    joint.add(makeJoint(i === 0 ? 0.36 : 0.27, i));
    cursor.add(joint);
    jointGroups.push(joint);

    const link = makeLink(linkLengths[i], i < 2 ? 0.17 : 0.13, i);
    joint.add(link);

    cursor = new THREE.Group();
    cursor.position.x = linkLengths[i];
    joint.add(cursor);
  }

  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.38, 32), matGraphite);
  wrist.rotation.z = Math.PI / 2;
  wrist.position.x = 0.1;
  cursor.add(wrist);
  const palm = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.52, 0.24),
    matShell
  );
  palm.position.x = 0.32;
  cursor.add(palm);
  const fingerGeometry = new THREE.BoxGeometry(0.48, 0.075, 0.12);
  const leftFinger = new THREE.Mesh(fingerGeometry, matAmber);
  const rightFinger = leftFinger.clone();
  leftFinger.position.set(0.74, 0.24, 0.08);
  rightFinger.position.set(0.74, -0.24, 0.08);
  cursor.add(leftFinger);
  cursor.add(rightFinger);
  robot.userData.endEffector = cursor;
  robot.userData.leftFinger = leftFinger;
  robot.userData.rightFinger = rightFinger;
}

buildRobot();

const target = new THREE.Mesh(
  new THREE.TorusGeometry(0.34, 0.025, 12, 48),
  new THREE.MeshBasicMaterial({ color: 0xf2b84b })
);
target.rotation.x = Math.PI / 2;
scene.add(target);

const trailMaterial = new THREE.LineBasicMaterial({ color: 0x18c5a3, transparent: true, opacity: 0.82 });
const trailGeometry = new THREE.BufferGeometry();
const trail = new THREE.Line(trailGeometry, trailMaterial);
scene.add(trail);
const trailPoints = [];

let manifest = null;
let playing = false;
let currentMs = 0;
let minMs = 0;
let maxMs = 0;
let lastTick = performance.now();
let loading = false;
let lastLoadMs = 0;
let contextLoading = false;
let lastContextMs = 0;
let visibleEvents = [];

async function api(path) {
  let res = await fetch(path);
  if (!res.ok && path.indexOf('/api/') === 0) {
    res = await fetch(path.replace('/api/', '/cgi-bin/api/'));
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function fmtTime(ms) {
  return new Date(ms).toISOString().replace('T', ' ').replace('Z', '');
}

function shortTime(ms) {
  return new Date(ms).toISOString().slice(11, 23).replace('Z', '');
}

function fmtClock(ms) {
  return new Date(ms).toISOString().slice(14, 19);
}

function phaseName(value) {
  if (typeof value === 'string' && value) return value;
  const names = ['approach', 'grasp', 'move', 'release'];
  return names[Math.max(0, Math.min(3, Math.round(Number(value || 0))))];
}

function sourceText(payload) {
  if (!payload || payload.source !== 'machbase') return 'synthetic fallback until data is ingested';
  const minutes = manifest ? Math.round(((maxMs - minMs) / 60000) * 10) / 10 : 0;
  const frames = manifest ? Number(manifest.frameCount || 0).toLocaleString() : '--';
  const rows = manifest ? Number(manifest.jsonRowCount || manifest.signalRowCount || 0).toLocaleString() : '--';
  const ms = Number(payload.queryMs || 0).toFixed(0);
  return `${minutes} min / ${frames} frames / ${rows} JSON rows with path rollup in ${ms} ms`;
}

function setAxis(group, axis, value) {
  group.rotation.set(0, 0, 0);
  if (axis === 'x') group.rotation.x = value;
  if (axis === 'y') group.rotation.y = value;
  if (axis === 'z') group.rotation.z = value;
}

function updateRobot(frame) {
  const joints = frame.joints || [];
  for (let i = 0; i < jointGroups.length; i++) {
    setAxis(jointGroups[i], jointAxes[i], Number(joints[i] || 0));
  }
  const grip = Math.max(0, Math.min(1, Number(frame.gripper || 0)));
  const spread = 0.16 + grip * 0.24;
  robot.userData.leftFinger.position.y = spread;
  robot.userData.rightFinger.position.y = -spread;

  const ee = frame.endEffector || { x: 0, y: 0, z: 0 };
  target.position.set(ee.x || 0, ee.y || 0, ee.z || 0);

  const world = new THREE.Vector3();
  robot.userData.endEffector.getWorldPosition(world);
  trailPoints.push(world.clone());
  if (trailPoints.length > 320) trailPoints.shift();
  trailGeometry.setFromPoints(trailPoints);
}

function timelinePercent(ms) {
  return Math.max(0, Math.min(100, ((ms - minMs) / Math.max(1, maxMs - minMs)) * 100));
}

function updateTimelineUi(ms) {
  const percent = timelinePercent(ms);
  timeline.value = String(Math.round(percent * 10));
  currentTimeBubble.textContent = shortTime(ms);
  currentTimeBubble.style.left = `${percent}%`;
  if (percent < 7) currentTimeBubble.style.transform = 'translateX(0)';
  else if (percent > 93) currentTimeBubble.style.transform = 'translateX(-100%)';
  else currentTimeBubble.style.transform = 'translateX(-50%)';
  timeLabel.textContent = fmtTime(ms);
}

async function loadAt(ms, force) {
  if (loading) return;
  if (!force && Math.abs(ms - lastLoadMs) < 70) return;
  loading = true;
  lastLoadMs = ms;
  try {
    const dataset = manifest && manifest.dataset ? `&dataset=${encodeURIComponent(manifest.dataset)}` : '';
    const sequence = manifest && manifest.sequence ? `&sequence=${encodeURIComponent(manifest.sequence)}` : '';
    const frameFromMs = Number.isFinite(minMs) ? Math.max(minMs, ms - 60000) : ms - 60000;
    const from = `&from=${Math.round(frameFromMs)}`;
    const payload = await api(`/api/frame?time=${Math.round(ms)}${from}${dataset}${sequence}`);
    const frame = payload.frame;
    updateRobot(frame);

    controls.target.lerp(target.position, 0.18);
    frameIdLabel.textContent = String(frame.frameId);
    episodeIdLabel.textContent = frame.episodeId || '--';
    gripperLabel.textContent = Number(frame.gripper || 0).toFixed(2);
    eeSpeedLabel.textContent = `${Number((payload.signals && payload.signals.ee_speed) || 0).toFixed(2)} m/s`;
    frameQueryMsLabel.textContent = `${Number(payload.queryMs || 0).toFixed(0)} ms`;
    phaseLabel.textContent = phaseName(payload.phase || (payload.signals && payload.signals.cycle_phase));
    anomalyLabel.textContent = Number(payload.anomalyScore || (payload.signals && payload.signals.anomaly_score) || 0).toFixed(2);
    energyLabel.textContent = Number(payload.motionEnergy || (payload.signals && payload.signals.motion_energy) || 0).toFixed(2);
    taskLabel.textContent = frame.task || '--';
    updateTimelineUi(ms);
    sourceLabel.textContent = sourceText(payload);
    if (force || Math.abs(ms - lastContextMs) > 2500) loadContext(ms);
  } catch (err) {
    sourceLabel.textContent = err.message;
  } finally {
    loading = false;
  }
}

function groupedSignals(rows) {
  const out = {};
  for (const row of rows || []) {
    const key = row.signal;
    if (!out[key]) out[key] = [];
    out[key].push({ time: Date.parse(row.time), value: Number(row.value || 0) });
  }
  return out;
}

function drawSeries(ctx, points, minMs, maxMs, minValue, maxValue, color, width, height) {
  if (!points || points.length < 2) return;
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (let i = 0; i < points.length; i++) {
    const px = ((points[i].time - minMs) / Math.max(1, maxMs - minMs)) * width;
    const py = height - ((points[i].value - minValue) / Math.max(0.0001, maxValue - minValue)) * height;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

function drawSignalChart(rows, fromMs, toMs) {
  const ctx = signalChart.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = signalChart.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  if (signalChart.width !== width || signalChart.height !== height) {
    signalChart.width = width;
    signalChart.height = height;
  }
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#111418';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(159, 170, 182, 0.18)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = (height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  const grouped = groupedSignals(rows);
  drawSeries(ctx, grouped.ee_speed, fromMs, toMs, 0, 2.2, '#18c5a3', width, height);
  drawSeries(ctx, grouped.motion_energy, fromMs, toMs, 0, 10, '#f2b84b', width, height);
  drawSeries(ctx, grouped.anomaly_score, fromMs, toMs, 0, 1, '#e35d6a', width, height);
}

function renderEvents(events, fromMs, toMs) {
  visibleEvents = events || [];
  eventList.innerHTML = '';
  eventRail.innerHTML = '';
  if (!visibleEvents.length) {
    const empty = document.createElement('div');
    empty.className = 'event-item event-info';
    empty.innerHTML = '<small>--:--</small><span>No events in window</span>';
    eventList.appendChild(empty);
    return;
  }
  for (let i = 0; i < Math.min(visibleEvents.length, 5); i++) {
    const ev = visibleEvents[i];
    const time = Date.parse(ev.time);
    const item = document.createElement('button');
    item.className = `event-item event-${ev.severity || 'info'}`;
    item.innerHTML = `<small>${fmtClock(time)}</small><span>${ev.label || ev.type}</span>`;
    item.addEventListener('click', () => jumpTo(time));
    eventList.appendChild(item);
  }
  for (let i = 0; i < visibleEvents.length; i++) {
    const ev = visibleEvents[i];
    const time = Date.parse(ev.time);
    if (!Number.isFinite(time)) continue;
    const marker = document.createElement('button');
    marker.className = `event-marker ${ev.severity || 'info'}`;
    marker.style.left = `${timelinePercent(time)}%`;
    marker.title = `${ev.type} ${fmtTime(time)}`;
    marker.addEventListener('click', () => jumpTo(time));
    eventRail.appendChild(marker);
  }
}

async function loadContext(ms) {
  if (contextLoading || !manifest) return;
  contextLoading = true;
  lastContextMs = ms;
  const from = Math.max(minMs, ms - 15000);
  const to = Math.min(maxMs, ms + 15000);
  const dataset = manifest.dataset ? `&dataset=${encodeURIComponent(manifest.dataset)}` : '';
  const sequence = manifest.sequence ? `&sequence=${encodeURIComponent(manifest.sequence)}` : '';
  try {
    const [windowPayload, signalPayload, eventPayload] = await Promise.all([
      api(`/api/window?from=${Math.round(from)}&to=${Math.round(to)}&limit=240${dataset}${sequence}`),
      api(`/api/signals?from=${Math.round(from)}&to=${Math.round(to)}&signals=ee_speed,motion_energy,anomaly_score&limit=1200${dataset}${sequence}`),
      api(`/api/events?from=${Math.round(from)}&to=${Math.round(to)}&limit=80${dataset}${sequence}`)
    ]);
    windowQueryMsLabel.textContent = `${Number(windowPayload.queryMs || 0).toFixed(0)} ms`;
    eventQueryMsLabel.textContent = `${Number(eventPayload.queryMs || 0).toFixed(0)} ms`;
    chartRangeLabel.textContent = `${Math.round((to - from) / 1000)}s`;
    drawSignalChart(signalPayload.signals || [], from, to);
    renderEvents(eventPayload.events || [], from, to);
  } catch (err) {
    eventQueryMsLabel.textContent = err.message;
  } finally {
    contextLoading = false;
  }
}

function jumpTo(ms) {
  if (!manifest || !Number.isFinite(ms)) return;
  currentMs = Math.max(minMs, Math.min(maxMs, ms));
  updateTimelineUi(currentMs);
  loadAt(currentMs, true);
}

function jumpBy(deltaMs) {
  jumpTo(currentMs + deltaMs);
}

function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  if (manifest) loadContext(currentMs);
}

function animate(now) {
  const dt = now - lastTick;
  lastTick = now;
  if (playing && manifest) {
    currentMs += dt * Number(speedSelect.value);
    if (currentMs > maxMs) currentMs = minMs;
    updateTimelineUi(currentMs);
    loadAt(currentMs, false);
  }
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

timeline.addEventListener('input', () => {
  if (!manifest) return;
  currentMs = minMs + (Number(timeline.value) / 1000) * (maxMs - minMs);
  jumpTo(currentMs);
});

playButton.addEventListener('click', () => {
  playing = !playing;
  playButton.textContent = playing ? 'Ⅱ' : '▶';
});

skipBackLargeButton.addEventListener('click', () => jumpBy(-30000));
skipBackButton.addEventListener('click', () => jumpBy(-5000));
skipForwardButton.addEventListener('click', () => jumpBy(5000));
skipForwardLargeButton.addEventListener('click', () => jumpBy(30000));

resetViewButton.addEventListener('click', () => {
  camera.position.set(8, -12, 7);
  controls.target.set(1.8, 0, 1.8);
});

window.addEventListener('resize', resize);

async function boot() {
  resize();
  manifest = await api('/api/manifest');
  minMs = Date.parse(manifest.minTime);
  maxMs = Date.parse(manifest.maxTime);
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || maxMs <= minMs) {
    minMs = Date.now();
    maxMs = minMs + 600000;
  }
  currentMs = minMs;
  startTimeLabel.textContent = shortTime(minMs);
  endTimeLabel.textContent = shortTime(maxMs);
  updateTimelineUi(currentMs);
  datasetLabel.textContent = `${manifest.dataset || 'dataset'} / ${manifest.sequence || 'sequence'} / ${manifest.frameCount || 0} frames`;
  signalRowsLabel.textContent = String(manifest.jsonRowCount || manifest.signalRowCount || '--');
  eventCountLabel.textContent = String(manifest.eventCount || '--');
  sourceLabel.textContent = sourceText(manifest);
  await loadAt(currentMs, true);
  requestAnimationFrame(animate);
}

boot().catch((err) => {
  sourceLabel.textContent = err.message;
  requestAnimationFrame(animate);
});

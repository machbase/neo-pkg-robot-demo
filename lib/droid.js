'use strict';

const fs = require('fs');
const path = require('path');

const TRAJECTORY_FILES = [
  'trajectory.json',
  'trajectory.ndjson',
  'trajectory.jsonl',
  'trajectory.csv'
];

function exists(file) {
  try { return fs.existsSync(file); } catch (_) { return false; }
}

function stat(file) {
  try { return fs.statSync(file); } catch (_) { return null; }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function walkDirs(root, out, depth) {
  out = out || [];
  depth = depth == null ? 8 : depth;
  const st = stat(root);
  if (!st || !st.isDirectory()) return out;
  out.push(root);
  if (depth <= 0) return out;
  const names = fs.readdirSync(root);
  for (let i = 0; i < names.length; i++) {
    if (names[i] === '.' || names[i] === '..') continue;
    const file = path.join(root, names[i]);
    const s = stat(file);
    if (s && s.isDirectory()) walkDirs(file, out, depth - 1);
  }
  return out;
}

function firstMetadataFile(dir) {
  const names = fs.readdirSync(dir);
  for (let i = 0; i < names.length; i++) {
    if (/^metadata_.*\.json$/i.test(names[i])) return path.join(dir, names[i]);
  }
  if (exists(path.join(dir, 'metadata.json'))) return path.join(dir, 'metadata.json');
  return null;
}

function findTrajectoryFile(dir) {
  for (let i = 0; i < TRAJECTORY_FILES.length; i++) {
    const file = path.join(dir, TRAJECTORY_FILES[i]);
    if (exists(file)) return file;
  }
  return null;
}

function findEpisodes(root, limit) {
  const dirs = walkDirs(root);
  const episodes = [];
  for (let i = 0; i < dirs.length; i++) {
    const dir = dirs[i];
    const trajectory = findTrajectoryFile(dir);
    const metadataFile = firstMetadataFile(dir);
    const h5 = path.join(dir, 'trajectory.h5');
    if (!trajectory && !metadataFile && !exists(h5)) continue;
    episodes.push({
      dir: dir,
      id: path.basename(dir),
      metadataFile: metadataFile,
      trajectoryFile: trajectory,
      h5File: exists(h5) ? h5 : null,
      metadata: metadataFile ? readJson(metadataFile, {}) : {}
    });
    if (limit > 0 && episodes.length >= limit) break;
  }
  return episodes;
}

function scalar(value, fallback) {
  if (value == null) return fallback;
  if (Array.isArray(value)) return scalar(value[0], fallback);
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function arrayOf(value, size, fallback) {
  const out = [];
  if (Array.isArray(value)) {
    for (let i = 0; i < size; i++) out.push(scalar(value[i], 0));
  } else if (typeof value === 'string') {
    const parts = value.split(/[,\s]+/).filter(Boolean);
    for (let i = 0; i < size; i++) out.push(scalar(parts[i], 0));
  }
  while (out.length < size) out.push(fallback || 0);
  return out.slice(0, size);
}

function at(obj, pathText) {
  let cur = obj;
  const parts = pathText.split('.');
  for (let i = 0; i < parts.length; i++) {
    if (cur == null) return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

function firstValue(obj, paths) {
  for (let i = 0; i < paths.length; i++) {
    const value = at(obj, paths[i]);
    if (value != null) return value;
  }
  return undefined;
}

function taskFrom(step, metadata) {
  const value = firstValue(step, [
    'language_instruction',
    'language_instruction_1',
    'observation.language_instruction',
    'task',
    'instruction'
  ]);
  if (value != null && String(value) !== '') return String(value);
  const meta = metadata || {};
  return String(meta.language_instruction || meta.task || meta.task_description || meta.scene_id || 'DROID manipulation episode');
}

function normalizeStep(raw, metadata, index, sampleMs, baseTimeMs) {
  const step = raw || {};
  const obs = step.observation || step.obs || {};
  const actionDict = step.action_dict || step.actionDict || {};
  const joint = firstValue(step, [
    'joint_position',
    'joints',
    'qpos',
    'observation.joint_position',
    'obs.joint_position',
    'state.joint_position'
  ]);
  const gripper = firstValue(step, [
    'gripper_position',
    'observation.gripper_position',
    'obs.gripper_position',
    'state.gripper_position'
  ]);
  const cartesian = firstValue(step, [
    'cartesian_position',
    'observation.cartesian_position',
    'obs.cartesian_position',
    'state.cartesian_position'
  ]);
  const action = firstValue(step, [
    'action',
    'action_dict.joint_position',
    'action_dict.joint_velocity',
    'actionDict.joint_position'
  ]);
  const elapsedMs = firstValue(step, ['elapsed_ms', 'timestamp_ms', 'time_ms']);
  const timestamp = firstValue(step, ['timestamp', 'time', 't', 'elapsed_sec']);
  let timeMs = baseTimeMs + index * sampleMs;
  if (elapsedMs != null) {
    const numeric = parseFloat(elapsedMs);
    if (Number.isFinite(numeric)) timeMs = baseTimeMs + numeric;
  } else if (timestamp != null) {
    const numeric = parseFloat(timestamp);
    if (Number.isFinite(numeric)) {
      timeMs = numeric > 100000000000 ? numeric : baseTimeMs + numeric * (numeric > 1000000 ? 1 : 1000);
    } else {
      const parsed = Date.parse(String(timestamp));
      if (Number.isFinite(parsed)) timeMs = parsed;
    }
  }
  const pose = arrayOf(cartesian != null ? cartesian : [
    obs.ee_x || step.ee_x || 0,
    obs.ee_y || step.ee_y || 0,
    obs.ee_z || step.ee_z || 0,
    obs.ee_roll || step.ee_roll || 0,
    obs.ee_pitch || step.ee_pitch || 0,
    obs.ee_yaw || step.ee_yaw || 0
  ], 6, 0);
  return {
    time: new Date(timeMs),
    sampleIndex: index,
    joints: arrayOf(joint, 7, 0),
    gripper: scalar(gripper, 0),
    cartesian: pose,
    action: arrayOf(action, 7, 0),
    task: taskFrom(step, metadata)
  };
}

function parseJsonTrajectory(file, metadata, sampleMs, baseTimeMs) {
  const data = readJson(file, null);
  if (data == null) return [];
  let steps = data;
  if (!Array.isArray(steps)) {
    steps = data.steps || data.frames || data.trajectory || data.records || [];
  }
  if (!Array.isArray(steps)) return [];
  const out = [];
  for (let i = 0; i < steps.length; i++) out.push(normalizeStep(steps[i], metadata, i, sampleMs, baseTimeMs));
  return out;
}

function parseNdjsonTrajectory(file, metadata, sampleMs, baseTimeMs) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      out.push(normalizeStep(JSON.parse(line), metadata, out.length, sampleMs, baseTimeMs));
    } catch (_) {}
  }
  return out;
}

function parseCsvLine(line) {
  const out = [];
  let value = '';
  let quote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quote && line[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        quote = !quote;
      }
    } else if (ch === ',' && !quote) {
      out.push(value);
      value = '';
    } else {
      value += ch;
    }
  }
  out.push(value);
  return out;
}

function parseCsvTrajectory(file, metadata, sampleMs, baseTimeMs) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]).map(h => h.trim());
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row = {};
    for (let c = 0; c < header.length; c++) row[header[c]] = values[c];
    const joints = [];
    const actions = [];
    for (let j = 0; j < 7; j++) {
      joints.push(scalar(row['joint_' + j] != null ? row['joint_' + j] : row['j' + j], 0));
      actions.push(scalar(row['action_' + j] != null ? row['action_' + j] : row['a' + j], 0));
    }
    const step = {
      timestamp: row.timestamp || row.time || row.elapsed_sec || row.elapsed_ms,
      joint_position: joints,
      gripper_position: row.gripper,
      cartesian_position: [
        row.ee_x, row.ee_y, row.ee_z,
        row.ee_roll, row.ee_pitch, row.ee_yaw
      ],
      action: actions,
      language_instruction: row.task || row.language_instruction
    };
    out.push(normalizeStep(step, metadata, out.length, sampleMs, baseTimeMs));
  }
  return out;
}

function readTrajectory(episode, options) {
  options = options || {};
  const sampleMs = options.sampleMs || 100;
  const baseTimeMs = options.baseTimeMs || Date.parse('2026-01-01T00:00:00Z');
  if (!episode.trajectoryFile) return [];
  if (/\.ndjson$/i.test(episode.trajectoryFile) || /\.jsonl$/i.test(episode.trajectoryFile)) {
    return parseNdjsonTrajectory(episode.trajectoryFile, episode.metadata, sampleMs, baseTimeMs);
  }
  if (/\.csv$/i.test(episode.trajectoryFile)) {
    return parseCsvTrajectory(episode.trajectoryFile, episode.metadata, sampleMs, baseTimeMs);
  }
  return parseJsonTrajectory(episode.trajectoryFile, episode.metadata, sampleMs, baseTimeMs);
}

function syntheticSteps(count, sampleMs, baseTimeMs) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = i * sampleMs / 1000;
    out.push({
      time: new Date(baseTimeMs + i * sampleMs),
      sampleIndex: i,
      joints: [
        Math.sin(t * 0.45) * 0.8,
        Math.sin(t * 0.63 + 0.7) * 0.7,
        Math.cos(t * 0.38) * 0.72,
        Math.sin(t * 0.51 + 1.1) * 0.88,
        Math.cos(t * 0.72) * 0.5,
        Math.sin(t * 0.42 + 2.4) * 0.64,
        Math.cos(t * 0.9) * 0.35
      ],
      gripper: 0.5 + Math.sin(t * 0.8) * 0.5,
      cartesian: [
        2.8 + Math.sin(t * 0.31) * 1.2,
        Math.cos(t * 0.27) * 1.4,
        2.2 + Math.sin(t * 0.22 + 0.4) * 0.7,
        0,
        Math.sin(t * 0.3) * 0.4,
        Math.cos(t * 0.24) * 0.6
      ],
      action: [0, 0, 0, 0, 0, 0, 0],
      task: 'Synthetic DROID-style robot arm motion'
    });
  }
  return out;
}

module.exports = {
  findEpisodes,
  readTrajectory,
  syntheticSteps
};

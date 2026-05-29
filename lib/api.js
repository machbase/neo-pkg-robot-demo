'use strict';

const { Client } = require('machcli');
const path = require('path');
const process = require('process');

function rootDir() {
  const argv = process.argv || [];
  const raw = String(argv[1] || '.');
  const script = raw.charAt(0) === '/' ? raw : path.join(process.cwd(), raw);
  const cgi = script.indexOf('/cgi-bin/');
  if (cgi >= 0) return script.slice(0, cgi);
  const app = script.indexOf('/app/');
  if (app >= 0) return script.slice(0, app);
  const scripts = script.indexOf('/scripts/');
  if (scripts >= 0) return script.slice(0, scripts);
  return path.dirname(script);
}

const ROOT = rootDir();
const { dbConfig, intArg } = require(path.join(ROOT, 'lib', 'env.js'));
const { TABLES } = require(path.join(ROOT, 'lib', 'schema.js'));

const FALLBACK_START = Date.parse('2026-01-01T00:00:00Z');
const FALLBACK_DURATION_MS = 10 * 60 * 1000;
const DEFAULT_SIGNALS = ['ee_speed', 'gripper', 'motion_energy', 'anomaly_score', 'cycle_phase'];
const SIGNAL_PATHS = {
  ee_speed: '$.derived.ee_speed',
  ee_acceleration: '$.derived.ee_acceleration',
  gripper: '$.robot.gripper',
  motion_energy: '$.derived.motion_energy',
  anomaly_score: '$.derived.anomaly_score',
  cycle_phase: '$.derived.cycle_phase',
  path_length: '$.derived.path_length'
};

function get(row, name) {
  if (!row) return undefined;
  return row[name] != null ? row[name] : row[name.toUpperCase()];
}

function toIso(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();
  if (value == null) return null;
  const text = String(value);
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : text;
}

function elapsedSince(start) {
  return Date.now() - start;
}

function jsonValue(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch (_) {
    return fallback;
  }
}

function splitList(text, fallback) {
  if (text == null || text === '') return fallback.slice();
  return String(text).split(',').map(s => s.trim()).filter(Boolean);
}

function withDb(args, fn) {
  const db = new Client(dbConfig(args || {}));
  let conn;
  try {
    conn = db.connect();
    return fn(conn);
  } finally {
    try { conn && conn.close(); } catch (_) {}
    try { db && db.close(); } catch (_) {}
  }
}

function queryAll(conn, sql) {
  const params = [];
  for (let i = 2; i < arguments.length; i++) params.push(arguments[i]);
  const rows = params.length > 0 ? conn.query(sql, ...params) : conn.query(sql);
  const out = [];
  try {
    for (const row of rows) out.push(row);
  } finally {
    rows && rows.close && rows.close();
  }
  return out;
}

function numberAt(obj, pathText, fallback) {
  const parts = pathText.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length; i++) {
    if (cur == null) return fallback;
    cur = cur[parts[i]];
  }
  const n = Number(cur);
  return Number.isFinite(n) ? n : fallback;
}

function fallbackJoints(ms) {
  const t = ((Number.isFinite(ms) ? ms : FALLBACK_START) - FALLBACK_START) / 1000;
  return [
    Math.sin(t * 0.45) * 0.8,
    Math.sin(t * 0.63 + 0.7) * 0.7,
    Math.cos(t * 0.38) * 0.72,
    Math.sin(t * 0.51 + 1.1) * 0.88,
    Math.cos(t * 0.72) * 0.5,
    Math.sin(t * 0.42 + 2.4) * 0.64,
    Math.cos(t * 0.9) * 0.35
  ];
}

function fallbackManifest() {
  return {
    ok: true,
    source: 'synthetic-fallback',
    table: TABLES.timeline,
    dataset: 'droid',
    sequence: 'synthetic-robot-json-10m',
    minTime: new Date(FALLBACK_START).toISOString(),
    maxTime: new Date(FALLBACK_START + FALLBACK_DURATION_MS).toISOString(),
    durationMs: FALLBACK_DURATION_MS,
    frameCount: 6000,
    joints: 7,
    signals: DEFAULT_SIGNALS.slice(),
    eventTypes: ['episode_start', 'phase_change', 'grip_open', 'grip_close', 'high_speed', 'high_jerk', 'near_joint_limit', 'idle_dwell'],
    eventCount: 0,
    signalRowCount: 6000,
    jsonRowCount: 6000
  };
}

function fallbackFrame(ms) {
  const t = Number.isFinite(ms) ? ms : FALLBACK_START;
  const elapsed = (t - FALLBACK_START) / 1000;
  const phase = Math.floor(((t - FALLBACK_START) / 100) % 120 / 30);
  const anomalyScore = Math.min(1, Math.abs(Math.sin(elapsed * 0.45)) * 0.7);
  return {
    ok: true,
    source: 'synthetic-fallback',
    frame: {
      time: new Date(t).toISOString(),
      frameId: Math.max(0, Math.round((t - FALLBACK_START) / 100)),
      episodeIndex: 0,
      sampleIndex: Math.max(0, Math.round((t - FALLBACK_START) / 100)),
      joints: fallbackJoints(t),
      gripper: 0.5 + Math.sin(elapsed * 0.8) * 0.5,
      endEffector: {
        x: 2.8 + Math.sin(elapsed * 0.31) * 1.2,
        y: Math.cos(elapsed * 0.27) * 1.4,
        z: 2.2 + Math.sin(elapsed * 0.22 + 0.4) * 0.7,
        roll: 0,
        pitch: Math.sin(elapsed * 0.3) * 0.4,
        yaw: Math.cos(elapsed * 0.24) * 0.6
      },
      action: [0, 0, 0, 0, 0, 0, 0],
      task: 'Synthetic DROID-style robot arm motion',
      episodeId: 'synthetic'
    },
    signals: {
      gripper: 0.5 + Math.sin(elapsed * 0.8) * 0.5,
      ee_speed: 0.4 + Math.abs(Math.cos(elapsed * 0.31)) * 0.8,
      cycle_phase: phase,
      anomaly_score: anomalyScore,
      motion_energy: 0.4 + Math.abs(Math.sin(elapsed * 0.2)) * 1.6
    },
    phase: ['approach', 'grasp', 'move', 'release'][phase],
    anomalyScore: anomalyScore,
    motionEnergy: 0.4 + Math.abs(Math.sin(elapsed * 0.2)) * 1.6,
    activeEvents: []
  };
}

function frameFromRow(row) {
  const payload = jsonValue(get(row, 'value'), {});
  const robot = payload.robot || {};
  const frame = payload.frame || {};
  const ee = robot.end_effector || {};
  return {
    time: toIso(get(row, 'time')),
    frameId: Number(frame.id || 0),
    episodeIndex: Number(frame.episode_index || 0),
    sampleIndex: Number(frame.sample_index || 0),
    joints: robot.joints || [0, 0, 0, 0, 0, 0, 0],
    gripper: Number(robot.gripper || 0),
    endEffector: {
      x: Number(ee.x || 0),
      y: Number(ee.y || 0),
      z: Number(ee.z || 0),
      roll: Number(ee.roll || 0),
      pitch: Number(ee.pitch || 0),
      yaw: Number(ee.yaw || 0)
    },
    action: payload.action || [0, 0, 0, 0, 0, 0, 0],
    task: String(payload.task || 'DROID manipulation episode'),
    episodeId: String(get(row, 'episode_id') || '')
  };
}

function eventFromRow(row) {
  const payload = jsonValue(get(row, 'value'), {});
  const frame = payload.frame || {};
  const event = payload.event || {};
  return {
    time: toIso(get(row, 'time')),
    frameId: Number(frame.id || 0),
    type: event.type || 'event',
    severity: event.severity || 'info',
    label: event.label || event.phase || event.type || 'event',
    value: event.value,
    threshold: event.threshold
  };
}

function manifest(args) {
  const started = Date.now();
  try {
    return withDb(args, (conn) => {
      const rows = queryAll(
        conn,
        `SELECT dataset, sequence, MIN(time) min_time, MAX(time) max_time, COUNT(*) frame_count FROM ${TABLES.timeline} WHERE value->'$.kind' = 'state' GROUP BY dataset, sequence ORDER BY dataset, sequence LIMIT 20`
      );
      if (!rows || rows.length === 0) return fallbackManifest();
      const first = rows[0];
      const firstDataset = get(first, 'dataset');
      const firstSequence = get(first, 'sequence');
      const min = Date.parse(toIso(get(first, 'min_time')));
      const max = Date.parse(toIso(get(first, 'max_time')));
      const countRows = queryAll(
        conn,
        `SELECT COUNT(*) json_row_count FROM ${TABLES.timeline} WHERE dataset = ? AND sequence = ?`,
        firstDataset,
        firstSequence
      );
      const eventRows = queryAll(
        conn,
        `SELECT value->'$.event.type' event_type, COUNT(*) row_count FROM ${TABLES.timeline} WHERE dataset = ? AND sequence = ? AND value->'$.kind' = 'event' GROUP BY event_type ORDER BY event_type LIMIT 64`,
        firstDataset,
        firstSequence
      );
      const jsonRowCount = Number(get(countRows[0], 'json_row_count') || 0);
      return {
        ok: true,
        source: 'machbase',
        table: TABLES.timeline,
        storage: 'json-summarized-rollup',
        datasets: rows.map(row => ({
          dataset: get(row, 'dataset'),
          sequence: get(row, 'sequence'),
          minTime: toIso(get(row, 'min_time')),
          maxTime: toIso(get(row, 'max_time')),
          frameCount: Number(get(row, 'frame_count') || 0)
        })),
        dataset: firstDataset,
        sequence: firstSequence,
        minTime: toIso(get(first, 'min_time')),
        maxTime: toIso(get(first, 'max_time')),
        durationMs: Number.isFinite(min) && Number.isFinite(max) ? Math.max(0, max - min) : 0,
        frameCount: Number(get(first, 'frame_count') || 0),
        joints: 7,
        signals: DEFAULT_SIGNALS.slice(),
        signalRowCount: jsonRowCount,
        jsonRowCount: jsonRowCount,
        eventTypes: eventRows.map(row => get(row, 'event_type')),
        eventCount: eventRows.reduce((sum, row) => sum + Number(get(row, 'row_count') || 0), 0),
        queryMs: elapsedSince(started)
      };
    });
  } catch (err) {
    const fb = fallbackManifest();
    fb.warning = err.message;
    fb.queryMs = elapsedSince(started);
    return fb;
  }
}

function frame(args, query) {
  const started = Date.now();
  const ms = parseInt(query.time || '', 10);
  const fromMs = parseInt(query.from || '', 10);
  const t = Number.isFinite(ms) ? new Date(ms) : new Date(FALLBACK_START);
  const from = Number.isFinite(fromMs) ? new Date(fromMs) : new Date(FALLBACK_START);
  const dataset = query.dataset || args.dataset || 'droid';
  const sequence = query.sequence || args.sequence || 'droid-robot-json-10m';
  try {
    return withDb(args, (conn) => {
      const rows = queryAll(
        conn,
        `SELECT time, value, dataset, sequence, episode_id FROM ${TABLES.timeline} WHERE dataset = ? AND sequence = ? AND value->'$.kind' = 'state' AND time BETWEEN ? AND ? ORDER BY time DESC LIMIT 1`,
        dataset,
        sequence,
        from,
        t
      );
      if (!rows || rows.length === 0) return fallbackFrame(ms);
      const item = frameFromRow(rows[0]);
      const payload = jsonValue(get(rows[0], 'value'), {});
      const derived = payload.derived || {};
      const eventRows = queryAll(
        conn,
        `SELECT time, value FROM ${TABLES.timeline} WHERE dataset = ? AND sequence = ? AND value->'$.kind' = 'event' AND time BETWEEN ? AND ? ORDER BY time DESC LIMIT 8`,
        dataset,
        sequence,
        new Date(t.getTime() - 350),
        new Date(t.getTime() + 350)
      );
      const phaseNames = ['approach', 'grasp', 'move', 'release'];
      const phase = Number(derived.cycle_phase || 0);
      return {
        ok: true,
        source: 'machbase',
        table: TABLES.timeline,
        frame: item,
        signals: {
          gripper: item.gripper,
          ee_speed: Number(derived.ee_speed || 0),
          anomaly_score: Number(derived.anomaly_score || 0),
          motion_energy: Number(derived.motion_energy || 0),
          cycle_phase: phase
        },
        phase: phaseNames[Math.max(0, Math.min(3, Math.round(phase)))],
        anomalyScore: Number(derived.anomaly_score || 0),
        motionEnergy: Number(derived.motion_energy || 0),
        activeEvents: eventRows.map(eventFromRow),
        queryMs: elapsedSince(started)
      };
    });
  } catch (err) {
    const fb = fallbackFrame(ms);
    fb.warning = err.message;
    fb.queryMs = elapsedSince(started);
    return fb;
  }
}

function fallbackWindow(fromMs, toMs, limit) {
  fromMs = Number.isFinite(fromMs) ? fromMs : FALLBACK_START;
  toMs = Number.isFinite(toMs) ? toMs : fromMs + 30000;
  limit = Math.max(2, limit || 240);
  const frames = [];
  const span = Math.max(1, toMs - fromMs);
  for (let i = 0; i < limit; i++) {
    const t = fromMs + span * (i / Math.max(1, limit - 1));
    frames.push(fallbackFrame(t).frame);
  }
  return { ok: true, source: 'synthetic-fallback', frames: frames, queryMs: 0 };
}

function windowFrames(args, query) {
  const started = Date.now();
  const fromMs = parseInt(query.from || '', 10);
  const toMs = parseInt(query.to || '', 10);
  const limit = Math.max(2, Math.min(2000, intArg(query.limit, 300)));
  const from = Number.isFinite(fromMs) ? new Date(fromMs) : new Date(FALLBACK_START);
  const to = Number.isFinite(toMs) ? new Date(toMs) : new Date(FALLBACK_START + 30000);
  const dataset = query.dataset || args.dataset || 'droid';
  const sequence = query.sequence || args.sequence || 'droid-robot-json-10m';
  try {
    return withDb(args, (conn) => {
      const rows = queryAll(
        conn,
        `SELECT time, value, dataset, sequence, episode_id FROM ${TABLES.timeline} WHERE dataset = ? AND sequence = ? AND value->'$.kind' = 'state' AND time BETWEEN ? AND ? ORDER BY time LIMIT ${limit}`,
        dataset,
        sequence,
        from,
        to
      );
      if (!rows || rows.length === 0) return fallbackWindow(fromMs, toMs, limit);
      return {
        ok: true,
        source: 'machbase',
        table: TABLES.timeline,
        frames: rows.map(frameFromRow),
        queryMs: elapsedSince(started)
      };
    });
  } catch (err) {
    const fb = fallbackWindow(fromMs, toMs, limit);
    fb.warning = err.message;
    fb.queryMs = elapsedSince(started);
    return fb;
  }
}

function fallbackSignals(fromMs, toMs, limit, names) {
  const frames = fallbackWindow(fromMs, toMs, limit).frames;
  const out = [];
  for (let i = 0; i < frames.length; i++) {
    const t = Date.parse(frames[i].time);
    const ff = fallbackFrame(t);
    for (let s = 0; s < names.length; s++) {
      const name = names[s];
      out.push({
        time: frames[i].time,
        signal: name,
        jointIndex: -1,
        value: name === 'anomaly_score' ? ff.anomalyScore : name === 'motion_energy' ? ff.motionEnergy : name === 'cycle_phase' ? ff.signals.cycle_phase : name === 'gripper' ? ff.signals.gripper : ff.signals.ee_speed
      });
    }
  }
  return { ok: true, source: 'synthetic-fallback', signals: out, queryMs: 0 };
}

function signalSeries(conn, dataset, sequence, from, to, intervalSec, limit, name, pathText) {
  const rows = queryAll(
    conn,
    `SELECT rollup('sec', ${intervalSec}, time) sample_time, SUM(value->'${pathText}') sum_value, COUNT(value->'${pathText}') count_value FROM ${TABLES.timeline} WHERE dataset = ? AND sequence = ? AND time BETWEEN ? AND ? GROUP BY sample_time ORDER BY sample_time LIMIT ${limit}`,
    dataset,
    sequence,
    from,
    to
  );
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const count = Number(get(rows[i], 'count_value') || 0);
    if (count <= 0) continue;
    out.push({
      time: toIso(get(rows[i], 'sample_time')),
      signal: name,
      jointIndex: -1,
      value: Number(get(rows[i], 'sum_value') || 0) / count
    });
  }
  return out;
}

function signals(args, query) {
  const started = Date.now();
  const fromMs = parseInt(query.from || '', 10);
  const toMs = parseInt(query.to || '', 10);
  const limit = Math.max(2, Math.min(5000, intArg(query.limit, 900)));
  const names = splitList(query.signals, DEFAULT_SIGNALS).filter(name => SIGNAL_PATHS[name]);
  const effectiveNames = names.length ? names : DEFAULT_SIGNALS.slice();
  const from = Number.isFinite(fromMs) ? new Date(fromMs) : new Date(FALLBACK_START);
  const to = Number.isFinite(toMs) ? new Date(toMs) : new Date(FALLBACK_START + 30000);
  const dataset = query.dataset || args.dataset || 'droid';
  const sequence = query.sequence || args.sequence || 'droid-robot-json-10m';
  try {
    return withDb(args, (conn) => {
      const spanSec = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 1000));
      const perSignalLimit = Math.max(2, Math.floor(limit / Math.max(1, effectiveNames.length)));
      const intervalSec = Math.max(1, Math.ceil(spanSec / perSignalLimit));
      let out = [];
      for (let i = 0; i < effectiveNames.length; i++) {
        const name = effectiveNames[i];
        out = out.concat(signalSeries(conn, dataset, sequence, from, to, intervalSec, perSignalLimit, name, SIGNAL_PATHS[name]));
      }
      if (!out.length) return fallbackSignals(fromMs, toMs, limit, effectiveNames);
      return {
        ok: true,
        source: 'machbase',
        table: TABLES.timeline,
        rollup: {
          intervalSec: intervalSec,
          value: 'JSON path'
        },
        signals: out,
        queryMs: elapsedSince(started)
      };
    });
  } catch (err) {
    const fb = fallbackSignals(fromMs, toMs, limit, effectiveNames);
    fb.warning = err.message;
    fb.queryMs = elapsedSince(started);
    return fb;
  }
}

function fallbackEvents(fromMs, toMs) {
  fromMs = Number.isFinite(fromMs) ? fromMs : FALLBACK_START;
  toMs = Number.isFinite(toMs) ? toMs : fromMs + 30000;
  const out = [];
  for (let t = fromMs; t <= toMs; t += 12000) {
    out.push({ time: new Date(t).toISOString(), type: 'phase_change', severity: 'info', label: 'phase', frameId: Math.round((t - FALLBACK_START) / 100) });
  }
  return { ok: true, source: 'synthetic-fallback', events: out, queryMs: 0 };
}

function events(args, query) {
  const started = Date.now();
  const fromMs = parseInt(query.from || '', 10);
  const toMs = parseInt(query.to || '', 10);
  const limit = Math.max(2, Math.min(1000, intArg(query.limit, 200)));
  const from = Number.isFinite(fromMs) ? new Date(fromMs) : new Date(FALLBACK_START);
  const to = Number.isFinite(toMs) ? new Date(toMs) : new Date(FALLBACK_START + 30000);
  const dataset = query.dataset || args.dataset || 'droid';
  const sequence = query.sequence || args.sequence || 'droid-robot-json-10m';
  try {
    return withDb(args, (conn) => {
      const rows = queryAll(
        conn,
        `SELECT time, value FROM ${TABLES.timeline} WHERE dataset = ? AND sequence = ? AND value->'$.kind' = 'event' AND time BETWEEN ? AND ? ORDER BY time LIMIT ${limit}`,
        dataset,
        sequence,
        from,
        to
      );
      if (!rows || rows.length === 0) return fallbackEvents(fromMs, toMs);
      return {
        ok: true,
        source: 'machbase',
        table: TABLES.timeline,
        events: rows.map(eventFromRow),
        queryMs: elapsedSince(started)
      };
    });
  } catch (err) {
    const fb = fallbackEvents(fromMs, toMs);
    fb.warning = err.message;
    fb.queryMs = elapsedSince(started);
    return fb;
  }
}

module.exports = {
  events,
  frame,
  manifest,
  signals,
  windowFrames
};

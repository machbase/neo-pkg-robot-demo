'use strict';

const process = require('process');
const path = require('path');
const { Client } = require('machcli');
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const { boolArg, dbConfig, intArg, parseArgs } = require(path.join(ROOT, 'lib', 'env.js'));
const { TABLES, ensureSchema } = require(path.join(ROOT, 'lib', 'schema.js'));
const { findEpisodes, readTrajectory, syntheticSteps } = require(path.join(ROOT, 'lib', 'droid.js'));

function println() {
  if (console.println) console.println.apply(console, arguments);
  else console.log.apply(console, arguments);
}

function closeQuietly(obj) {
  try { obj && obj.close && obj.close(); } catch (_) {}
}

function clip(value, length) {
  const text = String(value == null ? '' : value);
  return text.length > length ? text.slice(0, length) : text;
}

function episodeName(value, fallback) {
  const raw = String(value || fallback || 'episode').replace(/\\/g, '/');
  const base = raw.indexOf('/') >= 0 ? raw.slice(raw.lastIndexOf('/') + 1) : raw;
  return clip(base.replace(/[^A-Za-z0-9_.-]+/g, '_'), 72);
}

function phaseCode(sampleIndex) {
  const n = sampleIndex % 120;
  if (n < 30) return 0;
  if (n < 60) return 1;
  if (n < 100) return 2;
  return 3;
}

function phaseName(code) {
  return code === 0 ? 'approach' : code === 1 ? 'grasp' : code === 2 ? 'move' : 'release';
}

function maxAbs(values) {
  let max = 0;
  for (let i = 0; i < values.length; i++) max = Math.max(max, Math.abs(values[i] || 0));
  return max;
}

function distance(a, b) {
  if (!a || !b) return 0;
  const dx = (a[0] || 0) - (b[0] || 0);
  const dy = (a[1] || 0) - (b[1] || 0);
  const dz = (a[2] || 0) - (b[2] || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function rowName(state, kind, suffix) {
  return `${state.dataset}.${state.sequence}.${state.episodeId}.${kind}${suffix ? '.' + suffix : ''}`;
}

function appendJson(appender, name, time, value, dataset, sequence, episodeId, source) {
  appender.append(
    name,
    time,
    JSON.stringify(value),
    dataset,
    sequence,
    episodeId,
    source
  );
}

function appendEvent(appender, state, type, severity, label, details) {
  const event = details || {};
  const payload = {
    kind: 'event',
    frame: {
      id: state.frameId,
      episode_index: state.episodeIndex,
      sample_index: state.step.sampleIndex
    },
    event: {
      type: type,
      severity: severity,
      label: label,
      value: event.value,
      threshold: event.threshold,
      phase: event.phase,
      phase_code: event.phase_code
    },
    task: clip(state.step.task, 256),
    source: state.source
  };
  appendJson(
    appender,
    rowName(state, 'event', type),
    state.step.time,
    payload,
    state.dataset,
    state.sequence,
    state.episodeId,
    state.source
  );
  state.eventCount++;
}

function appendFrame(appender, state) {
  const step = state.step;
  const joints = step.joints || [0, 0, 0, 0, 0, 0, 0];
  const pose = step.cartesian || [0, 0, 0, 0, 0, 0];
  const action = step.action || [0, 0, 0, 0, 0, 0, 0];
  const prevJoints = state.prevStep ? state.prevStep.joints || [] : [];
  const prevPose = state.prevStep ? state.prevStep.cartesian || [] : [];
  const speed = state.prevStep ? distance(pose, prevPose) / Math.max(0.001, state.dtSec) : 0;
  const velocity = [];
  const acceleration = [];
  const jerk = [];
  for (let i = 0; i < 7; i++) {
    const v = state.prevStep ? ((joints[i] || 0) - (prevJoints[i] || 0)) / state.dtSec : 0;
    const a = state.prevVelocity ? (v - (state.prevVelocity[i] || 0)) / state.dtSec : 0;
    const j = state.prevAcceleration ? (a - (state.prevAcceleration[i] || 0)) / state.dtSec : 0;
    velocity.push(v);
    acceleration.push(a);
    jerk.push(j);
  }

  const gripperVelocity = state.prevStep ? ((step.gripper || 0) - (state.prevStep.gripper || 0)) / state.dtSec : 0;
  const eeAcceleration = state.prevSpeed == null ? 0 : (speed - state.prevSpeed) / state.dtSec;
  const motionEnergy = velocity.reduce((sum, v) => sum + v * v, 0) + speed * speed * 0.2 + Math.abs(gripperVelocity) * 0.1;
  const maxJerk = maxAbs(jerk);
  const maxJoint = maxAbs(joints);
  const anomalyScore = Math.min(1, maxJerk / 180 + Math.max(0, speed - 0.75) / 2 + Math.max(0, maxJoint - 0.82) * 2);
  const phase = phaseCode(step.sampleIndex);
  const pathLength = (state.pathLength || 0) + (state.prevStep ? distance(pose, prevPose) : 0);

  const payload = {
    kind: 'state',
    frame: {
      id: state.frameId,
      episode_index: state.episodeIndex,
      sample_index: step.sampleIndex
    },
    robot: {
      joints: joints,
      joint_velocity: velocity,
      joint_acceleration: acceleration,
      joint_jerk: jerk,
      gripper: step.gripper,
      gripper_velocity: gripperVelocity,
      end_effector: {
        x: pose[0],
        y: pose[1],
        z: pose[2],
        roll: pose[3],
        pitch: pose[4],
        yaw: pose[5]
      }
    },
    action: action,
    derived: {
      ee_speed: speed,
      ee_acceleration: eeAcceleration,
      motion_energy: motionEnergy,
      anomaly_score: anomalyScore,
      cycle_phase: phase,
      path_length: pathLength
    },
    task: clip(step.task, 256),
    source: state.source
  };

  appendJson(
    appender,
    rowName(state, 'state', ''),
    step.time,
    payload,
    state.dataset,
    state.sequence,
    state.episodeId,
    state.source
  );

  if (step.sampleIndex === 0) {
    appendEvent(appender, state, 'episode_start', 'info', 'episode start', {
      phase: phaseName(phase),
      phase_code: phase
    });
  }
  if (step.sampleIndex % 30 === 0) {
    appendEvent(appender, state, 'phase_change', 'info', phaseName(phase), {
      phase: phaseName(phase),
      phase_code: phase
    });
  }
  if (Math.abs(gripperVelocity) > 1.2 && step.sampleIndex % 5 === 0) {
    appendEvent(appender, state, gripperVelocity > 0 ? 'grip_open' : 'grip_close', 'info', gripperVelocity > 0 ? 'grip open' : 'grip close', {
      value: gripperVelocity,
      threshold: 1.2
    });
  }
  if (speed > 1.05 && step.sampleIndex % 10 === 0) {
    appendEvent(appender, state, 'high_speed', 'warning', 'fast move', {
      value: speed,
      threshold: 1.05
    });
  }
  if (maxJerk > 130 && step.sampleIndex % 10 === 0) {
    appendEvent(appender, state, 'high_jerk', 'critical', 'high jerk', {
      value: maxJerk,
      threshold: 130
    });
  }
  if (maxJoint > 0.84 && step.sampleIndex % 10 === 0) {
    appendEvent(appender, state, 'near_joint_limit', 'warning', 'joint limit', {
      value: maxJoint,
      threshold: 0.84
    });
  }
  if (speed < 0.02 && step.sampleIndex > 0 && step.sampleIndex % 20 === 0) {
    appendEvent(appender, state, 'idle_dwell', 'info', 'idle dwell', {
      value: speed,
      threshold: 0.02
    });
  }

  state.derived = {
    velocity: velocity,
    acceleration: acceleration,
    speed: speed,
    pathLength: pathLength
  };
}

function appendSteps(appender, steps, stateBase, frameId) {
  let prevVelocity = null;
  let prevAcceleration = null;
  let prevSpeed = null;
  let pathLength = 0;
  for (let i = 0; i < steps.length; i++) {
    const state = {
      dataset: stateBase.dataset,
      sequence: stateBase.sequence,
      episodeId: stateBase.episodeId,
      episodeIndex: stateBase.episodeIndex,
      frameId: frameId.value++,
      step: steps[i],
      prevStep: i > 0 ? steps[i - 1] : null,
      dtSec: stateBase.sampleMs / 1000,
      prevVelocity: prevVelocity,
      prevAcceleration: prevAcceleration,
      prevSpeed: prevSpeed,
      pathLength: pathLength,
      source: stateBase.source,
      eventCount: stateBase.eventCount
    };
    appendFrame(appender, state);
    prevVelocity = state.derived.velocity;
    prevAcceleration = state.derived.acceleration;
    prevSpeed = state.derived.speed;
    pathLength = state.derived.pathLength;
    stateBase.eventCount = state.eventCount;
    stateBase.frameCount++;
    if (stateBase.frameCount % 200 === 0) {
      appender.flush();
      println('ingested frames', stateBase.frameCount, 'events', stateBase.eventCount);
    }
  }
}

function main() {
  const args = parseArgs(process.argv);
  const dataRoot = args.dataRoot || args['data-root'] || 'data/raw/droid';
  const dataset = args.dataset || 'droid';
  const sequence = args.sequence || 'droid-robot-json-10m';
  const minDurationSec = intArg(args.minDurationSec || args['min-duration-sec'], 600);
  const sampleMs = intArg(args.sampleMs || args['sample-ms'], 100);
  const episodeLimit = intArg(args.episodeLimit || args['episode-limit'], 0);
  const synthetic = boolArg(args.synthetic, false);
  const baseTimeMs = Date.parse(args.baseTime || args['base-time'] || '2026-01-01T00:00:00Z');

  const db = new Client(dbConfig(args));
  let conn;
  let appender;
  const frameId = { value: 0 };
  let skippedH5 = 0;
  let durationMs = 0;
  let episodeCount = 0;
  const counters = {
    frameCount: 0,
    eventCount: 0
  };

  try {
    conn = db.connect();
    ensureSchema(conn);
    appender = conn.append(TABLES.timeline);

    if (synthetic) {
      const steps = syntheticSteps(Math.ceil((minDurationSec * 1000) / sampleMs), sampleMs, baseTimeMs);
      const stateBase = {
        dataset: dataset,
        sequence: sequence,
        episodeId: 'synthetic',
        episodeIndex: 0,
        sampleMs: sampleMs,
        source: 'synthetic',
        frameCount: counters.frameCount,
        eventCount: counters.eventCount
      };
      appendSteps(appender, steps, stateBase, frameId);
      counters.frameCount = stateBase.frameCount;
      counters.eventCount = stateBase.eventCount;
      episodeCount = 1;
      durationMs = minDurationSec * 1000;
    } else {
      const episodes = findEpisodes(dataRoot, episodeLimit);
      if (episodes.length === 0) {
        throw new Error(`No readable DROID episode directories found under ${dataRoot}. Use --synthetic true for a generated demo timeline.`);
      }

      let timelineBaseMs = baseTimeMs;
      for (let e = 0; e < episodes.length && durationMs < minDurationSec * 1000; e++) {
        const episode = episodes[e];
        if (!episode.trajectoryFile && episode.h5File) {
          skippedH5++;
          continue;
        }
        const episodeId = episodeName(episode.metadata.episode_id || episode.metadata.file_path || episode.id, `episode_${e}`);
        const steps = readTrajectory(episode, { sampleMs: sampleMs, baseTimeMs: timelineBaseMs });
        if (!steps.length) continue;
        for (let i = 0; i < steps.length; i++) steps[i].time = new Date(timelineBaseMs + i * sampleMs);
        const stateBase = {
          dataset: dataset,
          sequence: sequence,
          episodeId: episodeId,
          episodeIndex: episodeCount,
          sampleMs: sampleMs,
          source: 'droid',
          frameCount: counters.frameCount,
          eventCount: counters.eventCount
        };
        appendSteps(appender, steps, stateBase, frameId);
        counters.frameCount = stateBase.frameCount;
        counters.eventCount = stateBase.eventCount;
        episodeCount++;
        durationMs += Math.max(sampleMs, steps.length * sampleMs);
        timelineBaseMs += Math.max(sampleMs, steps.length * sampleMs);
      }
    }

    appender.flush();

    if (!synthetic && counters.frameCount === 0 && skippedH5 > 0) {
      throw new Error(`Found ${skippedH5} raw DROID HDF5 episode(s), but no normalized trajectory.json/ndjson/csv files.`);
    }

    println(JSON.stringify({
      ok: true,
      table: TABLES.timeline,
      dataset: dataset,
      sequence: sequence,
      frames: counters.frameCount,
      events: counters.eventCount,
      episodes: episodeCount,
      durationMs: durationMs,
      skippedH5: skippedH5
    }, null, 2));
  } finally {
    closeQuietly(appender);
    closeQuietly(conn);
    closeQuietly(db);
  }
}

main();

'use strict';

const TABLES = {
  timeline: 'PHY_ROBOT_TIMELINE'
};

const ROLLUPS = [
  { name: '_PHY_ROBOT_TL_SPEED_SEC', path: '$.derived.ee_speed' },
  { name: '_PHY_ROBOT_TL_ACCEL_SEC', path: '$.derived.ee_acceleration' },
  { name: '_PHY_ROBOT_TL_ENERGY_SEC', path: '$.derived.motion_energy' },
  { name: '_PHY_ROBOT_TL_ANOMALY_SEC', path: '$.derived.anomaly_score' },
  { name: '_PHY_ROBOT_TL_PATH_SEC', path: '$.derived.path_length' },
  { name: '_PHY_ROBOT_TL_GRIP_SEC', path: '$.robot.gripper' },
  { name: '_PHY_ROBOT_TL_PHASE_SEC', path: '$.derived.cycle_phase' }
];

const INDEXES = [
  { name: 'IDX_PHY_ROBOT_TL_KIND', path: '$.kind' },
  { name: 'IDX_PHY_ROBOT_TL_EVENT_TYPE', path: '$.event.type' },
  { name: 'IDX_PHY_ROBOT_TL_EVENT_SEV', path: '$.event.severity' },
  { name: 'IDX_PHY_ROBOT_TL_FRAME_ID', path: '$.frame.id' }
];

const DDL = [
  `CREATE TAG TABLE ${TABLES.timeline} (
    name varchar(160) primary key,
    time datetime basetime,
    value json summarized
  )
  METADATA (
    dataset varchar(32),
    sequence varchar(64),
    episode_id varchar(96),
    source varchar(32)
  )
  TAG_PARTITION_COUNT=1`
];

function tableExists(conn, name) {
  try {
    const rows = conn.query('SELECT NAME FROM M$SYS_TABLES WHERE NAME = ?', String(name).toUpperCase());
    try {
      for (const row of rows) return !!(row && (row.NAME || row.name));
    } finally {
      rows && rows.close && rows.close();
    }
  } catch (_) {}
  return false;
}

function isDuplicateError(err) {
  const msg = String((err && err.message) || err || '').toLowerCase();
  return msg.indexOf('already') >= 0 || msg.indexOf('duplicate') >= 0 || msg.indexOf('exist') >= 0;
}

function createRollups(conn) {
  const created = [];
  for (let i = 0; i < ROLLUPS.length; i++) {
    const spec = ROLLUPS[i];
    if (tableExists(conn, spec.name)) continue;
    const sql = `CREATE ROLLUP ${spec.name} ON ${TABLES.timeline}(value->'${spec.path}') INTERVAL 1 SEC`;
    try {
      conn.exec(sql);
      created.push(spec.name);
    } catch (err) {
      if (!isDuplicateError(err)) throw err;
    }
  }
  return created;
}

function createIndexes(conn) {
  const created = [];
  for (let i = 0; i < INDEXES.length; i++) {
    const spec = INDEXES[i];
    const sql = `CREATE INDEX ${spec.name} ON ${TABLES.timeline} (value->'${spec.path}')`;
    try {
      conn.exec(sql);
      created.push(spec.name);
    } catch (err) {
      if (!isDuplicateError(err)) throw err;
    }
  }
  return created;
}

function ensureSchema(conn) {
  const created = [];
  if (!tableExists(conn, TABLES.timeline)) {
    conn.exec(DDL[0]);
    created.push(TABLES.timeline);
  }
  const rollups = createRollups(conn);
  const indexes = createIndexes(conn);
  return {
    tables: created,
    rollups: rollups,
    indexes: indexes
  };
}

function allDdl() {
  const out = DDL.slice();
  for (let i = 0; i < ROLLUPS.length; i++) {
    out.push(`CREATE ROLLUP ${ROLLUPS[i].name} ON ${TABLES.timeline}(value->'${ROLLUPS[i].path}') INTERVAL 1 SEC`);
  }
  for (let i = 0; i < INDEXES.length; i++) {
    out.push(`CREATE INDEX ${INDEXES[i].name} ON ${TABLES.timeline} (value->'${INDEXES[i].path}')`);
  }
  return out;
}

module.exports = {
  DDL,
  INDEXES,
  ROLLUPS,
  TABLES,
  allDdl,
  ensureSchema
};

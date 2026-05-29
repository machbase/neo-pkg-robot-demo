'use strict';

const process = require('process');
const path = require('path');
const { Client } = require('machcli');
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const { dbConfig, parseArgs } = require(path.join(ROOT, 'lib', 'env.js'));
const { allDdl, ensureSchema } = require(path.join(ROOT, 'lib', 'schema.js'));

function println() {
  if (console.println) console.println.apply(console, arguments);
  else console.log.apply(console, arguments);
}

function main() {
  const args = parseArgs(process.argv);
  if (args.print) {
    const ddl = allDdl();
    for (let i = 0; i < ddl.length; i++) println(ddl[i] + ';');
    return;
  }

  const db = new Client(dbConfig(args));
  let conn;
  try {
    conn = db.connect();
    const created = ensureSchema(conn);
    println(JSON.stringify({ ok: true, created: created }, null, 2));
  } finally {
    try { conn && conn.close(); } catch (_) {}
    try { db && db.close(); } catch (_) {}
  }
}

main();

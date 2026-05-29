'use strict';

const fs = require('fs');
const path = require('path');
const process = require('process');
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const { parseArgs } = require(path.join(ROOT, 'lib', 'env.js'));

function println() {
  if (console.println) console.println.apply(console, arguments);
  else console.log.apply(console, arguments);
}

function mkdirp(dir) {
  if (!dir || dir === '.' || fs.existsSync(dir)) return;
  mkdirp(path.dirname(dir));
  try { fs.mkdirSync(dir); } catch (_) {}
}

function main() {
  const args = parseArgs(process.argv);
  const out = args.out || 'data/raw/droid';
  const dataset = args.dataset || 'droid_100';
  const target = path.resolve(out);
  mkdirp(target);

  const bucket = dataset === 'droid' ? 'gs://gresearch/robotics/droid' : 'gs://gresearch/robotics/droid_100';
  const note = [
    'DROID data is hosted in Google Cloud Storage and should be downloaded outside JSH.',
    '',
    'Run this command in a normal shell:',
    '',
    `  gsutil -m cp -r ${bucket} ${target}`,
    '',
    'The importer reads normalized episode files named trajectory.json, trajectory.ndjson, or trajectory.csv.',
    'If your DROID subset only has trajectory.h5, convert each episode to one of those formats before ingest.',
    '',
    'Expected normalized fields per step:',
    '  joint_position[7], gripper_position, cartesian_position[6], action[7], timestamp, language_instruction',
    '',
    JSON.stringify({ ok: true, dataset: dataset, bucket: bucket, out: target }, null, 2)
  ];
  for (let i = 0; i < note.length; i++) println(note[i]);
}

main();

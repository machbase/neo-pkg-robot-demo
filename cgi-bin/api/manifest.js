'use strict';

const path = require('path');
const process = require('process');
const root = process.argv[1].slice(0, process.argv[1].lastIndexOf('/cgi-bin/'));
const { manifest } = require(path.join(root, 'lib', 'api.js'));
const { parseQuery, reply } = require(path.join(root, 'cgi-bin', 'cgi-util.js'));

try {
  const query = parseQuery();
  reply(manifest(query));
} catch (err) {
  reply({ ok: false, reason: err.message });
}

'use strict';

const process = require('process');

function parseQuery() {
  let qs = '';
  try { qs = process.env.get('QUERY_STRING') || ''; } catch (_) {}
  const result = {};
  const parts = qs.split('&');
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    const eq = part.indexOf('=');
    const key = eq >= 0 ? part.slice(0, eq) : part;
    const value = eq >= 0 ? part.slice(eq + 1) : '';
    result[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
  }
  return result;
}

function reply(data) {
  process.stdout.write('Content-Type: application/json\r\n');
  process.stdout.write('\r\n');
  process.stdout.write(JSON.stringify(data));
}

module.exports = {
  parseQuery,
  reply
};

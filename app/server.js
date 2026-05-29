'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const process = require('process');
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const { events, frame, manifest, signals, windowFrames } = require(path.join(ROOT, 'lib', 'api.js'));
const { intArg, parseArgs } = require(path.join(ROOT, 'lib', 'env.js'));

function println() {
  if (console.println) console.println.apply(console, arguments);
  else console.log.apply(console, arguments);
}

function sendIndex(ctx, file) {
  ctx.setHeader('content-type', 'text/html; charset=utf-8');
  ctx.text(http.status.OK, fs.readFileSync(file, 'utf8'));
}

function queryFromCtx(ctx, names) {
  const out = {};
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    let value = '';
    try {
      value = ctx.query ? ctx.query(name) : '';
    } catch (_) {}
    if ((value == null || value === '') && ctx.request && ctx.request.query && ctx.request.query[name] != null) {
      value = ctx.request.query[name];
    }
    if (value != null && value !== '') out[name] = value;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  const host = args.host || '127.0.0.1';
  const port = intArg(args.port, 56803);
  const publicDir = path.join(ROOT, 'public');
  const indexFile = path.join(publicDir, 'index.html');
  const server = new http.Server({
    network: 'tcp',
    address: `${host}:${port}`,
    env: process.env
  });

  server.static('/vendor', path.join(publicDir, 'vendor'));
  server.static('/assets', path.join(publicDir, 'assets'));
  server.staticFile('/app.js', path.join(publicDir, 'app.js'));
  server.staticFile('/styles.css', path.join(publicDir, 'styles.css'));
  server.staticFile('/index.html', indexFile);

  server.get('/', (ctx) => sendIndex(ctx, indexFile));
  server.get('/api/health', (ctx) => ctx.json(http.status.OK, { ok: true, app: 'phy-ai-robot-demo' }));
  server.get('/api/manifest', (ctx) => ctx.json(http.status.OK, manifest(args)));
  server.get('/api/frame', (ctx) => ctx.json(http.status.OK, frame(args, queryFromCtx(ctx, ['from', 'time', 'dataset', 'sequence']))));
  server.get('/api/window', (ctx) => ctx.json(http.status.OK, windowFrames(args, queryFromCtx(ctx, ['from', 'to', 'limit', 'dataset', 'sequence']))));
  server.get('/api/signals', (ctx) => ctx.json(http.status.OK, signals(args, queryFromCtx(ctx, ['from', 'to', 'limit', 'signals', 'dataset', 'sequence']))));
  server.get('/api/events', (ctx) => ctx.json(http.status.OK, events(args, queryFromCtx(ctx, ['from', 'to', 'limit', 'dataset', 'sequence']))));

  server.serve((result) => {
    println('phy-ai-robot-demo server started', result.network, result.address);
  });
}

main();

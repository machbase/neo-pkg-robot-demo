'use strict';

function envGet(name, fallback) {
  try {
    if (typeof process !== 'undefined' && process.env) {
      if (typeof process.env.get === 'function') {
        const value = process.env.get(name);
        return value == null || value === '' ? fallback : value;
      }
      if (process.env[name] != null && process.env[name] !== '') return process.env[name];
    }
  } catch (_) {}
  return fallback;
}

function parseArgs(argv) {
  const args = {};
  const rest = [];
  const list = argv || [];
  for (let i = 2; i < list.length; i++) {
    const item = String(list[i]);
    if (item.indexOf('--') === 0) {
      const eq = item.indexOf('=');
      if (eq > 0) {
        args[item.slice(2, eq)] = item.slice(eq + 1);
      } else {
        const key = item.slice(2);
        const next = list[i + 1];
        if (next != null && String(next).indexOf('--') !== 0) {
          args[key] = String(next);
          i++;
        } else {
          args[key] = true;
        }
      }
    } else {
      rest.push(item);
    }
  }
  args._ = rest;
  return args;
}

function intArg(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function floatArg(value, fallback) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function boolArg(value, fallback) {
  if (value == null) return fallback;
  if (value === true || value === false) return value;
  const text = String(value).toLowerCase();
  if (text === '1' || text === 'true' || text === 'yes' || text === 'on') return true;
  if (text === '0' || text === 'false' || text === 'no' || text === 'off') return false;
  return fallback;
}

function dbConfig(args) {
  args = args || {};
  return {
    host: args.dbHost || envGet('PHY_ROBOT_DB_HOST', '127.0.0.1'),
    port: intArg(args.dbPort || envGet('PHY_ROBOT_DB_PORT', '5656'), 5656),
    user: args.dbUser || envGet('PHY_ROBOT_DB_USER', 'sys'),
    password: args.dbPassword || envGet('PHY_ROBOT_DB_PASSWORD', 'manager')
  };
}

module.exports = {
  boolArg,
  dbConfig,
  envGet,
  floatArg,
  intArg,
  parseArgs
};

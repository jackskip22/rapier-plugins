// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import dgram from 'node:dgram';
import http2 from 'node:http2';
import childProcess from 'node:child_process';
import workerThreads from 'node:worker_threads';
import {registerHooks, syncBuiltinESMExports} from 'node:module';
import {resolve, relative, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

export function offlinePluginBuild(root, paths, {record = false} = {}) {
  const allowed = new Set(paths.map(path => resolve(root, path)));
  allowed.add(process.execPath);
  const within = path => { const rel = relative(root, path); return rel && !rel.startsWith('..') && !isAbsolute(rel); };
  const reads = new Set(), violations = [], restore = [];
  const refuse = reason => { violations.push(reason); throw new Error('Reader plug-in offline boundary: ' + reason); };
  const input = value => {
    const path = value instanceof URL ? fileURLToPath(value) : typeof value === 'string' || Buffer.isBuffer(value) ? resolve(String(value)) : null;
    if (!allowed.has(path) && !(record && path && within(path))) refuse('undeclared input ' + String(value));
    if (path !== process.execPath) reads.add(relative(root, path).replaceAll('\\', '/'));
  };
  const replace = (object, key, value) => {
    const original = object[key];
    if (typeof original !== 'function') return;
    object[key] = value(original);
    restore.push(() => { object[key] = original; });
  };
  const deny = (object, keys, category) => keys.forEach(key => replace(object, key, () => () => refuse(category + ': ' + key)));
  for (const object of [fs, fsp]) {
    for (const key of ['readFile', 'readFileSync']) replace(object, key, original => function (path, ...args) { input(path); return Reflect.apply(original, this, [path, ...args]); });
    for (const key of ['open', 'openSync']) replace(object, key, original => function (path, flags, ...args) {
      input(path);
      if (![undefined, 'r', 'rs', 'sr', 0].includes(flags)) refuse('generation write: ' + key);
      return Reflect.apply(original, this, [path, flags, ...args]);
    });
    deny(object, ['opendir', 'opendirSync', 'readdir', 'readdirSync', 'createReadStream'], 'undeclared filesystem access');
    deny(object, ['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'mkdir', 'mkdirSync', 'rename', 'renameSync', 'rm', 'rmSync', 'unlink', 'unlinkSync', 'copyFile', 'copyFileSync', 'cp', 'cpSync', 'createWriteStream', 'symlink', 'symlinkSync', 'link', 'linkSync', 'truncate', 'truncateSync'], 'generation write');
  }
  deny(globalThis, ['fetch', 'WebSocket', 'EventSource'], 'network');
  deny(http, ['request', 'get'], 'network'); deny(https, ['request', 'get'], 'network');
  deny(net, ['connect', 'createConnection', 'createServer'], 'network'); deny(net.Socket.prototype, ['connect'], 'network');
  deny(tls, ['connect', 'createServer'], 'network'); deny(http2, ['connect', 'createServer', 'createSecureServer'], 'network');
  deny(dgram, ['createSocket'], 'network');
  for (const object of [dns, dns.promises]) deny(object, Object.keys(object).filter(key => /^(resolve|lookup|reverse)/.test(key)), 'network');
  deny(childProcess, ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'], 'subprocess');
  deny(workerThreads, ['Worker'], 'worker'); deny(process, ['dlopen'], 'native addon');
  syncBuiltinESMExports();
  const hooks = registerHooks({load(url, context, next) {
    if (url.startsWith('file:')) input(new URL(url));
    else if (!url.startsWith('node:')) refuse('undeclared module ' + url);
    return next(url, context);
  }});
  return {
    finish() {
      hooks.deregister();
      for (const undo of restore.reverse()) undo();
      syncBuiltinESMExports();
      if (violations.length) throw new Error('Reader plug-in offline boundary: ' + violations.join('; '));
      return {network: 'denied', subprocesses: 'denied', cache: 'off', reads: [...reads].sort()};
    },
  };
}

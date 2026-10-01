import { Miniflare } from 'miniflare';
import { resolve } from 'node:path';

const token = process.env.LOCAL_R2_TOKEN;
if (!token || token.length < 32) throw new Error('Run npm run local:init first.');
const simulator = new Miniflare({
  modules: true,
  host: '127.0.0.1',
  port: 8788,
  compatibilityDate: '2026-07-01',
  cf: false,
  r2Buckets: ['COMICS'],
  r2Persist: resolve('.local/r2'),
  bindings: { LOCAL_TOKEN: token },
  script: `export default {
    async fetch(request, env) {
      if (request.headers.get('authorization') !== 'Bearer ' + env.LOCAL_TOKEN) return new Response('Unauthorized', {status: 401});
      const key = new URL(request.url).pathname.slice(1);
      if (!key || key.includes('..')) return new Response('Invalid key', {status: 400});
      if (request.method === 'PUT') {
        const size = Number(request.headers.get('content-length'));
        if (!Number.isFinite(size) || size <= 0 || size > 12 * 1024 * 1024) return new Response('Invalid size', {status: 413});
        await env.COMICS.put(key, request.body, {httpMetadata: {contentType: request.headers.get('content-type') || 'application/octet-stream'}});
        return new Response(null, {status: 201});
      }
      if (request.method === 'GET') {
        const object = await env.COMICS.get(key);
        if (!object) return new Response('Not found', {status: 404});
        const headers = new Headers({'Cache-Control': 'no-store', 'Content-Length': String(object.size)});
        object.writeHttpMetadata(headers);
        return new Response(object.body, {headers});
      }
      if (request.method === 'DELETE') { await env.COMICS.delete(key); return new Response(null, {status: 204}); }
      return new Response('Method not allowed', {status: 405});
    }
  }`,
});
await simulator.ready;
console.log('Private R2 simulator listening on http://127.0.0.1:8788; persistent data in .local/r2.');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await simulator.dispose(); process.exit(0); });

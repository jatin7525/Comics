// Deliberately bounded, loopback-only smoke test; not a capacity benchmark.
const origin = new URL(process.env.SMOKE_ORIGIN || 'http://localhost:3101');
if (!['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Local targets only.');
const count = 100, concurrency = 5, times = [];
let next = 0, failures = 0;
await (await fetch(new URL('/comics', origin))).arrayBuffer();
const start = performance.now();
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (next++ < count) {
    const begin = performance.now();
    try {
      const response = await fetch(new URL('/comics', origin), { signal: AbortSignal.timeout(15_000) });
      await response.arrayBuffer();
      if (!response.ok) failures++;
    } catch { failures++; }
    times.push(performance.now() - begin);
  }
}));
const elapsed = performance.now() - start;
times.sort((a, b) => a - b);
console.log(JSON.stringify({ requests: count, concurrency, failures, elapsedMs: Math.round(elapsed), requestsPerSecond: +(count / (elapsed / 1000)).toFixed(1), p50Ms: Math.round(times[Math.ceil(count * .5) - 1]), p95Ms: Math.round(times[Math.ceil(count * .95) - 1]), scope: 'Local SSR catalog HTML only; excludes images and browser execution.' }, null, 2));
process.exitCode = failures ? 1 : 0;

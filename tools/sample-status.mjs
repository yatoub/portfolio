#!/usr/bin/env node
/* Local dev only: writes data/status.json with plausible random history,
   in the format produced by the real exporter on the server.
   node tools/sample-status.mjs [--down grafana,n8n] [--stale] */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = name => {
    const i = process.argv.indexOf(name);
    return i < 0 ? null : process.argv[i + 1] ?? '';
};
const down = new Set((arg('--down') ?? '').split(',').filter(Boolean));
const stale = process.argv.includes('--stale');
const DAYS = 90;

const services = JSON.parse(readFileSync(join(ROOT, 'homelab.json'), 'utf8')).map((s, n) => {
    const days = Array.from({ length: DAYS }, (_, i) => {
        if (n === 2 && i < 40) return null;                 // service added 50 days ago
        const r = Math.random();
        if (r < 0.02) return +(0.5 + Math.random() * 0.4).toFixed(4);
        if (r < 0.08) return +(0.96 + Math.random() * 0.038).toFixed(4);
        return 1;
    });
    if (down.has(s.id)) days[DAYS - 1] = 0.7;
    const known = days.filter(v => v !== null);
    return {
        id: s.id,
        state: down.has(s.id) ? 'down' : 'up',
        latency_ms: down.has(s.id) ? null : Math.round(5 + Math.random() * 80),
        uptime: +(known.reduce((a, b) => a + b, 0) / known.length).toFixed(5),
        days,
    };
});

const generated_at = new Date(Date.now() - (stale ? 3600e3 : 0)).toISOString();
mkdirSync(join(ROOT, 'data'), { recursive: true });
writeFileSync(join(ROOT, 'data/status.json'), JSON.stringify({ generated_at, window_days: DAYS, services }) + '\n');
console.log(`wrote data/status.json (${services.length} services${down.size ? `, down: ${[...down]}` : ''}${stale ? ', stale' : ''})`);

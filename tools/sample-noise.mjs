#!/usr/bin/env node
/* Local dev only: writes data/noise/noise.json with plausible random traffic,
   in the format produced by the real exporter on the server
   (noise_export role, homelab-ansible).
   node tools/sample-noise.mjs [--stale] [--empty] [--no-geo] */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const has = name => process.argv.includes(name);
const HOUR = 3600e3;
const DAY = 24 * HOUR;
const WINDOW_DAYS = 7;
const HISTORY_DAYS = 30;

const now = Date.now() - (has('--stale') ? 2 * HOUR : 0);
const rand = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
// A steady trickle, plus the occasional scanner unrolling its whole list within the hour
const hourCount = () => (has('--empty') ? 0 : rand(2, 14) + (Math.random() < 0.05 ? rand(60, 220) : 0));

const thisHour = Math.floor(now / HOUR) * HOUR;
const hourly = Array.from({ length: WINDOW_DAYS * 24 }, hourCount);
const today = Math.floor(now / DAY) * DAY;
const daily = Array.from({ length: HISTORY_DAYS }, (_, i) => {
    const dayStart = today - (HISTORY_DAYS - 1 - i) * DAY;
    // The last 7 days must add up with the hourly series
    const fromHours = hourly.reduce((sum, n, h) => {
        const t = thisHour - (hourly.length - 1 - h) * HOUR;
        return t >= dayStart && t < dayStart + DAY ? sum + n : sum;
    }, 0);
    return dayStart > now - WINDOW_DAYS * DAY ? fromHours : has('--empty') ? 0 : rand(120, 420);
});

const total = hourly.reduce((a, b) => a + b, 0);
const split = (shares) => shares.map(s => Math.round(total * s));
const FAMILIES = [
    ['scan', 0.3, ['/']],
    ['secrets', 0.19, ['/.env', '/.env.production', '/.aws/credentials', '/config.json', '/.env.bak']],
    ['wordpress', 0.16, ['/wp-login.php', '/xmlrpc.php', '/wp-admin/setup-config.php', '/wp-includes/wlwmanifest.xml', '/wp-content/plugins/']],
    ['shell', 0.08, ['/index.php', '/shell.php', '/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php', '/alfa.php']],
    ['git', 0.11, ['/.git/config', '/.git/HEAD']],
    ['admin', 0.09, ['/phpmyadmin/', '/admin/', '/manager/html', '/adminer.php']],
    ['debug', 0.06, ['/actuator/health', '/actuator/env', '/server-status', '/swagger-ui.html']],
    ['exploit', 0.04, ['/cgi-bin/.%2e/.%2e/bin/sh', '/owa/auth/logon.aspx', '/solr/admin/info/system']],
    ['device', 0.03, ['/boaform/admin/formLogin', '/HNAP1', '/cgi-bin/luci']],
    ['backup', 0.02, ['/backup.zip', '/dump.sql', '/site.tar.gz']],
];
const counts = split(FAMILIES.map(f => f[1]));
const families = FAMILIES.map(([id, , paths], i) => {
    let left = counts[i];
    return {
        id,
        count: counts[i],
        paths: paths.map((path, n) => {
            const c = n === paths.length - 1 ? Math.round(left * 0.6) : Math.round(left * 0.45);
            left -= c;
            return { path, count: Math.max(c, 0) };
        }).filter(p => p.count > 0).filter(p => p.path === '/' || /^\/[A-Za-z0-9._/-]{1,79}$/.test(p.path)),
    };
}).filter(f => f.count > 0);

const geo = !has('--no-geo');
const ranked = (rows) => rows.map(([key, share, extra]) => ({ ...key, ...extra, count: Math.round(total * share) })).filter(r => r.count > 0);
const countries = geo ? ranked([[{ cc: 'US' }, 0.26], [{ cc: 'DE' }, 0.14], [{ cc: 'NL' }, 0.12], [{ cc: 'CN' }, 0.1], [{ cc: 'FR' }, 0.07], [{ cc: 'SG' }, 0.06], [{ cc: 'GB' }, 0.05], [{ cc: 'RU' }, 0.04], [{ cc: 'IN' }, 0.03], [{ cc: 'BR' }, 0.02]]) : [];
const networks = geo ? ranked([
    [{ asn: 14061, name: 'DigitalOcean, LLC' }, 0.17], [{ asn: 16509, name: 'Amazon.com, Inc.' }, 0.12], [{ asn: 8075, name: 'Microsoft Corporation' }, 0.1],
    [{ asn: 24940, name: 'Hetzner Online GmbH' }, 0.08], [{ asn: 16276, name: 'OVH SAS' }, 0.07], [{ asn: 45090, name: 'Shenzhen Tencent Computer Systems Company Limited' }, 0.05],
    [{ asn: 396982, name: 'Google LLC' }, 0.05], [{ asn: 63949, name: 'Akamai Connected Cloud' }, 0.04], [{ asn: 4134, name: 'Chinanet' }, 0.03], [{ asn: 64512, name: '' }, 0.02],
]) : [];

const requests24 = hourly.slice(-24).reduce((a, b) => a + b, 0);
const payload = {
    generated_at: new Date(now).toISOString().replace(/\.\d+Z$/, 'Z'),
    window_days: WINDOW_DAYS,
    geo,
    last24: { requests: requests24, other: has('--empty') ? 0 : rand(3, 30), by_ip: Math.round(requests24 * 0.8), sources: Math.round(requests24 * 0.35) },
    hourly: { start: new Date(thisHour - (hourly.length - 1) * HOUR).toISOString().replace(/\.\d+Z$/, 'Z'), counts: hourly },
    daily: { start: new Date(today - (HISTORY_DAYS - 1) * DAY).toISOString().slice(0, 10), counts: daily },
    families,
    countries,
    networks,
};

mkdirSync(join(ROOT, 'data/noise'), { recursive: true });
writeFileSync(join(ROOT, 'data/noise/noise.json'), JSON.stringify(payload) + '\n');
console.log(`data/noise/noise.json: ${total} probes over ${WINDOW_DAYS} days${has('--stale') ? ' (stale)' : ''}`);

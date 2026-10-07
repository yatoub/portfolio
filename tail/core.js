/* ═══════════════════════════════════════════
   YATOUB // TAIL — background noise, pure helpers
   Reads /data/noise/noise.json, written every 10 min on the server by
   the noise_export role (homelab-ansible): counters only, no IP address.
   No DOM access here: covered by tools/tail-core.test.mjs.
   ═══════════════════════════════════════════ */

const TailCore = (() => {
    // The exporter runs every 10 min ; past 30 min the file is not trusted anymore
    const STALE_MS = 30 * 60 * 1000;
    // Tolerated clock drift between the exporter and whoever provides "now"
    const SKEW_MS = 5 * 60 * 1000;
    const HOUR_MS = 3600 * 1000;
    const DAY_MS = 24 * HOUR_MS;

    const count = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
    const series = (s) => (s && Array.isArray(s.counts) && !Number.isNaN(Date.parse(s.start)) ? s : null);

    // → { state: 'ok' | 'empty' | 'stale' | 'unknown', age }
    // 'empty': a valid, fresh file that has not seen a single probe yet (new install)
    function summarize(data, now = Date.now()) {
        if (!data || !series(data.hourly) || !data.last24) return { state: 'unknown', age: null };
        const age = now - Date.parse(data.generated_at);
        if (!(age >= -SKEW_MS && age < STALE_MS)) return { state: 'stale', age: Number.isNaN(age) ? null : age };
        const seen = data.hourly.counts.some(n => count(n) > 0) || (data.daily?.counts || []).some(n => count(n) > 0);
        return { state: seen ? 'ok' : 'empty', age };
    }

    // { start, counts } → [{ t (ms), n }], one point per step
    function points(s, stepMs) {
        if (!series(s)) return [];
        const start = Date.parse(s.start);
        return s.counts.map((n, i) => ({ t: start + i * stepMs, n: count(n) }));
    }
    const hours = (data) => points(data?.hourly, HOUR_MS);
    const days = (data) => points(data?.daily, DAY_MS);

    // Bar heights as 0..1 of the tallest bar ; an all-zero series stays flat
    function heights(pts) {
        const max = Math.max(0, ...pts.map(p => p.n));
        return pts.map(p => (max ? p.n / max : 0));
    }

    const peak = (pts) => pts.reduce((best, p) => (p.n > (best?.n ?? 0) ? p : best), null);

    // 24 h of probes → how often one arrives, in the unit that reads best
    // → { unit: 'none' } | { unit: 'perMinute', n } | { unit: 'everyMinutes', n } | { unit: 'everyHours', n }
    function rate(requests) {
        const n = count(requests);
        if (!n) return { unit: 'none' };
        const perMinute = n / 1440;
        if (perMinute >= 1) return { unit: 'perMinute', n: Math.round(perMinute) };
        const gap = 1440 / n;
        if (gap < 90) return { unit: 'everyMinutes', n: Math.max(1, Math.round(gap)) };
        return { unit: 'everyHours', n: Math.round(gap / 60) };
    }

    // Ranked list → same items with `share` (of the list total, 0..1) and `width` (of the largest, 0..1)
    function ranked(list) {
        const items = (Array.isArray(list) ? list : []).filter(x => x && count(x.count) > 0);
        const total = items.reduce((sum, x) => sum + count(x.count), 0);
        const max = Math.max(0, ...items.map(x => count(x.count)));
        return items.map(x => ({ ...x, count: count(x.count), share: count(x.count) / total, width: count(x.count) / max }));
    }

    // Whole percent, but never "0 %" for something that was seen
    function percent(share) {
        if (!(share > 0)) return '0';
        const pct = Math.round(share * 100);
        return pct < 1 ? '<1' : String(pct);
    }

    /* ── World map: map is the generated TailMap (tail/map.js) ── */
    // Land cells of the dot matrix → [[col, row], …]
    function landCells(map) {
        const cells = [];
        map.land.forEach((hex, row) => {
            [...hex].forEach((digit, i) => {
                const nibble = parseInt(digit, 16);
                for (let b = 0; b < 4; b++) if (nibble & (8 >> b)) cells.push([i * 4 + b, row]);
            });
        });
        return cells;
    }

    // Longitude, latitude → position in grid units, clamped inside the map
    function project(map, lon, lat) {
        const clamp = (v, max) => Math.min(Math.max(v, 0), max);
        return { x: clamp((lon - map.lonLeft) / map.cell, map.cols), y: clamp((map.latTop - lat) / map.cell, map.rows) };
    }

    // Ranked countries → one marker each, largest first so that small ones are drawn on top.
    // The area of a marker follows its count ; unknown country codes are left out.
    function markers(map, countries, { rMin = 0.9, rMax = 3.4 } = {}) {
        const known = ranked(countries).filter(c => typeof c.cc === 'string' && Object.hasOwn(map.countries, c.cc));
        return known.map((c) => {
            const [lon, lat] = map.countries[c.cc];
            return { cc: c.cc, count: c.count, ...project(map, lon, lat), r: rMin + (rMax - rMin) * Math.sqrt(c.width) };
        }).sort((a, b) => b.r - a.r);
    }

    return { STALE_MS, SKEW_MS, HOUR_MS, DAY_MS, summarize, hours, days, heights, peak, rate, ranked, percent, landCells, project, markers };
})();

if (typeof module !== 'undefined') module.exports = TailCore;

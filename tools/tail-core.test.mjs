// node --test tools/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const T = require('../tail/core.js');
const M = require('../tail/map.js');
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const translations = new Function(`${read('tail/translations.js')}; return translations;`)();

// Output of the real exporter (noise_export.py, homelab-ansible) on a test Caddy log
const real = JSON.parse(read('tools/fixtures/noise.json'));
const at = Date.parse(real.generated_at);
const MIN = 60 * 1000;

const sample = (over = {}) => ({
    generated_at: '2026-10-07T12:00:00Z', window_days: 7, geo: true,
    last24: { requests: 10, other: 2, sources: 4 },
    hourly: { start: '2026-10-07T09:00:00Z', counts: [0, 3, 7] },
    daily: { start: '2026-10-05', counts: [5, 0, 10] },
    families: [], countries: [], networks: [],
    ...over,
});
const noon = Date.parse('2026-10-07T12:00:00Z');

test('the real exporter output is read as fresh data', () => {
    assert.deepEqual(T.summarize(real, at + 5 * MIN), { state: 'ok', age: 5 * MIN });
    assert.equal(T.hours(real).length, 7 * 24);
    assert.equal(T.days(real).length, 30);
    assert.equal(T.hours(real).at(-1).n, real.last24.requests);
    assert.ok(T.ranked(real.families).length > 0);
});

test('every family the exporter can emit is described in both languages', () => {
    // FAMILIES of noise_export.py ; a new family there needs its entry here
    // 'scan' is the family of the catch-all log: requests by IP address that match no pattern
    const ids = ['scan', 'exploit', 'git', 'secrets', 'wordpress', 'admin', 'device', 'debug', 'backup', 'shell'];
    for (const f of real.families) assert.ok(ids.includes(f.id), `fixture family ${f.id}`);
    for (const lang of ['en', 'fr']) {
        assert.deepEqual(Object.keys(translations[lang].families).sort(), [...ids].sort(), lang);
        for (const id of ids) assert.ok(translations[lang].families[id].name && translations[lang].families[id].wanted, `${lang}: ${id}`);
    }
});

test('the fixture carries no address', () => {
    assert.doesNotMatch(read('tools/fixtures/noise.json'), /\b\d{1,3}(\.\d{1,3}){3}\b/);
});

test('data older than 30 minutes is stale, never shown as live', () => {
    assert.equal(T.summarize(sample(), noon + 29 * MIN).state, 'ok');
    assert.equal(T.summarize(sample(), noon + 30 * MIN).state, 'stale');
    assert.equal(T.summarize(sample(), noon + 3 * 3600 * 1000).age, 3 * 3600 * 1000);
});

test('a file from the future is tolerated up to the clock skew, then stale', () => {
    assert.equal(T.summarize(sample(), noon - 4 * MIN).state, 'ok');
    assert.equal(T.summarize(sample(), noon - 6 * MIN).state, 'stale');
});

test('missing or malformed files are unknown', () => {
    for (const data of [null, undefined, {}, [], 'x', sample({ hourly: null }), sample({ hourly: { start: 'nope', counts: [] } }), sample({ hourly: { start: '2026-10-07T09:00:00Z' } }), sample({ last24: undefined })]) {
        assert.equal(T.summarize(data, noon).state, 'unknown');
    }
    assert.deepEqual(T.summarize(sample({ generated_at: 'nope' }), noon), { state: 'stale', age: null });
});

test('a fresh file without a single probe is empty, not ok', () => {
    const data = sample({ hourly: { start: '2026-10-07T09:00:00Z', counts: [0, 0, 0] }, daily: { start: '2026-10-05', counts: [0, 0, 0] } });
    assert.equal(T.summarize(data, noon).state, 'empty');
    // Older history alone is enough to show the page
    assert.equal(T.summarize({ ...data, daily: { start: '2026-10-05', counts: [4, 0, 0] } }, noon).state, 'ok');
});

test('series are placed on the time axis from their start', () => {
    assert.deepEqual(T.hours(sample()), [
        { t: Date.parse('2026-10-07T09:00:00Z'), n: 0 },
        { t: Date.parse('2026-10-07T10:00:00Z'), n: 3 },
        { t: Date.parse('2026-10-07T11:00:00Z'), n: 7 },
    ]);
    assert.deepEqual(T.days(sample()).map(p => new Date(p.t).toISOString().slice(0, 10)), ['2026-10-05', '2026-10-06', '2026-10-07']);
    assert.deepEqual(T.hours({}), []);
    assert.deepEqual(T.days(null), []);
});

test('junk counts are read as zero', () => {
    const pts = T.hours(sample({ hourly: { start: '2026-10-07T09:00:00Z', counts: [-4, 'x', null, 2.9, NaN] } }));
    assert.deepEqual(pts.map(p => p.n), [0, 0, 0, 2, 0]);
});

test('bar heights are relative to the tallest bar', () => {
    assert.deepEqual(T.heights(T.hours(sample())), [0, 3 / 7, 1]);
    assert.deepEqual(T.heights([{ n: 0 }, { n: 0 }]), [0, 0]);
    assert.deepEqual(T.heights([]), []);
});

test('peak is the busiest point, null when nothing happened', () => {
    assert.deepEqual(T.peak(T.hours(sample())), { t: Date.parse('2026-10-07T11:00:00Z'), n: 7 });
    assert.equal(T.peak([{ t: 1, n: 0 }]), null);
    assert.equal(T.peak([]), null);
});

test('rate picks the unit that reads best', () => {
    assert.deepEqual(T.rate(0), { unit: 'none' });
    assert.deepEqual(T.rate(undefined), { unit: 'none' });
    assert.deepEqual(T.rate(4320), { unit: 'perMinute', n: 3 });
    assert.deepEqual(T.rate(1440), { unit: 'perMinute', n: 1 });
    assert.deepEqual(T.rate(288), { unit: 'everyMinutes', n: 5 });
    assert.deepEqual(T.rate(1000), { unit: 'everyMinutes', n: 1 });
    assert.deepEqual(T.rate(24), { unit: 'everyMinutes', n: 60 });
    assert.deepEqual(T.rate(8), { unit: 'everyHours', n: 3 });
    assert.deepEqual(T.rate(1), { unit: 'everyHours', n: 24 });
});

test('ranked adds share of the total and width of the largest, and drops empty rows', () => {
    const rows = T.ranked([{ id: 'a', count: 6 }, { id: 'b', count: 3 }, { id: 'c', count: 1 }, { id: 'd', count: 0 }, null, { id: 'e' }]);
    assert.deepEqual(rows.map(r => r.id), ['a', 'b', 'c']);
    assert.deepEqual(rows.map(r => r.share), [0.6, 0.3, 0.1]);
    assert.deepEqual(rows.map(r => r.width), [1, 0.5, 1 / 6]);
    assert.deepEqual(T.ranked(undefined), []);
    assert.deepEqual(T.ranked([]), []);
});

test('percent never rounds something seen down to 0', () => {
    assert.equal(T.percent(0.6), '60');
    assert.equal(T.percent(0.004), '<1');
    assert.equal(T.percent(0.996), '100');
    assert.equal(T.percent(0), '0');
    assert.equal(T.percent(NaN), '0');
});

test('both languages expose the same keys', () => {
    const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    assert.deepEqual(keys(translations.en).sort(), keys(translations.fr).sort());
});

test('the generated map is a consistent grid', () => {
    assert.equal(M.land.length, M.rows);
    assert.ok(M.land.every(r => r.length === M.cols / 4 && /^[0-9a-f]+$/.test(r)));
    const cells = T.landCells(M);
    assert.ok(cells.length > 1500 && cells.length < 2500, `${cells.length} land cells`);
    assert.ok(cells.every(([c, r]) => c >= 0 && c < M.cols && r >= 0 && r < M.rows));
    assert.ok(Object.keys(M.countries).length > 200);
    for (const [cc, [lon, lat]] of Object.entries(M.countries)) {
        assert.match(cc, /^[A-Z]{2}$/);
        assert.ok(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90, cc);
    }
});

test('known places land where they should on the grid', () => {
    const has = (lon, lat) => { const { x, y } = T.project(M, lon, lat); return T.landCells(M).some(([c, r]) => c === Math.floor(x) && r === Math.floor(y)); };
    assert.ok(has(2.35, 48.85), 'Paris is on land');
    assert.ok(has(-100, 40), 'the middle of the United States is on land');
    assert.ok(has(134, -25), 'the middle of Australia is on land');
    assert.ok(!has(-30, 30), 'the middle of the Atlantic is not');
    assert.ok(!has(-140, 0), 'the middle of the Pacific is not');
    assert.deepEqual(T.project(M, -180, 84), { x: 0, y: 0 });
    assert.deepEqual(T.project(M, 500, -500), { x: M.cols, y: M.rows }, 'out-of-range points are clamped');
});

test('markers: one per known country, area following the count, small ones drawn last', () => {
    const marks = T.markers(M, [{ cc: 'US', count: 400 }, { cc: 'FR', count: 100 }, { cc: 'ZZ', count: 50 }, { cc: 'constructor', count: 9 }, { cc: 'SG', count: 0 }, { count: 5 }]);
    assert.deepEqual(marks.map(m => m.cc), ['US', 'FR']);
    assert.equal(marks[0].r, 3.4);
    assert.equal(marks[1].r, 0.9 + 2.5 * Math.sqrt(100 / 400));
    assert.ok(marks[1].x > marks[0].x, 'France is east of the United States');
    assert.ok(marks[0].y > 10 && marks[0].y < 20);
    assert.deepEqual(T.markers(M, []), []);
    assert.deepEqual(T.markers(M, undefined), []);
});

test('every country of the real export and of the sample generator is on the map', () => {
    for (const { cc } of real.countries) assert.ok(Object.hasOwn(M.countries, cc), cc);
    for (const cc of ['US', 'DE', 'NL', 'CN', 'FR', 'SG', 'GB', 'RU', 'IN', 'BR', 'HK']) assert.ok(Object.hasOwn(M.countries, cc), cc);
});

test('labels go to the busiest markers that do not sit on one another', () => {
    const marks = T.markers(M, [{ cc: 'US', count: 500 }, { cc: 'DE', count: 300 }, { cc: 'NL', count: 280 }, { cc: 'FR', count: 200 }, { cc: 'CN', count: 150 }, { cc: 'BR', count: 20 }]);
    assert.deepEqual(T.labelled(marks).map(m => m.cc), ['US', 'DE', 'CN'], 'the Netherlands and France are too close to Germany');
    assert.deepEqual(T.labelled(marks, { max: 1 }).map(m => m.cc), ['US']);
    assert.deepEqual(T.labelled([]), []);
});

// node --test tools/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const T = require('../tail/core.js');
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
    const ids = ['exploit', 'git', 'secrets', 'wordpress', 'admin', 'device', 'debug', 'backup', 'shell'];
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

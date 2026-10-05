// node --test tools/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { summarize, dayClass, fmtUptime, STALE_MS } = createRequire(import.meta.url)('../status/core.js');

const NOW = Date.parse('2026-10-05T12:00:00Z');
const at = ms => new Date(NOW - ms).toISOString();
const svc = (...states) => states.map((state, i) => ({ id: `s${i}`, state }));

test('all services up', () => {
    const r = summarize({ generated_at: at(60_000), services: svc('up', 'up') }, NOW);
    assert.deepEqual([r.state, r.down, r.total], ['up', 0, 2]);
});

test('some services down is degraded, all down is down', () => {
    assert.equal(summarize({ generated_at: at(0), services: svc('up', 'down') }, NOW).state, 'degraded');
    assert.equal(summarize({ generated_at: at(0), services: svc('down', 'down') }, NOW).state, 'down');
});

test('any state other than "up" counts as down', () => {
    assert.equal(summarize({ generated_at: at(0), services: svc('up', 'weird') }, NOW).down, 1);
});

test('old data is stale, never reported as up', () => {
    assert.equal(summarize({ generated_at: at(STALE_MS - 1), services: svc('up') }, NOW).state, 'up');
    assert.equal(summarize({ generated_at: at(STALE_MS), services: svc('up') }, NOW).state, 'stale');
});

test('missing, invalid or future timestamps are stale', () => {
    assert.equal(summarize({ services: svc('up') }, NOW).state, 'stale');
    assert.equal(summarize({ generated_at: 'nope', services: svc('up') }, NOW).state, 'stale');
    assert.equal(summarize({ generated_at: at(-10 * 60_000), services: svc('up') }, NOW).state, 'stale');
});

test('small clock drift is tolerated', () => {
    assert.equal(summarize({ generated_at: at(-60_000), services: svc('up') }, NOW).state, 'up');
});

test('missing or empty payload is unknown', () => {
    assert.equal(summarize(null, NOW).state, 'unknown');
    assert.equal(summarize({ generated_at: at(0), services: [] }, NOW).state, 'unknown');
    assert.equal(summarize({ generated_at: at(0), services: 'x' }, NOW).state, 'unknown');
});

test('dayClass thresholds', () => {
    assert.deepEqual([1, 0.999, 0.998, 0.95, 0.94, 0, null, undefined, NaN].map(dayClass),
        ['ok', 'ok', 'warn', 'warn', 'bad', 'bad', 'nodata', 'nodata', 'nodata']);
});

test('fmtUptime floors instead of rounding up to 100', () => {
    assert.equal(fmtUptime(1), '100.00');
    assert.equal(fmtUptime(0.99999), '99.99');
    assert.equal(fmtUptime(0.9987), '99.87');
    assert.equal(fmtUptime(0.9995), '99.95');
    assert.equal(fmtUptime(null), null);
});

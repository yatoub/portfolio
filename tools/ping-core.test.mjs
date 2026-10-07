// node --test tools/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const P = require('../ping/core.js');

test('a sample is the time between sending the request and the first byte back', () => {
    assert.equal(P.sample({ requestStart: 100.04, responseStart: 123.47 }), 23.4);
    assert.equal(P.sample({ requestStart: 100, responseStart: 100 }), null);
    assert.equal(P.sample({ requestStart: 0, responseStart: 12 }), null, 'timing hidden by the browser');
    assert.equal(P.sample({ requestStart: 50, responseStart: 40 }), null);
    assert.equal(P.sample(undefined), null);
    assert.equal(P.sample({}), null);
});

test('stats match what ping reports', () => {
    assert.deepEqual(P.stats([20, 22, 24, 30]), { sent: 4, received: 4, loss: 0, min: 20, avg: 24, max: 30, mdev: 3 });
    assert.deepEqual(P.stats([10]), { sent: 1, received: 1, loss: 0, min: 10, avg: 10, max: 10, mdev: 0 });
});

test('lost requests count in the loss, not in the times', () => {
    assert.deepEqual(P.stats([20, null, 30, null]), { sent: 4, received: 2, loss: 50, min: 20, avg: 25, max: 30, mdev: 5 });
    assert.deepEqual(P.stats([null, null]), { sent: 2, received: 0, loss: 100, min: null, avg: null, max: null, mdev: null });
    assert.deepEqual(P.stats([]), { sent: 0, received: 0, loss: 0, min: null, avg: null, max: null, mdev: null });
});

test('the distance bound is half the round trip at 200 km per ms, never understated', () => {
    assert.equal(P.maxDistanceKm(20), 2000);
    assert.equal(P.maxDistanceKm(1), 100);
    assert.equal(P.maxDistanceKm(23.4), 2400, '2340 km rounds up');
    assert.equal(P.maxDistanceKm(0.5), 50);
    assert.equal(P.maxDistanceKm(0.03), 3);
    assert.equal(P.maxDistanceKm(133.7), 14000);
    for (const rtt of [0.7, 3.3, 17.9, 48.2, 251]) assert.ok(P.maxDistanceKm(rtt) >= (rtt / 2) * 200, `${rtt} ms`);
    for (const bad of [0, -5, null, undefined, NaN]) assert.equal(P.maxDistanceKm(bad), null);
});

test('minRttMs is the inverse: the fastest physics allows for a distance', () => {
    assert.equal(P.minRttMs(660), 6.6);
    assert.equal(P.minRttMs(5800), 58);
    assert.equal(P.minRttMs(20000), 200);
});

test('bar heights are relative to the slowest answer, lost requests are flat', () => {
    assert.deepEqual(P.heights([10, 20, null, 5]), [0.5, 1, 0, 0.25]);
    assert.deepEqual(P.heights([null, null]), [0, 0]);
    assert.deepEqual(P.heights([]), []);
});

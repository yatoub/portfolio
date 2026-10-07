// node --test tools/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const R = require('../traceroute/core.js');
const Tcp = require('../tcpdump/core.js');
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const translations = new Function(`${read('traceroute/translations.js')}; return translations;`)();

const fresh = {
    startTime: 0, fetchStart: 2, domainLookupStart: 5, domainLookupEnd: 25,
    connectStart: 25, secureConnectionStart: 45, connectEnd: 80,
    requestStart: 81, responseStart: 121, responseEnd: 131,
    domInteractive: 180, domContentLoadedEventEnd: 200, nextHopProtocol: 'h2', transferSize: 5300,
};
const reused = { startTime: 0, fetchStart: 4, domainLookupStart: 4, domainLookupEnd: 4, connectStart: 4, connectEnd: 4, secureConnectionStart: 4, requestStart: 5, responseStart: 35, responseEnd: 36, domInteractive: 60, domContentLoadedEventEnd: 70 };

test('the chain goes from the device to the site, the resolver hangs off the provider', () => {
    assert.deepEqual(R.CHAIN.map(n => n.id), ['device', 'lan', 'isp', 'net', 'edge', 'fw', 'proxy', 'site']);
    assert.deepEqual(R.pathTo('proxy'), ['device', 'lan', 'isp', 'net', 'edge', 'fw', 'proxy']);
    assert.deepEqual(R.pathTo('site').at(-1), 'site');
    assert.deepEqual(R.pathTo('resolver'), ['device', 'lan', 'isp', 'resolver']);
    assert.deepEqual(R.pathTo('device'), ['device']);
    assert.deepEqual(R.pathTo('nowhere'), []);
    assert.deepEqual(R.edges(R.pathTo('resolver')), [['device', 'lan'], ['lan', 'isp'], ['isp', 'resolver']]);
    assert.equal(R.edgeId('fw', 'proxy'), 'fw>proxy');
});

test('a fresh HTTPS load makes four round trips, each with its real duration', () => {
    const trips = R.trips(Tcp.waterfall(fresh));
    assert.deepEqual(trips.map(t => [t.id, t.to, t.ms, t.state]), [
        ['dns', 'resolver', 20, 'measured'],
        ['transport', 'proxy', 20, 'measured'],
        ['tls', 'proxy', 35, 'measured'],
        ['http', 'site', 40, 'measured'],
    ]);
    assert.deepEqual(trips[0].path, ['device', 'lan', 'isp', 'resolver']);
    assert.deepEqual(R.summary(trips), { count: 4, ms: 115 });
});

test('on a reused connection only the request travels', () => {
    const trips = R.trips(Tcp.waterfall(reused));
    assert.deepEqual(trips.map(t => t.state), ['reused', 'reused', 'reused', 'measured']);
    assert.deepEqual(trips.map(t => t.ms), [null, null, null, 30]);
    assert.deepEqual(R.summary(trips), { count: 1, ms: 30 });
});

test('plain HTTP has no TLS trip', () => {
    const trips = R.trips(Tcp.waterfall({ ...fresh, secureConnectionStart: 0 }, { https: false }));
    assert.deepEqual(trips.map(t => t.state), ['measured', 'measured', 'none', 'measured']);
    assert.equal(R.summary(trips).count, 3);
});

test('without timing data every trip is drawn but none is measured', () => {
    for (const none of [null, undefined, {}]) {
        const trips = R.trips(none);
        assert.deepEqual(trips.map(t => t.id), ['dns', 'transport', 'tls', 'http']);
        assert.ok(trips.every(t => t.state === 'none' && t.ms === null && t.path.length > 1));
        assert.deepEqual(R.summary(trips), { count: 0, ms: 0 });
    }
});

test('the packet goes out then comes back along the same edges', () => {
    assert.deepEqual(R.locate(0, 3), { index: 0, t: 0, back: false });
    assert.deepEqual(R.locate(0.5, 3), { index: 1, t: 0.5, back: false });
    assert.deepEqual(R.locate(1, 3), { index: 2, t: 1, back: false });
    assert.deepEqual(R.locate(1.5, 3), { index: 1, t: 0.5, back: true });
    assert.deepEqual(R.locate(2, 3), { index: 0, t: 0, back: true });
    // Out of range is clamped, never an edge that does not exist
    assert.deepEqual(R.locate(-1, 3), { index: 0, t: 0, back: false });
    assert.deepEqual(R.locate(9, 3), { index: 0, t: 0, back: true });
    assert.equal(R.locate(0.5, 0), null);
});

test('every node and trip has its strings in both languages', () => {
    for (const lang of ['en', 'fr']) {
        const tr = translations[lang];
        for (const n of R.NODES) assert.ok(tr.node[n.id]?.name && tr.node[n.id]?.sub && tr.node[n.id]?.what, `${lang}: node.${n.id}`);
        for (const trip of [...R.TRIPS.map(x => x.id), 'quic']) assert.ok(tr.trip[trip]?.name && tr.trip[trip]?.what, `${lang}: trip.${trip}`);
        for (const side of ['you', 'net', 'server']) assert.ok(tr.side[side], `${lang}: side.${side}`);
    }
});

test('the server side shows roles only: no address anywhere in the page files', () => {
    for (const file of ['traceroute/core.js', 'traceroute/script.js', 'traceroute/translations.js', 'traceroute/index.html']) {
        assert.doesNotMatch(read(file), /\b(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b|vlan[\s_-]*\d/i, file);
    }
});

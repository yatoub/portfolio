// node --test tools/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const W = require('../tcpdump/core.js');
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const translations = new Function(`${read('tcpdump/translations.js')}; return translations;`)();

// A fresh HTTPS navigation, in the shape of PerformanceNavigationTiming
const fresh = {
    startTime: 0, redirectStart: 0, redirectEnd: 0, fetchStart: 2,
    domainLookupStart: 5, domainLookupEnd: 25,
    connectStart: 25, secureConnectionStart: 45, connectEnd: 80,
    requestStart: 81, responseStart: 121, responseEnd: 131,
    domInteractive: 180, domContentLoadedEventEnd: 200,
    nextHopProtocol: 'h2', transferSize: 5300, encodedBodySize: 5000, decodedBodySize: 20000,
};
const byId = (wf) => Object.fromEntries(wf.phases.map(p => [p.id, p]));

test('a fresh HTTPS navigation splits into its phases', () => {
    const wf = W.waterfall(fresh);
    assert.deepEqual(wf.phases.map(p => p.id), ['dns', 'tcp', 'tls', 'wait', 'download', 'dom']);
    const p = byId(wf);
    assert.deepEqual([p.dns.start, p.dns.duration], [5, 20]);
    assert.deepEqual([p.tcp.start, p.tcp.duration], [25, 20]);
    assert.deepEqual([p.tls.start, p.tls.duration], [45, 35]);
    assert.deepEqual([p.wait.start, p.wait.duration], [81, 40]);
    assert.deepEqual([p.download.start, p.download.duration], [121, 10]);
    assert.deepEqual([p.dom.start, p.dom.duration], [131, 69]);
    assert.equal(wf.total, 200);
    assert.equal(wf.reused, false);
    assert.equal(wf.cached, false);
    assert.equal(wf.protocol, 'h2');
    assert.ok(wf.phases.every(x => x.state === 'measured'));
});

test('a reused connection marks DNS, transport and TLS as skipped, not as 0 ms wins', () => {
    // Resource entry on an open connection: marks collapsed on fetchStart, relative to startTime
    const wf = W.waterfall({
        startTime: 300, fetchStart: 300, domainLookupStart: 300, domainLookupEnd: 300,
        connectStart: 300, secureConnectionStart: 300, connectEnd: 300,
        requestStart: 301, responseStart: 331, responseEnd: 333, nextHopProtocol: 'h2', transferSize: 900, decodedBodySize: 700,
    });
    assert.equal(wf.reused, true);
    const p = byId(wf);
    assert.deepEqual([p.dns.state, p.tcp.state, p.tls.state], ['reused', 'reused', 'reused']);
    assert.equal(p.wait.state, 'measured');
    assert.deepEqual([p.wait.start, p.wait.duration], [1, 30]);
    assert.equal(wf.total, 33);
    assert.ok(!('dom' in p), 'a resource has no parsing phase');
});

test('reuse is also detected when the browser reports secureConnectionStart as 0', () => {
    const wf = W.waterfall({ startTime: 0, fetchStart: 4, domainLookupStart: 4, domainLookupEnd: 4, connectStart: 4, connectEnd: 4, secureConnectionStart: 0, requestStart: 5, responseStart: 20, responseEnd: 21 });
    assert.equal(byId(wf).tls.state, 'reused');
});

test('plain HTTP has no TLS phase to measure', () => {
    const wf = W.waterfall({ ...fresh, secureConnectionStart: 0 });
    const p = byId(wf);
    assert.equal(p.tls.state, 'none');
    assert.equal(p.tls.duration, 0);
    assert.deepEqual([p.tcp.start, p.tcp.duration], [25, 55]);
});

test('a connect faster than the timer resolution is not mistaken for a reused connection', () => {
    const wf = W.waterfall({ startTime: 0, fetchStart: 2, domainLookupStart: 3, domainLookupEnd: 3, connectStart: 3, connectEnd: 3, secureConnectionStart: 0, requestStart: 4, responseStart: 9, responseEnd: 10 }, { https: false });
    assert.equal(wf.reused, false);
    assert.deepEqual(byId(wf).tcp, { id: 'tcp', start: 3, duration: 0, state: 'measured' });
});

test('on a page known to be plain HTTP, a reused connection has no TLS to skip', () => {
    const wf = W.waterfall({ startTime: 0, fetchStart: 4, domainLookupStart: 4, domainLookupEnd: 4, connectStart: 4, connectEnd: 4, secureConnectionStart: 0, requestStart: 5, responseStart: 20, responseEnd: 21 }, { https: false });
    assert.deepEqual([byId(wf).dns.state, byId(wf).tcp.state, byId(wf).tls.state], ['reused', 'reused', 'none']);
});

test('a redirect adds a leading phase, a cache hit is flagged', () => {
    const wf = W.waterfall({ ...fresh, redirectStart: 1, redirectEnd: 4, transferSize: 0 });
    assert.equal(wf.phases[0].id, 'redirect');
    assert.equal(wf.phases[0].duration, 3);
    assert.equal(wf.cached, true);
});

test('missing or inconsistent marks never yield negative durations', () => {
    const wf = W.waterfall({ startTime: 10, domainLookupStart: 0, domainLookupEnd: 0, connectStart: 0, connectEnd: 0, requestStart: 30, responseStart: 20, responseEnd: 25 });
    assert.ok(wf.phases.every(p => p.duration >= 0 && p.start >= 0));
    assert.ok(wf.total >= 0);
});

test('durations keep one decimal', () => {
    const wf = W.waterfall({ ...fresh, domainLookupStart: 5.04, domainLookupEnd: 6.789 });
    assert.equal(byId(wf).dns.duration, 1.7);
});

test('HTTP/3 is carried by QUIC, everything else by TCP', () => {
    assert.equal(W.transport('h3'), 'quic');
    assert.equal(W.transport('h3-29'), 'quic');
    assert.equal(W.transport('h2'), 'tcp');
    assert.equal(W.transport('http/1.1'), 'tcp');
    assert.equal(W.transport(''), 'tcp');
});

test('compression is reported only when the sizes say something', () => {
    assert.deepEqual(W.compression(fresh), { encoded: 5000, decoded: 20000, ratio: 75 });
    assert.equal(W.compression({ encodedBodySize: 0, decodedBodySize: 0 }), null);
    assert.equal(W.compression({ encodedBodySize: 800, decodedBodySize: 800 }), null);
    assert.equal(W.compression({}), null);
});

test('TLS 1.3 suites decode into cipher, mode and hash', () => {
    assert.deepEqual(W.decodeCipher('TLS_AES_128_GCM_SHA256'),
        [{ token: 'AES_128', role: 'cipher' }, { token: 'GCM', role: 'mode' }, { token: 'SHA256', role: 'hash' }]);
    assert.deepEqual(W.decodeCipher('TLS_AES_256_GCM_SHA384').map(p => p.token), ['AES_256', 'GCM', 'SHA384']);
    assert.deepEqual(W.decodeCipher('TLS_CHACHA20_POLY1305_SHA256').map(p => p.token), ['CHACHA20', 'POLY1305', 'SHA256']);
});

test('TLS 1.2 suites also name key exchange and authentication', () => {
    assert.deepEqual(W.decodeCipher('TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256').map(p => `${p.role}:${p.token}`),
        ['kx:ECDHE', 'auth:ECDSA', 'cipher:AES_128', 'mode:GCM', 'hash:SHA256']);
    assert.deepEqual(W.decodeCipher('TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256').map(p => p.token),
        ['ECDHE', 'RSA', 'CHACHA20', 'POLY1305', 'SHA256']);
    assert.deepEqual(W.decodeCipher('TLS_RSA_WITH_AES_256_CBC_SHA').map(p => `${p.role}:${p.token}`),
        ['kx:RSA', 'cipher:AES_256', 'mode:CBC', 'hash:SHA']);
});

test('unknown or malformed suites decode to nothing', () => {
    for (const name of ['', 'AES_128_GCM_SHA256', 'TLS_FOO_BAR', 'TLS_ECDHE_FOO_WITH_AES_128_GCM_SHA256', 'TLS_AES_512_GCM_SHA256', 'TLS_AES_128_GCM_MD5', null, undefined, 42]) {
        assert.deepEqual(W.decodeCipher(name), [], String(name));
    }
});

test('every token the decoder can emit has an explanation in both languages', () => {
    const suites = [
        'TLS_AES_128_GCM_SHA256', 'TLS_AES_256_GCM_SHA384', 'TLS_CHACHA20_POLY1305_SHA256', 'TLS_AES_128_CCM_SHA256',
        'TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256', 'TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384', 'TLS_DHE_RSA_WITH_AES_128_GCM_SHA256',
        'TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256', 'TLS_RSA_WITH_AES_128_CBC_SHA',
    ];
    for (const lang of ['en', 'fr']) {
        for (const suite of suites) {
            const parts = W.decodeCipher(suite);
            assert.ok(parts.length, suite);
            for (const p of parts) {
                assert.ok(translations[lang].cipher.roles[p.role], `${lang}: role ${p.role}`);
                assert.ok(translations[lang].cipher.tokens[p.role]?.[p.token], `${lang}: ${p.role}.${p.token}`);
            }
        }
    }
});

test('tlsVersion reads the Caddy placeholder format', () => {
    assert.equal(W.tlsVersion('tls1.3'), '1.3');
    assert.equal(W.tlsVersion('tls1.2'), '1.2');
    assert.equal(W.tlsVersion(''), '');
    assert.equal(W.tlsVersion(undefined), '');
    assert.equal(W.tlsVersion('ssl3'), '');
});

const visible = (rows) => rows.filter(r => r.visible).map(r => r.id);
const hidden = (rows) => rows.filter(r => !r.visible).map(r => r.id);

test('TLS 1.3: addressing and SNI stay readable, everything else is encrypted', () => {
    const rows = W.observer({ ip: '203.0.113.7', tls: 'tls1.3', sni: 'yatoub.dev', alpn: 'h2' });
    assert.deepEqual(visible(rows), ['ip', 'dest', 'dns', 'sni', 'volume', 'alpn']);
    assert.deepEqual(hidden(rows), ['cert', 'path', 'headers', 'cookies', 'body']);
    assert.equal(rows.find(r => r.id === 'ip').value, '203.0.113.7');
    assert.equal(rows.find(r => r.id === 'sni').value, 'yatoub.dev');
    assert.equal(rows.find(r => r.id === 'alpn').value, 'h2');
});

test('TLS 1.2 still shows the certificate', () => {
    const rows = W.observer({ tls: 'tls1.2' });
    assert.ok(visible(rows).includes('cert'));
    assert.deepEqual(hidden(rows), ['path', 'headers', 'cookies', 'body']);
});

test('without TLS, or without a server view, nothing is claimed to be encrypted', () => {
    assert.deepEqual(hidden(W.observer({ ip: '203.0.113.7', tls: '' })), []);
    assert.deepEqual(hidden(W.observer({})), []);
    assert.deepEqual(hidden(W.observer()), []);
    assert.ok(W.observer().every(r => r.value === ''));
});

test('every phase and observer row has its strings in both languages', () => {
    for (const lang of ['en', 'fr']) {
        for (const id of ['redirect', 'dns', 'tcp', 'quic', 'tls', 'wait', 'download', 'dom']) {
            assert.ok(translations[lang].phase[id]?.name && translations[lang].phase[id]?.explain, `${lang}: phase.${id}`);
        }
        for (const { id } of W.observer()) {
            assert.ok(translations[lang].obs.rows[id]?.name && translations[lang].obs.rows[id]?.why, `${lang}: obs.rows.${id}`);
        }
    }
});

test('both languages expose the same keys', () => {
    const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    assert.deepEqual(keys(translations.en).sort(), keys(translations.fr).sort());
});

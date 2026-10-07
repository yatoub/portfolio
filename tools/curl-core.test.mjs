// node --test tools/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const C = require('../curl/core.js');
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const translations = new Function(`${read('curl/translations.js')}; return translations;`)();

// What yatoub.dev answered on 2026-10-07, before any hardening
const bare = { 'accept-ranges': 'bytes', 'alt-svc': 'h3=":443"; ma=2592000', 'content-type': 'text/html; charset=utf-8', etag: '"dlytk6put7eeo5a"', server: 'Caddy', vary: 'Accept-Encoding', 'x-flag': 'YATOUB{secret}', 'content-length': '31294' };
const hardened = {
    ...bare,
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=()',
};
const state = (headers) => Object.fromEntries(C.audit(headers).map(v => [v.id, v.state]));

test('the flag header is never echoed, whatever its case', () => {
    assert.equal(C.redact('x-flag', 'YATOUB{secret}'), '[…]');
    assert.equal(C.redact('X-Flag', 'YATOUB{secret}'), '[…]');
    assert.equal(C.redact('server', 'Caddy'), 'Caddy');
    assert.equal(C.kind('X-Flag'), 'redacted');
    const out = C.output('HTTP/2', 200, bare);
    assert.doesNotMatch(out, /YATOUB|secret/);
    assert.match(out, /^HTTP\/2 200\n/);
    assert.match(out, /\nx-flag: \[…\]/);
    assert.ok(C.REDACTED.includes('x-flag'));
});

test('headers are read from a Headers object, entries or a plain object, case-insensitively', () => {
    const expected = [['content-type', 'text/html'], ['server', 'Caddy']];
    assert.deepEqual([...C.toMap(new Headers({ 'Content-Type': 'text/html', Server: 'Caddy' }))], expected);
    assert.deepEqual([...C.toMap([['Content-Type', 'text/html'], ['SERVER', 'Caddy']])], expected);
    assert.deepEqual([...C.toMap({ 'Content-Type': 'text/html', Server: 'Caddy' })], expected);
    assert.deepEqual([...C.toMap(undefined)], []);
});

test('a bare server fails the whole audit', () => {
    const verdicts = C.audit(bare);
    assert.deepEqual(verdicts.map(v => v.id), C.SECURITY.map(h => h.id));
    assert.ok(verdicts.every(v => v.state === 'missing' && v.value === null && v.fix));
    assert.deepEqual(C.score(verdicts), { ok: 0, total: 6 });
});

test('a hardened server passes, frame-ancestors standing in for X-Frame-Options', () => {
    const verdicts = C.audit(hardened);
    assert.deepEqual(C.score(verdicts), { ok: 6, total: 6 });
    assert.equal(verdicts.find(v => v.id === 'x-frame-options').value, "frame-ancestors 'none'");
    assert.equal(state({ ...bare, 'x-frame-options': 'DENY' })['x-frame-options'], 'ok');
});

test('present but ineffective values are weak, with a reason', () => {
    const weak = (headers, id) => C.audit(headers).find(v => v.id === id);
    assert.deepEqual([weak({ 'strict-transport-security': 'max-age=300' }, 'strict-transport-security').state, weak({ 'strict-transport-security': 'max-age=300' }, 'strict-transport-security').reason], ['weak', 'hstsShort']);
    assert.equal(weak({ 'strict-transport-security': 'includeSubDomains' }, 'strict-transport-security').state, 'weak');
    assert.equal(weak({ 'strict-transport-security': 'max-age=15552000' }, 'strict-transport-security').state, 'ok');
    assert.equal(weak({ 'x-content-type-options': 'sniff' }, 'x-content-type-options').reason, 'nosniff');
    assert.equal(weak({ 'referrer-policy': 'unsafe-url' }, 'referrer-policy').reason, 'referrer');
    const ro = weak({ 'content-security-policy-report-only': "default-src 'self'" }, 'content-security-policy');
    assert.deepEqual([ro.state, ro.reason, ro.value], ['weak', 'cspReportOnly', "default-src 'self'"]);
    for (const lang of ['en', 'fr']) for (const r of ['hstsShort', 'cspReportOnly', 'nosniff', 'referrer']) assert.ok(translations[lang].reason[r], `${lang}: ${r}`);
});

test('HSTS is parsed into duration and flags', () => {
    assert.deepEqual(C.parseHsts('max-age=31536000; includeSubDomains; preload'), { maxAge: 31536000, includeSubDomains: true, preload: true });
    assert.deepEqual(C.parseHsts('MAX-AGE="600"'), { maxAge: 600, includeSubDomains: false, preload: false });
    assert.deepEqual(C.parseHsts(''), { maxAge: null, includeSubDomains: false, preload: false });
    assert.deepEqual(C.parseHsts(undefined), { maxAge: null, includeSubDomains: false, preload: false });
});

test('stack-describing headers are leaks, worse with a version', () => {
    assert.deepEqual(C.leaks(bare), [{ name: 'server', value: 'Caddy', version: false }]);
    assert.deepEqual(C.leaks({ Server: 'nginx/1.18.0', 'X-Powered-By': 'PHP/7.4.3' }), [
        { name: 'server', value: 'nginx/1.18.0', version: true },
        { name: 'x-powered-by', value: 'PHP/7.4.3', version: true },
    ]);
    assert.deepEqual(C.leaks(hardened).map(l => l.name), ['server']);
    assert.deepEqual(C.leaks({}), []);
});

test('headers are sorted into kinds', () => {
    assert.equal(C.kind('Strict-Transport-Security'), 'security');
    assert.equal(C.kind('content-security-policy-report-only'), 'security');
    assert.equal(C.kind('Server'), 'leak');
    assert.equal(C.kind('etag'), 'info');
    assert.equal(C.kind('constructor'), 'info');
});

test('protocol and duration read naturally', () => {
    assert.equal(C.protocolName('h2'), 'HTTP/2');
    assert.equal(C.protocolName('h3'), 'HTTP/3');
    assert.equal(C.protocolName('http/1.1'), 'HTTP/1.1');
    assert.equal(C.protocolName(undefined), 'HTTP/1.1');
    assert.deepEqual(C.duration(31536000), { n: 1, unit: 'year' });
    assert.deepEqual(C.duration(63072000), { n: 2, unit: 'year' });
    assert.deepEqual(C.duration(15552000), { n: 180, unit: 'day' });
    assert.deepEqual(C.duration(7200), { n: 2, unit: 'hour' });
    assert.deepEqual(C.duration(300), { n: 300, unit: 'second' });
    assert.equal(C.duration(null), null);
});

test('every audited header is explained in both languages, and every fix is a Caddy header directive', () => {
    for (const { id, fix } of C.SECURITY) {
        assert.match(fix, /^header [A-Z][A-Za-z-]+ "/, id);
        assert.ok(fix.toLowerCase().includes(id), id);
        for (const lang of ['en', 'fr']) assert.ok(translations[lang].sec[id]?.name && translations[lang].sec[id]?.protects, `${lang}: ${id}`);
    }
    // Applying every fix must pass the audit
    const fixed = Object.fromEntries(C.SECURITY.map(({ id, fix }) => [id, fix.match(/"(.*)"$/)[1]]));
    assert.deepEqual(C.score(C.audit(fixed)), { ok: 6, total: 6 });
});

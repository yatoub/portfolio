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

// The policy of yatoub.dev. font-src data: is for the icon font embedded in Swiper's stylesheet,
// which is served from /assets/vendor/swiper/ since 2026-10-10: no CDN is allowed anymore.
const prodCsp = "default-src 'self'; script-src 'self' 'unsafe-inline' https://matomo.yatoub.dev; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://matomo.yatoub.dev; font-src 'self' data:; connect-src 'self' https://matomo.yatoub.dev https://ipwho.is https://ipapi.co https://api.ipify.org https://cloudflare-dns.com https://dns.google; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

test('a policy is split into directives and their sources', () => {
    const d = C.parseCsp(prodCsp);
    assert.deepEqual(d.map(x => x.name), ['default-src', 'script-src', 'style-src', 'img-src', 'font-src', 'connect-src', 'frame-ancestors', 'base-uri', 'form-action']);
    assert.deepEqual(d[0].sources, ["'self'"]);
    assert.deepEqual(d[3].sources, ["'self'", 'data:', 'https://matomo.yatoub.dev']);
    assert.deepEqual(C.parseCsp("  Default-Src   'self' ;; upgrade-insecure-requests ; "), [{ name: 'default-src', sources: ["'self'"] }, { name: 'upgrade-insecure-requests', sources: [] }]);
    assert.deepEqual(C.parseCsp("script-src 'self'; script-src *").map(x => x.sources), [["'self'"]], 'the first occurrence wins, as in browsers');
    for (const junk of ['', undefined, null, ';;;', '<img> x']) assert.deepEqual(C.parseCsp(junk), [], String(junk));
});

test('sources are recognised by what they allow', () => {
    const kind = s => C.cspSource(s).kind;
    assert.equal(kind("'self'"), 'self');
    assert.equal(kind("'none'"), 'none');
    assert.equal(kind("'unsafe-inline'"), 'unsafe-inline');
    assert.equal(kind("'UNSAFE-EVAL'"), 'unsafe-eval');
    assert.equal(kind("'nonce-r4nd0m'"), 'nonce');
    assert.equal(kind("'sha256-abc='"), 'hash');
    assert.equal(kind('data:'), 'scheme');
    assert.equal(kind('https:'), 'scheme');
    assert.equal(kind('*'), 'wildcard');
    assert.deepEqual(C.cspSource('https://matomo.yatoub.dev'), { kind: 'host', host: 'matomo.yatoub.dev', why: 'matomo' });
    assert.deepEqual(C.cspSource('https://cdn.jsdelivr.net'), { kind: 'host', host: 'cdn.jsdelivr.net', why: null }, 'a host the site no longer uses gets no reason');
    assert.deepEqual(C.cspSource('https://DNS.google/resolve'), { kind: 'host', host: 'dns.google', why: 'doh' });
    assert.deepEqual(C.cspSource('example.org:8443'), { kind: 'host', host: 'example.org', why: null });
    assert.equal(C.cspSource('constructor').why, null);
});

test('every source of the production policy is explained in both languages', () => {
    for (const lang of ['en', 'fr']) {
        const tr = translations[lang].csp;
        for (const d of C.parseCsp(prodCsp)) {
            assert.ok(tr.directives[d.name], `${lang}: directive ${d.name}`);
            for (const s of d.sources) {
                const { kind, why } = C.cspSource(s);
                if (kind === 'host') assert.ok(why && tr.why[why], `${lang}: host ${s}`);
                else assert.ok(tr.sources[kind], `${lang}: source ${s}`);
            }
        }
        for (const id of new Set(Object.values(C.CSP_HOSTS))) assert.ok(tr.why[id], `${lang}: why.${id}`);
        for (const id of ['noDefault', 'unsafeInlineScript', 'unsafeEval', 'unsafeInlineStyle', 'wildcard']) assert.ok(tr.warn[id], `${lang}: warn.${id}`);
    }
});

test('what weakens a policy is reported', () => {
    const warn = v => C.cspWarnings(C.parseCsp(v));
    assert.deepEqual(warn(prodCsp), ['unsafeInlineScript', 'unsafeInlineStyle']);
    assert.deepEqual(warn("default-src 'self'; frame-ancestors 'none'"), []);
    assert.deepEqual(warn("script-src 'self'"), ['noDefault']);
    // Without script-src, default-src decides for scripts too
    assert.deepEqual(warn("default-src 'self' 'unsafe-inline'"), ['unsafeInlineScript', 'unsafeInlineStyle']);
    // A nonce makes browsers ignore 'unsafe-inline' for scripts
    assert.deepEqual(warn("default-src 'self'; script-src 'nonce-abc' 'unsafe-inline'"), []);
    assert.deepEqual(warn("default-src 'self'; script-src 'self' 'unsafe-eval'; img-src *"), ['unsafeEval', 'wildcard']);
    assert.deepEqual(warn(''), []);
});

test('the policy is read from the enforcing header first, then from report-only', () => {
    assert.deepEqual(C.cspOf({ 'Content-Security-Policy': 'a', 'Content-Security-Policy-Report-Only': 'b' }), { value: 'a', reportOnly: false });
    assert.deepEqual(C.cspOf({ 'content-security-policy-report-only': 'b' }), { value: 'b', reportOnly: true });
    assert.equal(C.cspOf(bare), null);
});

test('with the production policy enforced, the audit is complete', () => {
    const verdicts = C.audit({ ...hardened, 'Content-Security-Policy': prodCsp });
    assert.deepEqual(C.score(verdicts), { ok: 6, total: 6 });
    assert.equal(verdicts.find(v => v.id === 'x-frame-options').state, 'ok');
});

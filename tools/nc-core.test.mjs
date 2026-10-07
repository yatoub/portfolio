// node --test tools/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const N = require('../nc/core.js');
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const translations = new Function(`${read('nc/translations.js')}; return translations;`)();
const parse = (text) => N.parse(text, 'yatoub.dev');

test('a well-formed request is parsed into method, path, version and headers', () => {
    const r = parse('GET /robots.txt HTTP/1.1\nHost: yatoub.dev\nRange: bytes=0-99\n\n');
    assert.equal(r.ok, true);
    assert.deepEqual([r.method, r.path, r.version], ['GET', '/robots.txt', 'HTTP/1.1']);
    assert.deepEqual(r.headers, [{ name: 'Host', value: 'yatoub.dev', sent: false }, { name: 'Range', value: 'bytes=0-99', sent: true }]);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.notes, []);
});

test('leading blank lines, CRLF and lowercase methods are tolerated', () => {
    const r = parse('\r\n\r\nhead /  HTTP/1.1\r\nHost: yatoub.dev\r\n\r\n');
    assert.deepEqual([r.ok, r.method, r.path], [true, 'HEAD', '/']);
});

test('the path can never leave this origin', () => {
    for (const path of ['//evil.example/x', '/\\evil.example', 'https://evil.example/', 'http://yatoub.dev/', 'javascript:alert(1)', 'robots.txt', '', '/a b', `/${'a'.repeat(250)}`, '/é']) {
        const r = parse(`GET ${path} HTTP/1.1\nHost: yatoub.dev\n`);
        assert.equal(r.ok, false, path);
        assert.equal(N.toFetch(r), null, path);
    }
    for (const path of ['/', '/robots.txt', '/a/b/c.json?x=1&y=2', '/.well-known/security.txt', '/%2e%2e/x']) assert.equal(N.validPath(path), true, path);
    // Every valid path resolves on the page's own origin
    for (const path of ['/', '/a//b', '/..//evil.example', '/@evil.example', '/:80']) {
        if (N.validPath(path)) assert.equal(new URL(path, 'https://yatoub.dev').origin, 'https://yatoub.dev', path);
    }
});

test('errors name what is wrong with the request', () => {
    assert.deepEqual(parse('').errors, ['empty']);
    assert.deepEqual(parse('GET').errors, ['requestLine']);
    assert.deepEqual(parse('FETCH / HTTP/1.1').errors, ['unknownMethod']);
    assert.deepEqual(parse('TRACE / HTTP/1.1').errors, ['refusedMethod']);
    assert.deepEqual(parse('GET https://yatoub.dev/ HTTP/1.1').errors, ['absoluteUrl']);
    assert.deepEqual(parse('GET / HTTP/9').errors, ['version']);
    assert.deepEqual(parse('GET / HTTP/1.1\nHost yatoub.dev\nbroken line').errors, ['header']);
    for (const lang of ['en', 'fr']) for (const id of ['empty', 'requestLine', 'unknownMethod', 'refusedMethod', 'absoluteUrl', 'path', 'version', 'header']) assert.ok(translations[lang].err[id], `${lang}: err.${id}`);
});

test('notes explain what the browser does differently from netcat', () => {
    assert.deepEqual(parse('GET /').notes, ['noVersion']);
    assert.deepEqual(parse('GET / HTTP/1.1').notes, ['noHost']);
    assert.deepEqual(parse('GET / HTTP/1.1\nHost: example.org').notes, ['hostMismatch']);
    assert.deepEqual(parse('GET / HTTP/1.1\nHost: yatoub.dev\nUser-Agent: nc\nCookie: a=b').notes, ['managed']);
    assert.equal(parse('GET / HTTP/1.1\nHost: YATOUB.dev').notes.length, 0);
    for (const lang of ['en', 'fr']) for (const id of ['noVersion', 'noHost', 'hostMismatch', 'managed']) assert.ok(translations[lang].note[id], `${lang}: note.${id}`);
});

test('headers the browser controls are never handed to fetch', () => {
    const r = parse('GET / HTTP/1.1\nHost: evil.example\nUser-Agent: x\nCookie: a=b\nSec-Fetch-Site: none\nProxy-Authorization: x\nAccept-Encoding: br\nIf-None-Match: "abc"\nX-Custom: 1');
    const { path, init } = N.toFetch(r);
    assert.equal(path, '/');
    assert.deepEqual(init.headers, [['If-None-Match', '"abc"'], ['X-Custom', '1']]);
    assert.deepEqual([init.method, init.redirect, init.credentials, init.mode, init.cache], ['GET', 'manual', 'omit', 'same-origin', 'no-store']);
});

test('a response prints as a status line, headers, a blank line and a clipped body', () => {
    const text = N.format({ protocol: 'HTTP/2', status: 200, headers: [['Content-Type', 'text/plain'], ['X-Flag', 'YATOUB{secret}']], body: 'User-agent: *\nAllow: /\n', bytes: 23, redirected: false });
    assert.equal(text, 'HTTP/2 200 OK\ncontent-type: text/plain\nx-flag: […]\n\nUser-agent: *\nAllow: /\n');
    assert.doesNotMatch(text, /secret/);

    const long = N.format({ protocol: 'HTTP/2', status: 200, headers: [], body: 'x'.repeat(5000), bytes: 5000, redirected: false });
    assert.ok(long.length < 700 && long.endsWith('[…]'));
    const tall = N.format({ protocol: 'HTTP/2', status: 200, headers: [], body: Array(40).fill('line').join('\n'), bytes: 199, redirected: false });
    assert.equal(tall.split('\n').length, 2 + 14 + 1);
});

test('binary bodies are counted, not printed ; empty ones print nothing ; redirects are left to the caller', () => {
    assert.match(N.format({ protocol: 'HTTP/2', status: 200, headers: [], body: null, bytes: 5120, redirected: false }), /\n\n\[5120 bytes\]$/);
    assert.equal(N.format({ protocol: 'HTTP/2', status: 304, headers: [['etag', '"a"']], body: '', bytes: 0, redirected: false }), 'HTTP/2 304 Not Modified\netag: "a"\n');
    assert.equal(N.format({ redirected: true }), null);
    assert.equal(N.textual('text/html; charset=utf-8'), true);
    assert.equal(N.textual('application/json'), true);
    assert.equal(N.textual('image/svg+xml'), true);
    assert.equal(N.textual('image/png'), false);
    assert.equal(N.textual(null), false);
});

test('each challenge is passed by the exchange it describes, and only by it', () => {
    const ex = (text, status) => N.passed(parse(text), { status, redirected: false });
    assert.deepEqual(ex('GET /robots.txt HTTP/1.1\nHost: yatoub.dev', 200), ['ok']);
    assert.deepEqual(ex('GET /nope HTTP/1.1\nHost: yatoub.dev', 404), ['notfound']);
    assert.deepEqual(ex('HEAD / HTTP/1.1\nHost: yatoub.dev', 200), ['head']);
    assert.deepEqual(ex('GET /robots.txt HTTP/1.1\nHost: yatoub.dev\nRange: bytes=0-99', 206), ['range']);
    assert.deepEqual(ex('GET /robots.txt HTTP/1.1\nHost: yatoub.dev\nIf-None-Match: "x"', 304), ['cached']);
    assert.deepEqual(ex('POST /robots.txt HTTP/1.1\nHost: yatoub.dev', 405), ['method']);
    assert.deepEqual(ex('GET / HTTP/1.1\nHost: yatoub.dev', 500), []);
    assert.deepEqual(N.passed(parse('GET //x HTTP/1.1'), { status: 200 }), [], 'an invalid request passes nothing');
    assert.deepEqual(N.passed(parse('GET / HTTP/1.1'), { redirected: true }), []);
    assert.deepEqual(N.passed(parse('GET / HTTP/1.1'), null), []);
});

test('progress keeps known ids only, in order', () => {
    assert.deepEqual(N.parseProgress('["cached","ok","nope","ok"]'), ['ok', 'cached']);
    assert.deepEqual(N.parseProgress('garbage'), []);
    assert.deepEqual(N.parseProgress(null), []);
    assert.equal(N.serializeProgress(['method', 'x', 'ok']), '["ok","method"]');
});

test('every challenge has its strings in both languages, and the flag header stays redacted', () => {
    for (const lang of ['en', 'fr']) for (const { id } of N.CHALLENGES) {
        const c = translations[lang].ch[id];
        assert.ok(c?.name && c?.goal && c?.hint && c?.why, `${lang}: ch.${id}`);
    }
    assert.ok(N.REDACTED.includes('x-flag'));
});

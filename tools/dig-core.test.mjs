// node --test tools/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const D = require('../dig/core.js');
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const translations = new Function(`${read('dig/translations.js')}; return translations;`)();

// Real answers, as returned by the two resolvers
const cloudflareNs = { Status: 0, TC: false, RD: true, RA: true, AD: true, CD: false, Question: [{ name: 'yatoub.dev', type: 2 }], Answer: [{ name: 'yatoub.dev', type: 2, TTL: 3600, data: 'ns11.infomaniak.ch.' }, { name: 'yatoub.dev', type: 2, TTL: 3600, data: 'ns12.infomaniak.ch.' }] };
const googleNodata = { Status: 0, TC: false, RD: true, RA: true, AD: true, CD: false, Question: [{ name: 'nope-zz.yatoub.dev.', type: 16 }], Authority: [{ name: 'yatoub.dev.', type: 6, TTL: 1800, data: 'ns11.infomaniak.ch. hostmaster.infomaniak.ch. 2026100703 10800 3600 605800 3600' }] };

test('names are confined to the zone', () => {
    assert.equal(D.fqdn('www'), 'www.yatoub.dev');
    assert.equal(D.fqdn('  WWW.Yatoub.Dev. '), 'www.yatoub.dev');
    assert.equal(D.fqdn(''), 'yatoub.dev');
    assert.equal(D.fqdn('@'), 'yatoub.dev');
    assert.equal(D.fqdn('yatoub.dev'), 'yatoub.dev');
    assert.equal(D.fqdn('_dmarc'), '_dmarc.yatoub.dev');
    assert.equal(D.fqdn('a.b.c'), 'a.b.c.yatoub.dev');
    // A name of another zone becomes a label path inside this one: it can never leave it
    assert.equal(D.fqdn('example.com'), 'example.com.yatoub.dev');
    assert.equal(D.fqdn('evilyatoub.dev'), 'evilyatoub.dev.yatoub.dev');
});

test('malformed names are refused', () => {
    for (const bad of ['a b', 'a..b', '-a', 'a-', 'a/b', 'a?x=1', 'é', 'a&type=ANY', '<script>', 'x'.repeat(64), `${'a.'.repeat(130)}b`]) {
        assert.equal(D.fqdn(bad), null, bad);
    }
});

test('query URLs carry an encoded name and a known type only', () => {
    const [cf, google] = D.RESOLVERS;
    assert.equal(D.url(cf, 'yatoub.dev', 'TXT'), 'https://cloudflare-dns.com/dns-query?name=yatoub.dev&type=TXT');
    assert.equal(D.url(google, '_dmarc.yatoub.dev', 'TXT'), 'https://dns.google/resolve?name=_dmarc.yatoub.dev&type=TXT');
    assert.equal(D.url(cf, 'yatoub.dev', 'ANY'), null);
    assert.equal(D.url(cf, 'yatoub.dev', 'constructor'), null);
    for (const q of D.QUERIES) assert.ok(D.url(cf, q.name, q.type), q.id);
});

test('an answer is normalised: bare names, type names, TTL', () => {
    const r = D.parse(cloudflareNs, 'NS');
    assert.equal(r.rcode, 'NOERROR');
    assert.equal(r.kind, 'answer');
    assert.equal(r.ad, true);
    assert.deepEqual(r.answers, [
        { name: 'yatoub.dev', ttl: 3600, type: 'NS', data: 'ns11.infomaniak.ch.' },
        { name: 'yatoub.dev', ttl: 3600, type: 'NS', data: 'ns12.infomaniak.ch.' },
    ]);
});

test('NOERROR without an answer is nodata, NXDOMAIN is its own case', () => {
    assert.equal(D.parse(googleNodata, 'TXT').kind, 'nodata');
    assert.equal(D.parse(googleNodata, 'TXT').rcode, 'NOERROR');
    assert.deepEqual(D.parse({ Status: 3 }, 'A'), { rcode: 'NXDOMAIN', kind: 'nxdomain', ad: false, answers: [] });
    assert.equal(D.parse({ Status: 2 }, 'A').kind, 'error');
    assert.equal(D.parse({ Status: 9 }, 'A').rcode, 'RCODE9');
    for (const junk of [null, undefined, {}, 'x', { Status: 'ok' }]) assert.equal(D.parse(junk, 'A').kind, 'error');
});

test('a CNAME on the way is kept, records of another type are dropped', () => {
    const r = D.parse({ Status: 0, Answer: [{ name: 'www.yatoub.dev.', type: 5, TTL: 60, data: 'yatoub.dev.' }, { name: 'yatoub.dev.', type: 1, TTL: 60, data: '203.0.113.7' }, { name: 'yatoub.dev.', type: 46, TTL: 60, data: 'sig' }, { name: 'x', type: 1 }] }, 'A');
    assert.deepEqual(r.answers.map(a => a.type), ['CNAME', 'A']);
    assert.equal(r.answers[0].name, 'www.yatoub.dev');
});

test('TXT data reads the same whether quoted, bare or split', () => {
    assert.equal(D.unquote('"v=spf1 include:spf.infomaniak.ch -all"'), 'v=spf1 include:spf.infomaniak.ch -all');
    assert.equal(D.unquote('v=spf1 include:spf.infomaniak.ch -all'), 'v=spf1 include:spf.infomaniak.ch -all');
    assert.equal(D.unquote('"part one " "part two"'), 'part one part two');
    assert.equal(D.unquote('"a \\"quoted\\" word"'), 'a "quoted" word');
    const quoted = D.parse({ Status: 0, Answer: [{ name: 'yatoub.dev', type: 16, TTL: 300, data: '"v=DMARC1; p=reject;"' }] }, 'TXT');
    const bare = D.parse({ Status: 0, Answer: [{ name: 'yatoub.dev.', type: 16, TTL: 120, data: 'v=DMARC1; p=reject;' }] }, 'TXT');
    assert.equal(quoted.answers[0].data, bare.answers[0].data);
});

test('two resolvers agree on data whatever their TTL and order', () => {
    const a = D.parse(cloudflareNs, 'NS');
    const b = D.parse({ ...cloudflareNs, Answer: [...cloudflareNs.Answer].reverse().map(x => ({ ...x, TTL: 12, name: 'yatoub.dev.' })) }, 'NS');
    assert.equal(D.agree(a, b), true);
    const c = D.parse({ ...cloudflareNs, Answer: cloudflareNs.Answer.slice(0, 1) }, 'NS');
    assert.equal(D.agree(a, c), false);
    assert.equal(D.agree(a, D.parse(googleNodata, 'NS')), false);
    assert.equal(D.agree(D.parse(googleNodata, 'TXT'), D.parse({ Status: 0 }, 'TXT')), true);
});

test('TXT records are recognised by what they are for', () => {
    assert.equal(D.txtKind('v=spf1 include:spf.infomaniak.ch -all'), 'spf');
    assert.equal(D.txtKind('v=DMARC1; p=reject;'), 'dmarc');
    assert.equal(D.txtKind('v=DKIM1; k=rsa; p=MIIB'), 'dkim');
    assert.equal(D.txtKind('google-site-verification=abc123'), 'verification');
    assert.equal(D.txtKind('MS=ms12345678'), 'verification');
    assert.equal(D.txtKind('hello world'), 'other');
    for (const lang of ['en', 'fr']) for (const kind of ['spf', 'dmarc', 'dkim', 'verification', 'other']) assert.ok(translations[lang].txt[kind], `${lang}: ${kind}`);
});

test('TTL is shown in the largest exact unit', () => {
    assert.deepEqual(D.ttl(3600), { n: 1, unit: 'h' });
    assert.deepEqual(D.ttl(300), { n: 5, unit: 'min' });
    assert.deepEqual(D.ttl(86400), { n: 1, unit: 'd' });
    assert.deepEqual(D.ttl(90), { n: 90, unit: 's' });
    assert.deepEqual(D.ttl(0), { n: 0, unit: 's' });
    assert.equal(D.ttl(null), null);
    assert.equal(D.ttl(-1), null);
});

test('an answer prints like a dig line', () => {
    assert.equal(D.line({ name: 'yatoub.dev', ttl: 3600, type: 'NS', data: 'ns11.infomaniak.ch.' }), 'yatoub.dev.\t3600\tIN\tNS\tns11.infomaniak.ch.');
    assert.equal(D.line({ name: 'yatoub.dev', ttl: 300, type: 'TXT', data: 'v=spf1 -all' }), 'yatoub.dev.\t300\tIN\tTXT\t"v=spf1 -all"');
});

test('every default query has its explanation in both languages, and none gives the trail away', () => {
    for (const lang of ['en', 'fr']) {
        for (const q of D.QUERIES) {
            const rec = translations[lang].rec[q.id];
            assert.ok(rec?.name && rec?.what && rec?.empty, `${lang}: rec.${q.id}`);
        }
    }
    assert.ok(!D.QUERIES.some(q => q.name.includes('_ctf')));
    assert.doesNotMatch(read('dig/translations.js') + read('dig/index.html'), /_ctf/);
});

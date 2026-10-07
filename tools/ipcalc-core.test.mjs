// node --test tools/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const I = require('../ipcalc/core.js');
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const translations = new Function(`${read('ipcalc/translations.js')}; return translations;`)();
const ip = I.parse;
const fmt = I.format;

test('addresses round-trip through their integer form, up to the last one', () => {
    for (const a of ['0.0.0.0', '10.1.2.3', '192.168.1.254', '203.0.113.7', '255.255.255.255']) assert.equal(fmt(ip(a)), a);
    assert.equal(ip('255.255.255.255'), 4294967295);
    assert.equal(ip('128.0.0.0'), 2147483648, 'the top bit must not turn the value negative');
    assert.equal(ip(' 192.0.2.1 '), ip('192.0.2.1'));
});

test('anything that is not a dotted quad is refused', () => {
    for (const bad of ['', '1.2.3', '1.2.3.4.5', '256.1.1.1', '1.2.3.-4', 'a.b.c.d', '1.2.3.4/24', '::1', '2001:db8::1', '1..2.3', null, undefined, '1234.1.1.1']) {
        assert.equal(ip(bad), null, String(bad));
    }
});

test('masks for every prefix length, including the two edges', () => {
    assert.equal(fmt(I.mask(0)), '0.0.0.0');
    assert.equal(fmt(I.mask(1)), '128.0.0.0');
    assert.equal(fmt(I.mask(8)), '255.0.0.0');
    assert.equal(fmt(I.mask(20)), '255.255.240.0');
    assert.equal(fmt(I.mask(24)), '255.255.255.0');
    assert.equal(fmt(I.mask(30)), '255.255.255.252');
    assert.equal(fmt(I.mask(32)), '255.255.255.255');
});

test('a /24 has 254 hosts between its network and broadcast addresses', () => {
    const n = I.subnet(ip('192.168.1.77'), 24);
    assert.deepEqual([fmt(n.network), fmt(n.broadcast), fmt(n.first), fmt(n.last)], ['192.168.1.0', '192.168.1.255', '192.168.1.1', '192.168.1.254']);
    assert.deepEqual([n.addresses, n.hosts], [256, 254]);
    assert.equal(fmt(n.wildcard), '0.0.0.255');
});

test('a cut inside an octet lands on the right block', () => {
    const n = I.subnet(ip('172.20.200.9'), 20);
    assert.deepEqual([fmt(n.network), fmt(n.broadcast)], ['172.20.192.0', '172.20.207.255']);
    assert.equal(n.hosts, 4094);
    const p = I.subnet(ip('203.0.113.77'), 26);
    assert.deepEqual([fmt(p.network), fmt(p.broadcast), p.hosts], ['203.0.113.64', '203.0.113.127', 62]);
});

test('the edges: /0 is everything, /31 and /32 set no address aside', () => {
    const all = I.subnet(ip('8.8.8.8'), 0);
    assert.deepEqual([fmt(all.network), fmt(all.broadcast), all.addresses], ['0.0.0.0', '255.255.255.255', 4294967296]);
    const link = I.subnet(ip('10.0.0.5'), 31);
    assert.deepEqual([fmt(link.first), fmt(link.last), link.hosts], ['10.0.0.4', '10.0.0.5', 2]);
    const one = I.subnet(ip('10.0.0.5'), 32);
    assert.deepEqual([fmt(one.network), fmt(one.first), fmt(one.last), one.hosts], ['10.0.0.5', '10.0.0.5', '10.0.0.5', 1]);
    const top = I.subnet(ip('255.255.255.255'), 30);
    assert.deepEqual([fmt(top.network), fmt(top.broadcast), fmt(top.last)], ['255.255.255.252', '255.255.255.255', '255.255.255.254']);
});

test('invalid input yields no subnet', () => {
    assert.equal(I.subnet(null, 24), null);
    for (const bad of [-1, 33, 24.5, NaN, '24', undefined]) assert.equal(I.subnet(ip('10.0.0.1'), bad), null, String(bad));
});

test('bits are split at the prefix, most significant first', () => {
    const b = I.bits(ip('192.168.1.1'), 24);
    assert.equal(b.length, 32);
    assert.equal(b.map(x => x.bit).join(''), '11000000101010000000000100000001');
    assert.equal(b.filter(x => x.part === 'network').length, 24);
    assert.equal(b[23].part, 'network');
    assert.equal(b[24].part, 'host');
    assert.ok(I.bits(ip('1.2.3.4'), 0).every(x => x.part === 'host'));
    assert.ok(I.bits(ip('1.2.3.4'), 32).every(x => x.part === 'network'));
});

test('addresses are recognised by their range', () => {
    const scope = a => I.scope(ip(a));
    assert.equal(scope('8.8.8.8'), 'public');
    assert.equal(scope('10.255.0.1'), 'private');
    assert.equal(scope('172.16.0.1'), 'private');
    assert.equal(scope('172.31.255.255'), 'private');
    assert.equal(scope('172.32.0.1'), 'public');
    assert.equal(scope('192.168.1.10'), 'private');
    assert.equal(scope('100.64.0.1'), 'cgnat');
    assert.equal(scope('100.128.0.1'), 'public');
    assert.equal(scope('127.0.0.1'), 'loopback');
    assert.equal(scope('169.254.10.10'), 'linklocal');
    assert.equal(scope('192.0.2.42'), 'doc');
    assert.equal(scope('203.0.113.7'), 'doc');
    assert.equal(scope('224.0.0.251'), 'multicast');
    assert.equal(scope('255.255.255.255'), 'reserved');
    assert.equal(scope('0.0.0.0'), 'this');
    assert.equal(I.scope(null), null);
});

test('every scope and preset has its strings in both languages', () => {
    const scopes = ['public', 'private', 'cgnat', 'loopback', 'linklocal', 'doc', 'multicast', 'reserved', 'this'];
    for (const lang of ['en', 'fr']) {
        for (const s of scopes) assert.ok(translations[lang].scope[s], `${lang}: scope.${s}`);
        for (const p of I.PRESETS) assert.ok(translations[lang].preset[p], `${lang}: preset.${p}`);
    }
});

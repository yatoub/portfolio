// node --test tools/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const X = require('../xxd/core.js');
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const translations = new Function(`${read('xxd/translations.js')}; return translations;`)();

const opts = { srcIp: '198.51.100.23', dstIp: '203.0.113.80', srcPort: 50444, host: 'yatoub.dev', cipher: 'TLS_AES_128_GCM_SHA256', alpn: ['h2', 'http/1.1'] };
const field = (p, id) => p.fields.find(f => f.id === id);
const slice = (p, id) => { const f = field(p, id); return p.bytes.slice(f.start, f.start + f.length); };
const u16 = (bytes) => (bytes[0] << 8) + bytes[1];

test('the Internet checksum matches the RFC 1071 example and verifies to zero', () => {
    assert.equal(X.checksum([0x00, 0x01, 0xf2, 0x03, 0xf4, 0xf5, 0xf6, 0xf7]), 0x220d);
    assert.equal(X.checksum([0x00, 0x01, 0xf2, 0x03, 0xf4, 0xf5, 0xf6, 0xf7, 0x22, 0x0d]), 0);
    assert.equal(X.checksum([0xff]), 0x00ff, 'an odd length is padded with a zero byte');
});

test('fields tile the packet: no gap, no overlap, every byte belongs to one', () => {
    for (const kind of ['hello', 'data']) {
        const p = X.build({ ...opts, kind });
        let at = 0;
        for (const f of p.fields) { assert.equal(f.start, at, f.id); assert.ok(f.length > 0, f.id); at += f.length; }
        assert.equal(at, p.bytes.length);
        assert.ok(p.bytes.every(b => Number.isInteger(b) && b >= 0 && b <= 255));
        assert.equal(X.fieldAt(p.fields, 0).id, 'eth.dst');
        assert.equal(X.fieldAt(p.fields, p.bytes.length - 1).layer, 'tls');
        assert.equal(X.fieldAt(p.fields, p.bytes.length), null);
    }
});

test('layers come in order and start where the standards say', () => {
    const p = X.build(opts);
    assert.deepEqual([...new Set(p.fields.map(f => f.layer))], X.LAYERS);
    assert.equal(field(p, 'ip.head').start, 14);
    assert.equal(field(p, 'tcp.sport').start, 34);
    assert.equal(field(p, 'tls.rec').start, 54);
    assert.deepEqual(slice(p, 'eth.type'), [0x08, 0x00]);
    assert.deepEqual(slice(p, 'ip.head'), [0x45, 0x00]);
});

test('addresses, ports and lengths are the real ones', () => {
    const p = X.build(opts);
    assert.deepEqual(slice(p, 'ip.src'), [198, 51, 100, 23]);
    assert.deepEqual(slice(p, 'ip.dst'), [203, 0, 113, 80]);
    assert.equal(u16(slice(p, 'tcp.sport')), 50444);
    assert.equal(u16(slice(p, 'tcp.dport')), 443);
    assert.equal(u16(slice(p, 'ip.len')), p.bytes.length - 14, 'IP total length is everything after Ethernet');
    assert.equal(field(p, 'ip.src').value, '198.51.100.23');
    assert.equal(slice(p, 'ip.ttl')[0], 64);
    assert.equal(slice(p, 'ip.proto')[0], 6);
});

test('both checksums verify against the bytes of the packet', () => {
    for (const kind of ['hello', 'data']) {
        const p = X.build({ ...opts, kind });
        const ip = p.bytes.slice(14, 34);
        assert.equal(X.checksum(ip), 0, `${kind}: IP header`);
        const segment = p.bytes.slice(34);
        const pseudo = [...ip.slice(12, 20), 0, 6, segment.length >> 8, segment.length & 255];
        assert.equal(X.checksum([...pseudo, ...segment]), 0, `${kind}: TCP segment`);
    }
});

test('the ClientHello is well-formed and names the site in clear', () => {
    const p = X.build(opts);
    const rec = slice(p, 'tls.rec');
    assert.equal(rec[0], 0x16);
    assert.equal(u16(rec.slice(3)), p.bytes.length - 54 - 5, 'record length covers the handshake message');
    const head = slice(p, 'hs.head');
    assert.equal(head[0], 0x01);
    assert.equal((head[1] << 16) + (head[2] << 8) + head[3], p.bytes.length - 54 - 5 - 4, 'handshake length covers its body');
    assert.equal(String.fromCharCode(...slice(p, 'ext.sniName')), 'yatoub.dev');
    const sni = slice(p, 'ext.sniHead');
    assert.deepEqual(sni.slice(0, 2), [0, 0]);
    assert.equal(u16(sni.slice(2, 4)), 5 + 10, 'extension length: list length, type, name length, name');
    assert.equal(u16(sni.slice(7, 9)), 10);
    // Extensions length announces exactly the bytes that follow
    const misc = slice(p, 'hs.misc');
    assert.equal(u16(misc.slice(2)), p.bytes.length - (field(p, 'hs.misc').start + 4));
    assert.equal(slice(p, 'hs.random').length, 32);
    assert.deepEqual(slice(p, 'hs.ciphers').slice(0, 4), [0x00, 0x06, 0x13, 0x01]);
    assert.ok(p.fields.every(f => f.clear), 'nothing in a ClientHello is encrypted');
});

test('the negotiated suite comes first, the site name follows the input', () => {
    const p = X.build({ ...opts, cipher: 'TLS_CHACHA20_POLY1305_SHA256', host: 'Example.ORG' });
    assert.deepEqual(slice(p, 'hs.ciphers').slice(2, 4), [0x13, 0x03]);
    assert.equal(field(p, 'ext.sniName').value, 'example.org');
    assert.equal(X.build({ ...opts, host: '<script>' }).fields.find(f => f.id === 'ext.sniName').value, 'yatoub.dev');
});

test('application data: the record header is readable, the payload is not', () => {
    const p = X.build({ ...opts, kind: 'data' });
    assert.deepEqual(slice(p, 'tls.rec').slice(0, 3), [0x17, 0x03, 0x03]);
    assert.equal(u16(slice(p, 'tls.rec').slice(3)), 64);
    assert.deepEqual(p.fields.filter(f => !f.clear).map(f => f.id), ['tls.payload']);
    assert.equal(field(p, 'tls.payload').length, 64);
    assert.equal(p.bytes.length, 54 + 5 + 64);
});

test('what the page could not learn is replaced by documentation values, and reported', () => {
    const p = X.build({ host: 'yatoub.dev' });
    assert.deepEqual(p.assumed, ['mac', 'srcIp', 'dstIp', 'srcPort']);
    assert.equal(field(p, 'ip.src').value, '192.0.2.42');
    assert.equal(field(p, 'ip.dst').value, '203.0.113.1');
    assert.deepEqual(X.build(opts).assumed, ['mac']);
    for (const bad of [{ srcIp: '999.1.1.1' }, { srcIp: '::1' }, { srcPort: 0 }, { srcPort: 70000 }, { srcPort: '443' }]) {
        assert.ok(X.build({ ...opts, ...bad }).assumed.length > 1, JSON.stringify(bad));
    }
    assert.deepEqual(slice(p, 'eth.src').slice(0, 5), [0x00, 0x00, 0x5e, 0x00, 0x53], 'MAC addresses come from the documentation range');
});

test('rows print sixteen bytes with their printable characters', () => {
    const p = X.build(opts);
    const r = X.rows(p.bytes);
    assert.equal(r[0].offset, '00000000');
    assert.equal(r[1].offset, '00000010');
    assert.equal(r[0].bytes.length, 16);
    assert.equal(r.flatMap(x => x.bytes).length, p.bytes.length);
    assert.deepEqual(r[0].bytes[0], { i: 0, hex: '00', char: '.' });
    assert.match(r.map(x => x.bytes.map(b => b.char).join('')).join(''), /yatoub\.dev/, 'the site name is readable in the text column');
    assert.match(r.map(x => x.bytes.map(b => b.char).join('')).join(''), /h2.http\/1\.1/);
});

test('every field of both packets is explained in both languages', () => {
    const ids = new Set([...X.build(opts).fields, ...X.build({ ...opts, kind: 'data' }).fields].map(f => f.id));
    for (const lang of ['en', 'fr']) {
        for (const id of ids) {
            const [layer, name] = id.split('.');
            assert.ok(translations[lang].field[layer]?.[name]?.name && translations[lang].field[layer]?.[name]?.what, `${lang}: field.${id}`);
        }
        for (const layer of X.LAYERS) assert.ok(translations[lang].layer[layer]?.name, `${lang}: layer.${layer}`);
        for (const a of ['mac', 'srcIp', 'dstIp', 'srcPort']) assert.ok(translations[lang].assumed[a], `${lang}: assumed.${a}`);
    }
});

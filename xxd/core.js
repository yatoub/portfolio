/* ═══════════════════════════════════════════
   YATOUB // XXD — a packet rebuilt byte by byte, pure helpers
   Builds the frames a browser sends when it opens this site: the
   TLS ClientHello, then a record of encrypted application data.
   The bytes are real in structure (lengths and checksums are
   computed), rebuilt from what the page knows — not captured.
   No DOM access here: covered by tools/xxd-core.test.mjs.
   ═══════════════════════════════════════════ */

const XxdCore = (() => {
    // Documentation MAC range (RFC 7042): a page cannot know the real ones
    const MAC_SRC = [0x00, 0x00, 0x5e, 0x00, 0x53, 0x01];
    const MAC_DST = [0x00, 0x00, 0x5e, 0x00, 0x53, 0xfe];
    const SUITES = { TLS_AES_128_GCM_SHA256: 0x1301, TLS_AES_256_GCM_SHA384: 0x1302, TLS_CHACHA20_POLY1305_SHA256: 0x1303 };
    const FALLBACK = { srcIp: '192.0.2.42', dstIp: '203.0.113.1', srcPort: 51234 };

    const u16 = (n) => [(n >>> 8) & 255, n & 255];
    const u24 = (n) => [(n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    const ascii = (s) => [...String(s)].map(c => c.charCodeAt(0) & 0x7f);
    const hex = (bytes, sep = '') => bytes.map(b => b.toString(16).padStart(2, '0')).join(sep);

    function ipBytes(text) {
        const m = String(text ?? '').match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
        const octets = m ? m.slice(1).map(Number) : null;
        return octets && octets.every(o => o <= 255) ? octets : null;
    }
    const validPort = (p) => Number.isInteger(p) && p > 0 && p < 65536;
    const validHost = (h) => typeof h === 'string' && /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i.test(h);

    // Internet checksum (RFC 1071): one's complement of the one's complement sum of 16-bit words
    function checksum(bytes) {
        let sum = 0;
        for (let i = 0; i < bytes.length; i += 2) sum += (bytes[i] << 8) + (bytes[i + 1] ?? 0);
        while (sum >>> 16) sum = (sum & 0xffff) + (sum >>> 16);
        return ~sum & 0xffff;
    }

    /* ── A tiny builder: append named fields, remember where each one sits ── */
    function builder() {
        const bytes = [];
        const fields = [];
        return {
            bytes, fields,
            add(id, layer, data, value = '', clear = true) {
                fields.push({ id, layer, start: bytes.length, length: data.length, value, clear });
                bytes.push(...data);
                return this;
            },
        };
    }

    // An extension: type, length, body
    const ext = (type, body) => [...u16(type), ...u16(body.length), ...body];

    // TLS ClientHello handshake message → { head, random, session, ciphers, misc, sniHead, sniName, alpn, versions }
    function clientHello({ host, random, suites, alpn }) {
        const name = ascii(host);
        const sniBody = [...u16(name.length + 3), 0x00, ...u16(name.length), ...name];
        const sni = ext(0x0000, sniBody);
        const protos = alpn.flatMap(p => [p.length, ...ascii(p)]);
        const alpnExt = ext(0x0010, [...u16(protos.length), ...protos]);
        const versions = ext(0x002b, [0x02, 0x03, 0x04]);
        const extensions = [...sni, ...alpnExt, ...versions];
        const ciphers = [...u16(suites.length * 2), ...suites.flatMap(u16)];
        const body = [0x03, 0x03, ...random, 0x00, ...ciphers, 0x01, 0x00, ...u16(extensions.length), ...extensions];
        return {
            head: [0x01, ...u24(body.length), 0x03, 0x03],
            random, session: [0x00], ciphers,
            misc: [0x01, 0x00, ...u16(extensions.length)],
            sniHead: sni.slice(0, sni.length - name.length), sniName: name,
            alpn: alpnExt, versions,
            length: 4 + body.length,
        };
    }

    // opts: { kind: 'hello' | 'data', srcIp, dstIp, srcPort, host, cipher, alpn: [..], random: [32 bytes], payload: [bytes], seq, ack, id }
    // → { bytes: number[], fields: [{ id, layer, start, length, value, clear }], assumed: [ids of values the page had to invent] }
    function build(opts = {}) {
        const assumed = [];
        const pick = (value, ok, key) => { if (ok(value)) return value; assumed.push(key); return FALLBACK[key]; };
        const srcIp = pick(opts.srcIp, v => ipBytes(v) !== null, 'srcIp');
        const dstIp = pick(opts.dstIp, v => ipBytes(v) !== null, 'dstIp');
        const srcPort = pick(opts.srcPort, validPort, 'srcPort');
        const host = validHost(opts.host) ? opts.host.toLowerCase() : 'yatoub.dev';
        const kind = opts.kind === 'data' ? 'data' : 'hello';
        const random = Array.from({ length: 32 }, (_, i) => (opts.random?.[i] ?? (i * 37 + 11)) & 255);
        const negotiated = SUITES[opts.cipher];
        const suites = [...new Set([negotiated, 0x1301, 0x1302, 0x1303].filter(Boolean))];
        const alpn = (Array.isArray(opts.alpn) && opts.alpn.length ? opts.alpn : ['h2', 'http/1.1']).filter(p => /^[a-z0-9./-]{1,20}$/i.test(p));
        const seq = (opts.seq ?? 0x3a1f9c02) >>> 0;
        const ack = (opts.ack ?? 0x7be40d51) >>> 0;

        // TLS record first: the lengths of the layers below depend on it
        let tls;
        if (kind === 'hello') {
            const hello = clientHello({ host, random, suites, alpn });
            tls = [
                ['tls.rec', [0x16, 0x03, 0x01, ...u16(hello.length)], 'Handshake'],
                ['hs.head', hello.head, 'ClientHello'],
                ['hs.random', hello.random, ''],
                ['hs.session', hello.session, '0'],
                ['hs.ciphers', hello.ciphers, suites.map(s => `0x${s.toString(16)}`).join(' ')],
                ['hs.misc', hello.misc, ''],
                ['ext.sniHead', hello.sniHead, 'server_name'],
                ['ext.sniName', hello.sniName, host],
                ['ext.alpn', hello.alpn, alpn.join(', ')],
                ['ext.versions', hello.versions, 'TLS 1.3'],
            ].map(([id, data, value]) => ({ id, data, value, clear: true }));
        } else {
            const payload = Array.from({ length: 64 }, (_, i) => (opts.payload?.[i] ?? (i * 151 + 89)) & 255);
            tls = [
                { id: 'tls.rec', data: [0x17, 0x03, 0x03, ...u16(payload.length)], value: 'Application Data', clear: true },
                { id: 'tls.payload', data: payload, value: '', clear: false },
            ];
        }
        const tlsBytes = tls.flatMap(f => f.data);

        const tcpHead = (sum) => [...u16(srcPort), ...u16(443), ...u32(seq), ...u32(ack), 0x50, 0x18, ...u16(0xfaf0), ...u16(sum), 0x00, 0x00];
        const total = 20 + 20 + tlsBytes.length;
        const ipHead = (sum) => [0x45, 0x00, ...u16(total), ...u16(opts.id ?? 0x1c46), 0x40, 0x00, 64, 6, ...u16(sum), ...ipBytes(srcIp), ...ipBytes(dstIp)];

        // TCP checksum covers a pseudo-header (addresses, protocol, length), the header and the payload
        const pseudo = [...ipBytes(srcIp), ...ipBytes(dstIp), 0x00, 6, ...u16(20 + tlsBytes.length)];
        const tcp = tcpHead(checksum([...pseudo, ...tcpHead(0), ...tlsBytes]));
        const ip = ipHead(checksum(ipHead(0)));

        const b = builder();
        b.add('eth.dst', 'eth', MAC_DST, hex(MAC_DST, ':'))
            .add('eth.src', 'eth', MAC_SRC, hex(MAC_SRC, ':'))
            .add('eth.type', 'eth', [0x08, 0x00], 'IPv4')
            .add('ip.head', 'ip', ip.slice(0, 2), 'v4')
            .add('ip.len', 'ip', ip.slice(2, 4), String(total))
            .add('ip.id', 'ip', ip.slice(4, 8), 'DF')
            .add('ip.ttl', 'ip', ip.slice(8, 9), '64')
            .add('ip.proto', 'ip', ip.slice(9, 10), 'TCP')
            .add('ip.sum', 'ip', ip.slice(10, 12), `0x${hex(ip.slice(10, 12))}`)
            .add('ip.src', 'ip', ip.slice(12, 16), srcIp)
            .add('ip.dst', 'ip', ip.slice(16, 20), dstIp)
            .add('tcp.sport', 'tcp', tcp.slice(0, 2), String(srcPort))
            .add('tcp.dport', 'tcp', tcp.slice(2, 4), '443')
            .add('tcp.seq', 'tcp', tcp.slice(4, 8), String(seq))
            .add('tcp.ack', 'tcp', tcp.slice(8, 12), String(ack))
            .add('tcp.flags', 'tcp', tcp.slice(12, 14), 'PSH, ACK')
            .add('tcp.win', 'tcp', tcp.slice(14, 16), String(0xfaf0))
            .add('tcp.sum', 'tcp', tcp.slice(16, 18), `0x${hex(tcp.slice(16, 18))}`)
            .add('tcp.urg', 'tcp', tcp.slice(18, 20), '0');
        for (const f of tls) b.add(f.id, 'tls', f.data, f.value, f.clear);

        // MAC addresses are always invented ; the rest only when the page could not learn it
        return { bytes: b.bytes, fields: b.fields, assumed: ['mac', ...assumed], kind };
    }

    // Bytes → rows of 16, as xxd prints them: { offset, bytes: [{ i, hex, char }] }
    function rows(bytes, width = 16) {
        const out = [];
        for (let offset = 0; offset < bytes.length; offset += width) {
            out.push({
                offset: offset.toString(16).padStart(8, '0'),
                bytes: bytes.slice(offset, offset + width).map((b, k) => ({ i: offset + k, hex: b.toString(16).padStart(2, '0'), char: b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.' })),
            });
        }
        return out;
    }

    // Which field does byte i belong to ?
    const fieldAt = (fields, i) => fields.find(f => i >= f.start && i < f.start + f.length) ?? null;

    const LAYERS = ['eth', 'ip', 'tcp', 'tls'];

    return { SUITES, LAYERS, build, rows, fieldAt, checksum, ipBytes, hex };
})();

if (typeof module !== 'undefined') module.exports = XxdCore;

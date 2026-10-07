/* ═══════════════════════════════════════════
   YATOUB // TCPDUMP — request anatomy, pure helpers
   Turns browser timing entries into phases, decodes a TLS cipher
   suite, and lists what an on-path observer sees of a connection.
   No DOM access here: covered by tools/tcpdump-core.test.mjs.
   ═══════════════════════════════════════════ */

const TcpdumpCore = (() => {
    const round = (ms) => Math.round(ms * 10) / 10;

    /* ── Waterfall ──
       t: PerformanceNavigationTiming or PerformanceResourceTiming (or a plain object with the same fields).
       https: false when the page is known to be plain HTTP — a reused connection carries no TLS mark to tell.
       → { phases: [{ id, start, duration, state }], total, reused, cached, protocol }
       state: 'measured' | 'reused' (connection already open) | 'none' (does not apply) */
    function waterfall(t, { https = true } = {}) {
        const origin = t.startTime ?? 0;
        const at = (v) => Math.max(0, (v ?? 0) - origin);
        const span = (id, from, to) => {
            const start = at(from);
            return { id, start: round(start), duration: round(Math.max(0, at(to) - start)), state: 'measured' };
        };

        // A reused connection reports its connection marks collapsed on fetchStart.
        // Equal marks alone are not enough: a loopback connect can take less than the timer resolution.
        const reused = t.connectStart === t.connectEnd && t.domainLookupStart === t.domainLookupEnd
            && t.connectStart === (t.fetchStart ?? t.connectStart);
        const secure = https && (t.secureConnectionStart ?? 0) > 0;
        const cached = t.transferSize === 0 && (t.decodedBodySize ?? 0) > 0;
        const isNavigation = t.domInteractive !== undefined;

        const phases = [];
        if ((t.redirectEnd ?? 0) > 0) phases.push(span('redirect', t.redirectStart, t.redirectEnd));
        phases.push(
            span('dns', t.domainLookupStart, t.domainLookupEnd),
            span('tcp', t.connectStart, secure ? t.secureConnectionStart : t.connectEnd),
            secure || (reused && https) ? span('tls', secure ? t.secureConnectionStart : t.connectEnd, t.connectEnd) : { id: 'tls', start: at(t.connectEnd), duration: 0, state: 'none' },
            span('wait', t.requestStart, t.responseStart),
            span('download', t.responseStart, t.responseEnd),
        );
        if (isNavigation) phases.push(span('dom', t.responseEnd, t.domContentLoadedEventEnd || t.domInteractive));

        if (reused) for (const p of phases) if (['dns', 'tcp', 'tls'].includes(p.id) && p.state === 'measured') p.state = 'reused';

        const last = phases[phases.length - 1];
        return {
            phases,
            total: round(last.start + last.duration),
            reused,
            cached,
            protocol: t.nextHopProtocol || '',
        };
    }

    // HTTP/3 runs on QUIC: one UDP handshake carries transport and TLS together
    const transport = (protocol) => (/^h3/.test(protocol) ? 'quic' : 'tcp');

    // Compression as seen by the browser → { encoded, decoded, ratio } or null when sizes are hidden or equal
    function compression(t) {
        const encoded = t.encodedBodySize ?? 0;
        const decoded = t.decodedBodySize ?? 0;
        if (!encoded || !decoded || decoded <= encoded) return null;
        return { encoded, decoded, ratio: Math.round((1 - encoded / decoded) * 100) };
    }

    /* ── Cipher suite ──
       Names as Go (and therefore Caddy) reports them:
       TLS 1.3: TLS_AES_128_GCM_SHA256 · TLS 1.2: TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256
       → [{ token, role }] with role in kx | auth | cipher | mode | hash, or [] when unrecognised */
    const KX = ['ECDHE', 'DHE', 'RSA'];
    const AUTH = ['ECDSA', 'RSA'];
    const HASH = ['SHA256', 'SHA384', 'SHA'];

    function decodeCipher(name) {
        if (typeof name !== 'string' || !name.startsWith('TLS_')) return [];
        const [left, right] = name.slice(4).split('_WITH_');
        const parts = [];

        let body = left;
        if (right !== undefined) {
            const [kx, auth] = left.split('_');
            if (!KX.includes(kx)) return [];
            parts.push({ token: kx, role: 'kx' });
            // TLS_RSA_WITH_…: RSA does both key exchange and authentication
            if (auth) {
                if (!AUTH.includes(auth)) return [];
                parts.push({ token: auth, role: 'auth' });
            }
            body = right;
        }

        const tokens = body.split('_');
        const hash = tokens.pop();
        if (!HASH.includes(hash)) return [];

        let cipher, mode;
        if (tokens[0] === 'CHACHA20' && tokens[1] === 'POLY1305') { cipher = 'CHACHA20'; mode = 'POLY1305'; }
        else if (tokens[0] === 'AES' && /^(128|256)$/.test(tokens[1]) && ['GCM', 'CBC', 'CCM'].includes(tokens[2])) { cipher = `AES_${tokens[1]}`; mode = tokens[2]; }
        else return [];

        parts.push({ token: cipher, role: 'cipher' }, { token: mode, role: 'mode' }, { token: hash, role: 'hash' });
        return parts;
    }

    // "tls1.3" (Caddy placeholder) → "1.3", '' when absent or unknown
    const tlsVersion = (v) => (typeof v === 'string' && /^tls1\.[0-3]$/.test(v) ? v.slice(3) : '');

    /* ── What an on-path observer sees ──
       conn: { ip, tls, sni, alpn } as returned by /whoami/server.json
       → [{ id, visible, value }] — value only where the page has a real one to show.
       Without TLS everything is readable. With TLS 1.2 the certificate still travels in clear. */
    function observer(conn = {}) {
        const version = tlsVersion(conn.tls);
        const encrypted = Boolean(version);
        const row = (id, visible, value = '') => ({ id, visible, value: value || '' });
        return [
            row('ip', true, conn.ip),
            row('dest', true),
            row('dns', true),
            row('sni', true, conn.sni),
            row('volume', true),
            row('alpn', true, conn.alpn),
            row('cert', !encrypted || version !== '1.3'),
            row('path', !encrypted),
            row('headers', !encrypted),
            row('cookies', !encrypted),
            row('body', !encrypted),
        ];
    }

    return { waterfall, transport, compression, decodeCipher, tlsVersion, observer };
})();

if (typeof module !== 'undefined') module.exports = TcpdumpCore;

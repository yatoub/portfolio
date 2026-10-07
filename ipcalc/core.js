/* ═══════════════════════════════════════════
   YATOUB // IPCALC — IPv4 subnet arithmetic, pure helpers
   Addresses are unsigned 32-bit integers ; every bitwise result goes
   through >>> 0, since JavaScript bit operators yield signed values.
   No DOM access here: covered by tools/ipcalc-core.test.mjs.
   ═══════════════════════════════════════════ */

const IpcalcCore = (() => {
    const u32 = (n) => n >>> 0;

    // "203.0.113.7" → 3405803783, null when it is not a dotted quad
    function parse(text) {
        const m = String(text ?? '').trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
        if (!m) return null;
        const octets = m.slice(1).map(Number);
        if (octets.some(o => o > 255)) return null;
        return u32(octets[0] * 2 ** 24 + (octets[1] << 16) + (octets[2] << 8) + octets[3]);
    }

    const octets = (ip) => [ip >>> 24, (ip >>> 16) & 255, (ip >>> 8) & 255, ip & 255];
    const format = (ip) => octets(u32(ip)).join('.');
    const validPrefix = (p) => Number.isInteger(p) && p >= 0 && p <= 32;

    // /24 → 255.255.255.0 as an integer. << 32 is a no-op in JavaScript, hence the special case.
    const mask = (prefix) => (prefix === 0 ? 0 : u32(0xffffffff << (32 - prefix)));

    // → { network, broadcast, mask, wildcard, first, last, addresses, hosts } or null
    // hosts: usable addresses. /31 (point-to-point, RFC 3021) and /32 (a single host) have no network/broadcast to set aside.
    function subnet(ip, prefix) {
        if (ip === null || !validPrefix(prefix)) return null;
        const m = mask(prefix);
        const network = u32(ip & m);
        const broadcast = u32(network | ~m);
        const addresses = 2 ** (32 - prefix);
        const plain = prefix >= 31;
        return {
            network, broadcast, mask: m, wildcard: u32(~m),
            first: plain ? network : network + 1,
            last: plain ? broadcast : broadcast - 1,
            addresses,
            hosts: plain ? addresses : addresses - 2,
        };
    }

    // 32 bits, most significant first → [{ bit: 0 | 1, part: 'network' | 'host' }]
    function bits(ip, prefix) {
        return Array.from({ length: 32 }, (_, i) => ({ bit: (u32(ip) >>> (31 - i)) & 1, part: i < prefix ? 'network' : 'host' }));
    }

    const within = (ip, base, prefix) => u32(ip & mask(prefix)) === parse(base);

    // What kind of address this is → id of the explanation in translations.js (scope.*)
    const SCOPES = [
        ['this', '0.0.0.0', 8], ['private', '10.0.0.0', 8], ['cgnat', '100.64.0.0', 10], ['loopback', '127.0.0.0', 8],
        ['linklocal', '169.254.0.0', 16], ['private', '172.16.0.0', 12], ['doc', '192.0.2.0', 24], ['private', '192.168.0.0', 16],
        ['doc', '198.51.100.0', 24], ['doc', '203.0.113.0', 24], ['multicast', '224.0.0.0', 4], ['reserved', '240.0.0.0', 4],
    ];
    function scope(ip) {
        if (ip === null) return null;
        return SCOPES.find(([, base, prefix]) => within(ip, base, prefix))?.[0] ?? 'public';
    }

    // Prefix lengths worth a shortcut, with the id of their usual purpose (preset.*)
    const PRESETS = [8, 16, 24, 30, 32];

    return { parse, format, octets, mask, subnet, bits, scope, validPrefix, PRESETS };
})();

if (typeof module !== 'undefined') module.exports = IpcalcCore;

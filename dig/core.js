/* ═══════════════════════════════════════════
   YATOUB // DIG — DNS over HTTPS, pure helpers
   Builds queries for two public resolvers, normalises their JSON
   answers and validates what the visitor may look up (names of
   this zone only). No DOM access here: covered by
   tools/dig-core.test.mjs.
   ═══════════════════════════════════════════ */

const DigCore = (() => {
    const ZONE = 'yatoub.dev';
    const TYPES = { A: 1, NS: 2, CNAME: 5, SOA: 6, MX: 15, TXT: 16, AAAA: 28, CAA: 257 };
    const TYPE_NAMES = Object.fromEntries(Object.entries(TYPES).map(([name, n]) => [n, name]));
    const RCODES = { 0: 'NOERROR', 1: 'FORMERR', 2: 'SERVFAIL', 3: 'NXDOMAIN', 4: 'NOTIMP', 5: 'REFUSED' };

    // Both speak the same JSON dialect ; Cloudflare wants an Accept header, Google does not
    const RESOLVERS = [
        { id: 'cloudflare', label: 'Cloudflare · 1.1.1.1', base: 'https://cloudflare-dns.com/dns-query', headers: { accept: 'application/dns-json' } },
        { id: 'google', label: 'Google · 8.8.8.8', base: 'https://dns.google/resolve', headers: {} },
    ];

    // The records shown on load, in reading order. id: key of the explanation in translations.js
    const QUERIES = [
        { id: 'A', name: ZONE, type: 'A' },
        { id: 'AAAA', name: ZONE, type: 'AAAA' },
        { id: 'NS', name: ZONE, type: 'NS' },
        { id: 'SOA', name: ZONE, type: 'SOA' },
        { id: 'MX', name: ZONE, type: 'MX' },
        { id: 'TXT', name: ZONE, type: 'TXT' },
        { id: 'DMARC', name: `_dmarc.${ZONE}`, type: 'TXT' },
        { id: 'CAA', name: ZONE, type: 'CAA' },
    ];

    const LABEL = /^[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?$/;

    // What the visitor typed → a name inside the zone, or null.
    // '' and '@' mean the zone itself ; 'www' and 'www.yatoub.dev' are the same name.
    function fqdn(input) {
        const raw = String(input ?? '').trim().toLowerCase().replace(/\.$/, '');
        if (raw === '' || raw === '@') return ZONE;
        const name = raw === ZONE || raw.endsWith(`.${ZONE}`) ? raw : `${raw}.${ZONE}`;
        if (name.length > 253) return null;
        return name.split('.').every(label => LABEL.test(label)) ? name : null;
    }

    function url(resolver, name, type) {
        if (!Object.hasOwn(TYPES, type)) return null;
        return `${resolver.base}?name=${encodeURIComponent(name)}&type=${type}`;
    }

    // TXT data arrives quoted by one resolver and bare by the other, sometimes split in several strings
    function unquote(data) {
        const s = String(data);
        if (!s.startsWith('"')) return s;
        return (s.match(/"((?:[^"\\]|\\.)*)"/g) || [s]).map(part => part.slice(1, -1).replace(/\\(.)/g, '$1')).join('');
    }

    const bare = (name) => String(name ?? '').replace(/\.$/, '').toLowerCase();

    // Resolver JSON → { rcode, kind, ad, answers: [{ name, ttl, type, data }] }
    // kind: 'answer' | 'nodata' (the name exists, not with that type) | 'nxdomain' | 'error'
    function parse(json, type) {
        if (!json || typeof json.Status !== 'number') return { rcode: 'INVALID', kind: 'error', ad: false, answers: [] };
        const rcode = RCODES[json.Status] ?? `RCODE${json.Status}`;
        const answers = (Array.isArray(json.Answer) ? json.Answer : [])
            .filter(a => a && typeof a.data === 'string')
            .map(a => {
                const kind = TYPE_NAMES[a.type] ?? `TYPE${a.type}`;
                return { name: bare(a.name), ttl: Number.isFinite(a.TTL) ? a.TTL : null, type: kind, data: kind === 'TXT' ? unquote(a.data) : a.data };
            })
            // A CNAME on the way to the answer is part of it ; anything else of another type is noise
            .filter(a => a.type === type || a.type === 'CNAME');
        const kind = json.Status === 3 ? 'nxdomain' : json.Status !== 0 ? 'error' : answers.length ? 'answer' : 'nodata';
        return { rcode, kind, ad: json.AD === true, answers };
    }

    // Do two resolvers tell the same story ? TTLs differ by design (each caches on its own), data must not.
    function agree(a, b) {
        if (a.kind !== b.kind) return false;
        const key = (r) => r.answers.map(x => `${x.type} ${x.data.toLowerCase()}`).sort().join('\n');
        return key(a) === key(b);
    }

    // → 'spf' | 'dmarc' | 'dkim' | 'verification' | 'other'
    function txtKind(data) {
        const s = String(data).trim().toLowerCase();
        if (s.startsWith('v=spf1')) return 'spf';
        if (s.startsWith('v=dmarc1')) return 'dmarc';
        if (s.startsWith('v=dkim1')) return 'dkim';
        if (/^[a-z0-9-]+-(site-)?verification=|^(ms|apple-domain-verification)=/.test(s)) return 'verification';
        return 'other';
    }

    // Seconds → { n, unit } in the largest unit that divides without a fraction worth showing
    function ttl(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return null;
        if (seconds >= 86400 && seconds % 86400 === 0) return { n: seconds / 86400, unit: 'd' };
        if (seconds >= 3600 && seconds % 3600 === 0) return { n: seconds / 3600, unit: 'h' };
        if (seconds >= 60 && seconds % 60 === 0) return { n: seconds / 60, unit: 'min' };
        return { n: seconds, unit: 's' };
    }

    // One answer as dig prints it
    const line = (a) => `${a.name}.\t${a.ttl ?? ''}\tIN\t${a.type}\t${a.type === 'TXT' ? `"${a.data}"` : a.data}`;

    return { ZONE, TYPES, RESOLVERS, QUERIES, fqdn, url, unquote, parse, agree, txtKind, ttl, line };
})();

if (typeof module !== 'undefined') module.exports = DigCore;

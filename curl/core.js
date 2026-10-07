/* ═══════════════════════════════════════════
   YATOUB // CURL — response headers audit, pure helpers
   Classifies the headers of a response, checks the ones that
   protect the visitor and hides what must not be echoed.
   No DOM access here: covered by tools/curl-core.test.mjs.
   ═══════════════════════════════════════════ */

const CurlCore = (() => {
    const SIX_MONTHS = 15552000;

    // Security headers the audit expects, in reading order.
    // fix: the Caddy directive that sets a sound value (shown on the page, not translated).
    const SECURITY = [
        { id: 'strict-transport-security', fix: 'header Strict-Transport-Security "max-age=31536000; includeSubDomains"' },
        { id: 'content-security-policy', fix: `header Content-Security-Policy "default-src 'self'; frame-ancestors 'none'; base-uri 'self'"` },
        { id: 'x-content-type-options', fix: 'header X-Content-Type-Options "nosniff"' },
        { id: 'x-frame-options', fix: 'header X-Frame-Options "DENY"' },
        { id: 'referrer-policy', fix: 'header Referrer-Policy "strict-origin-when-cross-origin"' },
        { id: 'permissions-policy', fix: 'header Permissions-Policy "camera=(), microphone=(), geolocation=(self)"' },
    ];
    // Headers that describe the stack rather than serve the client
    const LEAKS = ['server', 'x-powered-by', 'via', 'x-aspnet-version', 'x-generator'];
    // Never echoed: the CTF flag travels in this one
    const REDACTED = ['x-flag'];

    const lower = (s) => String(s).toLowerCase();

    // Headers (Headers object, entries or plain object) → Map of lowercase name → value
    function toMap(headers) {
        // Arrays first: they have an entries() method too, which yields indexes
        const entries = Array.isArray(headers) ? headers : typeof headers?.entries === 'function' ? [...headers.entries()] : Object.entries(headers ?? {});
        return new Map(entries.map(([name, value]) => [lower(name), String(value)]));
    }

    const redact = (name, value) => (REDACTED.includes(lower(name)) ? '[…]' : value);

    // → 'security' | 'leak' | 'redacted' | 'info'
    function kind(name) {
        const n = lower(name);
        if (REDACTED.includes(n)) return 'redacted';
        if (n === 'content-security-policy-report-only' || SECURITY.some(h => h.id === n)) return 'security';
        if (LEAKS.includes(n)) return 'leak';
        return 'info';
    }

    // "max-age=31536000; includeSubDomains; preload" → { maxAge, includeSubDomains, preload }
    function parseHsts(value) {
        const parts = lower(value ?? '').split(';').map(p => p.trim());
        const age = parts.map(p => p.match(/^max-age="?(\d+)"?$/)).find(Boolean);
        return { maxAge: age ? Number(age[1]) : null, includeSubDomains: parts.includes('includesubdomains'), preload: parts.includes('preload') };
    }

    // One verdict per expected header → [{ id, state: 'ok' | 'weak' | 'missing', value, reason, fix }]
    // reason: why a present header is only 'weak' (key of the explanation in translations.js)
    function audit(headers) {
        const map = toMap(headers);
        const csp = map.get('content-security-policy');
        return SECURITY.map(({ id, fix }) => {
            let value = map.get(id) ?? null;
            let state = value === null ? 'missing' : 'ok';
            let reason = null;

            if (id === 'strict-transport-security' && value !== null) {
                const { maxAge } = parseHsts(value);
                if (!(maxAge >= SIX_MONTHS)) { state = 'weak'; reason = 'hstsShort'; }
            }
            if (id === 'content-security-policy' && value === null && map.has('content-security-policy-report-only')) {
                value = map.get('content-security-policy-report-only');
                state = 'weak';
                reason = 'cspReportOnly';
            }
            if (id === 'x-content-type-options' && value !== null && lower(value).trim() !== 'nosniff') { state = 'weak'; reason = 'nosniff'; }
            // frame-ancestors in the CSP supersedes X-Frame-Options
            if (id === 'x-frame-options' && value === null && csp && /frame-ancestors/i.test(csp)) {
                value = csp.match(/frame-ancestors[^;]*/i)[0].trim();
                state = 'ok';
            }
            if (id === 'referrer-policy' && value !== null && /unsafe-url|no-referrer-when-downgrade/i.test(value)) { state = 'weak'; reason = 'referrer'; }
            return { id, state, value, reason, fix };
        });
    }

    const score = (verdicts) => ({ ok: verdicts.filter(v => v.state === 'ok').length, total: verdicts.length });

    // Stack-describing headers present → [{ name, value, version }] ; version: the value carries a version number
    function leaks(headers) {
        const map = toMap(headers);
        return LEAKS.filter(name => map.has(name)).map(name => ({ name, value: map.get(name), version: /\d/.test(map.get(name)) }));
    }

    // Response as curl -I prints it, redacted headers masked
    function output(protocol, status, headers) {
        const lines = [`${protocol} ${status}`];
        for (const [name, value] of toMap(headers)) lines.push(`${name}: ${redact(name, value)}`);
        return lines.join('\n');
    }

    // "h2" (nextHopProtocol) → "HTTP/2"
    function protocolName(nextHop) {
        const p = lower(nextHop ?? '');
        if (p.startsWith('h3')) return 'HTTP/3';
        if (p === 'h2') return 'HTTP/2';
        if (p === 'http/1.0') return 'HTTP/1.0';
        return 'HTTP/1.1';
    }

    // Seconds → { n, unit: 'year' | 'day' | 'hour' | 'second' }, rounded down
    function duration(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return null;
        if (seconds >= 31536000) return { n: Math.floor(seconds / 31536000), unit: 'year' };
        if (seconds >= 86400) return { n: Math.floor(seconds / 86400), unit: 'day' };
        if (seconds >= 3600) return { n: Math.floor(seconds / 3600), unit: 'hour' };
        return { n: seconds, unit: 'second' };
    }

    return { SECURITY, LEAKS, REDACTED, toMap, redact, kind, parseHsts, audit, score, leaks, output, protocolName, duration };
})();

if (typeof module !== 'undefined') module.exports = CurlCore;

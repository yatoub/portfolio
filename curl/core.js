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

    /* ── Content-Security-Policy ── */
    // Why each external host is allowed: id of the explanation in translations.js (csp.why.*)
    const CSP_HOSTS = {
        'cdn.jsdelivr.net': 'jsdelivr',
        'matomo.yatoub.dev': 'matomo',
        'ipwho.is': 'ipLookup',
        'ipapi.co': 'ipLookup',
        'api.ipify.org': 'ipLookup',
        'cloudflare-dns.com': 'doh',
        'dns.google': 'doh',
    };
    const CSP_KEYWORDS = ['self', 'none', 'unsafe-inline', 'unsafe-eval', 'strict-dynamic'];

    // "default-src 'self'; img-src 'self' data:" → [{ name, sources: ["'self'", …] }], first occurrence of a directive wins
    function parseCsp(value) {
        const seen = new Set();
        return String(value ?? '').split(';').map(part => part.trim().split(/\s+/).filter(Boolean)).filter(tokens => tokens.length)
            .map(([name, ...sources]) => ({ name: lower(name), sources }))
            .filter(d => /^[a-z][a-z-]*$/.test(d.name) && !seen.has(d.name) && seen.add(d.name));
    }

    // One source expression → { kind, host, why }
    // kind: a keyword of CSP_KEYWORDS | 'nonce' | 'hash' | 'scheme' | 'wildcard' | 'host'
    function cspSource(source) {
        const s = String(source);
        const quoted = s.match(/^'(.+)'$/)?.[1];
        if (quoted !== undefined) {
            const k = lower(quoted);
            if (CSP_KEYWORDS.includes(k)) return { kind: k, host: null, why: null };
            if (k.startsWith('nonce-')) return { kind: 'nonce', host: null, why: null };
            if (/^sha(256|384|512)-/.test(k)) return { kind: 'hash', host: null, why: null };
            return { kind: 'host', host: null, why: null };
        }
        if (s === '*') return { kind: 'wildcard', host: null, why: null };
        if (/^[a-z][a-z0-9+.-]*:$/i.test(s)) return { kind: 'scheme', host: null, why: null };
        const host = lower(s).replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/[/:].*$/, '');
        return { kind: 'host', host, why: Object.hasOwn(CSP_HOSTS, host) ? CSP_HOSTS[host] : null };
    }

    // What weakens a policy → ids of the warnings to show (csp.warn.*)
    function cspWarnings(directives) {
        const get = (name) => directives.find(d => d.name === name);
        const has = (d, kind) => Boolean(d) && d.sources.some(s => cspSource(s).kind === kind);
        // A fetch directive that is not set falls back to default-src
        const script = get('script-src') ?? get('default-src');
        const style = get('style-src') ?? get('default-src');
        const out = [];
        if (!directives.length) return out;
        if (!get('default-src')) out.push('noDefault');
        if (has(script, 'unsafe-inline') && !has(script, 'nonce') && !has(script, 'hash')) out.push('unsafeInlineScript');
        if (has(script, 'unsafe-eval')) out.push('unsafeEval');
        if (has(style, 'unsafe-inline')) out.push('unsafeInlineStyle');
        if (directives.some(d => /-src$/.test(d.name) && has(d, 'wildcard'))) out.push('wildcard');
        return out;
    }

    // The policy a response carries → { value, reportOnly } or null
    function cspOf(headers) {
        const map = toMap(headers);
        if (map.has('content-security-policy')) return { value: map.get('content-security-policy'), reportOnly: false };
        if (map.has('content-security-policy-report-only')) return { value: map.get('content-security-policy-report-only'), reportOnly: true };
        return null;
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

    return { SECURITY, LEAKS, REDACTED, CSP_HOSTS, toMap, redact, kind, parseHsts, audit, parseCsp, cspSource, cspWarnings, cspOf, score, leaks, output, protocolName, duration };
})();

if (typeof module !== 'undefined') module.exports = CurlCore;

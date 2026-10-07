/* ═══════════════════════════════════════════
   YATOUB // NC — HTTP typed by hand, pure helpers
   Parses a request written as text, decides what a browser will let
   a page send, formats the response and checks the challenges.
   Requests only ever target this origin: the path is validated here.
   No DOM access here: covered by tools/nc-core.test.mjs.
   ═══════════════════════════════════════════ */

const NcCore = (() => {
    const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'];
    // fetch() refuses these outright
    const REFUSED_METHODS = ['TRACE', 'CONNECT', 'TRACK'];
    // Headers the browser writes itself: a page cannot set or override them
    const MANAGED = ['host', 'user-agent', 'connection', 'content-length', 'cookie', 'origin', 'referer', 'accept-encoding',
        'keep-alive', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'via', 'date', 'dnt', 'expect', 'accept-charset',
        'access-control-request-headers', 'access-control-request-method'];
    const REDACTED = ['x-flag'];    // never echoed: the CTF flag travels in this one
    const MAX_PATH = 200;
    const BODY_CHARS = 600;
    const BODY_LINES = 14;

    const lower = (s) => String(s).toLowerCase();
    const managed = (name) => MANAGED.includes(lower(name)) || /^(sec|proxy)-/i.test(name);

    // A path of this site, never another origin: "//host" and "\\host" would change the host once resolved
    function validPath(path) {
        return typeof path === 'string' && path.length <= MAX_PATH && /^\/(?![/\\])[\x21-\x7e]*$/.test(path) && !path.includes('\\');
    }

    // Text → { ok, method, path, version, headers: [{ name, value, sent }], errors: [id], notes: [id] }
    // errors: the request is not sent. notes: it is sent, with something worth explaining.
    function parse(text, host = 'yatoub.dev') {
        const lines = String(text ?? '').replace(/\r/g, '').split('\n');
        while (lines.length && !lines[0].trim()) lines.shift();
        const out = { ok: false, method: '', path: '', version: '', headers: [], errors: [], notes: [] };
        if (!lines.length) return { ...out, errors: ['empty'] };

        const m = lines[0].trim().match(/^(\S+)\s+(\S+)(?:\s+(\S+))?$/);
        if (!m) return { ...out, errors: ['requestLine'] };
        out.method = m[1].toUpperCase();
        out.path = m[2];
        out.version = m[3] ?? '';

        if (REFUSED_METHODS.includes(out.method)) out.errors.push('refusedMethod');
        else if (!METHODS.includes(out.method)) out.errors.push('unknownMethod');
        if (/^[a-z][a-z0-9+.-]*:/i.test(out.path)) out.errors.push('absoluteUrl');
        else if (!validPath(out.path)) out.errors.push('path');
        if (!out.version) out.notes.push('noVersion');
        else if (!/^HTTP\/(1\.0|1\.1|2|3)$/i.test(out.version)) out.errors.push('version');

        let sawHost = false;
        for (const raw of lines.slice(1)) {
            if (!raw.trim()) break;     // blank line: end of headers ; a body is not supported
            const h = raw.match(/^([!#$%&'*+.^_`|~0-9A-Za-z-]+):\s*(.*)$/);
            if (!h) { out.errors.push('header'); continue; }
            const name = h[1], value = h[2].trim();
            if (lower(name) === 'host') {
                sawHost = true;
                if (lower(value) !== lower(host)) out.notes.push('hostMismatch');
            }
            out.headers.push({ name, value, sent: !managed(name) });
        }
        if (!sawHost && /^HTTP\/1\.1$/i.test(out.version)) out.notes.push('noHost');
        if (out.headers.some(h => !h.sent && lower(h.name) !== 'host')) out.notes.push('managed');

        out.errors = [...new Set(out.errors)];
        out.notes = [...new Set(out.notes)];
        out.ok = out.errors.length === 0;
        return out;
    }

    // Parsed request → what to hand to fetch(). Cookies are left out: this is a bare request, like nc would send.
    function toFetch(req) {
        if (!req.ok) return null;
        return {
            path: req.path,
            init: {
                method: req.method,
                headers: req.headers.filter(h => h.sent).map(h => [h.name, h.value]),
                cache: 'no-store',
                redirect: 'manual',
                credentials: 'omit',
                mode: 'same-origin',
            },
        };
    }

    const statusText = (status) => ({ 200: 'OK', 204: 'No Content', 206: 'Partial Content', 301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified', 308: 'Permanent Redirect',
        400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 412: 'Precondition Failed', 416: 'Range Not Satisfiable', 500: 'Internal Server Error' }[status] ?? '');

    // Response summary → text, as it would scroll in a terminal.
    // res: { protocol, status, headers: [[name, value]], body: string | null, bytes: number, redirected: boolean }
    function format(res) {
        if (res.redirected) return null;    // the caller explains: a page is not shown where a redirect leads
        const lines = [`${res.protocol} ${res.status} ${statusText(res.status)}`.trim()];
        for (const [name, value] of res.headers) lines.push(`${lower(name)}: ${REDACTED.includes(lower(name)) ? '[…]' : value}`);
        lines.push('');
        if (res.body === null) {
            if (res.bytes > 0) lines.push(`[${res.bytes} bytes]`);
        } else if (res.body) {
            const body = res.body.slice(0, BODY_CHARS).split('\n').slice(0, BODY_LINES);
            lines.push(...body);
            if (res.body.length > BODY_CHARS || res.body.split('\n').length > BODY_LINES) lines.push('[…]');
        }
        return lines.join('\n');
    }

    // Is a body worth showing as text ?
    const textual = (contentType) => /^text\/|json|xml|javascript|svg/i.test(contentType ?? '');

    /* ── Challenges: each is passed by a real response ── */
    const header = (req, name) => req.headers.find(h => lower(h.name) === name);
    const CHALLENGES = [
        { id: 'ok', check: (req, res) => req.method === 'GET' && res.status === 200 },
        { id: 'notfound', check: (req, res) => res.status === 404 },
        { id: 'head', check: (req, res) => req.method === 'HEAD' && res.status === 200 },
        { id: 'range', check: (req, res) => res.status === 206 && Boolean(header(req, 'range')) },
        { id: 'cached', check: (req, res) => res.status === 304 },
        { id: 'method', check: (req, res) => res.status === 405 },
    ];
    const IDS = CHALLENGES.map(c => c.id);

    // → ids of the challenges this exchange passes
    function passed(req, res) {
        if (!req?.ok || !res || res.redirected) return [];
        return CHALLENGES.filter(c => c.check(req, res)).map(c => c.id);
    }

    // Stored progress: a JSON list of challenge ids
    function parseProgress(raw) {
        try {
            const list = JSON.parse(raw);
            return Array.isArray(list) ? IDS.filter(id => list.includes(id)) : [];
        } catch { return []; }
    }
    const serializeProgress = (ids) => JSON.stringify(IDS.filter(id => ids.includes(id)));

    return { METHODS, MANAGED, REDACTED, CHALLENGES, validPath, parse, toFetch, format, textual, statusText, passed, parseProgress, serializeProgress };
})();

if (typeof module !== 'undefined') module.exports = NcCore;

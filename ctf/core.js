/* ═══════════════════════════════════════════
   YATOUB // CTF — flag validation, pure helpers
   The page only knows SHA-256 hashes: the flags themselves live where
   the visitor has to go and look. No DOM access here: covered by
   tools/ctf-core.test.mjs.
   ═══════════════════════════════════════════ */

const CtfCore = (() => {
    // Display order. `cmd` is the command shown once the flag is found.
    // header and dns only exist on the server and in the DNS zone: never commit their values.
    const FLAGS = [
        { id: 'robots', hash: 'f60ed850b6f0f934318f183152b0fd4c3c0e19b18cba91d80f324694ac02e69c', cmd: 'curl https://yatoub.dev/robots.txt' },
        { id: 'source', hash: '91871cb0423989e14e534b302dca0836e4adbeea0705b12ebb3d72b6e7d1818e', cmd: 'curl -s -A Mozilla/5.0 https://yatoub.dev/ | grep YATOUB' },
        { id: 'dotfile', hash: '800c3826efb0fc6166e132c18d754f89ec39b5be497559c674f44f75a73ec293', cmd: 'ls -a && cat .env' },
        { id: 'curl', hash: '14ab0677f474899613199afdcf5725d6d622be42c87dc7aac3379e09e0ed3a9c', cmd: 'curl https://yatoub.dev/whoami' },
        { id: 'header', hash: '144e36d9a89fefda8b275704a81bef0501afd46e1d229c4421f327bed6a320ed', cmd: 'curl -sI https://yatoub.dev | grep -i x-flag' },
        { id: 'dns', hash: '5c546760e3ca5ea2a141525055d88029df4cc04085177471cfabafcfb2082b88', cmd: 'dig +short TXT _ctf.yatoub.dev' },
    ];
    const IDS = FLAGS.map(f => f.id);

    // Surrounding whitespace only: case and inner characters are significant
    const normalize = (input) => String(input ?? '').trim();

    // subtle: crypto.subtle in the browser, webcrypto.subtle in the tests
    async function sha256Hex(text, subtle) {
        const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    }

    // → id of the matching flag, or null
    async function check(input, subtle) {
        const value = normalize(input);
        if (!value) return null;
        const hash = await sha256Hex(value, subtle);
        return FLAGS.find(f => f.hash === hash)?.id ?? null;
    }

    /* ── Progress: the stored value is a JSON list of found ids, never the flags ── */
    function cleanIds(ids) {
        if (!Array.isArray(ids)) return [];
        return IDS.filter(id => ids.includes(id));
    }

    function parseProgress(raw) {
        try { return cleanIds(JSON.parse(raw)); }
        catch { return []; }
    }

    const serializeProgress = (ids) => JSON.stringify(cleanIds(ids));

    return { FLAGS, normalize, sha256Hex, check, parseProgress, serializeProgress };
})();

if (typeof module !== 'undefined') module.exports = CtfCore;

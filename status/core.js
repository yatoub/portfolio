/* ═══════════════════════════════════════════
   YATOUB // STATUS — pure helpers
   Shared by /status/ and the homepage navbar dot.
   No DOM access here: covered by tools/status-core.test.mjs.
   ═══════════════════════════════════════════ */

const StatusCore = (() => {
    // The exporter runs every 5 min ; past 15 min the file is not trusted anymore
    const STALE_MS = 15 * 60 * 1000;
    // Tolerated clock drift between the exporter and whoever provides "now"
    const SKEW_MS = 5 * 60 * 1000;

    // → { state: 'up' | 'degraded' | 'down' | 'stale' | 'unknown', down, total, age }
    function summarize(data, now = Date.now()) {
        if (!data || !Array.isArray(data.services) || !data.services.length) {
            return { state: 'unknown', down: 0, total: 0, age: null };
        }
        const total = data.services.length;
        const age = now - Date.parse(data.generated_at);
        if (!(age >= -SKEW_MS && age < STALE_MS)) return { state: 'stale', down: 0, total, age: Number.isNaN(age) ? null : age };

        const down = data.services.filter(s => s.state !== 'up').length;
        const state = down === 0 ? 'up' : down === total ? 'down' : 'degraded';
        return { state, down, total, age };
    }

    // Daily availability ratio (0..1, null = no data) → bar colour class
    function dayClass(v) {
        if (v === null || v === undefined || Number.isNaN(v)) return 'nodata';
        if (v >= 0.999) return 'ok';
        if (v >= 0.95) return 'warn';
        return 'bad';
    }

    // Floored, so 99.999 % never reads as a perfect 100.00
    function fmtUptime(ratio) {
        if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return null;
        return (Math.floor(ratio * 10000 + 1e-6) / 100).toFixed(2);
    }

    return { STALE_MS, SKEW_MS, summarize, dayClass, fmtUptime };
})();

if (typeof module !== 'undefined') module.exports = StatusCore;

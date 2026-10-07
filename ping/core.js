/* ═══════════════════════════════════════════
   YATOUB // PING — round-trip statistics, pure helpers
   A browser cannot send ICMP: the page times small HTTP requests on
   the already open connection instead. No DOM access here: covered
   by tools/ping-core.test.mjs.
   ═══════════════════════════════════════════ */

const PingCore = (() => {
    const COUNT = 10;
    // Light in optical fibre travels at about two thirds of c: 200 km per millisecond
    const KM_PER_MS = 200;

    const round = (ms) => Math.round(ms * 10) / 10;
    const valid = (v) => Number.isFinite(v) && v > 0;

    // Resource Timing entry → time between sending the request and the first byte back, or null.
    // Connection setup and queueing are left out: this is the closest a page gets to a network round trip.
    function sample(entry) {
        if (!entry || !valid(entry.requestStart) || !valid(entry.responseStart)) return null;
        const ms = entry.responseStart - entry.requestStart;
        return ms > 0 ? round(ms) : null;
    }

    // samples: one value per request sent, null when it got no answer
    // → { sent, received, loss (%), min, avg, max, mdev } — the last four null when nothing came back
    function stats(samples) {
        const sent = samples.length;
        const ok = samples.filter(valid);
        const received = ok.length;
        const loss = sent ? Math.round(((sent - received) / sent) * 100) : 0;
        if (!received) return { sent, received, loss, min: null, avg: null, max: null, mdev: null };

        const avg = ok.reduce((a, b) => a + b, 0) / received;
        // Mean deviation, as ping(8) reports it: how far samples stray from the average
        const mdev = ok.reduce((a, b) => a + Math.abs(b - avg), 0) / received;
        return { sent, received, loss, min: round(Math.min(...ok)), avg: round(avg), max: round(Math.max(...ok)), mdev: round(mdev) };
    }

    // Upper bound on the distance to the server: the signal has to go there and back within the round trip.
    // Rounded up to two significant digits — an upper bound must never be understated.
    function maxDistanceKm(rttMs) {
        if (!valid(rttMs)) return null;
        const km = (rttMs / 2) * KM_PER_MS;
        const step = 10 ** Math.max(0, Math.floor(Math.log10(km)) - 1);
        return Math.ceil(km / step) * step;
    }

    // Lowest round trip physics allows for a given distance
    const minRttMs = (km) => round((km * 2) / KM_PER_MS);

    // Bar heights as 0..1 of the slowest answer ; lost requests have no height
    function heights(samples) {
        const max = Math.max(0, ...samples.filter(valid));
        return samples.map(v => (valid(v) && max ? v / max : 0));
    }

    return { COUNT, KM_PER_MS, sample, stats, maxDistanceKm, minRttMs, heights };
})();

if (typeof module !== 'undefined') module.exports = PingCore;

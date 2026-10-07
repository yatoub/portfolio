/* ═══════════════════════════════════════════
   YATOUB // TRACEROUTE — the round trips of a page load, pure helpers
   A browser cannot time each hop, but it knows how many round trips
   it made and how long each one took. This turns the phases computed
   by /tcpdump/core.js into trips along a fixed chain of nodes.
   Roles only on the server side: no IP, no VLAN id.
   No DOM access here: covered by tools/traceroute-core.test.mjs.
   ═══════════════════════════════════════════ */

const TracerouteCore = (() => {
    // The chain a packet follows, in order. side: whose network the node belongs to.
    // 'net' stands for every router in between, which nothing on this page can see.
    const CHAIN = [
        { id: 'device', side: 'you' },
        { id: 'lan', side: 'you' },
        { id: 'isp', side: 'you' },
        { id: 'net', side: 'net' },
        { id: 'edge', side: 'server' },
        { id: 'fw', side: 'server' },
        { id: 'proxy', side: 'server' },
        { id: 'site', side: 'server' },
    ];
    // The resolver is a side trip: it hangs off the visitor's provider, not off the route to the server
    const BRANCH = { id: 'resolver', side: 'you', from: 'isp' };
    const NODES = [...CHAIN, BRANCH];

    // Node ids from the device to the target, both included
    function pathTo(target) {
        if (target === BRANCH.id) return [...pathTo(BRANCH.from), BRANCH.id];
        const i = CHAIN.findIndex(n => n.id === target);
        return i < 0 ? [] : CHAIN.slice(0, i + 1).map(n => n.id);
    }

    const edges = (path) => path.slice(1).map((to, i) => [path[i], to]);
    const edgeId = (from, to) => `${from}>${to}`;

    // Which phase of the load is which trip, and where it turns back
    const TRIPS = [
        { id: 'dns', phase: 'dns', to: 'resolver' },
        { id: 'transport', phase: 'tcp', to: 'proxy' },
        { id: 'tls', phase: 'tls', to: 'proxy' },
        { id: 'http', phase: 'wait', to: 'site' },
    ];

    // wf: result of TcpdumpCore.waterfall() → [{ id, to, path, ms, state }]
    // state: 'measured' | 'reused' (no trip: the connection was already open) | 'none' (does not apply)
    function trips(wf) {
        const phases = new Map((wf?.phases ?? []).map(p => [p.id, p]));
        return TRIPS.map(({ id, phase, to }) => {
            const p = phases.get(phase);
            const state = p?.state ?? 'none';
            return { id, to, path: pathTo(to), ms: state === 'measured' ? p.duration : null, state };
        });
    }

    // What the load cost in round trips → { count, ms } over the trips that really happened
    function summary(list) {
        const done = list.filter(t => t.state === 'measured');
        return { count: done.length, ms: Math.round(done.reduce((sum, t) => sum + t.ms, 0) * 10) / 10 };
    }

    // Position of a packet along a trip: 0 → 1 going out, 1 → 2 coming back.
    // → { index: edge being travelled, t: 0..1 along it, back: boolean }
    function locate(progress, edgeCount) {
        if (!(edgeCount > 0)) return null;
        const p = Math.min(Math.max(progress, 0), 2);
        const back = p > 1;
        const along = (back ? 2 - p : p) * edgeCount;
        const index = Math.min(Math.floor(along), edgeCount - 1);
        return { index, t: along - index, back };
    }

    return { CHAIN, BRANCH, NODES, TRIPS, pathTo, edges, edgeId, trips, summary, locate };
})();

if (typeof module !== 'undefined') module.exports = TracerouteCore;

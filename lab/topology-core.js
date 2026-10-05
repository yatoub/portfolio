/* ═══════════════════════════════════════════
   YATOUB // LAB — topology, pure helpers
   Turns a services.json entry into the ordered stages of a request.
   No DOM access here: covered by tools/topology-core.test.mjs.
   ═══════════════════════════════════════════ */

const TopologyCore = (() => {
    // Stage = { step: i18n key under lab.topo.step, edge: [from, to] | null, kind: 'flow' | 'auth' }
    // Node ids: client, vpn, fw, proxy, auth, or the service id.
    function route(svc) {
        const entry = svc.vpn ? 'vpn' : 'client';
        const stages = [
            { step: svc.vpn ? 'vpn' : 'public', edge: [entry, 'fw'], kind: 'flow' },
            { step: svc.vpn ? 'fwVpn' : 'fw', edge: ['fw', 'proxy'], kind: 'flow' },
            { step: 'tls', edge: null, kind: 'flow' },
        ];

        if (svc.auth === 'forward' || svc.auth === 'forward-1fa') {
            stages.push(
                { step: svc.auth, edge: ['proxy', 'auth'], kind: 'auth' },
                { step: 'granted', edge: ['proxy', svc.id], kind: 'flow' },
            );
        } else {
            stages.push({ step: 'direct', edge: ['proxy', svc.id], kind: 'flow' });
            // OIDC: the application itself talks to the identity provider
            if (svc.auth === 'oidc') stages.push({ step: 'oidc', edge: [svc.id, 'auth'], kind: 'auth' });
        }
        return stages;
    }

    const edgeId = (from, to) => `${from}>${to}`;

    return { route, edgeId };
})();

if (typeof module !== 'undefined') module.exports = TopologyCore;

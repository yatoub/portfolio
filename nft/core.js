/* ═══════════════════════════════════════════
   YATOUB // NFT — a firewall game, pure helpers
   Levels are fixed waves of packets ; a ruleset is evaluated against
   them the way nftables walks a chain: first matching rule wins,
   otherwise the chain policy applies.
   No DOM access here: covered by tools/nft-core.test.mjs.
   ═══════════════════════════════════════════ */

const NftCore = (() => {
    /* ── Packets ──
       { proto, dport, src, state, good, who }
       src: id of the sender (rate limiting counts per source)
       who: key of the label shown to the player (translations: who.*)
       good: true = must pass, false = must be stopped, null = either is fine */
    const pkt = (who, proto, dport, good, extra = {}) => ({ who, proto, dport, good, src: extra.src ?? who, state: extra.state ?? 'new' });
    const times = (n, make) => Array.from({ length: n }, (_, i) => make(i));
    // Deterministic interleaving: the wave must look mixed, and be the same on every run
    function mix(...groups) {
        const out = [];
        const queues = groups.map(g => [...g]);
        while (queues.some(q => q.length)) for (const q of queues) if (q.length) out.push(q.shift());
        return out.map((p, i) => ({ ...p, id: i }));
    }

    const LEVELS = [
        {
            id: 'ports',
            palette: [['dport', 80], ['dport', 443], ['dport', 22], ['dport', 23], ['dport', 3306], ['dport', 3389]],
            packets: mix(
                times(4, i => pkt('visitor', 'tcp', 443, true, { src: `v${i}` })),
                times(3, i => pkt('ssh', 'tcp', 22, false, { src: `b${i}` })),
                times(2, i => pkt('visitor', 'tcp', 80, true, { src: `w${i}` })),
                times(2, i => pkt('telnet', 'tcp', 23, false, { src: `t${i}` })),
                times(2, i => pkt('mysql', 'tcp', 3306, false, { src: `m${i}` })),
                [pkt('rdp', 'tcp', 3389, false)],
            ),
        },
        {
            id: 'admin',
            palette: [['dport', 443], ['dport', 22], ['src', 'you']],
            packets: mix(
                times(3, i => pkt('visitor', 'tcp', 443, true, { src: `v${i}` })),
                times(4, i => pkt('ssh', 'tcp', 22, false, { src: `b${i}` })),
                times(2, () => pkt('you', 'tcp', 22, true, { src: 'you' })),
            ),
        },
        {
            id: 'state',
            palette: [['dport', 443], ['dport', 53124], ['dport', 48211], ['state', 'established'], ['state', 'new']],
            packets: mix(
                times(3, i => pkt('visitor', 'tcp', 443, true, { src: `v${i}` })),
                times(3, () => pkt('dnsReply', 'udp', 53124, true, { src: 'resolver', state: 'established' })),
                times(2, i => pkt('scan', 'udp', 53124, false, { src: `s${i}` })),
                times(2, () => pkt('updateReply', 'tcp', 48211, true, { src: 'mirror', state: 'established' })),
                times(2, i => pkt('scan', 'tcp', 48211, false, { src: `x${i}` })),
            ),
        },
        {
            id: 'rate',
            palette: [['dport', 443], ['rate', 5], ['rate', 20]],
            // One source hammers the same open port: its first packets look like anyone's
            packets: mix(
                times(14, i => pkt('flood', 'tcp', 443, i < 5 ? null : false, { src: 'flooder' })),
                times(8, i => pkt('visitor', 'tcp', 443, true, { src: `v${i % 4}` })),
            ),
        },
    ];
    const IDS = LEVELS.map(l => l.id);

    /* ── Rules ──
       { conds: [[type, value], …] (all must hold, none = everything), action: 'accept' | 'drop' }
       types: dport (number) · src (sender id) · state ('new' | 'established') · rate (packets per source above which it matches) */
    const TYPES = ['dport', 'src', 'state', 'rate'];
    const validCond = (c) => Array.isArray(c) && c.length === 2 && TYPES.includes(c[0])
        && (c[0] === 'dport' || c[0] === 'rate' ? Number.isInteger(c[1]) && c[1] >= 0 : typeof c[1] === 'string');
    const validRule = (r) => Boolean(r) && ['accept', 'drop'].includes(r.action) && Array.isArray(r.conds) && r.conds.length <= 2 && r.conds.every(validCond);
    const validRuleset = (s) => Boolean(s) && ['accept', 'drop'].includes(s.policy) && Array.isArray(s.rules) && s.rules.length <= 12 && s.rules.every(validRule);

    function matches([type, value], packet, seen) {
        if (type === 'dport') return packet.dport === value;
        if (type === 'src') return packet.src === value;
        if (type === 'state') return packet.state === value;
        if (type === 'rate') return seen > value;       // "limit rate over N": true once the source has sent more than N
        return false;
    }

    // → [{ packet, verdict: 'accept' | 'drop', rule: index | null (policy) }]
    function evaluate(ruleset, packets) {
        const counts = new Map();
        return packets.map((packet) => {
            const seen = (counts.get(packet.src) ?? 0) + 1;
            counts.set(packet.src, seen);
            const index = ruleset.rules.findIndex(r => r.conds.every(c => matches(c, packet, seen)));
            return { packet, verdict: index < 0 ? ruleset.policy : ruleset.rules[index].action, rule: index < 0 ? null : index };
        });
    }

    // → { leaked: attacks let through, blocked: legitimate packets stopped, won }
    function score(results) {
        const leaked = results.filter(r => r.packet.good === false && r.verdict === 'accept').length;
        const blocked = results.filter(r => r.packet.good === true && r.verdict === 'drop').length;
        return { leaked, blocked, won: leaked === 0 && blocked === 0 };
    }

    /* ── nftables syntax ── */
    const NFT = {
        dport: (v, proto) => `${proto} dport ${v}`,
        // The administrator's address is a named set, as one would write it for real
        src: (v) => `ip saddr @${v === 'you' ? 'admin' : v}`,
        state: (v) => `ct state ${v}`,
        rate: (v) => `limit rate over ${v}/second`,
    };
    // proto: which protocol a port condition is written for ; ports of a level all use one, given by its packets
    function ruleText(rule, protoOf = () => 'tcp') {
        const conds = rule.conds.map(([type, value]) => NFT[type](value, protoOf(value)));
        return [...conds, rule.action].join(' ');
    }
    function rulesetText(ruleset, level) {
        const protoOf = (port) => level?.packets.find(p => p.dport === port)?.proto ?? 'tcp';
        return ['table inet filter {', '    chain input {', `        type filter hook input priority 0; policy ${ruleset.policy};`,
            ...ruleset.rules.map(r => `        ${ruleText(r, protoOf)}`), '    }', '}'].join('\n');
    }

    const level = (id) => LEVELS.find(l => l.id === id) ?? null;
    const empty = () => ({ policy: 'accept', rules: [] });

    // Stored progress: a JSON list of level ids
    function parseProgress(raw) {
        try {
            const list = JSON.parse(raw);
            return Array.isArray(list) ? IDS.filter(id => list.includes(id)) : [];
        } catch { return []; }
    }
    const serializeProgress = (ids) => JSON.stringify(IDS.filter(id => ids.includes(id)));

    return { LEVELS, TYPES, level, empty, validRule, validRuleset, evaluate, score, ruleText, rulesetText, parseProgress, serializeProgress };
})();

if (typeof module !== 'undefined') module.exports = NftCore;

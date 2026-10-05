/* ── i18n translations ──
   ⚠ Chaînes contenant une apostrophe : délimiteurs "…" obligatoires.
   {x} = variable injectée par tf(). */
const translations = {
    fr: {
        hero: {
            title: 'ÉTAT DU HOMELAB',
            sub: 'Disponibilité de mes services auto-hébergés, mesurée en continu par des sondes Blackbox et stockée dans VictoriaMetrics.',
        },
        state: {
            up: 'TOUS LES SYSTÈMES SONT OPÉRATIONNELS',
            degraded: '{n} SERVICE(S) EN PANNE SUR {total}',
            down: 'PANNE GÉNÉRALE',
            stale: 'DONNÉES PÉRIMÉES',
            unknown: 'AUCUNE DONNÉE',
            loading: 'INTERROGATION…',
        },
        nav: { up: 'OPÉRATIONNEL', degraded: 'DÉGRADÉ', down: 'EN PANNE', stale: 'INCONNU', unknown: 'INCONNU', loading: 'SCAN…' },
        pill: { up: 'EN LIGNE', down: 'EN PANNE', unknown: 'INCONNU' },
        meta: {
            updated: 'Dernière mesure : {when}',
            staleHint: "L'export n'a pas tourné depuis plus de 15 minutes : l'état réel est inconnu.",
            noneHint: "Le fichier d'état est introuvable ou illisible.",
            justNow: "à l'instant",
            minutes: 'il y a {n} min',
            hours: 'il y a {n} h',
            days: 'il y a {n} j',
        },
        row: { uptime: 'sur {n} jours', latency: 'latence', nodata: 'aucune mesure', ago: 'il y a {n} j', today: "aujourd'hui" },
        legend: { ok: '≥ 99,9 %', warn: '≥ 95 %', bad: '< 95 %', nodata: 'pas de donnée' },
        foot: {
            scope: '// les sondes partent du réseau local : cette page mesure la disponibilité interne, pas la joignabilité depuis Internet.',
            privacy: '// aucune adresse IP ni nom de machine interne ne figure dans les données publiées.',
        },
    },

    en: {
        hero: {
            title: 'HOMELAB STATUS',
            sub: 'Availability of my self-hosted services, continuously measured by Blackbox probes and stored in VictoriaMetrics.',
        },
        state: {
            up: 'ALL SYSTEMS OPERATIONAL',
            degraded: '{n} OF {total} SERVICE(S) DOWN',
            down: 'MAJOR OUTAGE',
            stale: 'STALE DATA',
            unknown: 'NO DATA',
            loading: 'QUERYING…',
        },
        nav: { up: 'OPERATIONAL', degraded: 'DEGRADED', down: 'DOWN', stale: 'UNKNOWN', unknown: 'UNKNOWN', loading: 'SCAN…' },
        pill: { up: 'ONLINE', down: 'DOWN', unknown: 'UNKNOWN' },
        meta: {
            updated: 'Last measurement: {when}',
            staleHint: 'The exporter has not run for more than 15 minutes: the real state is unknown.',
            noneHint: 'The status file is missing or unreadable.',
            justNow: 'just now',
            minutes: '{n} min ago',
            hours: '{n} h ago',
            days: '{n} d ago',
        },
        row: { uptime: 'over {n} days', latency: 'latency', nodata: 'no measurement', ago: '{n} d ago', today: 'today' },
        legend: { ok: '≥ 99.9%', warn: '≥ 95%', bad: '< 95%', nodata: 'no data' },
        foot: {
            scope: '// probes run from the local network: this page measures internal availability, not reachability from the Internet.',
            privacy: '// no internal IP address or hostname appears in the published data.',
        },
    },
};

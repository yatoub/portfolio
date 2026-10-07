/* ── i18n translations ──
   ⚠ Chaînes contenant une apostrophe : délimiteurs "…" obligatoires.
   pages.* : une entrée par page de ManCore.PAGES (core.js). */
const translations = {
    fr: {
        head: { center: 'Manuel de yatoub.dev' },
        sec: { name: 'NOM', synopsis: 'SYNOPSIS', description: 'DESCRIPTION', commands: 'COMMANDES', files: 'FICHIERS', see: 'VOIR AUSSI', author: 'AUTEUR' },
        name: "yatoub.dev — portfolio d'un administrateur systèmes, et quelques pages qui montrent le réseau de l'intérieur",
        desc: {
            p1: "Ce site est servi par un Caddy auto-hébergé, sur un homelab Proxmox. Au-delà du portfolio, plusieurs pages portent le nom d'une commande Linux et font ce que fait la commande, sur le site lui-même ou sur votre propre connexion.",
            p2: "Les valeurs affichées sont réelles et mesurées à l'instant : rien n'est simulé. Ce qui vous concerne est calculé dans votre navigateur et n'est pas conservé.",
            p3: "La page d'accueil embarque aussi un terminal (bouton >_ ou Ctrl+K) : ls, cat et open y parcourent le même contenu.",
        },
        restricted: 'authentification requise',
        pages: {
            whoami: "Tout ce qu'un site apprend de vous sans rien demander : navigateur, matériel, empreinte, et ce que le serveur voit avant la moindre ligne de JavaScript.",
            tcpdump: "Votre requête disséquée : la durée réelle de chaque étape du chargement, ce qu'un tiers sur le chemin lit en clair, et la suite cryptographique décodée.",
            ping: "Le temps d'aller-retour entre vous et ce serveur, et la distance maximale qu'il autorise.",
            dig: "Les enregistrements DNS de la zone, interrogés en direct auprès de deux résolveurs publics et expliqués un par un.",
            curl: "Les en-têtes que ce serveur renvoie, ligne par ligne, et l'audit de ceux qui protègent le visiteur.",
            tail: "Le bruit de fond d'Internet : ce que les robots viennent chercher ici, à quel rythme et d'où.",
            status: "L'état en direct des services du homelab et leur disponibilité sur 90 jours.",
            lab: 'Les services auto-hébergés et le schéma du trajet des requêtes.',
        },
        files: {
            resume: 'le CV en texte brut ; aussi renvoyé par curl https://yatoub.dev',
            robots: 'les consignes aux robots',
            security: 'le contact pour signaler une vulnérabilité',
            sitemap: 'les pages indexables',
            homelab: 'la liste publique des services du homelab',
        },
        see: {
            intro: 'Tout ne figure pas dans un manuel.',
            github: 'le code source de ce site',
        },
        author: 'Paul Collin (Yatoub), administrateur systèmes / DevOps.',
    },

    en: {
        head: { center: 'yatoub.dev Manual' },
        sec: { name: 'NAME', synopsis: 'SYNOPSIS', description: 'DESCRIPTION', commands: 'COMMANDS', files: 'FILES', see: 'SEE ALSO', author: 'AUTHOR' },
        name: 'yatoub.dev — a systems administrator portfolio, and a few pages that show the network from the inside',
        desc: {
            p1: 'This site is served by a self-hosted Caddy, on a Proxmox homelab. Beyond the portfolio, several pages are named after a Linux command and do what the command does, on the site itself or on your own connection.',
            p2: 'The values shown are real and measured on the spot: nothing is simulated. What concerns you is computed in your browser and is not kept.',
            p3: 'The home page also embeds a terminal (>_ button or Ctrl+K): ls, cat and open browse the same content.',
        },
        restricted: 'authentication required',
        pages: {
            whoami: 'Everything a site learns about you without asking: browser, hardware, fingerprint, and what the server sees before a single line of JavaScript runs.',
            tcpdump: 'Your request dissected: how long each loading step really took, what a third party on the path reads in clear, and the cipher suite decoded.',
            ping: 'The round-trip time between you and this server, and the maximum distance it allows.',
            dig: 'The DNS records of the zone, queried live from two public resolvers and explained one by one.',
            curl: 'The headers this server sends back, line by line, and the audit of those that protect the visitor.',
            tail: 'The background noise of the Internet: what bots come looking for here, how often and from where.',
            status: 'Live state of the homelab services and their availability over 90 days.',
            lab: 'The self-hosted services and the diagram of the request path.',
        },
        files: {
            resume: 'the resume in plain text; also returned by curl https://yatoub.dev',
            robots: 'instructions for crawlers',
            security: 'the contact for reporting a vulnerability',
            sitemap: 'the indexable pages',
            homelab: 'the public list of homelab services',
        },
        see: {
            intro: 'Not everything is in a manual.',
            github: 'the source code of this site',
        },
        author: 'Paul Collin (Yatoub), systems administrator / DevOps.',
    },
};

/* ── i18n translations ──
   ⚠ Chaînes contenant une apostrophe : délimiteurs "…" obligatoires.
   {x} = variable injectée par tf(). */
const translations = {
    fr: {
        hero: {
            title: 'PING',
            sub: "Combien de temps met un signal pour aller de votre appareil à ce serveur et en revenir ? La page le mesure dix fois sur votre connexion. Ce temps dit plus qu'il n'y paraît : rien ne va plus vite que la lumière, donc il borne la distance qui nous sépare.",
        },
        out: {
            head: 'PING yatoub.dev : HEAD /robots.txt, {n} requêtes sur la connexion ouverte',
            line: 'réponse de yatoub.dev : seq={seq} proto={proto} temps={ms} ms',
            lost: 'seq={seq} : pas de réponse',
            stats: '--- statistiques ping yatoub.dev ---',
            summary: '{sent} requêtes envoyées, {received} réponses, {loss} % de perte',
            rtt: 'aller-retour min/moy/max/écart = {min}/{avg}/{max}/{mdev} ms',
            running: 'mesure en cours…',
        },
        again: '[ relancer la mesure ]',
        stat: { min: 'meilleur aller-retour', avg: 'moyenne', mdev: 'gigue (écart moyen)', ms: '{n} ms' },
        dist: {
            title: 'CE QUE CE TEMPS IMPOSE',
            bound: 'Ce serveur est à moins de {km} km de vous.',
            how: "Dans une fibre optique, la lumière parcourt environ 200 km par milliseconde. En {ms} ms, le signal a dû faire l'aller et le retour : il n'a pas pu s'éloigner de plus de {km} km.",
            formula: 'distance ≤ (aller-retour ÷ 2) × 200 km/ms',
            real: "La distance réelle est bien plus courte. Le trajet n'est pas une ligne droite, chaque routeur ajoute un délai, et le dernier segment pèse lourd : quelques millisecondes en Wi-Fi, plusieurs dizaines en 4G.",
            none: "Aucune réponse n'est revenue : impossible de borner la distance.",
            refs: 'Le minimum que la physique autorise',
            ref: { city: 'Paris ↔ Marseille (660 km)', ocean: 'Paris ↔ New York (5 800 km)', half: "à l'autre bout de la Terre (20 000 km)" },
        },
        sec: { measure: 'MESURE', distance: 'DISTANCE', notes: 'LECTURE' },
        note: {
            icmp: { name: "Ce n'est pas un vrai ping", text: "La commande ping envoie des paquets ICMP, ce qu'un navigateur ne sait pas faire. La page chronomètre à la place une petite requête HTTP sur la connexion déjà ouverte, entre l'envoi et le premier octet de la réponse. Le serveur y ajoute son temps de traitement, de l'ordre d'une fraction de milliseconde pour un fichier statique." },
            jitter: { name: 'La gigue', text: "L'écart moyen dit si le temps de trajet est stable. Une gigue faible suffit pour naviguer ; une gigue élevée dégrade tout ce qui est en temps réel : visioconférence, jeu en ligne, voix sur IP." },
            loss: { name: 'La perte', text: "Une requête sans réponse au bout de trois secondes est comptée comme perdue. Sur HTTP c'est rare : TCP retransmet ce qui se perd, et la perte se voit alors comme un temps anormalement long plutôt que comme un trou." },
            first: { name: 'Le minimum compte plus que la moyenne', text: "Les mesures lentes viennent d'une file d'attente quelque part sur le chemin. La plus rapide est celle où rien n'a attendu : c'est elle qui approche le mieux le temps de trajet pur." },
        },
        unsupported: "Ce navigateur n'expose pas les durées détaillées : les temps affichés incluent le traitement du navigateur et sont surestimés.",
        foot: {
            local: "// rien n'est stocké ni envoyé : dix requêtes HEAD vers /robots.txt, chronométrées par votre navigateur.",
            more: '// la durée de chaque étape de la connexion :',
        },
    },

    en: {
        hero: {
            title: 'PING',
            sub: 'How long does a signal take to go from your device to this server and back? The page measures it ten times on your connection. That time says more than it seems: nothing travels faster than light, so it bounds the distance between us.',
        },
        out: {
            head: 'PING yatoub.dev: HEAD /robots.txt, {n} requests on the open connection',
            line: 'reply from yatoub.dev: seq={seq} proto={proto} time={ms} ms',
            lost: 'seq={seq}: no answer',
            stats: '--- yatoub.dev ping statistics ---',
            summary: '{sent} requests sent, {received} answered, {loss}% loss',
            rtt: 'round trip min/avg/max/mdev = {min}/{avg}/{max}/{mdev} ms',
            running: 'measuring…',
        },
        again: '[ measure again ]',
        stat: { min: 'best round trip', avg: 'average', mdev: 'jitter (mean deviation)', ms: '{n} ms' },
        dist: {
            title: 'WHAT THAT TIME IMPLIES',
            bound: 'This server is less than {km} km away from you.',
            how: 'In optical fibre, light covers about 200 km per millisecond. In {ms} ms the signal had to go there and back: it cannot have travelled further than {km} km away.',
            formula: 'distance ≤ (round trip ÷ 2) × 200 km/ms',
            real: 'The real distance is much shorter. The route is not a straight line, every router adds a delay, and the last hop weighs a lot: a few milliseconds on Wi-Fi, several dozen on 4G.',
            none: 'No answer came back: the distance cannot be bounded.',
            refs: 'The minimum physics allows',
            ref: { city: 'Paris ↔ Marseille (660 km)', ocean: 'Paris ↔ New York (5,800 km)', half: 'the other side of the Earth (20,000 km)' },
        },
        sec: { measure: 'MEASURE', distance: 'DISTANCE', notes: 'READING' },
        note: {
            icmp: { name: 'This is not a real ping', text: 'The ping command sends ICMP packets, which a browser cannot do. The page times a small HTTP request on the already open connection instead, from sending it to the first byte of the answer. The server adds its processing time, a fraction of a millisecond for a static file.' },
            jitter: { name: 'Jitter', text: 'The mean deviation tells whether travel time is stable. Low jitter is enough for browsing; high jitter degrades anything real-time: video calls, online games, voice over IP.' },
            loss: { name: 'Loss', text: 'A request without an answer after three seconds is counted as lost. Over HTTP that is rare: TCP retransmits what gets lost, so loss shows up as an abnormally long time rather than a gap.' },
            first: { name: 'The minimum matters more than the average', text: 'Slow samples come from a queue somewhere on the path. The fastest one is the one where nothing waited: it is the closest to pure travel time.' },
        },
        unsupported: 'This browser does not expose detailed timings: the times shown include browser processing and are overestimated.',
        foot: {
            local: '// nothing is stored or sent: ten HEAD requests to /robots.txt, timed by your browser.',
            more: '// how long each step of the connection takes:',
        },
    },
};

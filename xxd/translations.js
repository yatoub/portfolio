/* ── i18n translations ──
   ⚠ Chaînes contenant une apostrophe : délimiteurs "…" obligatoires.
   {x} = variable injectée par tf().
   field.<couche>.<nom> : une entrée par champ produit par XxdCore.build() (core.js). */
const translations = {
    fr: {
        hero: {
            title: 'XXD',
            sub: "Un paquet n'est qu'une suite d'octets. Voici celui que votre navigateur envoie pour ouvrir une connexion chiffrée vers ce site, reconstruit avec vos vraies adresses : chaque octet a un rôle, et presque tous sont lisibles par n'importe qui sur le chemin.",
        },
        sec: { packet: 'PAQUET', honest: 'RECONSTITUTION' },
        tab: {
            hello: '1 · ClientHello',
            data: '2 · Données',
            helloDesc: "Le premier message de la poignée de main TLS. Rien n'y est encore chiffré : cherchez le nom du site dans la colonne de droite.",
            dataDesc: "Un paquet envoyé une fois la connexion établie. Les en-têtes de transport sont toujours en clair ; le contenu, lui, n'est plus que du bruit.",
        },
        dump: {
            hint: 'Survolez un octet ou un champ pour voir à quoi il sert.',
            bytes: 'octets {from} à {to}',
            byte: 'octet {from}',
            clear: 'en clair',
            encrypted: 'chiffré',
            size: '{n} octets',
        },
        layer: {
            eth: { name: 'Ethernet', what: 'Le saut local : de votre appareil à votre box. Cette enveloppe est remplacée à chaque routeur.' },
            ip: { name: 'IPv4', what: "L'adressage de bout en bout : qui envoie, à qui. C'est ce que lisent tous les routeurs du chemin." },
            tcp: { name: 'TCP', what: 'La conversation : quel programme parle à quel service, et dans quel ordre remettre les morceaux.' },
            tls: { name: 'TLS', what: 'Le chiffrement. Sa négociation se fait à découvert ; ce qui suit ne se lit plus.' },
        },
        field: {
            eth: {
                dst: { name: 'MAC destination', what: "L'adresse matérielle du prochain saut : votre box, pas le serveur." },
                src: { name: 'MAC source', what: "L'adresse matérielle de votre carte réseau. Elle ne dépasse jamais votre réseau local." },
                type: { name: 'Type', what: "Ce que contient la trame : 0x0800, de l'IPv4." },
            },
            ip: {
                head: { name: 'Version et en-tête', what: "Version 4, en-tête de 20 octets, pas de priorité particulière." },
                len: { name: 'Longueur totale', what: "La taille du paquet, en-tête IP compris. Un observateur lit donc la taille de ce que vous échangez." },
                id: { name: 'Identifiant et drapeaux', what: 'Un numéro de paquet, et le drapeau « ne pas fragmenter ».' },
                ttl: { name: 'TTL', what: "Le compteur de sauts : 64 au départ, moins un à chaque routeur. C'est lui que détourne traceroute." },
                proto: { name: 'Protocole', what: 'Ce que transporte le paquet : 6, du TCP.' },
                sum: { name: 'Somme de contrôle', what: "Vérifie l'en-tête IP. Recalculée à chaque routeur, puisque le TTL change." },
                src: { name: 'Adresse source', what: "Votre adresse publique. Sans elle, la réponse ne saurait pas où revenir : elle ne peut pas être cachée." },
                dst: { name: 'Adresse destination', what: "L'adresse publique de ce serveur, celle que le DNS vous a donnée." },
            },
            tcp: {
                sport: { name: 'Port source', what: "Un port choisi au hasard par votre système pour cette connexion. C'est par lui que la réponse retrouve le bon onglet." },
                dport: { name: 'Port destination', what: '443 : du HTTPS. Le numéro seul dit déjà quel service vous utilisez.' },
                seq: { name: 'Numéro de séquence', what: "La position de ces octets dans le flux. Permet de remettre dans l'ordre et de redemander ce qui s'est perdu." },
                ack: { name: "Numéro d'acquittement", what: "Jusqu'où vous avez bien reçu ce que le serveur a envoyé." },
                flags: { name: 'Drapeaux', what: "PSH et ACK : des données à remettre tout de suite, et un accusé de réception." },
                win: { name: 'Fenêtre', what: "Combien d'octets vous acceptez de recevoir avant le prochain accusé : le contrôle de débit." },
                sum: { name: 'Somme de contrôle', what: "Vérifie l'en-tête TCP et les données, adresses IP comprises." },
                urg: { name: 'Pointeur urgent', what: 'Un vestige : à zéro, comme presque toujours.' },
            },
            tls: {
                rec: { name: 'Enregistrement TLS', what: "Le type de message, la version annoncée et la longueur. Lisible même sur une connexion établie : c'est ce qui permet de reconnaître du TLS." },
                payload: { name: 'Contenu chiffré', what: "Votre requête HTTP : chemin demandé, en-têtes, cookies. Sans la clé de session, ces octets sont indiscernables du hasard." },
            },
            hs: {
                head: { name: 'ClientHello', what: "« Bonjour, je voudrais établir une connexion chiffrée. » Type de message, longueur, version de compatibilité." },
                random: { name: 'Aléa du client', what: "32 octets tirés au hasard. Ils entrent dans le calcul des clés et empêchent de rejouer une ancienne poignée de main." },
                session: { name: 'Identifiant de session', what: 'Vide ici : aucune session précédente à reprendre.' },
                ciphers: { name: 'Suites proposées', what: "Les combinaisons d'algorithmes que votre navigateur accepte, par ordre de préférence. Le serveur en choisit une." },
                misc: { name: 'Compression et extensions', what: "Pas de compression, puis la longueur totale des extensions qui suivent." },
            },
            ext: {
                sniHead: { name: 'Extension SNI', what: "L'en-tête de l'extension qui annonce le nom du site demandé." },
                sniName: { name: 'Nom du site', what: "Le voilà, en toutes lettres. Le serveur en a besoin pour choisir le bon certificat avant que le chiffrement existe : c'est pourquoi un observateur sait toujours quel site vous visitez, même en HTTPS." },
                alpn: { name: 'Extension ALPN', what: 'Les versions de HTTP que votre navigateur sait parler.' },
                versions: { name: 'Versions TLS', what: 'La version réellement souhaitée : TLS 1.3.' },
            },
        },
        honest: {
            intro: "Ce paquet est reconstitué, pas capturé : une page web n'a pas accès à la carte réseau. Sa structure, ses longueurs et ses sommes de contrôle sont justes, mais plusieurs valeurs sont celles que la page a pu apprendre, ou qu'elle a dû inventer.",
            simplified: "Le ClientHello est simplifié : un vrai navigateur y ajoute une quinzaine d'extensions (échange de clés, algorithmes de signature…) qui le portent à plusieurs centaines d'octets.",
            assumedTitle: 'Valeurs inventées dans ce paquet',
            try: 'Pour voir les vrais',
        },
        assumed: {
            mac: "Adresses MAC : tirées de la plage réservée à la documentation. Une page web ne peut pas lire celles de votre réseau.",
            srcIp: "Adresse source : adresse d'exemple, la vôtre n'est lisible que derrière le vrai serveur.",
            dstIp: "Adresse destination : adresse d'exemple, la résolution DNS n'a pas abouti.",
            srcPort: "Port source : choisi arbitrairement, le serveur ne l'a pas communiqué.",
        },
        foot: {
            local: "// rien n'est stocké ni envoyé. Le paquet est construit dans votre navigateur à partir de ce que le serveur voit de votre connexion.",
            ext: "// requête externe : l'adresse du serveur est demandée à",
            more: "// ce qui est en clair et ce qui ne l'est pas, expliqué :",
        },
    },

    en: {
        hero: {
            title: 'XXD',
            sub: 'A packet is just a sequence of bytes. Here is the one your browser sends to open an encrypted connection to this site, rebuilt with your real addresses: every byte has a job, and almost all of them are readable by anyone on the path.',
        },
        sec: { packet: 'PACKET', honest: 'RECONSTRUCTION' },
        tab: {
            hello: '1 · ClientHello',
            data: '2 · Data',
            helloDesc: 'The first message of the TLS handshake. Nothing in it is encrypted yet: look for the site name in the right-hand column.',
            dataDesc: 'A packet sent once the connection is established. Transport headers are still in clear; the content is nothing but noise.',
        },
        dump: {
            hint: 'Hover a byte or a field to see what it is for.',
            bytes: 'bytes {from} to {to}',
            byte: 'byte {from}',
            clear: 'in clear',
            encrypted: 'encrypted',
            size: '{n} bytes',
        },
        layer: {
            eth: { name: 'Ethernet', what: 'The local hop: from your device to your gateway. This envelope is replaced at every router.' },
            ip: { name: 'IPv4', what: 'End-to-end addressing: who sends, to whom. This is what every router on the path reads.' },
            tcp: { name: 'TCP', what: 'The conversation: which program talks to which service, and in what order to put the pieces back.' },
            tls: { name: 'TLS', what: 'Encryption. Its negotiation happens in the open; what follows can no longer be read.' },
        },
        field: {
            eth: {
                dst: { name: 'Destination MAC', what: 'The hardware address of the next hop: your gateway, not the server.' },
                src: { name: 'Source MAC', what: 'The hardware address of your network card. It never leaves your local network.' },
                type: { name: 'Type', what: 'What the frame carries: 0x0800, IPv4.' },
            },
            ip: {
                head: { name: 'Version and header', what: 'Version 4, a 20-byte header, no particular priority.' },
                len: { name: 'Total length', what: 'The size of the packet, IP header included. An observer therefore reads the size of what you exchange.' },
                id: { name: 'Identifier and flags', what: 'A packet number, and the "do not fragment" flag.' },
                ttl: { name: 'TTL', what: 'The hop counter: 64 at departure, minus one at every router. It is the one traceroute turns around.' },
                proto: { name: 'Protocol', what: 'What the packet carries: 6, TCP.' },
                sum: { name: 'Checksum', what: 'Verifies the IP header. Recomputed at every router, since the TTL changes.' },
                src: { name: 'Source address', what: 'Your public address. Without it the answer would not know where to return: it cannot be hidden.' },
                dst: { name: 'Destination address', what: 'The public address of this server, the one DNS gave you.' },
            },
            tcp: {
                sport: { name: 'Source port', what: 'A port picked at random by your system for this connection. It is how the answer finds the right tab.' },
                dport: { name: 'Destination port', what: '443: HTTPS. The number alone already says which service you use.' },
                seq: { name: 'Sequence number', what: 'The position of these bytes in the stream. Lets the receiver reorder and ask again for what got lost.' },
                ack: { name: 'Acknowledgement number', what: 'How far you have correctly received what the server sent.' },
                flags: { name: 'Flags', what: 'PSH and ACK: data to deliver right away, and an acknowledgement.' },
                win: { name: 'Window', what: 'How many bytes you accept before the next acknowledgement: flow control.' },
                sum: { name: 'Checksum', what: 'Verifies the TCP header and the data, IP addresses included.' },
                urg: { name: 'Urgent pointer', what: 'A relic: zero, as almost always.' },
            },
            tls: {
                rec: { name: 'TLS record', what: 'The message type, the announced version and the length. Readable even on an established connection: this is how TLS is recognised.' },
                payload: { name: 'Encrypted content', what: 'Your HTTP request: requested path, headers, cookies. Without the session key these bytes cannot be told from random.' },
            },
            hs: {
                head: { name: 'ClientHello', what: '"Hello, I would like an encrypted connection." Message type, length, compatibility version.' },
                random: { name: 'Client random', what: '32 random bytes. They feed the key computation and prevent replaying an old handshake.' },
                session: { name: 'Session identifier', what: 'Empty here: no previous session to resume.' },
                ciphers: { name: 'Offered suites', what: 'The algorithm combinations your browser accepts, in order of preference. The server picks one.' },
                misc: { name: 'Compression and extensions', what: 'No compression, then the total length of the extensions that follow.' },
            },
            ext: {
                sniHead: { name: 'SNI extension', what: 'The header of the extension announcing the name of the requested site.' },
                sniName: { name: 'Site name', what: 'There it is, spelled out. The server needs it to pick the right certificate before encryption exists: this is why an observer always knows which site you visit, even over HTTPS.' },
                alpn: { name: 'ALPN extension', what: 'The HTTP versions your browser can speak.' },
                versions: { name: 'TLS versions', what: 'The version really wanted: TLS 1.3.' },
            },
        },
        honest: {
            intro: 'This packet is rebuilt, not captured: a web page has no access to the network card. Its structure, lengths and checksums are correct, but several values are what the page could learn, or had to invent.',
            simplified: 'The ClientHello is simplified: a real browser adds about fifteen extensions (key share, signature algorithms…) that bring it to several hundred bytes.',
            assumedTitle: 'Invented values in this packet',
            try: 'To see the real ones',
        },
        assumed: {
            mac: 'MAC addresses: taken from the range reserved for documentation. A web page cannot read those of your network.',
            srcIp: 'Source address: an example address, yours can only be read behind the real server.',
            dstIp: 'Destination address: an example address, the DNS lookup did not succeed.',
            srcPort: 'Source port: picked arbitrarily, the server did not report it.',
        },
        foot: {
            local: '// nothing is stored or sent. The packet is built in your browser from what the server sees of your connection.',
            ext: '// external request: the server address is asked to',
            more: '// what is in clear and what is not, explained:',
        },
    },
};

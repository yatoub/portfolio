/* ── i18n translations ──
   ⚠ Chaînes contenant une apostrophe : délimiteurs "…" obligatoires.
   {x} = variable injectée par tf().
   Aucun drapeau ici : la page ne connaît que leurs empreintes (core.js). */
const translations = {
    fr: {
        hero: {
            title: 'CAPTURE THE FLAG',
            sub: "Six drapeaux sont cachés sur yatoub.dev. Aucun ne demande de casser quoi que ce soit : il suffit de regarder là où un site en dit plus qu'il ne le croit. Chaque drapeau trouvé débloque l'explication de la technique.",
            format: 'Format : YATOUB{...}',
        },
        form: {
            label: 'drapeau',
            submit: 'VALIDER',
        },
        msg: {
            found: '✓ Drapeau {n} trouvé : {title}',
            already: 'Déjà trouvé : {title}',
            wrong: "Ce n'est pas un drapeau. Vérifie les accolades et la casse.",
            empty: 'Colle un drapeau au format YATOUB{...}',
            nocrypto: "Ce navigateur n'expose pas crypto.subtle (connexion non sécurisée ?) : impossible de vérifier un drapeau.",
        },
        card: {
            locked: 'VERROUILLÉ',
            found: 'TROUVÉ',
            hint: "afficher l'indice",
            hintLabel: 'indice',
            cmd: 'à reproduire',
            defense: 'côté défense',
        },
        done: {
            title: 'SIX SUR SIX',
            text: "Tu as lu un robots.txt, un source, un système de fichiers, des en-têtes et une zone DNS : c'est le début de toute reconnaissance, et rien de tout cela n'a demandé un outil d'attaque. Si tu as aimé l'exercice, écris-moi.",
            contact: 'ME CONTACTER',
        },
        reset: {
            ask: 'remettre la progression à zéro',
            confirm: 'cliquer encore pour confirmer',
        },
        foot: {
            local: "// la progression reste dans ton navigateur : rien n'est envoyé au serveur, et les drapeaux saisis ne sont pas conservés.",
            scope: '// le périmètre du jeu est ce site. Les services du homelab ne font pas partie du parcours.',
        },
        flags: {
            robots: {
                title: 'Le plan des zones interdites',
                hint: "Les robots d'indexation lisent un fichier avant tout le reste. Rien ne t'empêche de le lire aussi.",
                explain: "robots.txt est un fichier public, à une adresse fixe, que les moteurs de recherche consultent pour savoir quoi ignorer. Il ne protège rien : il demande poliment. Pour un attaquant, c'est souvent la première lecture, parce que les lignes Disallow listent précisément ce que le propriétaire préférerait ne pas voir exploré.",
                defense: "Ne jamais y inscrire un chemin sensible. Ce qui doit rester privé se protège par une authentification, pas par une consigne aux robots.",
            },
            source: {
                title: 'Ce que le navigateur reçoit',
                hint: "La page d'accueil contient plus de texte qu'elle n'en affiche.",
                explain: "Tout ce qu'un serveur envoie au navigateur est lisible : HTML, commentaires, JavaScript, feuilles de style. Un commentaire n'apparaît pas à l'écran, mais il voyage avec la page. Les sources réelles contiennent régulièrement des notes de développeur, des adresses internes ou des clés oubliées.",
                defense: "Considérer le code envoyé au client comme publié. Les secrets restent côté serveur, et les commentaires sont retirés à la construction quand ils en disent trop.",
            },
            dotfile: {
                title: 'Rangé, pas caché',
                hint: "Ouvre le terminal du site (bouton >_ ou Ctrl+K). Par défaut, ls ne montre pas tout.",
                explain: "Sous Unix, un fichier dont le nom commence par un point est simplement omis par ls, sauf avec l'option -a. C'est une convention d'affichage, pas une permission. Les fichiers .env, .git ou .ssh sont parmi les plus recherchés sur un serveur web, justement parce qu'on oublie qu'ils sont là.",
                defense: "Bloquer explicitement les fichiers en point dans le serveur web, et garder les secrets hors du dossier servi. Ici, Caddy renvoie 404 sur /.git et /.github.",
            },
            curl: {
                title: 'Un visage par visiteur',
                hint: "Le site ne répond pas la même chose à un navigateur et à un outil en ligne de commande. Essaie /whoami autrement.",
                explain: "Le serveur lit l'en-tête User-Agent et adapte sa réponse : curl reçoit du texte brut, un navigateur reçoit la page. Cet en-tête est déclaré par le client et rien ne le vérifie : curl -A permet de se présenter comme n'importe quel navigateur, et l'inverse est vrai aussi.",
                defense: "Le User-Agent sert au confort (format de la réponse), jamais au contrôle d'accès. Un filtrage fondé dessus se contourne en une option.",
            },
            header: {
                title: 'Avant la première ligne de HTML',
                hint: "Une réponse HTTP commence par des en-têtes que la page n'affiche jamais. L'un d'eux n'a rien de standard.",
                explain: "Avant le contenu, le serveur envoie des en-têtes : type de contenu, cache, politique de sécurité. Ils sont invisibles dans la page mais visibles dans l'onglet Réseau du navigateur ou avec curl -I. Ils révèlent souvent le logiciel du serveur, sa version, ou un composant interne.",
                defense: "Retirer les en-têtes qui décrivent la pile technique (Server, X-Powered-By) et ne garder que ceux qui servent au client.",
            },
            dns: {
                title: "L'annuaire public",
                hint: "Un nom de domaine porte d'autres enregistrements que son adresse. Cherche du texte sous le nom _ctf.",
                explain: "Le DNS est un annuaire que n'importe qui peut interroger. En plus des adresses, il contient des enregistrements TXT : validation de domaine, politique de messagerie (SPF, DKIM, DMARC). Les lire renseigne sur les prestataires utilisés et, parfois, sur des sous-domaines que personne n'a annoncés.",
                defense: "Une zone DNS est une donnée publique : pas de nom interne ni d'information sensible, et un ménage régulier des enregistrements de validation devenus inutiles.",
            },
        },
    },

    en: {
        hero: {
            title: 'CAPTURE THE FLAG',
            sub: 'Six flags are hidden on yatoub.dev. None of them requires breaking anything: you only have to look where a site says more than it thinks. Each flag you find unlocks the explanation of the technique.',
            format: 'Format: YATOUB{...}',
        },
        form: {
            label: 'flag',
            submit: 'SUBMIT',
        },
        msg: {
            found: '✓ Flag {n} found: {title}',
            already: 'Already found: {title}',
            wrong: 'Not a flag. Check the braces and the case.',
            empty: 'Paste a flag in the YATOUB{...} format',
            nocrypto: 'This browser does not expose crypto.subtle (insecure connection?): flags cannot be verified.',
        },
        card: {
            locked: 'LOCKED',
            found: 'FOUND',
            hint: 'show the hint',
            hintLabel: 'hint',
            cmd: 'reproduce it',
            defense: 'defending against it',
        },
        done: {
            title: 'SIX OUT OF SIX',
            text: 'You read a robots.txt, a page source, a filesystem, headers and a DNS zone: that is how every reconnaissance starts, and none of it took an attack tool. If you enjoyed the exercise, drop me a line.',
            contact: 'GET IN TOUCH',
        },
        reset: {
            ask: 'reset progress',
            confirm: 'click again to confirm',
        },
        foot: {
            local: '// progress stays in your browser: nothing is sent to the server, and submitted flags are not kept.',
            scope: '// the game is limited to this site. The homelab services are not part of the trail.',
        },
        flags: {
            robots: {
                title: 'The map of forbidden areas',
                hint: 'Crawlers read one file before anything else. Nothing stops you from reading it too.',
                explain: 'robots.txt is a public file, at a fixed address, that search engines read to learn what to skip. It protects nothing: it asks politely. For an attacker it is often the first read, because Disallow lines list exactly what the owner would rather not see explored.',
                defense: 'Never list a sensitive path in it. What must stay private is protected by authentication, not by a note to crawlers.',
            },
            source: {
                title: 'What the browser receives',
                hint: 'The home page holds more text than it displays.',
                explain: 'Everything a server sends to the browser is readable: HTML, comments, JavaScript, stylesheets. A comment does not show on screen, but it travels with the page. Real-world sources regularly contain developer notes, internal addresses or forgotten keys.',
                defense: 'Treat client-side code as published. Secrets stay on the server, and comments that say too much are stripped at build time.',
            },
            dotfile: {
                title: 'Tidy, not hidden',
                hint: 'Open the site terminal (>_ button or Ctrl+K). By default, ls does not show everything.',
                explain: 'On Unix, a file whose name starts with a dot is simply left out by ls unless you pass -a. It is a display convention, not a permission. .env, .git and .ssh are among the most probed paths on a web server, precisely because people forget they are there.',
                defense: 'Block dotfiles explicitly in the web server, and keep secrets outside the served directory. Here, Caddy answers 404 on /.git and /.github.',
            },
            curl: {
                title: 'A different face for each visitor',
                hint: 'The site does not answer a browser and a command-line tool the same way. Try /whoami differently.',
                explain: 'The server reads the User-Agent header and adapts its answer: curl gets plain text, a browser gets the page. That header is declared by the client and nothing verifies it: curl -A lets you introduce yourself as any browser, and the reverse works too.',
                defense: 'User-Agent is for convenience (response format), never for access control. Filtering based on it is bypassed with one option.',
            },
            header: {
                title: 'Before the first line of HTML',
                hint: 'An HTTP response starts with headers the page never displays. One of them is anything but standard.',
                explain: 'Before the content, the server sends headers: content type, caching, security policy. They are invisible in the page but visible in the browser Network tab or with curl -I. They often reveal the server software, its version, or an internal component.',
                defense: 'Remove headers that describe the stack (Server, X-Powered-By) and keep only those the client needs.',
            },
            dns: {
                title: 'The public directory',
                hint: 'A domain name carries more records than its address. Look for text under the name _ctf.',
                explain: 'DNS is a directory anyone can query. Besides addresses it holds TXT records: domain validation, mail policy (SPF, DKIM, DMARC). Reading them tells you which providers are in use and, sometimes, subdomains nobody announced.',
                defense: 'A DNS zone is public data: no internal names or sensitive information, and regular cleanup of validation records that are no longer needed.',
            },
        },
    },
};

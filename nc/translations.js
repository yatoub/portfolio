/* ── i18n translations ──
   ⚠ Chaînes contenant une apostrophe : délimiteurs "…" obligatoires.
   {x} = variable injectée par tf().
   ch.* : une entrée par défi de NcCore.CHALLENGES (core.js). */
const translations = {
    fr: {
        hero: {
            title: 'NC',
            sub: "HTTP est un protocole en texte : une ligne pour dire ce qu'on veut, quelques en-têtes, une ligne vide. Écrivez la requête vous-même, comme on le ferait avec netcat, et lisez ce que ce serveur répond réellement. Six défis pour faire le tour du protocole.",
        },
        sec: { session: 'SESSION', honest: 'ENVERS DU DÉCOR' },
        form: {
            label: 'votre requête',
            send: 'ENVOYER',
            keys: 'Ctrl+Entrée envoie',
            example: '[ remettre un exemple ]',
        },
        out: {
            waiting: 'en attente de votre requête…',
            sending: 'envoi…',
            failed: "La requête n'est pas partie ou n'a pas reçu de réponse lisible.",
            redirect: "Le serveur a répondu par une redirection. Une page web n'a pas le droit de lire où elle mène : avec le vrai netcat, vous verriez la ligne Location.",
            sent: 'envoyé',
            notSent: 'non envoyé',
        },
        err: {
            empty: 'Rien à envoyer.',
            requestLine: 'Première ligne illisible. Forme attendue : MÉTHODE /chemin HTTP/1.1',
            unknownMethod: 'Méthode inconnue. Essayez GET, HEAD, POST, PUT, DELETE, OPTIONS ou PATCH.',
            refusedMethod: "Les navigateurs refusent d'émettre cette méthode : il faut un vrai client pour l'essayer.",
            absoluteUrl: "Donnez seulement le chemin, à partir de la barre oblique : le serveur visé est celui-ci, il n'y a pas à l'écrire.",
            path: 'Chemin invalide : il commence par une seule barre oblique, sans espace, 200 caractères au plus.',
            version: 'Version inconnue. Écrivez HTTP/1.1.',
            header: "Un en-tête s'écrit « Nom: valeur », un par ligne.",
        },
        note: {
            noVersion: "Sans version, c'est du HTTP/0.9 de 1991 : la requête part quand même, mais plus aucun serveur ne parle ainsi.",
            noHost: "HTTP/1.1 exige un en-tête Host : un même serveur héberge plusieurs sites et doit savoir lequel vous demandez. Ici le navigateur l'ajoute pour vous.",
            hostMismatch: "L'en-tête Host ne désigne pas ce site. Avec netcat, le serveur chercherait cet autre site ; le navigateur, lui, remet d'office le bon.",
            managed: "Certains en-têtes sont écrits par le navigateur et une page ne peut pas les changer : ils sont marqués « non envoyé ».",
        },
        ch: {
            title: 'DÉFIS',
            done: '{n} sur {total}',
            hint: "afficher l'indice",
            reset: '[ remettre à zéro ]',
            confirm: '[ cliquer encore pour confirmer ]',
            ok: { name: 'Un 200', goal: 'Obtenir une réponse 200 avec la méthode GET.', hint: 'GET /robots.txt HTTP/1.1', why: "200 : la ressource existe et la voici. C'est la réponse à tout ce qui se passe bien." },
            notfound: { name: 'Un 404', goal: "Demander quelque chose qui n'existe pas.", hint: "N'importe quel chemin inventé fait l'affaire.", why: "404 : le serveur a compris la demande, mais rien ne se trouve à cette adresse. C'est la réponse que reçoivent tous les robots de la page tail." },
            head: { name: 'Sans le corps', goal: 'Obtenir les en-têtes sans télécharger le contenu.', hint: 'Remplacez GET par HEAD.', why: "HEAD renvoie exactement les en-têtes d'un GET, sans le corps. C'est ce que fait curl -I, et la manière polie de vérifier qu'une page existe." },
            range: { name: 'Un morceau', goal: 'Ne recevoir que les cent premiers octets : une réponse 206.', hint: 'En-tête à ajouter : Range: bytes=0-99', why: "206 : contenu partiel. C'est ce qui permet de reprendre un téléchargement interrompu ou d'avancer dans une vidéo sans tout charger." },
            cached: { name: 'Rien de neuf', goal: 'Obtenir une réponse 304.', hint: "Relevez l'en-tête etag d'une réponse 200, puis renvoyez la requête avec If-None-Match: suivi de cette valeur, guillemets compris.", why: "304 : « votre copie est toujours bonne ». Le serveur ne renvoie pas le contenu. C'est le mécanisme de cache qui rend le web rapide." },
            method: { name: 'Interdit', goal: 'Obtenir une réponse 405.', hint: 'Ce serveur ne sert que des fichiers. Essayez de lui en envoyer un avec POST.', why: "405 : la méthode n'est pas permise ici. L'en-tête Allow de la réponse liste celles qui le sont. Un site statique n'accepte rien d'autre que la lecture." },
        },
        honest: {
            intro: "Cette page n'ouvre pas de connexion brute : un navigateur ne le permet pas. Elle lit votre texte, le traduit en requête, et vous montre la réponse. Trois différences avec le vrai netcat :",
            binary: { name: 'Le texte est une traduction', text: "Votre navigateur parle HTTP/2 ou HTTP/3 à ce serveur : des trames binaires compressées, pas des lignes de texte. Ce que vous tapez est la forme HTTP/1.1, que les deux versions savent toujours exprimer." },
            browser: { name: 'Le navigateur garde la main', text: "Host, User-Agent, Cookie, Accept-Encoding : une page ne peut ni les écrire ni les falsifier. C'est une protection, pour qu'un site ne puisse pas émettre n'importe quoi en votre nom." },
            origin: { name: 'Un seul destinataire', text: "Les requêtes ne partent que vers ce site, sans vos cookies. Avec netcat, vous pourriez parler à n'importe quel serveur, et c'est tout l'intérêt de l'outil." },
            real: 'La version sans filet',
        },
        foot: {
            local: "// rien n'est stocké hormis votre progression, dans votre navigateur. Les requêtes ne visent que ce site.",
            more: "// les en-têtes de réponse expliqués un par un :",
        },
    },

    en: {
        hero: {
            title: 'NC',
            sub: 'HTTP is a text protocol: one line to say what you want, a few headers, an empty line. Write the request yourself, as you would with netcat, and read what this server really answers. Six challenges to walk through the protocol.',
        },
        sec: { session: 'SESSION', honest: 'BEHIND THE SCENES' },
        form: {
            label: 'your request',
            send: 'SEND',
            keys: 'Ctrl+Enter sends',
            example: '[ put an example back ]',
        },
        out: {
            waiting: 'waiting for your request…',
            sending: 'sending…',
            failed: 'The request did not leave or got no readable answer.',
            redirect: 'The server answered with a redirect. A web page is not allowed to read where it leads: with the real netcat you would see the Location line.',
            sent: 'sent',
            notSent: 'not sent',
        },
        err: {
            empty: 'Nothing to send.',
            requestLine: 'Unreadable first line. Expected form: METHOD /path HTTP/1.1',
            unknownMethod: 'Unknown method. Try GET, HEAD, POST, PUT, DELETE, OPTIONS or PATCH.',
            refusedMethod: 'Browsers refuse to send this method: trying it takes a real client.',
            absoluteUrl: 'Give the path only, starting from the slash: the target server is this one, no need to write it.',
            path: 'Invalid path: it starts with a single slash, no spaces, 200 characters at most.',
            version: 'Unknown version. Write HTTP/1.1.',
            header: 'A header is written "Name: value", one per line.',
        },
        note: {
            noVersion: 'Without a version this is HTTP/0.9 from 1991: the request still goes out, but no server talks like that anymore.',
            noHost: 'HTTP/1.1 requires a Host header: one server hosts several sites and has to know which one you want. Here the browser adds it for you.',
            hostMismatch: 'The Host header does not name this site. With netcat the server would look for that other site; the browser puts the right one back.',
            managed: 'Some headers are written by the browser and a page cannot change them: they are marked "not sent".',
        },
        ch: {
            title: 'CHALLENGES',
            done: '{n} out of {total}',
            hint: 'show the hint',
            reset: '[ reset ]',
            confirm: '[ click again to confirm ]',
            ok: { name: 'A 200', goal: 'Get a 200 response with the GET method.', hint: 'GET /robots.txt HTTP/1.1', why: '200: the resource exists and here it is. The answer to everything that goes well.' },
            notfound: { name: 'A 404', goal: 'Ask for something that does not exist.', hint: 'Any made-up path will do.', why: '404: the server understood the request, but nothing lives at that address. It is what every bot on the tail page gets.' },
            head: { name: 'Without the body', goal: 'Get the headers without downloading the content.', hint: 'Replace GET with HEAD.', why: 'HEAD returns exactly the headers of a GET, without the body. It is what curl -I does, and the polite way to check that a page exists.' },
            range: { name: 'A slice', goal: 'Receive only the first hundred bytes: a 206 response.', hint: 'Header to add: Range: bytes=0-99', why: '206: partial content. It is what lets you resume an interrupted download or seek in a video without loading everything.' },
            cached: { name: 'Nothing new', goal: 'Get a 304 response.', hint: 'Note the etag header of a 200 response, then send the request again with If-None-Match: followed by that value, quotes included.', why: '304: "your copy is still good". The server does not send the content again. It is the caching mechanism that makes the web fast.' },
            method: { name: 'Not allowed', goal: 'Get a 405 response.', hint: 'This server only serves files. Try sending it one with POST.', why: '405: the method is not permitted here. The Allow header of the response lists the ones that are. A static site accepts nothing but reading.' },
        },
        honest: {
            intro: 'This page does not open a raw connection: a browser does not allow it. It reads your text, translates it into a request, and shows you the response. Three differences with the real netcat:',
            binary: { name: 'The text is a translation', text: 'Your browser speaks HTTP/2 or HTTP/3 to this server: compressed binary frames, not lines of text. What you type is the HTTP/1.1 form, which both versions can still express.' },
            browser: { name: 'The browser stays in charge', text: 'Host, User-Agent, Cookie, Accept-Encoding: a page can neither write nor forge them. It is a protection, so that a site cannot send just anything on your behalf.' },
            origin: { name: 'A single recipient', text: 'Requests only go to this site, without your cookies. With netcat you could talk to any server, which is the whole point of the tool.' },
            real: 'The version without a net',
        },
        foot: {
            local: '// nothing is stored except your progress, in your browser. Requests only target this site.',
            more: '// the response headers explained one by one:',
        },
    },
};

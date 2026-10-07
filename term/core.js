/* ═══════════════════════════════════════════
   YATOUB // TERM — shell logic, pure helpers
   Virtual filesystem built from the site's own data (translations,
   projects.json, homelab.json), command parsing, execution, completion.
   No DOM access here: covered by tools/term-core.test.mjs.
   ═══════════════════════════════════════════ */

const TermCore = (() => {
    const USER = 'guest';
    const HOSTNAME = 'yatoub';
    // Stable file names for experience entries, whatever the display language
    const EXP_SLUGS = { en: 'education-nationale', lp: 'la-poste', mc: 'maincare', cp: 'cpage', dp: 'delpharm' };
    const SECTIONS = { man: '/man/', lab: '/lab', whoami: '/whoami/', status: '/status/', tcpdump: '/tcpdump/', traceroute: '/traceroute/', ping: '/ping/', dig: '/dig/', curl: '/curl/', tail: '/tail/', ctf: '/ctf/', github: 'https://github.com/yatoub' };

    const dir = (children = {}) => ({ dir: children });
    const file = (content, extra = {}) => ({ file: content, ...extra });
    const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    /* ── Filesystem ── */
    // data: { tr: translations[lang], lang, projects, homelab, contact: [{ label, href }] }
    function buildFs({ tr, lang, projects = [], homelab = [], contact = [] }) {
        const pick = (o, base) => o[`${base}_${lang}`] ?? o[`${base}_en`];

        const experience = {};
        for (const [key, e] of Object.entries(tr.exp || {})) {
            if (!e || typeof e !== 'object' || !e.role) continue;
            const year = (e.dates || '').match(/\d{4}/)?.[0] || '0000';
            const bullets = Object.keys(e).filter(k => /^p\d+$/.test(k)).sort((a, b) => a.slice(1) - b.slice(1)).map(k => `  - ${e[k]}`);
            experience[`${year}-${EXP_SLUGS[key] || key}.md`] = file(
                [`# ${e.role}`, [e.company, e.dates].filter(Boolean).join(' · '), '', ...bullets].join('\n'));
        }

        const projectFiles = {};
        for (const p of projects) {
            projectFiles[`${slug(p.name)}.md`] = file(
                [`# ${p.name}  [${p.badge}]`, '', pick(p, 'desc'), '', `tags : ${p.tags.join(', ')}`, `url  : ${p.url}`].join('\n'),
                { url: p.url, title: p.name });
        }

        const homelabFiles = {};
        for (const s of homelab) {
            homelabFiles[`${s.id}.md`] = file([`# ${s.name}  [${pick(s, 'badge')}]`, '', pick(s, 'short')].join('\n'));
        }

        return dir({
            // Dotfile: left out by ls unless -a is given. One of the /ctf flags.
            '.env': file(['# not everything in a home directory is meant to be listed', 'FLAG=YATOUB{d0tf1l3s_4r3_n0t_h1dd3n}', 'MORE=https://yatoub.dev/ctf/'].join('\n')),
            'about.md': file([`# ${tr.about.title}`, '', tr.about.bio1, '', tr.about.bio2].join('\n')),
            'contact.txt': file(contact.map(c => c.label).join('\n')),
            'curl.txt': file(null, { remote: '/curl.txt' }),
            experience: dir(experience),
            projects: dir(projectFiles),
            homelab: dir(homelabFiles),
        });
    }

    /* ── Paths: cwd is an array of segments below the home directory ── */
    function resolve(cwd, path = '') {
        const fromRoot = path.startsWith('~') || path.startsWith('/');
        const parts = fromRoot ? [] : [...cwd];
        for (const seg of path.replace(/^~/, '').split('/')) {
            if (!seg || seg === '.') continue;
            if (seg === '..') parts.pop();
            else parts.push(seg);
        }
        return parts;
    }

    function lookup(fs, parts) {
        let node = fs;
        for (const seg of parts) {
            // Own entries only: "constructor" or "__proto__" must not resolve to Object internals
            if (!node.dir || !Object.hasOwn(node.dir, seg)) return null;
            node = node.dir[seg];
        }
        return node;
    }

    const display = (parts) => (parts.length ? `~/${parts.join('/')}` : '~');
    const prompt = (state) => `${USER}@${HOSTNAME}:${display(state.cwd)}$`;
    // Dotfiles are a display convention: hidden from listings, still reachable by name
    const listing = (node, all = false) => Object.keys(node.dir).filter(name => all || !name.startsWith('.')).sort()
        .map(name => (node.dir[name].dir ? `${name}/` : name));

    /* ── Parsing ── */
    function tokenize(input) {
        const tokens = [];
        const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
        let m;
        while ((m = re.exec(input))) tokens.push(m[1] ?? m[2] ?? m[3]);
        return tokens;
    }

    const line = (text, cls = '') => ({ text, cls });
    const err = (text) => line(text, 'err');
    const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

    /* ── Commands: (args, ctx) → { lines, effects } | Promise of it ──
       ctx: { fs, state, tr (translations[lang].term), io: { json(url), text(url) }, summarize } */
    const COMMANDS = {
        help(args, { tr }) {
            const width = Math.max(...Object.keys(tr.help).map(k => k.length));
            return { lines: [line(tr.helpIntro, 'dim'), ...Object.entries(tr.help).map(([k, v]) => line(`  ${k.padEnd(width)}  ${v}`)), line(tr.helpKeys, 'dim')] };
        },

        ls(args, { fs, state, tr }) {
            const targets = args.filter(a => !a.startsWith('-'));
            const all = args.some(a => /^-[a-zA-Z]*a/.test(a));
            const out = [];
            for (const target of targets.length ? targets : ['']) {
                const node = lookup(fs, resolve(state.cwd, target));
                if (!node) out.push(err(fill(tr.err.nofile, { cmd: 'ls', path: target })));
                else if (node.dir) out.push(line(listing(node, all).join('  ') || ''));
                else out.push(line(target.split('/').pop()));
            }
            return { lines: out };
        },

        cd(args, { fs, state, tr }) {
            const target = args[0] ?? '~';
            const parts = resolve(state.cwd, target);
            const node = lookup(fs, parts);
            if (!node) return { lines: [err(fill(tr.err.nofile, { cmd: 'cd', path: target }))] };
            if (!node.dir) return { lines: [err(fill(tr.err.notdir, { cmd: 'cd', path: target }))] };
            state.cwd = parts;
            return { lines: [] };
        },

        pwd(args, { state }) {
            return { lines: [line(`/home/${USER}${state.cwd.length ? '/' + state.cwd.join('/') : ''}`)] };
        },

        async cat(args, { fs, state, tr, io }) {
            if (!args.length) return { lines: [err(fill(tr.err.usage, { usage: 'cat <file>' }))] };
            const out = [];
            for (const target of args) {
                const node = lookup(fs, resolve(state.cwd, target));
                if (!node) out.push(err(fill(tr.err.nofile, { cmd: 'cat', path: target })));
                else if (node.dir) out.push(err(fill(tr.err.isdir, { cmd: 'cat', path: target })));
                else if (node.remote) {
                    try { out.push(line(await io.text(node.remote))); }
                    catch { out.push(err(fill(tr.err.fetch, { path: target }))); }
                } else out.push(line(node.file));
            }
            return { lines: out };
        },

        open(args, { fs, state, tr }) {
            const target = args[0];
            if (!target) return { lines: [err(fill(tr.err.usage, { usage: `open <${Object.keys(SECTIONS).join('|')}|project>` }))] };

            let url = Object.hasOwn(SECTIONS, target.toLowerCase()) ? SECTIONS[target.toLowerCase()] : null;
            let title = target;
            if (!url) {
                const byPath = lookup(fs, resolve(state.cwd, target));
                const projects = lookup(fs, ['projects']).dir;
                const name = `${slug(target.replace(/\.md$/, ''))}.md`;
                const node = byPath?.url ? byPath : Object.hasOwn(projects, name) ? projects[name] : null;
                if (node?.url) { url = node.url; title = node.title; }
            }
            if (!url) return { lines: [err(fill(tr.err.noopen, { target }))] };
            return { lines: [line(fill(tr.opening, { target: title, url }), 'dim')], effects: [{ type: 'open', url }] };
        },

        lang(args, { state, tr }) {
            const target = args[0];
            if (!target) return { lines: [line(state.lang)] };
            if (target !== 'fr' && target !== 'en') return { lines: [err(fill(tr.err.usage, { usage: 'lang <fr|en>' }))] };
            return { lines: [], effects: [{ type: 'lang', lang: target }] };
        },

        async whoami(args, { tr, io }) {
            const out = [line(USER)];
            try {
                const d = await io.json('/whoami/server.json');
                out.push(line(`  ip     ${d.ip}`), line(`  proto  ${d.proto}`));
                if (d.tls) out.push(line(`  tls    ${d.tls} · ${d.cipher}`));
                if (d.headers?.['User-Agent']) out.push(line(`  agent  ${d.headers['User-Agent']}`));
            } catch { /* static hosting or offline: the user name alone */ }
            out.push(line(tr.whoamiMore, 'dim'));
            return { lines: out };
        },

        async status(args, { tr, io, summarize, homelab }) {
            let data, now;
            try { ({ data, now } = await io.status()); }
            catch { return { lines: [err(tr.status.unknown)] }; }

            const sum = summarize(data, now);
            const trusted = ['up', 'degraded', 'down'].includes(sum.state);
            const head = fill(tr.status[sum.state], { n: sum.down, total: sum.total });
            const out = [line(head, sum.state === 'up' ? 'ok' : trusted ? 'err' : 'dim')];
            if (!trusted) return { lines: out };

            const names = new Map(homelab.map(s => [s.id, s.name]));
            const rows = data.services.filter(s => names.has(s.id));
            const width = Math.max(...rows.map(s => names.get(s.id).length));
            for (const s of rows) {
                const up = s.state === 'up';
                const pct = s.uptime == null ? '   —   ' : `${(Math.floor(s.uptime * 10000 + 1e-6) / 100).toFixed(2)} %`;
                out.push(line(`  ${names.get(s.id).padEnd(width)}  ${up ? 'UP  ' : 'DOWN'}  ${pct.padStart(8)}`, up ? '' : 'err'));
            }
            out.push(line(tr.statusMore, 'dim'));
            return { lines: out };
        },

        history(args, { state }) {
            return { lines: state.history.map((h, i) => line(`${String(i + 1).padStart(4)}  ${h}`)) };
        },

        echo(args) { return { lines: [line(args.join(' '))] }; },
        date() { return { lines: [line(new Date().toString())] }; },
        clear() { return { lines: [], effects: [{ type: 'clear' }] }; },
        exit() { return { lines: [], effects: [{ type: 'close' }] }; },

        /* ── Easter eggs ── */
        sudo(args, { tr }) { return { lines: [err(fill(tr.egg.sudo, { user: USER }))] }; },
        rm(args, { tr }) { return { lines: [err(tr.egg.rm)] }; },
        vim(args, { tr }) { return { lines: [line(tr.egg.vim, 'dim')] }; },
    };
    const ALIASES = { ll: 'ls', dir: 'ls', quit: 'exit', logout: 'exit', vi: 'vim', nano: 'vim', emacs: 'vim', '?': 'help', man: 'help' };
    // Hidden from completion and help
    const HIDDEN = new Set(['sudo', 'rm', 'vim', 'echo', 'date']);

    async function exec(input, ctx) {
        const [name, ...args] = tokenize(input);
        if (!name) return { lines: [], effects: [] };
        ctx.state.history.push(input.trim());

        const cmd = COMMANDS[ALIASES[name] || name];
        if (!cmd || !Object.hasOwn(COMMANDS, ALIASES[name] || name)) {
            return { lines: [err(fill(ctx.tr.err.notfound, { cmd: name }))], effects: [] };
        }
        const res = await cmd(args, ctx);
        return { lines: res.lines || [], effects: res.effects || [] };
    }

    /* ── Tab completion → { input, options } ── */
    function complete(input, ctx) {
        const endsWithSpace = /\s$/.test(input);
        const tokens = tokenize(input);
        const word = endsWithSpace ? '' : tokens.pop() ?? '';
        const head = input.slice(0, input.length - word.length);

        let candidates;
        let base = '';
        if (!tokens.length) {
            candidates = Object.keys(COMMANDS).filter(c => !HIDDEN.has(c)).map(c => `${c} `);
        } else if (tokens[0] === 'lang') {
            candidates = ['fr ', 'en '];
        } else {
            const cut = word.lastIndexOf('/') + 1;
            base = word.slice(0, cut);
            const node = lookup(ctx.fs, resolve(ctx.state.cwd, base));
            candidates = node?.dir ? listing(node, word.slice(cut).startsWith('.')).map(n => (n.endsWith('/') ? n : `${n} `)) : [];
            if (tokens[0] === 'open' && !base) {
                const projects = Object.keys(lookup(ctx.fs, ['projects']).dir).map(n => `${n.replace(/\.md$/, '')} `);
                candidates = [...Object.keys(SECTIONS).map(s => `${s} `), ...projects];
            }
        }

        const partial = word.slice(base.length);
        const matches = candidates.filter(c => c.startsWith(partial));
        if (!matches.length) return { input, options: [] };
        if (matches.length === 1) return { input: head + base + matches[0], options: [] };

        let common = matches[0];
        for (const m of matches) while (!m.startsWith(common)) common = common.slice(0, -1);
        return { input: head + base + common, options: common.length > partial.length ? [] : matches.map(m => m.trim()) };
    }

    return { buildFs, resolve, lookup, display, prompt, tokenize, exec, complete, COMMANDS };
})();

if (typeof module !== 'undefined') module.exports = TermCore;

/* ═══════════════════════════════════════════
   YATOUB // TERM — overlay UI
   Loaded on demand by /script.js (navbar button or Ctrl+K).
   Depends on /script.js globals (translations, currentLang, applyLang),
   term/core.js and /status/core.js. Output is written with textContent only.
   ═══════════════════════════════════════════ */

window.YTerm = (() => {
    const MAX_LINES = 400;
    let root, out, input, promptEl, closeBtn, opener;
    let ctx = null;
    let histPos = null;     // index while browsing history, null when editing a fresh line
    let draft = '';
    let booting = null;     // first open() in flight: data is fetched before anything is shown

    const tr = () => translations[currentLang].term;

    function el(tag, cls, text) {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function print(text, cls = '') {
        out.append(el('div', cls, text));
        while (out.childElementCount > MAX_LINES) out.firstElementChild.remove();
    }

    function echo(command) {
        const row = el('div', 'cmd');
        row.append(el('span', 'term-prompt', TermCore.prompt(ctx.state)), ` ${command}`);
        out.append(row);
    }

    const scrollDown = () => { root.querySelector('.term-body').scrollTop = 1e9; };
    const refreshPrompt = () => { promptEl.textContent = TermCore.prompt(ctx.state); };

    /* ── Data: same sources as the page itself ── */
    async function loadData() {
        const json = (url) => fetch(url).then(r => (r.ok ? r.json() : Promise.reject(new Error(url))));
        const [projects, homelab] = await Promise.all([
            json('/projects.json').catch(() => []),
            json('/homelab.json').catch(() => []),
        ]);
        const contact = [...document.querySelectorAll('#contact a.ct-result')].map(a => ({ label: a.textContent.trim(), href: a.href }));
        return { projects, homelab, contact };
    }

    function rebuild(data) {
        const state = ctx?.state || { cwd: [], history: [] };
        state.lang = currentLang;
        ctx = {
            data,
            state,
            homelab: data.homelab,
            tr: tr(),
            fs: TermCore.buildFs({ tr: translations[currentLang], lang: currentLang, ...data }),
            summarize: StatusCore.summarize,
            io: {
                text: (url) => fetch(url).then(r => (r.ok ? r.text() : Promise.reject(new Error(url)))),
                json: (url) => fetch(url, { cache: 'no-store' }).then(r => (r.ok ? r.json() : Promise.reject(new Error(url)))),
                status: () => fetch('/data/status.json', { cache: 'no-store' }).then(async r => {
                    if (!r.ok) throw new Error('status');
                    return { data: await r.json(), now: Date.parse(r.headers.get('Date')) || Date.now() };
                }),
            },
        };
        // A directory may not exist under the same path after a rebuild
        if (!TermCore.lookup(ctx.fs, state.cwd)?.dir) state.cwd = [];
    }

    /* ── Effects requested by commands ── */
    function apply(effect) {
        if (effect.type === 'clear') out.replaceChildren();
        else if (effect.type === 'close') close();
        else if (effect.type === 'lang') {
            currentLang = effect.lang;
            applyLang(effect.lang);
            rebuild(ctx.data);
            closeBtn.setAttribute('aria-label', tr().close);
            root.setAttribute('aria-label', tr().label);
        } else if (effect.type === 'open') {
            // URLs only ever come from site data (see term/core.js) ; external ones get a new tab
            const external = /^https?:\/\//.test(effect.url);
            if (external) window.open(effect.url, '_blank', 'noopener');
            else window.location.assign(effect.url);
        }
    }

    async function run(command) {
        echo(command);
        input.value = '';
        histPos = null;
        input.disabled = true;
        try {
            const { lines, effects } = await TermCore.exec(command, ctx);
            lines.forEach(l => print(l.text, l.cls));
            effects.forEach(apply);
        } finally {
            input.disabled = false;
            if (!root.hidden) input.focus();
        }
        refreshPrompt();
        scrollDown();
    }

    function onKey(e) {
        const history = ctx.state.history;
        if (e.key === 'Enter') {
            e.preventDefault();
            run(input.value);
        } else if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault();
            const res = TermCore.complete(input.value, ctx);
            if (res.options.length) {
                echo(input.value);
                print(res.options.join('  '));
                scrollDown();
            }
            input.value = res.input;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!history.length) return;
            if (histPos === null) { draft = input.value; histPos = history.length; }
            histPos = Math.max(0, histPos - 1);
            input.value = history[histPos];
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (histPos === null) return;
            histPos += 1;
            if (histPos >= history.length) { histPos = null; input.value = draft; }
            else input.value = history[histPos];
        } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
            e.preventDefault();
            out.replaceChildren();
        } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
            // Keep the native copy when text is selected
            if (String(window.getSelection())) return;
            e.preventDefault();
            echo(input.value + '^C');
            input.value = '';
            histPos = null;
            scrollDown();
        }
    }

    // Two focusable controls: keep Tab inside the dialog
    function trap(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
        if (e.key !== 'Tab') return;
        if (document.activeElement === closeBtn && !e.shiftKey) { e.preventDefault(); input.focus(); }
        else if (document.activeElement === input && e.shiftKey) { e.preventDefault(); closeBtn.focus(); }
    }

    function build() {
        root = el('div', 'term-overlay');
        root.hidden = true;
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', tr().label);

        const win = el('div', 'term-window');
        const bar = el('div', 'tc-bar term-bar');
        const dots = el('div', 'tc-dots');
        dots.append(el('span', 'tcd red'), el('span', 'tcd yellow'), el('span', 'tcd green'));
        closeBtn = el('button', 'term-close', 'ESC');
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', tr().close);
        bar.append(dots, el('span', 'tc-title', 'guest@yatoub: ~'), closeBtn);

        const body = el('div', 'term-body');
        out = el('div', 'term-out');
        out.setAttribute('role', 'log');
        out.setAttribute('aria-live', 'polite');
        const line = el('div', 'term-line');
        promptEl = el('label', 'term-prompt');
        promptEl.htmlFor = 'termInput';
        input = el('input', 'term-input');
        input.id = 'termInput';
        input.type = 'text';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.setAttribute('autocapitalize', 'off');
        input.setAttribute('autocorrect', 'off');
        line.append(promptEl, input);
        body.append(out, line);
        win.append(bar, body);
        root.append(win);
        document.body.append(root);

        input.addEventListener('keydown', onKey);
        root.addEventListener('keydown', trap);
        closeBtn.addEventListener('click', close);
        root.addEventListener('mousedown', (e) => { if (e.target === root) close(); });
        // Clicking anywhere in the window focuses the prompt, unless the user is selecting text
        body.addEventListener('mouseup', () => { if (!String(window.getSelection())) input.focus(); });
    }

    async function open() {
        if (root && !root.hidden) return;
        opener = document.activeElement;
        if (!root) {
            booting ??= loadData().then(data => {
                rebuild(data);
                build();
                print(tr().welcome, 'dim');
            });
            await booting;
        } else if (ctx.state.lang !== currentLang) {
            rebuild(ctx.data);      // language switched from the navbar while closed
        }
        refreshPrompt();
        root.hidden = false;
        document.body.style.overflow = 'hidden';
        input.focus();
        scrollDown();
    }

    function close() {
        if (!root || root.hidden) return;
        root.hidden = true;
        document.body.style.overflow = '';
        input.blur();
        opener?.focus?.();
    }

    const toggle = () => (root && !root.hidden ? close() : open());

    return { open, close, toggle };
})();

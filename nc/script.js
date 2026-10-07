/* ═══════════════════════════════════════════
   YATOUB // NC — page script
   Turns the typed request into a same-origin fetch (core.js decides
   what may be sent) and prints the real response. Response headers
   and bodies come from the network: textContent only. The CTF header
   is never echoed. Progress is a list of challenge ids in localStorage.
   ═══════════════════════════════════════════ */

'use strict';

const { $, t, tf, el } = Page;
const STORAGE_KEY = 'nc';
const EXAMPLE = 'GET /robots.txt HTTP/1.1\nHost: yatoub.dev\n';
const NOTES = ['binary', 'browser', 'origin'];
const RESET_CONFIRM_MS = 4000;

/* ── State ── */
let done = [];                  // ids of passed challenges
const hints = new Set();        // hints revealed this session
let last = null;                // { req, text | null, state: 'ok' | 'failed' | 'redirect' | 'sending' }
let fresh = [];                 // challenges passed by the last exchange
let resetArmed = null;

function loadProgress() {
    try { done = NcCore.parseProgress(localStorage.getItem(STORAGE_KEY)); }
    catch { done = []; /* stockage bloqué : progression en mémoire */ }
}
function saveProgress() {
    try { localStorage.setItem(STORAGE_KEY, NcCore.serializeProgress(done)); }
    catch { /* stockage bloqué */ }
}

/* ── Exchange ── */
async function send(text) {
    const req = NcCore.parse(text, location.hostname || 'yatoub.dev');
    fresh = [];
    if (!req.ok) { last = { req, text: null, state: 'idle' }; return render(); }

    last = { req, text: null, state: 'sending' };
    render();
    const { path, init } = NcCore.toFetch(req);
    const url = new URL(path, location.origin);
    // Belt and braces: the path was validated, the resolved URL must still be this origin
    if (url.origin !== location.origin) { last.state = 'failed'; return render(); }
    try {
        const r = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
        if (r.type === 'opaqueredirect') { last.state = 'redirect'; return render(); }
        const type = r.headers.get('content-type');
        const buffer = req.method === 'HEAD' ? new ArrayBuffer(0) : await r.arrayBuffer();
        await new Promise((resolve) => setTimeout(resolve, 0));
        const entry = performance.getEntriesByName(url.href).pop();
        const proto = { h2: 'HTTP/2', h3: 'HTTP/3' }[entry?.nextHopProtocol] ?? 'HTTP/1.1';
        const res = {
            protocol: proto,
            status: r.status,
            headers: [...r.headers.entries()],
            body: NcCore.textual(type) ? new TextDecoder().decode(buffer) : null,
            bytes: buffer.byteLength,
            redirected: false,
        };
        last.text = NcCore.format(res);
        last.state = 'ok';
        fresh = NcCore.passed(req, res).filter((id) => !done.includes(id));
        if (fresh.length) {
            done = NcCore.parseProgress(JSON.stringify([...done, ...fresh]));
            saveProgress();
        }
    } catch {
        last.state = 'failed';
    }
    render();
}

/* ── Rendering ── */
function renderExchange() {
    const req = last?.req;
    const items = [];
    for (const id of req?.errors ?? []) { const li = el('li', 'nc-msg', t(`err.${id}`)); li.dataset.kind = 'err'; items.push(li); }
    for (const id of req?.notes ?? []) { const li = el('li', 'nc-msg', t(`note.${id}`)); li.dataset.kind = 'note'; items.push(li); }
    $('#msgs').replaceChildren(...items);

    // What actually left, header by header
    $('#sent').replaceChildren(...(req?.ok ? req.headers : []).map((h) => {
        const li = el('li', 'nc-sent-item');
        li.dataset.sent = String(h.sent);
        li.append(el('code', '', `${h.name}: ${h.value}`), el('span', 'pg-tag', t(h.sent ? 'out.sent' : 'out.notSent')));
        return li;
    }));

    const out = $('#out');
    out.dataset.state = last?.state ?? 'idle';
    out.textContent = !last || last.state === 'idle' ? t('out.waiting')
        : last.state === 'sending' ? t('out.sending')
        : last.state === 'redirect' ? t('out.redirect')
        : last.state === 'failed' ? t('out.failed')
        : last.text;
}

function renderChallenges() {
    const total = NcCore.CHALLENGES.length;
    $('#done').textContent = tf('ch.done', { n: done.length, total });
    $('#navDone').textContent = `${done.length}/${total}`;
    document.body.dataset.complete = String(done.length === total);

    $('#challenges').replaceChildren(...NcCore.CHALLENGES.map(({ id }) => {
        const ok = done.includes(id);
        const li = el('li', 'nc-ch');
        li.dataset.state = ok ? 'done' : 'todo';
        if (fresh.includes(id)) li.dataset.fresh = 'true';
        const head = el('div', 'nc-ch-name');
        head.append(el('span', 'nc-ch-mark', ok ? '[x]' : '[ ]'), el('span', '', t(`ch.${id}.name`)));
        li.append(head, el('p', 'nc-ch-goal', t(`ch.${id}.goal`)));
        if (ok) li.append(el('p', 'nc-ch-why', t(`ch.${id}.why`)));
        else if (hints.has(id)) li.append(el('p', 'nc-ch-hint', t(`ch.${id}.hint`)));
        else {
            const btn = el('button', 'pg-link-btn', `[ ${t('ch.hint')} ]`);
            btn.type = 'button';
            btn.addEventListener('click', () => { hints.add(id); render(); });
            li.append(btn);
        }
        return li;
    }));

    const reset = $('#reset');
    reset.hidden = done.length === 0;
    reset.textContent = t(resetArmed ? 'ch.confirm' : 'ch.reset');
    reset.dataset.armed = String(Boolean(resetArmed));
}

function render() {
    renderExchange();
    renderChallenges();
    $('#notes').replaceChildren(...NOTES.map((id) => {
        const card = el('article', 'pg-panel');
        card.append(el('h3', 'pg-panel-title', t(`honest.${id}.name`)), el('p', 'nc-note-text', t(`honest.${id}.text`)));
        return card;
    }));
}

/* ── Boot ── */
loadProgress();
$('#req').value = EXAMPLE;
Page.init(render);

$('#form').addEventListener('submit', (e) => { e.preventDefault(); send($('#req').value); });
$('#req').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send($('#req').value); }
});
$('#example').addEventListener('click', () => { $('#req').value = EXAMPLE; $('#req').focus(); });

// Two clicks instead of a browser dialog: the first arms the button for a few seconds
$('#reset').addEventListener('click', () => {
    if (!resetArmed) {
        resetArmed = setTimeout(() => { resetArmed = null; render(); }, RESET_CONFIRM_MS);
        return render();
    }
    clearTimeout(resetArmed);
    resetArmed = null;
    done = [];
    fresh = [];
    hints.clear();
    saveProgress();
    render();
});

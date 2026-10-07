/* ═══════════════════════════════════════════
   YATOUB // CTF — page script
   Flags are checked against the SHA-256 hashes of core.js.
   Progress is a list of found ids in localStorage; a submitted
   flag is hashed and dropped, never stored.
   ═══════════════════════════════════════════ */

'use strict';

const STORAGE_KEY = 'ctf';
const BAR_CELLS = 3;            // progress-bar characters per flag
const RESET_CONFIRM_MS = 4000;
const $ = (s) => document.querySelector(s);

/* ── i18n — strings in translations.js (même mécanique que le portfolio) ── */
function detectLang() {
    let saved = null;
    try { saved = localStorage.getItem('lang'); } catch { /* stockage bloqué */ }
    if (saved === 'en' || saved === 'fr') return saved;
    return navigator.language?.startsWith('fr') ? 'fr' : 'en';
}
let currentLang = detectLang();

function t(key, lang = currentLang) {
    return key.split('.').reduce((obj, k) => obj?.[k], translations[lang]) ?? key;
}

function tf(key, vars = {}) {
    return t(key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

function applyLang(lang) {
    currentLang = lang;
    document.documentElement.lang = lang;
    try { localStorage.setItem('lang', lang); } catch { /* stockage bloqué */ }

    document.querySelectorAll('[data-i18n]').forEach((el) => {
        el.textContent = t(el.dataset.i18n);
    });
    $('#langLabel').textContent = lang === 'en' ? 'FR' : 'EN';
    render();
}

/* ── State ── */
const FLAGS = CtfCore.FLAGS;
let found = [];                 // ids, kept in display order by CtfCore
const hintsShown = new Set();   // session only
let message = null;             // { key, vars, kind } — re-rendered on language switch
let resetArmed = null;          // timeout id while the reset button waits for its second click

function loadProgress() {
    try { found = CtfCore.parseProgress(localStorage.getItem(STORAGE_KEY)); }
    catch { found = []; /* stockage bloqué : progression en mémoire pour la session */ }
}

function saveProgress() {
    try { localStorage.setItem(STORAGE_KEY, CtfCore.serializeProgress(found)); }
    catch { /* stockage bloqué */ }
}

/* ── Rendering ── */
function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
}

function block(labelKey, node) {
    const wrap = el('div', 'ctf-block');
    wrap.append(el('p', 'ctf-block-label', t(labelKey)), node);
    return wrap;
}

function renderCard(flag, index) {
    const isFound = found.includes(flag.id);
    const card = el('article', 'ctf-card');
    card.id = `flag-${flag.id}`;
    card.dataset.state = isFound ? 'found' : 'locked';

    const head = el('div', 'ctf-card-head');
    head.append(
        el('span', 'ctf-index', String(index + 1).padStart(2, '0')),
        el('h2', 'ctf-name', t(`flags.${flag.id}.title`)),
        el('span', 'ctf-pill', t(isFound ? 'card.found' : 'card.locked')),
    );
    card.append(head);

    if (isFound) {
        card.append(
            el('p', 'ctf-explain', t(`flags.${flag.id}.explain`)),
            block('card.cmd', el('code', 'ctf-cmd', `$ ${flag.cmd}`)),
            block('card.defense', el('p', 'ctf-defense', t(`flags.${flag.id}.defense`))),
        );
    } else if (hintsShown.has(flag.id)) {
        card.append(block('card.hintLabel', el('p', 'ctf-hint', t(`flags.${flag.id}.hint`))));
    } else {
        const btn = el('button', 'ctf-hint-btn', `[ ${t('card.hint')} ]`);
        btn.type = 'button';
        btn.addEventListener('click', () => { hintsShown.add(flag.id); render(); });
        card.append(btn);
    }
    return card;
}

function render() {
    const n = found.length;
    const total = FLAGS.length;

    $('#progress').setAttribute('aria-valuenow', String(n));
    $('#progressBar').textContent = '█'.repeat(n * BAR_CELLS) + '░'.repeat((total - n) * BAR_CELLS);
    $('#progressCount').textContent = `${n}/${total}`;
    $('#navCount').textContent = `${n}/${total}`;
    document.body.dataset.complete = String(n === total);

    $('#cards').replaceChildren(...FLAGS.map(renderCard));
    $('#done').hidden = n !== total;

    const reset = $('#reset');
    reset.hidden = n === 0;
    reset.textContent = `[ ${t(resetArmed ? 'reset.confirm' : 'reset.ask')} ]`;
    reset.dataset.armed = String(Boolean(resetArmed));

    const msg = $('#msg');
    msg.textContent = message ? tf(message.key, { ...message.vars, title: message.id ? t(`flags.${message.id}.title`) : '' }) : '';
    msg.dataset.kind = message?.kind ?? '';
}

function say(key, kind, extra = {}) {
    message = { key, kind, ...extra };
    render();
}

/* ── Submission ── */
async function submit(value) {
    if (!CtfCore.normalize(value)) return say('msg.empty', 'warn');
    if (!globalThis.crypto?.subtle) return say('msg.nocrypto', 'err');

    const id = await CtfCore.check(value, crypto.subtle);
    if (!id) return say('msg.wrong', 'err');

    const n = FLAGS.findIndex(f => f.id === id) + 1;
    if (found.includes(id)) return say('msg.already', 'warn', { id });

    found = CtfCore.parseProgress(JSON.stringify([...found, id]));
    saveProgress();
    $('#flagInput').value = '';
    say('msg.found', 'ok', { id, vars: { n } });
    document.getElementById(`flag-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function disarmReset() {
    clearTimeout(resetArmed);
    resetArmed = null;
}

/* ── Boot ── */
loadProgress();
applyLang(currentLang);

$('#langToggle').addEventListener('click', () => applyLang(currentLang === 'en' ? 'fr' : 'en'));

$('#form').addEventListener('submit', (e) => {
    e.preventDefault();
    submit($('#flagInput').value);
});

// Two clicks instead of a browser dialog: the first arms the button for a few seconds
$('#reset').addEventListener('click', () => {
    if (!resetArmed) {
        resetArmed = setTimeout(() => { disarmReset(); render(); }, RESET_CONFIRM_MS);
        return render();
    }
    disarmReset();
    found = [];
    hintsShown.clear();
    message = null;
    saveProgress();
    render();
});

// Another tab found a flag: keep both in sync
window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    loadProgress();
    render();
});

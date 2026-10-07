/* ═══════════════════════════════════════════
   YATOUB // TCPDUMP — page script
   Durations come from the browser's Navigation / Resource Timing
   entries; the TLS view from /whoami/server.json (Caddy template,
   only rendered behind Caddy). Nothing is stored or sent.
   ═══════════════════════════════════════════ */

'use strict';

const SERVER_URL = '/whoami/server.json';
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

/* ── Data ── */
let navTiming = null;   // waterfall of the document
let nextTiming = null;  // waterfall of the follow-up request
let navRaw = null;      // raw navigation entry, for compression
let conn = null;        // /whoami/server.json, null when unavailable
let measured = false;

async function measure() {
    navRaw = performance.getEntriesByType?.('navigation')[0] ?? null;
    const https = location.protocol === 'https:';
    if (navRaw) navTiming = TcpdumpCore.waterfall(navRaw, { https });

    // The follow-up request doubles as the source of the TLS view
    try {
        const r = await fetch(SERVER_URL, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
        const body = await r.text();
        // The resource entry is queued once the body has been read
        await new Promise((resolve) => setTimeout(resolve, 0));
        const entry = performance.getEntriesByName(new URL(SERVER_URL, location.href).href).pop();
        if (entry) nextTiming = TcpdumpCore.waterfall(entry, { https });
        // Static hosting serves the template source: not JSON, so no server view
        conn = r.ok ? JSON.parse(body) : null;
    } catch {
        conn = null;
    }
    measured = true;
    render();
}

/* ── Rendering ── */
function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
}

const fmtMs = (n) => tf('wf.ms', { n: n.toLocaleString(currentLang, { maximumFractionDigits: n < 10 ? 1 : 0 }) });
const phaseKey = (id, protocol) => (id === 'tcp' ? TcpdumpCore.transport(protocol) : id);

function renderWaterfall(titleKey, descKey, wf, scale, notes) {
    const panel = el('article', 'wr-panel');
    const head = el('div', 'wr-panel-head');
    head.append(el('h3', 'wr-panel-title', t(titleKey)));
    if (wf.protocol) head.append(el('span', 'wr-tag', wf.protocol));
    const total = el('span', 'wr-total');
    total.append(`${t('wf.total')} `, el('strong', '', fmtMs(wf.total)));
    head.append(total);
    panel.append(head, el('p', 'wr-panel-desc', t(descKey)));

    const chart = el('div', 'wr-chart');
    chart.setAttribute('role', 'table');
    for (const p of wf.phases) {
        const name = t(`phase.${phaseKey(p.id, wf.protocol)}.name`);
        const value = p.state === 'reused' ? t('wf.reused') : p.state === 'none' ? t('wf.none') : fmtMs(p.duration);

        const row = el('div', 'wr-row');
        row.setAttribute('role', 'row');
        row.dataset.state = p.state;
        row.title = `${name} — ${value}`;

        const label = el('span', 'wr-row-label', name);
        label.setAttribute('role', 'rowheader');

        const track = el('span', 'wr-track');
        track.setAttribute('aria-hidden', 'true');
        const bar = el('span', 'wr-bar');
        bar.style.left = `${(p.start / scale) * 100}%`;
        bar.style.width = `${(p.duration / scale) * 100}%`;
        track.append(bar);

        const val = el('span', 'wr-row-value', value);
        val.setAttribute('role', 'cell');
        row.append(label, track, val);
        chart.append(row);
    }
    panel.append(chart);

    for (const note of notes.filter(Boolean)) panel.append(el('p', 'wr-panel-note', note));
    return panel;
}

function renderWaterfalls() {
    const host = $('#waterfalls');
    if (!measured) return host.replaceChildren();
    if (!navTiming) return host.replaceChildren(el('p', 'wr-note', t('wf.unsupported')));

    // One scale for both panels: the second request must look as short as it is
    const scale = Math.max(navTiming.total, nextTiming?.total ?? 0, 1);
    const size = TcpdumpCore.compression(navRaw);
    const hasTls = navTiming.phases.some((p) => p.id === 'tls' && p.state !== 'none');

    const panels = [renderWaterfall('wf.nav', 'wf.navDesc', navTiming, scale, [
        navTiming.cached ? t('wf.cachedNote') : navTiming.reused ? t('wf.navReusedNote') : null,
        hasTls ? null : t('wf.noTls'),
        size ? tf('wf.compression', {
            encoded: size.encoded.toLocaleString(currentLang),
            decoded: size.decoded.toLocaleString(currentLang),
            ratio: size.ratio,
        }) : null,
    ])];
    if (nextTiming) {
        panels.push(renderWaterfall('wf.next', 'wf.nextDesc', nextTiming, scale, [nextTiming.reused ? t('wf.reusedNote') : null]));
    }
    host.replaceChildren(...panels);
}

function renderGlossary() {
    const protocol = navTiming?.protocol ?? '';
    const ids = navTiming ? navTiming.phases.map((p) => p.id) : ['dns', 'tcp', 'tls', 'wait', 'download', 'dom'];
    const nodes = ids.flatMap((id) => {
        const key = phaseKey(id, protocol);
        return [el('dt', 'wr-term', t(`phase.${key}.name`)), el('dd', 'wr-def', t(`phase.${key}.explain`))];
    });
    $('#glossary').replaceChildren(...nodes);
}

function renderObserver() {
    const rows = TcpdumpCore.observer(conn ?? {});
    const version = TcpdumpCore.tlsVersion(conn?.tls);

    const note = $('#obsNote');
    const noteKey = !conn ? 'obs.noServer' : !version ? 'obs.plain' : version !== '1.3' ? 'obs.tls12' : null;
    note.hidden = !measured || !noteKey;
    note.textContent = noteKey ? t(noteKey) : '';

    const column = (visible) => {
        const col = el('div', 'wr-col');
        col.dataset.kind = visible ? 'visible' : 'hidden';
        col.append(el('h3', 'wr-col-title', t(visible ? 'obs.visible' : 'obs.hidden')),
            el('p', 'wr-col-desc', t(visible ? 'obs.visibleDesc' : 'obs.hiddenDesc')));
        const list = el('ul', 'wr-items');
        for (const r of rows.filter((x) => x.visible === visible)) {
            const item = el('li', 'wr-item');
            item.append(el('p', 'wr-item-name', t(`obs.rows.${r.id}.name`)));
            if (r.value) {
                const value = el('p', 'wr-item-value');
                value.append(el('span', 'wr-item-yours', `${t('obs.yours')} `), el('code', '', r.value));
                item.append(value);
            }
            item.append(el('p', 'wr-item-why', t(`obs.rows.${r.id}.why`)));
            list.append(item);
        }
        col.append(list);
        return col;
    };
    // An unencrypted connection has nothing in the second column
    $('#observer').replaceChildren(...[true, false].map(column).filter((c) => c.querySelector('.wr-item')));
}

function renderCipher() {
    const host = $('#cipher');
    const version = TcpdumpCore.tlsVersion(conn?.tls);
    if (!conn?.cipher || !version) return host.replaceChildren(el('p', 'wr-note', measured ? t('cipher.none') : ''));

    const parts = TcpdumpCore.decodeCipher(conn.cipher);
    const head = el('p', 'wr-suite');
    head.append(el('span', 'wr-tag', tf('cipher.version', { v: version })), el('code', 'wr-suite-name', conn.cipher));
    if (!parts.length) return host.replaceChildren(head, el('p', 'wr-note', tf('cipher.unknown', { name: conn.cipher })));

    const list = el('dl', 'wr-parts');
    for (const p of parts) {
        const item = el('div', 'wr-part');
        item.append(el('dt', 'wr-part-token', p.token.replace('_', '-')),
            el('dd', 'wr-part-role', t(`cipher.roles.${p.role}`)),
            el('dd', 'wr-part-why', t(`cipher.tokens.${p.role}.${p.token}`)));
        list.append(item);
    }
    const nodes = [head, list];
    if (version === '1.3') nodes.push(el('p', 'wr-note', t('cipher.tls13')));
    host.replaceChildren(...nodes);
}

function render() {
    $('#navProto').textContent = navTiming?.protocol?.toUpperCase() || (measured ? '—' : '…');
    renderWaterfalls();
    renderGlossary();
    renderObserver();
    renderCipher();
}

/* ── Boot ── */
applyLang(currentLang);
$('#langToggle').addEventListener('click', () => applyLang(currentLang === 'en' ? 'fr' : 'en'));

// The navigation entry is only complete once the load event has finished
if (document.readyState === 'complete') setTimeout(measure, 0);
else window.addEventListener('load', () => setTimeout(measure, 0));

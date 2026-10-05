/* ═══════════════════════════════════════════
   YATOUB // STATUS — page script
   /data/status.json is written every 5 min by an exporter
   on the server (VictoriaMetrics → JSON, public ids only).
   /homelab.json gives the display name and badge per id ;
   ids missing from it are ignored.
   ═══════════════════════════════════════════ */

'use strict';

const REFRESH_MS = 60 * 1000;
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
let catalog = [];       // homelab.json
let payload = null;     // status.json, null until loaded or when unreadable
let serverNow = null;   // HTTP Date of the last fetch: visitor clocks cannot be trusted for staleness
let loaded = false;

async function load() {
    try {
        const r = await fetch('/data/status.json', { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        payload = await r.json();
        serverNow = Date.parse(r.headers.get('Date')) || Date.now();
    } catch {
        payload = null;
        serverNow = null;
    }
    loaded = true;
    render();
}

/* ── Rendering ── */
function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
}

function ago(ms) {
    const min = Math.floor(ms / 60000);
    if (min < 1) return t('meta.justNow');
    if (min < 60) return tf('meta.minutes', { n: min });
    if (min < 48 * 60) return tf('meta.hours', { n: Math.floor(min / 60) });
    return tf('meta.days', { n: Math.floor(min / 1440) });
}

function renderRow(svc, meta, trusted) {
    const state = !trusted ? 'unknown' : svc.state === 'up' ? 'up' : 'down';
    const row = el('article', 'st-row');

    const head = el('div', 'st-row-head');
    const pill = el('span', 'st-pill', t(`pill.${state}`));
    pill.dataset.state = state;
    head.append(
        el('h2', 'st-name', meta.name),
        el('span', 'st-badge', currentLang === 'fr' ? meta.badge_fr : meta.badge_en),
        pill,
    );

    const days = Array.isArray(svc.days) ? svc.days : [];
    const bars = el('div', 'st-bars');
    days.forEach((v, i) => {
        const bar = el('span', 'st-bar');
        bar.dataset.day = StatusCore.dayClass(v);
        const back = days.length - 1 - i;
        const when = back === 0 ? t('row.today') : tf('row.ago', { n: back });
        const pct = StatusCore.fmtUptime(v);
        bar.title = `${when} — ${pct === null ? t('row.nodata') : pct + ' %'}`;
        bars.append(bar);
    });

    const foot = el('div', 'st-row-foot');
    const uptime = el('span');
    const pct = StatusCore.fmtUptime(svc.uptime);
    uptime.append(el('strong', '', pct === null ? '—' : `${pct} %`), ` ${tf('row.uptime', { n: days.length })}`);
    const latency = el('span');
    const ms = Number.isFinite(svc.latency_ms) ? `${Math.round(svc.latency_ms)} ms` : '—';
    latency.append(`${t('row.latency')} `, el('strong', '', trusted ? ms : '—'));
    foot.append(uptime, latency);

    row.append(head, bars, foot);
    return row;
}

function render() {
    const now = serverNow ?? Date.now();
    const sum = loaded ? StatusCore.summarize(payload, now) : { state: 'loading' };
    const trusted = ['up', 'degraded', 'down'].includes(sum.state);

    $('#statusDot').dataset.state = sum.state;
    $('#statusText').textContent = t(`nav.${sum.state}`);

    $('#banner').dataset.state = sum.state;
    $('#bannerState').textContent = tf(`state.${sum.state}`, { n: sum.down, total: sum.total });
    const meta = [];
    if (sum.age != null) meta.push(tf('meta.updated', { when: ago(Math.max(sum.age, 0)) }));
    if (sum.state === 'stale') meta.push(t('meta.staleHint'));
    if (sum.state === 'unknown') meta.push(t('meta.noneHint'));
    $('#bannerMeta').textContent = meta.join(' · ');

    const byId = new Map((payload?.services || []).map((s) => [s.id, s]));
    const rows = catalog.filter((m) => byId.has(m.id)).map((m) => renderRow(byId.get(m.id), m, trusted));
    $('#services').replaceChildren(...rows);
}

/* ── Boot ── */
applyLang(currentLang);
$('#langToggle').addEventListener('click', () => applyLang(currentLang === 'en' ? 'fr' : 'en'));

fetch('/homelab.json')
    .then((r) => r.json())
    .then((data) => { catalog = data; })
    .catch(() => { /* sans catalogue, seul le bandeau global s'affiche */ })
    .finally(() => {
        load();
        setInterval(load, REFRESH_MS);
    });

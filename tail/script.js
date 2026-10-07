/* ═══════════════════════════════════════════
   YATOUB // TAIL — page script
   /data/noise/noise.json is written every 10 min by an exporter
   on the server (Caddy access log → counters, no IP address).
   Paths and network names in it come from the outside world:
   they only ever reach the page through textContent.
   ═══════════════════════════════════════════ */

'use strict';

const DATA_URL = '/data/noise/noise.json';
const REFRESH_MS = 5 * 60 * 1000;
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
let payload = null;     // noise.json, null until loaded or when unreadable
let serverNow = null;   // HTTP Date of the last fetch: visitor clocks cannot be trusted for staleness
let loaded = false;

async function load() {
    try {
        const r = await fetch(DATA_URL, { cache: 'no-store' });
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

const num = (n) => n.toLocaleString(currentLang);
const probes = (n) => (n === 0 ? t('vol.none') : n === 1 ? t('vol.probe') : tf('vol.probes', { n: num(n) }));

function ago(ms) {
    const min = Math.floor(ms / 60000);
    if (min < 1) return t('meta.justNow');
    if (min < 60) return tf('meta.minutes', { n: min });
    if (min < 48 * 60) return tf('meta.hours', { n: Math.floor(min / 60) });
    return tf('meta.days', { n: Math.floor(min / 1440) });
}

const fmtHour = (ts) => new Date(ts).toLocaleString(currentLang, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtDay = (ts) => new Date(ts).toLocaleDateString(currentLang, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

// One bar per point, one hue: the series is named by the panel title, values are read on hover or focus
function renderChart(titleKey, descKey, pts, fmt, nDays, tickEvery) {
    const panel = el('article', 'tl-panel');
    const max = Math.max(0, ...pts.map(p => p.n));
    const top = TailCore.peak(pts);

    const head = el('div', 'tl-panel-head');
    head.append(el('h3', 'tl-panel-title', tf(titleKey, { n: nDays })));
    const readout = el('span', 'tl-readout', t('vol.hover'));
    head.append(readout);
    panel.append(head, el('p', 'tl-panel-desc', t(descKey)));

    const plot = el('div', 'tl-plot');
    plot.append(el('span', 'tl-axis-max', num(max)), el('span', 'tl-axis-zero', '0'));

    const bars = el('div', 'tl-bars');
    bars.setAttribute('role', 'img');
    bars.setAttribute('aria-label', top ? tf('vol.peak', { n: num(top.n), when: fmt(top.t) }) : t('vol.none'));
    const heights = TailCore.heights(pts);
    const idle = () => { readout.textContent = t('vol.hover'); };
    pts.forEach((p, i) => {
        const slot = el('span', 'tl-slot');
        const label = `${fmt(p.t)} — ${probes(p.n)}`;
        slot.title = label;
        if (tickEvery(p.t)) slot.dataset.tick = 'true';
        const bar = el('span', 'tl-bar');
        bar.style.height = `${heights[i] * 100}%`;
        if (p.n === 0) bar.dataset.empty = 'true';
        slot.append(bar);
        slot.addEventListener('mouseenter', () => { readout.textContent = label; });
        slot.addEventListener('mouseleave', idle);
        bars.append(slot);
    });
    plot.append(bars);
    panel.append(plot);

    if (top) panel.append(el('p', 'tl-panel-note', tf('vol.peak', { n: num(top.n), when: fmt(top.t) })));
    return panel;
}

function renderFamilies(data) {
    const nodes = TailCore.ranked(data.families).map((f) => {
        // Own entries only: an id such as "constructor" must not resolve to Object internals
        const known = Object.hasOwn(translations[currentLang].families, String(f.id));
        const card = el('article', 'tl-family');

        const head = el('div', 'tl-family-head');
        head.append(el('h3', 'tl-family-name', known ? t(`families.${f.id}.name`) : t('fam.unknown')));
        const figure = el('span', 'tl-family-count');
        figure.append(el('strong', '', num(f.count)), ` · ${tf('fam.share', { pct: TailCore.percent(f.share) })}`);
        head.append(figure);

        const track = el('span', 'tl-rank-track');
        track.setAttribute('aria-hidden', 'true');
        const bar = el('span', 'tl-rank-bar');
        bar.style.width = `${f.width * 100}%`;
        track.append(bar);

        card.append(head, track,
            el('p', 'tl-label', t('fam.wanted')),
            el('p', 'tl-family-wanted', known ? t(`families.${f.id}.wanted`) : t('fam.unknownWanted')));

        const paths = Array.isArray(f.paths) ? f.paths.filter(p => typeof p?.path === 'string') : [];
        if (paths.length) {
            const list = el('ul', 'tl-paths');
            for (const p of paths) {
                const item = el('li', 'tl-path');
                item.append(el('code', '', p.path), el('span', 'tl-path-count', tf('fam.times', { n: num(p.count) })));
                list.append(item);
            }
            card.append(el('p', 'tl-label', t('fam.paths')), list);
        }
        return card;
    });
    $('#families').replaceChildren(...nodes);
    $('#windowNote').textContent = tf('fam.windowNote', { n: data.window_days });
}

function countryName(cc) {
    try { return new Intl.DisplayNames([currentLang], { type: 'region' }).of(cc) || cc; }
    catch { return cc; }
}

function renderRanking(titleKey, items, labelOf) {
    const col = el('div', 'tl-col');
    col.append(el('h3', 'tl-col-title', t(titleKey)));
    const list = el('ol', 'tl-rank');
    for (const item of items) {
        const row = el('li', 'tl-rank-row');
        const track = el('span', 'tl-rank-track');
        track.setAttribute('aria-hidden', 'true');
        const bar = el('span', 'tl-rank-bar');
        bar.style.width = `${item.width * 100}%`;
        track.append(bar);
        row.append(el('span', 'tl-rank-label', labelOf(item)), el('span', 'tl-rank-value', num(item.count)), track);
        list.append(row);
    }
    col.append(list);
    return col;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, text) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    return node;
}

// Dot-matrix world map: grey dots for land, one marker per country that sent probes
let landDots = null;    // built once, reused across redraws
function renderMap(data) {
    const host = $('#map');
    const marks = typeof TailMap === 'undefined' ? [] : TailCore.markers(TailMap, data.countries);
    host.hidden = !marks.length;
    if (!marks.length) return host.replaceChildren();

    if (!landDots) {
        landDots = svg('g', { class: 'tl-land' });
        for (const [col, row] of TailCore.landCells(TailMap)) landDots.append(svg('circle', { cx: col + 0.5, cy: row + 0.5, r: 0.3 }));
    }
    const top = [...marks].sort((a, b) => b.count - a.count);
    const root = svg('svg', { class: 'tl-map-svg', viewBox: `0 0 ${TailMap.cols} ${TailMap.rows}`, role: 'img',
        'aria-label': tf('geo.mapLabel', { n: marks.length, top: countryName(top[0].cc) }) });
    const layer = svg('g');
    for (const m of marks) {
        const g = svg('g', { class: 'tl-mark' });
        g.append(svg('title', {}, `${countryName(m.cc)} — ${probes(m.count)}`),
            svg('circle', { class: 'tl-mark-ring', cx: m.x, cy: m.y, r: m.r }),
            svg('circle', { class: 'tl-mark-dot', cx: m.x, cy: m.y, r: m.r }));
        layer.append(g);
    }
    // A few of the busiest countries are named on the map ; the others are in the ranking
    for (const m of TailCore.labelled(marks)) layer.append(svg('text', { class: 'tl-mark-label', x: m.x, y: m.y - m.r - 0.8, 'text-anchor': 'middle' }, m.cc));
    root.append(landDots, layer);
    host.replaceChildren(root, el('figcaption', 'tl-meta', t('geo.mapCaption')));
}

function renderOrigin(data) {
    renderMap(data);
    const countries = TailCore.ranked(data.countries);
    const networks = TailCore.ranked(data.networks);
    const hasGeo = data.geo !== false && (countries.length || networks.length);

    const cols = [];
    if (countries.length) cols.push(renderRanking('geo.countries', countries, c => countryName(String(c.cc))));
    if (networks.length) cols.push(renderRanking('geo.networks', networks, n => (n.name ? String(n.name) : tf('geo.unknownNetwork', { n: n.asn }))));
    $('#origin').replaceChildren(...cols);
    $('#geoNote').textContent = t(hasGeo ? 'geo.caveat' : 'geo.none');
}

function render() {
    const now = serverNow ?? Date.now();
    const sum = loaded ? TailCore.summarize(payload, now) : { state: 'loading', age: null };
    const ok = sum.state === 'ok';

    $('#statusDot').dataset.state = sum.state;
    $('#statusText').textContent = t(`nav.${sum.state}`);

    // The banner only shows when there is nothing trustworthy to display
    const banner = $('#banner');
    banner.hidden = ok;
    banner.dataset.state = sum.state;
    $('#bannerState').textContent = ok ? '' : t(`state.${sum.state}`);
    const hint = { stale: 'meta.staleHint', unknown: 'meta.noneHint', empty: 'meta.emptyHint' }[sum.state];
    $('#bannerMeta').textContent = hint ? t(hint) : '';

    $('#stats').hidden = !ok;
    $('#content').hidden = !ok;
    $('#updated').textContent = sum.age != null && sum.state !== 'unknown' ? tf('meta.updated', { when: ago(Math.max(sum.age, 0)) }) : '';
    $('#other').textContent = '';
    $('#byIp').textContent = '';
    if (!ok) return;

    const last = payload.last24;
    $('#statRequests').textContent = num(last.requests ?? 0);
    $('#statSources').textContent = num(last.sources ?? 0);
    const pace = TailCore.rate(last.requests);
    $('#statRate').textContent = pace.unit === 'none' ? t('stat.none') : tf(`stat.${pace.unit}`, { n: num(pace.n) });
    if (last.other > 0) $('#other').textContent = tf('stat.other', { n: num(last.other) });
    // Older exports do not carry this counter: the line simply stays out
    if (last.by_ip > 0 && last.requests > 0) {
        $('#byIp').textContent = tf('stat.byIp', { n: num(last.by_ip), pct: TailCore.percent(Math.min(last.by_ip / last.requests, 1)) });
    }

    const hours = TailCore.hours(payload);
    const days = TailCore.days(payload);
    const charts = [renderChart('vol.hourly', 'vol.hourlyDesc', hours, fmtHour, Math.round(hours.length / 24), ts => new Date(ts).getHours() === 0)];
    if (days.length) charts.push(renderChart('vol.daily', 'vol.dailyDesc', days, fmtDay, days.length, ts => new Date(ts).getUTCDay() === 1));
    $('#charts').replaceChildren(...charts);

    renderFamilies(payload);
    renderOrigin(payload);
}

/* ── Boot ── */
applyLang(currentLang);
$('#langToggle').addEventListener('click', () => applyLang(currentLang === 'en' ? 'fr' : 'en'));

load();
setInterval(load, REFRESH_MS);

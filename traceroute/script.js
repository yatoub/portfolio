/* ═══════════════════════════════════════════
   YATOUB // TRACEROUTE — page script
   Draws the chain of core.js as an SVG diagram and replays each
   round trip of the page load on it. Durations come from the
   Navigation Timing entry, through /tcpdump/core.js ; the address
   seen on arrival from /whoami/server.json (only behind Caddy).
   Nothing is stored or sent, and the server probes nobody.
   ═══════════════════════════════════════════ */

'use strict';

const { $, t, tf, el, num } = Page;
const NS = 'http://www.w3.org/2000/svg';
const TRIP_MS = 1700;       // animation length of one round trip, whatever its real duration
const PAUSE_MS = 350;
const NOTES = ['ttl', 'trick', 'stars', 'limits'];
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const narrow = window.matchMedia('(max-width: 768px)');

/* ── Data ── */
let wf = null;          // TcpdumpCore.waterfall() of this page load, null when unsupported
let conn = null;        // /whoami/server.json, null when unavailable
let measured = false;
let trips = TracerouteCore.trips(null);
let active = null;      // id of the trip currently lit
let run = 0;            // incremented to cancel a running animation

async function measure() {
    const nav = performance.getEntriesByType?.('navigation')[0];
    if (nav) wf = TcpdumpCore.waterfall(nav, { https: location.protocol === 'https:' });
    trips = TracerouteCore.trips(wf);
    measured = true;
    render();
    play();
    try {
        const r = await fetch('/whoami/server.json', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
        conn = r.ok ? await r.json() : null;
    } catch {
        conn = null;
    }
    renderMeta();
}

/* ── Layout: every node is { x, y, w, h } ; wide screens read left to right, narrow ones top to bottom ── */
function layout() {
    const box = {};
    const chain = TracerouteCore.CHAIN;
    if (narrow.matches) {
        const size = { w: 150, h: 44 };
        chain.forEach((n, i) => { box[n.id] = { x: 14, y: 12 + i * 68, ...size }; });
        box.resolver = { x: 196, y: box.isp.y, w: 130, h: 44 };
        return { box, W: 340, H: 12 + chain.length * 68, vertical: true };
    }
    const size = { w: 106, h: 46 };
    chain.forEach((n, i) => { box[n.id] = { x: 6 + i * 126, y: 150, ...size }; });
    box.resolver = { x: box.isp.x, y: 30, ...size };
    return { box, W: 1000, H: 262, vertical: false };
}

const centre = (b) => [b.x + b.w / 2, b.y + b.h / 2];

function svg(tag, attrs = {}, text) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    return node;
}

let geometry = null;    // layout of the diagram currently on screen

function draw() {
    geometry = layout();
    const { box, W, H, vertical } = geometry;
    const root = svg('svg', { class: 'tr-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t('hero.title') });
    const edges = svg('g');
    const nodes = svg('g');

    const allEdges = [...TracerouteCore.edges(TracerouteCore.CHAIN.map(n => n.id)), [TracerouteCore.BRANCH.from, TracerouteCore.BRANCH.id]];
    for (const [from, to] of allEdges) {
        const [x1, y1] = centre(box[from]);
        const [x2, y2] = centre(box[to]);
        edges.append(svg('line', { class: 'tr-edge', 'data-edge': TracerouteCore.edgeId(from, to), 'data-side': from === 'isp' && to === 'net' || from === 'net' ? 'net' : '', x1, y1, x2, y2 }));
    }

    for (const n of TracerouteCore.NODES) {
        const b = box[n.id];
        const g = svg('g', { class: 'tr-node', 'data-node': n.id, 'data-side': n.side, transform: `translate(${b.x},${b.y})` });
        g.append(svg('rect', { width: b.w, height: b.h, rx: 2 }),
            svg('text', { class: 'tr-name', x: 10, y: 19 }, t(`node.${n.id}.name`)),
            svg('text', { class: 'tr-sub', x: 10, y: 35 }, t(`node.${n.id}.sub`)));
        nodes.append(g);
    }

    // Who owns what: a bracket under (or beside) each group of nodes
    const labels = svg('g');
    for (const side of ['you', 'net', 'server']) {
        const group = TracerouteCore.CHAIN.filter(n => n.side === side).map(n => box[n.id]);
        const first = group[0], last = group[group.length - 1];
        if (vertical) {
            if (side === 'you') continue;   // the resolver sits there
            labels.append(svg('text', { class: 'tr-side', x: first.x + first.w + 14, y: (first.y + last.y + last.h) / 2 + 4 }, t(`side.${side}`)));
        } else {
            const y = first.y + first.h + 22;
            labels.append(svg('line', { class: 'tr-bracket', x1: first.x, y1: y, x2: last.x + last.w, y2: y }),
                svg('text', { class: 'tr-side', x: (first.x + last.x + last.w) / 2, y: y + 18, 'text-anchor': 'middle' }, t(`side.${side}`)));
        }
    }

    const packet = svg('circle', { class: 'tr-packet', r: 6, cx: -20, cy: -20 });
    root.append(edges, labels, nodes, packet);
    $('#canvas').replaceChildren(root);
}

/* ── Lighting and animation ── */
const node = (id) => $(`#canvas [data-node="${id}"]`);
const edge = (from, to) => $(`#canvas [data-edge="${TracerouteCore.edgeId(from, to)}"]`);

function clearLights() {
    document.querySelectorAll('#canvas .on').forEach(n => n.classList.remove('on'));
    $('#canvas .tr-packet')?.setAttribute('cx', -20);
}

function lightPath(path) {
    path.forEach(id => node(id)?.classList.add('on'));
    TracerouteCore.edges(path).forEach(([a, b]) => edge(a, b)?.classList.add('on'));
}

function markActive(id) {
    active = id;
    document.querySelectorAll('#trips .tr-trip').forEach(li => li.classList.toggle('on', li.dataset.trip === id));
}

// One round trip: the packet travels out along the path, lighting it, then comes back
function animate(trip, token) {
    return new Promise((resolve) => {
        clearLights();
        markActive(trip.id);
        const pathEdges = TracerouteCore.edges(trip.path);
        const packet = $('#canvas .tr-packet');
        if (reduced.matches || !pathEdges.length || !packet) {
            lightPath(trip.path);
            return resolve();
        }
        node(trip.path[0])?.classList.add('on');
        const start = performance.now();
        const frame = (now) => {
            if (token !== run) return resolve();
            const progress = Math.min(((now - start) / TRIP_MS) * 2, 2);
            const at = TracerouteCore.locate(progress, pathEdges.length);
            const [from, to] = pathEdges[at.index];
            const [x1, y1] = centre(geometry.box[from]);
            const [x2, y2] = centre(geometry.box[to]);
            packet.setAttribute('cx', x1 + (x2 - x1) * at.t);
            packet.setAttribute('cy', y1 + (y2 - y1) * at.t);
            if (!at.back) {
                // Everything behind the packet is lit
                pathEdges.slice(0, at.index + 1).forEach(([a, b]) => { edge(a, b)?.classList.add('on'); node(a)?.classList.add('on'); });
                if (at.t > 0.9) node(to)?.classList.add('on');
            }
            if (progress < 2) return requestAnimationFrame(frame);
            lightPath(trip.path);
            packet.setAttribute('cx', -20);
            resolve();
        };
        requestAnimationFrame(frame);
    });
}

const playable = () => trips.filter(trip => trip.state === 'measured' || !wf);

async function play(only) {
    const token = ++run;
    const list = only ? [only] : playable();
    for (const trip of list) {
        if (token !== run) return;
        await animate(trip, token);
        if (token !== run) return;
        if (!reduced.matches) await new Promise(resolve => setTimeout(resolve, PAUSE_MS));
    }
}

/* ── Rendering ── */
const fmt = (ms) => num(ms, { maximumFractionDigits: ms < 10 ? 1 : 0 });
// HTTP/3 opens its connection with QUIC: same trip, another name and explanation
const tripKey = (trip) => (trip.id === 'transport' && TcpdumpCore.transport(wf?.protocol ?? '') === 'quic' ? 'quic' : trip.id);

function renderPanel() {
    const sum = TracerouteCore.summary(trips);
    $('#summary').textContent = !measured ? t('panel.loading')
        : !wf ? t('panel.unsupported')
        : tf(sum.count === 1 ? 'panel.one' : 'panel.summary', { n: sum.count, ms: fmt(sum.ms) });
    $('#navTrips').textContent = wf ? `${sum.count} × ↔` : '…';

    $('#trips').replaceChildren(...trips.map((trip) => {
        const key = tripKey(trip);
        const li = el('li', 'tr-trip');
        li.dataset.trip = trip.id;
        li.dataset.state = wf ? trip.state : 'measured';
        if (trip.id === active) li.classList.add('on');

        const btn = el('button', 'tr-trip-btn');
        btn.type = 'button';
        const value = !wf ? '' : trip.state === 'measured' ? tf('panel.ms', { n: fmt(trip.ms) }) : t(`panel.${trip.state}`);
        btn.append(el('span', 'tr-trip-name', t(`trip.${key}.name`)), el('span', 'tr-trip-ms', value));
        btn.addEventListener('click', () => play(trip));
        li.append(btn, el('p', 'tr-trip-what', t(`trip.${key}.what`)));
        return li;
    }));

    const tls = trips.find(trip => trip.id === 'tls');
    $('#panelNote').textContent = !wf ? '' : wf.reused ? t('panel.reusedNote') : tls.state === 'none' ? t('panel.noTls') : '';
}

function renderMeta() {
    const items = [];
    if (conn?.ip) items.push([t('meta.ip'), conn.ip]);
    if (wf?.protocol) items.push([t('meta.proto'), wf.protocol]);
    const version = TcpdumpCore.tlsVersion(conn?.tls);
    if (version) items.push(['', tf('meta.tls', { v: version })]);
    $('#meta').replaceChildren(...items.map(([label, value]) => {
        const li = el('li', 'tr-meta-item');
        if (label) li.append(el('span', 'tr-meta-label', `${label} `));
        li.append(el('code', '', value));
        return li;
    }));
}

function renderStatic() {
    $('#hops').replaceChildren(...['you', 'net', 'server'].map((side) => {
        const col = el('div', 'pg-panel tr-hop-col');
        col.dataset.side = side;
        col.append(el('h3', 'pg-panel-title', t(`side.${side}`)));
        const list = el('dl', 'tr-hop-list');
        for (const n of TracerouteCore.NODES.filter(x => x.side === side)) {
            list.append(el('dt', 'tr-hop-name', `${t(`node.${n.id}.name`)} · ${t(`node.${n.id}.sub`)}`), el('dd', 'tr-hop-what', t(`node.${n.id}.what`)));
        }
        col.append(list);
        return col;
    }));

    $('#notes').replaceChildren(...NOTES.map((id) => {
        const card = el('article', 'pg-panel');
        card.append(el('h3', 'pg-panel-title', t(`real.${id}.name`)), el('p', 'tr-note-text', t(`real.${id}.text`)));
        return card;
    }));
}

function render() {
    run++;      // a redraw replaces the diagram under a running animation: stop it
    draw();
    renderPanel();
    renderMeta();
    renderStatic();
    // A redraw (language, orientation) loses the lights: put the last trip back, without replaying
    const last = trips.find(trip => trip.id === active);
    if (last) lightPath(last.path);
}

/* ── Boot ── */
Page.init(render);
$('#replay').addEventListener('click', () => play());
narrow.addEventListener('change', () => { run++; render(); });

// The navigation entry is only complete once the load event has finished
if (document.readyState === 'complete') setTimeout(measure, 0);
else window.addEventListener('load', () => setTimeout(measure, 0));

/* ═══════════════════════════════════════════
   YATOUB // XXD — page script
   Builds the packet with core.js from what is known of the visitor's
   connection: /whoami/server.json for their address, port and cipher
   suite (only behind Caddy), one DNS-over-HTTPS lookup for the
   server address. Nothing is captured, stored or sent.
   ═══════════════════════════════════════════ */

'use strict';

const { $, t, tf, el } = Page;
const KINDS = ['hello', 'data'];

/* ── Data ── */
const dice = (n) => [...crypto.getRandomValues(new Uint8Array(n))];
const word = () => crypto.getRandomValues(new Uint32Array(1))[0];
// Drawn once: the packet must not change when the language or the tab does
const known = { host: 'yatoub.dev', random: dice(32), payload: dice(64), seq: word(), ack: word(), id: word() & 0xffff };
let kind = 'hello';
let packet = XxdCore.build({ ...known, kind });
let active = null;      // id of the field being inspected
let pinned = null;      // id of the field kept on a click

async function learn() {
    const server = fetch('/whoami/server.json', { cache: 'no-store', signal: AbortSignal.timeout(4000) })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => { Object.assign(known, { srcIp: d.ip, srcPort: Number(d.port), cipher: d.cipher }); })
        .catch(() => { /* static hosting: example values stay */ });
    const [resolver] = DigCore.RESOLVERS;
    const dns = fetch(DigCore.url(resolver, DigCore.ZONE, 'A'), { headers: resolver.headers, signal: AbortSignal.timeout(5000) })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((json) => { known.dstIp = DigCore.parse(json, 'A').answers.find((a) => a.type === 'A')?.data; })
        .catch(() => { /* no answer: the example address stays */ });
    await Promise.allSettled([server, dns]);
    rebuild();
}

function rebuild() {
    packet = XxdCore.build({ ...known, kind });
    render();
}

/* ── Rendering ── */
const fieldKey = (id) => `field.${id}`;
const field = (id) => packet.fields.find((f) => f.id === id);

function renderTabs() {
    $('#tabs').replaceChildren(...KINDS.map((k) => {
        const btn = el('button', 'xd-tab', t(`tab.${k}`));
        btn.type = 'button';
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', String(k === kind));
        btn.addEventListener('click', () => { kind = k; active = pinned = null; rebuild(); });
        return btn;
    }));
    $('#tabDesc').textContent = t(`tab.${kind}Desc`);
}

function byteNode(b, text, cls) {
    const f = XxdCore.fieldAt(packet.fields, b.i);
    const span = el('span', cls, text);
    span.dataset.field = f.id;
    span.dataset.layer = f.layer;
    span.dataset.clear = String(f.clear);
    return span;
}

function renderDump() {
    const dump = $('#dump');
    dump.setAttribute('aria-label', tf('dump.size', { n: packet.bytes.length }));
    dump.replaceChildren(...XxdCore.rows(packet.bytes).map((row) => {
        const line = el('div', 'xd-row');
        const hex = el('span', 'xd-hex');
        const text = el('span', 'xd-ascii');
        for (const b of row.bytes) {
            hex.append(byteNode(b, b.hex, 'xd-byte'));
            text.append(byteNode(b, b.char, 'xd-char'));
        }
        line.append(el('span', 'xd-offset', `${row.offset}:`), hex, text);
        return line;
    }));
    $('#navSize').textContent = tf('dump.size', { n: packet.bytes.length });
}

function renderLayers() {
    $('#layers').replaceChildren(...XxdCore.LAYERS.map((layer) => {
        const box = el('section', 'xd-layer');
        box.dataset.layer = layer;
        box.append(el('h3', 'xd-layer-name', t(`layer.${layer}.name`)), el('p', 'xd-layer-what', t(`layer.${layer}.what`)));
        const list = el('ul', 'xd-fields');
        for (const f of packet.fields.filter((x) => x.layer === layer)) {
            const btn = el('button', 'xd-field');
            btn.type = 'button';
            btn.dataset.field = f.id;
            btn.dataset.clear = String(f.clear);
            btn.append(el('span', 'xd-field-name', t(`${fieldKey(f.id)}.name`)));
            if (f.value) btn.append(el('code', 'xd-field-value', f.value));
            const li = el('li');
            li.append(btn);
            list.append(li);
        }
        box.append(list);
        return box;
    }));
}

function renderDetail() {
    const f = field(active ?? pinned);
    const host = $('#detail');
    if (!f) return host.replaceChildren(el('p', 'xd-detail-hint', t('dump.hint')));
    const range = f.length === 1 ? tf('dump.byte', { from: f.start }) : tf('dump.bytes', { from: f.start, to: f.start + f.length - 1 });
    const head = el('div', 'xd-detail-head');
    const tag = el('span', 'pg-tag', t(f.clear ? 'dump.clear' : 'dump.encrypted'));
    tag.dataset.clear = String(f.clear);
    head.append(el('h3', 'pg-panel-title', t(`${fieldKey(f.id)}.name`)), el('span', 'pg-tag', t(`layer.${f.layer}.name`)), tag);
    const hexText = XxdCore.hex(packet.bytes.slice(f.start, f.start + Math.min(f.length, 24)), ' ') + (f.length > 24 ? ' …' : '');
    host.replaceChildren(head, el('p', 'xd-detail-range', `${range} · ${hexText}`),
        ...(f.value ? [el('code', 'xd-detail-value', f.value)] : []),
        el('p', 'xd-detail-what', t(`${fieldKey(f.id)}.what`)));
}

// Highlighting only toggles classes: the dump is not rebuilt on every hover
function highlight() {
    const id = active ?? pinned;
    document.querySelectorAll('.xd-layout .on').forEach((n) => n.classList.remove('on'));
    if (id) document.querySelectorAll(`.xd-layout [data-field="${CSS.escape(id)}"]`).forEach((n) => n.classList.add('on'));
    document.querySelectorAll('.xd-field').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.field === pinned)));
    renderDetail();
}

function render() {
    renderTabs();
    renderDump();
    renderLayers();
    $('#assumed').replaceChildren(...packet.assumed.map((id) => el('li', '', t(`assumed.${id}`))));
    highlight();
}

/* ── Boot ── */
Page.init(render);

const layout = document.querySelector('.xd-layout');
const fieldOf = (e) => e.target.closest?.('[data-field]')?.dataset.field ?? null;
layout.addEventListener('mouseover', (e) => { const id = fieldOf(e); if (id !== active) { active = id; highlight(); } });
layout.addEventListener('mouseleave', () => { active = null; highlight(); });
layout.addEventListener('focusin', (e) => { active = fieldOf(e); highlight(); });
layout.addEventListener('click', (e) => {
    const id = fieldOf(e);
    if (!id) return;
    pinned = pinned === id ? null : id;
    highlight();
});

learn();

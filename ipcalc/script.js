/* ═══════════════════════════════════════════
   YATOUB // IPCALC — page script
   Starts from the visitor's public address as the server sees it
   (/whoami/server.json, only behind Caddy), then everything is
   computed locally by core.js.
   ═══════════════════════════════════════════ */

'use strict';

const { $, t, tf, el, num } = Page;
const EXAMPLE = '192.0.2.42';       // documentation range: points at nobody
const NOTES = ['mask', 'two', 'cidr', 'scarce'];
const ROWS = ['address', 'netmask', 'wildcard', 'network', 'broadcast', 'first', 'last'];

let own = null;         // the visitor's address, null when the server view is unavailable
let ip = IpcalcCore.parse(EXAMPLE);
let prefix = 24;
let typed = false;      // the visitor edited the address field

function renderBits() {
    const cells = IpcalcCore.bits(ip, prefix);
    const octets = IpcalcCore.octets(ip);
    $('#bits').setAttribute('aria-label', tf('bits.cut', { n: prefix }));
    $('#bits').replaceChildren(...octets.map((value, o) => {
        const group = el('div', 'ic-octet');
        group.append(el('span', 'ic-octet-value', String(value)));
        const row = el('div', 'ic-octet-bits');
        cells.slice(o * 8, o * 8 + 8).forEach((cell, i) => {
            const index = o * 8 + i;
            const btn = el('button', 'ic-bit', String(cell.bit));
            btn.type = 'button';
            btn.dataset.part = cell.part;
            // The cut is drawn on the last network bit, so the boundary reads without colour
            if (index === prefix - 1) btn.dataset.cut = 'true';
            btn.title = tf('bits.cut', { n: index + 1 });
            btn.setAttribute('aria-label', `${cell.bit}, ${t(`bits.${cell.part}`)}, ${tf('bits.cut', { n: index + 1 })}`);
            btn.addEventListener('click', () => setPrefix(index + 1));
            row.append(btn);
        });
        group.append(row);
        return group;
    }));
}

function render() {
    const net = IpcalcCore.subnet(ip, prefix);
    const cidr = `${IpcalcCore.format(ip)}/${prefix}`;
    $('#pre').textContent = `$ ipcalc ${cidr}`;
    $('#navCidr').textContent = `/${prefix}`;
    $('#prefixOut').textContent = `/${prefix}`;
    $('#prefix').value = String(prefix);
    if (!typed) $('#ip').value = IpcalcCore.format(ip);

    $('#origin').textContent = own !== null && ip === own ? t('form.yours') : own === null && !typed ? t('form.example') : '';
    $('#reset').hidden = own === null || ip === own;
    $('#reset').textContent = t('form.reset');

    renderBits();

    $('#presets').replaceChildren(...IpcalcCore.PRESETS.map((p) => {
        const btn = el('button', 'ic-preset');
        btn.type = 'button';
        btn.setAttribute('aria-pressed', String(p === prefix));
        btn.append(el('strong', '', `/${p}`), el('span', '', t(`preset.${p}`)));
        btn.addEventListener('click', () => setPrefix(p));
        return btn;
    }));

    const values = {
        address: cidr,
        netmask: IpcalcCore.format(net.mask),
        wildcard: IpcalcCore.format(net.wildcard),
        network: `${IpcalcCore.format(net.network)}/${prefix}`,
        broadcast: IpcalcCore.format(net.broadcast),
        first: IpcalcCore.format(net.first),
        last: IpcalcCore.format(net.last),
    };
    const rows = ROWS.flatMap((id) => [el('dt', 'ic-out-name', t(`out.${id}`)), el('dd', 'ic-out-value', values[id])]);
    rows.push(el('dt', 'ic-out-name', t('out.hosts')), el('dd', 'ic-out-value ic-out-big', num(net.hosts)),
        el('dt', 'ic-out-name', t('out.addresses')), el('dd', 'ic-out-value', num(net.addresses)));
    $('#out').replaceChildren(...rows);

    $('#scope').textContent = t(`scope.${IpcalcCore.scope(ip)}`);

    $('#notes').replaceChildren(...NOTES.map((id) => {
        const card = el('article', 'pg-panel');
        card.append(el('h3', 'pg-panel-title', t(`read.${id}.name`)), el('p', 'ic-note-text', t(`read.${id}.text`)));
        return card;
    }));
}

function setPrefix(value) {
    if (!IpcalcCore.validPrefix(value)) return;
    prefix = value;
    render();
}

/* ── Boot ── */
Page.init(render);

$('#prefix').addEventListener('input', (e) => setPrefix(Number(e.target.value)));

$('#ip').addEventListener('input', (e) => {
    typed = true;
    const parsed = IpcalcCore.parse(e.target.value);
    $('#msg').textContent = parsed === null ? t('form.invalid') : '';
    if (parsed === null) return;
    ip = parsed;
    render();
});
$('#form').addEventListener('submit', (e) => e.preventDefault());

$('#reset').addEventListener('click', () => {
    typed = false;
    ip = own;
    $('#msg').textContent = '';
    render();
});

fetch('/whoami/server.json', { cache: 'no-store', signal: AbortSignal.timeout(4000) })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((d) => {
        own = IpcalcCore.parse(d.ip);       // an IPv6 visitor has no dotted quad: the example stays
        if (own === null || typed) return;
        ip = own;
        render();
    })
    .catch(() => { /* static hosting: the example address stays */ });

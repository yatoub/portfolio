/* ═══════════════════════════════════════════
   YATOUB // CURL — page script
   One HEAD request to this same origin ; its headers are read by
   the browser and audited by core.js. Header values come from the
   network: textContent only. The CTF header is never echoed.
   ═══════════════════════════════════════════ */

'use strict';

const { $, t, tf, el, has } = Page;
const TARGET = '/';

/* ── Data ── */
let response = null;    // { protocol, status, headers: Map } once loaded
let failed = false;

async function load() {
    const url = new URL(TARGET, location.href).href;
    try {
        const r = await fetch(url, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(6000) });
        // The entry is queued once the response is complete
        await new Promise((resolve) => setTimeout(resolve, 0));
        const entry = performance.getEntriesByName(url).pop();
        response = { protocol: CurlCore.protocolName(entry?.nextHopProtocol), status: r.status, headers: CurlCore.toMap(r.headers) };
    } catch {
        failed = true;
    }
    render();
}

/* ── Rendering ── */
function block(labelKey, node) {
    const wrap = el('div', 'cu-block');
    wrap.append(el('p', 'pg-label', t(labelKey)), node);
    return wrap;
}

function stateTag(state) {
    const tag = el('span', 'pg-tag cu-state', t(`audit.${state}`));
    tag.dataset.state = state;
    return tag;
}

function hstsDetail(value) {
    const { maxAge, includeSubDomains, preload } = CurlCore.parseHsts(value);
    const d = CurlCore.duration(maxAge);
    const parts = [];
    if (d) parts.push(tf('hsts.for', { n: d.n, unit: t(`hsts.${d.unit}`) }));
    if (includeSubDomains) parts.push(t('hsts.sub'));
    if (preload) parts.push(t('hsts.preload'));
    return parts.join(' · ');
}

function renderHeaders() {
    const nodes = [...response.headers].flatMap(([name, value]) => {
        const kind = CurlCore.kind(name);
        const term = el('dt', 'cu-name', name);
        term.dataset.kind = kind;
        const text = kind === 'redacted' ? t('resp.redacted')
            : kind === 'security' && has(`sec.${name}.protects`) ? t(`sec.${name}.protects`)
            : has(`info.${name}`) ? t(`info.${name}`)
            : t('resp.unknown');
        const def = el('dd', 'cu-def');
        def.append(el('code', 'cu-value', CurlCore.redact(name, value)), el('p', '', text));
        return [term, def];
    });
    $('#headers').replaceChildren(...nodes);
}

function renderAudit() {
    const verdicts = CurlCore.audit(response.headers);
    const { ok, total } = CurlCore.score(verdicts);
    $('#score').textContent = tf('audit.score', { ok, total });
    $('#navScore').textContent = `${ok}/${total}`;

    $('#audit').replaceChildren(...verdicts.map((v) => {
        const card = el('article', 'pg-panel cu-card');
        card.dataset.state = v.state;
        const head = el('div', 'cu-card-head');
        head.append(el('h3', 'pg-panel-title', t(`sec.${v.id}.name`)), stateTag(v.state));
        card.append(head);

        if (v.value !== null) {
            card.append(block('audit.value', el('code', 'cu-value', v.value)));
            const detail = v.id === 'strict-transport-security' ? hstsDetail(v.value) : '';
            if (detail) card.append(el('p', 'cu-detail', detail));
        }
        if (v.reason) card.append(el('p', 'cu-reason', t(`reason.${v.reason}`)));
        card.append(block('audit.protects', el('p', 'cu-text', t(`sec.${v.id}.protects`))));
        if (v.state !== 'ok') card.append(block('audit.fix', el('code', 'cu-fix', v.fix)));
        return card;
    }));
}

function renderLeaks() {
    const found = CurlCore.leaks(response.headers);
    if (!found.length) return $('#leaks').replaceChildren(el('p', 'pg-note', t('leak.none')));
    $('#leaks').replaceChildren(...found.map((leak) => {
        const card = el('article', 'pg-panel cu-card');
        card.dataset.state = 'weak';
        const head = el('div', 'cu-card-head');
        head.append(el('h3', 'pg-panel-title', leak.name));
        card.append(head,
            block('audit.value', el('code', 'cu-value', leak.value)),
            el('p', 'cu-text', t(leak.version ? 'leak.withVersion' : 'leak.noVersion')),
            block('leak.fix', el('code', 'cu-fix', `header -${leak.name}`)));
        return card;
    }));
}

function render() {
    $('#error').hidden = !failed;
    $('#error').textContent = failed ? t('state.error') : '';
    $('#content').hidden = !response;
    if (!response) return void ($('#navScore').textContent = failed ? '—' : '…');

    $('#out').textContent = CurlCore.output(response.protocol, response.status, response.headers);
    renderHeaders();
    renderAudit();
    renderLeaks();
}

Page.init(render);
load();

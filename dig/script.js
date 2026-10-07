/* ═══════════════════════════════════════════
   YATOUB // DIG — page script
   Each lookup goes from the browser to two public DNS-over-HTTPS
   resolvers. Answers are data from the network: textContent only.
   ═══════════════════════════════════════════ */

'use strict';

const { $, t, tf, el } = Page;
const TIMEOUT_MS = 6000;
const ASK_TYPES = ['A', 'AAAA', 'TXT', 'MX', 'NS', 'CAA', 'CNAME'];

/* ── Data ── */
// One slot per resolver ; null while loading, { kind: 'error' } when unreachable
const zone = DigCore.QUERIES.map((q) => ({ ...q, results: DigCore.RESOLVERS.map(() => null) }));
let asked = null;       // { name, type, results } for the visitor's own lookup

async function resolve(resolver, name, type) {
    try {
        const r = await fetch(DigCore.url(resolver, name, type), { headers: resolver.headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return DigCore.parse(await r.json(), type);
    } catch {
        return { rcode: '', kind: 'error', ad: false, answers: [] };
    }
}

function lookup(target) {
    DigCore.RESOLVERS.forEach(async (resolver, i) => {
        target.results[i] = await resolve(resolver, target.name, target.type);
        render();
    });
}

/* ── Rendering ── */
const answered = (results) => results.filter((r) => r && r.kind !== 'error');
const pending = (results) => results.some((r) => r === null);

function agreement(results) {
    const ok = answered(results);
    if (pending(results) || !ok.length) return null;
    if (ok.length < results.length) return { key: 'agree.one', state: 'warn' };
    return DigCore.agree(ok[0], ok[1]) ? { key: 'agree.yes', state: 'ok' } : { key: 'agree.no', state: 'warn' };
}

function ttlText(seconds) {
    const v = DigCore.ttl(seconds);
    return v ? tf('ttl.label', { n: v.n, unit: t(`ttl.${v.unit}`) }) : '';
}

function answerBlock(result) {
    const out = el('pre', 'pg-out dg-out');
    out.textContent = result.answers.map(DigCore.line).join('\n');
    return out;
}

function renderRecord(rec) {
    const card = el('article', 'pg-panel dg-record');
    const head = el('div', 'dg-record-head');
    head.append(el('h3', 'pg-panel-title', t(`rec.${rec.id}.name`)));
    const verdict = agreement(rec.results);
    if (verdict) {
        const tag = el('span', 'pg-tag dg-verdict', t(verdict.key));
        tag.dataset.state = verdict.state;
        head.append(tag);
    }
    card.append(head, el('p', 'dg-what', t(`rec.${rec.id}.what`)));

    const first = answered(rec.results)[0];
    if (!first) {
        card.append(el('p', 'dg-state', t(pending(rec.results) ? 'state.loading' : 'state.error')));
    } else if (first.kind === 'answer') {
        card.append(answerBlock(first));
        const notes = el('ul', 'dg-notes');
        const cache = ttlText(first.answers[0].ttl);
        if (cache) notes.append(el('li', '', cache));
        if (rec.type === 'TXT') {
            for (const kind of new Set(first.answers.map((a) => DigCore.txtKind(a.data)))) notes.append(el('li', '', t(`txt.${kind}`)));
        }
        if (notes.children.length) card.append(notes);
    } else {
        card.append(el('p', 'dg-empty', t(`rec.${rec.id}.empty`)));
    }
    return card;
}

function renderTrust() {
    const all = zone.flatMap((rec) => rec.results);
    const ok = answered(all);
    if (!ok.length) return void ($('#trust').textContent = pending(all) ? t('state.loading') : t('state.error'));
    // Per resolver: did it validate at least one answer of the zone ?
    const validated = DigCore.RESOLVERS.map((_, i) => zone.some((rec) => rec.results[i]?.ad));
    const n = validated.filter(Boolean).length;
    $('#trust').textContent = t(n === validated.length ? 'trust.yes' : n === 0 ? 'trust.no' : 'trust.partial');
}

function renderAsked() {
    $('#local').hidden = !asked;
    if (!asked) return $('#results').replaceChildren();

    $('#results').replaceChildren(...DigCore.RESOLVERS.map((resolver, i) => {
        const result = asked.results[i];
        const col = el('div', 'pg-panel dg-result');
        const head = el('div', 'dg-record-head');
        head.append(el('h3', 'pg-panel-title', resolver.label));
        if (result && result.kind !== 'error') {
            head.append(el('span', 'pg-tag', tf('ask.status', { rcode: result.rcode })));
            if (result.ad) head.append(el('span', 'pg-tag', t('ask.signed')));
        }
        col.append(head);
        if (!result) col.append(el('p', 'dg-state', t('state.loading')));
        else if (result.kind === 'error') col.append(el('p', 'dg-state', t('state.error')));
        else if (result.kind === 'answer') col.append(answerBlock(result));
        else col.append(el('p', 'dg-empty', t(`ask.${result.kind}`)));
        return col;
    }));
    $('#local').textContent = tf('ask.local', { name: asked.name, type: asked.type });
}

function render() {
    $('#records').replaceChildren(...zone.map(renderRecord));
    renderTrust();
    renderAsked();
    $('#name').placeholder = t('ask.placeholder');
}

/* ── Boot ── */
$('#type').replaceChildren(...ASK_TYPES.map((type) => {
    const option = el('option', '', type);
    option.value = type;
    return option;
}));

Page.init(render);
zone.forEach(lookup);

$('#form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = DigCore.fqdn($('#name').value);
    $('#msg').textContent = name ? '' : t('ask.invalid');
    if (!name) return;
    asked = { name, type: $('#type').value, results: DigCore.RESOLVERS.map(() => null) };
    render();
    lookup(asked);
});

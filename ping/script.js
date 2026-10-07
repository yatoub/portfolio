/* ═══════════════════════════════════════════
   YATOUB // PING — page script
   Sends PingCore.COUNT small HEAD requests on the open connection
   and reads their duration from the Resource Timing entries.
   Nothing is stored or sent anywhere.
   ═══════════════════════════════════════════ */

'use strict';

const { $, t, tf, el, num } = Page;
const TARGET = '/robots.txt';
const INTERVAL_MS = 250;
const TIMEOUT_MS = 3000;
const REFS = [['city', 660], ['ocean', 5800], ['half', 20000]];
const NOTES = ['icmp', 'first', 'jitter', 'loss'];

let samples = [];       // one entry per request sent: ms, or null when lost
let protocol = '';
let running = false;
let precise = true;     // false when the browser gave no timing entry and the clock had to be used

const fmt = (ms) => num(ms, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function probe() {
    const url = new URL(TARGET, location.href).href;
    const before = performance.now();
    try {
        await fetch(url, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
        return null;
    }
    const elapsed = performance.now() - before;
    // The entry is queued once the response is complete
    await sleep(0);
    const entry = performance.getEntriesByName(url).pop();
    if (entry?.nextHopProtocol) protocol = entry.nextHopProtocol;
    const ms = PingCore.sample(entry);
    if (ms === null) precise = false;
    return ms ?? Math.round(elapsed * 10) / 10;
}

async function run() {
    if (running) return;
    running = true;
    samples = [];
    precise = true;
    performance.clearResourceTimings?.();
    render();
    for (let i = 0; i < PingCore.COUNT; i++) {
        samples.push(await probe());
        render();
        if (i < PingCore.COUNT - 1) await sleep(INTERVAL_MS);
    }
    running = false;
    render();
}

function render() {
    const s = PingCore.stats(samples);
    const done = !running && samples.length > 0;

    const lines = [tf('out.head', { n: PingCore.COUNT })];
    samples.forEach((ms, i) => {
        lines.push(ms === null ? tf('out.lost', { seq: i + 1 }) : tf('out.line', { seq: i + 1, proto: protocol || 'http', ms: fmt(ms) }));
    });
    if (running) lines.push(t('out.running'));
    if (done) {
        lines.push('', t('out.stats'), tf('out.summary', { sent: s.sent, received: s.received, loss: s.loss }));
        if (s.received) lines.push(tf('out.rtt', { min: fmt(s.min), avg: fmt(s.avg), max: fmt(s.max), mdev: fmt(s.mdev) }));
    }
    $('#out').textContent = lines.join('\n');

    const heights = PingCore.heights(samples);
    $('#bars').replaceChildren(...Array.from({ length: PingCore.COUNT }, (_, i) => {
        const slot = el('span', 'pn-slot');
        const bar = el('span', 'pn-bar');
        if (i < samples.length) {
            if (samples[i] === null) slot.dataset.state = 'lost';
            bar.style.height = `${heights[i] * 100}%`;
            slot.title = samples[i] === null ? tf('out.lost', { seq: i + 1 }) : tf('stat.ms', { n: fmt(samples[i]) });
        } else {
            slot.dataset.state = 'pending';
        }
        slot.append(bar);
        return slot;
    }));

    $('#stats').hidden = !done || !s.received;
    if (s.received) {
        $('#statMin').textContent = tf('stat.ms', { n: fmt(s.min) });
        $('#statAvg').textContent = tf('stat.ms', { n: fmt(s.avg) });
        $('#statMdev').textContent = tf('stat.ms', { n: fmt(s.mdev) });
    }
    $('#navRtt').textContent = s.received ? tf('stat.ms', { n: fmt(s.min) }) : '…';

    $('#unsupported').hidden = !done || precise;
    $('#unsupported').textContent = t('unsupported');
    $('#again').textContent = t('again');
    $('#again').disabled = running;

    // Distance: bounded by the best round trip, the one where nothing waited
    const km = done ? PingCore.maxDistanceKm(s.min) : null;
    $('#bound').textContent = !done ? '…' : km === null ? t('dist.none') : tf('dist.bound', { km: num(km) });
    $('#how').textContent = km === null ? '' : tf('dist.how', { ms: fmt(s.min), km: num(km) });

    $('#refs').replaceChildren(...REFS.flatMap(([id, km]) => [
        el('dt', 'pn-ref-name', t(`dist.ref.${id}`)),
        el('dd', 'pn-ref-value', tf('stat.ms', { n: fmt(PingCore.minRttMs(km)) })),
    ]));

    $('#notes').replaceChildren(...NOTES.map((id) => {
        const card = el('article', 'pg-panel');
        card.append(el('h3', 'pg-panel-title', t(`note.${id}.name`)), el('p', 'pn-note-text', t(`note.${id}.text`)));
        return card;
    }));
}

Page.init(render);
$('#again').addEventListener('click', run);

// Wait for the page load to finish: the first samples must not compete with it
if (document.readyState === 'complete') setTimeout(run, 300);
else window.addEventListener('load', () => setTimeout(run, 300));

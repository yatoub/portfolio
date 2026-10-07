/* ═══════════════════════════════════════════
   YATOUB // NFT — page script
   The game loop: edit a ruleset, release the wave of the level,
   watch each packet meet the firewall. Everything is simulated by
   core.js ; no packet is sent anywhere. Progress is a list of level
   ids in localStorage.
   ═══════════════════════════════════════════ */

'use strict';

const { $, t, tf, el } = Page;
const STORAGE_KEY = 'nft';
const NOTES = ['order', 'policy', 'real'];
const LANES = 6;
const STAGGER_MS = 240;
const TRAVEL_MS = 1500;
const WALL = 52;        // position of the firewall on the track, in percent
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

/* ── State ── */
let done = [];
let current = NftCore.LEVELS[0].id;
const rulesets = Object.fromEntries(NftCore.LEVELS.map((l) => [l.id, NftCore.empty()]));
const hints = new Set();
let results = null;     // outcome of the last run of the current level
let running = false;
let run = 0;            // incremented to cancel a running animation

function loadProgress() {
    try { done = NftCore.parseProgress(localStorage.getItem(STORAGE_KEY)); }
    catch { done = []; /* stockage bloqué : progression en mémoire */ }
}
function saveProgress() {
    try { localStorage.setItem(STORAGE_KEY, NftCore.serializeProgress(done)); }
    catch { /* stockage bloqué */ }
}

const level = () => NftCore.level(current);
const ruleset = () => rulesets[current];
const condKey = (c) => (c ? `${c[0]}:${c[1]}` : '');
const condOf = (key) => level().palette.find((c) => condKey(c) === key) ?? null;

function condText([type, value]) {
    const v = type === 'src' || type === 'state' ? t(`value.${value}`) : value;
    return tf(`cond.${type}`, { v });
}
function ruleSentence(rule) {
    const conds = rule.conds.length ? rule.conds.map(condText).join(` ${t('edit.and')} `) : t('cond.any');
    return `${t('edit.when')} ${conds}, ${t('edit.then')} ${t(`edit.${rule.action}`)}`;
}
const packetLabel = (p) => `${p.proto}/${p.dport}`;
const kindOf = (p) => (p.good === true ? 'legit' : p.good === false ? 'attack' : 'neutral');

function edited() {
    run++;
    running = false;
    results = null;
    render();
}

/* ── Rendering ── */
function renderLevels() {
    $('#levels').replaceChildren(...NftCore.LEVELS.map((l, i) => {
        const btn = el('button', 'nf-level');
        btn.type = 'button';
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', String(l.id === current));
        const passed = done.includes(l.id);
        btn.dataset.done = String(passed);
        btn.append(el('span', 'nf-level-n', `${t('levels.title')} ${i + 1}`), el('span', 'nf-level-name', t(`level.${l.id}.name`)),
            el('span', 'nf-level-mark', passed ? `[x] ${t('levels.done')}` : '[ ]'));
        btn.addEventListener('click', () => { current = l.id; edited(); });
        return btn;
    }));
    $('#navDone').textContent = `${done.length}/${NftCore.LEVELS.length}`;
    document.body.dataset.complete = String(done.length === NftCore.LEVELS.length);
}

function renderBrief() {
    $('#levelName').textContent = t(`level.${current}.name`);
    $('#brief').textContent = t(`level.${current}.brief`);
    const shown = hints.has(current);
    $('#hint').hidden = !shown;
    $('#hint').textContent = t(`level.${current}.hint`);
    $('#hintBtn').hidden = shown;
    $('#hintBtn').textContent = `[ ${t('run.hint')} ]`;
}

function renderTraffic() {
    // One line per kind of packet: who, where to, how many, and whether it should pass
    const groups = new Map();
    for (const p of level().packets) {
        const key = `${p.who}|${packetLabel(p)}|${p.state}|${kindOf(p)}`;
        groups.set(key, { p, n: (groups.get(key)?.n ?? 0) + 1 });
    }
    $('#traffic').replaceChildren(...[...groups.values()].map(({ p, n }) => {
        const li = el('li', 'nf-traffic-item');
        const chip = el('span', 'nf-chip', packetLabel(p));
        chip.dataset.kind = kindOf(p);
        const tag = el('span', 'pg-tag', t(`run.${kindOf(p)}`));
        tag.dataset.kind = kindOf(p);
        li.append(chip, el('span', 'nf-traffic-who', `${n} × ${t(`who.${p.who}`)}${p.state === 'established' ? ` · ${t('value.established')}` : ''}`), tag);
        return li;
    }));
}

function iconButton(label, text, onClick, disabled = false) {
    const btn = el('button', 'nf-icon', text);
    btn.type = 'button';
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.disabled = disabled;
    btn.addEventListener('click', onClick);
    return btn;
}

function renderEditor() {
    const set = ruleset();
    $('#policy').replaceChildren(...['accept', 'drop'].map((action) => {
        const btn = el('button', 'nf-policy-btn', t(`edit.${action}`));
        btn.type = 'button';
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', String(set.policy === action));
        btn.dataset.action = action;
        btn.addEventListener('click', () => { set.policy = action; edited(); });
        return btn;
    }));

    const protoOf = (port) => level().packets.find((p) => p.dport === port)?.proto ?? 'tcp';
    const items = set.rules.map((rule, i) => {
        const li = el('li', 'nf-rule');
        li.dataset.action = rule.action;
        const text = el('div', 'nf-rule-text');
        text.append(el('code', '', NftCore.ruleText(rule, protoOf)), el('span', 'nf-rule-plain', ruleSentence(rule)));
        const tools = el('div', 'nf-rule-tools');
        const move = (to) => () => { [set.rules[i], set.rules[to]] = [set.rules[to], set.rules[i]]; edited(); };
        tools.append(iconButton(t('edit.up'), '↑', move(i - 1), i === 0), iconButton(t('edit.down'), '↓', move(i + 1), i === set.rules.length - 1),
            iconButton(t('edit.remove'), '✕', () => { set.rules.splice(i, 1); edited(); }));
        li.append(text, tools);
        return li;
    });
    $('#rules').replaceChildren(...(items.length ? items : [el('li', 'nf-rule-empty', t('edit.empty'))]));

    const option = (value, label) => { const o = el('option', '', label); o.value = value; return o; };
    const keep = (id) => $(id).value;
    const [c1, c2, action] = [keep('#cond1'), keep('#cond2'), keep('#action')];
    $('#cond1').replaceChildren(option('', t('cond.any')), ...level().palette.map((c) => option(condKey(c), condText(c))));
    $('#cond2').replaceChildren(option('', t('cond.none')), ...level().palette.map((c) => option(condKey(c), condText(c))));
    $('#action').replaceChildren(option('accept', t('edit.accept')), option('drop', t('edit.drop')));
    // A redraw (language switch) must not lose what was being composed
    if (condOf(c1)) $('#cond1').value = c1;
    if (condOf(c2)) $('#cond2').value = c2;
    if (action) $('#action').value = action;

    $('#nft').textContent = NftCore.rulesetText(set, level());
    $('#clear').hidden = set.rules.length === 0;
}

function renderResult() {
    const host = $('#result');
    host.hidden = !results || running;
    if (host.hidden) return host.replaceChildren();

    const score = NftCore.score(results);
    host.dataset.won = String(score.won);
    const head = el('div', 'nf-result-head');
    head.append(el('h3', 'nf-result-title', t(score.won ? 'result.won' : 'result.lost')));
    const lines = [];
    if (score.leaked) lines.push(tf('result.leaked', { n: score.leaked }));
    if (score.blocked) lines.push(tf('result.blocked', { n: score.blocked }));
    if (score.won) lines.push(t('result.clean'));
    const nodes = [head, ...lines.map((text) => el('p', 'nf-result-line', text))];

    if (score.won) {
        nodes.push(el('p', 'nf-lesson', t(`level.${current}.lesson`)));
        const index = NftCore.LEVELS.findIndex((l) => l.id === current);
        const next = NftCore.LEVELS[index + 1];
        if (next) {
            const btn = el('button', 'btn btn-primary', t('result.next'));
            btn.type = 'button';
            btn.addEventListener('click', () => { current = next.id; edited(); window.scrollTo({ top: $('#levels').offsetTop - 90, behavior: reduced.matches ? 'auto' : 'smooth' }); });
            nodes.push(btn);
        } else if (done.length === NftCore.LEVELS.length) {
            nodes.push(el('p', 'nf-result-line', t('result.all')));
        }
    }

    // Packet by packet: which rule decided, and whether that was right
    const log = el('ol', 'nf-log');
    for (const r of results) {
        const wrong = (r.packet.good === true && r.verdict === 'drop') || (r.packet.good === false && r.verdict === 'accept');
        const li = el('li', 'nf-log-item');
        li.dataset.wrong = String(wrong);
        const chip = el('span', 'nf-chip', packetLabel(r.packet));
        chip.dataset.kind = kindOf(r.packet);
        li.append(chip, el('span', 'nf-log-who', t(`who.${r.packet.who}`)),
            el('span', 'nf-log-verdict', `${t(r.verdict === 'accept' ? 'result.accepted' : 'result.dropped')} · ${r.rule === null ? t('result.byPolicy') : tf('result.byRule', { n: r.rule + 1 })}`));
        if (wrong) li.append(el('span', 'pg-tag nf-wrong', t('result.wrong')));
        log.append(li);
    }
    nodes.push(el('p', 'pg-label', t('result.log')), log);
    host.replaceChildren(...nodes);
}

function render() {
    renderLevels();
    renderBrief();
    renderTraffic();
    renderEditor();
    renderResult();
    $('#go').textContent = t(running ? 'run.running' : 'run.go');
    $('#go').disabled = running;
    if (!running) $('#lanes').replaceChildren();
    $('#notes').replaceChildren(...NOTES.map((id) => {
        const card = el('article', 'pg-panel');
        card.append(el('h3', 'pg-panel-title', t(`read.${id}.name`)), el('p', 'nf-note-text', t(`read.${id}.text`)));
        return card;
    }));
}

/* ── The wave ── */
function finish(outcome) {
    running = false;
    results = outcome;
    if (NftCore.score(outcome).won && !done.includes(current)) {
        done = NftCore.parseProgress(JSON.stringify([...done, current]));
        saveProgress();
    }
    render();
}

function release() {
    if (running) return;
    const outcome = NftCore.evaluate(ruleset(), level().packets);
    if (reduced.matches) return finish(outcome);

    const token = ++run;
    running = true;
    results = null;
    render();
    const lanes = $('#lanes');
    lanes.replaceChildren();

    outcome.forEach((r, i) => {
        const chip = el('span', 'nf-chip nf-flying', packetLabel(r.packet));
        chip.dataset.kind = kindOf(r.packet);
        chip.style.top = `${(i % LANES) * (100 / LANES)}%`;
        lanes.append(chip);
        const delay = i * STAGGER_MS;
        const passed = r.verdict === 'accept';
        // Up to the wall for everyone ; beyond it only for accepted packets
        const frames = passed
            ? [{ left: '0%', opacity: 1 }, { left: `${WALL}%`, opacity: 1, offset: 0.5 }, { left: '94%', opacity: 1, offset: 0.95 }, { left: '94%', opacity: 0 }]
            : [{ left: '0%', opacity: 1 }, { left: `${WALL - 7}%`, opacity: 1, offset: 0.5 }, { left: `${WALL - 7}%`, opacity: 1, offset: 0.8 }, { left: `${WALL - 7}%`, opacity: 0 }];
        // 'forwards' only: during its delay a packet stays hidden instead of queueing at the edge
        chip.animate(frames, { duration: TRAVEL_MS, delay, fill: 'forwards', easing: 'linear' });
        setTimeout(() => { if (token === run) chip.dataset.verdict = r.verdict; }, delay + TRAVEL_MS / 2);
    });
    setTimeout(() => { if (token === run) finish(outcome); }, outcome.length * STAGGER_MS + TRAVEL_MS + 200);
}

/* ── Boot ── */
loadProgress();
Page.init(render);

$('#go').addEventListener('click', release);
$('#hintBtn').addEventListener('click', () => { hints.add(current); renderBrief(); });
$('#clear').addEventListener('click', () => { rulesets[current] = NftCore.empty(); edited(); });

$('#builder').addEventListener('submit', (e) => {
    e.preventDefault();
    const set = ruleset();
    if (set.rules.length >= 12) { $('#msg').textContent = t('edit.full'); return; }
    $('#msg').textContent = '';
    const conds = [condOf($('#cond1').value), condOf($('#cond2').value)].filter(Boolean);
    // The same condition twice says nothing more
    const unique = conds.filter((c, i) => conds.findIndex((x) => condKey(x) === condKey(c)) === i);
    const rule = { conds: unique, action: $('#action').value };
    if (!NftCore.validRule(rule)) return;
    set.rules.push(rule);
    $('#cond1').value = '';
    $('#cond2').value = '';
    edited();
});

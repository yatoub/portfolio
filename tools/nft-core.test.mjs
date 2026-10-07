// node --test tools/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const F = require('../nft/core.js');
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const translations = new Function(`${read('nft/translations.js')}; return translations;`)();

const rule = (action, ...conds) => ({ action, conds });
const play = (id, ruleset) => F.score(F.evaluate(ruleset, F.level(id).packets));

// The intended solution of each level
const SOLUTIONS = {
    ports: { policy: 'drop', rules: [rule('accept', ['dport', 80]), rule('accept', ['dport', 443])] },
    admin: { policy: 'drop', rules: [rule('accept', ['src', 'you'], ['dport', 22]), rule('accept', ['dport', 443])] },
    state: { policy: 'drop', rules: [rule('accept', ['state', 'established']), rule('accept', ['dport', 443])] },
    rate: { policy: 'drop', rules: [rule('drop', ['rate', 5]), rule('accept', ['dport', 443])] },
};

test('every level is winnable with its intended ruleset, built from its own palette', () => {
    for (const level of F.LEVELS) {
        const solution = SOLUTIONS[level.id];
        assert.ok(F.validRuleset(solution), level.id);
        assert.deepEqual(play(level.id, solution), { leaked: 0, blocked: 0, won: true }, level.id);
        const palette = level.palette.map(c => c.join(':'));
        for (const r of solution.rules) for (const c of r.conds) assert.ok(palette.includes(c.join(':')), `${level.id}: ${c} is offered to the player`);
    }
});

test('doing nothing loses every level: attacks get through', () => {
    for (const level of F.LEVELS) {
        const s = play(level.id, F.empty());
        assert.ok(s.leaked > 0 && !s.won, level.id);
        assert.equal(s.blocked, 0);
    }
});

test('closing everything loses every level too: the service is cut', () => {
    for (const level of F.LEVELS) {
        const s = play(level.id, { policy: 'drop', rules: [] });
        assert.ok(s.blocked > 0 && s.leaked === 0 && !s.won, level.id);
    }
});

test('each level defeats the shortcut it is about', () => {
    // admin: opening SSH to everyone lets the brute force in ; closing it locks the administrator out
    assert.ok(play('admin', { policy: 'drop', rules: [rule('accept', ['dport', 22]), rule('accept', ['dport', 443])] }).leaked > 0);
    assert.ok(play('admin', { policy: 'drop', rules: [rule('accept', ['dport', 443])] }).blocked > 0);
    // state: opening the high ports lets the scanners in with the replies
    assert.ok(play('state', { policy: 'drop', rules: [rule('accept', ['dport', 443]), rule('accept', ['dport', 53124]), rule('accept', ['dport', 48211])] }).leaked > 0);
    assert.ok(play('state', { policy: 'drop', rules: [rule('accept', ['dport', 443])] }).blocked > 0);
    // rate: a limit set too high stops nothing ; closing the port stops everyone
    assert.ok(play('rate', { policy: 'drop', rules: [rule('drop', ['rate', 20]), rule('accept', ['dport', 443])] }).leaked > 0);
    assert.ok(play('rate', { policy: 'drop', rules: [] }).blocked > 0);
});

test('rule order matters: first match wins', () => {
    const late = { policy: 'drop', rules: [rule('accept', ['dport', 443]), rule('drop', ['rate', 5])] };
    assert.ok(play('rate', late).leaked > 0, 'a limit placed after the accept never sees a packet');
    const results = F.evaluate(SOLUTIONS.rate, F.level('rate').packets);
    assert.ok(results.some(r => r.rule === 0 && r.verdict === 'drop'));
    assert.ok(results.some(r => r.rule === 1 && r.verdict === 'accept'));
});

test('the rate condition counts per source, and the policy applies when nothing matches', () => {
    const packets = [
        { id: 0, src: 'a', proto: 'tcp', dport: 443, state: 'new', good: true },
        { id: 1, src: 'a', proto: 'tcp', dport: 443, state: 'new', good: true },
        { id: 2, src: 'b', proto: 'tcp', dport: 443, state: 'new', good: true },
        { id: 3, src: 'a', proto: 'tcp', dport: 443, state: 'new', good: false },
        { id: 4, src: 'c', proto: 'udp', dport: 53, state: 'new', good: false },
    ];
    const res = F.evaluate({ policy: 'drop', rules: [rule('drop', ['rate', 2]), rule('accept', ['dport', 443])] }, packets);
    assert.deepEqual(res.map(r => r.verdict), ['accept', 'accept', 'accept', 'drop', 'drop']);
    assert.deepEqual(res.map(r => r.rule), [1, 1, 1, 0, null]);
    // A rule without condition matches everything
    assert.deepEqual(F.evaluate({ policy: 'drop', rules: [rule('accept')] }, packets).map(r => r.verdict), Array(5).fill('accept'));
});

test('packets a player cannot judge do not count either way', () => {
    const neutral = F.level('rate').packets.filter(p => p.good === null);
    assert.equal(neutral.length, 5);
    assert.deepEqual(F.score(F.evaluate({ policy: 'drop', rules: [] }, neutral)), { leaked: 0, blocked: 0, won: true });
    assert.deepEqual(F.score(F.evaluate({ policy: 'accept', rules: [] }, neutral)), { leaked: 0, blocked: 0, won: true });
});

test('waves are deterministic and packets well-formed', () => {
    for (const level of F.LEVELS) {
        assert.deepEqual(level.packets.map(p => p.id), level.packets.map((_, i) => i));
        for (const p of level.packets) {
            assert.ok(['tcp', 'udp'].includes(p.proto) && Number.isInteger(p.dport) && ['new', 'established'].includes(p.state) && p.src && p.who, level.id);
            assert.ok([true, false, null].includes(p.good));
        }
        assert.ok(level.packets.some(p => p.good === true) && level.packets.some(p => p.good === false), level.id);
        assert.ok(level.packets.length >= 9 && level.packets.length <= 24, level.id);
    }
    assert.equal(F.level('nope'), null);
});

test('rules print as nftables syntax, with the protocol of the level', () => {
    assert.equal(F.ruleText(rule('accept', ['dport', 443])), 'tcp dport 443 accept');
    assert.equal(F.ruleText(rule('accept', ['src', 'you'], ['dport', 22])), 'ip saddr @admin tcp dport 22 accept');
    assert.equal(F.ruleText(rule('accept', ['state', 'established'])), 'ct state established accept');
    assert.equal(F.ruleText(rule('drop', ['rate', 5])), 'limit rate over 5/second drop');
    assert.equal(F.ruleText(rule('drop')), 'drop');
    const text = F.rulesetText({ policy: 'drop', rules: [rule('accept', ['dport', 53124])] }, F.level('state'));
    assert.match(text, /policy drop;\n {8}udp dport 53124 accept\n/);
    assert.match(F.rulesetText(F.empty(), F.level('ports')), /policy accept;\n {4}\}/);
});

test('malformed rulesets are refused', () => {
    assert.equal(F.validRuleset(F.empty()), true);
    for (const bad of [null, {}, { policy: 'allow', rules: [] }, { policy: 'drop', rules: {} }, { policy: 'drop', rules: [{ action: 'reject', conds: [] }] },
        { policy: 'drop', rules: [rule('accept', ['dport', '22'])] }, { policy: 'drop', rules: [rule('accept', ['port', 22])] },
        { policy: 'drop', rules: [rule('accept', ['dport', 1], ['dport', 2], ['dport', 3])] }, { policy: 'drop', rules: Array(13).fill(rule('drop')) }]) {
        assert.equal(F.validRuleset(bad), false, JSON.stringify(bad)?.slice(0, 60));
    }
});

test('progress keeps known level ids only, in order', () => {
    assert.deepEqual(F.parseProgress('["rate","ports","nope","ports"]'), ['ports', 'rate']);
    assert.deepEqual(F.parseProgress('x'), []);
    assert.equal(F.serializeProgress(['state', 'zzz']), '["state"]');
});

test('every level, sender and condition has its strings in both languages', () => {
    for (const lang of ['en', 'fr']) {
        const tr = translations[lang];
        for (const level of F.LEVELS) {
            const l = tr.level[level.id];
            assert.ok(l?.name && l?.brief && l?.lesson && l?.hint, `${lang}: level.${level.id}`);
            for (const p of level.packets) assert.ok(tr.who[p.who], `${lang}: who.${p.who}`);
            for (const [type, value] of level.palette) {
                assert.ok(tr.cond[type], `${lang}: cond.${type}`);
                if (type === 'src' || type === 'state') assert.ok(tr.value[value], `${lang}: value.${value}`);
            }
        }
    }
});

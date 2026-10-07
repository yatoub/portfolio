// node --test tools/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const require = createRequire(import.meta.url);
const C = require('../ctf/core.js');
const { subtle } = webcrypto;
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const translations = new Function(`${read('ctf/translations.js')}; return translations;`)();

// Flags committed in the repository, and the file each one is hidden in
const IN_REPO = { robots: 'robots.txt', source: 'index.html', dotfile: 'term/core.js', curl: 'whoami/cli.txt' };
const FLAG_RE = /YATOUB\{[^}\s]+\}/g;

test('six flags, distinct ids, well-formed hashes', () => {
    assert.deepEqual(C.FLAGS.map(f => f.id), ['robots', 'source', 'dotfile', 'curl', 'header', 'dns']);
    assert.equal(new Set(C.FLAGS.map(f => f.hash)).size, 6);
    for (const f of C.FLAGS) {
        assert.match(f.hash, /^[0-9a-f]{64}$/, f.id);
        assert.ok(f.cmd, f.id);
    }
});

test('sha256Hex matches a known vector', async () => {
    assert.equal(await C.sha256Hex('abc', subtle), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('each in-repo flag hashes to its declared value', async () => {
    for (const [id, path] of Object.entries(IN_REPO)) {
        const found = read(path).match(FLAG_RE) || [];
        assert.equal(found.length, 1, `${path} must hold exactly one flag`);
        assert.equal(await C.check(found[0], subtle), id, path);
    }
});

test('the page files hold no valid flag', async () => {
    for (const path of ['ctf/core.js', 'ctf/script.js', 'ctf/translations.js', 'ctf/index.html']) {
        for (const candidate of read(path).match(FLAG_RE) || []) {
            assert.equal(await C.check(candidate, subtle), null, `${path} leaks a flag`);
        }
    }
});

test('check tolerates surrounding whitespace, nothing else', async () => {
    const [flag] = read('robots.txt').match(FLAG_RE);
    assert.equal(await C.check(`  ${flag}\n`, subtle), 'robots');
    assert.equal(await C.check(flag.toLowerCase(), subtle), null);
    assert.equal(await C.check(flag.slice(0, -1), subtle), null);
    assert.equal(await C.check('YATOUB{nope}', subtle), null);
    assert.equal(await C.check('', subtle), null);
    assert.equal(await C.check(undefined, subtle), null);
});

test('parseProgress keeps known ids only, in display order, without duplicates', () => {
    assert.deepEqual(C.parseProgress('["dns","robots","dns","nope",42]'), ['robots', 'dns']);
    assert.deepEqual(C.parseProgress('not json'), []);
    assert.deepEqual(C.parseProgress(null), []);
    assert.deepEqual(C.parseProgress('{"robots":true}'), []);
    assert.deepEqual(C.parseProgress('"robots"'), []);
});

test('serializeProgress round-trips and never stores unknown values', () => {
    assert.equal(C.serializeProgress(['curl', 'robots', 'YATOUB{x}']), '["robots","curl"]');
    assert.deepEqual(C.parseProgress(C.serializeProgress(['header'])), ['header']);
});

test('every flag has a title, a hint, an explanation and a defence note in both languages', () => {
    for (const lang of ['en', 'fr']) {
        for (const { id } of C.FLAGS) {
            for (const key of ['title', 'hint', 'explain', 'defense']) {
                assert.ok(translations[lang].flags[id]?.[key], `${lang}: flags.${id}.${key}`);
            }
        }
    }
});

test('hints and explanations do not give a flag away', () => {
    assert.doesNotMatch(read('ctf/translations.js'), /YATOUB\{[^}.…]/);
});

test('both languages expose the same keys', () => {
    const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    assert.deepEqual(keys(translations.en).sort(), keys(translations.fr).sort());
});

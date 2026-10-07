// node --test tools/*.test.mjs
// Cross-page checks: the manual lists every page, every page has its strings in both languages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
const Man = require('../man/core.js');
const Term = require('../term/core.js');
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const strings = dir => new Function(`${read(`${dir}/translations.js`)}; return translations;`)();
const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));

const SHARED = ['man', 'ping', 'dig', 'curl', 'traceroute'];   // pages built on assets/page.js

test('the manual lists every indexable page, and only pages that exist', () => {
    const sitemap = [...read('sitemap.xml').matchAll(/<loc>https:\/\/yatoub\.dev(\/[^<]*)<\/loc>/g)].map(m => m[1]);
    const listed = Man.PAGES.map(p => p.href);
    for (const path of sitemap.filter(p => p !== '/' && p !== '/man/')) assert.ok(listed.includes(path), `${path} is missing from man/core.js`);
    for (const page of Man.PAGES) assert.ok(existsSync(new URL(`../${page.id}/index.html`, import.meta.url)), `${page.id}/index.html`);
    for (const file of Man.FILES) assert.ok(existsSync(new URL(`..${file.path}`, import.meta.url)), file.path);
});

test('the manual does not link the hidden trail', () => {
    assert.ok(!Man.PAGES.some(p => p.id === 'ctf'));
    assert.doesNotMatch(read('man/index.html'), /href="\/ctf/);
});

test('every manual entry has a description in both languages and a section number', () => {
    const tr = strings('man');
    for (const lang of ['en', 'fr']) {
        for (const page of Man.PAGES) assert.ok(tr[lang].pages[page.id], `${lang}: pages.${page.id}`);
        for (const file of Man.FILES) assert.ok(tr[lang].files[file.id], `${lang}: files.${file.id}`);
    }
    for (const page of Man.PAGES) {
        assert.ok([1, 8].includes(page.section), page.id);
        assert.equal(Man.title(page), `${page.id}(${page.section})`);
        assert.ok(page.synopsis, page.id);
    }
});

test('every manual page can be opened from the terminal', async () => {
    const tr = new Function(`${read('translations.js')}; return translations;`)().en;
    const ctx = { fs: Term.buildFs({ tr, lang: 'en' }), state: { cwd: [], lang: 'en', history: [] }, tr: tr.term };
    for (const page of Man.PAGES) {
        const res = await Term.exec(`open ${page.id}`, ctx);
        assert.deepEqual(res.effects, [{ type: 'open', url: page.href }], page.id);
    }
});

test('shared-helper pages: both languages expose the same keys, with no typographic apostrophe', () => {
    for (const dir of SHARED) {
        const tr = strings(dir);
        assert.deepEqual(keys(tr.en).sort(), keys(tr.fr).sort(), dir);
        assert.doesNotMatch(read(`${dir}/translations.js`), /’/, `${dir}: use straight apostrophes inside double quotes`);
    }
});

test('shared-helper pages load the helper before their own script, and every data-i18n key exists', () => {
    for (const dir of SHARED) {
        const html = read(`${dir}/index.html`);
        const order = ['translations.js', '/assets/page.js', 'script.js'].map(s => html.indexOf(`src="${s}"`));
        assert.ok(order.every(i => i > 0) && order[0] < order[1] && order[1] < order[2], `${dir}: script order`);
        const tr = strings(dir);
        for (const [, key] of html.matchAll(/data-i18n="([^"]+)"/g)) {
            for (const lang of ['en', 'fr']) {
                assert.equal(typeof key.split('.').reduce((o, k) => o?.[k], tr[lang]), 'string', `${dir} ${lang}: ${key}`);
            }
        }
        assert.match(html, /<a href="\/man\/">|<title>YATOUB \/\/ MAN<\/title>/, `${dir}: link back to the manual`);
    }
});

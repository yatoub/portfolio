// node --test tools/*.test.mjs
// The served HTML must hold the content without JavaScript: tools/build.mjs writes it,
// these tests check what a crawler or a reader without scripts gets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Man = require('../man/core.js');
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const strings = path => new Function(`${read(path)}; return translations;`)();
const index = read('index.html');
const man = read('man/index.html');
const projects = JSON.parse(read('projects.json'));
const homelab = JSON.parse(read('homelab.json'));
const site = strings('translations.js');

const between = (html, name) => html.slice(html.indexOf(`<!-- ${name}:start -->`), html.indexOf(`<!-- ${name}:end -->`));
const count = (html, re) => (html.match(re) || []).length;
const unescape = s => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// Leaf elements carrying data-i18n → [key, text]
const baked = html => [...html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)].map(m => [m[2], m[3]]);

test('the generated files are up to date', () => {
    const out = execFileSync(process.execPath, [fileURLToPath(new URL('./build.mjs', import.meta.url)), '--check'], { encoding: 'utf8' });
    assert.match(out, /up to date/);
});

test('one card per project, in order, with both languages on board', () => {
    const block = between(index, 'projects');
    assert.equal(count(block, /class="swiper-slide"/g), projects.length);
    assert.equal(count(block, /class="proj-card featured"/g), projects.length);
    projects.forEach((p, i) => {
        assert.ok(block.includes(`<span class="proj-index">P.${String(i + 1).padStart(2, '0')}</span>`), p.name);
        assert.ok(block.includes(`<h3 class="proj-title">${p.name}</h3>`), p.name);
        assert.ok(block.includes(`href="${p.url}"`), p.name);
    });
    const descs = [...block.matchAll(/<p class="proj-desc" data-en="([^"]*)" data-fr="([^"]*)">([^<]*)<\/p>/g)];
    assert.equal(descs.length, projects.length);
    descs.forEach(([, en, fr, text], i) => {
        assert.equal(unescape(en), projects[i].desc_en);
        assert.equal(unescape(fr), projects[i].desc_fr);
        assert.equal(text, en, 'the visible text is the language of <html lang>');
    });
    assert.ok(block.indexOf(projects[0].name) < block.indexOf(projects.at(-1).name));
});

test('one card per homelab service shown on the home page, from public fields only', () => {
    const block = between(index, 'homelab');
    const shown = homelab.filter(s => s.home);
    assert.ok(shown.length > 0);
    assert.equal(count(block, /class="hl-service reveal-child"/g), shown.length);
    for (const s of shown) assert.ok(block.includes(`<span class="hl-svc-name">${s.name}</span>`), s.name);
    // lab/services.json is private: nothing of it but the public subset may reach the page
    const priv = JSON.parse(read('lab/services.json'));
    for (const s of priv) {
        if (s.url) assert.ok(!index.includes(s.url), `${s.id}: private URL in index.html`);
        for (const key of ['desc_en', 'desc_fr']) if (s[key]) assert.ok(!block.includes(s[key]), `${s.id}: ${key} in index.html`);
    }
});

test('the hero and the counters are not empty without JavaScript', () => {
    assert.match(index, /<h1 class="hero-name">\s*<span class="name-line" id="heroName">Yatoub<\/span>/);
    assert.ok(index.includes(`id="typewriter">${site.en.roles[0]}</span>`));
    const stats = [...index.matchAll(/<span class="stat-num" data-target="(\d+)">([^<]*)<\/span>/g)];
    assert.equal(stats.length, 4);
    for (const [, target, text] of stats) {
        assert.equal(text, target);
        assert.ok(Number(text) > 0);
    }
});

test('every translated element holds the string of the page language', () => {
    assert.match(index, /<html lang="en">/);
    assert.match(man, /<html lang="fr">/);
    for (const [html, tr, file] of [[index, site.en, 'index.html'], [man, strings('man/translations.js').fr, 'man/index.html']]) {
        const items = baked(html);
        assert.equal(items.length, count(html, /data-i18n="/g), `${file}: every data-i18n element is a leaf`);
        assert.ok(items.length > 10, file);
        for (const [key, text] of items) {
            const value = key.split('.').reduce((o, k) => o?.[k], tr);
            assert.equal(typeof value, 'string', `${file}: ${key}`);
            assert.ok(text.trim().length > 0, `${file}: ${key} is empty`);
            assert.equal(unescape(text), value, `${file}: ${key}`);
        }
    }
});

test('the manual lists every page and file in the HTML itself', () => {
    const commands = between(man, 'man-commands');
    const files = between(man, 'man-files');
    assert.equal(count(commands, /<dt class="mn-term">/g), Man.PAGES.length);
    assert.equal(count(commands, /<dd class="mn-def">/g), Man.PAGES.length);
    assert.equal(count(files, /<dt class="mn-term">/g), Man.FILES.length);
    for (const page of Man.PAGES) assert.ok(commands.includes(`<a href="${page.href}">${page.id}</a>(${page.section})`), page.id);
    for (const file of Man.FILES) assert.ok(files.includes(`<a href="${file.path}">${file.path}</a>`), file.path);
    assert.doesNotMatch(man, /href="\/ctf/);
});

test('the home page script builds nothing that the HTML already holds', () => {
    const script = read('script.js');
    assert.doesNotMatch(script, /fetch\(['"]\/(projects|homelab)\.json/);
    assert.doesNotMatch(script, /renderHomelab|createElement\('h3'\)/);
});

test('the two CTF comments of index.html are untouched', () => {
    assert.ok(index.startsWith('<!DOCTYPE html>\n<!--\n  Reading the source? Good habit.\n  Six flags are hidden on this site: https://yatoub.dev/ctf/\n-->\n'));
    assert.match(index, /<\/main>\n\n    <!-- YATOUB\{[^}]+\} : a comment never shows on screen, but it ships with the page -->\n\n    <!-- Footer -->/);
});

test('every static surface carries the same positioning as the translations', () => {
    const role = site.en.exp.en.role;
    assert.equal(site.en.roles[0], role);
    // Search and link previews
    const descriptions = [...index.matchAll(/<meta (?:name|property)="(?:description|og:description|twitter:description)" content="([^"]*)">/g)].map(m => m[1]);
    assert.equal(descriptions.length, 3);
    assert.equal(new Set(descriptions).size, 1, 'meta, Open Graph and Twitter descriptions are the same sentence');
    assert.ok(descriptions[0].startsWith(role), descriptions[0]);
    assert.ok(index.includes(`"jobTitle": "${role}"`));
    // The plain-text resume
    const curl = read('curl.txt');
    assert.ok(curl.includes(`  ${role} // `));
    assert.ok(curl.includes(`│ ${role}\n`));
    const flat = curl.replace(/\s+/g, ' ');
    assert.ok(flat.includes(site.en.about.bio1.replace(/\s+/g, ' ')), 'the bio of curl.txt is the one of the home page');
    assert.ok(flat.includes(site.en.about.bio2.replace(/\s+/g, ' ')));
    const about = curl.slice(curl.indexOf('  ABOUT'), curl.indexOf('━', curl.indexOf('  ABOUT')));
    assert.ok(about.split('\n').every(line => line.length <= 64), 'the bio is wrapped to the width of the rule above it');
    for (const file of ['index.html', 'curl.txt', 'tools/curl.tpl.txt']) assert.doesNotMatch(read(file), /Systems integrator/, file);
});

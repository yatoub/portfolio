#!/usr/bin/env node
/* ═══════════════════════════════════════════
   Portfolio — tools/build.mjs
   Generates curl.txt, homelab.json and sitemap.xml
   from projects.json + lab/services.json, and pre-renders
   index.html and man/index.html: cards, manual entries and
   every translated string, so that the served HTML holds the
   content without JavaScript. The page scripts only hydrate.

   node tools/build.mjs           write generated files
   node tools/build.mjs --check   exit 1 if they are stale
   ═══════════════════════════════════════════ */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://yatoub.dev';
const PAGES = ['/', '/whoami/', '/status/', '/tcpdump/', '/tail/', '/man/', '/ping/', '/dig/', '/curl/', '/traceroute/', '/ipcalc/', '/nc/', '/xxd/', '/nft/'];

const read = p => readFileSync(join(ROOT, p), 'utf8');
const projects = JSON.parse(read('projects.json'));
const services = JSON.parse(read('lab/services.json'));

/* ── Text layout helpers ── */

function wrap(text, width) {
    const lines = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
        if (line && (line + ' ' + word).length > width) {
            lines.push(line);
            line = word;
        } else {
            line = line ? line + ' ' + word : word;
        }
    }
    if (line) lines.push(line);
    return lines;
}

// Fixed-width columns ; a cell wider than its column pushes the rest to the next line
function row(cols, widths, tail) {
    const indent = ' '.repeat(2 + widths.reduce((a, b) => a + b, 0));
    const out = [];
    let head = '  ';
    cols.forEach((col, i) => {
        if (col.length >= widths[i]) {
            out.push((head + col).trimEnd());
            head = ' '.repeat(head.length + widths[i]);
        } else {
            head += col.padEnd(widths[i]);
        }
    });
    tail.forEach((line, i) => out.push(i === 0 ? head + line : indent + line));
    return out.join('\n');
}

/* ── curl.txt ── */

const WIDTH = 46;

const projectsBlock = projects.map(p => {
    const lang = `[${p.badge.split('/')[0].trim()}]`;
    const url = p.url.replace(/^https?:\/\//, '');
    return row([p.name, lang], [19, 10], [...wrap(p.desc_en, WIDTH), url]);
}).join('\n\n');

const homelabBlock = services
    .map(s => row([s.name, s.badge_en], [17, 13], wrap(s.short_en, WIDTH)))
    .join('\n');

const curlTxt = read('tools/curl.tpl.txt')
    .replace('{{PROJECTS}}', () => projectsBlock)
    .replace('{{HOMELAB}}', () => homelabBlock);

/* ── homelab.json — public subset, /lab/services.json sits behind Authelia ── */

const homelabJson = JSON.stringify(
    services.map(({ id, name, badge_en, badge_fr, short_en, short_fr, home }) =>
        ({ id, name, badge_en, badge_fr, short_en, short_fr, home })),
    null, 2) + '\n';

/* ── sitemap.xml ── */

const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...PAGES.map(p => `  <url><loc>${SITE}${p}</loc></url>`),
    '</urlset>',
    '',
].join('\n');

/* ── Pre-rendering ──
   The HTML files are both input and output: each run rewrites the generated parts in place.
   Running twice changes nothing, and --check fails as soon as a source and the HTML disagree. */

const require = createRequire(import.meta.url);
const loadTranslations = path => new Function(`${read(path)}; return translations;`)();
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const lookup = (obj, key) => key.split('.').reduce((o, k) => o?.[k], obj);

// Replaces what sits between <!-- name:start --> and <!-- name:end -->, keeping the markers
function inject(html, name, block) {
    const start = `<!-- ${name}:start -->`, end = `<!-- ${name}:end -->`;
    const a = html.indexOf(start), b = html.indexOf(end);
    if (a < 0 || b < a) throw new Error(`markers "${name}" not found`);
    const indent = html.slice(html.lastIndexOf('\n', a) + 1, a);
    const body = block.split('\n').map(line => (line ? indent + line : line)).join('\n');
    return `${html.slice(0, a + start.length)}\n${body}\n${indent}${html.slice(b)}`;
}

// Writes each translated string into its element. Only leaf elements can carry data-i18n:
// the page scripts set them with textContent, which would wipe any child.
function bake(html, strings, file) {
    return html.replace(/(<([a-z][a-z0-9]*)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g, (match, open, tag, key, inner, close) => {
        if (inner.includes('<')) throw new Error(`${file}: [data-i18n="${key}"] has child elements`);
        const value = lookup(strings, key);
        if (typeof value !== 'string') throw new Error(`${file}: no string for data-i18n="${key}"`);
        return open + esc(value) + close;
    });
}

// Sets the text of the one element carrying this id
function setText(html, id, text, file) {
    const re = new RegExp(`(<([a-z][a-z0-9]*)\\b[^>]*\\bid="${id}"[^>]*>)[^<]*(<\\/\\2>)`);
    if (!re.test(html)) throw new Error(`${file}: #${id} not found, or not a leaf element`);
    return html.replace(re, (m, open, tag, close) => open + esc(text) + close);
}

const langOf = (html, file) => {
    const lang = html.match(/<html lang="([a-z]{2})"/)?.[1];
    if (!lang) throw new Error(`${file}: no <html lang>`);
    return lang;
};

/* index.html */
const siteStrings = loadTranslations('translations.js');
const homelabPublic = JSON.parse(homelabJson);

// Same markup as the cards script.js used to build. Both languages travel in data-en / data-fr:
// the script only swaps the text on a language switch.
const projectCards = lang => projects.map((p, i) => [
    '<div class="swiper-slide">',
    `    <a href="${esc(p.url)}" target="_blank" class="proj-card featured">`,
    '        <div class="proj-card-inner">',
    '            <div class="proj-top">',
    `                <span class="proj-index">P.${String(i + 1).padStart(2, '0')}</span>`,
    `                <span class="proj-badge">${esc(p.badge)}</span>`,
    '            </div>',
    `            <h3 class="proj-title">${esc(p.name)}</h3>`,
    `            <p class="proj-desc" data-en="${esc(p.desc_en)}" data-fr="${esc(p.desc_fr)}">${esc(p[`desc_${lang}`])}</p>`,
    `            <div class="proj-tags">${p.tags.map(tag => `<span>${esc(tag)}</span>`).join('')}</div>`,
    '            <div class="proj-arrow" data-i18n="projects.view"></div>',
    '        </div>',
    '    </a>',
    '</div>',
].join('\n')).join('\n');

// Public fields only: lab/services.json sits behind Authelia
const homelabCards = lang => homelabPublic.filter(s => s.home).map(s => [
    '<div class="hl-service reveal-child">',
    '    <div class="hl-svc-header">',
    `        <span class="hl-svc-name">${esc(s.name)}</span>`,
    `        <span class="hl-svc-badge" data-en="${esc(s.badge_en)}" data-fr="${esc(s.badge_fr)}">${esc(s[`badge_${lang}`])}</span>`,
    '    </div>',
    `    <p class="hl-svc-desc" data-en="${esc(s.short_en)}" data-fr="${esc(s.short_fr)}">${esc(s[`short_${lang}`])}</p>`,
    '</div>',
].join('\n')).join('\n');

function renderIndex() {
    const file = 'index.html';
    let html = read(file);
    const lang = langOf(html, file);
    html = inject(html, 'projects', projectCards(lang));
    html = inject(html, 'homelab', homelabCards(lang));
    html = bake(html, siteStrings[lang], file);
    // What the animations end on: the hero name, the first role, the final counters
    html = setText(html, 'heroName', 'Yatoub', file);
    html = setText(html, 'typewriter', siteStrings[lang].roles[0], file);
    return html.replace(/(<span class="stat-num" data-target="(\d+)">)[^<]*(<\/span>)/g, '$1$2$3');
}

/* man/index.html */
function renderMan() {
    const file = 'man/index.html';
    const ManCore = require('../man/core.js');
    let html = read(file);
    const lang = langOf(html, file);
    const strings = loadTranslations('man/translations.js')[lang];

    // Same markup as man/script.js, which rebuilds both lists on a language switch
    const commands = ManCore.PAGES.map(page => [
        `<dt class="mn-term"><a href="${esc(page.href)}">${esc(page.id)}</a>(${page.section})${page.restricted ? `<span class="pg-tag">${esc(strings.restricted)}</span>` : ''}</dt>`,
        `<dd class="mn-def"><code class="mn-cmd">$ ${esc(page.synopsis)}</code><p>${esc(strings.pages[page.id])}</p></dd>`,
    ].join('\n')).join('\n');
    const files = ManCore.FILES.map(f => [
        `<dt class="mn-term"><a href="${esc(f.path)}">${esc(f.path)}</a></dt>`,
        `<dd class="mn-def">${esc(strings.files[f.id])}</dd>`,
    ].join('\n')).join('\n');

    html = inject(html, 'man-commands', commands);
    html = inject(html, 'man-files', files);
    return bake(html, strings, file);
}

/* ── Write / check ── */

const outputs = { 'curl.txt': curlTxt, 'homelab.json': homelabJson, 'sitemap.xml': sitemap, 'index.html': renderIndex(), 'man/index.html': renderMan() };
const check = process.argv.includes('--check');
let stale = 0;

for (const [file, content] of Object.entries(outputs)) {
    const path = join(ROOT, file);
    const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (current === content) continue;
    if (check) {
        console.error(`stale: ${file} — run "node tools/build.mjs"`);
        stale++;
    } else {
        writeFileSync(path, content);
        console.log(`wrote ${file}`);
    }
}

if (stale) process.exit(1);
if (check) console.log('generated files are up to date');

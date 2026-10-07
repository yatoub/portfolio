#!/usr/bin/env node
/* ═══════════════════════════════════════════
   Portfolio — tools/build.mjs
   Generates curl.txt, homelab.json and sitemap.xml
   from projects.json + lab/services.json.

   node tools/build.mjs           write generated files
   node tools/build.mjs --check   exit 1 if they are stale
   ═══════════════════════════════════════════ */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://yatoub.dev';
const PAGES = ['/', '/whoami/', '/status/', '/tcpdump/', '/tail/', '/man/', '/ping/', '/dig/', '/curl/', '/traceroute/', '/ipcalc/', '/nc/', '/xxd/'];

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

/* ── Write / check ── */

const outputs = { 'curl.txt': curlTxt, 'homelab.json': homelabJson, 'sitemap.xml': sitemap };
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

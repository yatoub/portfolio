// node --test tools/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const T = require('../term/core.js');
const { summarize } = require('../status/core.js');
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const translations = new Function(`${read('translations.js')}; return translations;`)();
const projects = JSON.parse(read('projects.json'));
const homelab = JSON.parse(read('homelab.json'));

function shell(lang = 'en', io = {}) {
    const tr = translations[lang];
    const ctx = {
        fs: T.buildFs({ tr, lang, projects, homelab, contact: [{ label: 'yatoub@yatoub.dev' }] }),
        state: { cwd: [], lang, history: [] },
        tr: tr.term, homelab, summarize,
        io: { text: async () => 'REMOTE', json: async () => { throw new Error('offline'); }, status: async () => { throw new Error('offline'); }, ...io },
    };
    const run = async (input) => {
        const res = await T.exec(input, ctx);
        return { ...res, text: res.lines.map(l => l.text).join('\n') };
    };
    return { ctx, run };
}

test('tokenize handles quotes and repeated spaces', () => {
    assert.deepEqual(T.tokenize('  cat   "my file"  \'b c\' d '), ['cat', 'my file', 'b c', 'd']);
});

test('resolve handles ~, .., . and absolute paths without escaping the root', () => {
    assert.deepEqual(T.resolve(['projects'], '../homelab/./ha.md'), ['homelab', 'ha.md']);
    assert.deepEqual(T.resolve(['projects'], '~/about.md'), ['about.md']);
    assert.deepEqual(T.resolve(['projects'], '/about.md'), ['about.md']);
    assert.deepEqual(T.resolve([], '../../..'), []);
});

test('ls lists the home directory with directories marked', async () => {
    const { run } = shell();
    assert.equal((await run('ls')).text, 'about.md  contact.txt  curl.txt  experience/  homelab/  projects/');
});

test('dotfiles are hidden from ls unless -a is given, and stay readable by name', async () => {
    const { run } = shell();
    assert.doesNotMatch((await run('ls')).text, /\.env/);
    assert.equal((await run('ls -a')).text, '.env  about.md  contact.txt  curl.txt  experience/  homelab/  projects/');
    assert.match((await run('ls -la')).text, /^\.env {2}about\.md/);
    assert.match((await run('ll -a ~')).text, /^\.env/);
    assert.doesNotMatch((await run('ls -l')).text, /\.env/);
    assert.match((await run('cat .env')).text, /^FLAG=YATOUB\{.+\}$/m);
    assert.equal((await run('ls -a projects')).text, (await run('ls projects')).text);
});

test('the filesystem mirrors projects.json and homelab.json', async () => {
    const { run } = shell();
    assert.equal((await run('ls projects')).text.split('  ').length, projects.length);
    assert.equal((await run('ls homelab')).text.split('  ').length, homelab.length);
    assert.equal((await run('ls experience')).text.split('  ').length, 5);
});

test('cd moves, updates the prompt, and rejects files and unknown paths', async () => {
    const { ctx, run } = shell();
    await run('cd projects');
    assert.equal(T.prompt(ctx.state), 'guest@yatoub:~/projects$');
    assert.match((await run('cd nope')).text, /No such file or directory/);
    assert.match((await run('cd ../about.md')).text, /Not a directory/);
    await run('cd');
    assert.deepEqual(ctx.state.cwd, []);
});

test('cat prints content in the active language', async () => {
    assert.match((await shell('en').run('cat projects/susshi.md')).text, /Terminal SSH manager/);
    assert.match((await shell('fr').run('cat projects/susshi.md')).text, /Gestionnaire SSH/);
    assert.match((await shell('fr').run('cat experience/2020-la-poste.md')).text, /La Poste · NOV 2020/);
});

test('cat reports directories, missing files, and fetches remote files', async () => {
    const { run } = shell();
    assert.match((await run('cat projects')).text, /Is a directory/);
    assert.match((await run('cat nope.txt')).text, /No such file/);
    assert.equal((await run('cat curl.txt')).text, 'REMOTE');
    assert.match((await run('cat')).text, /usage: cat/);
});

test('open resolves sections, project names and paths', async () => {
    const { run } = shell();
    assert.deepEqual((await run('open lab')).effects, [{ type: 'open', url: '/lab' }]);
    assert.deepEqual((await run('open ctf')).effects, [{ type: 'open', url: '/ctf/' }]);
    assert.deepEqual((await run('open tcpdump')).effects, [{ type: 'open', url: '/tcpdump/' }]);
    assert.deepEqual((await run('open tail')).effects, [{ type: 'open', url: '/tail/' }]);
    for (const page of ['man', 'ping', 'dig', 'curl']) assert.deepEqual((await run(`open ${page}`)).effects, [{ type: 'open', url: `/${page}/` }]);
    assert.equal((await run('open Rutile')).effects[0].url, 'https://github.com/yatoub/Rutile');
    assert.equal((await run('open projects/tych.md')).effects[0].url, 'https://github.com/yatoub/Tych');
    assert.deepEqual((await run('open nothing')).effects, []);
});

test('open never yields a URL that is not from site data', async () => {
    const { run } = shell();
    for (const target of ['javascript:alert(1)', 'https://evil.example', '__proto__', 'constructor']) {
        assert.deepEqual((await run(`open ${target}`)).effects, [], target);
    }
});

test('paths made of Object internals do not resolve', async () => {
    const { run } = shell();
    for (const p of ['constructor', '__proto__', 'projects/constructor', 'toString']) {
        assert.match((await run(`cat ${p}`)).text, /No such file/, p);
        assert.match((await run(`cd ${p}`)).text, /No such file/, p);
    }
});

test('lang validates its argument and emits an effect', async () => {
    const { run } = shell('en');
    assert.equal((await run('lang')).text, 'en');
    assert.deepEqual((await run('lang fr')).effects, [{ type: 'lang', lang: 'fr' }]);
    assert.match((await run('lang de')).text, /usage/);
});

test('unknown commands and prototype names are rejected', async () => {
    const { run } = shell();
    for (const cmd of ['foo', 'constructor', 'toString', '__proto__', 'hasOwnProperty']) {
        assert.match((await run(cmd)).text, /command not found/, cmd);
    }
});

test('history records what was typed, aliases work', async () => {
    const { run } = shell();
    await run('pwd');
    await run('ll');
    assert.match((await run('history')).text, /1 {2}pwd\n\s+2 {2}ll\n\s+3 {2}history/);
});

test('status reports live data, and unknown when unavailable', async () => {
    const now = Date.parse('2026-10-05T12:00:00Z');
    const data = { generated_at: '2026-10-05T11:59:00Z', services: [{ id: 'grafana', state: 'up', uptime: 0.9998 }, { id: 'n8n', state: 'down', uptime: 0.5 }, { id: 'internal-thing', state: 'up' }] };
    const { text } = await shell('en', { status: async () => ({ data, now }) }).run('status');
    assert.match(text, /1 of 3 service\(s\) down/);
    assert.match(text, /Grafana\s+UP\s+99\.98 %/);
    assert.match(text, /n8n\s+DOWN/);
    assert.doesNotMatch(text, /internal-thing/);
    assert.match((await shell().run('status')).text, /no status data/);
});

test('whoami degrades to the user name when the server view is unavailable', async () => {
    assert.match((await shell().run('whoami')).text, /^guest\n/);
    const { text } = await shell('en', { json: async () => ({ ip: '203.0.113.7', proto: 'HTTP/2.0', tls: 'tls1.3', cipher: 'X', headers: {} }) }).run('whoami');
    assert.match(text, /ip {5}203\.0\.113\.7/);
});

test('completion: commands, paths, unique and ambiguous matches', () => {
    const { ctx } = shell();
    assert.equal(T.complete('he', ctx).input, 'help ');
    assert.equal(T.complete('cat ab', ctx).input, 'cat about.md ');
    assert.equal(T.complete('cd pro', ctx).input, 'cd projects/');
    assert.equal(T.complete('cat projects/sus', ctx).input, 'cat projects/susshi.md ');
    assert.deepEqual(T.complete('cat c', ctx), { input: 'cat c', options: ['contact.txt', 'curl.txt'] });
    assert.equal(T.complete('open rut', ctx).input, 'open rutile ');
    assert.deepEqual(T.complete('lang ', ctx).options, ['fr', 'en']);
    assert.deepEqual(T.complete('cat zzz', ctx), { input: 'cat zzz', options: [] });
    assert.ok(!T.complete('', ctx).options.includes('sudo'));
    assert.deepEqual(T.complete('cat ', ctx).options.filter(o => o.startsWith('.')), []);
    assert.equal(T.complete('cat .', ctx).input, 'cat .env ');
    assert.equal(T.complete('open ct', ctx).input, 'open ctf ');
});

test('every help entry is a real command, in both languages', () => {
    for (const lang of ['en', 'fr']) {
        for (const name of Object.keys(translations[lang].term.help)) assert.ok(Object.hasOwn(T.COMMANDS, name), `${lang}: ${name}`);
    }
});

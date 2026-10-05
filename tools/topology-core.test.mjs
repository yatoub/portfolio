// node --test tools/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const { route } = createRequire(import.meta.url)('../lab/topology-core.js');
const steps = svc => route(svc).map(s => s.step);
const edges = svc => route(svc).filter(s => s.edge).map(s => s.edge.join('>'));

test('forward auth: Authelia is consulted before the service is reached', () => {
    const svc = { id: 'grafana', auth: 'forward', vpn: false };
    assert.deepEqual(steps(svc), ['public', 'fw', 'tls', 'forward', 'granted']);
    assert.deepEqual(edges(svc), ['client>fw', 'fw>proxy', 'proxy>auth', 'proxy>grafana']);
});

test('one-factor forward auth uses its own step', () => {
    assert.deepEqual(steps({ id: 'vigie', auth: 'forward-1fa' }), ['public', 'fw', 'tls', 'forward-1fa', 'granted']);
});

test('OIDC: Caddy relays directly, the app talks to Authelia', () => {
    const svc = { id: 'matomo', auth: 'oidc', vpn: false };
    assert.deepEqual(steps(svc), ['public', 'fw', 'tls', 'direct', 'oidc']);
    assert.deepEqual(edges(svc), ['client>fw', 'fw>proxy', 'proxy>matomo', 'matomo>auth']);
});

test('VPN-only service enters through the WireGuard peer', () => {
    const svc = { id: 'proxmox', auth: 'forward', vpn: true };
    assert.deepEqual(steps(svc).slice(0, 2), ['vpn', 'fwVpn']);
    assert.equal(edges(svc)[0], 'vpn>fw');
});

test('service without auth mode is relayed directly, with no auth stage', () => {
    assert.deepEqual(route({ id: 'x' }).filter(s => s.kind === 'auth'), []);
});

test('every step used by real services has a translation in both languages', () => {
    const src = readFileSync(new URL('../translations.js', import.meta.url), 'utf8');
    const translations = new Function(`${src}; return translations;`)();
    const services = JSON.parse(readFileSync(new URL('../lab/services.json', import.meta.url), 'utf8')).filter(s => s.url);
    for (const lang of ['en', 'fr']) {
        const topo = translations[lang].lab.topo;
        for (const svc of services) {
            for (const s of route(svc)) assert.ok(topo.step[s.step], `${lang}: step ${s.step}`);
            assert.ok(topo.mode[svc.auth], `${lang}: mode ${svc.auth} (${svc.id})`);
        }
    }
});

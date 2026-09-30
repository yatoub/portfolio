/* ═══════════════════════════════════════════
   YATOUB // WHOAMI — collecte côté client
   Chaque carte = un collecteur async qui renvoie
   des lignes [clé i18n, valeur, source JS, en avant].
   Une valeur de type fonction est réévaluée à chaque
   rafraîchissement (live toutes les 500 ms + changement
   de langue) : c'est ainsi qu'on traduit sans re-scanner.
   ═══════════════════════════════════════════ */

'use strict';

const T0 = performance.now();
const F = {};           // faits bruts partagés entre collecteurs (pour les déductions)
const ROWS = [];        // { value, dd, big } : toutes les valeurs affichées
let signals = 0;
let scanDone = false;

const $ = (s) => document.querySelector(s);
const withTimeout = (p, ms, fallback = null) =>
    Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))]);
const mq = (q) => matchMedia(q).matches;

/* ── i18n — strings in translations.js (même mécanique que le portfolio) ── */
function detectLang() {
    let saved = null;
    try { saved = localStorage.getItem('lang'); } catch { /* stockage bloqué */ }
    if (saved === 'en' || saved === 'fr') return saved;
    return navigator.language?.startsWith('fr') ? 'fr' : 'en';
}
let currentLang = detectLang();

function t(key, lang = currentLang) {
    return key.split('.').reduce((obj, k) => obj?.[k], translations[lang]) ?? key;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// t() + remplacement des {variables} ; html=true échappe les variables (pour innerHTML)
function tf(key, vars = {}, html = false) {
    return t(key).replace(/\{(\w+)\}/g, (_, k) => (html ? esc(vars[k]) : vars[k] ?? ''));
}

function applyLang(lang) {
    currentLang = lang;
    document.documentElement.lang = lang;
    try { localStorage.setItem('lang', lang); } catch { /* stockage bloqué */ }

    document.querySelectorAll('[data-i18n]').forEach((el) => {
        el.textContent = t(el.dataset.i18n);
    });
    $('#langLabel').textContent = lang === 'en' ? 'FR' : 'EN';

    refreshRows();
    if (scanDone) renderDeductions(false);
}

/* ── Hash non-crypto (cyrb53) : marche aussi hors contexte sécurisé ── */
function cyrb53(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}
const hash = (s) => cyrb53(String(s)) + cyrb53(String(s), 42).slice(0, 6);

/* ── Boot log (historique : non retraduit après coup) ── */
function log(msg, cls = '') {
    const el = $('#bootLog');
    const time = ((performance.now() - T0) / 1000).toFixed(3).padStart(7, ' ');
    const stamp = document.createElement('span');
    stamp.className = 'hl';
    stamp.textContent = `[${time}] `;
    const tag = document.createElement('span');
    tag.className = cls;
    tag.textContent = cls === 'ok' ? '[  OK  ] ' : cls === 'warn' ? '[ WARN ] ' : '';
    el.append(stamp, tag, document.createTextNode(msg + '\n'));
    el.scrollTop = el.scrollHeight;
}

/* ── Rendu ── */
const resolve = (v) => (typeof v === 'function' ? v() : v);

function fmt(v) {
    if (v === undefined || v === null || v === '' || Number.isNaN(v)) return [t('v.nil'), 'nil'];
    if (v === true) return [t('v.yes'), 'yes'];
    if (v === false) return [t('v.no'), 'no'];
    return [String(v), ''];
}

function setValue(row) {
    const { dd, big } = row;
    const v = resolve(row.value);
    if (v instanceof Node) { if (dd.firstChild !== v) dd.replaceChildren(v); return; }
    const [text, cls] = fmt(v);
    if (dd.textContent !== text) dd.textContent = text;
    dd.className = [cls, big && !cls ? 'big' : ''].filter(Boolean).join(' ');
}

function refreshRows(onlyLive = false) {
    for (const row of ROWS) if (!onlyLive || typeof row.value === 'function') setValue(row);
}

function i18nEl(tag, key, cls) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    el.dataset.i18n = key;
    el.textContent = t(key);
    return el;
}

function makeCard(host, { id, file, idx, desc }) {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
        <div class="tc-bar">
            <div class="tc-dots"><span class="tcd red"></span><span class="tcd yellow"></span><span class="tcd green"></span></div>
            <span class="tc-title"></span>
        </div>
        <div class="card-head">
            <span class="sh-index"></span>
            <span class="card-count"><span class="n"></span> </span>
        </div>
        <p class="scanning">scanning</p>`;
    card.querySelector('.tc-title').textContent = `~/scan/${file}`;
    card.querySelector('.sh-index').textContent = idx;
    card.querySelector('.sh-index').after(i18nEl('h3', `card.${id}.title`, 'card-title'));
    if (desc) card.querySelector('.card-head').after(i18nEl('p', `card.${id}.desc`, 'card-desc'));
    host.append(card);
    return card;
}

function fillCard(card, rows, unit = 'unit.signals') {
    const dl = document.createElement('dl');
    dl.className = 'kv';
    for (const [key, value, src, big] of rows) {
        const row = document.createElement('div');
        row.className = 'kv-row';
        const dt = document.createElement('dt');
        dt.append(i18nEl('span', key));
        if (src) {
            // src.* = texte humain traduit ; sinon c'est du code affiché tel quel
            const c = src.startsWith('src.') ? i18nEl('code', src) : document.createElement('code');
            if (!c.textContent) c.textContent = src;
            dt.append(c);
        }
        const dd = document.createElement('dd');
        const r = { value, dd, big };
        ROWS.push(r);
        setValue(r);
        row.append(dt, dd);
        dl.append(row);
    }
    card.querySelector('.scanning').replaceWith(dl);
    const count = card.querySelector('.card-count');
    count.querySelector('.n').textContent = rows.length;
    count.append(i18nEl('span', unit));
    signals += rows.length;
    $('#statSignals').textContent = signals;
}

const exportable = (v) => {
    v = resolve(v);
    if (v instanceof HTMLImageElement) return '[canvas]';
    if (v instanceof Node) return [...v.querySelectorAll('.stag')].map((el) => el.textContent);
    return v ?? null;
};

/* ═══════════ COLLECTEURS ═══════════ */

/* ── 01 Réseau ── */
async function getIP() {
    const sources = [
        ['ipwho.is', 'https://ipwho.is/', (d) => d.success === false ? null : {
            ip: d.ip, version: d.type, isp: d.connection?.isp, asn: d.connection?.asn && 'AS' + d.connection.asn,
            city: d.city, region: d.region, country: d.country, cc: d.country_code, lat: d.latitude,
            lon: d.longitude, postal: d.postal, tz: d.timezone?.id }],
        ['ipapi.co', 'https://ipapi.co/json/', (d) => d.error ? null : {
            ip: d.ip, version: d.version, isp: d.org, asn: d.asn, city: d.city, region: d.region,
            country: d.country_name, cc: d.country_code, lat: d.latitude, lon: d.longitude,
            postal: d.postal, tz: d.timezone }],
        ['ipify.org', 'https://api.ipify.org?format=json', (d) => ({ ip: d.ip })],
    ];
    for (const [name, url, map] of sources) {
        try {
            const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
            if (!r.ok) continue;
            const m = map(await r.json());
            if (m?.ip) return { ...m, source: name };
        } catch { /* source suivante */ }
    }
    return {};
}

// Les candidats ICE exposaient autrefois l'IP locale ; les navigateurs modernes la masquent en <uuid>.local (mDNS)
function webrtcIPs() {
    return new Promise((done) => {
        if (!window.RTCPeerConnection) return done(null);
        const ips = new Set();
        let pc, finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            try { pc.close(); } catch { /* déjà fermé */ }
            done(ips.size ? [...ips].join(', ') : null);
        };
        try {
            pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
            pc.createDataChannel('');
            pc.onicecandidate = (e) => {
                if (!e.candidate) return finish();
                const addr = e.candidate.candidate.split(' ')[4];
                if (addr) ips.add(addr);
            };
            pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(finish);
            setTimeout(finish, 3000);
        } catch { finish(); }
    });
}

async function collectNetwork() {
    const [ip, rtc] = await Promise.all([getIP(), webrtcIPs()]);
    const c = navigator.connection;
    F.ip = ip;
    return [
        ['net.ip', ip.ip, `fetch('${ip.source || 'api'}')`, true],
        ['net.ipv', ip.version, 'src.api'],
        ['net.isp', ip.isp, 'src.whois'],
        ['net.asn', ip.asn, 'src.whois'],
        ['net.loc', [ip.city, ip.region, ip.country].filter(Boolean).join(', '), 'src.geoip'],
        ['net.postal', ip.postal, 'src.geoip'],
        ['net.coords', ip.lat != null ? `${ip.lat}, ${ip.lon}` : null, 'src.geoip'],
        ['net.iptz', ip.tz, 'src.geoip'],
        ['net.rtc', rtc, 'RTCPeerConnection.onicecandidate'],
        ['net.type', c?.effectiveType, 'navigator.connection.effectiveType'],
        ['net.down', c?.downlink ? `${c.downlink} Mb/s` : null, 'navigator.connection.downlink'],
        ['net.rtt', c?.rtt != null ? `${c.rtt} ms` : null, 'navigator.connection.rtt'],
        ['net.save', c?.saveData, 'navigator.connection.saveData'],
        ['net.online', () => navigator.onLine, 'navigator.onLine'],
    ];
}

/* ── 02 Lieu & temps ── */
function collectLocale() {
    const ro = Intl.DateTimeFormat().resolvedOptions();
    const now = new Date();
    const off = -now.getTimezoneOffset();
    const y = now.getFullYear();
    const jan = new Date(y, 0, 1).getTimezoneOffset(), jul = new Date(y, 6, 1).getTimezoneOffset();
    const hc = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle;
    const sign = off >= 0 ? '+' : '-';
    F.tz = ro.timeZone;
    F.lang = navigator.language;
    return [
        ['loc.tz', ro.timeZone, 'Intl…resolvedOptions().timeZone', true],
        ['loc.utc', `UTC${sign}${String(Math.floor(Math.abs(off) / 60)).padStart(2, '0')}:${String(Math.abs(off) % 60).padStart(2, '0')}`, 'Date.getTimezoneOffset()'],
        ['loc.dst', jan !== jul && now.getTimezoneOffset() === Math.min(jan, jul), 'src.dst'],
        ['loc.now', () => new Date().toLocaleString(), 'new Date()'],
        ['loc.lang', navigator.language, 'navigator.language'],
        ['loc.langs', navigator.languages?.join(', '), 'navigator.languages'],
        ['loc.locale', ro.locale, 'Intl…resolvedOptions().locale'],
        ['loc.date', new Date(y, 11, 31).toLocaleDateString(), 'toLocaleDateString()'],
        ['loc.num', (1234567.89).toLocaleString(), 'Number.toLocaleString()'],
        ['loc.clock', () => t(hc === 'h23' || hc === 'h24' ? 'v.h24' : 'v.h12'), 'Intl hourCycle'],
        ['loc.cal', ro.calendar, 'Intl…resolvedOptions().calendar'],
        ['loc.numsys', ro.numberingSystem, 'Intl…resolvedOptions().numberingSystem'],
    ];
}

/* ── 03 Navigateur ── */
function parseBrowser(ua) {
    const rules = [
        ['Edge', /Edg\/([\d.]+)/], ['Opera', /OPR\/([\d.]+)/], ['Vivaldi', /Vivaldi\/([\d.]+)/],
        ['Samsung Internet', /SamsungBrowser\/([\d.]+)/], ['Firefox', /Firefox\/([\d.]+)/],
        ['Chrome', /Chrome\/([\d.]+)/], ['Safari', /Version\/([\d.]+).*Safari/],
    ];
    for (const [name, re] of rules) {
        const m = ua.match(re);
        if (m) return `${name} ${m[1]}`;
    }
    return null;
}

function detectAdblock() {
    return new Promise((done) => {
        const bait = document.createElement('div');
        bait.className = 'ad ads adsbox ad-banner doubleclick pub_300x250 textads';
        bait.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;';
        bait.textContent = ' ';
        document.body.append(bait);
        setTimeout(() => {
            const hidden = bait.offsetHeight === 0 || getComputedStyle(bait).display === 'none';
            bait.remove();
            done(hidden);
        }, 150);
    });
}

async function collectBrowser() {
    const ua = navigator.userAgent;
    const uad = navigator.userAgentData;
    let he = {};
    try {
        he = await withTimeout(uad?.getHighEntropyValues(['architecture', 'bitness', 'model', 'platformVersion', 'fullVersionList']) ?? Promise.resolve({}), 1000, {});
    } catch { /* Client Hints indisponibles */ }
    F.he = he;
    const isBrave = await withTimeout(navigator.brave?.isBrave?.() ?? Promise.resolve(false), 500, false);
    let browser = parseBrowser(ua);
    if (isBrave && browser) browser = browser.replace('Chrome', 'Brave');
    const full = he.fullVersionList?.filter((b) => !/Not.?A.?Brand|Chromium/i.test(b.brand)).map((b) => `${b.brand} ${b.version}`).join(', ');
    const engine = 'MozAppearance' in document.documentElement.style ? 'Gecko'
        : /AppleWebKit/.test(ua) && !/Chrome/.test(ua) ? 'WebKit' : 'Blink';
    const adblock = await detectAdblock();
    F.browser = browser; F.adblock = adblock; F.engine = engine;
    F.dnt = navigator.doNotTrack === '1'; F.gpc = navigator.globalPrivacyControl === true;
    F.webdriver = navigator.webdriver; F.referrer = document.referrer;
    return [
        ['br.name', browser, 'src.uaparse', true],
        ['br.full', full, 'userAgentData.getHighEntropyValues()'],
        ['br.engine', engine, 'src.css'],
        ['br.ua', ua, 'navigator.userAgent'],
        ['br.cookies', navigator.cookieEnabled, 'navigator.cookieEnabled'],
        ['br.dnt', navigator.doNotTrack === '1' ? true : navigator.doNotTrack == null ? null : false, 'navigator.doNotTrack'],
        ['br.gpc', navigator.globalPrivacyControl, 'navigator.globalPrivacyControl'],
        ['br.adblock', adblock, 'src.bait'],
        ['br.pdf', navigator.pdfViewerEnabled, 'navigator.pdfViewerEnabled'],
        ['br.bot', navigator.webdriver, 'navigator.webdriver'],
        ['br.plugins', navigator.plugins?.length, 'navigator.plugins.length'],
        ['br.ref', () => document.referrer || t('v.direct'), 'document.referrer'],
        ['br.hist', history.length, 'history.length'],
    ];
}

/* ── 04 Machine ── */
function guessOS(ua, uad, he) {
    const p = uad?.platform || navigator.platform || '';
    if (/Android/i.test(ua)) return 'Android ' + (ua.match(/Android ([\d.]+)/)?.[1] ?? '');
    if (/iPhone|iPad|iPod/.test(ua) || (p === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iOS / iPadOS ' + (ua.match(/OS ([\d_]+)/)?.[1]?.replace(/_/g, '.') ?? '');
    if (/Win/i.test(p)) return he.platformVersion ? (parseInt(he.platformVersion) >= 13 ? 'Windows 11' : 'Windows 10') : 'Windows';
    if (/Mac/i.test(p)) return 'macOS ' + (he.platformVersion ?? '');
    if (/CrOS/.test(ua)) return 'ChromeOS';
    if (/Linux/i.test(p)) return 'Linux' + (/x86_64|amd64/.test(ua) ? ' x86_64' : /aarch64|arm/.test(ua) ? ' ARM' : '');
    return p || null;
}

function webgl() {
    try {
        const c = document.createElement('canvas');
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        if (!gl) return {};
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        return {
            vendor: gl.getParameter(dbg ? dbg.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
            renderer: gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
            maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
            exts: gl.getSupportedExtensions() || [],
        };
    } catch { return {}; }
}

async function collectHardware() {
    const ua = navigator.userAgent;
    const he = F.he || {};
    const gl = webgl();
    const dm = navigator.deviceMemory;
    F.gl = gl;
    F.os = guessOS(ua, navigator.userAgentData, he);
    F.cores = navigator.hardwareConcurrency;
    F.touch = navigator.maxTouchPoints;

    let gpu = null;
    try {
        const a = await withTimeout(navigator.gpu?.requestAdapter() ?? Promise.resolve(null), 1500);
        if (a?.info) gpu = [a.info.vendor, a.info.architecture].filter(Boolean).join(' / ') || null;
    } catch { /* WebGPU indisponible */ }

    let battery = null;
    try {
        const b = await withTimeout(navigator.getBattery?.() ?? Promise.resolve(null), 1000);
        if (b) {
            F.battery = { level: Math.round(b.level * 100), charging: b.charging };
            battery = () => `${Math.round(b.level * 100)} % — ${t(b.charging ? 'v.charging' : 'v.onbattery')}`;
        }
    } catch { /* API retirée hors Chromium */ }

    let media = null;
    try {
        const devs = await withTimeout(navigator.mediaDevices?.enumerateDevices() ?? Promise.resolve([]), 1000, []);
        const n = (k) => devs.filter((d) => d.kind === k).length;
        if (devs.length) media = () => tf('v.media', { c: n('videoinput'), m: n('audioinput'), o: n('audiooutput') });
    } catch { /* refusé */ }

    return [
        ['hw.os', F.os, 'userAgentData.platform + UA', true],
        ['hw.arch', [he.architecture, he.bitness].filter(Boolean).length ? () => [he.architecture, he.bitness && `${he.bitness} ${t('v.bits')}`].filter(Boolean).join(' ') : null, 'getHighEntropyValues()'],
        ['hw.model', he.model, 'getHighEntropyValues().model'],
        ['hw.cpu', navigator.hardwareConcurrency, 'navigator.hardwareConcurrency'],
        ['hw.ram', dm ? () => tf('v.ram', { n: dm }) : null, 'navigator.deviceMemory'],
        ['hw.gpu', gl.renderer, 'WEBGL_debug_renderer_info', true],
        ['hw.gpuv', gl.vendor, 'UNMASKED_VENDOR_WEBGL'],
        ['hw.webgpu', gpu, 'navigator.gpu.requestAdapter().info'],
        ['hw.tex', gl.maxTex ? `${gl.maxTex} px` : null, 'gl.MAX_TEXTURE_SIZE'],
        ['hw.touch', navigator.maxTouchPoints, 'navigator.maxTouchPoints'],
        ['hw.batt', battery, 'navigator.getBattery()'],
        ['hw.media', media, 'mediaDevices.enumerateDevices()'],
        ['hw.pads', () => [...(navigator.getGamepads?.() ?? [])].filter(Boolean).length, 'navigator.getGamepads()'],
    ];
}

/* ── 05 Écran ── */
function collectScreen() {
    const s = screen, dpr = devicePixelRatio;
    const gamut = mq('(color-gamut: rec2020)') ? 'Rec. 2020' : mq('(color-gamut: p3)') ? 'Display P3' : mq('(color-gamut: srgb)') ? 'sRGB' : null;
    const hover = mq('(hover: hover)');
    F.screen = { w: s.width, h: s.height, dpr };
    F.dark = mq('(prefers-color-scheme: dark)');
    F.coarse = mq('(pointer: coarse)');
    F.extended = s.isExtended;
    return [
        ['scr.res', `${s.width} × ${s.height}`, 'screen.width / height', true],
        ['scr.phys', `${Math.round(s.width * dpr)} × ${Math.round(s.height * dpr)}`, 'screen × devicePixelRatio'],
        ['scr.dpr', `×${+dpr.toFixed(2)}`, 'window.devicePixelRatio'],
        ['scr.avail', `${s.availWidth} × ${s.availHeight}`, 'screen.availWidth / availHeight'],
        ['scr.bar', `${s.width - s.availWidth} × ${s.height - s.availHeight} px`, 'screen − availScreen'],
        ['scr.win', () => `${outerWidth} × ${outerHeight}`, 'window.outerWidth / outerHeight'],
        ['scr.vp', () => `${innerWidth} × ${innerHeight}`, 'window.innerWidth / innerHeight'],
        ['scr.pos', () => `x ${screenX}, y ${screenY}`, 'window.screenX / screenY'],
        ['scr.depth', () => `${s.colorDepth} ${t('v.bits')}`, 'screen.colorDepth'],
        ['scr.gamut', gamut, '@media (color-gamut)'],
        ['scr.hdr', mq('(dynamic-range: high)'), '@media (dynamic-range: high)'],
        ['scr.orient', () => s.orientation?.type, 'screen.orientation.type'],
        ['scr.multi', s.isExtended, 'screen.isExtended'],
        ['scr.theme', () => t(F.dark ? 'v.dark' : 'v.light'), '@media (prefers-color-scheme)'],
        ['scr.motion', mq('(prefers-reduced-motion: reduce)'), '@media (prefers-reduced-motion)'],
        ['scr.pointer', () => t(F.coarse ? 'v.ptrCoarse' : 'v.ptrFine') + (hover ? t('v.hover') : ''), '@media (pointer) / (hover)'],
    ];
}

/* ── 06 Stockage & permissions ── */
async function collectStorage() {
    const rows = [];
    const gb = (b) => () => `${(b / 1024 ** 3).toFixed(1)} ${t('v.gb')}`;
    try {
        const { quota, usage } = await navigator.storage.estimate();
        rows.push(['sto.quota', gb(quota), 'navigator.storage.estimate()']);
        // Chromium accorde ~60 % du disque libre à une origine : le quota trahit la place disponible
        if (F.engine === 'Blink') rows.push(['sto.disk', gb(quota / 0.6), 'src.disk']);
        rows.push(['sto.used', () => `${(usage / 1024).toFixed(1)} ${t('v.kb')}`, 'navigator.storage.estimate()']);
    } catch { rows.push(['sto.quota', null, 'navigator.storage.estimate()']); }

    const ok = (fn) => { try { return !!fn(); } catch { return false; } };
    rows.push(
        ['sto.ls', ok(() => { localStorage.setItem('_t', 1); localStorage.removeItem('_t'); return true; }), 'window.localStorage'],
        ['sto.idb', ok(() => window.indexedDB), 'window.indexedDB'],
        ['sto.sw', 'serviceWorker' in navigator, 'navigator.serviceWorker'],
        ['sto.cookies', document.cookie ? document.cookie.split(';').length : 0, 'document.cookie'],
    );

    for (const name of ['geolocation', 'camera', 'microphone', 'notifications', 'clipboard-read']) {
        let state = null;
        try { state = (await navigator.permissions.query({ name })).state; } catch { /* non supporté */ }
        rows.push([`sto.perm.${name}`, state ? () => t(`v.${state}`) : null, `permissions.query({name:'${name}'})`]);
    }
    return rows;
}

/* ── 07 Empreinte ── */
function canvasFP() {
    const c = document.createElement('canvas');
    c.width = 280; c.height = 60;
    const x = c.getContext('2d');
    x.textBaseline = 'top';
    x.fillStyle = '#f60'; x.fillRect(120, 4, 70, 26);
    x.font = '15px Arial'; x.fillStyle = '#069'; x.fillText('yatoub.dev 😃 <canvas> ∑', 4, 6);
    x.font = '17px "Times New Roman"'; x.fillStyle = 'rgba(102,204,0,.7)'; x.fillText('Cwm fjordbank glyphs vext quiz', 6, 30);
    x.globalCompositeOperation = 'multiply';
    for (const [col, cx] of [['#f0f', 230], ['#0ff', 250], ['#ff0', 240]]) {
        x.fillStyle = col; x.beginPath(); x.arc(cx, cx === 240 ? 40 : 25, 16, 0, Math.PI * 2); x.fill();
    }
    const url = c.toDataURL();
    return { url, hash: hash(url) };
}

async function audioFP() {
    const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AC) return null;
    try {
        const ctx = new AC(1, 5000, 44100);
        const o = ctx.createOscillator();
        o.type = 'triangle'; o.frequency.value = 10000;
        const comp = ctx.createDynamicsCompressor();
        for (const [k, v] of [['threshold', -50], ['knee', 40], ['ratio', 12], ['attack', 0], ['release', 0.25]]) comp[k].value = v;
        o.connect(comp); comp.connect(ctx.destination); o.start(0);
        const buf = await withTimeout(ctx.startRendering(), 1500);
        if (!buf) return null;
        const d = buf.getChannelData(0);
        let sum = 0;
        for (let i = 4500; i < 5000; i++) sum += Math.abs(d[i]);
        return sum.toFixed(10);
    } catch { return null; }
}

// Les polices installées changent la largeur d'un texte par rapport à la police de repli
function detectFonts() {
    const list = ['Arial', 'Helvetica', 'Helvetica Neue', 'Times New Roman', 'Courier New', 'Verdana', 'Georgia',
        'Comic Sans MS', 'Impact', 'Trebuchet MS', 'Segoe UI', 'Calibri', 'Cambria', 'Consolas', 'Tahoma',
        'Lucida Console', 'SF Pro Text', 'Menlo', 'Monaco', 'Avenir', 'Ubuntu', 'Cantarell', 'DejaVu Sans',
        'Liberation Sans', 'Noto Sans', 'Fira Code', 'Fira Sans', 'Source Code Pro', 'Roboto', 'Open Sans',
        'Hack', 'Inter', 'Cascadia Code', 'Iosevka', 'JetBrainsMono Nerd Font', 'FiraCode Nerd Font',
        'Hack Nerd Font', 'Noto Color Emoji', 'Noto Sans CJK JP', 'Adobe Garamond Pro', 'Wingdings'];
    const x = document.createElement('canvas').getContext('2d');
    const probe = 'mmmmmmmmmmlliWW@#0O';
    const bases = ['monospace', 'sans-serif', 'serif'];
    const ref = bases.map((b) => { x.font = `72px ${b}`; return x.measureText(probe).width; });
    return list.filter((f) => bases.some((b, i) => { x.font = `72px "${f}", ${b}`; return x.measureText(probe).width !== ref[i]; }));
}

async function collectFingerprint() {
    const cv = canvasFP();
    const audio = await audioFP();
    const fonts = detectFonts();
    const gl = F.gl || {};
    const img = new Image();
    img.src = cv.url; img.alt = 'canvas'; img.width = 280; img.height = 60;
    const tags = document.createElement('div');
    tags.className = 'tags';
    for (const f of fonts) {
        const tag = document.createElement('span');
        tag.className = 'stag' + (/Nerd|Code|Mono|Hack|Iosevka/.test(f) ? ' highlight' : '');
        tag.textContent = f;
        tags.append(tag);
    }
    F.fonts = fonts;
    F.fp = { canvas: cv.hash, audio, webgl: hash(gl.renderer + gl.exts?.join()) };
    return [
        ['fp.canvas', img, 'canvas.toDataURL()'],
        ['fp.chash', cv.hash, 'hash(toDataURL())', true],
        ['fp.ghash', F.fp.webgl, 'hash(renderer + extensions)'],
        ['fp.exts', gl.exts?.length, 'gl.getSupportedExtensions()'],
        ['fp.audio', audio, 'OfflineAudioContext + compressor'],
        ['fp.fonts', fonts.length ? tags : null, `canvas.measureText() → ${fonts.length}`],
    ];
}

/* ── 08 Comportement (live) ── */
function collectBehavior() {
    const B = { x: null, y: null, dist: 0, clicks: 0, keys: 0, last: null, scroll: 0, hidden: 0, sel: '', copied: 0, idle: performance.now() };
    let px = null, py = null;
    addEventListener('mousemove', (e) => {
        if (px != null) B.dist += Math.hypot(e.clientX - px, e.clientY - py);
        px = B.x = e.clientX; py = B.y = e.clientY; B.idle = performance.now();
    }, { passive: true });
    addEventListener('click', () => { B.clicks++; B.idle = performance.now(); });
    addEventListener('keydown', (e) => { B.keys++; B.last = e.key; B.idle = performance.now(); });
    addEventListener('scroll', () => {
        const max = document.documentElement.scrollHeight - innerHeight;
        B.scroll = Math.max(B.scroll, max > 0 ? Math.round((scrollY / max) * 100) : 100);
        B.idle = performance.now();
    }, { passive: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) B.hidden++; });
    document.addEventListener('selectionchange', () => { B.sel = String(getSelection()).slice(0, 80); });
    document.addEventListener('copy', () => B.copied++);
    const dur = (ms) => `${Math.floor(ms / 60000)}m ${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}s`;
    return [
        ['beh.time', () => dur(performance.now() - T0), 'performance.now()', true],
        ['beh.mouse', () => B.x == null ? null : `x ${B.x}, y ${B.y}`, 'mousemove'],
        ['beh.dist', () => `${Math.round(B.dist)} px`, 'Σ mousemove'],
        ['beh.clicks', () => B.clicks, 'click'],
        ['beh.keys', () => B.keys, 'keydown'],
        ['beh.last', () => B.last, 'keydown → event.key'],
        ['beh.scroll', () => `${B.scroll} %`, 'scroll'],
        ['beh.sel', () => B.sel || null, 'selectionchange'],
        ['beh.copy', () => B.copied, 'copy'],
        ['beh.hidden', () => tf('v.times', { n: B.hidden }), 'visibilitychange'],
        ['beh.focus', () => document.hasFocus(), 'document.hasFocus()'],
        ['beh.idle', () => dur(performance.now() - B.idle), 'src.idle'],
    ];
}

/* ── Géolocalisation précise (seule action qui demande une permission) ── */
function addGeoButton(card) {
    const foot = document.createElement('div');
    foot.className = 'card-foot';
    const btn = i18nEl('button', 'geo.btn', 'btn-nav');
    btn.type = 'button';
    const hint = i18nEl('span', 'geo.hint', 'hint');
    foot.append(btn, hint);
    card.append(foot);
    btn.addEventListener('click', () => {
        hint.dataset.i18n = 'geo.wait';
        hint.textContent = t('geo.wait');
        navigator.geolocation.getCurrentPosition((p) => {
            const { latitude: la, longitude: lo, accuracy } = p.coords;
            const a = document.createElement('a');
            a.href = `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=17/${la}/${lo}`;
            a.target = '_blank'; a.rel = 'noopener';
            a.textContent = `${la.toFixed(5)}, ${lo.toFixed(5)} (±${Math.round(accuracy)} m) ↗`;
            delete hint.dataset.i18n;  // contenu non traduisible : applyLang ne doit plus l'écraser
            hint.replaceChildren(a);
            F.gps = `${la}, ${lo} ±${Math.round(accuracy)}m`;
            log(`geolocation → ±${Math.round(accuracy)} m`, 'ok');
        }, (e) => {
            delete hint.dataset.i18n;
            hint.textContent = tf('geo.denied', { e: e.message || e.code });
        }, { enableHighAccuracy: true, timeout: 15000 });
    });
}

/* ═══════════ DÉDUCTIONS ═══════════ */
function deductions() {
    const out = [];
    const ip = F.ip || {};
    const say = (key, vars = {}, warn = false) => out.push([tf(`ded.${key}`, vars, true), warn]);

    const small = Math.min(F.screen.w, F.screen.h);
    const device = F.coarse && F.touch > 0 ? (small < 600 ? 'phone' : 'tablet') : F.touch > 0 ? 'touchComputer' : 'computer';
    say('device', { device: t(`ded.${device}`), os: F.os ?? '?', browser: F.browser ?? '?' });

    if (ip.city) say('where', { city: ip.city, country: ip.country, isp: ip.isp ?? '?' });
    if (ip.tz && F.tz && ip.tz !== F.tz) say('vpn', { iptz: ip.tz, tz: F.tz }, true);
    else if (ip.tz) say('novpn');
    if (ip.cc && F.lang && !F.lang.toUpperCase().includes(ip.cc) && !F.lang.startsWith(ip.cc.toLowerCase())) {
        say('langMismatch', { lang: F.lang, cc: ip.cc }, true);
    }

    const now = new Date();
    const time = now.toLocaleTimeString(currentLang, { hour: '2-digit', minute: '2-digit' });
    say(now.getHours() < 6 ? 'late' : 'hour', { time }, now.getHours() < 6);

    if (F.dark) say('dark');
    if (/Linux/.test(F.os) && !/Android/.test(F.os)) say('linux');
    if (F.fonts?.some((f) => /Nerd|Fira Code|Cascadia|Iosevka|Hack|Source Code/.test(f))) say('devfonts');
    if (F.cores >= 12) say('cores', { n: F.cores });
    if (F.screen.dpr >= 2) say('hidpi');
    if (F.extended) say('multi');
    if (F.battery) say(F.battery.charging ? 'plugged' : 'battery', { n: F.battery.level }, !F.battery.charging && F.battery.level < 20);
    if (F.adblock) say('adblock');
    if (F.dnt || F.gpc) say('dnt');
    if (F.webdriver) say('bot', {}, true);
    if (F.referrer) say('ref', { host: new URL(F.referrer).hostname });

    say('id', { id: F.id }, true);
    return out;
}

let deduceCard = null;
function renderDeductions(animate = true) {
    const ul = document.createElement('ul');
    ul.className = 'deduce';
    const old = deduceCard.querySelector('.deduce, .scanning');
    old.replaceWith(ul);
    const lines = deductions();
    const count = deduceCard.querySelector('.card-count');
    count.querySelector('.n').textContent = lines.length;
    if (!count.querySelector('[data-i18n]')) count.append(i18nEl('span', 'unit.conclusions'));
    lines.forEach(([html, warn], i) => {
        const li = document.createElement('li');
        if (warn) li.className = 'warn';
        li.innerHTML = html;  // gabarits statiques de translations.js + variables échappées par tf(…, true)
        ul.append(li);
        if (animate) setTimeout(() => li.classList.add('in'), 250 * i);
        else li.classList.add('in');
    });
}

/* ═══════════ ORCHESTRATION ═══════════ */
const SECTIONS = [
    { id: 'net', file: 'network.sh', desc: true, run: collectNetwork },
    { id: 'loc', file: 'locale.sh', desc: true, run: collectLocale, geo: true },
    { id: 'br', file: 'browser.sh', run: collectBrowser },
    { id: 'hw', file: 'hardware.sh', desc: true, after: ['br'], run: collectHardware },
    { id: 'scr', file: 'display.sh', run: collectScreen },
    { id: 'sto', file: 'storage.sh', after: ['br'], run: collectStorage },
    { id: 'fp', file: 'fingerprint.sh', desc: true, after: ['hw'], run: collectFingerprint },
    { id: 'beh', file: 'behavior.sh --follow', desc: true, live: true, run: collectBehavior },
];

async function main() {
    log('whoami --verbose');
    log(`target: ${location.host || 'file://'}`);
    let n = 0;
    for (const s of SECTIONS) {
        s.card = makeCard($(s.live ? '#cardsLive' : '#cards'), { ...s, idx: String(++n).padStart(2, '0') });
    }
    deduceCard = makeCard($('#cardsLive'), { id: 'ded', file: 'profile.sh', idx: String(++n).padStart(2, '0') });

    // Collecteurs lancés en parallèle ; `after` attend les sections dont on réutilise les faits (Client Hints, WebGL)
    const jobs = {};
    for (const s of SECTIONS.filter((x) => !x.live)) {
        jobs[s.id] = Promise.all((s.after || []).map((k) => jobs[k])).then(async () => {
            try {
                s.rows = await s.run();
                fillCard(s.card, s.rows);
                if (s.geo) addGeoButton(s.card);
                log(`${s.file.padEnd(15)} ${s.rows.length} ${t('log.signals')}`, 'ok');
            } catch (e) {
                s.card.querySelector('.scanning')?.replaceChildren(document.createTextNode(`${t('log.error')} : ${e.message}`));
                log(`${s.file} → ${e.message}`, 'warn');
            }
        });
    }
    await Promise.all(Object.values(jobs));

    const beh = SECTIONS.find((x) => x.live);
    beh.rows = beh.run();
    fillCard(beh.card, beh.rows);

    // Uniquement des signaux stables d'une visite à l'autre (pas de taille de fenêtre, batterie, referrer…)
    F.id = hash(JSON.stringify([navigator.userAgent, navigator.languages, navigator.hardwareConcurrency, navigator.deviceMemory,
        F.tz, F.gl?.renderer, screen.width, screen.height, screen.colorDepth, devicePixelRatio, F.fp, F.fonts]))
        .toUpperCase().match(/.{1,4}/g).join('-');
    $('#statId').textContent = F.id;
    scanDone = true;
    renderDeductions();

    const dt = ((performance.now() - T0) / 1000).toFixed(2);
    $('#statTime').textContent = dt + 's';
    $('#statusText').textContent = 'SCAN COMPLETE';
    $('#statusDot').classList.add('done');
    log(tf('log.done', { n: signals, t: dt }), 'ok');
    log(`fingerprint = ${F.id}`, 'ok');

    setInterval(() => refreshRows(true), 500);
}

/* ── Export (dans la langue affichée) ── */
function snapshot() {
    const out = { url: location.href, date: new Date().toISOString(), lang: currentLang, fingerprint: F.id };
    for (const s of SECTIONS) {
        if (!s.rows) continue;
        out[t(`card.${s.id}.title`)] = Object.fromEntries(s.rows.map(([k, v]) => [t(k), exportable(v)]));
    }
    if (F.gps) out.gps = F.gps;
    return JSON.stringify(out, null, 2);
}

function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.append(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 1800);
}

$('#exportBtn').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([snapshot()], { type: 'application/json' }));
    a.download = `whoami-${F.id || 'scan'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#copyBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(snapshot()); toast(t('toast.copied')); }
    catch { toast(t('toast.fail')); }
});
$('#langToggle').addEventListener('click', () => {
    applyLang(currentLang === 'en' ? 'fr' : 'en');
});

applyLang(currentLang);
main();

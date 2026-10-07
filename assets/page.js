/* ═══════════════════════════════════════════
   YATOUB // PAGE — shared helpers for standalone pages
   Language detection and switching, string lookup, element
   builder. Expects a global `translations` ({ fr, en }) and the
   #langToggle / #langLabel pair of the navbar.
   Same mechanics as the portfolio, same localStorage 'lang' key.
   ═══════════════════════════════════════════ */

const Page = (() => {
    const $ = (s) => document.querySelector(s);

    function detectLang() {
        let saved = null;
        try { saved = localStorage.getItem('lang'); } catch { /* stockage bloqué */ }
        if (saved === 'en' || saved === 'fr') return saved;
        return navigator.language?.startsWith('fr') ? 'fr' : 'en';
    }
    let lang = detectLang();
    let onChange = () => {};

    // Own entries only: a key such as "constructor" must not resolve to Object internals
    function t(key) {
        const value = key.split('.').reduce((obj, k) => (obj && Object.hasOwn(obj, k) ? obj[k] : undefined), translations[lang]);
        return value ?? key;
    }
    const has = (key) => t(key) !== key;
    const tf = (key, vars = {}) => String(t(key)).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

    function apply(next) {
        lang = next;
        document.documentElement.lang = lang;
        try { localStorage.setItem('lang', lang); } catch { /* stockage bloqué */ }
        document.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = t(node.dataset.i18n); });
        $('#langLabel').textContent = lang === 'en' ? 'FR' : 'EN';
        onChange();
    }

    // render: called now and after every language switch
    function init(render = () => {}) {
        onChange = render;
        apply(lang);
        $('#langToggle').addEventListener('click', () => apply(lang === 'en' ? 'fr' : 'en'));
    }

    // Text always goes through textContent: pages show data that comes from the network
    function el(tag, cls, text) {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    const num = (n, opts) => Number(n).toLocaleString(lang, opts);

    return { $, t, tf, has, el, num, init, get lang() { return lang; } };
})();

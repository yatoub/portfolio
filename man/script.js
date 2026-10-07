/* ═══════════════════════════════════════════
   YATOUB // MAN — page script
   Renders the list of pages of core.js as manual entries.
   ═══════════════════════════════════════════ */

'use strict';

const { $, t, el } = Page;

function render() {
    const commands = ManCore.PAGES.flatMap((page) => {
        const term = el('dt', 'mn-term');
        const link = el('a', '', page.id);
        link.href = page.href;
        term.append(link, `(${page.section})`);
        if (page.restricted) term.append(el('span', 'pg-tag', t('restricted')));

        const def = el('dd', 'mn-def');
        def.append(el('code', 'mn-cmd', `$ ${page.synopsis}`), el('p', '', t(`pages.${page.id}`)));
        return [term, def];
    });
    $('#commands').replaceChildren(...commands);

    const files = ManCore.FILES.flatMap((file) => {
        const term = el('dt', 'mn-term');
        const link = el('a', '', file.path);
        link.href = file.path;
        term.append(link);
        return [term, el('dd', 'mn-def', t(`files.${file.id}`))];
    });
    $('#files').replaceChildren(...files);

    $('.mn-syn em').textContent = Page.lang === 'fr' ? 'commande' : 'command';
    $('#buildDate').textContent = new Date(document.lastModified).toLocaleDateString(Page.lang, { year: 'numeric', month: 'long', day: 'numeric' });
}

Page.init(render);

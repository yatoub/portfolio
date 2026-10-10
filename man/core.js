/* ═══════════════════════════════════════════
   YATOUB // MAN — the site's pages, as manual entries
   Single list of standalone pages: tools/pages.test.mjs checks it
   against sitemap.xml, so a new page cannot be forgotten here.
   ═══════════════════════════════════════════ */

const ManCore = (() => {
    // section: 1 user commands · 8 administration — as in man(1)
    // synopsis: the command the page is named after, shown as typed
    const PAGES = [
        { id: 'whoami', section: 1, href: '/whoami/', synopsis: 'whoami --verbose' },
        { id: 'tcpdump', section: 8, href: '/tcpdump/', synopsis: 'tcpdump -i any -tttt host yatoub.dev' },
        { id: 'traceroute', section: 8, href: '/traceroute/', synopsis: 'traceroute yatoub.dev' },
        { id: 'ping', section: 8, href: '/ping/', synopsis: 'ping -c 10 yatoub.dev' },
        { id: 'dig', section: 1, href: '/dig/', synopsis: 'dig +noall +answer yatoub.dev' },
        { id: 'curl', section: 1, href: '/curl/', synopsis: 'curl -I https://yatoub.dev' },
        { id: 'ipcalc', section: 1, href: '/ipcalc/', synopsis: 'ipcalc 203.0.113.7/24' },
        { id: 'nc', section: 1, href: '/nc/', synopsis: 'nc yatoub.dev 80' },
        { id: 'xxd', section: 1, href: '/xxd/', synopsis: 'tcpdump -c 1 -w - host yatoub.dev | xxd' },
        { id: 'nft', section: 8, href: '/nft/', synopsis: 'nft -f /etc/nftables.conf' },
        { id: 'tail', section: 1, href: '/tail/', synopsis: "tail -f /var/log/caddy/access.log | grep ' 404 '" },
        { id: 'status', section: 1, href: '/status/', synopsis: 'systemctl status homelab.target' },
        { id: 'lab', section: 8, href: '/lab', synopsis: 'ls /srv', restricted: true },
    ];

    // Plain files worth reading with curl
    const FILES = [
        { id: 'resume', path: '/curl.txt' },
        { id: 'robots', path: '/robots.txt' },
        { id: 'security', path: '/.well-known/security.txt' },
        { id: 'sitemap', path: '/sitemap.xml' },
        { id: 'homelab', path: '/homelab.json' },
    ];

    const title = (page) => `${page.id}(${page.section})`;

    return { PAGES, FILES, title };
})();

if (typeof module !== 'undefined') module.exports = ManCore;

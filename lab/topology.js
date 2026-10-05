/* ═══════════════════════════════════════════
   YATOUB // LAB — topology diagram
   Infrastructure nodes are fixed ; service nodes, auth mode and VPN flag
   come from /lab/services.json. Roles and flows only: no IP, no VLAN id.
   Depends on /script.js (currentLang, t), topology-core.js and,
   optionally, /status/core.js for the live state dots.
   ═══════════════════════════════════════════ */

(function () {
    const host = document.getElementById('topology');
    if (!host) return;

    const NS = 'http://www.w3.org/2000/svg';
    const W = 1000;
    const INFRA = { w: 160, h: 48 };
    const SVC = { w: 190, h: 36, gap: 12, x: 790 };
    const STEP_MS = 550;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let services = [];
    let states = {};          // id → 'up' | 'down', only when status.json is fresh
    let selected = null;
    let timers = [];

    const tr = (key) => t(`lab.topo.${key}`, currentLang);

    function svg(tag, attrs = {}, text) {
        const node = document.createElementNS(NS, tag);
        for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function html(tag, cls, text) {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    /* ── Layout: every node is { x, y, w, h }, anchored on its sides ── */
    function layout() {
        const colH = services.length * (SVC.h + SVC.gap) - SVC.gap;
        const H = Math.max(colH + 40, 360);
        const mid = H / 2;
        const box = { client: { x: 10, y: mid - 78 }, vpn: { x: 10, y: mid + 30 },
            fw: { x: 215, y: mid - INFRA.h / 2 }, proxy: { x: 420, y: mid - INFRA.h / 2 },
            auth: { x: 420, y: 20 } };
        for (const b of Object.values(box)) Object.assign(b, INFRA);

        const top = (H - colH) / 2;
        services.forEach((s, i) => {
            box[s.id] = { x: SVC.x, y: top + i * (SVC.h + SVC.gap), w: SVC.w, h: SVC.h };
        });
        return { box, H };
    }

    const right = (b, dy = 0) => [b.x + b.w, b.y + b.h / 2 + dy];
    const left = (b, dy = 0) => [b.x, b.y + b.h / 2 + dy];

    function curve([x1, y1], [x2, y2]) {
        const mx = (x1 + x2) / 2;
        return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
    }

    function edgePath(from, to, box) {
        const a = box[from], b = box[to];
        if (from === 'proxy' && to === 'auth') {
            const x = a.x + a.w / 2;
            return `M${x},${a.y} L${x},${b.y + b.h}`;
        }
        // OIDC leg leaves the service from its left side, slightly above the incoming request
        if (to === 'auth') return curve(left(a, -8), right(b));
        if (from === 'proxy') return curve(right(a), left(b, 6));
        return curve(right(a), left(b));
    }

    /* ── Drawing ── */
    function node(id, box, lines, cls) {
        const b = box[id];
        const g = svg('g', { class: `topo-node ${cls || ''}`, 'data-node': id, transform: `translate(${b.x},${b.y})` });
        g.append(svg('rect', { width: b.w, height: b.h, rx: 2 }));
        if (lines[1]) {
            g.append(svg('text', { class: 'topo-name', x: 12, y: 20 }, lines[0]));
            g.append(svg('text', { class: 'topo-sub', x: 12, y: 36 }, lines[1]));
        } else {
            g.append(svg('text', { class: 'topo-name', x: 26, y: b.h / 2 + 4 }, lines[0]));
        }
        return g;
    }

    function draw() {
        const { box, H } = layout();
        const root = svg('svg', { class: 'topo-svg', viewBox: `0 0 ${W} ${H}`, role: 'group' });
        const edges = svg('g');
        const nodes = svg('g');

        const addEdge = (from, to, kind) => edges.append(svg('path', {
            class: `topo-edge ${kind === 'auth' ? 'auth' : ''}`,
            'data-edge': TopologyCore.edgeId(from, to),
            d: edgePath(from, to, box),
        }));

        addEdge('client', 'fw');
        addEdge('vpn', 'fw');
        addEdge('fw', 'proxy');
        addEdge('proxy', 'auth', 'auth');

        ['client', 'vpn', 'fw', 'proxy'].forEach(id => nodes.append(node(id, box, tr(`node.${id}`))));
        nodes.append(node('auth', box, tr('node.auth'), 'auth'));

        services.forEach(s => {
            addEdge('proxy', s.id);
            if (s.auth === 'oidc') addEdge(s.id, 'auth', 'auth');

            const g = node(s.id, box, [s.name], 'topo-svc');
            g.setAttribute('tabindex', '0');
            g.setAttribute('role', 'button');
            g.setAttribute('aria-pressed', 'false');
            g.setAttribute('aria-label', `${s.name} — ${tr(`mode.${s.auth}`)}`);
            g.prepend(svg('title', {}, `${s.name} — ${tr(`mode.${s.auth}`)}`));
            g.append(svg('circle', { class: 'topo-state', cx: 13, cy: SVC.h / 2, r: 4, 'data-state': states[s.id] || 'unknown' }));
            g.addEventListener('click', () => select(s.id, true));
            g.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                select(s.id, true);
            });
            nodes.append(g);
        });

        root.append(edges, nodes);
        host.querySelector('.topo-canvas').replaceChildren(root);
    }

    /* ── Selection: light the path stage by stage ── */
    function select(id, animate) {
        const svc = services.find(s => s.id === id);
        if (!svc) return;
        selected = id;
        timers.forEach(clearTimeout);
        timers = [];

        host.querySelectorAll('.on').forEach(el => el.classList.remove('on'));
        host.querySelectorAll('.topo-svc').forEach(g => {
            const on = g.dataset.node === id;
            g.classList.toggle('selected', on);
            g.setAttribute('aria-pressed', String(on));
        });

        const stages = TopologyCore.route(svc);
        const body = host.querySelector('.topo-panel-body');
        const list = html('ol', 'topo-steps');
        const modes = [tr(`mode.${svc.auth}`)];
        if (svc.vpn) modes.push(tr('mode.vpn'));
        body.replaceChildren(
            html('h3', 'topo-target', svc.name),
            ...modes.map((m, i) => html('span', i === 0 ? 'stag highlight topo-mode' : 'stag topo-mode', m)),
            list,
        );

        stages.forEach((stage, i) => {
            const li = html('li', stage.kind === 'auth' ? 'auth' : '', tr(`step.${stage.step}`).replace('{name}', svc.name));
            list.append(li);

            const light = () => {
                li.classList.add('on');
                if (!stage.edge) return;
                const sel = (v) => `[data-edge="${CSS.escape(v)}"]`;
                host.querySelector(sel(TopologyCore.edgeId(...stage.edge)))?.classList.add('on');
                stage.edge.forEach(n => host.querySelector(`[data-node="${CSS.escape(n)}"]`)?.classList.add('on'));
            };
            if (animate && !reduced) timers.push(setTimeout(light, i * STEP_MS));
            else light();
        });
    }

    function render(animate) {
        host.querySelector('.topo-hint').textContent = tr('hint');
        const legend = host.querySelector('.topo-legend');
        legend.replaceChildren(...[['', 'flow'], ['auth', 'auth'], ['dot up', 'up'], ['dot down', 'down'], ['dot', 'unknown']]
            .map(([cls, key]) => {
                const li = html('li');
                li.append(html('i', cls), html('span', '', tr(`legend.${key}`)));
                return li;
            }));
        draw();
        select(selected || services[0]?.id, animate);
    }

    /* ── Boot ── */
    host.append(html('p', 'topo-hint'));
    const grid = html('div', 'topo-layout');
    const panel = html('aside', 'topo-panel');
    const bar = html('div', 'tc-bar');
    const dots = html('div', 'tc-dots');
    dots.append(html('span', 'tcd red'), html('span', 'tcd yellow'), html('span', 'tcd green'));
    bar.append(dots, html('span', 'tc-title', '~/lab/trace.sh'));
    panel.append(bar, html('div', 'topo-panel-body'));
    panel.setAttribute('aria-live', 'polite');
    grid.append(html('div', 'topo-canvas'), panel);
    host.append(grid, html('ul', 'topo-legend'));

    fetch('/lab/services.json')
        .then(r => r.json())
        .then(data => {
            services = data.filter(s => s.url);
            render(true);
        });

    if (typeof StatusCore !== 'undefined') {
        fetch('/data/status.json', { cache: 'no-store' })
            .then(r => (r.ok ? r.json().then(d => [d, Date.parse(r.headers.get('Date')) || Date.now()]) : Promise.reject()))
            .then(([data, now]) => {
                if (!['up', 'degraded', 'down'].includes(StatusCore.summarize(data, now).state)) return;
                data.services.forEach(s => { states[s.id] = s.state === 'up' ? 'up' : 'down'; });
                host.querySelectorAll('.topo-svc').forEach(g => {
                    g.querySelector('.topo-state').dataset.state = states[g.dataset.node] || 'unknown';
                });
            })
            .catch(() => { /* no data: dots stay grey */ });
    }

    // /script.js switches currentLang in its own click handler (registered on DOMContentLoaded,
    // so after this one): wait for it before redrawing the labels
    document.getElementById('langToggle')?.addEventListener('click', () => setTimeout(() => render(false), 0));
})();

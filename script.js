/* ═══════════════════════════════════════════
   VSG Portfolio — script.js
   ═══════════════════════════════════════════ */

/* ── i18n ── */
const translations = {
    en: {
        nav: { home: 'HOME', about: 'ABOUT', exp: 'EXP', projects: 'PROJECTS', contact: 'CONTACT', lab: 'LAB' },
        hero: { bootok: 'BOOT OK', status: 'AVAILABLE', cta: 'VIEW_PROJECTS' },
        about: {
            title: 'ABOUT',
            bio1: 'Systems integrator with a long-standing passion for technology and infrastructure. Currently working as a Systems Administrator for the French National Education Ministry, managing production environments across the full application stack.',
            bio2: 'When not keeping servers alive, I play CTFs on TryHackMe and HackTheBox — with a focus on OSINT and web exploitation. I also contribute to open source Linux tools, shoot photos, and do sound engineering for live events.',
            skills: { systems: '// SYSTEMS & INFRA', scripting: '// SCRIPTING & DEV', services: '// SERVICES & WEB', monitoring: '// MONITORING' },
            stats: { years: 'YEARS EXP', companies: 'COMPANIES', distros: 'DISTROS DAILY DRIVEN', languages: 'LANGUAGES SPOKEN' },
        },
        exp: {
            title: 'EXPERIENCE',
            en: {
                role: 'Systems Administrator',
                company: 'French National Education Ministry',
                dates: 'DEC 2021 – PRESENT',
                p1: 'Manages production chain across OSI layers 5–7',
                p2a: 'Handles ', p2b: 'configuration, application deployment', p2c: ' and monitoring',
                p3: 'Incident response and data security management',
            },
            lp: {
                role: 'Operations Analyst',
                dates: 'NOV 2020 – NOV 2021',
                p1a: 'Consulting role supporting ', p1b: 'national IT operations', p1c: ' for mail and parcel services',
                p2: 'Maintained critical applications with 24/7 supervision',
            },
            mc: {
                role: 'Linux Technician',
                dates: 'JAN 2018 – APR 2020',
                p1a: 'Deployed ', p1b: 'application infrastructure', p1c: ' and maintained medical data systems',
                p2: 'Managed security updates and feature rollouts',
            },
        },
        projects: {
            title: 'PROJECTS',
            view: 'VIEW →',
            susshi: { desc: 'Terminal SSH manager with YAML inventories, jump hosts, Wallix bastion support, tunnels and SCP. Built for sysadmins who live in the terminal.' },
            tych: { desc: 'Random number generator based on chaos theory — uses the double pendulum system as an entropy source to produce unpredictable sequences.' },
            loki: { desc: 'Local file encryptor using AES-256. Simple CLI tool to encrypt and decrypt files on disk.' },
            prometheus: { desc: 'Ansible playbook to deploy a full Prometheus + Grafana monitoring stack. Ready-to-use dashboards, ideal for POCs.' },
            check3tier: { desc: 'Ansible playbook to audit multiple RedHat Linux machines against a technical specification sheet.' },
            log4j: { desc: 'Shell script to detect Log4Shell (CVE-2021-44228) exposure on a server by checking installed package versions.' },
            opensiren: { desc: 'OSINT tool for gathering public information on French companies using the SIRENE open data API.' },
            resumeterminal: { desc: 'Resume displayed as an interactive terminal. Type commands to navigate through the CV sections.' },
        },
        contact: {
            title: 'CONTACT',
            h1: "LET'S BUILD", h2: 'SOMETHING', h3: 'REAL.',
            sub: 'Interested in systems, infrastructure, or security? Open to new opportunities and collaborations.',
        },
        lab: {
            title: 'PRIVATE SERVICES',
            ha:    { name: 'Home Assistant', desc: 'Home automation dashboard — lights, sensors, automations.' },
            vault: { name: 'Vaultwarden',    desc: 'Self-hosted password manager, Bitwarden-compatible.' },
            open:   'OPEN',
            status: 'ONLINE',
        },
        roles: ['Systems Administrator', 'Infrastructure Engineer', 'Linux Enthusiast', 'DevOps', 'CTF Player'],
        status: ['ONLINE', 'READY', 'AVAILABLE', 'SYS:OK'],
    },

    fr: {
        nav: { home: 'ACCUEIL', about: 'À PROPOS', exp: 'EXP', projects: 'PROJETS', contact: 'CONTACT', lab: 'LAB' },
        hero: { bootok: 'DÉMARRAGE OK', status: 'DISPONIBLE', cta: 'VOIR_PROJETS' },
        about: {
            title: 'À PROPOS',
            bio1: "Intégrateur systèmes passionné de technologie et d'infrastructure depuis toujours. Actuellement Administrateur Systèmes au sein de l'Éducation Nationale, en charge des environnements de production sur l'ensemble de la chaîne applicative.",
            bio2: "Quand je ne maintiens pas des serveurs en vie, je joue à des CTF sur TryHackMe et HackTheBox — avec un focus sur l'OSINT et l'exploitation web. Je contribue aussi à des outils Linux open source, fais de la photo et de la sonorisation pour des événements live.",
            skills: { systems: '// SYSTÈMES & INFRA', scripting: '// SCRIPTING & DEV', services: '// SERVICES & WEB', monitoring: '// SUPERVISION' },
            stats: { years: "ANS D'EXP", companies: 'ENTREPRISES', distros: 'DISTROS AU QUOTIDIEN', languages: 'LANGUES PARLÉES' },
        },
        exp: {
            title: 'EXPÉRIENCE',
            en: {
                role: 'Administrateur Systèmes',
                company: 'Éducation Nationale',
                dates: 'DÉC 2021 – PRÉSENT',
                p1: 'Gestion de la chaîne de production sur les couches OSI 5 à 7',
                p2a: 'Prise en charge de la ', p2b: 'configuration et du déploiement applicatif', p2c: ' et de la supervision',
                p3: 'Gestion des incidents et de la sécurité des données',
            },
            lp: {
                role: 'Analyste Opérations',
                dates: 'NOV 2020 – NOV 2021',
                p1a: 'Mission de conseil au sein des ', p1b: 'opérations IT nationales', p1c: ' pour les services courrier et colis',
                p2: 'Maintien des applications critiques avec supervision 24h/24',
            },
            mc: {
                role: 'Technicien Linux',
                dates: 'JANV 2018 – AVR 2020',
                p1a: "Déploiement d'", p1b: 'infrastructure applicative', p1c: ' et maintenance des systèmes de données médicales',
                p2: 'Gestion des mises à jour de sécurité et des évolutions fonctionnelles',
            },
        },
        projects: {
            title: 'PROJETS',
            view: 'VOIR →',
            susshi: { desc: 'Gestionnaire SSH en terminal avec inventaires YAML, jump hosts, support bastion Wallix, tunnels et SCP. Conçu pour les sysadmins qui vivent dans le terminal.' },
            tych: { desc: "Générateur de nombres aléatoires basé sur la théorie du chaos — utilise le pendule double comme source d'entropie pour produire des séquences imprévisibles." },
            loki: { desc: "Outil de chiffrement de fichiers en AES-256. CLI simple pour chiffrer et déchiffrer des fichiers sur le disque." },
            prometheus: { desc: "Playbook Ansible pour déployer une stack de supervision Prometheus + Grafana. Dashboards prêts à l'emploi, idéal pour des POCs." },
            check3tier: { desc: "Playbook Ansible pour auditer plusieurs machines Linux RedHat par rapport à un cahier des charges technique." },
            log4j: { desc: "Script shell pour détecter l'exposition à Log4Shell (CVE-2021-44228) sur un serveur en vérifiant les versions des paquets installés." },
            opensiren: { desc: "Outil OSINT pour collecter des informations publiques sur des entreprises françaises via l'API open data SIRENE." },
            resumeterminal: { desc: "CV présenté sous forme de terminal interactif. Tapez des commandes pour naviguer dans les sections du CV." },
        },
        contact: {
            title: 'CONTACT',
            h1: 'CONSTRUISONS', h2: 'QUELQUE CHOSE', h3: 'DE RÉEL.',
            sub: "Intéressé par les systèmes, l'infrastructure ou la sécurité ? Ouvert aux nouvelles opportunités et collaborations.",
        },
        lab: {
            title: 'SERVICES PRIVÉS',
            ha:    { name: 'Home Assistant', desc: "Tableau de bord domotique — lumières, capteurs, automatisations." },
            vault: { name: 'Vaultwarden',    desc: "Gestionnaire de mots de passe auto-hébergé, compatible Bitwarden." },
            open:   'OUVRIR',
            status: 'EN LIGNE',
        },
        roles: ['Administrateur Systèmes', 'Ingénieur Infrastructure', 'Passionné Linux', 'DevOps', 'CTF Player'],
        status: ['EN LIGNE', 'PRÊT', 'DISPONIBLE', 'SYS:OK'],
    },
};

function t(key, lang) {
    return key.split('.').reduce((obj, k) => obj?.[k], translations[lang]);
}

function applyLang(lang) {
    document.documentElement.lang = lang;
    localStorage.setItem('lang', lang);

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const val = t(el.dataset.i18n, lang);
        if (val !== undefined) el.textContent = val;
    });

    const label = document.getElementById('langLabel');
    if (label) label.textContent = lang === 'en' ? 'FR' : 'EN';

    roleIndex = 0;
    charIndex = 0;
    deleting = false;
    if (typeEl) typeEl.textContent = '';

    statusIdx = 0;
    if (statusEl) statusEl.textContent = translations[lang].status[0];
}

function detectLang() {
    const saved = localStorage.getItem('lang');
    if (saved === 'en' || saved === 'fr') return saved;
    return navigator.language?.startsWith('fr') ? 'fr' : 'en';
}

let currentLang = detectLang();

/* ── Typewriter ── */
let roleIndex = 0;
let charIndex = 0;
let deleting = false;
const typeEl = document.getElementById('typewriter');

function type() {
    const roles = translations[currentLang].roles;
    const current = roles[roleIndex];
    if (!typeEl) return;

    if (!deleting) {
        typeEl.textContent = current.slice(0, charIndex + 1);
        charIndex++;
        if (charIndex === current.length) {
            setTimeout(() => { deleting = true; }, 2200);
            setTimeout(type, 2400);
            return;
        }
    } else {
        typeEl.textContent = current.slice(0, charIndex - 1);
        charIndex--;
        if (charIndex === 0) {
            deleting = false;
            roleIndex = (roleIndex + 1) % roles.length;
        }
    }
    setTimeout(type, deleting ? 50 : 85);
}

/* ── Hero name reveal ── */
const heroNameEl = document.getElementById('heroName');
const fullName = 'Yatoub';
let nameIndex = 0;

function revealName() {
    if (!heroNameEl) return;
    if (nameIndex <= fullName.length) {
        heroNameEl.textContent = fullName.slice(0, nameIndex);
        nameIndex++;
        setTimeout(revealName, 55);
    } else {
        setTimeout(type, 300);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    applyLang(currentLang);
    setTimeout(revealName, 400);

    document.getElementById('langToggle')?.addEventListener('click', () => {
        currentLang = currentLang === 'en' ? 'fr' : 'en';
        applyLang(currentLang);
    });
});

/* ── Navbar ── */
const menuToggle = document.getElementById('menuToggle');
const navMenu = document.getElementById('navMenu');

menuToggle?.addEventListener('click', () => {
    navMenu?.classList.toggle('open');
    menuToggle.classList.toggle('active');
});

document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        navMenu?.classList.remove('open');
        menuToggle?.classList.remove('active');
    });
});

/* ── Active nav on scroll ── */
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-link');

function updateActiveNav() {
    const scrollY = window.pageYOffset;
    sections.forEach(sec => {
        const top = sec.offsetTop - 80;
        const bottom = top + sec.offsetHeight;
        const id = sec.getAttribute('id');
        const link = document.querySelector(`.nav-link[href="#${id}"]`);
        if (scrollY >= top && scrollY < bottom) {
            navLinks.forEach(l => l.classList.remove('active'));
            link?.classList.add('active');
        }
    });
}
window.addEventListener('scroll', updateActiveNav, { passive: true });

/* ── Scroll Reveal ── */
const revealEls = document.querySelectorAll('.reveal, .reveal-child');

const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
        if (entry.isIntersecting) {
            const el = entry.target;
            const delay = el.classList.contains('reveal-child')
                ? Array.from(el.parentElement?.children || []).indexOf(el) * 80
                : 0;
            setTimeout(() => el.classList.add('visible'), delay);
            revealObserver.unobserve(el);
        }
    });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

revealEls.forEach(el => revealObserver.observe(el));

/* ── Counter animation ── */
function animateCount(el) {
    const target = parseInt(el.getAttribute('data-target'), 10);
    const duration = 1200;
    const start = performance.now();
    function step(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(eased * target);
        if (progress < 1) requestAnimationFrame(step);
        else el.textContent = target;
    }
    requestAnimationFrame(step);
}

const statNums = document.querySelectorAll('.stat-num');
const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            animateCount(entry.target);
            counterObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.5 });
statNums.forEach(el => counterObserver.observe(el));

/* ── Copy button ── */
document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-copy');
        navigator.clipboard?.writeText(text).then(() => {
            const orig = btn.innerHTML;
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            btn.style.color = 'var(--green)';
            setTimeout(() => {
                btn.innerHTML = orig;
                btn.style.color = '';
            }, 1500);
        });
    });
});

/* ── Smooth scroll ── */
document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
        const id = a.getAttribute('href');
        if (id === '#') return;
        e.preventDefault();
        document.querySelector(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});

/* ── Navbar scroll style ── */
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
        navbar?.classList.add('scrolled');
    } else {
        navbar?.classList.remove('scrolled');
    }
}, { passive: true });

/* ── CRT random flicker (subtle) ── */
const crtFlicker = document.querySelector('.crt-flicker');
setInterval(() => {
    if (Math.random() < 0.03 && crtFlicker) {
        crtFlicker.style.opacity = '0.06';
        setTimeout(() => { crtFlicker.style.opacity = ''; }, 60);
    }
}, 200);

/* ── Status text cycle ── */
let statusIdx = 0;
const statusEl = document.getElementById('statusText');
setInterval(() => {
    if (!statusEl) return;
    statusIdx = (statusIdx + 1) % translations[currentLang].status.length;
    statusEl.style.opacity = '0';
    setTimeout(() => {
        statusEl.textContent = translations[currentLang].status[statusIdx];
        statusEl.style.opacity = '1';
    }, 200);
}, 4000);

/* ── Projects carousel (Swiper) ── */
window.addEventListener('load', () => {
    new Swiper('.projects-swiper', {
        slidesPerView: 1,
        spaceBetween: 24,
        grabCursor: true,
        pagination: { el: '.swiper-pagination', clickable: true },
        navigation: { nextEl: '.swiper-button-next', prevEl: '.swiper-button-prev' },
        breakpoints: {
            600: { slidesPerView: 2 },
            960: { slidesPerView: 3 },
        },
    });
});

/* ── Skill tag hover stagger ── */
document.querySelectorAll('.skills-category').forEach(cat => {
    const tags = cat.querySelectorAll('.stag');
    tags.forEach((tag, i) => {
        tag.style.transitionDelay = `${i * 30}ms`;
    });
});

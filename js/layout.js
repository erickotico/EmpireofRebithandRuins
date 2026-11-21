// Header e footer de todas as páginas. Para mudar um link do menu ou do rodapé, mude só aqui.
// A página marca onde eles entram com <div id="site-header"></div> e <div id="site-footer"></div>
// e carrega este script ANTES do langSwitcher.js (que traduz os data-i18n).
(function () {
    const ITCH_URL = 'https://erickotico-dev.itch.io/';
    const DISCORD_URL = 'https://discord.gg/rpUdmjrxq';

    const NAV = [
        { href: 'index.html', key: 'home', label: 'Home' },
        { href: 'bestiario.html', key: 'bestiary', label: 'Bestiary' },
        { href: 'classes.html', key: 'classes', label: 'Classes' },
        { href: 'guia.html', key: 'guide', label: 'Guide' },
        { href: 'sobre.html', key: 'about', label: 'About' }
    ];

    // Só links que existem. Discord, wiki, FAQ etc. entram aqui quando forem criados.
    const FOOTER = [
        {
            key: 'game', label: 'Game', links: [
                { href: 'guia.html', key: 'beginnerGuide', label: "Beginner's Guide" },
                { href: 'updates.html', key: 'patchNotes', label: 'Patch notes' },
                { href: ITCH_URL, key: 'download', label: 'Download', external: true }
            ]
        },
        {
            key: 'community', label: 'Community', links: [
                { href: ITCH_URL, key: 'itchPage', label: 'itch.io page', external: true },
                { href: DISCORD_URL, key: 'discord', label: 'Discord', external: true },
                { href: 'sobre.html', key: 'about', label: 'About' }
            ]
        },
        {
            key: 'support', label: 'Support', links: [
                { href: ITCH_URL, key: 'reportBug', label: 'Report a bug', external: true },
                { href: 'privacidade.html', key: 'privacyPolicy', label: 'Privacy policy' }
            ]
        }
    ];

    const currentPage = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();

    function linkAttrs(link) {
        return link.external ? `href="${link.href}" target="_blank" rel="noopener"` : `href="${link.href}"`;
    }

    function renderHeader() {
        const nav = NAV.map((link) => {
            const current = link.href === currentPage ? ' aria-current="page"' : '';
            return `<li><a href="${link.href}"${current} data-i18n="${link.key}">${link.label}</a></li>`;
        }).join('');
        return `
        <header class="site-header">
            <a class="brand" href="index.html">
                <img src="img/LogoRPG.jpg" alt="Logo Empire of Rebirth & Ruins">
                <span class="brand-name">Empire of Rebirth <small>&amp; Ruins</small></span>
            </a>
            <nav class="site-nav" id="site-nav" aria-label="Menu"><ul>${nav}<li class="nav-login"><a href="login.html"${currentPage === 'login.html' ? ' aria-current="page"' : ''} data-i18n="login">Login</a></li></ul></nav>
            <div class="header-actions">
                <button class="lang-switcher" type="button" aria-label="Change page language" title="Change language">🌐</button>
                <a class="btn btn-login header-login" href="login.html" data-i18n="login">Login</a>
                <a class="btn btn-download"${linkAttrs({ href: ITCH_URL, external: true })} data-i18n="download">Download</a>
            </div>
            <button class="menu-toggle" type="button" aria-controls="site-nav" aria-expanded="false" data-i18n-aria="openMenu" aria-label="Open menu"><span></span></button>
        </header>`;
    }

    function renderFooter() {
        const columns = FOOTER.map((column) => `
                <div class="footer-col">
                    <h4 data-i18n="${column.key}">${column.label}</h4>
                    <ul>${column.links.map((link) => `<li><a ${linkAttrs(link)} data-i18n="${link.key}">${link.label}</a></li>`).join('')}</ul>
                </div>`).join('');
        return `
        <footer class="site-footer">
            <div class="footer-grid">
                <div class="footer-brand">
                    <img src="img/LogoRPG.jpg" alt="Logo Empire of Rebirth & Ruins">
                    <div>
                        <h3 data-i18n="brandName">Empire of Rebirth & Ruins</h3>
                        <p class="footer-desc" data-i18n="footerDescription">Explore dungeons, defeat monsters, and become a legend.</p>
                    </div>
                </div>
                <div class="footer-links">${columns}</div>
            </div>
            <div class="footer-bottom">
                <p>Copyright &copy; ${new Date().getFullYear()} <span data-i18n="brandName">Empire of Rebirth & Ruins</span>. <span data-i18n="allRights">All rights reserved.</span></p>
            </div>
        </footer>`;
    }

    // Aberto com dois cliques no HTML (file://), o navegador bloqueia a leitura dos arquivos em data/.
    function renderFileWarning() {
        if (window.location.protocol !== 'file:') return '';
        return `<div class="file-warning" role="alert" data-i18n="fileProtocolWarning">
            This page was opened straight from the folder, so the browser blocks the game data.
            Open it with VS Code's Live Server or at http://localhost:3000/site/ (admin panel running).
        </div>`;
    }

    const header = document.getElementById('site-header');
    if (header) header.outerHTML = renderFileWarning() + renderHeader();
    const footer = document.getElementById('site-footer');
    if (footer) footer.outerHTML = renderFooter();

    // Menu mobile (abaixo de 1000px o menu vira um painel aberto pelo botão ☰).
    const siteHeader = document.querySelector('.site-header');
    const menuToggle = siteHeader?.querySelector('.menu-toggle');
    if (siteHeader && menuToggle) {
        const setMenu = (open) => {
            siteHeader.classList.toggle('menu-open', open);
            menuToggle.setAttribute('aria-expanded', String(open));
        };
        menuToggle.addEventListener('click', () => setMenu(!siteHeader.classList.contains('menu-open')));
        siteHeader.querySelectorAll('.site-nav a').forEach((link) => link.addEventListener('click', () => setMenu(false)));
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') setMenu(false);
        });
    }

    // Jogador logado: o botão "Entrar" vira o apelido e leva ao perfil.
    // Só lê a sessão salva no navegador (sem carregar o Supabase em toda página);
    // é apenas visual: o que vale de verdade é checado pelo banco.
    function playerNickname() {
        const key = 'sb-qjpogjpmxbpuuclpdfhv-auth-token';
        for (const area of ['localStorage', 'sessionStorage']) {
            try {
                const raw = window[area].getItem(key);
                if (!raw) continue;
                const nick = JSON.parse(raw)?.user?.user_metadata?.nickname;
                if (typeof nick === 'string' && nick) return nick.slice(0, 20);
            } catch { /* armazenamento bloqueado ou inválido */ }
        }
        return null;
    }
    const nickname = playerNickname();
    if (nickname) {
        document.querySelectorAll('.header-login, .nav-login a').forEach((link) => {
            link.href = 'perfil.html';
            link.removeAttribute('data-i18n');
            link.textContent = nickname;
            link.classList.add('is-player');
            if (currentPage === 'perfil.html' && !window.location.search) link.setAttribute('aria-current', 'page');
        });
        loadFriendAlert();
    }

    // Pedidos de amizade esperando resposta → bolinha com o número no botão do apelido.
    // Usa a sessão salva para uma consulta simples; se a sessão venceu, só não mostra nada.
    async function loadFriendAlert() {
        const SUPABASE_URL = 'https://qjpogjpmxbpuuclpdfhv.supabase.co';
        const SUPABASE_KEY = 'sb_publishable_mYKOcjU5XYwsDQW-4Bve8g_SpCqp1Dc';
        let token = null;
        for (const area of ['localStorage', 'sessionStorage']) {
            try {
                const raw = window[area].getItem('sb-qjpogjpmxbpuuclpdfhv-auth-token');
                const session = raw && JSON.parse(raw);
                if (session?.access_token && (!session.expires_at || session.expires_at * 1000 > Date.now())) token = session.access_token;
            } catch { /* armazenamento bloqueado */ }
            if (token) break;
        }
        if (!token) return;
        try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pending_friend_count`, {
                method: 'POST',
                headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: '{}'
            });
            if (!res.ok) return;
            const count = Number(await res.json()) || 0;
            document.querySelectorAll('.header-login.is-player, .nav-login a.is-player').forEach((link) => {
                link.querySelector('.friend-alert')?.remove();
                if (!count) return;
                const dot = document.createElement('span');
                dot.className = 'friend-alert';
                dot.textContent = count > 9 ? '9+' : String(count);
                dot.title = window.getSiteTranslation ? window.getSiteTranslation('friendRequestsAlert', 'Friend requests') : 'Friend requests';
                link.appendChild(dot);
                link.href = 'amigos.html#recebidos';
            });
        } catch { /* sem conexão: ignora */ }
    }
    window.addEventListener('eor-friends-changed', () => { if (nickname) loadFriendAlert(); });

    // Qualquer link da página marcado com data-link="itch" aponta para a página do itch.io.
    document.querySelectorAll('[data-link="itch"]').forEach((link) => {
        link.href = ITCH_URL;
        link.target = '_blank';
        link.rel = 'noopener';
    });

    window.SiteLinks = { itch: ITCH_URL };
})();

// Header e footer de todas as páginas. Para mudar um link do menu ou do rodapé, mude só aqui.
// A página marca onde eles entram com <div id="site-header"></div> e <div id="site-footer"></div>
// e carrega este script ANTES do langSwitcher.js (que traduz os data-i18n).
(function () {
    const ITCH_URL = 'https://erickotico-dev.itch.io/';
    const DISCORD_URL = 'https://discord.gg/rpUdmjrxq';
    // Endereço e chave PÚBLICA do Supabase (a mesma de js/auth.js). Declarados aqui em cima
    // porque o header já usa ao abrir a página (contadores do sino/envelope e "estou aqui").
    const SUPABASE_URL = 'https://qjpogjpmxbpuuclpdfhv.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_mYKOcjU5XYwsDQW-4Bve8g_SpCqp1Dc';

    const NAV = [
        { href: 'index.html', key: 'home', label: 'Home' },
        // member: só aparece no menu para quem está logado
        { href: 'social.html', key: 'socialPageTitle', label: 'Social', member: true },
        { href: 'taverna.html', key: 'tavernPageTitle', label: 'Tavern', member: true },
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

    const ASSET_V = '2026112092';
    const currentPage = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();

    function linkAttrs(link) {
        return link.external ? `href="${link.href}" target="_blank" rel="noopener"` : `href="${link.href}"`;
    }

    function renderHeader() {
        const loggedIn = !!playerNickname();
        const nav = NAV.filter((link) => !link.member || loggedIn).map((link) => {
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

    // Menu mobile (abaixo de 1340px o menu vira um painel aberto pelo botão ☰).
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
        addMessagesLinks();
        addBell();
        addTabbar();
        loadAlerts();
        loadChat();
        startHeartbeat();
    }

    // Envelope de mensagens: no topo (computador) e dentro do menu ☰ (celular).
    function addMessagesLinks() {
        const label = window.getSiteTranslation ? window.getSiteTranslation('messagesPageTitle', 'Messages') : 'Messages';
        const login = document.querySelector('.header-login');
        if (login && !document.querySelector('.header-messages')) {
            const a = document.createElement('a');
            a.className = 'header-messages';
            a.href = 'mensagens.html';
            a.setAttribute('aria-label', label);
            a.title = label;
            a.setAttribute('data-i18n-aria', 'messagesPageTitle');
            a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 6 H21 V18 H3 Z M3 6 L12 13 L21 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
            if (currentPage === 'mensagens.html') a.setAttribute('aria-current', 'page');
            login.before(a);
        }
        const navLogin = document.querySelector('.site-nav .nav-login');
        if (navLogin && !document.querySelector('.nav-messages')) {
            const li = document.createElement('li');
            li.className = 'nav-messages';
            li.innerHTML = '<a href="mensagens.html" data-i18n="messagesPageTitle"></a>';
            li.querySelector('a').textContent = label;
            navLogin.before(li);
        }
        // No menu ☰ do celular: o próprio perfil primeiro, depois Mensagens
        const navList = navLogin?.parentElement;
        if (navList) navList.prepend(navLogin, document.querySelector('.nav-messages') || '');
    }

    // Barra de abas fixa embaixo da tela (só celular e só logado), como nos apps de rede social.
    function addTabbar() {
        if (document.querySelector('.tabbar')) return;
        const tr = (key, fallback) => (window.getSiteTranslation ? window.getSiteTranslation(key, fallback) : fallback);
        const icon = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
        const TABS = [
            { id: 'home', href: 'index.html', key: 'home', label: 'Home', d: 'M4 11 L12 4 L20 11 V20 H14 V14 H10 V20 H4 Z' },
            { id: 'social', href: 'social.html', key: 'socialPageTitle', label: 'Social', d: 'M4 6 H20 V18 H4 Z M4 15 L9 10 L13 14 L15 12 L20 17 M15.5 9.5 A1 1 0 1 0 15.5 9.4' },
            { id: 'tavern', href: 'taverna.html', key: 'tavernPageTitle', label: 'Tavern', d: 'M5 4 H19 L17 12 H7 Z M12 12 V18 M8 20 H16' },
            { id: 'messages', href: 'mensagens.html', key: 'messagesPageTitle', label: 'Messages', d: 'M3 6 H21 V18 H3 Z M3 6 L12 13 L21 6' },
            { id: 'profile', href: 'perfil.html', key: 'myProfile', label: 'Profile', d: 'M12 12 A4 4 0 1 0 12 4 A4 4 0 1 0 12 12 Z M4 21 C4.5 16.5 8 15 12 15 C16 15 19.5 16.5 20 21' }
        ];
        const nav = document.createElement('nav');
        nav.className = 'tabbar';
        nav.setAttribute('aria-label', tr('quickMenu', 'Quick menu'));
        nav.setAttribute('data-i18n-aria', 'quickMenu');
        TABS.forEach((tab) => {
            const a = document.createElement('a');
            a.href = tab.href;
            a.dataset.tab = tab.id;
            const on = tab.href === currentPage && (tab.id !== 'profile' || !window.location.search);
            if (on) a.setAttribute('aria-current', 'page');
            a.innerHTML = icon(tab.d);
            const label = document.createElement('span');
            label.setAttribute('data-i18n', tab.key);
            label.textContent = tr(tab.key, tab.label);
            a.appendChild(label);
            nav.appendChild(a);
        });
        document.body.appendChild(nav);
        document.documentElement.classList.add('has-tabbar');
    }

    // Sino de notificações ao lado do apelido (computador e celular).
    // A lista que abre ao clicar é montada pelo js/chat.js.
    function addBell() {
        const actions = document.querySelector('.header-actions');
        if (!actions || document.querySelector('.header-bell')) return;
        const label = window.getSiteTranslation ? window.getSiteTranslation('notifications', 'Notifications') : 'Notifications';
        const wrap = document.createElement('div');
        wrap.className = 'header-bell-wrap';
        wrap.innerHTML = '<button type="button" class="header-bell" aria-haspopup="true" aria-expanded="false" data-i18n-aria="notifications"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 17 V11 A6 6 0 0 1 18 11 V17 L20 19 H4 Z M10 21 H14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg></button>';
        const bell = wrap.querySelector('button');
        bell.setAttribute('aria-label', label);
        bell.title = label;
        const login = actions.querySelector('.header-login');
        if (login) login.before(wrap); else actions.prepend(wrap);
    }

    // Janela de mensagens + lista do sino: carrega o Supabase só para quem está logado,
    // depois que os scripts da própria página já rodaram (para não carregar duas vezes).
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = reject;
            document.body.appendChild(s);
        });
    }
    // "Estou aqui": avisa o banco a cada minuto enquanto a aba está aberta (online para os amigos).
    function startHeartbeat() {
        const beat = () => {
            const token = sessionToken();
            if (!token || document.visibilityState !== 'visible') return;
            fetch(`${SUPABASE_URL}/rest/v1/rpc/heartbeat`, {
                method: 'POST',
                headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: '{}'
            }).catch(() => {});
        };
        beat();
        setInterval(beat, 60000);
        document.addEventListener('visibilitychange', beat);
    }

    function loadChat() {
        if (window.location.protocol === 'file:') return;
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = `css/chat.css?v=${ASSET_V}`;
        document.head.appendChild(css);
        const start = async () => {
            try {
                if (!window.supabase?.createClient) await loadScript('js/vendor/supabase.js?v=2.118.0');
                if (!window.EorAuth) await loadScript(`js/auth.js?v=${ASSET_V}`);
                if (!window.SiteCrests) await loadScript('js/crests.js?v=2026112017');
                await loadScript(`js/chat.js?v=${ASSET_V}`);
            } catch { /* sem internet: o site continua funcionando sem a janela */ }
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
        else start();
    }

    // Sessão salva no navegador → token para consultas simples (se venceu, não mostra nada).
    function sessionToken() {
        for (const area of ['localStorage', 'sessionStorage']) {
            try {
                const raw = window[area].getItem('sb-qjpogjpmxbpuuclpdfhv-auth-token');
                const session = raw && JSON.parse(raw);
                if (session?.access_token && (!session.expires_at || session.expires_at * 1000 > Date.now())) return session.access_token;
            } catch { /* armazenamento bloqueado */ }
        }
        return null;
    }
    async function countFrom(fn) {
        const token = sessionToken();
        if (!token) return null;
        try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
                method: 'POST',
                headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: '{}'
            });
            return res.ok ? Number(await res.json()) || 0 : null;
        } catch {
            return null;
        }
    }

    // Números nos ícones do topo:
    //   envelope / "Mensagens" do menu → mensagens não lidas
    //   sino → mensagens não lidas + pedidos de amizade esperando resposta
    function setDot(link, count) {
        link.querySelector('.friend-alert')?.remove();
        if (!count) return;
        const dot = document.createElement('span');
        dot.className = 'friend-alert';
        dot.textContent = count > 9 ? '9+' : String(count);
        link.appendChild(dot);
    }
    async function loadAlerts() {
        const [messages, friends, notes, reports] = await Promise.all([
            countFrom('unread_message_count'), countFrom('pending_friend_count'),
            countFrom('unread_notification_count'), countFrom('admin_open_report_count')
        ]);
        if (messages !== null) document.querySelectorAll('.header-messages, .nav-messages a, .tabbar [data-tab="messages"]').forEach((link) => setDot(link, messages));
        const friendsTab = document.querySelector('.tabbar [data-tab="profile"]');
        if (friendsTab && friends !== null) setDot(friendsTab, friends);
        if (messages !== null || friends !== null) {
            const bell = document.querySelector('.header-bell');
            if (bell) setDot(bell, (messages || 0) + (friends || 0) + (notes || 0) + (reports || 0));
        }
    }
    window.addEventListener('eor-messages-changed', () => { if (nickname) loadAlerts(); });
    window.addEventListener('eor-friends-changed', () => { if (nickname) loadAlerts(); });
    document.addEventListener('visibilitychange', () => { if (nickname && document.visibilityState === 'visible') loadAlerts(); });
    // Pedidos de amizade não chegam na hora: confere de novo a cada minuto com a aba aberta
    setInterval(() => { if (nickname && document.visibilityState === 'visible') loadAlerts(); }, 60000);

    // Qualquer link da página marcado com data-link="itch" aponta para a página do itch.io.
    document.querySelectorAll('[data-link="itch"]').forEach((link) => {
        link.href = ITCH_URL;
        link.target = '_blank';
        link.rel = 'noopener';
    });

    window.SiteLinks = { itch: ITCH_URL };
})();

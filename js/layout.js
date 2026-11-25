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

    // Menu do topo: um botão só (o apelido para quem está logado, "Menu" para visitante)
    // abre um painel com estas seções. member: só para quem está logado. admin: só para o admin
    // (o banco confere o cargo e o 2FA; aqui só mostra o atalho).
    const ICONS = {
        user: 'M12 12 A4 4 0 1 0 12 4 A4 4 0 1 0 12 12 Z M4 21 C4.5 16.5 8 15 12 15 C16 15 19.5 16.5 20 21',
        edit: 'M4 20 H8 L19 9 L15 5 L4 16 Z M13 7 L17 11',
        friends: 'M9 11 A3.5 3.5 0 1 0 9 4 A3.5 3.5 0 1 0 9 11 Z M2.5 20 C3 15.5 6 14 9 14 C12 14 15 15.5 15.5 20 M16 4.5 A3 3 0 0 1 16 10.5 M18 14.5 C20 15.2 21.3 17 21.5 20',
        mail: 'M3 6 H21 V18 H3 Z M3 6 L12 13 L21 6',
        shield: 'M12 3 L20 6 V12 C20 16.5 16.5 19.5 12 21 C7.5 19.5 4 16.5 4 12 V6 Z M9 12 L11 14 L15 10',
        social: 'M4 6 H20 V18 H4 Z M4 15 L9 10 L13 14 L15 12 L20 17',
        tavern: 'M5 4 H19 L17 12 H7 Z M12 12 V18 M8 20 H16',
        home: 'M4 11 L12 4 L20 11 V20 H14 V14 H10 V20 H4 Z',
        beast: 'M5 9 L8 4 L10 8 H14 L16 4 L19 9 C20 14 17 19 12 20 C7 19 4 14 5 9 Z M9.5 12.5 H10 M14 12.5 H14.5',
        sword: 'M14 4 H20 V10 L9 21 L6 21 L3 18 L3 15 Z M7 14 L10 17',
        map: 'M3 6 L9 4 L15 6 L21 4 V18 L15 20 L9 18 L3 20 Z M9 4 V18 M15 6 V20',
        scroll: 'M7 4 H18 V17 A3 3 0 0 1 15 20 H6 A3 3 0 0 1 6 14 H15 M9 8 H15 M9 11 H13',
        info: 'M12 21 A9 9 0 1 0 12 3 A9 9 0 1 0 12 21 Z M12 11 V16 M12 8 V8.5',
        globe: 'M12 21 A9 9 0 1 0 12 3 A9 9 0 1 0 12 21 Z M3 12 H21 M12 3 C9 6 9 18 12 21 C15 18 15 6 12 3',
        chat: 'M4 5 H20 V16 H10 L5 20 V16 H4 Z',
        door: 'M14 4 H19 V20 H14 M10 8 L14 12 L10 16 M14 12 H4',
        download: 'M12 4 V15 M7 10 L12 15 L17 10 M5 20 H19'
    };
    const MENU = [
        {
            key: 'menuAccount', label: 'My account', member: true, items: [
                { id: 'profile', href: 'perfil.html', key: 'myProfile', label: 'My profile', icon: 'user' },
                { id: 'edit', href: 'perfil.html#editar', key: 'editProfile', label: 'Edit profile', icon: 'edit' },
                { id: 'friends', href: 'amigos.html', key: 'friendsTitle', label: 'Friends', icon: 'friends' },
                { id: 'messages', href: 'mensagens.html', key: 'messagesPageTitle', label: 'Messages', icon: 'mail' },
                { id: 'moderation', href: 'moderacao.html', key: 'modPanelTitle', label: 'Moderation', icon: 'shield', admin: true }
            ]
        },
        {
            key: 'menuCommunity', label: 'Community', member: true, items: [
                { href: 'social.html', key: 'socialPageTitle', label: 'Social', icon: 'social' },
                { href: 'taverna.html', key: 'tavernPageTitle', label: 'Tavern', icon: 'tavern' }
            ]
        },
        {
            key: 'menuExplore', label: 'Explore', items: [
                { href: 'index.html', key: 'home', label: 'Home', icon: 'home' },
                { href: 'bestiario.html', key: 'bestiary', label: 'Bestiary', icon: 'beast' },
                { href: 'classes.html', key: 'classes', label: 'Classes', icon: 'sword' },
                { href: 'guia.html', key: 'guide', label: 'Guide', icon: 'map' },
                { href: 'updates.html', key: 'patchNotes', label: 'Patch notes', icon: 'scroll' },
                { href: 'sobre.html', key: 'about', label: 'About', icon: 'info' }
            ]
        }
    ];
    const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${ICONS[name]}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
    const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

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
                { href: 'termos.html#regras', key: 'communityRules', label: 'Community rules' },
                { href: 'termos.html', key: 'termsOfUse', label: 'Terms of use' },
                { href: 'privacidade.html', key: 'privacyPolicy', label: 'Privacy policy' },
                { href: 'perfil.html#excluir-conta', key: 'deleteAccountFooter', label: 'Delete my account' }
            ]
        }
    ];

    const ASSET_V = '2026112150';
    const currentPage = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();

    function linkAttrs(link) {
        return link.external ? `href="${link.href}" target="_blank" rel="noopener"` : `href="${link.href}"`;
    }

    function renderHeader() {
        const nick = playerNickname();
        const loggedIn = !!nick;
        const initial = nick ? escapeHtml(nick.charAt(0).toUpperCase()) : '';
        const sections = MENU.filter((s) => !s.member || loggedIn).map((s) => {
            const items = s.items.map((item) => {
                const current = item.href === currentPage && !(item.id === 'profile' && window.location.search) ? ' aria-current="page"' : '';
                return `<li${item.admin ? ' class="menu-admin" hidden' : ''}><a class="menu-item" href="${item.href}"${item.id ? ` data-item="${item.id}"` : ''}${current}>${icon(item.icon)}<span data-i18n="${item.key}">${item.label}</span></a></li>`;
            }).join('');
            return `<section class="menu-section"><h3 class="menu-heading" data-i18n="${s.key}">${s.label}</h3><ul>${items}</ul></section>`;
        }).join('');
        const me = loggedIn ? `
                    <div class="menu-me">
                        <span class="menu-avatar is-big" aria-hidden="true">${initial}</span>
                        <div class="menu-me-text">
                            <strong class="menu-me-name">${escapeHtml(nick)}</strong>
                            <a href="perfil.html" data-i18n="seeMyProfile">See my profile</a>
                        </div>
                    </div>
                    <div class="menu-status" hidden></div>` : '';
        const foot = loggedIn
            ? '<button type="button" class="menu-foot-btn menu-logout">' + icon('door') + '<span data-i18n="logout">Sign out</span></button>'
            : '<a class="btn btn-download menu-enter" href="login.html" data-i18n="login">Login</a>';
        const button = loggedIn
            ? `<span class="menu-avatar" aria-hidden="true">${initial}</span><span class="menu-name">${escapeHtml(nick)}</span>`
            : '<span class="menu-burger" aria-hidden="true"><span></span></span><span class="menu-label" data-i18n="menu">Menu</span>';
        return `
        <header class="site-header">
            <a class="brand" href="index.html">
                <img src="img/LogoRPG.jpg" alt="Logo Empire of Rebirth & Ruins">
                <span class="brand-name">Empire of Rebirth <small>&amp; Ruins</small></span>
            </a>
            <div class="header-actions">
                <a class="btn btn-download header-download"${linkAttrs({ href: ITCH_URL, external: true })} data-i18n="download">Download</a>
                <div class="menu-wrap">
                    <button type="button" class="menu-button${loggedIn ? ' is-player' : ''}" id="menuButton" aria-haspopup="true" aria-expanded="false" aria-controls="siteMenu" data-i18n-aria="openMenu" aria-label="Open menu">
                        ${button}
                        <svg class="menu-chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 9 L12 15 L18 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                    <div class="site-menu${loggedIn ? '' : ' is-guest'}" id="siteMenu" tabindex="-1" hidden>
                        ${me}
                        <nav class="menu-cols" aria-label="Menu">${sections}</nav>
                        <div class="menu-foot">
                            <button type="button" class="menu-foot-btn lang-switcher">${icon('globe')}<span data-i18n="otherLanguage">Português</span></button>
                            <a class="menu-foot-btn" ${linkAttrs({ href: DISCORD_URL, external: true })}>${icon('chat')}<span>Discord</span></a>
                            <a class="menu-foot-btn menu-download" ${linkAttrs({ href: ITCH_URL, external: true })}>${icon('download')}<span data-i18n="download">Download</span></a>
                            ${foot}
                        </div>
                    </div>
                </div>
            </div>
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

    // ---------- Menu (botão do apelido / "Menu") ----------
    const siteHeader = document.querySelector('.site-header');
    const menuButton = document.getElementById('menuButton');
    const siteMenu = document.getElementById('siteMenu');
    // byKeyboard: aberto pelo teclado → o foco vai para o 1º item; com o mouse, só para o painel
    function setMenu(open, focusButton = false, byKeyboard = false) {
        if (!menuButton || !siteMenu) return;
        if (open === !siteMenu.hidden) return;
        siteMenu.hidden = !open;
        menuButton.setAttribute('aria-expanded', String(open));
        siteHeader?.classList.toggle('menu-open', open);
        document.documentElement.classList.toggle('site-menu-open', open);
        if (open) {
            fillStatus();
            (byKeyboard ? siteMenu.querySelector('.menu-item') : siteMenu)?.focus({ preventScroll: true });
        } else if (focusButton) {
            menuButton.focus();
        }
    }
    if (menuButton && siteMenu) {
        menuButton.addEventListener('click', (e) => setMenu(siteMenu.hidden, false, e.detail === 0));
        document.addEventListener('click', (e) => {
            if (!siteMenu.hidden && !e.target.closest('.menu-wrap')) setMenu(false);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !siteMenu.hidden) setMenu(false, true);
        });
        // Qualquer link do menu fecha o painel (inclusive os que abrem janelas, como Mensagens)
        siteMenu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
        // Setas para cima/baixo andam pelos itens
        siteMenu.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            const items = [...siteMenu.querySelectorAll('a, button')].filter((el) => el.offsetParent !== null);
            const i = items.indexOf(document.activeElement);
            e.preventDefault();
            if (i < 0) { items[0]?.focus(); return; }
            items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
        });
        siteMenu.querySelector('.menu-logout')?.addEventListener('click', logout);
    }

    // Sair: usa o Supabase se já estiver carregado; senão avisa o servidor direto e limpa a sessão.
    async function logout() {
        const token = sessionToken();
        try {
            if (window.EorAuth?.client) await window.EorAuth.client.auth.signOut();
            else if (token) {
                await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
                    method: 'POST',
                    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }
                });
            }
        } catch { /* sem internet: limpa assim mesmo */ }
        ['localStorage', 'sessionStorage'].forEach((area) => {
            try {
                window[area].removeItem('sb-qjpogjpmxbpuuclpdfhv-auth-token');
                window[area].removeItem('eor-chat');
                window[area].removeItem('eor-avatar');
            } catch { /* armazenamento bloqueado */ }
        });
        window.location.replace('index.html');
    }

    // Seletor de status (online, ocupado...) no topo do menu, quando o js/auth.js já carregou.
    let statusFilled = false;
    async function fillStatus() {
        const box = siteMenu?.querySelector('.menu-status');
        const presence = window.EorAuth?.presence;
        if (!box || statusFilled || !presence?.picker) return;
        statusFilled = true;
        const mode = await presence.myMode().catch(() => null);
        box.appendChild(presence.picker(mode || 'auto', () => {}));
        box.hidden = false;
    }

    // Emblema do jogador no botão do menu (o apelido já vem da sessão; o emblema vem do perfil).
    async function loadAvatar() {
        let avatar = null;
        try {
            const saved = JSON.parse(sessionStorage.getItem('eor-avatar') || 'null');
            if (saved && saved.nick === nickname) avatar = saved.avatar;
        } catch { /* sem armazenamento */ }
        if (avatar === null) {
            const token = sessionToken();
            if (!token) return;
            try {
                const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=avatar&nickname=eq.${encodeURIComponent(nickname)}`, {
                    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }
                });
                const rows = res.ok ? await res.json() : [];
                avatar = rows[0]?.avatar || '';
                sessionStorage.setItem('eor-avatar', JSON.stringify({ nick: nickname, avatar }));
            } catch { return; }
        }
        if (!avatar) return;
        const paint = () => {
            const crests = window.SiteCrests;
            if (!crests?.find?.(avatar)) return false;
            document.querySelectorAll('.menu-avatar').forEach((el) => {
                el.innerHTML = crests.avatar(avatar);
                el.classList.add('has-crest');
            });
            return true;
        };
        if (!paint()) window.addEventListener('eor-crests-ready', paint, { once: true });
    }

    // Jogador logado: o botão do menu mostra o emblema e o apelido.
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
        loadAvatar();
        rpcJson('is_admin').then((admin) => {
            if (admin === true) siteMenu?.querySelectorAll('.menu-admin').forEach((li) => { li.hidden = false; });
        });
        addMessagesLinks();
        addBell();
        addTabbar();
        loadAlerts();
        loadChat();
        startHeartbeat();
        checkNotices();
    }

    // ---------- Avisos no canto da tela (só logado) ----------
    //   · Termos novos: até clicar em "Concordo" (terms_pending / accept_terms, supabase/015_termos.sql).
    //   · Moderação: conta suspensa (enquanto durar) e avisos da equipe até clicar em
    //     "Entendi" (my_moderation / ack_mod_notice, supabase/016_moderacao.sql).
    // O banco decide tudo; aqui é só o aviso. Se o SQL ainda não rodou, não aparece nada.
    function rpc(fn, body) {
        const token = sessionToken();
        if (!token) return Promise.reject(new Error('no session'));
        return fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
            method: 'POST',
            headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {})
        });
    }
    async function rpcJson(fn) {
        try {
            const res = await rpc(fn);
            return res.ok ? await res.json() : null;
        } catch { return null; }
    }
    async function rpcOk(fn, body) {
        try { return (await rpc(fn, body)).ok; } catch { return false; }
    }
    // function (não const): checkNotices() é chamada lá em cima, antes desta linha
    function tr(key, fallback) {
        return window.getSiteTranslation ? window.getSiteTranslation(key, fallback) : fallback;
    }
    function dateText(d) {
        return new Date(d).toLocaleString(window.SiteI18n?.lang === 'en' ? 'en' : 'pt-BR',
            { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    }

    // Um aviso: título (opcional), linhas de texto, um link no fim (opcional) e um botão.
    // onButton devolve false se falhou (o aviso fica e mostra o erro).
    function addNotice({ alert = false, title, lines = [], link, buttonText, onButton }) {
        let stack = document.querySelector('.site-notices');
        if (!stack) {
            stack = document.createElement('div');
            stack.className = 'site-notices';
            document.body.appendChild(stack);
        }
        const box = document.createElement('div');
        box.className = `site-notice${alert ? ' is-alert' : ''}`;
        box.setAttribute('role', alert ? 'alert' : 'status');
        const text = document.createElement('div');
        text.className = 'site-notice-text';
        if (title) {
            const strong = document.createElement('strong');
            strong.textContent = title;
            text.appendChild(strong);
        }
        const shown = lines.filter(Boolean);
        shown.forEach((line, i) => {
            const p = document.createElement('p');
            p.textContent = line;
            if (link && i === shown.length - 1) {
                const a = document.createElement('a');
                a.href = link.href;
                a.textContent = link.text;
                p.append(' ', a);
            }
            text.appendChild(p);
        });
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-download';
        button.textContent = buttonText;
        const error = document.createElement('p');
        error.className = 'site-notice-error';
        error.setAttribute('role', 'alert');
        error.hidden = true;
        error.textContent = tr('termsNoticeError', 'Could not save. Try again.');
        button.addEventListener('click', async () => {
            button.disabled = true;
            error.hidden = true;
            if ((await onButton()) === false) {
                error.hidden = false;
                button.disabled = false;
                return;
            }
            box.remove();
            if (!stack.childElementCount) stack.remove();
        });
        box.append(text, button, error);
        stack.appendChild(box);
    }

    // Conta acabou de ser excluída (perfil.js manda para index.html?conta=excluida)
    if (new URLSearchParams(window.location.search).get('conta') === 'excluida') {
        const showDeleted = () => {
            addNotice({
                title: tr('accountDeletedTitle', 'Your account was deleted'),
                lines: [tr('accountDeletedText', 'Your data was removed. Thanks for playing with us!')],
                buttonText: tr('close', 'Close'),
                onButton: () => true
            });
            window.history.replaceState(null, '', window.location.pathname);
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showDeleted, { once: true });
        else showDeleted();
    }

    async function checkNotices() {
        if (!sessionToken() || window.location.protocol === 'file:') return;
        const [termsPending, mod, account] = await Promise.all([rpcJson('terms_pending'), rpcJson('my_moderation'), rpcJson('my_account')]);
        // Os textos vêm do langSwitcher.js, que carrega depois deste arquivo
        if (document.readyState === 'loading') await new Promise((done) => document.addEventListener('DOMContentLoaded', done, { once: true }));

        if (mod) {
            // Apelido trocado pela moderação: corrige o nome mostrado no topo.
            if (mod.nickname && mod.nickname !== nickname) {
                document.querySelectorAll('.menu-name, .menu-me-name').forEach((el) => { el.textContent = mod.nickname; });
                ['localStorage', 'sessionStorage'].forEach((area) => {
                    try {
                        const key = 'sb-qjpogjpmxbpuuclpdfhv-auth-token';
                        const raw = window[area].getItem(key);
                        const s = raw && JSON.parse(raw);
                        if (s?.user?.user_metadata) {
                            s.user.user_metadata.nickname = mod.nickname;
                            window[area].setItem(key, JSON.stringify(s));
                        }
                    } catch { /* armazenamento bloqueado */ }
                });
            }

            // Conta suspensa/banida: aparece em toda página (fechar esconde só nesta aba).
            const ban = mod.ban;
            const hiddenKey = 'eor-ban-notice';
            let hidden = null;
            try { hidden = sessionStorage.getItem(hiddenKey); } catch { /* sem armazenamento */ }
            if (ban && hidden !== String(ban.until)) {
                addNotice({
                    alert: true,
                    title: ban.until ? tr('modYouSuspended', 'Your account is suspended') : tr('modYouBanned', 'Your account was banned'),
                    lines: [
                        ban.until ? `${tr('modUntilLong', 'Until')} ${dateText(ban.until)}.` : '',
                        `${tr('reportReason', 'Reason')}: ${ban.reason}`,
                        tr('modYouCanRead', 'You can still browse the site, but you cannot post, comment, like or send messages.'),
                        tr('modAppeal', 'Think it was a mistake? Write to empireofrebirth@gmail.com.')
                    ],
                    link: { href: 'termos.html#regras', text: tr('communityRules', 'Community rules') },
                    buttonText: tr('close', 'Close'),
                    onButton: () => { try { sessionStorage.setItem(hiddenKey, String(ban.until)); } catch { /* sem armazenamento */ } return true; }
                });
            }

            // Avisos da equipe (ficam até "Entendi")
            const TEXTS = {
                warning: ['modNoticeWarning', 'Warning from the moderators'],
                unban: ['modNoticeUnban', 'Your account is free again. Welcome back!'],
                clear_bio: ['modNoticeClearBio', 'The moderators removed your bio.'],
                clear_avatar: ['modNoticeClearAvatar', 'The moderators removed your crest.'],
                rename: ['modNoticeRename', 'The moderators changed your nickname.']
            };
            (mod.notices || []).forEach((n) => {
                // Suspensão/banimento já aparecem no aviso acima (ou já acabaram)
                if (n.kind === 'suspend' || n.kind === 'ban') { rpcOk('ack_mod_notice', { p_id: n.id }); return; }
                const [key, fallback] = TEXTS[n.kind] || TEXTS.warning;
                addNotice({
                    title: tr(key, fallback),
                    lines: [n.kind === 'warning' || n.kind === 'unban' ? n.body : `${tr('reportReason', 'Reason')}: ${n.body}`],
                    link: n.kind === 'unban' ? null : { href: 'termos.html#regras', text: tr('communityRules', 'Community rules') },
                    buttonText: tr('modGotIt', 'Got it'),
                    onButton: () => rpcOk('ack_mod_notice', { p_id: n.id })
                });
            });
        }

        // 16/17 anos: conta travada até o responsável autorizar (supabase/018_contas_seguranca.sql)
        const guardian = account?.guardian;
        if (guardian && guardian.status !== 'approved') {
            if (guardian.status === 'pending' && !guardian.sent_at) {
                // primeiro login depois do cadastro: o pedido sai sozinho
                if (await rpcOk('guardian_send')) guardian.sent_at = new Date().toISOString();
            }
            const denied = guardian.status === 'denied';
            addNotice({
                alert: true,
                title: denied ? tr('guardianNoticeDenied', 'Your guardian did not approve your account') : tr('guardianNoticeTitle', 'Waiting for your guardian'),
                lines: denied
                    ? [tr('guardianNoticeDeniedText', 'The account will be deleted within 24 hours. When you turn 18, you can create a new one.')]
                    : [
                        tr('guardianNoticeText', 'We emailed {email} asking for permission. Until they approve, you can browse the site but cannot post, comment or send messages.').replace('{email}', guardian.email || ''),
                        `${tr('guardianNoticeDeadline', 'Without approval, the account is deleted on')} ${dateText(guardian.expires_at)}.`
                    ],
                link: denied ? null : { href: 'perfil.html#responsavel', text: tr('guardianNoticeChange', 'Change the email or resend') },
                buttonText: tr('close', 'Close'),
                onButton: () => true
            });
        }

        if (termsPending === true) {
            addNotice({
                lines: [
                    tr('termsNoticeText', 'We updated the Terms of use and the Privacy policy.'),
                    tr('termsNoticeBlock', 'Until you agree, you can browse the site but cannot post, comment or send messages.')
                ],
                link: { href: 'termos.html', text: tr('termsNoticeRead', 'Read') },
                buttonText: tr('termsNoticeAccept', 'I agree'),
                onButton: () => rpcOk('accept_terms')
            });
        }

        // Ainda sem código de recuperação: lembrete (no máximo 1 vez por semana)
        const laterKey = 'eor-recovery-later';
        let later = 0;
        try { later = Number(localStorage.getItem(laterKey)) || 0; } catch { /* sem armazenamento */ }
        if (account?.recovery && !account.recovery.has_code && !account.restriction
            && Date.now() - later > 7 * 864e5 && currentPage !== 'perfil.html') {
            addNotice({
                title: tr('recoveryNoticeTitle', 'Protect your account'),
                lines: [tr('recoveryNoticeText', 'Create a recovery code. It lets you get back in if you lose your email or your phone.')],
                link: { href: 'perfil.html#recuperacao', text: tr('recoveryNoticeLink', 'Create now') },
                buttonText: tr('recoveryNoticeLater', 'Later'),
                onButton: () => { try { localStorage.setItem(laterKey, String(Date.now())); } catch { /* sem armazenamento */ } return true; }
            });
        }
    }

    // Envelope de mensagens: no topo (computador) e dentro do menu ☰ (celular).
    function addMessagesLinks() {
        const label = window.getSiteTranslation ? window.getSiteTranslation('messagesPageTitle', 'Messages') : 'Messages';
        const anchor = document.querySelector('.header-download');
        if (anchor && !document.querySelector('.header-messages')) {
            const a = document.createElement('a');
            a.className = 'header-messages';
            a.href = 'mensagens.html';
            a.setAttribute('aria-label', label);
            a.title = label;
            a.setAttribute('data-i18n-aria', 'messagesPageTitle');
            a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 6 H21 V18 H3 Z M3 6 L12 13 L21 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
            if (currentPage === 'mensagens.html') a.setAttribute('aria-current', 'page');
            anchor.before(a);
        }
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
        actions.prepend(wrap);
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
                window.dispatchEvent(new Event('eor-crests-ready'));
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
        if (messages !== null) document.querySelectorAll('.header-messages, .site-menu [data-item="messages"], .tabbar [data-tab="messages"]').forEach((link) => setDot(link, messages));
        if (friends !== null) document.querySelectorAll('.tabbar [data-tab="profile"], .site-menu [data-item="friends"]').forEach((link) => setDot(link, friends));
        if (reports !== null) document.querySelectorAll('.site-menu [data-item="moderation"]').forEach((link) => setDot(link, reports));
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

    // Termos de uso e Privacidade abrem numa janela em vez de trocar de página (js/legal-modal.js).
    // Ctrl/clique do meio continuam abrindo a página em outra aba.
    if (currentPage !== 'termos.html' && currentPage !== 'privacidade.html') {
        document.addEventListener('click', async (e) => {
            const a = e.target.closest?.('a[href^="termos.html"], a[href^="privacidade.html"]');
            if (!a || a.closest('.legal-overlay') || e.defaultPrevented) return;
            if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            const [file, section = ''] = a.getAttribute('href').split('#');
            try {
                if (!window.EorLegal) await loadScript(`js/legal-modal.js?v=${ASSET_V}`);
                window.EorLegal.open({ tab: file.startsWith('termos') ? 'termos' : 'privacidade', section });
            } catch {
                window.location.href = a.href;
            }
        });
    }

    // Qualquer link da página marcado com data-link="itch" aponta para a página do itch.io.
    document.querySelectorAll('[data-link="itch"]').forEach((link) => {
        link.href = ITCH_URL;
        link.target = '_blank';
        link.rel = 'noopener';
    });

    window.SiteLinks = { itch: ITCH_URL };
})();

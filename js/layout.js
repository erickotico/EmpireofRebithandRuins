// Header e footer de todas as páginas. Para mudar um link do menu ou do rodapé, mude só aqui.
// A página marca onde eles entram com <div id="site-header"></div> e <div id="site-footer"></div>
// e carrega este script ANTES do langSwitcher.js (que traduz os data-i18n).
(function () {
    const ITCH_URL = 'https://erickotico-dev.itch.io/';

    const NAV = [
        { href: 'index.html', key: 'home', label: 'Home' },
        { href: 'bestiario.html', key: 'bestiary', label: 'Bestiary' },
        { href: 'classes.html', key: 'classes', label: 'Classes' },
        { href: 'guia.html', key: 'guide', label: 'Guide' },
        { href: 'updates.html', key: 'updatesPageTitle', label: 'Updates' },
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
                { href: 'sobre.html', key: 'about', label: 'About' }
            ]
        },
        {
            key: 'support', label: 'Support', links: [
                { href: ITCH_URL, key: 'reportBug', label: 'Report a bug', external: true }
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
                <span class="brand-name" data-i18n="brandName">Empire of Rebirth & Ruins</span>
            </a>
            <nav aria-label="Menu"><ul>${nav}</ul></nav>
            <div class="header-actions">
                <button class="lang-switcher" type="button" aria-label="Change page language" title="Change language">🌐</button>
                <a class="btn btn-download" ${linkAttrs({ href: ITCH_URL, external: true })} data-i18n="download">Download</a>
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

    // Qualquer link da página marcado com data-link="itch" aponta para a página do itch.io.
    document.querySelectorAll('[data-link="itch"]').forEach((link) => {
        link.href = ITCH_URL;
        link.target = '_blank';
        link.rel = 'noopener';
    });

    window.SiteLinks = { itch: ITCH_URL };
})();

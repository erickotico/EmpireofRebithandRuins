// Termos de uso e Política de privacidade em uma janela (popup), com abas.
// O texto vem de termos.html e privacidade.html (um lugar só para editar);
// essas páginas continuam existindo para quem abrir o endereço direto.
//
//   EorLegal.open({ tab: 'termos' | 'privacidade', section: 'regras' })      → só leitura
//   EorLegal.open({ tab: 'termos', agree: true, onAgree() { ... } })        → com "Li e concordo"
(function () {
    if (window.EorLegal) return;
    const t = (key, fallback) => (window.getSiteTranslation ? window.getSiteTranslation(key, fallback) : fallback);
    const isEn = () => window.SiteI18n?.lang === 'en';
    const DOCS = {
        termos: { file: 'termos.html', key: 'termsOfUse', label: 'Terms of use' },
        privacidade: { file: 'privacidade.html', key: 'privacyPolicy', label: 'Privacy policy' }
    };
    const cache = {};

    // Estilo da janela (uma vez)
    if (!document.querySelector('link[data-legal-modal]')) {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'css/legal-modal.css?v=2026112120';
        css.dataset.legalModal = '';
        document.head.appendChild(css);
    }

    async function loadDoc(id) {
        if (!cache[id]) {
            cache[id] = fetch(DOCS[id].file, { cache: 'no-cache' })
                .then((res) => { if (!res.ok) throw new Error(String(res.status)); return res.text(); })
                .then((html) => new DOMParser().parseFromString(html, 'text/html'))
                .catch((error) => { delete cache[id]; throw error; });
        }
        const doc = await cache[id];
        const article = doc.querySelector(`.legal-text[data-lang="${isEn() ? 'en' : 'pt'}"]`);
        if (!article) throw new Error('no article');
        const copy = document.importNode(article, true);
        copy.removeAttribute('data-lang');                          // a regra que esconde o outro idioma não vale aqui
        copy.querySelectorAll('.legal-toc').forEach((n) => n.remove());
        copy.querySelectorAll('[id]').forEach((n) => { n.dataset.anchor = n.id.replace(/-en$/, ''); n.removeAttribute('id'); });
        copy.querySelectorAll('a[href^="termos.html"], a[href^="privacidade.html"]').forEach((a) => {
            a.dataset.legalTab = a.getAttribute('href').startsWith('termos') ? 'termos' : 'privacidade';
        });
        return copy;
    }

    function open({ tab = 'termos', section = '', agree = false, onAgree } = {}) {
        document.querySelector('.legal-overlay')?.remove();
        const before = document.activeElement;

        const overlay = document.createElement('div');
        overlay.className = 'legal-overlay';
        const dialog = document.createElement('div');
        dialog.className = 'legal-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-label', `${t('termsOfUse', 'Terms of use')} · ${t('privacyPolicy', 'Privacy policy')}`);
        dialog.tabIndex = -1;

        // Abas
        const head = document.createElement('div');
        head.className = 'legal-head';
        const tabs = document.createElement('div');
        tabs.className = 'legal-tabs';
        tabs.setAttribute('role', 'tablist');
        const buttons = {};
        Object.entries(DOCS).forEach(([id, d]) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.setAttribute('role', 'tab');
            b.textContent = t(d.key, d.label);
            b.addEventListener('click', () => show(id));
            buttons[id] = b;
            tabs.appendChild(b);
        });
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'legal-close';
        close.textContent = '×';
        close.setAttribute('aria-label', t('close', 'Close'));
        close.addEventListener('click', () => done(false));
        head.append(tabs, close);

        const body = document.createElement('div');
        body.className = 'legal-body';
        body.setAttribute('role', 'tabpanel');
        body.tabIndex = 0;

        // Rodapé: "Li e concordo" (cadastro) ou só "Fechar"
        const foot = document.createElement('div');
        foot.className = 'legal-foot';
        let check = null;
        const confirm = document.createElement('button');
        confirm.type = 'button';
        confirm.className = 'btn btn-download';
        if (agree) {
            const label = document.createElement('label');
            label.className = 'legal-agree';
            check = document.createElement('input');
            check.type = 'checkbox';
            const span = document.createElement('span');
            span.textContent = t('legalAgreeBox', 'I have read and agree to the Terms of use and the Privacy policy');
            label.append(check, span);
            confirm.textContent = t('legalConfirm', 'Confirm');
            confirm.disabled = true;
            check.addEventListener('change', () => { confirm.disabled = !check.checked; });
            foot.append(label, confirm);
        } else {
            confirm.textContent = t('close', 'Close');
            foot.appendChild(confirm);
        }
        confirm.addEventListener('click', () => done(agree));

        dialog.append(head, body, foot);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        document.documentElement.classList.add('legal-open');

        let ticket = 0;
        async function show(id, anchor = '') {
            const mine = ++ticket;
            Object.entries(buttons).forEach(([k, b]) => b.setAttribute('aria-selected', String(k === id)));
            body.textContent = '';
            const wait = document.createElement('p');
            wait.className = 'legal-status';
            wait.textContent = t('loading', 'Loading...');
            body.appendChild(wait);
            try {
                const article = await loadDoc(id);
                if (mine !== ticket) return;
                body.textContent = '';
                body.appendChild(article);
                const target = anchor && article.querySelector(`[data-anchor="${CSS.escape(anchor)}"]`);
                if (target) body.scrollTop = target.offsetTop - body.offsetTop - 8;
                else body.scrollTop = 0;
            } catch {
                if (mine !== ticket) return;
                wait.textContent = '';
                const a = document.createElement('a');
                a.href = DOCS[id].file;
                a.target = '_blank';
                a.rel = 'noopener';
                a.textContent = t(DOCS[id].key, DOCS[id].label);
                wait.append(`${t('errGeneric', 'Something went wrong. Please try again.')} `, a);
            }
        }
        // Links de um documento para o outro trocam de aba
        body.addEventListener('click', (e) => {
            const a = e.target.closest('a[data-legal-tab]');
            if (!a) return;
            e.preventDefault();
            show(a.dataset.legalTab, (a.getAttribute('href').split('#')[1] || ''));
        });

        function done(agreed) {
            window.removeEventListener('keydown', onKey, true);
            overlay.remove();
            document.documentElement.classList.remove('legal-open');
            if (agreed && onAgree) onAgree();
            before?.focus?.();
        }
        function onKey(e) {
            if (e.key === 'Escape') {
                e.stopImmediatePropagation();          // não fecha a janela de cadastro que está embaixo
                e.preventDefault();
                done(false);
            } else if (e.key === 'Tab') {
                const focusable = [...dialog.querySelectorAll('button:not(:disabled), input, a[href], [tabindex="0"]')];
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        }
        window.addEventListener('keydown', onKey, true);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) done(false); });

        show(DOCS[tab] ? tab : 'termos', section);
        dialog.focus();
    }

    window.EorLegal = { open };
})();

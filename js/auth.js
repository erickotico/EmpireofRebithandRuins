// Conexão com o Supabase (contas de jogador).
// A "publishable key" abaixo é PÚBLICA por natureza: ela só identifica o projeto.
// Quem protege os dados são as regras do banco (supabase/001_contas_v1.sql).
// A chave SECRETA nunca entra no site, no repositório nem no computador.
(function () {
    const SUPABASE_URL = 'https://qjpogjpmxbpuuclpdfhv.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_mYKOcjU5XYwsDQW-4Bve8g_SpCqp1Dc';
    const REMEMBER_KEY = 'eor-remember';
    const TERMS_VERSION = '2026-11-24'; // igual a current_terms_version() no banco (supabase/015_termos.sql)
    const MIN_AGE = 16;
    // Captcha (Cloudflare Turnstile). A "site key" é pública; a secreta fica só no Supabase.
    const TURNSTILE_SITE_KEY = '0x4AAAAAAGK0ljsGtPrcYIvr';

    // "Lembrar de mim" desmarcado → a sessão some quando o navegador fecha.
    function remembers() {
        try { return localStorage.getItem(REMEMBER_KEY) !== '0'; } catch { return true; }
    }
    function area() {
        try { return remembers() ? window.localStorage : window.sessionStorage; } catch { return null; }
    }
    const storage = {
        getItem(key) {
            try { return area()?.getItem(key) ?? null; } catch { return null; }
        },
        setItem(key, value) {
            try { area()?.setItem(key, value); } catch { /* armazenamento bloqueado */ }
        },
        removeItem(key) {
            try { localStorage.removeItem(key); } catch { /* */ }
            try { sessionStorage.removeItem(key); } catch { /* */ }
        }
    };

    if (!window.supabase?.createClient) {
        console.error('Biblioteca do Supabase não carregou.');
        return;
    }

    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
            storage,
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            flowType: 'pkce'
        }
    });

    // Endereço da pasta do site (funciona no GitHub Pages e no localhost).
    function siteUrl(page) {
        return new URL(page, window.location.href.split(/[?#]/)[0]).href;
    }

    function setRemember(value) {
        try { localStorage.setItem(REMEMBER_KEY, value ? '1' : '0'); } catch { /* */ }
    }

    // Idade completa na data de hoje.
    function ageOn(birth, today = new Date()) {
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1;
        return age;
    }

    // Mesmas regras do banco (public.nickname_ok).
    const NICK_RE = /^[A-Za-z0-9_À-ÖØ-öø-ÿĀ-ž-]{3,20}$/;

    // Recusas das funções de amizade (supabase/005_amizades.sql) → [chave de tradução, texto padrão]
    function friendError(error) {
        const reason = String(error?.message || '').match(/EOR_[A-Z_]+/)?.[0];
        const map = {
            EOR_NOT_FOUND: ['errPlayerNotFound', 'Player not found.'],
            EOR_SELF: ['errFriendSelf', 'You cannot add yourself.'],
            EOR_TOO_MANY: ['errFriendTooMany', 'You sent many requests in a short time. Try again in an hour.'],
            EOR_TOO_MANY_PENDING: ['errFriendTooManyPending', 'You have too many requests waiting for an answer.'],
            EOR_FRIEND_LIMIT: ['errFriendLimit', 'Friend limit reached (500).'],
            EOR_ALREADY_FRIENDS: ['errAlreadyFriends', 'You are already friends.'],
            EOR_ALREADY_SENT: ['errAlreadySent', 'Request already sent.'],
            EOR_COOLDOWN: ['errFriendCooldown', 'This player declined your request recently. Try again in a few days.'],
            EOR_BANNED: ['errBanned', 'Your account is suspended.'],
            EOR_TERMS_PENDING: ['errTermsPending', 'Accept the new terms (notice at the top of the page) to continue.'],
            EOR_GUARDIAN: ['errGuardianPending', 'Your account is waiting for your guardian\'s permission (notice at the top of the page).'],
            EOR_MFA: ['errNeedMfa', 'Confirm your two-step code to continue.'],
            EOR_BLOCKED: ['errBlocked', 'You cannot interact with this player.']
        };
        if (reason && map[reason]) return map[reason];
        console.warn('[amigos]', error?.code, error?.message);
        return ['errGeneric', 'Something went wrong. Please try again.'];
    }

    // ---------- online / visto por último (supabase/013_online.sql) ----------
    // Só amigos veem o status; quem desligou em Privacidade não aparece.
    let presenceCache = null;
    let presenceAt = 0;
    function friendsPresence(force = false) {
        if (!presenceCache || force || Date.now() - presenceAt > 60000) {
            presenceAt = Date.now();
            presenceCache = client.rpc('friends_presence')
                .then(({ data }) => new Map((data || []).map((r) => [r.nickname.toLowerCase(), r])))
                .catch(() => new Map());
        }
        return presenceCache;
    }
    // Status: online (verde), busy = ocupado (vermelho), dnd = não perturbe (amarelo), offline (cinza)
    const STATES = {
        online: ['onlineNow', 'Online now'],
        busy: ['statusBusy', 'Busy'],
        dnd: ['statusDnd', 'Do not disturb']
    };
    // Modos que o próprio jogador escolhe (Editar perfil / lateral)
    const MODES = [
        { id: 'auto', key: 'modeAuto', label: 'Online', state: 'online' },
        { id: 'busy', key: 'statusBusy', label: 'Busy', state: 'busy' },
        { id: 'dnd', key: 'statusDnd', label: 'Do not disturb', state: 'dnd' },
        { id: 'invisible', key: 'modeInvisible', label: 'Hidden', state: 'offline' }
    ];
    const isActive = (r) => !!r && r.state in STATES;
    function presenceText(r) {
        const tr = (key, fallback) => (window.getSiteTranslation ? window.getSiteTranslation(key, fallback) : fallback);
        if (!r) return '';
        if (isActive(r)) return tr(...STATES[r.state]);
        if (!r.seen_at) return '';
        const lang = window.SiteI18n?.lang === 'pt' ? 'pt-BR' : 'en';
        const s = (Date.now() - new Date(r.seen_at).getTime()) / 1000;
        const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
        const ago = s < 3600 ? rtf.format(-Math.max(1, Math.floor(s / 60)), 'minute')
            : s < 86400 ? rtf.format(-Math.floor(s / 3600), 'hour')
                : s < 30 * 86400 ? rtf.format(-Math.floor(s / 86400), 'day')
                    : new Date(r.seen_at).toLocaleDateString(lang, { day: 'numeric', month: 'short' });
        return `${tr('lastSeen', 'Last seen')} ${ago}`;
    }
    // Bolinha colorida na foto (verde / vermelha / amarela / cinza)
    function markOnline(picEl, r) {
        if (!picEl || !r || picEl.querySelector('.presence-dot')) return;
        picEl.classList.add('has-presence');
        const dot = document.createElement('span');
        dot.className = `presence-dot state-${isActive(r) ? r.state : 'offline'}`;
        dot.title = presenceText(r) || 'Offline';
        picEl.appendChild(dot);
    }
    // Classe para o texto do status (cor)
    const textClass = (r) => `presence-text state-${isActive(r) ? r.state : 'offline'}`;

    // Escolher o próprio status: mostra só o atual; ao clicar abre a lista com os outros.
    // Salva no perfil (presence_mode).
    let pickerSeq = 0;
    function statusPicker(current, onSaved) {
        const tr = (key, fallback) => (window.getSiteTranslation ? window.getSiteTranslation(key, fallback) : fallback);
        const box = document.createElement('div');
        box.className = 'status-picker';
        let mode = MODES.some((m) => m.id === current) ? current : 'auto';
        const menuId = `statusMenu${++pickerSeq}`;

        const makeItem = (m) => {
            const dot = document.createElement('span');
            dot.className = `presence-dot state-${m.state}`;
            const label = document.createElement('span');
            label.className = 'status-picker-label';
            label.textContent = tr(m.key, m.label);
            return [dot, label];
        };

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'status-picker-toggle';
        toggle.setAttribute('aria-haspopup', 'menu');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', menuId);
        const caret = document.createElement('span');
        caret.className = 'status-picker-caret';
        caret.setAttribute('aria-hidden', 'true');

        const menu = document.createElement('div');
        menu.className = 'status-picker-menu';
        menu.id = menuId;
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', tr('myStatus', 'My status'));
        menu.hidden = true;

        const options = MODES.map((m) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.dataset.mode = m.id;
            b.setAttribute('role', 'menuitemradio');
            b.append(...makeItem(m));
            b.addEventListener('click', () => choose(m));
            menu.appendChild(b);
            return b;
        });

        const paint = () => {
            const m = MODES.find((x) => x.id === mode);
            toggle.replaceChildren(...makeItem(m), caret);
            toggle.title = `${tr('myStatus', 'My status')}: ${tr(m.key, m.label)}`;
            options.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
        };

        const onOutside = (e) => { if (!box.contains(e.target)) close(); };
        function open() {
            menu.hidden = false;
            box.classList.add('is-open');
            toggle.setAttribute('aria-expanded', 'true');
            (options.find((b) => b.dataset.mode === mode) || options[0]).focus();
            document.addEventListener('pointerdown', onOutside, true);
        }
        function close(focusToggle = false) {
            if (menu.hidden) return;
            menu.hidden = true;
            box.classList.remove('is-open');
            toggle.setAttribute('aria-expanded', 'false');
            document.removeEventListener('pointerdown', onOutside, true);
            if (focusToggle) toggle.focus();
        }
        async function choose(m) {
            close(true);
            if (m.id === mode) return;
            const previous = mode;
            mode = m.id;
            paint();
            const { data: { session } } = await client.auth.getSession();
            const { error } = session
                ? await client.from('profiles').update({ presence_mode: m.id }).eq('id', session.user.id)
                : { error: true };
            if (error) { mode = previous; paint(); }
            onSaved?.(error ? null : m.id);
        }

        toggle.addEventListener('click', () => (menu.hidden ? open() : close()));
        toggle.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); }
        });
        menu.addEventListener('keydown', (e) => {
            const i = options.indexOf(document.activeElement);
            if (e.key === 'Escape') { e.preventDefault(); close(true); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); options[(i + 1) % options.length].focus(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); options[(i - 1 + options.length) % options.length].focus(); }
            else if (e.key === 'Home') { e.preventDefault(); options[0].focus(); }
            else if (e.key === 'End') { e.preventDefault(); options[options.length - 1].focus(); }
            else if (e.key === 'Tab') close();
        });

        box.append(toggle, menu);
        paint();
        return box;
    }

    // O próprio status escolhido (supabase/014_status_privado.sql). Sem o 014, lê a coluna direto.
    async function myPresenceMode() {
        const { data: { session } } = await client.auth.getSession();
        if (!session) return null;
        const { data, error } = await client.rpc('my_presence_mode');
        if (!error) return typeof data === 'string' ? data : null;
        const r = await client.from('profiles').select('presence_mode').eq('id', session.user.id).maybeSingle();
        return typeof r.data?.presence_mode === 'string' ? r.data.presence_mode : null;
    }

    // ---------- janela de denúncia (feed e mensagens; supabase/019_comunidade_moderacao.sql) ----------
    // Devolve { category, reason } ou null (cancelou). As categorias graves vão para o topo da moderação.
    const REPORT_CATEGORIES = [
        ['spam', 'reportCatSpam', 'Spam or advertising'],
        ['ofensa', 'reportCatHate', 'Hate or discrimination'],
        ['assedio', 'reportCatHarass', 'Harassment, threats to annoy, stalking'],
        ['sexual', 'reportCatSexual', 'Sexual content or nudity'],
        ['menor', 'reportCatMinor', 'Sexual content involving minors'],
        ['ameaca', 'reportCatThreat', 'Threat or real violence'],
        ['autolesao', 'reportCatSelfHarm', 'Someone at risk of hurting themselves'],
        ['golpe', 'reportCatScam', 'Scam, phishing or dangerous link'],
        ['dados', 'reportCatDoxx', "Exposes someone's personal data"],
        ['trapaca', 'reportCatCheat', 'Cheats, hacks or selling accounts'],
        ['outro', 'reportCatOther', 'Something else']
    ];
    function reportDialog() {
        const tr = (k, f) => (window.getSiteTranslation ? window.getSiteTranslation(k, f) : f);
        const el = (tag, cls, text) => {
            const n = document.createElement(tag);
            if (cls) n.className = cls;
            if (text !== undefined) n.textContent = text;
            return n;
        };
        return new Promise((resolve) => {
            const dialog = el('dialog', 'report-dialog');
            dialog.setAttribute('aria-labelledby', 'reportDialogTitle');
            const form = el('form', 'report-form');
            form.method = 'dialog';
            const title = el('h2', 'report-title', tr('report', 'Report'));
            title.id = 'reportDialogTitle';
            const fieldset = el('fieldset', 'report-cats');
            fieldset.appendChild(el('legend', '', tr('reportWhat', 'What is wrong?')));
            REPORT_CATEGORIES.forEach(([value, key, fallback]) => {
                const label = el('label', 'report-cat');
                const radio = el('input');
                radio.type = 'radio';
                radio.name = 'category';
                radio.value = value;
                label.append(radio, el('span', '', tr(key, fallback)));
                fieldset.appendChild(label);
            });
            const help = el('p', 'report-help', tr('reportSelfHarmHelp', 'If someone is in danger right now, contact local emergency services.'));
            help.hidden = true;
            const reasonLabel = el('label', 'report-reason-label', tr('reportDetails', 'Details (optional)'));
            const reason = el('textarea', 'report-reason');
            reason.maxLength = 300;
            reason.rows = 3;
            reasonLabel.appendChild(reason);
            const err = el('p', 'report-error');
            err.setAttribute('role', 'alert');
            const row = el('div', 'report-actions');
            const cancel = el('button', 'btn btn-login', tr('cancel', 'Cancel'));
            cancel.type = 'button';
            const send = el('button', 'btn btn-download', tr('reportSend', 'Send report'));
            send.type = 'submit';
            row.append(cancel, send);
            const note = el('p', 'report-note', tr('reportPrivate', 'The reported player does not find out who reported.'));
            form.append(title, fieldset, help, reasonLabel, err, row, note);
            dialog.appendChild(form);
            document.body.appendChild(dialog);

            let done = false;
            const finish = (result) => {
                if (done) return;
                done = true;
                if (dialog.open) dialog.close();
                dialog.remove();
                resolve(result);
            };
            fieldset.addEventListener('change', () => {
                help.hidden = form.category.value !== 'autolesao';
                err.textContent = '';
            });
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                if (!form.category.value) {
                    err.textContent = tr('reportPickOne', 'Choose what is wrong.');
                    return;
                }
                finish({ category: form.category.value, reason: reason.value.trim().slice(0, 300) });
            });
            cancel.addEventListener('click', () => finish(null));
            dialog.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });   // Esc
            dialog.addEventListener('close', () => finish(null));
            dialog.showModal();
            fieldset.querySelector('input')?.focus();
        });
    }

    window.EorAuth = {
        presence: { friends: friendsPresence, text: presenceText, mark: markOnline, active: isActive, textClass, picker: statusPicker, myMode: myPresenceMode, MODES },
        reportDialog,
        reportCategories: REPORT_CATEGORIES,
        friendError,
        client,
        SUPABASE_URL,
        SUPABASE_KEY,
        siteUrl,
        setRemember,
        remembers,
        ageOn,
        NICK_RE,
        TERMS_VERSION,
        MIN_AGE,
        TURNSTILE_SITE_KEY
    };
})();

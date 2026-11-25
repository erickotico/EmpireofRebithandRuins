// Painel de moderação. Quem não é admin (ou não entrou com o 2FA) vê "Página não encontrada":
// o banco recusa todas as funções admin_* para qualquer outra pessoa
// (supabase/008_comunidade.sql e supabase/016_moderacao.sql).
//
// Abas: Denúncias · Jogadores (ficha + punições) · Punidos · Histórico
// Endereços: moderacao.html#jogador=Apelido · #jogadores · #punidos · #historico
document.addEventListener('DOMContentLoaded', async () => {
    const t = (key, fallback) => (window.getSiteTranslation ? window.getSiteTranslation(key, fallback) : fallback);
    const $ = (id) => document.getElementById(id);
    const lang = () => (window.SiteI18n?.lang === 'pt' ? 'pt-BR' : 'en');
    const auth = window.EorAuth;
    const crests = window.SiteCrests;
    const deny = () => { $('modStatus').hidden = true; $('modWrap').hidden = true; $('modDenied').hidden = false; };
    if (!auth) { deny(); return; }
    const { client } = auth;

    const { data: { session } } = await client.auth.getSession();
    if (!session) { deny(); return; }

    const BUCKET = 'post-images';
    const imageUrl = (path) => `${auth.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
    const profileUrl = (nick) => `perfil.html?n=${encodeURIComponent(nick)}`;
    const postUrl = (id) => `comunidade.html?post=${id}`;
    const when = (d) => new Date(d).toLocaleString(lang(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const day = (d) => new Date(d).toLocaleDateString(lang(), { day: 'numeric', month: 'short', year: 'numeric' });

    function node(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined && text !== null) el.textContent = text;
        return el;
    }
    function button(label, className, onClick) {
        const b = node('button', `post-btn${className ? ` ${className}` : ''}`, label);
        b.type = 'button';
        if (onClick) b.addEventListener('click', onClick);
        return b;
    }
    function picFor(p) {
        const span = node('span', 'player-pic');
        if (p.avatar && crests?.find(p.avatar)) {
            span.innerHTML = crests.avatar(p.avatar);
        } else {
            span.classList.add('is-initial');
            span.textContent = (p.nickname || '?').charAt(0).toUpperCase();
        }
        return span;
    }

    // Recusas do banco → texto
    const ERRORS = {
        EOR_PROTECTED: ['modErrProtected', 'Admins cannot be penalized from the site.'],
        EOR_REASON: ['modErrReason', 'Write a reason (at least 3 characters).'],
        EOR_NOT_FOUND: ['errPlayerNotFound', 'Player not found.'],
        EOR_NOT_BANNED: ['modErrNotBanned', 'This player is not suspended.'],
        EOR_NICK_INVALID: ['nicknameInvalid', 'Use 3 to 20 letters or numbers, no spaces.'],
        EOR_NICK_TAKEN: ['nicknameTaken', 'This nickname is already taken.'],
        EOR_FORBIDDEN: ['modErrForbidden', 'Only admins with two-step verification can do this.']
    };
    function errText(error) {
        const code = String(error?.message || '').match(/EOR_[A-Z_]+/)?.[0];
        if (code && ERRORS[code]) return t(...ERRORS[code]);
        console.warn('[moderacao]', error?.code, error?.message);
        return t('errGeneric', 'Something went wrong. Please try again.');
    }

    const ACTIONS = {
        suspend: ['modActSuspend', 'Suspension'],
        ban: ['modActBan', 'Permanent ban'],
        unban: ['modActUnban', 'Unbanned'],
        warn: ['modActWarn', 'Warning'],
        clear_bio: ['modActClearBio', 'Bio removed'],
        clear_avatar: ['modActClearAvatar', 'Crest removed'],
        rename: ['modActRename', 'Nickname changed'],
        remove_post: ['modActRemovePost', 'Post removed'],
        remove_comment: ['modActRemoveComment', 'Comment removed'],
        purge: ['modActPurge', 'All content deleted']
    };
    const actionLabel = (a) => t(...(ACTIONS[a] || ['', a]));

    // Motivos prontos (um clique preenche o campo; dá para completar à mão)
    const REASONS = [
        ['modRsHate', 'Hate or discrimination'],
        ['modRsHarass', 'Harassment or threats'],
        ['modRsSexual', 'Sexual content'],
        ['modRsViolence', 'Real violence or shocking content'],
        ['modRsDoxx', 'Exposing personal data'],
        ['modRsScam', 'Scam or dangerous link'],
        ['modRsSpam', 'Spam or advertising'],
        ['modRsCheat', 'Cheating'],
        ['modRsImperson', 'Impersonation'],
        ['modRsNick', 'Inappropriate nickname']
    ];

    // ======================= Abas =======================
    const TABS = { denuncias: 'Reports', jogadores: 'Players', punidos: 'Penalized', historico: 'History' };
    const tabButtons = document.querySelectorAll('.mod-tabs [role="tab"]');
    let current = 'denuncias';
    function showTab(id, { push = true, focus = false } = {}) {
        if (!TABS[id]) id = 'denuncias';
        current = id;
        tabButtons.forEach((b) => {
            const on = b.dataset.tab === id;
            b.setAttribute('aria-selected', String(on));
            b.tabIndex = on ? 0 : -1;
            if (on && focus) b.focus();
        });
        document.querySelectorAll('.mod-panel').forEach((p) => { p.hidden = p.dataset.panel !== id; });
        if (push && !(id === 'jogadores' && openNick)) history.replaceState(null, '', id === 'denuncias' ? 'moderacao.html' : `#${id}`);
        if (id === 'punidos') loadBans();
        if (id === 'historico' && !logLoaded) loadLog(true);
    }
    tabButtons.forEach((b, i) => {
        b.addEventListener('click', () => { if (b.dataset.tab === 'jogadores') openNick = null; showTab(b.dataset.tab); });
        b.addEventListener('keydown', (e) => {
            const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (!dir) return;
            const next = tabButtons[(i + dir + tabButtons.length) % tabButtons.length];
            showTab(next.dataset.tab, { focus: true });
        });
    });

    // ======================= Denúncias =======================
    const SOURCES = {
        message: ['reportSourceMessage', 'Private message'],
        post: ['reportSourcePost', 'Post'],
        comment: ['reportSourceComment', 'Comment']
    };

    function reportCard(r) {
        const article = node('article', 'post-card mod-card');
        const head = node('header', 'post-head');
        const headText = node('div', 'post-head-text');
        const title = node('strong', 'post-name', t(...SOURCES[r.source]));
        const meta = node('p', 'mod-meta');
        meta.append(
            `${t('reportedBy', 'Reported by')} `, node('strong', '', r.reporter || '—'),
            ` · ${t('author', 'Author')}: `, node('strong', '', r.reported || '—'),
            ` · ${when(r.created_at)}`
        );
        headText.append(title, meta);
        head.appendChild(headText);
        // Categoria escolhida por quem denunciou; as graves vêm primeiro e em destaque
        const cat = (window.EorAuth?.reportCategories || []).find(([v]) => v === r.category);
        if (r.urgent) {
            article.classList.add('is-urgent');
            head.appendChild(node('span', 'post-tag tag-urgent', t('reportUrgent', 'Urgent')));
        }
        if (cat && r.category !== 'outro') head.appendChild(node('span', 'post-tag mod-cat', t(cat[1], cat[2])));
        if (!r.still_exists) head.appendChild(node('span', 'post-tag', t('alreadyRemoved', 'Already removed')));
        article.appendChild(head);

        if (r.reason) {
            const reason = node('p', 'mod-reason');
            reason.append(node('strong', '', `${t('reportReason', 'Reason')}: `), r.reason);
            article.appendChild(reason);
        }
        const body = node('p', 'post-body', r.body || '');
        body.hidden = !r.body;
        article.appendChild(body);
        if (r.image_path && r.still_exists) {
            const img = node('img', 'mod-image');
            img.src = imageUrl(r.image_path);
            img.alt = '';
            img.loading = 'lazy';
            article.appendChild(img);
        }

        const actions = node('div', 'post-edit-row mod-actions');
        if (r.post_id && r.still_exists) {
            const see = node('a', 'post-btn', t('seePost', 'See post'));
            see.href = postUrl(r.post_id);
            see.target = '_blank';
            see.rel = 'noopener';
            actions.appendChild(see);
        }
        if (r.reported) actions.appendChild(button(t('modSeePlayer', 'Player sheet'), '', () => openPlayer(r.reported)));
        actions.appendChild(button(t('dismissReport', 'Dismiss'), '', () => resolve(r, 'dismiss', article)));
        if (r.source !== 'message' && r.still_exists) {
            actions.appendChild(button(t('removeContent', 'Remove content'), 'is-danger', () => {
                if (window.confirm(t('removeContentConfirm', 'Remove this content for everyone?'))) resolve(r, 'remove', article);
            }));
        } else {
            actions.appendChild(button(t('markResolved', 'Mark as resolved'), 'is-main', () => resolve(r, 'remove', article)));
        }
        article.appendChild(actions);
        return article;
    }

    async function resolve(r, action, article) {
        article.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        const { data: path, error } = await client.rpc('admin_resolve_report', { p_source: r.source, p_id: r.id, p_action: action });
        if (error) {
            article.querySelectorAll('button').forEach((b) => { b.disabled = false; });
            window.alert(errText(error));
            return;
        }
        if (path) await client.storage.from(BUCKET).remove([path]);
        await loadReports();
        window.dispatchEvent(new Event('eor-messages-changed'));
    }

    async function loadReports() {
        const { data, error } = await client.rpc('admin_open_reports');
        if (error) return false;
        const list = $('modList');
        list.textContent = '';
        (data || []).forEach((r) => list.appendChild(reportCard(r)));
        $('modEmpty').hidden = (data || []).length > 0;
        $('countReports').textContent = (data || []).length ? String(data.length) : '';
        return true;
    }

    // ======================= Jogadores =======================
    let openNick = null;
    const search = $('modSearch');
    const suggest = $('modSuggest');
    let searchTicket = 0;
    let searchTimer = null;

    search.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(async () => {
            const q = search.value.trim();
            const ticket = ++searchTicket;
            if (q.length < 2) { suggest.textContent = ''; suggest.hidden = true; return; }
            const { data } = await client.rpc('admin_find_players', { p_query: q });
            if (ticket !== searchTicket) return;
            suggest.textContent = '';
            (data || []).forEach((p) => {
                const li = node('li');
                const b = node('button', 'mod-suggest-item');
                b.type = 'button';
                b.append(picFor(p), node('span', '', p.nickname));
                if (p.banned) b.appendChild(node('span', 'mod-pill is-ban', t('modPenalized', 'Penalized')));
                b.addEventListener('click', () => openPlayer(p.nickname));
                li.appendChild(b);
                suggest.appendChild(li);
            });
            if (!(data || []).length) suggest.appendChild(node('li', 'mod-suggest-empty', t('errPlayerNotFound', 'Player not found.')));
            suggest.hidden = false;
        }, 220);
    });
    $('modSearchForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const q = search.value.trim();
        if (q) openPlayer(q);
    });

    async function openPlayer(nick) {
        openNick = nick;
        search.value = '';
        suggest.textContent = '';
        suggest.hidden = true;
        showTab('jogadores', { push: false });
        history.replaceState(null, '', `#jogador=${encodeURIComponent(nick)}`);
        const box = $('modSheet');
        box.textContent = '';
        box.appendChild(node('p', 'post-status', t('loading', 'Loading...')));
        const { data, error } = await client.rpc('admin_player', { p_nick: nick });
        if (openNick !== nick) return;
        box.textContent = '';
        if (error) { box.appendChild(node('p', 'post-empty', errText(error))); return; }
        openNick = data.nickname;
        box.appendChild(sheet(data));
        box.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    function stat(label, value) {
        const div = node('div', 'mod-stat');
        div.append(node('dt', '', label), node('dd', '', String(value)));
        return div;
    }

    function banLine(ban) {
        const p = node('p', 'mod-ban-state');
        p.append(node('strong', '', ban.until
            ? `${t('modSuspendedUntil', 'Suspended until')} ${when(ban.until)}`
            : t('modBannedForever', 'Permanently banned')));
        p.append(` · ${ban.reason}`);
        return p;
    }

    function sheet(p) {
        const wrap = node('article', 'mod-sheet');

        // Cabeçalho
        const head = node('header', 'mod-sheet-head');
        const pic = picFor(p);
        const who = node('div', 'mod-sheet-who');
        const name = node('h2', 'mod-sheet-name', p.nickname);
        if (p.is_admin) name.appendChild(node('span', 'mod-pill', 'Admin'));
        const meta = node('p', 'mod-meta');
        meta.textContent = `${t('memberSince', 'Member since')} ${day(p.created_at)}`
            + (p.last_seen ? ` · ${t('lastSeen', 'Last seen')} ${when(p.last_seen)}` : '');
        who.append(name, meta);
        const see = node('a', 'post-btn', t('seeProfile', 'See profile'));
        see.href = profileUrl(p.nickname);
        see.target = '_blank';
        see.rel = 'noopener';
        head.append(pic, who, see);
        wrap.appendChild(head);
        if (p.ban) wrap.appendChild(banLine(p.ban));

        // Números
        const dl = node('dl', 'mod-stats');
        dl.append(
            stat(t('modStatPosts', 'Posts'), p.posts),
            stat(t('modStatComments', 'Comments'), p.comments),
            stat(t('modStatReported', 'Times reported'), p.reports_against),
            stat(t('modStatRemoved', 'Content removed'), p.reports_removed),
            stat(t('modStatReports', 'Reports made'), p.reports_made)
        );
        wrap.appendChild(dl);

        if (p.bio) {
            const bio = node('blockquote', 'mod-bio', p.bio);
            wrap.appendChild(bio);
        }

        if (p.is_admin) {
            wrap.appendChild(node('p', 'mod-note', t('modErrProtected', 'Admins cannot be penalized from the site.')));
        } else {
            wrap.appendChild(penaltyBox(p));
            if (p.ban) wrap.appendChild(unbanBox(p));
            wrap.appendChild(profileBox(p));
        }

        // Conteúdo recente
        const recent = node('section', 'mod-box');
        recent.appendChild(node('h3', 'mod-box-title', t('modRecent', 'Recent content')));
        if (!p.recent.length) recent.appendChild(node('p', 'side-empty', t('modNothing', 'Nothing yet.')));
        else {
            const ul = node('ul', 'mod-lines');
            p.recent.forEach((r) => {
                const li = node('li');
                const a = node('a', 'mod-line');
                a.href = postUrl(r.post_id);
                a.target = '_blank';
                a.rel = 'noopener';
                a.append(
                    node('span', 'mod-pill', r.kind === 'post' ? t('reportSourcePost', 'Post') : t('reportSourceComment', 'Comment')),
                    node('span', 'mod-line-text', r.body || (r.has_image ? t('modImageOnly', '(image)') : '')),
                    node('small', 'mod-line-when', when(r.created_at))
                );
                li.appendChild(a);
                ul.appendChild(li);
            });
            recent.appendChild(ul);
        }
        wrap.appendChild(recent);

        // Histórico do jogador
        const hist = node('section', 'mod-box');
        hist.appendChild(node('h3', 'mod-box-title', t('modPlayerHistory', 'Moderation history')));
        if (!p.history.length) hist.appendChild(node('p', 'side-empty', t('modNoHistory', 'No penalties so far.')));
        else hist.appendChild(logList(p.history, false));
        wrap.appendChild(hist);
        return wrap;
    }

    function reasonField(id, max) {
        const field = node('div', 'mod-field');
        const label = node('label', '', t('reportReason', 'Reason'));
        label.htmlFor = id;
        const area = node('textarea');
        area.id = id;
        area.rows = 2;
        area.maxLength = max;
        area.required = true;
        field.append(label, area);
        return { field, area };
    }

    function penaltyBox(p) {
        const box = node('form', 'mod-box');
        box.noValidate = true;
        box.appendChild(node('h3', 'mod-box-title', t('modPenalize', 'Warn or penalize')));

        const OPTIONS = [
            ['warn', t('modActWarn', 'Warning')],
            ['1', t('modDays1', '1 day')],
            ['3', t('modDays3', '3 days')],
            ['7', t('modDays7', '7 days')],
            ['30', t('modDays30', '30 days')],
            ['ban', t('modForever', 'Permanent')]
        ];
        const kinds = node('div', 'mod-choices');
        kinds.setAttribute('role', 'radiogroup');
        kinds.setAttribute('aria-label', t('modPenalize', 'Warn or penalize'));
        OPTIONS.forEach(([value, label], i) => {
            const l = node('label', 'mod-choice');
            const input = node('input');
            input.type = 'radio';
            input.name = 'modKind';
            input.value = value;
            input.checked = i === 0;
            l.append(input, node('span', '', label));
            kinds.appendChild(l);
        });
        box.appendChild(kinds);

        const chips = node('div', 'mod-reasons');
        const { field, area } = reasonField('modReason', 300);
        REASONS.forEach(([key, fb]) => {
            const chip = node('button', 'mod-reason-chip', t(key, fb));
            chip.type = 'button';
            chip.addEventListener('click', () => {
                const text = t(key, fb);
                area.value = area.value.trim() ? `${area.value.trim()} · ${text}` : text;
                area.focus();
            });
            chips.appendChild(chip);
        });
        box.append(chips, field);

        const purgeLabel = node('label', 'checkbox mod-purge');
        const purge = node('input');
        purge.type = 'checkbox';
        purgeLabel.append(purge, node('span', '', t('modPurge', 'Also delete ALL their posts and comments')));
        box.appendChild(purgeLabel);

        const error = node('p', 'post-error');
        error.setAttribute('role', 'alert');
        error.hidden = true;
        const submit = button(t('modApply', 'Apply'), 'is-main');
        submit.type = 'submit';
        const row = node('div', 'post-edit-row');
        row.appendChild(submit);
        box.append(error, row);

        const kind = () => box.querySelector('input[name="modKind"]:checked').value;
        const paint = () => {
            const k = kind();
            purgeLabel.hidden = k === 'warn';
            area.maxLength = k === 'warn' ? 500 : 300;
            submit.classList.toggle('is-danger', k !== 'warn');
            submit.classList.toggle('is-main', k === 'warn');
            submit.textContent = k === 'warn' ? t('modSendWarning', 'Send warning') : t('modApply', 'Apply');
        };
        kinds.addEventListener('change', paint);
        paint();

        box.addEventListener('submit', async (e) => {
            e.preventDefault();
            error.hidden = true;
            const reason = area.value.trim();
            if (reason.length < 3) { error.textContent = t('modErrReason', 'Write a reason (at least 3 characters).'); error.hidden = false; area.focus(); return; }
            const k = kind();
            const days = k === 'warn' || k === 'ban' ? null : Number(k);
            const label = OPTIONS.find(([v]) => v === k)[1];
            const sure = k === 'warn'
                ? true
                : window.confirm(`${t('modConfirmPenalty', 'Apply this penalty to')} ${p.nickname}?\n${label} · ${reason}`
                    + (purge.checked ? `\n\n${t('modConfirmPurge', 'ALL their posts and comments will be deleted. This cannot be undone.')}` : ''));
            if (!sure) return;
            submit.disabled = true;
            const { data, error: err } = k === 'warn'
                ? await client.rpc('admin_warn', { p_nick: p.nickname, p_text: reason })
                : await client.rpc('admin_ban', { p_nick: p.nickname, p_days: days, p_reason: reason, p_purge: purge.checked });
            submit.disabled = false;
            if (err) { error.textContent = errText(err); error.hidden = false; return; }
            if (Array.isArray(data) && data.length) await client.storage.from(BUCKET).remove(data);
            loadReports();
            openPlayer(p.nickname);
        });
        return box;
    }

    function unbanBox(p) {
        const box = node('form', 'mod-box');
        box.noValidate = true;
        box.appendChild(node('h3', 'mod-box-title', t('modUnbanTitle', 'Lift the penalty')));
        const { field, area } = reasonField('modUnbanReason', 300);
        const error = node('p', 'post-error');
        error.setAttribute('role', 'alert');
        error.hidden = true;
        const submit = button(t('modUnban', 'Unban'), 'is-main');
        submit.type = 'submit';
        const row = node('div', 'post-edit-row');
        row.appendChild(submit);
        box.append(field, error, row);
        box.addEventListener('submit', async (e) => {
            e.preventDefault();
            error.hidden = true;
            submit.disabled = true;
            const { error: err } = await client.rpc('admin_unban', { p_nick: p.nickname, p_reason: area.value.trim() });
            submit.disabled = false;
            if (err) { error.textContent = errText(err); error.hidden = false; return; }
            openPlayer(p.nickname);
        });
        return box;
    }

    function profileBox(p) {
        const box = node('section', 'mod-box');
        box.appendChild(node('h3', 'mod-box-title', t('modProfileTitle', 'Profile')));
        const error = node('p', 'post-error');
        error.setAttribute('role', 'alert');
        error.hidden = true;
        const askReason = () => {
            const r = window.prompt(t('modAskReason', 'Reason (the player will see it):'), '');
            return r === null ? null : r.trim();
        };
        const run = async (fn, args, btn) => {
            error.hidden = true;
            btn.disabled = true;
            const { error: err } = await client.rpc(fn, args);
            btn.disabled = false;
            if (err) { error.textContent = errText(err); error.hidden = false; return false; }
            return true;
        };

        const row = node('div', 'post-edit-row');
        if (p.bio) {
            const b = button(t('modClearBio', 'Remove bio'), '', async () => {
                const reason = askReason();
                if (reason === null) return;
                if (await run('admin_clear_profile', { p_nick: p.nickname, p_what: 'bio', p_reason: reason }, b)) openPlayer(p.nickname);
            });
            row.appendChild(b);
        }
        if (p.avatar) {
            const b = button(t('modClearAvatar', 'Remove crest'), '', async () => {
                const reason = askReason();
                if (reason === null) return;
                if (await run('admin_clear_profile', { p_nick: p.nickname, p_what: 'avatar', p_reason: reason }, b)) openPlayer(p.nickname);
            });
            row.appendChild(b);
        }
        if (row.childElementCount) box.appendChild(row);

        const rename = node('form', 'mod-rename');
        rename.noValidate = true;
        const label = node('label', '', t('modNewNick', 'New nickname'));
        label.htmlFor = 'modNewNick';
        const input = node('input');
        input.id = 'modNewNick';
        input.maxLength = 20;
        input.autocomplete = 'off';
        input.spellcheck = false;
        const go = button(t('modRename', 'Change nickname'));
        go.type = 'submit';
        rename.append(label, input, go);
        rename.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nick = input.value.trim();
            if (!auth.NICK_RE?.test(nick)) { error.textContent = t('nicknameInvalid', 'Use 3 to 20 letters or numbers, no spaces.'); error.hidden = false; return; }
            const reason = askReason();
            if (reason === null) return;
            if (await run('admin_rename', { p_nick: p.nickname, p_new: nick, p_reason: reason }, go)) openPlayer(nick);
        });
        box.append(rename, error);
        return box;
    }

    // ======================= Punidos =======================
    async function loadBans() {
        const list = $('modBans');
        const { data, error } = await client.rpc('admin_bans_list');
        list.textContent = '';
        if (error) { list.appendChild(node('p', 'post-empty', errText(error))); return; }
        $('countBans').textContent = (data || []).length ? String(data.length) : '';
        if (!(data || []).length) { list.appendChild(node('p', 'post-empty', t('modNoBans', 'Nobody is penalized right now.'))); return; }
        const ul = node('ul', 'mod-lines mod-bans');
        data.forEach((b) => {
            const li = node('li');
            const btn = node('button', 'mod-line');
            btn.type = 'button';
            const text = node('span', 'mod-line-text');
            text.append(node('strong', '', b.nickname), ` · ${b.reason}`);
            btn.append(
                picFor(b), text,
                node('span', `mod-pill${b.until ? '' : ' is-ban'}`, b.until ? `${t('modUntil', 'until')} ${day(b.until)}` : t('modForever', 'Permanent'))
            );
            btn.title = `${when(b.since)}${b.by_nick ? ` · ${b.by_nick}` : ''}`;
            btn.addEventListener('click', () => openPlayer(b.nickname));
            li.appendChild(btn);
            ul.appendChild(li);
        });
        list.appendChild(ul);
    }

    // ======================= Histórico =======================
    let logLoaded = false;
    let logBefore = null;
    function logList(rows, withTarget) {
        const ul = node('ul', 'mod-log');
        rows.forEach((a) => {
            const li = node('li', `mod-log-item is-${a.action}`);
            const top = node('p', 'mod-log-top');
            top.append(node('strong', '', actionLabel(a.action)));
            if (withTarget) {
                const target = a.target_now || a.target_nick;
                if (target) {
                    top.append(' · ');
                    const link = node('button', 'mod-log-target', target);
                    link.type = 'button';
                    link.addEventListener('click', () => openPlayer(target));
                    top.appendChild(link);
                }
            }
            top.append(node('small', 'mod-line-when', `${when(a.created_at)}${a.admin_nick ? ` · ${a.admin_nick}` : ''}`));
            li.appendChild(top);
            const extra = [a.detail, a.reason].filter(Boolean).join(' · ');
            if (extra) li.appendChild(node('p', 'mod-log-text', extra));
            ul.appendChild(li);
        });
        return ul;
    }
    async function loadLog(reset) {
        const box = $('modLog');
        const more = $('modLogMore');
        if (reset) { box.textContent = ''; logBefore = null; }
        more.disabled = true;
        const { data, error } = await client.rpc('admin_mod_log', { p_before: logBefore, p_limit: 50 });
        more.disabled = false;
        if (error) { box.appendChild(node('p', 'post-empty', errText(error))); return; }
        logLoaded = true;
        const rows = data || [];
        if (reset && !rows.length) box.appendChild(node('p', 'post-empty', t('modNoHistory', 'No penalties so far.')));
        if (rows.length) {
            box.appendChild(logList(rows, true));
            logBefore = rows[rows.length - 1].id;
        }
        more.hidden = rows.length < 50;
    }
    $('modLogMore').addEventListener('click', () => loadLog(false));

    // ======================= Início =======================
    if (!(await loadReports())) { deny(); return; }
    $('modStatus').hidden = true;
    $('modWrap').hidden = false;
    client.rpc('admin_bans_list').then(({ data }) => { $('countBans').textContent = (data || []).length ? String(data.length) : ''; });

    const route = () => {
        const hash = decodeURIComponent(window.location.hash.slice(1));
        if (hash.startsWith('jogador=')) openPlayer(hash.slice(8));
        else showTab(hash || 'denuncias', { push: false });
    };
    route();
    window.addEventListener('hashchange', route);
    document.addEventListener('site-language-changed', () => {
        loadReports();
        if (current === 'punidos') loadBans();
        if (current === 'historico') loadLog(true); else logLoaded = false;
        if (current === 'jogadores' && openNick) openPlayer(openNick);
    });
});

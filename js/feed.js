// Publicações da comunidade (usado em social.html, taverna.html e no centro do perfil).
// Regras ficam no banco (supabase/008_comunidade.sql). Tudo que vem do banco entra como TEXTO.
//   EorFeed.ready()                    → { me, isAdmin } (uma vez por página)
//   EorFeed.list(elemento, opções)     → lista com "carregar mais"
//   EorFeed.composer(elemento, aoPublicar)
(function () {
    const auth = window.EorAuth;
    const crests = window.SiteCrests;
    if (!auth || !crests) return;
    const { client } = auth;
    const t = (key, fallback) => (window.getSiteTranslation ? window.getSiteTranslation(key, fallback) : fallback);
    const lang = () => (window.SiteI18n?.lang === 'pt' ? 'pt-BR' : 'en');
    const BUCKET = 'post-images';
    const imageUrl = (path) => `${auth.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;

    const TAGS = [
        { id: 'geral', key: 'tagGeneral', label: 'General' },
        { id: 'pergunta', key: 'tagQuestion', label: 'Question' },
        { id: 'dica', key: 'tagTip', label: 'Tip' },
        { id: 'arte', key: 'tagArt', label: 'Art & screenshots' },
        { id: 'anuncio', key: 'tagNews', label: 'Announcement', admin: true }
    ];
    const tagLabel = (id) => {
        const tag = TAGS.find((x) => x.id === id) || TAGS[0];
        return t(tag.key, tag.label);
    };

    // ---------- quem está vendo ----------
    let readyPromise = null;
    function ready() {
        if (!readyPromise) {
            readyPromise = (async () => {
                const { data: { session } } = await client.auth.getSession();
                if (!session) return { me: null, isAdmin: false, needMfa: false };
                const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
                const needMfa = aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2';
                const [{ data: admin }, { data: profile }] = needMfa
                    ? [{ data: false }, { data: null }]
                    : await Promise.all([
                        client.rpc('is_admin'),
                        client.from('profiles').select('nickname, avatar').eq('id', session.user.id).maybeSingle()
                    ]);
                return { me: session.user, isAdmin: !!admin, needMfa, profile };
            })();
        }
        return readyPromise;
    }

    function errorText(error) {
        const reason = String(error?.message || '').match(/EOR_[A-Z_]+/)?.[0];
        const map = {
            EOR_AUTH: ['errNeedLogin', 'Sign in to do this.'],
            EOR_TOO_MANY: ['errTooManyPosts', 'You are doing this too fast. Wait a little.'],
            EOR_TOO_LONG: ['errPostTooLong', 'Text too long.'],
            EOR_EMPTY: ['errPostEmpty', 'Write something or add an image.'],
            EOR_FORBIDDEN: ['errForbidden', 'You are not allowed to do this.'],
            EOR_INVALID: ['errGeneric', 'Something went wrong. Please try again.']
        };
        const [key, fallback] = map[reason] || auth.friendError(error);
        return t(key, fallback);
    }

    // ---------- pedaços de tela ----------
    function node(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }
    function picFor(p) {
        const span = node('span', 'player-pic');
        if (p.avatar && crests.find(p.avatar)) {
            span.innerHTML = crests.avatar(p.avatar);
        } else {
            span.classList.add('is-initial');
            span.textContent = p.nickname.charAt(0).toUpperCase();
        }
        return span;
    }
    function ago(value) {
        const d = new Date(value);
        const s = (Date.now() - d.getTime()) / 1000;
        if (s < 60) return t('justNow', 'just now');
        const rtf = new Intl.RelativeTimeFormat(lang(), { numeric: 'auto', style: 'short' });
        if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute');
        if (s < 86400) return rtf.format(-Math.floor(s / 3600), 'hour');
        if (s < 7 * 86400) return rtf.format(-Math.floor(s / 86400), 'day');
        return d.toLocaleDateString(lang(), { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
    }
    function timeEl(value, edited) {
        const time = node('time', 'post-time', ago(value) + (edited ? ` · ${t('edited', 'edited')}` : ''));
        time.dateTime = value;
        time.title = new Date(value).toLocaleString(lang());
        return time;
    }
    const profileUrl = (nick) => `perfil.html?n=${encodeURIComponent(nick)}`;
    // Social (geral, arte, anúncio) e Taverna (pergunta, dica) ficam em páginas separadas
    const AREAS = { social: ['geral', 'arte', 'anuncio'], taverna: ['pergunta', 'dica'] };
    const areaOf = (tag) => (AREAS.taverna.includes(tag) ? 'taverna' : 'social');
    const postUrl = (id, tag) => `${areaOf(tag)}.html?post=${id}`;

    // Menu ⋯ simples
    function menu(items) {
        const wrap = node('div', 'post-menu');
        const btn = node('button', 'post-menu-btn');
        btn.type = 'button';
        btn.setAttribute('aria-haspopup', 'true');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-label', t('moreOptions', 'More options'));
        btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
        const list = node('div', 'post-menu-list');
        list.hidden = true;
        items.forEach(([label, onClick, danger]) => {
            const b = node('button', danger ? 'is-danger' : '', label);
            b.type = 'button';
            b.addEventListener('click', () => { list.hidden = true; btn.setAttribute('aria-expanded', 'false'); onClick(); });
            list.appendChild(b);
        });
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.post-menu-list').forEach((l) => { if (l !== list) l.hidden = true; });
            list.hidden = !list.hidden;
            btn.setAttribute('aria-expanded', String(!list.hidden));
        });
        wrap.append(btn, list);
        return wrap;
    }
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.post-menu')) document.querySelectorAll('.post-menu-list').forEach((l) => { l.hidden = true; });
    });

    // Imagem em tela cheia
    let viewer = null;
    function openImage(src, alt) {
        if (!viewer) {
            viewer = node('dialog', 'image-viewer');
            const img = node('img');
            const close = node('button', 'image-viewer-close', '×');
            close.type = 'button';
            close.setAttribute('aria-label', t('close', 'Close'));
            close.addEventListener('click', () => viewer.close());
            viewer.addEventListener('click', (e) => { if (e.target === viewer) viewer.close(); });
            viewer.append(img, close);
            document.body.appendChild(viewer);
        }
        const img = viewer.querySelector('img');
        img.src = src;
        img.alt = alt;
        viewer.showModal();
    }

    async function report(args) {
        const reason = window.prompt(t('reportPostPrompt', 'Why are you reporting this? (optional)'), '');
        if (reason === null) return false;
        const { error } = await client.rpc('report_content', { ...args, p_reason: reason.slice(0, 300) });
        if (error) { window.alert(errorText(error)); return false; }
        window.alert(t('reportThanks', 'Thanks! The report was sent to the moderators.'));
        return true;
    }

    // Caixa de edição no lugar do texto
    function inlineEditor(current, max, onSave, onCancel) {
        const form = node('form', 'post-edit');
        const area = node('textarea');
        area.value = current;
        area.maxLength = max;
        area.rows = 3;
        const row = node('div', 'post-edit-row');
        const save = node('button', 'post-btn is-main', t('save', 'Save'));
        save.type = 'submit';
        const cancel = node('button', 'post-btn', t('cancel', 'Cancel'));
        cancel.type = 'button';
        cancel.addEventListener('click', onCancel);
        row.append(cancel, save);
        form.append(area, row);
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            save.disabled = true;
            const ok = await onSave(area.value.trim());
            save.disabled = false;
            if (ok === false) area.focus();
        });
        setTimeout(() => area.focus(), 0);
        return form;
    }

    // ---------- @menções ----------
    const MENTION_RE = /@([A-Za-z0-9_À-ÖØ-öø-ÿĀ-ž-]{3,20})/g;

    // Texto com @apelido virando link para o perfil (sempre como texto, nunca HTML)
    function richText(el, text) {
        el.textContent = '';
        let last = 0;
        for (const m of String(text || '').matchAll(MENTION_RE)) {
            if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
            const a = node('a', 'mention', m[0]);
            a.href = profileUrl(m[1]);
            el.appendChild(a);
            last = m.index + m[0].length;
        }
        if (last < String(text || '').length) el.appendChild(document.createTextNode(text.slice(last)));
        return el;
    }

    // Ao digitar "@ab" aparece a lista de jogadores para escolher
    function attachMentions(area) {
        const wrap = node('div', 'mention-wrap');
        area.replaceWith(wrap);
        wrap.appendChild(area);
        const box = node('ul', 'mention-list');
        box.hidden = true;
        box.setAttribute('role', 'listbox');
        wrap.appendChild(box);
        let items = [];
        let active = 0;
        let timer = null;
        let token = null;

        const close = () => { box.hidden = true; items = []; token = null; };
        function pick(i) {
            const p = items[i];
            if (!p || !token) return;
            const before = area.value.slice(0, token.start);
            const after = area.value.slice(area.selectionStart);
            const insert = `@${p.nickname} `;
            area.value = before + insert + after;
            const pos = before.length + insert.length;
            area.setSelectionRange(pos, pos);
            area.dispatchEvent(new Event('input'));
            close();
            area.focus();
        }
        function paint() {
            box.textContent = '';
            items.forEach((p, i) => {
                const li = node('li', i === active ? 'is-active' : '');
                li.setAttribute('role', 'option');
                li.setAttribute('aria-selected', String(i === active));
                li.append(picFor(p), node('span', '', p.nickname));
                li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(i); });
                box.appendChild(li);
            });
            box.hidden = !items.length;
        }
        area.addEventListener('input', () => {
            const upto = area.value.slice(0, area.selectionStart);
            const m = upto.match(/(^|\s)@([A-Za-z0-9_À-ÖØ-öø-ÿĀ-ž-]{2,20})$/);
            clearTimeout(timer);
            if (!m) { close(); return; }
            token = { start: upto.length - m[2].length - 1, q: m[2] };
            timer = setTimeout(async () => {
                const q = token?.q;
                if (!q) return;
                const { data } = await client.rpc('search_players', { p_query: q, p_limit: 5 });
                if (token?.q !== q) return;
                items = data || [];
                active = 0;
                paint();
            }, 250);
        });
        // registrado antes do "Enter envia", para escolher da lista sem enviar
        area.addEventListener('keydown', (e) => {
            if (box.hidden || !items.length) return;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                active = (active + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
                paint();
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                e.stopImmediatePropagation();
                pick(active);
            } else if (e.key === 'Escape') {
                e.stopPropagation();
                close();
            }
        });
        area.addEventListener('blur', () => setTimeout(close, 150));
        return area;
    }

    // ---------- comentários ----------
    // ctx = { viewer, post, onRemoved(qtd), onBest(), onReply(comentário) }
    function comment(c, ctx) {
        const { viewer, post } = ctx;
        const el = node('div', `comment${c.parent_id ? ' is-reply' : ''}`);
        if (c.is_best) el.classList.add('is-best');
        const pic = node('a', 'comment-pic');
        pic.href = profileUrl(c.nickname);
        pic.appendChild(picFor(c));
        const main = node('div', 'comment-main');
        const box = node('div', 'comment-box');
        const head = node('div', 'comment-head');
        const name = node('a', 'comment-name', c.nickname);
        name.href = profileUrl(c.nickname);
        head.append(name, timeEl(c.created_at, c.edited_at));
        const body = richText(node('p', 'comment-body'), c.body);
        if (c.is_best) box.appendChild(node('span', 'best-label', `✓ ${t('bestAnswer', 'Best answer')}`));
        box.append(head, body);
        main.appendChild(box);

        if (viewer.me && !viewer.needMfa && ctx.onReply) {
            const reply = node('button', 'comment-reply', t('reply', 'Reply'));
            reply.type = 'button';
            reply.addEventListener('click', () => ctx.onReply(c));
            main.appendChild(reply);
        }

        const items = [];
        if (c.can_mark_best && ctx.onBest) {
            items.push([c.is_best ? t('unmarkBest', 'Unmark best answer') : t('markBest', 'Mark as best answer'), async () => {
                const { error } = await client.rpc('set_best_answer', { p_post: post.id, p_comment: c.is_best ? null : c.id });
                if (error) { window.alert(errorText(error)); return; }
                ctx.onBest();
            }]);
        }
        if (c.mine) {
            items.push([t('edit', 'Edit'), () => {
                const editor = inlineEditor(c.body, 1000, async (text) => {
                    if (!text) return false;
                    const { error } = await client.rpc('edit_comment', { p_id: c.id, p_body: text });
                    if (error) { window.alert(errorText(error)); return false; }
                    c.body = text;
                    c.edited_at = new Date().toISOString();
                    el.replaceWith(comment(c, ctx));
                    return true;
                }, () => { editor.replaceWith(body); });
                body.replaceWith(editor);
            }]);
        }
        if (c.can_delete) {
            items.push([t('delete', 'Delete'), async () => {
                if (!window.confirm(t('deleteCommentConfirm', 'Delete this comment?'))) return;
                const { error } = await client.rpc('delete_comment', { p_id: c.id });
                if (error) { window.alert(errorText(error)); return; }
                // comentário principal leva as respostas junto
                const thread = el.closest('.comment-thread');
                if (!c.parent_id && thread) {
                    const removed = 1 + thread.querySelectorAll('.comment.is-reply').length;
                    thread.remove();
                    ctx.onRemoved(removed);
                } else {
                    el.closest('li')?.remove();
                    ctx.onRemoved(1);
                }
            }, true]);
        }
        if (viewer.me && !c.mine) {
            items.push([t('report', 'Report'), () => report({ p_comment: c.id })]);
        }
        el.append(pic, main);
        if (items.length) el.appendChild(menu(items));
        return el;
    }

    // Caixa de escrever um comentário ou uma resposta
    function commentForm(viewer, placeholderKey, placeholderText, onSend) {
        const form = node('form', 'comment-form');
        const area = node('textarea');
        area.rows = 1;
        area.maxLength = 1000;
        area.placeholder = t(placeholderKey, placeholderText);
        area.setAttribute('aria-label', area.placeholder);
        const send = node('button', 'post-btn is-main', t('send', 'Send'));
        send.type = 'submit';
        const err = node('p', 'post-error');
        const grow = () => { area.style.height = 'auto'; area.style.height = `${Math.min(area.scrollHeight, 140)}px`; };
        form.append(area, send);
        attachMentions(area);
        area.addEventListener('input', () => { grow(); err.textContent = ''; });
        area.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
        });
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = area.value.trim();
            if (!text || send.disabled) return;
            send.disabled = true;
            const error = await onSend(text);
            send.disabled = false;
            if (error) { err.textContent = errorText(error); return; }
            area.value = '';
            grow();
        });
        const wrap = node('div', 'comment-form-wrap');
        wrap.append(form, err);
        return { wrap, area };
    }

    function commentsSection(post, viewer, countEl, onBest) {
        const section = node('div', 'post-comments');
        const older = node('button', 'comments-older', t('loadOlderComments', 'See earlier comments'));
        older.type = 'button';
        older.hidden = true;
        const list = node('ol', 'comment-list');
        section.append(older, list);
        let oldest = null;
        const setCount = () => { countEl.textContent = post.comment_count ? String(post.comment_count) : ''; };
        const me = () => viewer.profile || { nickname: viewer.me?.user_metadata?.nickname || '?', avatar: null };

        const ctx = {
            viewer,
            post,
            onBest,
            onRemoved(n) { post.comment_count = Math.max(0, post.comment_count - n); setCount(); },
            onReply: null
        };

        // Uma conversa: comentário principal + respostas + caixa de resposta (aberta ao clicar "Responder")
        function thread(c, replies) {
            const li = node('li', 'comment-thread');
            li.dataset.id = c.id;
            const replyList = node('ol', 'reply-list');
            replies.forEach((r) => {
                const item = node('li');
                item.appendChild(comment(r, ctx));
                replyList.appendChild(item);
            });
            li.append(comment(c, ctx), replyList);
            return li;
        }

        ctx.onReply = (target) => {
            const topId = target.parent_id || target.id;
            const li = list.querySelector(`.comment-thread[data-id="${topId}"]`);
            if (!li) return;
            let box = li.querySelector(':scope > .comment-form-wrap');
            if (!box) {
                const made = commentForm(viewer, 'writeReply', 'Write a reply...', async (text) => {
                    const { data, error } = await client.rpc('add_comment', { p_post: post.id, p_body: text, p_parent: target.id });
                    if (error) return error;
                    const row = Array.isArray(data) ? data[0] : data;
                    const item = node('li');
                    item.appendChild(comment({
                        id: row.id, parent_id: row.parent_id || topId, nickname: me().nickname, avatar: me().avatar, body: text,
                        created_at: row.created_at, mine: true, can_delete: true, can_mark_best: post.mine && post.tag === 'pergunta'
                    }, ctx));
                    li.querySelector(':scope > .reply-list').appendChild(item);
                    post.comment_count += 1;
                    setCount();
                    return null;
                });
                box = made.wrap;
                box.classList.add('is-reply-form');
                li.appendChild(box);
            }
            const area = box.querySelector('textarea');
            // marca quem está sendo respondido (se não for você)
            const mention = `@${target.nickname} `;
            if (target.nickname !== me().nickname && !area.value.includes(mention.trim())) area.value = mention + area.value;
            area.focus();
            area.setSelectionRange(area.value.length, area.value.length);
            area.dispatchEvent(new Event('input'));
        };

        async function load(before) {
            const { data, error } = await client.rpc('post_comments_list', { p_post: post.id, p_before: before, p_limit: 20 });
            if (error) return;
            const rows = data || [];
            const tops = rows.filter((c) => !c.parent_id).sort((a, b) => a.id - b.id);
            const byParent = new Map();
            rows.filter((c) => c.parent_id).forEach((r) => {
                if (!byParent.has(r.parent_id)) byParent.set(r.parent_id, []);
                byParent.get(r.parent_id).push(r);
            });
            const first = list.firstChild;
            tops.forEach((c) => list.insertBefore(thread(c, (byParent.get(c.id) || []).sort((a, b) => a.id - b.id)), first));
            if (tops.length) oldest = tops[0].id;
            older.hidden = tops.length < 20;
        }
        older.addEventListener('click', () => load(oldest));

        if (viewer.me && !viewer.needMfa) {
            const made = commentForm(viewer, 'writeComment', 'Write a comment...', async (text) => {
                const { data, error } = await client.rpc('add_comment', { p_post: post.id, p_body: text });
                if (error) return error;
                const row = Array.isArray(data) ? data[0] : data;
                list.appendChild(thread({
                    id: row.id, parent_id: null, nickname: me().nickname, avatar: me().avatar, body: text, created_at: row.created_at,
                    mine: true, can_delete: true, can_mark_best: post.mine && post.tag === 'pergunta'
                }, []));
                post.comment_count += 1;
                setCount();
                return null;
            });
            section.appendChild(made.wrap);
        } else if (!viewer.me) {
            const p = node('p', 'comments-login');
            const a = node('a', '', t('login', 'Login'));
            a.href = 'login.html';
            p.append(a, ` ${t('loginToComment', 'to comment.')}`);
            section.appendChild(p);
        }
        load(null);
        return section;
    }


    // ---------- uma publicação ----------
    function card(post, viewer, opts = {}) {
        const article = node('article', 'post-card');
        if (post.pinned) article.classList.add('is-pinned');
        if (post.tag === 'anuncio') article.classList.add('is-news');

        const head = node('header', 'post-head');
        const who = node('a', 'post-who');
        who.href = profileUrl(post.nickname);
        const names = node('span', 'post-names');
        const name = node('strong', 'post-name', post.nickname);
        const meta = node('span', 'post-meta');
        const link = node('a', 'post-link');
        link.href = postUrl(post.id, post.tag);
        link.appendChild(timeEl(post.created_at, post.edited_at));
        meta.append(link);
        names.append(name);
        who.append(picFor(post), names);
        const tagEl = node('span', `post-tag tag-${post.tag}`, tagLabel(post.tag));
        const headText = node('div', 'post-head-text');
        headText.append(who, meta);
        head.append(headText);
        if (post.pinned) {
            const pin = node('span', 'post-pin', t('pinned', 'Pinned'));
            head.appendChild(pin);
        }
        head.appendChild(tagEl);
        const solved = post.tag === 'pergunta' && !!post.best_comment;
        if (solved) {
            article.classList.add('is-solved');
            head.appendChild(node('span', 'post-tag tag-solved', `✓ ${t('solved', 'Solved')}`));
        }
        // Recarrega esta publicação (depois de marcar a melhor resposta)
        const refresh = async () => {
            const { data } = await client.rpc('feed', { p_post: post.id });
            if (data?.[0]) article.replaceWith(card(data[0], viewer, { ...opts, openComments: true }));
        };

        const body = richText(node('p', 'post-body'), post.body);
        body.hidden = !post.body;

        const items = [];
        if (post.mine) {
            items.push([t('edit', 'Edit'), () => {
                body.hidden = false;
                const editor = inlineEditor(post.body, 2000, async (text) => {
                    if (!text && !post.image_path) return false;
                    const { error } = await client.rpc('edit_post', { p_id: post.id, p_body: text, p_tag: post.tag });
                    if (error) { window.alert(errorText(error)); return false; }
                    post.body = text;
                    post.edited_at = new Date().toISOString();
                    article.replaceWith(card(post, viewer, opts));
                    return true;
                }, () => { editor.replaceWith(body); body.hidden = !post.body; });
                body.replaceWith(editor);
            }]);
        }
        if (viewer.isAdmin) {
            items.push([post.pinned ? t('unpin', 'Unpin') : t('pin', 'Pin to top'), async () => {
                const { error } = await client.rpc('set_post_pinned', { p_id: post.id, p_pinned: !post.pinned });
                if (error) { window.alert(errorText(error)); return; }
                post.pinned = !post.pinned;
                article.replaceWith(card(post, viewer, opts));
            }]);
        }
        if (post.mine || viewer.isAdmin) {
            items.push([t('delete', 'Delete'), async () => {
                if (!window.confirm(t('deletePostConfirm', 'Delete this post? This cannot be undone.'))) return;
                const { data: path, error } = await client.rpc('delete_post', { p_id: post.id });
                if (error) { window.alert(errorText(error)); return; }
                if (path) await client.storage.from(BUCKET).remove([path]);
                article.remove();
                opts.onRemoved?.(post);
            }, true]);
        }
        if (viewer.me && !post.mine) {
            items.push([t('report', 'Report'), () => report({ p_post: post.id })]);
        }
        if (items.length) head.appendChild(menu(items));

        article.append(head, body);

        if (post.image_path) {
            const fig = node('button', 'post-image');
            fig.type = 'button';
            const img = node('img');
            img.loading = 'lazy';
            img.decoding = 'async';
            img.src = imageUrl(post.image_path);
            img.alt = post.body ? post.body.slice(0, 120) : `${t('imageBy', 'Image by')} ${post.nickname}`;
            fig.setAttribute('aria-label', t('openImage', 'Open image'));
            fig.appendChild(img);
            fig.addEventListener('click', () => openImage(img.src, img.alt));
            article.appendChild(fig);
        }

        // Melhor resposta em destaque (perguntas resolvidas)
        if (solved && post.best_body) {
            const best = node('div', 'best-answer');
            const label = node('span', 'best-label', `✓ ${t('bestAnswer', 'Best answer')}`);
            const who = node('a', 'best-who');
            who.href = profileUrl(post.best_nickname);
            who.append(picFor({ nickname: post.best_nickname, avatar: post.best_avatar }), node('strong', '', post.best_nickname));
            const text = richText(node('p', 'best-body'), post.best_body);
            const open = node('button', 'best-open', t('seeConversation', 'See the conversation'));
            open.type = 'button';
            open.addEventListener('click', () => { if (!comments || comments.hidden) toggleComments(); });
            best.append(label, who, text, open);
            article.appendChild(best);
        }

        // Curtir / comentar
        const actions = node('div', 'post-actions');
        const like = node('button', 'post-action post-like');
        like.type = 'button';
        like.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20 C5 15 3 12 3 8.5 A4.5 4.5 0 0 1 12 6 A4.5 4.5 0 0 1 21 8.5 C21 12 19 15 12 20 Z"/></svg>';
        const likeLabel = node('span', 'post-action-label');
        const likeCount = node('span', 'post-count');
        like.append(likeLabel, likeCount);
        const paintLike = () => {
            like.classList.toggle('is-on', !!post.liked);
            like.setAttribute('aria-pressed', String(!!post.liked));
            likeLabel.textContent = t('like', 'Like');
            likeCount.textContent = post.like_count ? String(post.like_count) : '';
        };
        paintLike();
        like.addEventListener('click', async () => {
            if (!viewer.me) { window.location.href = 'login.html'; return; }
            if (like.disabled) return;
            like.disabled = true;
            const { data, error } = await client.rpc('toggle_like', { p_id: post.id });
            like.disabled = false;
            if (error) { window.alert(errorText(error)); return; }
            const row = Array.isArray(data) ? data[0] : data;
            post.liked = row.liked;
            post.like_count = row.like_count;
            paintLike();
        });

        const talk = node('button', 'post-action');
        talk.type = 'button';
        talk.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 5 H20 V16 H10 L5 20 V16 H4 Z"/></svg>';
        const commentCount = node('span', 'post-count', post.comment_count ? String(post.comment_count) : '');
        talk.append(node('span', 'post-action-label', t('comment', 'Comment')), commentCount);
        talk.setAttribute('aria-expanded', 'false');
        let comments = null;
        const toggleComments = () => {
            if (!comments) {
                comments = commentsSection(post, viewer, commentCount, refresh);
                article.appendChild(comments);
            } else {
                comments.hidden = !comments.hidden;
            }
            talk.setAttribute('aria-expanded', String(!comments.hidden));
            if (!comments.hidden) comments.querySelector('textarea')?.focus({ preventScroll: true });
        };
        talk.addEventListener('click', toggleComments);
        actions.append(like, talk);
        article.appendChild(actions);
        if (opts.openComments) toggleComments();
        return article;
    }

    // ---------- lista ----------
    function list(container, opts = {}) {
        const feedEl = node('div', 'post-list');
        const empty = node('p', 'post-empty');
        empty.hidden = true;
        const more = node('button', 'post-more', t('loadMorePosts', 'Load more'));
        more.type = 'button';
        more.hidden = true;
        const status = node('p', 'post-status', t('loading', 'Loading...'));
        container.append(status, feedEl, empty, more);
        let before = null;
        let tag = opts.tag || null;
        let unsolved = false;
        let query = null;
        let viewer = null;
        let ticket = 0; // só a resposta do pedido mais recente vale (filtros trocados rápido)

        async function load(reset) {
            const mine = ++ticket;
            viewer = viewer || await ready();
            if (reset) { before = null; feedEl.textContent = ''; status.hidden = false; status.textContent = t('loading', 'Loading...'); empty.hidden = true; more.hidden = true; }
            more.disabled = true;
            const { data, error } = await client.rpc('feed', {
                p_before: before, p_limit: 15, p_tag: tag, p_author_nick: opts.author || null, p_post: opts.post || null,
                ...(opts.tags && !tag ? { p_tags: opts.tags } : {}),
                ...(query ? { p_query: query } : {}), ...(unsolved ? { p_unsolved: true } : {})
            });
            if (mine !== ticket) return;
            if (reset) feedEl.textContent = '';
            more.disabled = false;
            status.hidden = true;
            if (error) {
                status.hidden = false;
                status.textContent = t('errNetwork', 'Connection failed. Check your internet and try again.');
                return;
            }
            const rows = data || [];
            rows.forEach((p) => feedEl.appendChild(card(p, viewer, { openComments: !!opts.post, onRemoved: () => { if (!feedEl.children.length) showEmpty(); } })));
            const general = !opts.author && !opts.post && !query && !unsolved;
            const normal = rows.filter((p) => !(p.pinned && general));
            if (normal.length) before = normal[normal.length - 1].id;
            more.hidden = opts.post || rows.length < 15;
            if (reset && !rows.length) showEmpty(); else empty.hidden = true;
        }
        function showEmpty() {
            empty.hidden = false;
            empty.textContent = opts.post
                ? t('postNotFound', 'This post was removed or does not exist.')
                : query
                    ? t('noSearchResults', 'No posts found for this search.')
                    : unsolved
                        ? t('noUnsolved', 'No open questions. Everyone got help!')
                        : (opts.emptyText || t('noPostsYet', 'No posts yet'));
        }
        more.addEventListener('click', () => load(false));
        load(true);
        return {
            setTag(value) { tag = value || null; unsolved = false; load(true); },
            // Filtro "Sem solução" (perguntas sem melhor resposta)
            setUnsolved() { tag = null; unsolved = true; load(true); },
            // Busca (null = volta ao feed normal)
            setQuery(value) { query = value || null; load(true); },
            // Tudo de uma vez: { tag, unsolved, query }
            setFilter(f = {}) { tag = f.tag || null; unsolved = !!f.unsolved; query = f.query || null; load(true); },
            async prepend(id) {
                const { data } = await client.rpc('feed', { p_post: id });
                if (data?.[0]) {
                    empty.hidden = true;
                    const pinned = [...feedEl.querySelectorAll('.post-card.is-pinned')].pop();
                    const el = card(data[0], viewer || await ready());
                    if (pinned) pinned.after(el); else feedEl.prepend(el);
                }
            },
            reload() { load(true); }
        };
    }

    // ---------- escrever uma publicação ----------
    // A imagem é redesenhada no navegador: fica menor (até 1600 px), vira webp/jpeg e
    // PERDE os dados escondidos da foto (como a localização do GPS).
    async function prepareImage(file) {
        if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('type');
        if (file.size > 15 * 1024 * 1024) throw new Error('big');
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0c0b0a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close?.();
        const toBlob = (type, q) => new Promise((resolve) => canvas.toBlob(resolve, type, q));
        for (const q of [0.85, 0.72, 0.6, 0.45]) {
            let blob = await toBlob('image/webp', q);
            let ext = 'webp';
            if (!blob || blob.type !== 'image/webp') { blob = await toBlob('image/jpeg', q); ext = 'jpg'; }
            if (blob && blob.size <= 1.4 * 1024 * 1024) return { blob, ext };
        }
        throw new Error('big');
    }

    // opts.tags = etiquetas que aparecem para escolher (padrão: todas); opts.placeholder = texto da caixa
    function composer(container, onPosted, opts = {}) {
        ready().then((viewer) => {
            container.textContent = '';
            if (!viewer.me || viewer.needMfa) {
                const box = node('div', 'composer composer-guest');
                const p = node('p', '', t('loginToPost', 'Sign in to post, ask questions and share images.'));
                const a = node('a', 'btn btn-download', t('login', 'Login'));
                a.href = 'login.html';
                box.append(p, a);
                container.appendChild(box);
                return;
            }
            const form = node('form', 'composer');
            form.noValidate = true;
            const area = node('textarea', 'composer-text');
            area.maxLength = 2000;
            area.rows = 3;
            area.placeholder = opts.placeholder ? t(...opts.placeholder) : t('composerPlaceholder', 'Share something, ask a question or post a screenshot...');
            area.setAttribute('aria-label', area.placeholder);

            const preview = node('div', 'composer-preview');
            preview.hidden = true;
            const previewImg = node('img');
            previewImg.alt = '';
            const removeImg = node('button', 'composer-remove', '×');
            removeImg.type = 'button';
            removeImg.setAttribute('aria-label', t('removeImage', 'Remove image'));
            preview.append(previewImg, removeImg);

            const tags = node('div', 'composer-tags');
            tags.setAttribute('role', 'radiogroup');
            tags.setAttribute('aria-label', t('postTag', 'Topic'));
            const allowed = TAGS.filter((x) => (!x.admin || viewer.isAdmin) && (!opts.tags || opts.tags.includes(x.id)));
            let chosen = allowed[0]?.id || 'geral';
            allowed.forEach((x) => {
                const b = node('button', `tag-chip tag-${x.id}`, t(x.key, x.label));
                b.type = 'button';
                b.setAttribute('role', 'radio');
                b.setAttribute('aria-checked', String(x.id === chosen));
                b.addEventListener('click', () => {
                    chosen = x.id;
                    tags.querySelectorAll('.tag-chip').forEach((c) => c.setAttribute('aria-checked', String(c === b)));
                });
                tags.appendChild(b);
            });

            const row = node('div', 'composer-row');
            const file = node('input');
            file.type = 'file';
            file.accept = 'image/jpeg,image/png,image/webp,image/gif';
            file.hidden = true;
            const pick = node('button', 'post-btn composer-pick');
            pick.type = 'button';
            pick.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 5 H20 V19 H4 Z M4 15 L9 10 L14 15 L16 13 L20 17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="15.5" cy="9" r="1.6" fill="currentColor"/></svg>';
            pick.appendChild(node('span', '', t('addImage', 'Image')));
            const count = node('span', 'composer-count', '0/2000');
            const send = node('button', 'btn btn-download composer-send', t('publish', 'Post'));
            send.type = 'submit';
            row.append(file, pick, count, send);
            const err = node('p', 'post-error');
            err.setAttribute('role', 'alert');

            form.append(area, preview, tags, row, err);
            attachMentions(area);
            container.appendChild(form);

            let image = null; // { blob, ext, url }
            const clearImage = () => {
                if (image?.url) URL.revokeObjectURL(image.url);
                image = null;
                preview.hidden = true;
                previewImg.removeAttribute('src');
                file.value = '';
            };
            pick.addEventListener('click', () => file.click());
            removeImg.addEventListener('click', clearImage);
            file.addEventListener('change', async () => {
                const f = file.files?.[0];
                if (!f) return;
                err.textContent = '';
                try {
                    const ready = await prepareImage(f);
                    clearImage();
                    image = { ...ready, url: URL.createObjectURL(ready.blob) };
                    previewImg.src = image.url;
                    preview.hidden = false;
                } catch (e) {
                    clearImage();
                    err.textContent = e.message === 'type'
                        ? t('errImageType', 'Use a JPG, PNG, WEBP or GIF image.')
                        : t('errImageBig', 'Image too large.');
                }
            });
            area.addEventListener('input', () => { count.textContent = `${area.value.length}/2000`; err.textContent = ''; });

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const text = area.value.trim();
                if (!text && !image) { err.textContent = t('errPostEmpty', 'Write something or add an image.'); return; }
                send.disabled = true;
                pick.disabled = true;
                err.textContent = '';
                let path = null;
                try {
                    if (image) {
                        path = `${viewer.me.id}/${crypto.randomUUID()}.${image.ext}`;
                        const { error: upError } = await client.storage.from(BUCKET).upload(path, image.blob, {
                            contentType: image.ext === 'webp' ? 'image/webp' : 'image/jpeg', upsert: false, cacheControl: '31536000'
                        });
                        if (upError) {
                            console.warn('[imagem]', upError.message);
                            err.textContent = /row-level|policy|security/i.test(upError.message)
                                ? t('errImageLimit', 'Image limit reached for today. Try again tomorrow.')
                                : t('errImageUpload', 'Could not send the image. Try again.');
                            return;
                        }
                    }
                    const { data: id, error } = await client.rpc('create_post', { p_body: text, p_tag: chosen, p_image: path });
                    if (error) {
                        if (path) await client.storage.from(BUCKET).remove([path]);
                        err.textContent = errorText(error);
                        return;
                    }
                    area.value = '';
                    count.textContent = '0/2000';
                    clearImage();
                    onPosted?.(id);
                } finally {
                    send.disabled = false;
                    pick.disabled = false;
                }
            });
        });
    }

    window.EorFeed = { ready, list, composer, TAGS, AREAS, areaOf, postUrl, tagLabel, imageUrl, picFor, errorText };
})();

// Painel de denúncias. Quem não é admin (ou não entrou com o 2FA) vê "Página não encontrada":
// o banco recusa admin_open_reports() para qualquer outra pessoa (supabase/008_comunidade.sql).
document.addEventListener('DOMContentLoaded', async () => {
    const t = (key, fallback) => (window.getSiteTranslation ? window.getSiteTranslation(key, fallback) : fallback);
    const $ = (id) => document.getElementById(id);
    const lang = () => (window.SiteI18n?.lang === 'pt' ? 'pt-BR' : 'en');
    const auth = window.EorAuth;
    const deny = () => { $('modStatus').hidden = true; $('modDenied').hidden = false; };
    if (!auth) { deny(); return; }
    const { client } = auth;

    const { data: { session } } = await client.auth.getSession();
    if (!session) { deny(); return; }

    const SOURCES = {
        message: ['reportSourceMessage', 'Private message'],
        post: ['reportSourcePost', 'Post'],
        comment: ['reportSourceComment', 'Comment']
    };
    const imageUrl = (path) => `${auth.SUPABASE_URL}/storage/v1/object/public/post-images/${path.split('/').map(encodeURIComponent).join('/')}`;

    function node(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }

    function card(r) {
        const article = node('article', 'post-card mod-card');
        const head = node('header', 'post-head');
        const headText = node('div', 'post-head-text');
        const title = node('strong', 'post-name', t(...SOURCES[r.source]));
        const meta = node('p', 'mod-meta');
        meta.append(
            `${t('reportedBy', 'Reported by')} `, node('strong', '', r.reporter || '—'),
            ` · ${t('author', 'Author')}: `, node('strong', '', r.reported || '—'),
            ` · ${new Date(r.created_at).toLocaleString(lang())}`
        );
        headText.append(title, meta);
        head.appendChild(headText);
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
            see.href = `comunidade.html?post=${r.post_id}`;
            see.target = '_blank';
            see.rel = 'noopener';
            actions.appendChild(see);
        }
        const dismiss = node('button', 'post-btn', t('dismissReport', 'Dismiss'));
        dismiss.type = 'button';
        dismiss.addEventListener('click', () => resolve(r, 'dismiss', article));
        actions.appendChild(dismiss);
        if (r.source === 'message') {
            const done = node('button', 'post-btn is-main', t('markResolved', 'Mark as resolved'));
            done.type = 'button';
            done.addEventListener('click', () => resolve(r, 'remove', article));
            actions.appendChild(done);
        } else if (r.still_exists) {
            const remove = node('button', 'post-btn is-danger', t('removeContent', 'Remove content'));
            remove.type = 'button';
            remove.addEventListener('click', () => {
                if (window.confirm(t('removeContentConfirm', 'Remove this content for everyone?'))) resolve(r, 'remove', article);
            });
            actions.appendChild(remove);
        } else {
            const done = node('button', 'post-btn is-main', t('markResolved', 'Mark as resolved'));
            done.type = 'button';
            done.addEventListener('click', () => resolve(r, 'remove', article));
            actions.appendChild(done);
        }
        article.appendChild(actions);
        return article;
    }

    async function resolve(r, action, article) {
        article.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        const { data: path, error } = await client.rpc('admin_resolve_report', { p_source: r.source, p_id: r.id, p_action: action });
        if (error) {
            article.querySelectorAll('button').forEach((b) => { b.disabled = false; });
            window.alert(t('errGeneric', 'Something went wrong. Please try again.'));
            return;
        }
        if (path) await client.storage.from('post-images').remove([path]);
        await load();
        window.dispatchEvent(new Event('eor-messages-changed'));
    }

    async function load() {
        const { data, error } = await client.rpc('admin_open_reports');
        if (error) { deny(); return false; }
        $('modStatus').hidden = true;
        $('modWrap').hidden = false;
        const list = $('modList');
        list.textContent = '';
        (data || []).forEach((r) => list.appendChild(card(r)));
        $('modEmpty').hidden = (data || []).length > 0;
        return true;
    }

    await load();
    document.addEventListener('site-language-changed', load);
});

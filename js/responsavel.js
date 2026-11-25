// Página do responsável: o link do e-mail traz ?t=<código>. Mostra quem pediu,
// o que o site faz, e deixa autorizar ou recusar (supabase/018_contas_seguranca.sql:
// guardian_lookup / guardian_respond). O código vale uma vez só e por 7 dias.
document.addEventListener('DOMContentLoaded', () => {
    const tr = (key, fallback, vars = {}) => {
        let text = typeof window.getSiteTranslation === 'function' ? window.getSiteTranslation(key, fallback) : fallback;
        Object.entries(vars).forEach(([k, v]) => { text = text.split(`{${k}}`).join(v); });
        return text;
    };
    const card = document.getElementById('guardianCard');
    const client = window.EorAuth?.client;
    // o código sai da barra de endereço (não fica no histórico nem em capturas de tela)
    const token = new URLSearchParams(window.location.search).get('t') || '';
    if (token) window.history.replaceState(null, '', window.location.pathname);

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }
    // Texto com {nick} em destaque, sem montar HTML com o apelido
    function withNick(key, fallback, nick, age) {
        const p = el('p');
        const text = tr(key, fallback, { age: String(age ?? '') });
        const [before, after = ''] = text.split('{nick}');
        p.append(before);
        if (text.includes('{nick}')) {
            p.appendChild(el('strong', 'guardian-nick', nick));
            p.append(after);
        }
        return p;
    }
    function show(...nodes) {
        card.textContent = '';
        nodes.forEach((n) => card.appendChild(n));
    }
    function message(kind, titleKey, titleFallback, textKey, textFallback, nick) {
        card.dataset.state = kind;
        const box = [el('h2', 'guardian-title', tr(titleKey, titleFallback))];
        box.push(nick ? withNick(textKey, textFallback, nick) : el('p', '', tr(textKey, textFallback)));
        show(...box);
    }

    function render(info) {
        if (!info) {
            message('error', 'guardianInvalidTitle', 'Link not valid', 'guardianInvalidText',
                'This link is not valid or was already used. If you still need to answer, ask the player to send a new request from the site.');
            return;
        }
        if (info.status === 'approved') {
            message('done', 'guardianApprovedTitle', 'Already approved', 'guardianAlreadyApproved',
                'You already approved the account of {nick}. To withdraw your permission, write to empireofrebirth@gmail.com.', info.nickname);
            return;
        }
        if (info.status === 'denied') {
            message('done', 'guardianDeniedTitle', 'Not approved', 'guardianAlreadyDenied',
                'You did not approve the account of {nick}. It will be deleted within 24 hours.', info.nickname);
            return;
        }
        if (info.expired) {
            message('error', 'guardianExpiredTitle', 'Link expired', 'guardianExpiredText',
                'This link expired (it lasts 7 days). Ask the player to send a new request from the site.');
            return;
        }

        card.dataset.state = 'pending';
        const intro = withNick('guardianIntro',
            'The player {nick} ({age} years old) created an account on the Empire of Rebirth & Ruins community site and gave your email as the email of a parent or guardian.',
            info.nickname, info.age);

        const what = el('div', 'guardian-facts');
        what.appendChild(el('h2', 'guardian-title', tr('guardianWhatTitle', 'What the site is')));
        const list = el('ul');
        [
            ['guardianFact1', 'A community for the game: public profile with nickname, posts and comments that anyone can read.'],
            ['guardianFact2', 'Private messages only between friends. Players can block and report anyone; the team moderates reports.'],
            ['guardianFact3', 'No purchases or payments on the site.'],
            ['guardianFact4', 'We keep the email, nickname and date of birth, plus what the player posts. Details are in the Privacy policy.']
        ].forEach(([k, f]) => list.appendChild(el('li', '', tr(k, f))));
        what.appendChild(list);

        const docs = el('p', 'guardian-docs');
        const terms = el('a', '', tr('termsOfUse', 'Terms of use'));
        terms.href = 'termos.html';
        const privacy = el('a', '', tr('privacyPolicy', 'Privacy policy'));
        privacy.href = 'privacidade.html';
        docs.append(tr('guardianDocs', 'Read before deciding:') + ' ', terms, ' · ', privacy);

        const form = el('form', 'guardian-form');
        form.noValidate = true;
        const label = el('label', 'checkbox guardian-check');
        const box = el('input');
        box.type = 'checkbox';
        box.id = 'guardianConfirm';
        const span = el('span');
        span.appendChild(withNick('guardianConfirm',
            'I am the parent or legal guardian of {nick} and I have read the Terms of use and the Privacy policy.', info.nickname));
        label.append(box, span);
        const actions = el('div', 'guardian-actions');
        const approve = el('button', 'btn btn-download', tr('guardianApprove', 'Approve the account'));
        approve.type = 'submit';
        approve.disabled = true;
        const deny = el('button', 'btn btn-login', tr('guardianDeny', 'Do not approve'));
        deny.type = 'button';
        actions.append(approve, deny);
        const err = el('p', 'form-error');
        err.setAttribute('role', 'alert');
        const note = el('p', 'guardian-note', tr('guardianNote',
            'You can withdraw your permission at any time by writing to empireofrebirth@gmail.com. Without an answer in 7 days, the account is deleted.'));
        form.append(label, actions, err, note);
        box.addEventListener('change', () => { approve.disabled = !box.checked; });

        async function answer(accept) {
            if (accept && !box.checked) return;
            if (!accept && !window.confirm(tr('guardianDenyConfirm', 'Do not approve? The account will be deleted within 24 hours.'))) return;
            approve.disabled = true;
            deny.disabled = true;
            err.textContent = '';
            const { data, error } = await client.rpc('guardian_respond', { p_token: token, p_accept: accept });
            if (error) {
                const expired = /EOR_EXPIRED/.test(error.message || '');
                err.textContent = expired
                    ? tr('guardianExpiredText', 'This link expired (it lasts 7 days). Ask the player to send a new request from the site.')
                    : tr('errGeneric', 'Something went wrong. Please try again.');
                approve.disabled = !box.checked;
                deny.disabled = false;
                return;
            }
            if (data === 'approved') {
                message('done', 'guardianThanksTitle', 'Thank you!', 'guardianApprovedText',
                    'The account of {nick} is now active. To withdraw your permission later, write to empireofrebirth@gmail.com.', info.nickname);
            } else {
                message('done', 'guardianDeniedTitle', 'Not approved', 'guardianDeniedText',
                    'Understood. The account of {nick} will be deleted within 24 hours.', info.nickname);
            }
        }
        form.addEventListener('submit', (e) => { e.preventDefault(); answer(true); });
        deny.addEventListener('click', () => answer(false));

        show(intro, what, docs, form);
    }

    async function load() {
        if (!client || !/^[0-9a-f]{48}$/.test(token)) { render(null); return; }
        const { data, error } = await client.rpc('guardian_lookup', { p_token: token });
        if (error) {
            message('error', 'errGenericTitle', 'Something went wrong', 'errGeneric', 'Something went wrong. Please try again.');
            return;
        }
        render(data);
    }
    load();
    // Troca de idioma: desenha de novo no idioma escolhido (o código já está na memória)
    document.addEventListener('site-language-changed', () => { if (card.dataset.state === 'pending') load(); });
});

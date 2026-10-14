// Guia para Iniciantes: mapa, reinos, masmorras e itens.
// Dados: data/reinos.json, data/masmorras.json, data/itens.json + data/gameRules.json.
(() => {
    const G = window.GameData;
    const { esc, t, txt } = G;

    let rules = null;
    let kingdoms = [];
    let dungeons = [];
    let items = [];
    let monstersById = {};
    let reopen = null;

    const $ = (id) => document.getElementById(id);

    // ---------- Mapa ----------
    function setupMap() {
        const mapImage = $('mapa-img');
        const popup = $('popup');
        if (!mapImage || !popup) return;
        const open = () => { popup.style.display = 'block'; };
        const close = () => { popup.style.display = 'none'; };
        mapImage.addEventListener('click', open);
        mapImage.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                open();
            }
        });
        popup.addEventListener('click', close);
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') close();
        });
    }

    // ---------- Modal genérico ----------
    function openModal(kind, html, ref) {
        closeModal();
        document.body.insertAdjacentHTML('beforeend', `
            <div class="guide-modal guide-modal--${kind}">
                <div class="guide-modal-content" role="dialog" aria-modal="true">
                    <button type="button" class="modal-close" aria-label="${esc(t('close', 'Close'))}">×</button>
                    ${html}
                </div>
            </div>`);
        document.body.style.overflow = 'hidden';
        reopen = ref;
        const modal = document.querySelector('.guide-modal');
        G.setupModalClose(modal, closeModal);
        modal.querySelector('.modal-close')?.focus();
        return modal;
    }

    function closeModal() {
        reopen = null;
        const modal = document.querySelector('.guide-modal');
        if (!modal) return;
        modal.remove();
        document.body.style.overflow = '';
    }

    const infoBlock = (label, value) => (value ? `<div class="guide-info"><h3>${esc(label)}</h3><p>${esc(value)}</p></div>` : '');

    function cardHandlers(container, items, open) {
        container.querySelectorAll('[data-index]').forEach((card) => {
            const item = items[Number(card.dataset.index)];
            card.addEventListener('click', () => open(item));
            card.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    open(item);
                }
            });
        });
    }

    // ---------- Reinos ----------
    function renderKingdoms() {
        const list = $('lista-reinos');
        if (!list) return;
        const term = $('filtro-reinos')?.value || '';
        const filtered = kingdoms.filter((kingdom) => G.matchesSearch(term, [
            kingdom.name, kingdom.capital, kingdom.description, kingdom.location, kingdom.ruler, kingdom.deity,
            kingdom.history, kingdom.culture, kingdom.customs, kingdom.festivals
        ]));
        if (!filtered.length) {
            list.innerHTML = `<p class="nenhum-resultado">${esc(t('noKingdom', 'No kingdom found.'))}</p>`;
            return;
        }
        list.innerHTML = filtered.map((kingdom, index) => `
            <div class="reino card" tabindex="0" role="button" data-index="${index}" aria-label="${esc(txt(kingdom.name))}">
                ${G.renderImage(kingdom.image, txt(kingdom.name), 'reino-imagem')}
                <h3>${esc(txt(kingdom.name))}</h3>
                <p>${esc(txt(kingdom.description))}</p>
            </div>`).join('');
        cardHandlers(list, filtered, openKingdom);
    }

    function openKingdom(kingdom) {
        openModal('kingdom', `
            <div class="guide-modal-header">
                ${G.renderImage(kingdom.image, txt(kingdom.name))}
                <div>
                    <h2>${esc(txt(kingdom.name))}</h2>
                    <p>${esc(txt(kingdom.description))}</p>
                </div>
            </div>
            <div class="guide-modal-body">
                <div class="guide-facts">
                    ${[[t('capital'), txt(kingdom.capital)], [t('ruler'), txt(kingdom.ruler)], [t('deity'), txt(kingdom.deity)],
                        [t('location'), txt(kingdom.location)], [t('alliance'), txt(kingdom.alliance)]]
                        .filter(([, value]) => value)
                        .map(([label, value]) => `<div class="guide-fact"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}
                </div>
                ${infoBlock(t('history'), txt(kingdom.history))}
                ${infoBlock(t('culture'), txt(kingdom.culture))}
                ${infoBlock(t('customs'), txt(kingdom.customs))}
                ${infoBlock(t('festivals'), txt(kingdom.festivals))}
            </div>`, { type: 'kingdom', id: kingdom.id });
    }

    // ---------- Masmorras ----------
    function rankBadge(rankId) {
        if (!rankId) return '';
        const rank = G.findById(rules.ranks, rankId);
        const metal = rank?.metal ? ` · ${txt(rank.metal)}` : '';
        return `<span class="rank-badge rank-${esc(String(rankId).replace('+', 'plus'))}">${esc(t('rank'))} ${esc(rankId)}${esc(metal)}</span>`;
    }

    function renderDungeons() {
        const list = $('lista-masmorras');
        if (!list) return;
        const term = $('filtro-masmorras')?.value || '';
        const filtered = dungeons.filter((dungeon) => G.matchesSearch(term, [
            dungeon.name, dungeon.description, dungeon.rank, dungeon.boss?.name, ...(dungeon.enemies || [])
        ]));
        if (!filtered.length) {
            list.innerHTML = `<p class="nenhum-resultado">${esc(t('noDungeon', 'No dungeon found.'))}</p>`;
            return;
        }
        list.innerHTML = filtered.map((dungeon, index) => `
            <div class="masmorra card" tabindex="0" role="button" data-index="${index}" aria-label="${esc(txt(dungeon.name))}">
                <div class="masmorra-card-top">
                    ${rankBadge(dungeon.rank)}
                    ${dungeon.hasBoss ? `<span class="boss-badge">👹 ${esc(t('boss'))}</span>` : ''}
                </div>
                <h3>${esc(txt(dungeon.name))}</h3>
                ${txt(dungeon.description) ? `<p>${esc(txt(dungeon.description))}</p>` : ''}
                <div class="enemy-tags">${(dungeon.enemies || []).map((enemy) => `<span class="enemy-tag">${esc(txt(enemy))}</span>`).join('')}</div>
            </div>`).join('');
        cardHandlers(list, filtered, openDungeon);
    }

    function openDungeon(dungeon) {
        const linked = (dungeon.monsters || []).map((id) => monstersById[id]).filter(Boolean);
        const bossName = txt(dungeon.boss?.name);
        openModal('dungeon', `
            <div class="guide-modal-header">
                ${G.renderImage(dungeon.image, txt(dungeon.name))}
                <div>
                    <h2>${esc(txt(dungeon.name))}</h2>
                    <div class="masmorra-card-top">${rankBadge(dungeon.rank)}${dungeon.hasBoss ? `<span class="boss-badge">👹 ${esc(t('boss'))}</span>` : ''}</div>
                    ${txt(dungeon.description) ? `<p>${esc(txt(dungeon.description))}</p>` : ''}
                </div>
            </div>
            <div class="guide-modal-body">
                <div class="guide-info">
                    <h3>${esc(t('enemyTypes'))}</h3>
                    <div class="enemy-tags">${(dungeon.enemies || []).map((enemy) => `<span class="enemy-tag">${esc(txt(enemy))}</span>`).join('') || '—'}</div>
                </div>
                ${linked.length ? `
                <div class="guide-info">
                    <h3>${esc(t('monstersInBestiary'))}</h3>
                    <div class="enemy-tags">${linked.map((monster) => `<a class="monster-link" href="bestiario.html#${encodeURIComponent(monster.id)}">${esc(txt(monster.name))}</a>`).join('')}</div>
                </div>` : ''}
                <div class="guide-facts">
                    ${dungeon.floors ? `<div class="guide-fact"><span>${esc(t('floors'))}</span><strong>${esc(dungeon.floors)}</strong></div>` : ''}
                    <div class="guide-fact"><span>${esc(t('hasBoss'))}</span><strong>${esc(dungeon.hasBoss ? t('yes') : t('no'))}</strong></div>
                    ${dungeon.hasBoss && bossName ? `<div class="guide-fact"><span>${esc(t('boss'))}</span><strong>${esc(bossName)}</strong></div>` : ''}
                    ${(dungeon.hiddenRooms || []).length ? `<div class="guide-fact"><span>${esc(t('hiddenRooms'))}</span><strong>${esc(dungeon.hiddenRooms.map(txt).join(', '))}</strong></div>` : ''}
                </div>
                ${dungeon.hasBoss && txt(dungeon.boss?.description) ? infoBlock(t('boss'), txt(dungeon.boss.description)) : ''}
            </div>`, { type: 'dungeon', id: dungeon.id });
    }

    function renderDungeonNotes() {
        const container = $('masmorras-regras');
        if (!container || !rules?.dungeonNotes?.length) return;
        container.innerHTML = `
            <h3>${esc(t('dungeonsHowItWorks'))}</h3>
            <ul>${rules.dungeonNotes.map((note) => `<li>${esc(txt(note))}</li>`).join('')}</ul>`;
    }

    // ---------- Itens ----------
    function renderItems() {
        const list = $('lista-itens');
        if (!list) return;
        if (!items.length) {
            list.innerHTML = `<p class="nenhum-resultado">${esc(t('itemsComingSoon'))}</p>`;
            return;
        }
        const term = $('filtro-itens')?.value || '';
        const filtered = items.filter((item) => G.matchesSearch(term, [
            item.name,
            ...Object.values(item.versions || {}).flatMap((version) => [version.description, version.usefulness, version.craftResult])
        ]));
        if (!filtered.length) {
            list.innerHTML = `<p class="nenhum-resultado">${esc(t('noItem', 'No item found.'))}</p>`;
            return;
        }
        list.innerHTML = filtered.map((item, index) => `
            <div class="item card" tabindex="0" role="button" data-index="${index}" aria-label="${esc(txt(item.name))}">
                <div class="item-card-image">
                    ${G.renderImage(item.image, txt(item.name))}
                    <div class="item-name-overlay"><span>${esc(txt(item.name))}</span></div>
                </div>
            </div>`).join('');
        cardHandlers(list, filtered, openItem);
    }

    function openItem(item) {
        const rarities = (item.rarities || []).filter((id) => item.versions?.[id]);
        const versionHtml = (rarityId) => {
            const version = item.versions?.[rarityId] || {};
            return `
                ${infoBlock(t('description'), txt(version.description))}
                ${infoBlock(t('usefulness'), txt(version.usefulness))}
                ${item.craftable && txt(version.craftResult) ? infoBlock(t('craftable'), `${t('craftResult')}: ${txt(version.craftResult)}`) : ''}`;
        };
        const modal = openModal('item', `
            <div class="guide-modal-header">
                ${G.renderImage(item.image, txt(item.name))}
                <div>
                    <h2>${esc(txt(item.name))}</h2>
                    ${rarities.length > 1 ? `
                    <select class="item-raridade-dropdown" aria-label="${esc(t('filterRarity'))}">
                        ${rarities.map((id) => `<option value="${esc(id)}">${esc(G.labelOf(rules, 'rarities', id))}</option>`).join('')}
                    </select>` : (rarities[0] ? G.rarityBadge(rules, rarities[0]) : '')}
                </div>
            </div>
            <div class="guide-modal-body">
                <div class="item-version">${rarities[0] ? versionHtml(rarities[0]) : ''}</div>
                ${item.usable ? `<div class="guide-fact"><span>${esc(t('usable'))}</span><strong>${esc(t('yes'))}</strong></div>` : ''}
            </div>`, { type: 'item', id: item.id });
        modal.querySelector('.item-raridade-dropdown')?.addEventListener('change', (event) => {
            modal.querySelector('.item-version').innerHTML = versionHtml(event.target.value);
        });
    }

    // ---------- Busca, idioma e carregamento ----------
    function bindSearch(inputId, render) {
        const input = $(inputId);
        if (!input) return;
        input.addEventListener('input', render);
        input.closest('.search-container')?.querySelector('button')?.addEventListener('click', render);
    }

    function renderAll() {
        renderKingdoms();
        renderDungeons();
        renderDungeonNotes();
        renderItems();
    }

    document.addEventListener('site-language-changed', () => {
        if (!rules) return;
        const ref = reopen;
        renderAll();
        if (!ref) return;
        const source = { kingdom: [kingdoms, openKingdom], dungeon: [dungeons, openDungeon], item: [items, openItem] }[ref.type];
        const entry = source?.[0].find((candidate) => candidate.id === ref.id);
        if (entry) source[1](entry);
    });

    async function load() {
        setupMap();
        bindSearch('filtro-reinos', renderKingdoms);
        bindSearch('filtro-masmorras', renderDungeons);
        bindSearch('filtro-itens', renderItems);
        try {
            const [loadedRules, kingdomData, dungeonData, itemData, monsterData] = await Promise.all([
                G.loadRules(),
                G.loadJson('data/reinos.json'),
                G.loadJson('data/masmorras.json'),
                G.loadJson('data/itens.json'),
                G.loadJson('data/monsterData.json').catch(() => ({ monsters: [] }))
            ]);
            rules = loadedRules;
            kingdoms = Array.isArray(kingdomData) ? kingdomData : (kingdomData.kingdoms || []);
            dungeons = (Array.isArray(dungeonData) ? dungeonData : []).slice().sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
            items = Array.isArray(itemData) ? itemData : (itemData.items || []);
            monstersById = Object.fromEntries((monsterData.monsters || []).map((monster) => [monster.id, monster]));
            renderAll();
        } catch (error) {
            console.error('Erro ao carregar o guia:', error);
            ['lista-reinos', 'lista-masmorras', 'lista-itens'].forEach((id) => {
                if ($(id)) $(id).innerHTML = `<p class="nenhum-resultado">${esc(t('loadError'))}</p>`;
            });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
    else load();
})();

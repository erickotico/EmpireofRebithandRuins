// Bestiário: monstros, variantes (cada uma com card próprio), estados e elementos.
// Dados: data/monsterData.json + data/gameRules.json. Textos nos dois idiomas.
(() => {
    const G = window.GameData;
    const { esc, t, txt } = G;

    const grid = document.querySelector('.monster-grid');
    if (!grid) return;

    const searchInput = document.getElementById('searchMonster');
    const typeSelect = document.getElementById('filterType');
    const elementSelect = document.getElementById('filterElement');
    const variantsToggle = document.getElementById('showVariants');
    const countLabel = document.getElementById('monsterCount');

    let rules = null;
    let monsters = [];
    let byId = {};

    const CARD_STATS = ['health', 'physicalPower', 'magicPower', 'armor'];

    function statLabel(attributeId) {
        return G.labelOf(rules, 'attributes', attributeId);
    }

    function statValue(attributeId, value) {
        return G.formatStat(attributeId, value, window.SiteI18n?.lang) ?? '—';
    }

    function levelText(monster) {
        if (monster.levelMin == null) return '';
        const range = monster.levelMax != null && monster.levelMax !== monster.levelMin
            ? `${monster.levelMin}–${monster.levelMax}`
            : `${monster.levelMin}`;
        return `${t('level', 'Level')} ${range}`;
    }

    function starsHtml(count) {
        if (!count) return '';
        return `<span class="monster-stars" aria-label="${count}/7">${'★'.repeat(count)}${'☆'.repeat(Math.max(0, 7 - count))}</span>`;
    }

    function stateBadges(monster) {
        return (monster.states || [])
            .map((stateId) => G.findById(rules.monsterStates, stateId))
            .filter(Boolean)
            .map((state) => `<span class="state-badge" title="${esc(txt(state.name))}">${state.icon}</span>`)
            .join('');
    }

    function createCard(raw) {
        const monster = G.resolveMonster(raw, byId);
        const base = monster.variantOf ? byId[monster.variantOf] : null;
        const hostility = G.labelOf(rules, 'hostilities', monster.hostility);
        const stats = monster.stats || {};

        return `
            <article class="monster-card${base ? ' is-variant' : ''}" data-monster-id="${esc(monster.id)}" role="button" tabindex="0"
                aria-label="${esc(txt(monster.name))}">
                <div class="monster-card-image">
                    ${G.renderImage(monster.image, txt(monster.name))}
                    ${G.rarityBadge(rules, monster.rarity, 'monster-rarity')}
                    ${hostility ? `<span class="monster-hostility hostility-${esc(monster.hostility)}">${esc(hostility)}</span>` : ''}
                    <div class="monster-card-element">${G.elementBadge(rules, monster.element)}</div>
                </div>
                <div class="monster-card-body">
                    <div class="monster-basic-info">
                        <div>
                            <h3 class="monster-name">${esc(txt(monster.name))}</h3>
                            ${base ? `<div class="monster-variant-of">${esc(t('variantOf', 'Variant of'))} ${esc(txt(base.name))}</div>` : ''}
                            <div class="monster-level">${esc(levelText(monster))}</div>
                        </div>
                        <div class="monster-card-side">
                            ${starsHtml(monster.stars)}
                            <div class="monster-states">${stateBadges(monster)}</div>
                        </div>
                    </div>
                    ${txt(monster.region) ? `<div class="monster-location">${esc(txt(monster.region))}</div>` : ''}
                    <div class="monster-stats-row">
                        ${CARD_STATS.map((id) => `
                            <div class="stat-block">
                                <span class="stat-label">${esc(statLabel(id))}</span>
                                <span class="stat-value">${esc(statValue(id, stats[id]))}</span>
                            </div>`).join('')}
                    </div>
                </div>
            </article>
        `;
    }

    // ---------- Modal ----------
    function matchupsHtml(elementId) {
        if (elementId === 'family') return `<p class="muted">${esc(t('familyNote'))}</p>`;
        const element = G.findById(rules.elements, elementId);
        if (!element) return '';
        const { strong, weak } = G.getMatchups(rules, elementId);
        const list = (ids) => ids.map((id) => G.elementBadge(rules, id)).join(' ') || '—';
        return `
            <div class="matchups">
                <div class="matchup-row"><span class="matchup-label">${esc(t('strongAgainst'))}</span><span>${list(strong)}</span></div>
                <div class="matchup-row"><span class="matchup-label">${esc(t('weakAgainst'))}</span><span>${list(weak)}</span></div>
            </div>
        `;
    }

    let cachedMaxima = null;
    function maxStats() {
        if (cachedMaxima) return cachedMaxima;
        cachedMaxima = {};
        monsters.forEach((monster) => {
            Object.entries(monster.stats || {}).forEach(([key, value]) => {
                if (typeof value === 'number') cachedMaxima[key] = Math.max(cachedMaxima[key] || 0, value);
            });
        });
        return cachedMaxima;
    }

    function statsTabHtml(monster) {
        const base = monster.variantOf ? byId[monster.variantOf] : null;
        const stats = monster.stats;
        const source = monster.inherited.stats ? base?.statsNote : monster.statsNote;
        let note;
        if (!stats) note = t('statsPending');
        else if (monster.inherited.stats && base) note = t('statsInherited', '', { base: txt(base.name) });
        else if (source === 'unreal') note = t('statsUnreal');
        else note = t('statsConverted');

        const maxima = maxStats();
        const rows = stats ? rules.attributes.map((attribute) => {
            const value = stats[attribute.id];
            const shown = G.formatStat(attribute.id, value, window.SiteI18n?.lang);
            const percent = shown && maxima[attribute.id] ? Math.round((Number(value) / maxima[attribute.id]) * 100) : 0;
            return `
                <div class="stat-bar">
                    <div class="stat-bar-head">
                        <span class="stat-name">${esc(txt(attribute.name))}</span>
                        <span class="stat-number${shown ? '' : ' is-pending'}">${esc(shown ?? t('toBeDefined'))}</span>
                    </div>
                    <div class="stat-progress"><div class="stat-fill" style="width:${percent}%"></div></div>
                </div>`;
        }).join('') : '';

        return `
            <p class="stats-note">${esc(note)}</p>
            <div class="stats-container">${rows}</div>
            <div class="resistances">
                <h4>${esc(t('element'))}: ${G.elementBadge(rules, monster.element)}</h4>
                ${matchupsHtml(monster.element)}
            </div>
        `;
    }

    function inheritedNote(monster, key) {
        const base = monster.variantOf ? byId[monster.variantOf] : null;
        return monster.inherited[key] && base
            ? `<p class="inherited-note">${esc(t('inheritedFrom', '', { base: txt(base.name) }))}</p>`
            : '';
    }

    function skillsTabHtml(monster) {
        const skills = (monster.skills || []).map((skill) => `
            <div class="skill-item">
                <h4 class="skill-name">${esc(txt(skill.name))}</h4>
                ${txt(skill.description) ? `<p class="skill-desc">${esc(txt(skill.description))}</p>` : ''}
                ${skill.cooldown != null ? `<div class="skill-cd">${esc(t('cooldown'))}: ${esc(skill.cooldown)} s</div>` : ''}
            </div>`).join('') || `<p class="muted">${esc(t('noSkills'))}</p>`;
        return `
            ${monster.xp != null ? `<div class="xp-info">${esc(t('xpGained'))}: ${esc(monster.xp)}</div>` : ''}
            ${inheritedNote(monster, 'skills')}
            <div class="skills-list">${skills}</div>
        `;
    }

    function rewardsTabHtml(monster) {
        const drops = monster.drops || [];
        if (!drops.length) return `<p class="muted">${esc(t('noRewards'))}</p>`;
        const rarityOptions = rules.rarities
            .filter((rarity) => drops.some((drop) => (drop.rarities || []).includes(rarity.id)))
            .map((rarity) => `<option value="${esc(rarity.id)}">${esc(txt(rarity.name))}</option>`).join('');
        const items = drops.map((drop) => `
            <div class="reward-item" data-rarities="${esc((drop.rarities || []).join(' '))}">
                <span class="reward-name">${esc(txt(drop.item))}</span>
                <span class="reward-rarities">${(drop.rarities || []).map((id) => G.rarityBadge(rules, id, 'rarity-badge--small')).join('')}</span>
                <span class="reward-qty">${drop.quantity != null ? `${esc(t('quantity'))}: ${esc(drop.quantity)}` : ''}</span>
            </div>`).join('');
        return `
            ${inheritedNote(monster, 'drops')}
            ${rarityOptions ? `
            <div class="rarity-filter">
                <label for="rarity-select">${esc(t('filterRarity'))}:</label>
                <select id="rarity-select">
                    <option value="all">${esc(t('allRarities'))}</option>
                    ${rarityOptions}
                </select>
            </div>` : ''}
            <div class="rewards-list">${items}</div>
        `;
    }

    function variantsTabHtml(monster) {
        const variants = monsters.filter((other) => other.variantOf === monster.id);
        if (!variants.length) return `<p class="muted">${esc(t('noVariants'))}</p>`;
        return `
            ${monster.element === 'family' ? `<p class="muted">${esc(t('familyNote'))}</p>` : ''}
            <div class="variant-list">
                ${variants.map((variant) => `
                    <button type="button" class="variant-card" data-open-monster="${esc(variant.id)}">
                        <div class="variant-image">${G.renderImage(variant.image, txt(variant.name))}</div>
                        <div class="variant-info">
                            <h4>${esc(txt(variant.name))}</h4>
                            <div class="variant-badges">${G.rarityBadge(rules, variant.rarity, 'rarity-badge--small')} ${G.elementBadge(rules, variant.element, 'element-badge--small')}</div>
                            ${txt(variant.lore) ? `<p>${esc(txt(variant.lore))}</p>` : ''}
                        </div>
                    </button>`).join('')}
            </div>
        `;
    }

    function infoTabHtml(monster) {
        const base = monster.variantOf ? byId[monster.variantOf] : null;
        const types = (monster.types || []).map((id) => G.labelOf(rules, 'monsterTypes', id)).filter(Boolean).join(', ');
        const states = (monster.states || []).map((id) => G.findById(rules.monsterStates, id)).filter(Boolean);
        const levels = levelText(monster);
        const info = [
            [t('region'), txt(monster.region)],
            [t('behavior'), txt(monster.behavior)],
            [t('type'), types],
            [t('difficulty'), G.labelOf(rules, 'difficulties', monster.difficulty)],
            [t('hostility'), G.labelOf(rules, 'hostilities', monster.hostility)],
            [t('levels'), levels ? levels.slice(t('level', 'Level').length + 1) : '']
        ].filter(([, value]) => value);

        return `
            ${base ? `<p class="variant-of-link">${esc(t('variantOf'))} <button type="button" class="link-button" data-open-monster="${esc(base.id)}">${esc(txt(base.name))}</button></p>` : ''}
            ${txt(monster.lore) ? `<p class="monster-history">${esc(txt(monster.lore))}</p>` : ''}
            <div class="info-grid">
                ${info.map(([label, value]) => `<div class="info-item"><span class="info-label">${esc(label)}</span><span>${esc(value)}</span></div>`).join('')}
            </div>
            ${states.length ? `
            <div class="modal-states">
                <h4>${esc(t('possibleStates'))}</h4>
                ${states.map((state) => `<div class="state-row"><span class="state-icon">${state.icon}</span><div><strong>${esc(txt(state.name))}</strong><p>${esc(txt(state.description))}</p></div></div>`).join('')}
            </div>` : ''}
        `;
    }

    function createModal(monster) {
        const hasVariants = monsters.some((other) => other.variantOf === monster.id);
        const tabs = [
            ['info', t('informationTab', 'Information')],
            ['stats', t('attributes', 'Attributes')],
            ['skills', t('skills', 'Skills')],
            ['rewards', t('rewards', 'Rewards')],
            ...(hasVariants ? [['variants', t('variants', 'Variants')]] : [])
        ];
        const hostility = G.labelOf(rules, 'hostilities', monster.hostility);
        const panels = {
            info: infoTabHtml(monster),
            stats: statsTabHtml(monster),
            skills: skillsTabHtml(monster),
            rewards: rewardsTabHtml(monster),
            variants: hasVariants ? variantsTabHtml(monster) : ''
        };

        return `
            <div class="monster-modal">
                <div class="modal-content" role="dialog" aria-modal="true" aria-label="${esc(txt(monster.name))}">
                    <button type="button" class="modal-close" aria-label="${esc(t('close', 'Close'))}">×</button>
                    <div class="modal-header">
                        ${G.renderImage(monster.image, txt(monster.name))}
                        <div class="modal-title">
                            <h2>${esc(txt(monster.name))}</h2>
                            <div class="modal-meta">
                                ${levelText(monster) ? `<span class="modal-level">${esc(levelText(monster))}</span>` : ''}
                                ${starsHtml(monster.stars)}
                                ${G.rarityBadge(rules, monster.rarity)}
                                ${hostility ? `<span class="modal-hostility hostility-${esc(monster.hostility)}">${esc(hostility)}</span>` : ''}
                                ${G.elementBadge(rules, monster.element)}
                            </div>
                        </div>
                    </div>
                    <div class="modal-tabs" role="tablist">
                        ${tabs.map(([key, label], index) => `<button type="button" class="tab-btn${index === 0 ? ' active' : ''}" role="tab" aria-selected="${index === 0}" data-tab="${key}">${esc(label)}</button>`).join('')}
                    </div>
                    <div class="modal-body">
                        ${tabs.map(([key], index) => `<div class="tab-content${index === 0 ? ' active' : ''}" data-tab="${key}">${panels[key]}</div>`).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    let openMonsterId = null;

    function closeModal() {
        const modal = document.querySelector('.monster-modal');
        openMonsterId = null;
        if (!modal) return;
        modal.remove();
        document.body.style.overflow = '';
        if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    }

    function openMonster(id) {
        const raw = byId[id];
        if (!raw) return;
        document.querySelector('.monster-modal')?.remove();
        const monster = G.resolveMonster(raw, byId);
        document.body.insertAdjacentHTML('beforeend', createModal(monster));
        document.body.style.overflow = 'hidden';
        openMonsterId = id;
        history.replaceState(null, '', `#${encodeURIComponent(id)}`);

        const modal = document.querySelector('.monster-modal');
        G.setupTabs(modal);
        G.setupModalClose(modal, closeModal);
        modal.querySelector('.modal-close')?.focus();

        modal.querySelectorAll('[data-open-monster]').forEach((button) => {
            button.addEventListener('click', () => openMonster(button.dataset.openMonster));
        });

        const select = modal.querySelector('#rarity-select');
        select?.addEventListener('change', () => {
            modal.querySelectorAll('.reward-item').forEach((item) => {
                const rarities = item.dataset.rarities.split(' ');
                item.style.display = select.value === 'all' || rarities.includes(select.value) ? '' : 'none';
            });
        });
    }

    // ---------- Lista e filtros ----------
    function filteredMonsters() {
        const term = searchInput?.value || '';
        const type = typeSelect?.value || '';
        const element = elementSelect?.value || '';
        const showVariants = variantsToggle ? variantsToggle.checked : true;

        return monsters.filter((raw) => {
            if (!showVariants && raw.variantOf) return false;
            const monster = G.resolveMonster(raw, byId);
            const base = monster.variantOf ? byId[monster.variantOf] : null;
            if (type && !(monster.types || []).includes(type)) return false;
            if (element && monster.element !== element) return false;
            return G.matchesSearch(term, [monster.name, base?.name, monster.region]);
        });
    }

    function render() {
        const list = filteredMonsters();
        grid.innerHTML = list.length
            ? list.map(createCard).join('')
            : `<p class="muted grid-message">${esc(t('noResults'))}</p>`;
        if (countLabel) countLabel.textContent = t('monsterCount', '{n}', { n: list.length });
    }

    function fillFilters() {
        if (typeSelect) {
            const used = new Set(monsters.flatMap((monster) => monster.types || []));
            const current = typeSelect.value;
            typeSelect.innerHTML = `<option value="">${esc(t('allTypes'))}</option>` + rules.monsterTypes
                .filter((type) => used.has(type.id))
                .map((type) => ({ id: type.id, label: txt(type.name) }))
                .sort((a, b) => a.label.localeCompare(b.label))
                .map((type) => `<option value="${esc(type.id)}">${esc(type.label)}</option>`).join('');
            typeSelect.value = current;
        }
        if (elementSelect) {
            const current = elementSelect.value;
            elementSelect.innerHTML = `<option value="">${esc(t('allElements'))}</option>` +
                [...rules.elements, ...rules.specialElements]
                    .map((element) => `<option value="${esc(element.id)}">${element.icon ? `${element.icon} ` : ''}${esc(txt(element.name))}</option>`).join('');
            elementSelect.value = current;
        }
    }

    function renderStatesSection() {
        const container = document.getElementById('monsterStates');
        if (!container) return;
        container.innerHTML = rules.monsterStates.map((state) => `
            <div class="state-card">
                <div class="state-card-icon">${state.icon}</div>
                <h3>${esc(txt(state.name))}</h3>
                <p>${esc(txt(state.description))}</p>
            </div>`).join('');
    }

    function renderElementsSection() {
        const container = document.getElementById('elementChart');
        if (!container) return;
        container.innerHTML = rules.elements.map((element) => {
            const { strong, weak } = G.getMatchups(rules, element.id);
            return `
                <div class="element-card" style="--element-color:${esc(element.color)}">
                    <h3>${element.icon} ${esc(txt(element.name))}</h3>
                    <div class="matchup-row"><span class="matchup-label">${esc(t('strongAgainst'))}</span><span>${strong.map((id) => G.elementBadge(rules, id, 'element-badge--small')).join(' ') || '—'}</span></div>
                    <div class="matchup-row"><span class="matchup-label">${esc(t('weakAgainst'))}</span><span>${weak.map((id) => G.elementBadge(rules, id, 'element-badge--small')).join(' ') || '—'}</span></div>
                </div>`;
        }).join('');
    }

    function renderAll() {
        fillFilters();
        render();
        renderStatesSection();
        renderElementsSection();
    }

    grid.addEventListener('click', (event) => {
        const card = event.target.closest('.monster-card');
        if (card) openMonster(card.dataset.monsterId);
    });
    grid.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const card = event.target.closest('.monster-card');
        if (!card) return;
        event.preventDefault();
        openMonster(card.dataset.monsterId);
    });

    searchInput?.addEventListener('input', render);
    document.getElementById('searchButton')?.addEventListener('click', render);
    typeSelect?.addEventListener('change', render);
    elementSelect?.addEventListener('change', render);
    variantsToggle?.addEventListener('change', render);

    document.addEventListener('site-language-changed', () => {
        if (!rules) return;
        const reopen = openMonsterId;
        renderAll();
        if (reopen) openMonster(reopen);
    });

    async function load() {
        try {
            const [loadedRules, data] = await Promise.all([G.loadRules(), G.loadJson('data/monsterData.json')]);
            rules = loadedRules;
            monsters = data.monsters || [];
            byId = Object.fromEntries(monsters.map((monster) => [monster.id, monster]));
            renderAll();
            const fromHash = decodeURIComponent(location.hash.slice(1));
            if (fromHash && byId[fromHash]) openMonster(fromHash);
        } catch (error) {
            console.error('Erro ao carregar o bestiário:', error);
            grid.innerHTML = `<p class="error grid-message">${esc(t('loadError'))}</p>`;
        }
    }

    load();
})();

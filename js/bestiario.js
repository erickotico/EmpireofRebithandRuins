/*Lista de Raridade de monstros
    Comum
    Incomum
    Raro
    Épico
    Lendário
    Deus
    Imortal


------- Elementos ------- 
    "fogo"
    "agua"  
    "terra"
    "sombra"
    "luz"
    "eletrico"
    "gelo"
    "veneno"

*/

const RARITY_LABELS = {
    comum: 'Comum',
    incomum: 'Incomum',
    raro: 'Raro',
    epico: 'Épico',
    lendario: 'Lendário',
    deus: 'Deus',
    imortal: 'Imortal'
};

function normalizeRarityKey(value) {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return 'comum';

    const compact = raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z]/g, '');

    const aliases = {
        comum: 'comum',
        incomum: 'incomum',
        raro: 'raro',
        epico: 'epico',
        lendario: 'lendario',
        deus: 'deus',
        divindade: 'deus',
        imortal: 'imortal'
    };

    return aliases[compact] || 'comum';
}

function normalizeRarityLabel(value) {
    const key = normalizeRarityKey(value);
    return RARITY_LABELS[key] || 'Comum';
}

function resolveRewardRarity(reward = {}) {
    const candidates = [];

    if (Array.isArray(reward.raridades)) {
        candidates.push(...reward.raridades);
    }
    if (reward.raridade) candidates.push(reward.raridade);
    if (reward.rarity) candidates.push(reward.rarity);

    for (const candidate of candidates) {
        const label = normalizeRarityLabel(candidate);
        if (label) return label;
    }

    return 'Comum';
}

function normalizeHostilityKey(value) {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return 'neutro';

    const compact = raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z]/g, '');

    const aliases = {
        pacifico: 'pacifico',
        passivo: 'pacifico',
        passifica: 'pacifico',
        passifico: 'pacifico',
        agressivo: 'agressivo',
        hostil: 'hostil',
        hotil: 'hostil',
        neutro: 'neutro',
        neeutro: 'neutro',
        neutral: 'neutro',
        normal: 'neutro',
        assassino: 'assassino',
        assassin: 'assassino'
    };

    return aliases[compact] || 'neutro';
}

function resolveMonsterHostility(monster = {}) {
    const rawValue = monster?.informacoes?.hostilidade ?? monster?.hostilidade ?? '';
    const behaviorValue = monster?.informacoes?.comportamento ?? '';
    const candidates = [rawValue, behaviorValue, 'Neutro'];

    for (const candidate of candidates) {
        const key = normalizeHostilityKey(candidate);
        if (key !== 'neutro' || candidate && String(candidate).toLowerCase().includes('neutro')) {
            const labels = {
                pacifico: 'Pacífico',
                agressivo: 'Agressivo',
                hostil: 'Hostil',
                neutro: 'Neutro',
                assassino: 'Assassino'
            };
            return labels[key] || 'Neutro';
        }
    }

    return 'Neutro';
}

function sanitizeMonsterData(monsters = []) {
    return monsters.map(monster => {
        if (!monster) return monster;

        const normalizedHostility = resolveMonsterHostility(monster);
        if (monster.informacoes) {
            monster.informacoes.hostilidade = normalizedHostility;
        } else {
            monster.informacoes = { hostilidade: normalizedHostility };
        }

        return monster;
    });
}

// Função para obter chance de drop baseada na raridade
function getDropChance(rarity) {
    const label = normalizeRarityLabel(rarity);
    const chances = {
        'Comum': 100,
        'Incomum': 75,
        'Raro': 50,
        'Épico': 35,
        'Lendário': 25,
        'Deus': 10,
        'Imortal': 5
    };
    return chances[label] || 0;
}

function setupModalCloseHandlers(modal, onClose) {
    if (!modal || typeof onClose !== 'function') return;

    modal.addEventListener('click', (event) => {
        const target = event.target;
        const clickedCloseButton = target && typeof target.closest === 'function'
            ? target.closest('.modal-close')
            : null;

        if (target === modal || clickedCloseButton) {
            onClose();
        }
    });
}

if (typeof module !== 'undefined') {
    module.exports = {
        normalizeRarityKey,
        normalizeRarityLabel,
        resolveRewardRarity,
        normalizeHostilityKey,
        resolveMonsterHostility,
        getDropChance,
        sanitizeMonsterData,
        setupModalCloseHandlers
    };
}

if (typeof document !== 'undefined') {
(() => {
    const monsterGrid = document.querySelector('.monster-grid');
    if (!monsterGrid) return;

    const translate = (key, fallback) => typeof window.getSiteTranslation === 'function'
        ? window.getSiteTranslation(key, fallback)
        : fallback;
    const translatedRarity = (key, fallback) => translate({
        comum: 'common', incomum: 'uncommon', raro: 'rare', epico: 'epic',
        lendario: 'legendary', deus: 'god', imortal: 'immortal'
    }[key] || key, fallback);
    const translatedHostility = value => {
        const key = normalizeHostilityKey(value);
        return translate({
            pacifico: 'peaceful', agressivo: 'aggressive', hostil: 'hostile', neutro: 'neutral', assassino: 'assassin'
        }[key] || 'neutral', resolveMonsterHostility({ hostilidade: value }));
    };

    let monsters = [];

    // Função para criar estrelas
    function createStars(count) {
        return `<div class="monster-stars">${'★'.repeat(count)}${'☆'.repeat(7 - count)}</div>`;
    }

    // Função para renderizar card
    function createMonsterCard(monster) {
        const rarityKey = normalizeRarityKey(monster.rarity);
        const rarityLabel = translatedRarity(rarityKey, normalizeRarityLabel(monster.rarity));
        const hostilityLabel = translatedHostility(monster.informacoes?.hostilidade ?? monster.hostilidade);

        return `
            <article class="monster-card ${rarityKey}" data-monster-id="${monster.id}" role="button" tabindex="0" onclick="window.openMonsterModalById(${monster.id})" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); window.openMonsterModalById(${monster.id}); }">
                <div class="monster-card-image">
                    <img src="${monster.image}" alt="${monster.name}">
                    <span class="monster-rarity ${rarityKey}">${rarityLabel}</span>
                    <span class="monster-hostility">${hostilityLabel}</span>
                </div>

                <div class="monster-card-body">
                    <div class="monster-basic-left">
                        <h3 class="monster-name">${monster.name}</h3>
                        <div class="monster-level">${translate('level', 'Level')} ${monster.level}</div>
                    </div>

                    <div class="monster-basic-right">
                        <div class="monster-stars">${'★'.repeat(monster.stars)}${'☆'.repeat(7 - monster.stars)}</div>
                    </div>

                    <div class="monster-location">${monster.informacoes.regiao}</div>

                    <div class="monster-stats-row" aria-hidden="false">
                        <div class="stat-block">
                            <span class="stat-label">HP</span>
                            <span class="stat-value">${monster.estatisticas.vida}</span>
                        </div>
                        <div class="stat-block">
                            <span class="stat-label">${translate('strength', 'Strength')}</span>
                            <span class="stat-value">${monster.estatisticas.forca}</span>
                        </div>
                        <div class="stat-block">
                            <span class="stat-label">${translate('agility', 'Agility')}</span>
                            <span class="stat-value">${monster.estatisticas.agilidade}</span>
                        </div>
                        <div class="stat-block">
                            <span class="stat-label">${translate('armor', 'Armor')}</span>
                            <span class="stat-value">${monster.estatisticas.armadura}</span>
                        </div>
                    </div>
                </div>
            </article>
        `;
    }

    // Status de resistência
    function getResistanceIcon(value) {
        const icons = {
            'muito_forte': '<span class="resistance-icon muito-forte">⯅⯅</span>',
            'forte': '<span class="resistance-icon forte">⯅</span>',
            'neutro': '<span class="resistance-icon neutro">−</span>',
            'fraco': '<span class="resistance-icon fraco">⯆</span>',
            'muito_fraco': '<span class="resistance-icon muito-fraco">⯆⯆</span>'
        };
        return icons[value] || '';
    }

    function createMonsterModal(monster) {
        const baseTabs = [
            { key: 'info', label: translate('informationTab', 'Information') },
            { key: 'stats', label: translate('statistics', 'Statistics') },
            { key: 'skills', label: translate('skills', 'Skills') },
            { key: 'rewards', label: translate('rewards', 'Rewards') }
        ];

        // Extras dinâmicos
        const extraTabs = [];
        
        // Verifica se tem variantes
        if (monster.hasVariantes) {
            extraTabs.push({ key: 'variantes', label: translate('variants', 'Variants') });
        }

        const allTabs = [...baseTabs, ...extraTabs];

        // Criar html dos botões
        const tabsHtml = allTabs.map((t, i) => `<button class="tab-btn ${i === 0 ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('');

        // Resistências, skills, rewards
        const resistenciasHtml = Object.entries(monster.estatisticas.resistencias || {})
            .filter(([, v]) => v && v !== 'neutro')
            .map(([tipo, valor]) => `
                <div class="resistance-row">
                    <span class="resistance-type">${tipo}</span>
                    ${getResistanceIcon(valor)}
                </div>
            `).join('') || '';

        const skillsHtml = (monster.habilidades?.listaHabilidades || []).map(skill => `
            <div class="skill-item">
                <h4 class="skill-name">${skill.nome}</h4>
                <p class="skill-desc">${skill.descricao}</p>
                <div class="skill-cd">Cooldown: ${skill.cooldown}</div>
            </div>
        `).join('') || '<p class="muted">Nenhuma habilidade listada.</p>';

        const rewardsHtml = (monster.recompensas || []).map(r => {
            const rewardRarity = resolveRewardRarity(r);
            const rewardClass = normalizeRarityKey(rewardRarity);
            const translatedRewardRarity = translatedRarity(rewardClass, rewardRarity);

            return `
            <div class="reward-item" data-rarity="${rewardClass}">
                <span class="reward-name">${r.item}</span>
                <span class="reward-rarity ${rewardClass}">${translatedRewardRarity}</span>
                <span class="reward-chance">${getDropChance(rewardRarity)}%</span>
                <span class="reward-qty">${translate('quantity', 'Qty')}: ${r.quantidade}</span>
            </div>
        `;
        }).join('') || '<p class="muted">Nenhuma recompensa listada.</p>';

        // Variantes html (lista)
        const variantesHtml = (monster.listaVariantes || [])
            .map(v => {
                const variantClass = normalizeRarityKey(v.raridade);
                const variantRarity = translatedRarity(variantClass, normalizeRarityLabel(v.raridade));
                const rarityLabel = v.raridade ? `<span class="variant-rarity ${variantClass}">${variantRarity}</span>` : '';
                return `
                <div class="variant-card ${variantClass}">
                    <div class="variant-image"><img src="${v.image}" alt="${v.name}"></div>
                    <div class="variant-info">
                        <h4>${v.name}</h4>
                        ${rarityLabel}
                        <p>${v.info || ''}</p>
                    </div>
                </div>
            `;
            }).join('') || '<p class="muted">Sem variantes.</p>';

        const monsterRarityKey = normalizeRarityKey(monster.rarity);
        const monsterRarity = translatedRarity(monsterRarityKey, normalizeRarityLabel(monster.rarity));
        const monsterHostility = translatedHostility(monster.informacoes?.hostilidade ?? monster.hostilidade);

        return `
            <div class="monster-modal">
                <div class="modal-content" role="dialog" aria-modal="true" aria-label="${monster.name}">
                    <button class="modal-close" aria-label="Fechar">×</button>

                    <div class="modal-header">
                        <img src="${monster.image}" alt="${monster.name}">
                        <div class="modal-title">
                            <h2>${monster.name}</h2>
                            <div class="modal-meta">
                                <span class="modal-level">${translate('level', 'Level')} ${monster.level}</span>
                                <div class="modal-stars">${'★'.repeat(monster.stars)}${'☆'.repeat(7 - monster.stars)}</div>
                                <span class="modal-rarity ${monsterRarityKey}">${monsterRarity}</span>
                                <span class="modal-hostility">${monsterHostility}</span>
                            </div>
                        </div>
                    </div>

                    <div class="modal-tabs">${tabsHtml}</div>

                    <div class="modal-body">
                        <div class="tab-content info active">
                            <p class="monster-history">${monster.informacoes.historia}</p>
                            <div class="info-grid">
                                <div class="info-item"><span class="info-label">Região:</span><span>${monster.informacoes.regiao}</span></div>
                                <div class="info-item"><span class="info-label">Comportamento:</span><span>${monster.informacoes.comportamento}</span></div>
                                <div class="info-item"><span class="info-label">Tipo:</span><span>${monster.informacoes.tipo}</span></div>
                                <div class="info-item"><span class="info-label">Dificuldade:</span><span>${monster.informacoes.dificuldade}</span></div>
                            </div>
                        </div>

                        <div class="tab-content stats">
                            <h3 style="color: #fff; margin-bottom: 20px; font-size: 20px;">${translate('statistics', 'Statistics')}</h3>
                            <div class="stats-container">
                                ${Object.entries(monster.estatisticas).filter(([key]) => key !== 'resistencias').map(([key, value]) => `
                                    <div class="stat-bar" style="margin-bottom: 15px;">
                                        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                                            <span class="stat-name" style="font-weight: 600; color: #ddd; text-transform: capitalize;">${key}</span>
                                            <span class="stat-value" style="font-weight: 600; color: #fff;">${value}</span>
                                        </div>
                                        <div class="stat-progress" style="width: 100%; height: 8px; background: #333; border-radius: 4px; overflow: hidden;">
                                            <div class="stat-fill" style="width: ${value}%; height: 100%; background: #fff; transition: width 0.3s;"></div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                            <div class="resistances">
                                <h4>${translate('resistances', 'Resistances and Weaknesses')}</h4>
                                <div class="resistances-grid">
                                    ${resistenciasHtml || '<p class="muted">Neutro em todos os atributos.</p>'}
                                </div>
                            </div>
                        </div>

                        <div class="tab-content skills">
                            <div class="xp-info">${translate('xpGained', 'XP gained on defeat')}: ${monster.habilidades?.xpGanho ?? 0}</div>
                            <div class="skills-list">${skillsHtml}</div>
                        </div>

                        <div class="tab-content rewards">
                            <div class="rarity-filter">
                                <label for="rarity-select">${translate('filterRarity', 'Filter by rarity')}:</label>
                                <select id="rarity-select">
                                    <option value="all">${translate('allRarities', 'All rarities')}</option>
                                    <option value="comum">Comum</option>
                                    <option value="incomum">Incomum</option>
                                    <option value="raro">Raro</option>
                                    <option value="epico">Épico</option>
                                    <option value="lendario">Lendário</option>
                                    <option value="deus">Deus</option>
                                    <option value="imortal">Imortal</option>
                                </select>
                            </div>
                            <div class="rewards-list">${rewardsHtml}</div>
                        </div>

                        <div class="tab-content variantes">
                            ${variantesHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function setupModalTabs(modal) {
        const tabs = Array.from(modal.querySelectorAll('.tab-btn'));
        const contents = Array.from(modal.querySelectorAll('.tab-content'));

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.tab;
                tabs.forEach(t => t.classList.remove('active'));
                contents.forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                const content = modal.querySelector(`.tab-content.${target}`);
                if (content) content.classList.add('active');
            });
        });
    }

    window.openMonsterModalById = function(monsterId) {
        const parsedMonsterId = Number(monsterId);
        const monster = monsters.find(m => Number(m.id) === parsedMonsterId);
        if (!monster) {
            console.warn('Monstro não encontrado para o card clicado:', monsterId);
            return;
        }

        const existingModal = document.querySelector('.monster-modal');
        existingModal?.remove();

        document.body.insertAdjacentHTML('beforeend', createMonsterModal(monster));
        document.body.style.overflow = 'hidden';

        const modal = document.querySelector('.monster-modal');
        if (!modal) return;
        window.translateDynamicContent?.(modal);

        const dialog = modal.querySelector('.modal-content');
        setupModalTabs(dialog);

        // Adicionar listener para filtro de raridade
        const select = modal.querySelector('#rarity-select');
        if (select) {
            select.addEventListener('change', () => {
                const selected = select.value;
                const items = modal.querySelectorAll('.reward-item');
                items.forEach(item => {
                    if (selected === 'all' || item.dataset.rarity === selected) {
                        item.style.display = '';
                    } else {
                        item.style.display = 'none';
                    }
                });
            });
        }

        setupModalCloseHandlers(modal, () => {
            modal.remove();
            document.body.style.overflow = '';
        });
    };

    // Carregar monstros
    async function loadMonsters() {
        try {
            const response = await fetch('./data/monsterData.json');
            const data = await response.json();
            monsters = sanitizeMonsterData(data.monsters || []);
            
            // Coletar tipos únicos divididos
            const allTypes = new Set();
            monsters.forEach(monster => {
                const types = monster.informacoes.tipo.split(' / ');
                types.forEach(type => allTypes.add(type.trim()));
            });
            const uniqueTypes = Array.from(allTypes).sort();
            
            // Popular o select de tipo
            const filterTypeSelect = document.getElementById('filterType');
            filterTypeSelect.innerHTML = '<option value="">Todos os tipos</option>';
            uniqueTypes.forEach(type => {
                const option = document.createElement('option');
                option.value = type.toLowerCase();
                option.textContent = type;
                filterTypeSelect.appendChild(option);
            });
            
            // Renderizar cards
            renderMonsters(monsters);
        } catch (error) {
            console.error('Erro ao carregar monstros:', error);
            monsterGrid.innerHTML = '<p class="error">Erro ao carregar monstros: ' + error.message + '</p>';
        }
    }

    // Função para renderizar monstros com filtros
    function renderMonsters(monsterList) {
        monsterGrid.innerHTML = monsterList.map(createMonsterCard).join('');
        window.translateDynamicContent?.(monsterGrid);
    }

    document.addEventListener('site-language-changed', () => {
        document.querySelector('.monster-modal')?.remove();
        renderMonsters(monsters);
    });

    // Implementar filtros
    const searchInput = document.getElementById('searchMonster');
    const filterTypeSelect = document.getElementById('filterType');

    function applyFilters() {
        const searchTerm = searchInput.value.toLowerCase();
        const selectedType = filterTypeSelect.value.toLowerCase();
        
        const filtered = monsters.filter(monster => {
            const matchesSearch = monster.name.toLowerCase().includes(searchTerm);
            const monsterTypes = monster.informacoes.tipo.split(' / ').map(t => t.trim().toLowerCase());
            const matchesType = !selectedType || monsterTypes.includes(selectedType);
            return matchesSearch && matchesType;
        });
        
        renderMonsters(filtered);
    }

    searchInput.addEventListener('input', applyFilters);
    filterTypeSelect.addEventListener('change', applyFilters);
    document.getElementById('searchButton').addEventListener('click', applyFilters);

    loadMonsters();
})();
}
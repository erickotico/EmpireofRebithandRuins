/*Lista de Raridade de monstros
    comum
    incomum
    raro
    Épico
    lendário
    deus
    imortal


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

// Função para obter chance de drop baseada na raridade
function getDropChance(rarity) {
    const chances = {
        'Comum': 100,
        'Incomum': 75,
        'Raro': 50,
        'lendario': 25,
        'deus': 10,
        'imortal': 5
    };
    return chances[rarity] || 0;
}


document.addEventListener('DOMContentLoaded', () => {
    const monsterGrid = document.querySelector('.monster-grid');
    let monsters = [];

    // Função para criar estrelas
    function createStars(count) {
        return `<div class="monster-stars">${'★'.repeat(count)}${'☆'.repeat(7 - count)}</div>`;
    }

    // Função para renderizar card
    function createMonsterCard(monster) {
        return `
            <article class="monster-card ${monster.rarity}" data-monster-id="${monster.id}">
                <div class="monster-card-image">
                    <img src="${monster.image}" alt="${monster.name}">
                    <span class="monster-rarity">${monster.rarity}</span>
                </div>

                <div class="monster-card-body">
                    <div class="monster-basic-left">
                        <h3 class="monster-name">${monster.name}</h3>
                        <div class="monster-level">Nível ${monster.level}</div>
                    </div>

                    <div class="monster-basic-right">
                        <div class="monster-stars">${'★'.repeat(monster.stars)}${'☆'.repeat(7 - monster.stars)}</div>
                    </div>

                    <div class="monster-location">${monster.informacoes.regiao}</div>

                    <div class="monster-stats-row" aria-hidden="false">
                        <div class="stat-block">
                            <span class="stat-label">Vida</span>
                            <span class="stat-value">${monster.estatisticas.vida}</span>
                        </div>
                        <div class="stat-block">
                            <span class="stat-label">Força</span>
                            <span class="stat-value">${monster.estatisticas.forca}</span>
                        </div>
                        <div class="stat-block">
                            <span class="stat-label">Agilidade</span>
                            <span class="stat-value">${monster.estatisticas.agilidade}</span>
                        </div>
                        <div class="stat-block">
                            <span class="stat-label">Armadura</span>
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
            { key: 'info', label: 'Informações' },
            { key: 'stats', label: 'Estatísticas' },
            { key: 'skills', label: 'Habilidades' },
            { key: 'rewards', label: 'Recompensas' }
        ];

        // Extras dinâmicos
        const extraTabs = [];
        
        // Verifica se tem variantes
        if (monster.hasVariantes) {
            extraTabs.push({ key: 'variantes', label: 'Variantes' });
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

        const rewardsHtml = (monster.recompensas || []).map(r => `
            <div class="reward-item" data-rarity="${r.raridade}">
                <span class="reward-name">${r.item}</span>
                <span class="reward-rarity">${r.raridade}</span>
                <span class="reward-chance">${getDropChance(r.raridade)}%</span>
                <span class="reward-qty">Qtd: ${r.quantidade}</span>
            </div>
        `).join('') || '<p class="muted">Nenhuma recompensa listada.</p>';

        // Variantes html (lista)
        const variantesHtml = (monster.listaVariantes || [])
            .map(v => `
                <div class="variant-card">
                    <div class="variant-image"><img src="${v.image}" alt="${v.name}"></div>
                    <div class="variant-info">
                        <h4>${v.name}</h4>
                        <p>${v.info || ''}</p>
                    </div>
                </div>
            `).join('') || '<p class="muted">Sem variantes.</p>';

        return `
            <div class="monster-modal">
                <div class="modal-content" role="dialog" aria-modal="true" aria-label="${monster.name}">
                    <button class="modal-close" aria-label="Fechar">×</button>

                    <div class="modal-header">
                        <img src="${monster.image}" alt="${monster.name}">
                        <div class="modal-title">
                            <h2>${monster.name}</h2>
                            <div class="modal-meta">
                                <span class="modal-level">Nível ${monster.level}</span>
                                <div class="modal-stars">${'★'.repeat(monster.stars)}${'☆'.repeat(7 - monster.stars)}</div>
                                <span class="modal-rarity ${monster.rarity}">${monster.rarity}</span>
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
                            <h3 style="color: #fff; margin-bottom: 20px; font-size: 20px;">Estatísticas</h3>
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
                                <h4>Resistências e Fraquezas</h4>
                                <div class="resistances-grid">
                                    ${resistenciasHtml || '<p class="muted">Neutro em todos os atributos.</p>'}
                                </div>
                            </div>
                        </div>

                        <div class="tab-content skills">
                            <div class="xp-info">XP por Abate: ${monster.habilidades?.xpGanho ?? 0}</div>
                            <div class="skills-list">${skillsHtml}</div>
                        </div>

                        <div class="tab-content rewards">
                            <div class="rarity-filter">
                                <label for="rarity-select">Filtrar por Raridade:</label>
                                <select id="rarity-select">
                                    <option value="all">Todas as Raridades</option>
                                    <option value="Comum">Comum</option>
                                    <option value="Incomum">Incomum</option>
                                    <option value="Raro">Raro</option>
                                    <option value="lendario">lendario</option>
                                    <option value="deus">deus</option>
                                    <option value="imortal">imortal</option>
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

    // Substituir evento de clique no grid para usar a nova criação/setup
    monsterGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.monster-card');
        if (!card) return;
        const monsterId = card.dataset.monsterId;
        const monster = monsters.find(m => m.id === monsterId);
        if (!monster) return;

        document.body.insertAdjacentHTML('beforeend', createMonsterModal(monster));
        document.body.style.overflow = 'hidden';

        const modal = document.querySelector('.monster-modal');
        if (!modal) return;

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

        // Fechar modal
        modal.addEventListener('click', (ev) => {
            if (ev.target === modal || ev.target.matches('.modal-close')) {
                modal.remove();
                document.body.style.overflow = '';
            }
        });
    });

    // Carregar monstros
    async function loadMonsters() {
        try {
            const response = await fetch('./data/monsterData.json');
            const data = await response.json();
            monsters = data.monsters;
            
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
                option.value = type;
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
    }

    // Implementar filtros
    const searchInput = document.getElementById('searchMonster');
    const filterTypeSelect = document.getElementById('filterType');

    function applyFilters() {
        const searchTerm = searchInput.value.toLowerCase();
        const selectedType = filterTypeSelect.value;
        
        const filtered = monsters.filter(monster => {
            const matchesSearch = monster.name.toLowerCase().includes(searchTerm);
            const monsterTypes = monster.informacoes.tipo.split(' / ').map(t => t.trim());
            const matchesType = !selectedType || monsterTypes.includes(selectedType);
            return matchesSearch && matchesType;
        });
        
        renderMonsters(filtered);
    }

    searchInput.addEventListener('input', applyFilters);
    filterTypeSelect.addEventListener('change', applyFilters);
    document.getElementById('searchButton').addEventListener('click', applyFilters);

    loadMonsters();
});
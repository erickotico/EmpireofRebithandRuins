/*Lista de Raridade de monstros
    comum
    incomum
    raro
    lendário
*/


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
                            <span class="stat-value">${monster.estatisticas.pontosVida}</span>
                        </div>
                        <div class="stat-block">
                            <span class="stat-label">Força</span>
                            <span class="stat-value">${monster.estatisticas.dano}</span>
                        </div>
                        <div class="stat-block">
                            <span class="stat-label">Velocidade</span>
                            <span class="stat-value">${monster.estatisticas.velocidade}</span>
                        </div>
                        <div class="stat-block">
                            <span class="stat-label">Defesa</span>
                            <span class="stat-value">${monster.estatisticas.defesa}</span>
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

        // Extras dinâmicos - FILTRA VARIANTES VAZIAS
        const extraTabs = [];
        
        // Verifica variantes com nome preenchido
        const variantesValidas = (monster.variantes || []).filter(v => v.name && v.name.trim() !== '');
        if (variantesValidas.length > 0) {
            extraTabs.push({ key: 'variantes', label: 'Variantes' });
        }

        // Verifica corrompido com nome preenchido
        if (monster.corrompido?.name && monster.corrompido.name.trim() !== '') {
            extraTabs.push({ key: 'corrompido', label: 'Corrompido' });
        }

        // Verifica zombie com nome preenchido
        if (monster.zombie?.name && monster.zombie.name.trim() !== '') {
            extraTabs.push({ key: 'zumbi', label: 'Zumbi' });
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
            <div class="reward-item">
                <span class="reward-name">${r.item}</span>
                <span class="reward-chance">${r.chance}%</span>
                <span class="reward-qty">Qtd: ${r.quantidade}</span>
            </div>
        `).join('') || '<p class="muted">Nenhuma recompensa listada.</p>';

        // Variantes html (lista) - FILTRA VAZIAS
        const variantesHtml = variantesValidas
            .map(v => `
                <div class="variant-card">
                    <div class="variant-image"><img src="${v.image}" alt="${v.name}"></div>
                    <div class="variant-info">
                        <h4>${v.name}</h4>
                        <p>${v.info || ''}</p>
                    </div>
                </div>
            `).join('') || '<p class="muted">Sem variantes.</p>';

        // Corrompido (se existir e name não vazio)
        const corrompidoHtml = (monster.corrompido?.name && monster.corrompido.name.trim() !== '') ? `
            <div class="variant-card single">
                <div class="variant-image"><img src="${monster.corrompido.image}" alt="${monster.corrompido.name}"></div>
                <div class="variant-info">
                    <h4>${monster.corrompido.name}</h4>
                    <p>${monster.corrompido.info || ''}</p>
                </div>
            </div>
        ` : '<p class="muted">Sem versão corrompida.</p>';

        // Zumbi (se existir e name não vazio)
        const zumbiHtml = (monster.zombie?.name && monster.zombie.name.trim() !== '') ? `
            <div class="variant-card single">
                <div class="variant-image"><img src="${monster.zombie.image}" alt="${monster.zombie.name}"></div>
                <div class="variant-info">
                    <h4>${monster.zombie.name}</h4>
                    <p>${monster.zombie.info || ''}</p>
                </div>
            </div>
        ` : '<p class="muted">Sem versão zumbi.</p>';

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
                            <div class="stats-grid">
                                <div class="stat-item"><span class="stat-label">HP:</span><span>${monster.estatisticas.pontosVida}</span></div>
                                <div class="stat-item"><span class="stat-label">Dano:</span><span>${monster.estatisticas.dano}</span></div>
                                <div class="stat-item"><span class="stat-label">Defesa:</span><span>${monster.estatisticas.defesa}</span></div>
                                <div class="stat-item"><span class="stat-label">Velocidade:</span><span>${monster.estatisticas.velocidade}</span></div>
                                <div class="stat-item"><span class="stat-label">Inteligência:</span><span>${monster.estatisticas.inteligencia}</span></div>
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
                            <div class="rewards-list">${rewardsHtml}</div>
                        </div>

                        <div class="tab-content variantes">
                            ${variantesHtml}
                        </div>

                        <div class="tab-content corrompido">
                            ${corrompidoHtml}
                        </div>

                        <div class="tab-content zumbi">
                            ${zumbiHtml}
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
            monsterGrid.innerHTML = monsters.map(createMonsterCard).join('');
        } catch (error) {
            console.error('Erro ao carregar monstros:', error);
            monsterGrid.innerHTML = '<p class="error">Erro ao carregar monstros: ' + error.message + '</p>';
        }
    }

    loadMonsters();
});
// Página de classes: cards + modal com atributos (valores do Unreal), habilidades e subclasses.
// Dados: data/classesData.json + data/gameRules.json.
(() => {
    const G = window.GameData;
    const { esc, t, txt } = G;

    const grid = document.getElementById('classesGrid');
    if (!grid) return;
    const searchInput = document.getElementById('searchClasses');

    let rules = null;
    let classes = [];
    let openClassId = null;

    const DEFAULT_COLOR = '#8B5CF6';
    const colorOf = (classe) => (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(classe.color || '').trim()) ? classe.color.trim() : DEFAULT_COLOR);

    const weaponsHtml = (classe) => (classe.weapons || [])
        .map((id) => G.labelOf(rules, 'weapons', id))
        .filter(Boolean)
        .map((label) => `<span class="weapon-tag">${esc(label)}</span>`)
        .join('');

    function createCard(classe) {
        return `
            <article class="class-card" data-class-id="${esc(classe.id)}" style="--class-color:${esc(colorOf(classe))}">
                <div class="class-card-image">${G.renderImage(classe.image, txt(classe.name))}</div>
                <div class="class-card-body">
                    <h3 class="class-name">${esc(txt(classe.name))}</h3>
                    <p class="class-desc">${esc(txt(classe.description))}</p>
                    <div class="class-weapons" aria-label="${esc(t('weapons'))}">${weaponsHtml(classe)}</div>
                    <button type="button" class="btn btn-primary">${esc(t('viewDetails', 'View Details'))}</button>
                </div>
            </article>
        `;
    }

    function maxStats() {
        const maxima = {};
        classes.forEach((classe) => Object.entries(classe.stats || {}).forEach(([key, value]) => {
            if (typeof value === 'number') maxima[key] = Math.max(maxima[key] || 0, value);
        }));
        return maxima;
    }

    function statsHtml(classe) {
        const maxima = maxStats();
        return rules.attributes.map((attribute) => {
            const value = classe.stats?.[attribute.id];
            const shown = G.formatStat(attribute.id, value, window.SiteI18n?.lang);
            const percent = shown && maxima[attribute.id] ? Math.round((Number(value) / maxima[attribute.id]) * 100) : 0;
            return `
                <div class="stat-bar">
                    <div class="stat-bar-head">
                        <span class="stat-name">${esc(txt(attribute.name))}</span>
                        <span class="stat-number">${esc(shown ?? t('toBeDefined'))}</span>
                    </div>
                    <div class="stat-progress"><div class="stat-fill" style="width:${percent}%"></div></div>
                </div>`;
        }).join('');
    }

    function createModal(classe) {
        const skills = (classe.skills || []).map((skill) => `
            <div class="skill-item">
                <h4>${esc(txt(skill.name))}</h4>
                ${txt(skill.description) ? `<p>${esc(txt(skill.description))}</p>` : ''}
                ${skill.cooldown != null ? `<span class="skill-cooldown">${esc(t('cooldown'))}: ${esc(skill.cooldown)} s</span>` : ''}
            </div>`).join('') || `<p class="muted">${esc(t('noSkills'))}</p>`;

        const subclasses = (classe.subclasses || []).map((sub) => `
            <div class="subclass-item">
                <div class="subclass-image-wrapper">${G.renderImage(sub.image, txt(sub.name))}</div>
                <div class="subclass-info">
                    <h4>${esc(txt(sub.name))}</h4>
                    <p>${esc(txt(sub.description))}</p>
                    <div class="subclass-unlock">${esc(txt(sub.unlock) ? `${t('howToUnlock')}: ${txt(sub.unlock)}` : t('subclassUnlockPending'))}</div>
                </div>
            </div>`).join('') || `<p class="muted">${esc(t('noSubclasses'))}</p>`;

        const tabs = [
            ['info', t('information', 'Information')],
            ['stats', t('attributes', 'Attributes')],
            ['skills', t('skills', 'Skills')],
            ['subclasses', t('subclasses', 'Subclasses')]
        ];
        const panels = {
            info: `
                <h3>${esc(t('classDescription'))}</h3>
                <p class="tab-text">${esc(txt(classe.description))}</p>
                <h3>${esc(t('weapons'))}</h3>
                <div class="class-weapons">${weaponsHtml(classe)}</div>`,
            stats: `
                <h3>${esc(t('attributes'))}</h3>
                <p class="stats-note">${esc(t('statsUnreal'))}</p>
                <div class="stats-container">${statsHtml(classe)}</div>`,
            skills: `<h3>${esc(t('skills'))}</h3><div class="skills-list">${skills}</div>`,
            subclasses: `<h3>${esc(t('availableSubclasses'))}</h3><div class="subclasses-list">${subclasses}</div>`
        };

        return `
            <div class="class-modal" style="--class-color:${esc(colorOf(classe))}">
                <div class="modal-content" role="dialog" aria-modal="true" aria-label="${esc(txt(classe.name))}">
                    <button type="button" class="modal-close" aria-label="${esc(t('close', 'Close'))}">×</button>
                    <div class="modal-header-compact">
                        ${G.renderImage(classe.image, txt(classe.name), 'modal-header-img')}
                        <div class="modal-header-text">
                            <h2>${esc(txt(classe.name))}</h2>
                            <p>${esc(txt(classe.description))}</p>
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

    function closeModal() {
        openClassId = null;
        const modal = document.querySelector('.class-modal');
        if (!modal) return;
        modal.remove();
        document.body.style.overflow = '';
    }

    function openClass(id) {
        const classe = classes.find((entry) => entry.id === id);
        if (!classe) return;
        document.querySelector('.class-modal')?.remove();
        document.body.insertAdjacentHTML('beforeend', createModal(classe));
        document.body.style.overflow = 'hidden';
        openClassId = id;
        const modal = document.querySelector('.class-modal');
        G.setupTabs(modal);
        G.setupModalClose(modal, closeModal);
        modal.querySelector('.modal-close')?.focus();
    }

    function render() {
        const term = searchInput?.value || '';
        const list = classes.filter((classe) => G.matchesSearch(term, [classe.name, classe.description, ...(classe.subclasses || []).map((sub) => sub.name)]));
        grid.innerHTML = list.length ? list.map(createCard).join('') : `<p class="grid-message">${esc(t('noResults'))}</p>`;
    }

    grid.addEventListener('click', (event) => {
        const card = event.target.closest('.class-card');
        if (card) openClass(card.dataset.classId);
    });

    searchInput?.addEventListener('input', render);
    document.getElementById('searchClassesButton')?.addEventListener('click', render);

    document.addEventListener('site-language-changed', () => {
        if (!rules) return;
        const reopen = openClassId;
        render();
        if (reopen) openClass(reopen);
    });

    async function load() {
        try {
            const [loadedRules, data] = await Promise.all([G.loadRules(), G.loadJson('data/classesData.json')]);
            rules = loadedRules;
            classes = data.classes || [];
            render();
        } catch (error) {
            console.error('Erro ao carregar as classes:', error);
            grid.innerHTML = `<p class="grid-message">${esc(t('loadError'))}</p>`;
        }
    }

    load();
})();

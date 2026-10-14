// Funções compartilhadas pelas páginas que mostram dados do jogo
// (bestiário, classes, guia). Lê data/gameRules.json e formata elementos,
// raridades, atributos etc. nos dois idiomas.
(function (global) {
    const PLACEHOLDER_IMAGE = 'img/placeholder.svg';

    // Escapa texto antes de colocar em HTML: o conteúdo vem do painel e
    // nunca deve ser interpretado como código.
    function esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    const i18n = () => global.SiteI18n || {
        lang: 'pt',
        t: (key, fallback = key) => fallback,
        text: (field) => (field && typeof field === 'object' ? (field.pt || field.en || '') : String(field ?? ''))
    };
    const t = (key, fallback, vars) => i18n().t(key, fallback, vars);
    const txt = (field) => i18n().text(field);

    async function loadJson(path) {
        const response = await fetch(path, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`${path}: ${response.status}`);
        return response.json();
    }

    let rulesPromise = null;
    function loadRules() {
        if (!rulesPromise) rulesPromise = loadJson('data/gameRules.json');
        return rulesPromise;
    }

    const findById = (list, id) => (list || []).find((entry) => entry.id === id) || null;

    // Quem este elemento vence e quem vence este elemento (a tabela guarda só "vence").
    function getMatchups(rules, elementId) {
        const element = findById(rules.elements, elementId);
        if (!element) return { strong: [], weak: [] };
        return {
            strong: element.beats.slice(),
            weak: rules.elements.filter((other) => other.beats.includes(elementId)).map((other) => other.id)
        };
    }

    // Valor de atributo pronto para exibir; null vira "A definir".
    function formatStat(attributeId, value, lang = 'pt') {
        if (value === null || value === undefined || value === '') return null;
        const number = Number(value);
        if (Number.isNaN(number)) return String(value);
        const formatted = number.toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US', { maximumFractionDigits: 2 });
        return attributeId === 'criticalChance' ? `${formatted}%` : formatted;
    }

    // Variante sem valor próprio usa o do monstro base (como os Data Assets filhos no Unreal).
    const INHERITED_FIELDS = ['stars', 'levelMin', 'levelMax', 'hostility', 'difficulty', 'xp', 'stats'];
    const INHERITED_TEXT = ['behavior', 'region'];
    const INHERITED_LISTS = ['types', 'skills', 'drops', 'states'];
    const isEmptyText = (field) => !field || (typeof field === 'object' ? !(field.pt || field.en) : !String(field).trim());

    function resolveMonster(monster, monstersById) {
        if (!monster || !monster.variantOf) return { ...monster, inherited: {} };
        const base = monstersById[monster.variantOf];
        if (!base) return { ...monster, inherited: {} };
        const resolved = { ...monster, inherited: {} };
        INHERITED_FIELDS.forEach((key) => {
            if (resolved[key] === null || resolved[key] === undefined) {
                resolved[key] = base[key];
                resolved.inherited[key] = true;
            }
        });
        INHERITED_TEXT.forEach((key) => {
            if (isEmptyText(resolved[key])) {
                resolved[key] = base[key];
                resolved.inherited[key] = true;
            }
        });
        INHERITED_LISTS.forEach((key) => {
            if (!Array.isArray(resolved[key]) || resolved[key].length === 0) {
                resolved[key] = base[key] || [];
                resolved.inherited[key] = (base[key] || []).length > 0;
            }
        });
        if (!resolved.rarity) resolved.rarity = base.rarity;
        return resolved;
    }

    function renderImage(src, alt, className = '') {
        return `<img src="${esc(src || PLACEHOLDER_IMAGE)}" alt="${esc(alt)}" class="${esc(className)}" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMAGE}';this.classList.add('is-placeholder');">`;
    }

    function elementBadge(rules, elementId, extraClass = '') {
        const element = findById(rules.elements, elementId);
        if (element) {
            return `<span class="element-badge ${esc(extraClass)}" style="--element-color:${esc(element.color)}">${element.icon} ${esc(txt(element.name))}</span>`;
        }
        const special = findById(rules.specialElements, elementId);
        if (special) {
            return `<span class="element-badge element-badge--special ${esc(extraClass)}">${esc(txt(special.name))}</span>`;
        }
        return `<span class="element-badge element-badge--pending ${esc(extraClass)}">${esc(t('element', 'Element'))}: ${esc(t('toBeDefined', 'To be defined'))}</span>`;
    }

    function rarityBadge(rules, rarityId, extraClass = '') {
        const rarity = findById(rules.rarities, rarityId);
        if (!rarity) return '';
        return `<span class="rarity-badge ${esc(extraClass)}" style="--rarity-color:${esc(rarity.color)}">${esc(txt(rarity.name))}</span>`;
    }

    function labelOf(rules, listName, id) {
        const entry = findById(rules[listName], id);
        return entry ? txt(entry.name) : '';
    }

    // Fecha um modal ao clicar no fundo, no botão de fechar ou ao apertar Esc.
    function setupModalClose(modal, onClose) {
        if (!modal || typeof onClose !== 'function') return;
        modal.addEventListener('click', (event) => {
            const target = event.target;
            const clickedClose = target && typeof target.closest === 'function' ? target.closest('.modal-close') : null;
            if (target === modal || clickedClose) onClose();
        });
        const onKey = (event) => {
            if (!modal.isConnected) {
                document.removeEventListener('keydown', onKey);
                return;
            }
            if (event.key === 'Escape') {
                document.removeEventListener('keydown', onKey);
                onClose();
            }
        };
        if (typeof document !== 'undefined') document.addEventListener('keydown', onKey);
    }

    function setupTabs(container) {
        const tabs = Array.from(container.querySelectorAll('.tab-btn'));
        const contents = Array.from(container.querySelectorAll('.tab-content'));
        tabs.forEach((tab) => {
            tab.addEventListener('click', () => {
                tabs.forEach((other) => {
                    other.classList.toggle('active', other === tab);
                    other.setAttribute('aria-selected', String(other === tab));
                });
                contents.forEach((content) => content.classList.toggle('active', content.dataset.tab === tab.dataset.tab));
            });
        });
    }

    const normalizeSearch = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    // Procura nos dois idiomas, para quem digita em português com o site em inglês e vice-versa.
    function matchesSearch(term, fields) {
        const needle = normalizeSearch(term);
        if (!needle) return true;
        return fields.some((field) => {
            if (!field) return false;
            const values = typeof field === 'object' ? [field.pt, field.en] : [field];
            return values.some((value) => normalizeSearch(value).includes(needle));
        });
    }

    const api = {
        PLACEHOLDER_IMAGE,
        esc,
        t,
        txt,
        loadJson,
        loadRules,
        findById,
        getMatchups,
        formatStat,
        resolveMonster,
        renderImage,
        elementBadge,
        rarityBadge,
        labelOf,
        setupModalClose,
        setupTabs,
        matchesSearch
    };

    global.GameData = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

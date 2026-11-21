// Brasões do site: reinos (página inicial) e classes (foto do perfil).
// Cada brasão = cor + símbolo desenhado num quadro de 64×64 dentro do escudo.
// Para mudar um símbolo ou cor, mude só aqui.
(function () {
    const KINGDOMS = {
        thalor: { color: '#a9b8c9', icon: '<path d="M32 6 L39 20 L34.5 20 L34.5 56 L29.5 56 L29.5 20 L25 20 Z" fill="currentColor"/><path d="M22 26 H42" />' },
        aurelis: { color: '#d9b452', icon: '<path d="M32 10 V40"/><path d="M33 13 L48 36 H33 Z" fill="currentColor" stroke="none"/><path d="M12 42 H52 L45 52 H19 Z" fill="currentColor" stroke="none"/>' },
        sylvanor: { color: '#7fae62', icon: '<circle cx="32" cy="24" r="14"/><path d="M32 56 V30 M32 40 L22 30 M32 35 L42 25"/>' },
        dracoria: { color: '#e0612b', icon: '<path d="M32 6 C41 19 49 26 45 40 C43 50 37 55 32 57 C27 55 21 50 19 40 C17 30 25 25 27 17 C29 23 33 25 34 30 C38 24 35 15 32 6 Z" fill="currentColor" stroke="none"/>' },
        ventharis: { color: '#79b9c6', icon: '<path d="M12 52 L52 12 M52 12 L41 14 M52 12 L50 23 M16 48 L10 42 M16 48 L22 54"/><path d="M18 22 Q28 16 36 22 M12 32 Q22 26 30 32"/>' },
        malakar: { color: '#c0392b', icon: '<path d="M20 28 C11 20 13 10 19 6 C19 14 22 20 27 23 M44 28 C53 20 51 10 45 6 C45 14 42 20 37 23"/><path d="M21 28 Q32 16 43 28 V42 L38 47 H26 L21 42 Z" fill="currentColor" stroke="none"/><path d="M26 33 L30 36 M38 33 L34 36" stroke="#0c0b0a" stroke-width="3"/>' }
    };

    // Cores das classes = as mesmas de data/classesData.json
    const CLASSES = {
        // Guerreiro: escudo com espada
        warrior: { color: '#e0574f', icon: '<path d="M16 14 H40 V32 C40 44 33 50 28 53 C23 50 16 44 16 32 Z" fill="currentColor" stroke="none" opacity="0.35"/><path d="M16 14 H40 V32 C40 44 33 50 28 53 C23 50 16 44 16 32 Z"/><path d="M46 8 V44 M40 38 H52 M46 44 V52"/>' },
        // Bárbaro: machado de batalha
        barbarian: { color: '#c0773a', icon: '<path d="M22 56 L40 10"/><path d="M35 22 C25 16 22 8 26 4 C33 8 40 10 46 9 C50 16 48 24 41 30 Z" fill="currentColor" stroke="none"/><path d="M19 54 L25 57"/>' },
        // Espadachim: duas lâminas cruzadas
        swordsman: { color: '#d94c86', icon: '<path d="M14 52 L48 10 L50 18 M48 10 L40 12"/><path d="M50 52 L16 10 L14 18 M16 10 L24 12"/><path d="M11 45 L20 54 M53 45 L44 54"/>' },
        // Lanceiro: lança com flâmula
        lancer: { color: '#f08a2e', icon: '<path d="M32 58 V20"/><path d="M32 4 L39 20 H25 Z" fill="currentColor" stroke="none"/><path d="M34 26 H50 L45 31 L50 36 H34" fill="currentColor" stroke="none" opacity="0.75"/>' },
        // Arqueiro: arco e flecha
        archer: { color: '#5aa860', icon: '<path d="M22 6 C44 16 44 48 22 58"/><path d="M22 6 V58" stroke-width="1.5"/><path d="M10 32 H52 M52 32 L45 26 M52 32 L45 38 M10 32 L6 28 M10 32 L6 36"/>' },
        // Feiticeiro: cajado com orbe
        sorcerer: { color: '#a45ee0', icon: '<path d="M32 58 V26"/><path d="M26 26 H38"/><circle cx="32" cy="15" r="8" fill="currentColor" stroke="none"/><path d="M19 6 L23 10 M45 6 L41 10 M16 18 H21 M43 18 H48"/>' }
    };

    const DEFAULT = { color: '#d9a441', icon: '<path d="M32 10 L38 26 L54 26 L41 36 L46 52 L32 42 L18 52 L23 36 L10 26 L26 26 Z" fill="currentColor" stroke="none"/>' };

    // "reino:thalor" / "classe:archer" → definição (ou null se não existir)
    function find(avatar) {
        const [kind, id] = String(avatar || '').split(':');
        if (kind === 'reino') return KINGDOMS[id] || null;
        if (kind === 'classe') return CLASSES[id] || null;
        return null;
    }

    function svg({ color, icon }, className = 'crest') {
        return `
            <svg class="${className}" viewBox="0 0 80 96" style="--crest:${color}" aria-hidden="true" focusable="false">
                <path class="crest-shield" d="M8 6 H72 V44 C72 70 54 84 40 92 C26 84 8 70 8 44 Z"/>
                <path class="crest-inner" d="M14 12 H66 V44 C66 66 51 78 40 85 C29 78 14 66 14 44 Z"/>
                <g transform="translate(8 12)" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="color:${color}">${icon}</g>
            </svg>`;
    }

    window.SiteCrests = {
        KINGDOMS,
        CLASSES,
        DEFAULT,
        find,
        // Brasão de um reino pelo id (usado na página inicial)
        kingdom: (id) => svg(KINGDOMS[id] || DEFAULT),
        // Brasão da foto do perfil ("reino:x" / "classe:y")
        avatar: (value, className) => svg(find(value) || DEFAULT, className),
        color: (value) => (find(value) || DEFAULT).color
    };
})();

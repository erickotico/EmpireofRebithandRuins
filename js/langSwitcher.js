(function () {
    const translations = {
        en: {
            home: 'Home',
            bestiary: 'Bestiary',
            classes: 'Classes',
            about: 'About',
            login: 'Login',
            download: 'Download',
            heroTitle: 'Embark on a magical world',
            heroSubtitle: 'Explore dungeons, defeat monsters and become a legend in Empire of Rebirth & Ruins',
            heroCta: 'Start your journey now!',
            latestUpdates: 'Latest Updates',
            game: 'Game',
            beginnerGuide: "Beginner's Guide",
            features: 'Features',
            requirements: 'Requirements',
            community: 'Community',
            forum: 'Forum',
            support: 'Support',
            contact: 'Contact',
            faq: 'FAQ',
            reportBug: 'Report a bug',
            privacy: 'Privacy policy',
            allUpdates: 'All Updates',
            searchUpdates: 'Search updates...',
            searchMonster: 'Search monster...',
            search: 'Search',
            allTypes: 'All types',
            aboutStudio: 'About the Studio',
            whoWeAre: 'Who We Are',
            ourMission: 'Our Mission',
            ourVision: 'Our Vision',
            ourTeam: 'Our Team',
            connectWithUs: 'Connect With Us',
            ourValues: 'Our Values',
            quality: 'Quality',
            communityText: 'Community',
            innovation: 'Innovation',
            creativity: 'Creativity',
            mapTitle: 'Game Map',
            kingdoms: 'Kingdoms',
            dungeons: 'Dungeon Types',
            items: 'Items',
            searchKingdoms: 'Search kingdoms...',
            searchDungeons: 'Search dungeons...',
            searchItems: 'Search items...',
            welcomeBack: 'Welcome back',
            loginDesc: 'Sign in to continue your journey in Empire of Rebirth & Ruins.',
            emailOrUser: 'Email or username',
            password: 'Password',
            rememberMe: 'Remember me',
            forgotPassword: 'Forgot password?',
            signIn: 'Sign in',
            back: 'Back',
            or: 'or',
            continueGoogle: 'Continue with Google',
            noAccount: "Don't have an account?",
            createAccount: 'Create account',
            fullName: 'Full name',
            phone: 'Phone number',
            day: 'Day',
            month: 'Month',
            year: 'Year',
            createAccountButton: 'Create account',
            cancel: 'Cancel',
            close: 'Close',
            privacyTerms: 'privacy terms',
            allRights: 'All rights reserved.'
        },
        pt: {
            home: 'Início',
            bestiary: 'Bestiário',
            classes: 'Classes',
            about: 'Sobre',
            login: 'Login',
            download: 'Download',
            heroTitle: 'Aventure-se em um mundo mágico',
            heroSubtitle: 'Explore dungeons, derrote monstros e torne-se uma lenda em Empire of Rebirth & Ruins',
            heroCta: 'Comece sua jornada agora!',
            latestUpdates: 'Últimas Atualizações',
            game: 'Jogo',
            beginnerGuide: 'Guia para Iniciantes',
            features: 'Características',
            requirements: 'Requisitos',
            community: 'Comunidade',
            forum: 'Fórum',
            support: 'Suporte',
            contact: 'Contato',
            faq: 'FAQ',
            reportBug: 'Relatar bug',
            privacy: 'Política de privacidade',
            allUpdates: 'Todas as Atualizações',
            searchUpdates: 'Buscar atualizações...',
            searchMonster: 'Procurar monstro...',
            search: 'Pesquisar',
            allTypes: 'Todos os tipos',
            aboutStudio: 'Sobre o Estúdio',
            whoWeAre: 'Quem Somos',
            ourMission: 'Nossa Missão',
            ourVision: 'Nossa Visão',
            ourTeam: 'Nossa Equipe',
            connectWithUs: 'Conecte-se Conosco',
            ourValues: 'Nossos Valores',
            quality: 'Qualidade',
            communityText: 'Comunidade',
            innovation: 'Inovação',
            creativity: 'Criatividade',
            mapTitle: 'Mapa do Jogo',
            kingdoms: 'Reinos',
            dungeons: 'Tipos de Masmorras',
            items: 'Itens',
            searchKingdoms: 'Buscar reinos...',
            searchDungeons: 'Buscar masmorras...',
            searchItems: 'Buscar itens...',
            welcomeBack: 'Bem-vindo de volta',
            loginDesc: 'Entre para continuar sua jornada em Empire of Rebirth & Ruins.',
            emailOrUser: 'E‑mail ou usuário',
            password: 'Senha',
            rememberMe: 'Lembrar-me',
            forgotPassword: 'Esqueceu a senha?',
            signIn: 'Entrar',
            back: 'Voltar',
            or: 'ou',
            continueGoogle: 'Continuar com Google',
            noAccount: 'Não tem uma conta?',
            createAccount: 'Criar conta',
            fullName: 'Nome completo',
            phone: 'Número de telefone',
            day: 'Dia',
            month: 'Mês',
            year: 'Ano',
            createAccountButton: 'Criar conta',
            cancel: 'Cancelar',
            close: 'Fechar',
            privacyTerms: 'termos de privacidade',
            allRights: 'Todos os direitos reservados.'
        }
    };

    const state = { current: 'en' };

    function updateNodeText(el, key) {
        const lang = translations[state.current];
        if (!lang || !lang[key]) return;
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.placeholder = lang[key];
        } else {
            el.textContent = lang[key];
        }
    }

    function applyTranslations() {
        document.documentElement.lang = state.current;
        document.querySelectorAll('[data-i18n]').forEach((el) => updateNodeText(el, el.dataset.i18n));
        document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
            const key = el.dataset.i18nAria;
            const value = translations[state.current][key];
            if (value) el.setAttribute('aria-label', value);
        });
    }

    function toggleLanguage() {
        state.current = state.current === 'en' ? 'pt' : 'en';
        applyTranslations();
    }

    document.addEventListener('DOMContentLoaded', () => {
        const button = document.querySelector('.lang-switcher');
        if (button) {
            button.addEventListener('click', toggleLanguage);
        }
        applyTranslations();
    });

    window.toggleLanguage = toggleLanguage;
})();

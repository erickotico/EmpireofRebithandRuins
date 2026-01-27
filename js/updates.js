class UpdatesManager {
    constructor() {
        this.updatesContainer = document.querySelector('.updates-grid');
    }
/*    dados do Json local
{
      "version": "v1.2.0", -- versão da atualização
      "date": "2023-11-04", -- data da atualização
      "title": "Novo Conteúdo Disponível!", -- título da atualização
      "changes": [  -- lista de mudanças
        "Nova dungeon: Caverna dos Ancestrais", -- titulo da mudança
        "Adicionado novo chefe: Guardião Ancestral", --descrição da mudança
        "Sistema de crafting melhorado" -- descrição da mudança
      ],
      "link": "#" -- link para mais detalhes
    },*/
    
    // Renderiza um card de atualização
    createUpdateCard(update) {
        return `
            <article class="update-card">
                <div class="update-header">
                    <span class="update-version">${update.version}</span>
                    <time class="update-date">${this.formatDate(update.date)}</time>
                </div>
                <h3>${update.title}</h3>
                <ul class="update-list">
                    ${update.changes.map(change => `<li>${change}</li>`).join('')}
                </ul>
                <a href="${update.link}" class="update-link">Ver detalhes completos</a>
            </article>
        `;
    }

    // Formata a data para DD/MM/YYYY
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR');
    }

    // Carrega as atualizações do arquivo JSON local
    async loadLocalUpdates() {
        try {
            const response = await fetch('./data/updates.json');
            const data = await response.json();
            this.displayUpdates(data.updates);
        } catch (error) {
            console.error('Erro ao carregar atualizações:', error);
            this.displayFallbackUpdate();
        }
    }

   // para utilizar uma API externa
    async loadFromAPI() {
        try {
            const response = await fetch('https://api.seudominio.com/updates');
            const data = await response.json();
            this.displayUpdates(data.updates);
        } catch (error) {
            console.error('Erro ao carregar atualizações da API:', error);
            this.displayFallbackUpdate();
        }
    }

    // Mostra as atualizações na página
    displayUpdates(updates) {
        const html = updates.map(update => this.createUpdateCard(update)).join('');
        this.updatesContainer.innerHTML = html;
    }

    // Mostra um card padrão em caso de erro
    displayFallbackUpdate() {
        const fallbackUpdate = {
            version: "v1.0.0",
            date: new Date().toISOString(),
            title: "Última Atualização",
            changes: [
                "Carregando atualizações...",
                "Por favor, tente novamente mais tarde"
            ],
            link: "#"
        };
        this.updatesContainer.innerHTML = this.createUpdateCard(fallbackUpdate);
    }
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    const updatesManager = new UpdatesManager();
    updatesManager.loadLocalUpdates(); // este para dados locais
    // updatesManager.loadFromAPI(); // este quando tiver uma API
});
// JavaScript para o Guia para Iniciantes

let reinos = [];
let masmorras = [];
let itens = [];



// Função para abrir o popup da imagem ampliada
function abrirPopup() {
    const popup = document.getElementById('popup');
    popup.style.display = 'block';
    
    // Adiciona event listener para fechar com qualquer clique
    popup.addEventListener('click', fecharPopup);
}

// Função para fechar o popup
function fecharPopup() {
    const popup = document.getElementById('popup');
    popup.style.display = 'none';
}

function renderReinos(listaReinos) {
    const lista = document.getElementById('lista-reinos');
    lista.innerHTML = '';

    if (!listaReinos.length) {
        lista.innerHTML = '<p class="nenhum-resultado">Nenhum reino encontrado.</p>';
        return;
    }

    listaReinos.forEach(reino => {
        const div = document.createElement('div');
        div.className = 'reino card';
        div.tabIndex = 0;
        div.setAttribute('role', 'button');
        div.innerHTML = `
            <img src="${reino.imagem}" alt="Imagem do ${reino.nome}" class="reino-imagem">
            <h3>${reino.nome}</h3>
            <p>${reino.descricao}</p>
        `;

        div.addEventListener('click', () => abrirModalReino(reino));
        div.addEventListener('keypress', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                abrirModalReino(reino);
            }
        });

        lista.appendChild(div);
    });
}

function abrirModalReino(reino) {
    const modal = document.createElement('div');
    modal.className = 'reino-modal';
    modal.innerHTML = `
        <div class="reino-modal-content" role="dialog" aria-modal="true" aria-label="Informações do reino ${reino.nome}">
            <button class="reino-modal-close" aria-label="Fechar">×</button>
            <div class="reino-modal-header">
                <img src="${reino.imagem}" alt="Imagem do reino ${reino.nome}">
                <div class="reino-modal-heading">
                    <h2>${reino.nome}</h2>
                    <p>${reino.descricao}</p>
                </div>
            </div>
            <div class="reino-modal-body">
                <div class="reino-info">
                    <h3>Localização</h3>
                    <p>${reino.localizacao}</p>
                </div>
                <div class="reino-info">
                    <h3>História</h3>
                    <p>${reino.historia}</p>
                </div>
                <div class="reino-info">
                    <h3>Cultura</h3>
                    <p>${reino.cultura}</p>
                </div>
                <div class="reino-info">
                    <h3>Costumes</h3>
                    <p>${reino.costumes}</p>
                </div>
                <div class="reino-info">
                    <h3>Festivais</h3>
                    <p>${reino.festivais}</p>
                </div>
            </div>
        </div>
    `;

    modal.addEventListener('click', (event) => {
        if (event.target === modal || event.target.closest('.reino-modal-close')) {
            modal.remove();
            document.body.style.overflow = '';
        }
    });

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
}

function renderMasmorras(listaMasmorras) {
    const lista = document.getElementById('lista-masmorras');
    lista.innerHTML = '';

    if (!listaMasmorras.length) {
        lista.innerHTML = '<p class="nenhum-resultado">Nenhuma masmorra encontrada.</p>';
        return;
    }

    listaMasmorras.forEach(masmorra => {
        const div = document.createElement('div');
        div.className = 'masmorra card';
        div.tabIndex = 0;
        div.setAttribute('role', 'button');
        div.innerHTML = `
            <h3>${masmorra.nome}</h3>
            <p>${masmorra.descricao}</p>
        `;

        div.addEventListener('click', () => abrirModalMasmorra(masmorra));
        div.addEventListener('keypress', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                abrirModalMasmorra(masmorra);
            }
        });

        lista.appendChild(div);
    });
}

function abrirModalMasmorra(masmorra) {
    const modal = document.createElement('div');
    modal.className = 'masmorra-modal';
    modal.innerHTML = `
        <div class="masmorra-modal-content" role="dialog" aria-modal="true" aria-label="Informações da masmorra ${masmorra.nome}">
            <button class="masmorra-modal-close" aria-label="Fechar">×</button>
            <div class="masmorra-modal-header">
                <img src="${masmorra.imagem}" alt="Foto da masmorra ${masmorra.nome}">
                <div class="masmorra-modal-heading">
                    <h2>${masmorra.nome}</h2>
                    <p>${masmorra.descricao}</p>
                </div>
            </div>
            <div class="masmorra-modal-body">
                <p><strong>Andares:</strong> ${masmorra.andares}</p>
                <p><strong>Tipos de inimigos:</strong> ${masmorra.tipos_inimigos.join(', ')}</p>
                <p><strong>Salas escondidas:</strong> ${masmorra.tem_salas_escondidas ? masmorra.salas_escondidas : 'Não'}</p>
                <p><strong>Tem boss:</strong> ${masmorra.tem_boss ? 'Sim' : 'Não'}</p>
                ${masmorra.tem_boss ? `<p><strong>Boss:</strong> ${masmorra.boss}</p>` : ''}
            </div>
        </div>
    `;

    modal.addEventListener('click', (event) => {
        if (event.target === modal || event.target.closest('.masmorra-modal-close')) {
            modal.remove();
            document.body.style.overflow = '';
        }
    });

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
}

function renderItens(listaItens) {
    const lista = document.getElementById('lista-itens');
    lista.innerHTML = '';

    if (!listaItens.length) {
        lista.innerHTML = '<p class="nenhum-resultado">Nenhum item encontrado.</p>';
        return;
    }

    listaItens.forEach(item => {
        const div = document.createElement('div');
        div.className = 'item card';
        div.tabIndex = 0;
        div.setAttribute('role', 'button');
        div.innerHTML = `
            <div class="item-card-image">
                <img src="${item.imagem}" alt="${item.nome}">
                <div class="item-name-overlay"><span>${item.nome}</span></div>
            </div>
        `;

        div.addEventListener('click', () => abrirModalItem(item));
        div.addEventListener('keypress', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                abrirModalItem(item);
            }
        });

        lista.appendChild(div);
    });
}

function abrirModalItem(item) {
    const modal = document.createElement('div');
    modal.className = 'item-modal';
    
    // Pega a primeira raridade como padrão
    const primeiraRaridade = item.raridade[0];
    const versaoAtual = item.versoes[primeiraRaridade];
    
    modal.innerHTML = `
        <div class="item-modal-content" role="dialog" aria-modal="true" aria-label="Informações do item ${item.nome}">
            <button class="item-modal-close" aria-label="Fechar">×</button>
            <div class="item-modal-header">
                <img src="${item.imagem}" alt="Imagem do item ${item.nome}">
                <h2>${item.nome}</h2>
                <select class="item-raridade-dropdown" id="raridade-select">
                    ${item.raridade.map(r => `<option value="${r}">${r}</option>`).join('')}
                </select>
            </div>
            <div class="item-modal-body">
                <div class="item-info">
                    <h3>Descrição</h3>
                    <p id="item-descricao">${versaoAtual.descricao}</p>
                </div>
                <div class="item-info">
                    <h3>Utilidade</h3>
                    <p id="item-utilidade">${versaoAtual.para_que_serve}</p>
                </div>
                ${item.utilizavel ? '<div class="item-info"><h3>Utilizável</h3><p>Sim</p></div>' : ''}
                ${item.craftavel ? `<div class="item-info"><h3>Craftável</h3><p id="item-craft">Pode ser usado para craftar: ${versaoAtual.craft_resultado}</p></div>` : ''}
            </div>
        </div>
    `;

    // Adiciona event listener no dropdown para mudar os textos
    modal.addEventListener('change', (event) => {
        if (event.target.id === 'raridade-select') {
            const raridadeSelecionada = event.target.value;
            const novaVersao = item.versoes[raridadeSelecionada];
            
            // Atualiza os textos
            const descricaoDiv = modal.querySelector('#item-descricao');
            const utilidadeDiv = modal.querySelector('#item-utilidade');
            const craftDiv = modal.querySelector('#item-craft');
            
            descricaoDiv.textContent = novaVersao.descricao;
            utilidadeDiv.textContent = novaVersao.para_que_serve;
            
            if (craftDiv) {
                craftDiv.textContent = `Pode ser usado para craftar: ${novaVersao.craft_resultado}`;
            }
        }
    });

    modal.addEventListener('click', (event) => {
        if (event.target === modal || event.target.closest('.item-modal-close')) {
            modal.remove();
            document.body.style.overflow = '';
        }
    });

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
}

function filtrarReinos(query) {
    const termo = query.trim().toLowerCase();
    const filtrados = reinos.filter(reino => {
        return reino.nome.toLowerCase().includes(termo)
            || reino.descricao.toLowerCase().includes(termo)
            || reino.localizacao.toLowerCase().includes(termo)
            || reino.historia.toLowerCase().includes(termo)
            || reino.cultura.toLowerCase().includes(termo)
            || reino.costumes.toLowerCase().includes(termo)
            || reino.festivais.toLowerCase().includes(termo);
    });
    renderReinos(filtrados);
}

function filtrarMasmorras(query) {
    const termo = query.trim().toLowerCase();
    const filtrados = masmorras.filter(masmorra => {
        return masmorra.nome.toLowerCase().includes(termo)
            || masmorra.descricao.toLowerCase().includes(termo)
            || (masmorra.boss && masmorra.boss.toLowerCase().includes(termo))
            || masmorra.tipos_inimigos.some(tipo => tipo.toLowerCase().includes(termo));
    });
    renderMasmorras(filtrados);
}

function filtrarItens(query) {
    const termo = query.trim().toLowerCase();
    const filtrados = itens.filter(item => {
        // Procura no nome
        if (item.nome.toLowerCase().includes(termo)) return true;
        
        // Procura em todas as versões de raridade
        for (const raridade in item.versoes) {
            const versao = item.versoes[raridade];
            if (versao.descricao.toLowerCase().includes(termo)
                || versao.para_que_serve.toLowerCase().includes(termo)
                || (versao.craft_resultado && versao.craft_resultado.toLowerCase().includes(termo))) {
                return true;
            }
        }
        
        // Procura na raridade
        if (item.raridade.some(r => r.toLowerCase().includes(termo))) return true;
        
        return false;
    });
    renderItens(filtrados);
}

// Função para carregar dados de masmorras do JSON
async function carregarMasmorras() {
    try {
        const response = await fetch('data/masmorras.json');
        masmorras = await response.json();
        renderMasmorras(masmorras);
    } catch (error) {
        console.error('Erro ao carregar masmorras:', error);
    }
}

// Função para carregar dados de itens do JSON
async function carregarItens() {
    try {
        const response = await fetch('data/itens.json');
        itens = await response.json();
        renderItens(itens);
    } catch (error) {
        console.error('Erro ao carregar itens:', error);
    }
}

// Função para carregar dados de reinos do JSON
async function carregarReinos() {
    try {
        const response = await fetch('data/reinos.json');
        reinos = await response.json();
        renderReinos(reinos);
    } catch (error) {
        console.error('Erro ao carregar reinos:', error);
    }
}

// Carregar dados quando a página carrega
document.addEventListener('DOMContentLoaded', () => {
    carregarReinos();
    carregarMasmorras();
    carregarItens();
});
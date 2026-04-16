// JavaScript para o Guia para Iniciantes

let reinos = [];
let masmorras = [];
let itens = [];

// Função para abrir o popup da imagem ampliada
function abrirPopup() {
    document.getElementById('popup').style.display = 'block';
}

// Função para fechar o popup
function fecharPopup() {
    document.getElementById('popup').style.display = 'none';
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
        div.innerHTML = `
            <h3>${reino.nome}</h3>
            <p><strong>Descrição:</strong> ${reino.descricao}</p>
            <p><strong>Posição no Mapa:</strong> ${reino.posicao}</p>
        `;
        lista.appendChild(div);
    });
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
        div.className = 'item';
        div.innerHTML = `
            <div class="item-image">
                <img src="${item.imagem}" alt="${item.nome}">
            </div>
            <div class="item-body">
                <h3>${item.nome}</h3>
                <p><strong>Descrição:</strong> ${item.descricao}</p>
                <p><strong>Para que serve:</strong> ${item.para_que_serve}</p>
                <p><strong>Craftável:</strong> ${item.craftavel ? 'Sim' : 'Não'}</p>
                ${item.craftavel ? `<p><strong>Pode ser usado para craftar:</strong> ${item.craft_resultado}</p>` : ''}
            </div>
        `;
        lista.appendChild(div);
    });
}

function filtrarReinos(query) {
    const termo = query.trim().toLowerCase();
    const filtrados = reinos.filter(reino => {
        return reino.nome.toLowerCase().includes(termo)
            || reino.descricao.toLowerCase().includes(termo)
            || reino.posicao.toLowerCase().includes(termo);
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
        return item.nome.toLowerCase().includes(termo)
            || item.descricao.toLowerCase().includes(termo)
            || item.para_que_serve.toLowerCase().includes(termo)
            || (item.craft_resultado && item.craft_resultado.toLowerCase().includes(termo));
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
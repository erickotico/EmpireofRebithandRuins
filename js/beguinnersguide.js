// JavaScript para o Guia para Iniciantes

// Função para abrir o popup da imagem ampliada
function abrirPopup() {
    document.getElementById('popup').style.display = 'block';
}

// Função para fechar o popup
function fecharPopup() {
    document.getElementById('popup').style.display = 'none';
}

// Função para carregar dados de masmorras do JSON
async function carregarMasmorras() {
    try {
        const response = await fetch('data/masmorras.json');
        const masmorras = await response.json();
        const lista = document.getElementById('lista-masmorras');

        masmorras.forEach(masmorra => {
            const div = document.createElement('div');
            div.className = 'masmorra';
            div.innerHTML = `
                <h3>${masmorra.nome}</h3>
                <p><strong>Descrição:</strong> ${masmorra.descricao}</p>
                <p><strong>Andares:</strong> ${masmorra.andares}</p>
                <p><strong>Salas Escondidas:</strong> ${masmorra.salas_escondidas}</p>
                <p><strong>Tipos de Inimigos:</strong> ${masmorra.tipos_inimigos.join(', ')}</p>
                <p><strong>Tem Boss:</strong> ${masmorra.tem_boss ? 'Sim' : 'Não'}</p>
                ${masmorra.tem_boss ? `<p><strong>Boss:</strong> ${masmorra.boss}</p>` : ''}
            `;
            lista.appendChild(div);
        });
    } catch (error) {
        console.error('Erro ao carregar masmorras:', error);
    }
}

// Função para carregar dados de itens do JSON
async function carregarItens() {
    try {
        const response = await fetch('data/itens.json');
        const itens = await response.json();
        const lista = document.getElementById('lista-itens');

        itens.forEach(item => {
            const div = document.createElement('div');
            div.className = 'item';
            div.innerHTML = `
                <h3>${item.nome}</h3>
                <img src="${item.imagem}" alt="${item.nome}">
                <p><strong>Descrição:</strong> ${item.descricao}</p>
                <p><strong>Para que serve:</strong> ${item.para_que_serve}</p>
                <p><strong>Craftável:</strong> ${item.craftavel ? 'Sim' : 'Não'}</p>
                ${item.craftavel ? `<p><strong>Pode ser usado para craftar:</strong> ${item.craft_resultado}</p>` : ''}
            `;
            lista.appendChild(div);
        });
    } catch (error) {
        console.error('Erro ao carregar itens:', error);
    }
}

// Função para carregar dados de reinos do JSON
async function carregarReinos() {
    try {
        const response = await fetch('data/reinos.json');
        const reinos = await response.json();
        const lista = document.getElementById('lista-reinos');

        reinos.forEach(reino => {
            const div = document.createElement('div');
            div.className = 'reino';
            div.innerHTML = `
                <h3>${reino.nome}</h3>
                <p><strong>Descrição:</strong> ${reino.descricao}</p>
                <p><strong>Posição no Mapa:</strong> ${reino.posicao}</p>
            `;
            lista.appendChild(div);
        });
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
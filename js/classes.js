document.addEventListener('DOMContentLoaded', () => {
    const classesGrid = document.getElementById('classesGrid');
    let classes = [];


    // Cria os cards das classes
    function createClassCard(classe) {
        return `
            <article class="class-card" data-class-id="${classe.id}" style="position: relative; overflow: hidden; border-radius: 8px; background: #1a1a1a; border: 2px solid ${classe.cor}40; transition: all 0.3s;">
                <div class="class-card-image" style="position: relative; width: 100%; height: 250px; overflow: hidden;">
                    <img src="${classe.image}" alt="${classe.name}" style="width: 100%; height: 100%; object-fit: cover;">
                    <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(180deg, transparent 0%, ${classe.cor}80 100%);"></div>
                </div>
                <div class="class-card-body" style="padding: 20px; background: #0f0f0f; position: relative; z-index: 2;">
                    <h3 class="class-name" style="margin: 0 0 10px 0; color: ${classe.cor}; font-size: 22px; font-weight: 700;">${classe.name}</h3>
                    <p class="class-desc" style="margin: 0 0 15px 0; color: #aaa; font-size: 13px; line-height: 1.5;">${classe.descricao}</p>
                    <button class="btn btn-primary" style="width: 100%; padding: 12px; background: ${classe.cor}; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; transition: all 0.3s; font-size: 14px;" aria-label="Ver detalhes de ${classe.name}">Ver Detalhes</button>
                </div>
            </article>
        `;
    }

    // Função para mostrar painel flutuante de estatísticas da subclasse
    function showSubclassStatsPanel(subclassItem, subclass, corClasse, dialog) {
        // Remove any existing panel
        const existingPanel = document.querySelector('.subclass-stats-panel');
        if (existingPanel) existingPanel.remove();

        const statsHtml = Object.entries(subclass.estatisticas)
            .map(([key, value]) => `
                <div class="stat-bar" style="margin-bottom: 15px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span class="stat-name" style="font-weight: 600; color: #ddd; text-transform: capitalize;">${key}</span>
                        <span class="stat-value" style="font-weight: 600; color: ${corClasse};">${value}</span>
                    </div>
                    <div class="stat-progress" style="width: 100%; height: 8px; background: #333; border-radius: 4px; overflow: hidden;">
                        <div class="stat-fill" style="width: ${value}%; height: 100%; background: ${corClasse}; transition: width 0.3s;"></div>
                    </div>
                </div>
            `).join('');

        const panel = document.createElement('div');
        panel.className = 'subclass-stats-panel';
        panel.style = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #0f0f0f;
            border: 2px solid ${corClasse};
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.8);
            z-index: 1001;
            max-width: 300px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
        `;
        panel.innerHTML = `
            <button class="panel-close" style="position: absolute; top: 10px; right: 10px; background: ${corClasse}; color: white; border: none; font-size: 20px; cursor: pointer; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">×</button>
            <h4 style="margin: 0 0 15px 0; color: ${corClasse}; font-size: 18px;">${subclass.name}</h4>
            <div class="stats-container">${statsHtml}</div>
        `;

        dialog.appendChild(panel);

        // Fecha o painel ao clicar no botão de fechar ou fora do painel
        panel.querySelector('.panel-close').addEventListener('click', () => panel.remove());
        document.addEventListener('click', function closePanel(e) {
            if (!panel.contains(e.target) && !subclassItem.contains(e.target)) {
                panel.remove();
                document.removeEventListener('click', closePanel);
            }
        });
    }

    // Cria o modal das classes com as abas
    function createClassModal(classe) {
        const corClasse = classe.cor || '#333';
        
        const tabsHtml = `
            <div class="modal-tabs" style="display: flex; border-bottom: 2px solid ${corClasse}; background: #1a1a1a;">
                <button class="tab-btn active" data-tab="info" style="flex: 1; padding: 12px; background: none; border: none; cursor: pointer; font-weight: 600; color: #fff; border-bottom: 3px solid ${corClasse}; transition: 0.3s;">Informações</button>
                <button class="tab-btn" data-tab="stats" style="flex: 1; padding: 12px; background: none; border: none; cursor: pointer; font-weight: 600; color: #999; transition: 0.3s;">Estatísticas</button>
                <button class="tab-btn" data-tab="skills" style="flex: 1; padding: 12px; background: none; border: none; cursor: pointer; font-weight: 600; color: #999; transition: 0.3s;">Habilidades</button>
                <button class="tab-btn" data-tab="subclasses" style="flex: 1; padding: 12px; background: none; border: none; cursor: pointer; font-weight: 600; color: #999; transition: 0.3s;">Subclasses</button>
            </div>
        `;

        const statsHtml = Object.entries(classe.estatisticas)
            .map(([key, value]) => `
                <div class="stat-bar" style="margin-bottom: 15px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span class="stat-name" style="font-weight: 600; color: #ddd; text-transform: capitalize;">${key}</span>
                        <span class="stat-value" style="font-weight: 600; color: ${corClasse};">${value}</span>
                    </div>
                    <div class="stat-progress" style="width: 100%; height: 8px; background: #333; border-radius: 4px; overflow: hidden;">
                        <div class="stat-fill" style="width: ${value}%; height: 100%; background: ${corClasse}; transition: width 0.3s;"></div>
                    </div>
                </div>
            `).join('');

        const skillsHtml = (classe.habilidades || [])
            .map(skill => `
                <div class="skill-item" style="padding: 15px; background: #222; border-left: 4px solid ${corClasse}; margin-bottom: 12px; border-radius: 4px;">
                    <h4 style="margin: 0 0 8px 0; color: ${corClasse}; font-size: 16px;">${skill.nome}</h4>
                    <p style="margin: 0 0 8px 0; color: #bbb; font-size: 14px;">${skill.descricao}</p>
                    <span class="skill-cooldown" style="display: inline-block; background: ${corClasse}30; color: ${corClasse}; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">CD: ${skill.cooldown}</span>
                </div>
            `).join('') || '<p style="color: #999;">Nenhuma habilidade disponível</p>';

        const subclassesHtml = (classe.subclasses || [])
            .map(sub => `
                <div class="subclass-item" data-subclass-id="${sub.id}" style="border: 2px solid ${corClasse}40; border-radius: 8px; overflow: hidden; background: #1a1a1a; transition: transform 0.3s, box-shadow 0.3s; box-shadow: 0 4px 12px rgba(0,0,0,0.5); cursor: pointer;">
                    <div class="subclass-image-wrapper" style="height: 150px; overflow: hidden; background: linear-gradient(135deg, ${corClasse}30, ${corClasse}10);">
                        <img src="${sub.imagem}" alt="${sub.name}" class="subclass-image" style="width: 100%; height: 100%; object-fit: cover;">
                    </div>
                    <div class="subclass-info" style="padding: 15px;">
                        <h4 style="margin: 0 0 8px 0; color: ${corClasse}; font-size: 16px; font-weight: 700;">${sub.name}</h4>
                        <p style="margin: 0; color: #aaa; font-size: 13px;">${sub.descricao}</p>
                    </div>
                </div>
            `).join('') || '<p style="color: #999;">Nenhuma subclasse disponível</p>';

        return `
            <div class="class-modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000;">
                <div class="modal-content" style="background: #0f0f0f; border-radius: 12px; max-width: 900px; max-height: 90vh; overflow-y: auto; position: relative; width: 95%; box-shadow: 0 15px 50px rgba(0,0,0,0.8); border-top: 5px solid ${corClasse};">
                    <button class="modal-close" aria-label="Fechar" style="position: absolute; top: 15px; right: 15px; background: ${corClasse}; color: white; border: none; font-size: 28px; cursor: pointer; z-index: 10; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: 0.3s; box-shadow: 0 4px 12px rgba(0,0,0,0.4);">×</button>
                    
                    <div class="modal-header-compact" style="display: flex; align-items: center; gap: 20px; padding: 25px; background: linear-gradient(135deg, ${corClasse}20, ${corClasse}10); border-bottom: 3px solid ${corClasse};">
                        <img src="${classe.image}" alt="${classe.name}" class="modal-header-img" style="width: 100px; height: 100px; object-fit: cover; border-radius: 8px; flex-shrink: 0; border: 3px solid ${corClasse}; box-shadow: 0 4px 12px ${corClasse}50;">
                        <div class="modal-header-text">
                            <h2 style="margin: 0 0 10px 0; font-size: 28px; color: ${corClasse}; font-weight: 700;">${classe.name}</h2>
                            <p style="margin: 0; color: #aaa; font-size: 14px;">${classe.descricao}</p>
                        </div>
                    </div>

                    ${tabsHtml}

                    <div class="modal-body" style="padding: 30px; background: #0f0f0f;">
                        <div class="tab-content info active">
                            <h3 style="color: ${corClasse}; margin-bottom: 15px; font-size: 20px; border-bottom: 2px solid ${corClasse}40; padding-bottom: 10px;">Descrição da Classe</h3>
                            <p style="color: #bbb; line-height: 1.8; font-size: 15px;">${classe.descricao}</p>
                        </div>

                        <div class="tab-content stats" style="display: none;">
                            <h3 style="color: ${corClasse}; margin-bottom: 20px; font-size: 20px; border-bottom: 2px solid ${corClasse}40; padding-bottom: 10px;">Estatísticas</h3>
                            <div class="stats-container">${statsHtml}</div>
                        </div>

                        <div class="tab-content skills" style="display: none;">
                            <h3 style="color: ${corClasse}; margin-bottom: 20px; font-size: 20px; border-bottom: 2px solid ${corClasse}40; padding-bottom: 10px;">Habilidades</h3>
                            <div class="skills-list">${skillsHtml}</div>
                        </div>

                        <div class="tab-content subclasses" style="display: none;">
                            <h3 style="color: ${corClasse}; margin-bottom: 20px; font-size: 20px; border-bottom: 2px solid ${corClasse}40; padding-bottom: 10px;">Subclasses Disponíveis</h3>
                            <div class="subclasses-list" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-top: 20px;">${subclassesHtml}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Setup das abas do modal
    function setupModalTabs(modal) {
        const tabs = Array.from(modal.querySelectorAll('.tab-btn'));
        const contents = Array.from(modal.querySelectorAll('.tab-content'));

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.tab;
                tabs.forEach(t => {
                    t.classList.remove('active');
                    t.style.color = '#999';
                    t.style.borderBottom = 'none';
                });
                contents.forEach(c => c.style.display = 'none');
                
                tab.classList.add('active');
                tab.style.color = '#fff';
                const corClasse = modal.querySelector('.modal-header-img').style.borderColor;
                tab.style.borderBottom = `3px solid ${corClasse}`;
                
                const content = modal.querySelector(`.tab-content.${target}`);
                if (content) content.style.display = 'block';
            });
        });
    }

    // Evento de clique no grid
    classesGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn');
        if (!btn) return;
        
        const card = btn.closest('.class-card');
        const classId = card.dataset.classId;
        const classe = classes.find(c => c.id === classId);
        
        if (!classe) return;

        document.body.insertAdjacentHTML('beforeend', createClassModal(classe));
        document.body.style.overflow = 'hidden';

        const modal = document.querySelector('.class-modal');
        if (!modal) return;

        const dialog = modal.querySelector('.modal-content');
        setupModalTabs(dialog);

        // Evento para itens de subclasse
        const subclassItems = dialog.querySelectorAll('.subclass-item');
        subclassItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const subclassId = item.dataset.subclassId;
                const subclass = classe.subclasses.find(sub => sub.id === subclassId);
                if (subclass) {
                    showSubclassStatsPanel(item, subclass, classe.cor || '#333', dialog);
                }
            });
        });

        // Fecha o modal
        modal.addEventListener('click', (ev) => {
            if (ev.target === modal || ev.target.matches('.modal-close')) {
                modal.remove();
                document.body.style.overflow = '';
            }
        });
    });

    // Carrega as classes
    async function loadClasses() {
        try {
            console.log('Iniciando carregamento das classes...');
            const response = await fetch('data/classesData.json');
            console.log('Resposta do fetch:', response);
            const data = await response.json();
            console.log('Dados carregados:', data);
            classes = data.classes;
            console.log('Classes definidas:', classes);
            classesGrid.innerHTML = classes.map(createClassCard).join('');

            // Preenche o select das classes após carregar
            const classSelect = document.getElementById('classSelect');
            console.log('Elemento classSelect:', classSelect);
            classes.forEach(classe => {
                const option = document.createElement('option');
                option.value = classe.id;
                option.textContent = classe.name;
                classSelect.appendChild(option);
                console.log('Adicionada classe:', classe.name);
            });
        } catch (error) {
            console.error('Erro ao carregar classes:', error);
            classesGrid.innerHTML = '<p class="error">Erro ao carregar classes: ' + error.message + '</p>';
        }
    }

    loadClasses();

    // Calculadora de atributos
    const subclass1Select = document.getElementById('subclass1Select');
    const subclass2Select = document.getElementById('subclass2Select');
    const summedStatsDiv = document.getElementById('summedStats');
    const classSelect = document.getElementById('classSelect');

    // Função para preencher as subclasses com base na classe selecionada
    function populateSubclasses() {
        const selectedClassId = classSelect.value;
        const selectedClass = classes.find(c => c.id === selectedClassId);
        const subclasses = selectedClass ? selectedClass.subclasses || [] : [];
        
        [subclass1Select, subclass2Select].forEach(select => {
            select.innerHTML = '<option value="">Selecione subclasse</option>';
            subclasses.forEach(sub => {
                const option = document.createElement('option');
                option.value = sub.id;
                option.textContent = sub.name;
                select.appendChild(option);
            });
        });
        calculateSum(); // Recalcula ao mudar de classe
    }

    // Função para calcular a soma dos atributos
    function calculateSum() {
        const classId = classSelect.value;
        const sub1Id = subclass1Select.value;
        const sub2Id = subclass2Select.value;
        
        if (!classId || !sub1Id || !sub2Id) {
            summedStatsDiv.style.display = 'none';
            return;
        }
        
        const classe = classes.find(c => c.id === classId);
        const sub1 = classe.subclasses.find(s => s.id === sub1Id);
        const sub2 = classe.subclasses.find(s => s.id === sub2Id);
        
        const sumStats = {};
        
        // Soma os atributos da classe
        Object.entries(classe.estatisticas).forEach(([key, val]) => {
            sumStats[key] = (sumStats[key] || 0) + val;
        });
        
        // Soma a primeira subclasse
        Object.entries(sub1.estatisticas).forEach(([key, val]) => {
            sumStats[key] = (sumStats[key] || 0) + val;
        });
        
        // Soma a segunda subclasse
        Object.entries(sub2.estatisticas).forEach(([key, val]) => {
            sumStats[key] = (sumStats[key] || 0) + val;
        });
        
        // Exibição dos resultados
        const corClasse = classe.cor || '#333';
        const statsHtml = Object.entries(sumStats)
            .map(([key, value]) => `
                <div class="stat-bar" style="margin-bottom: 15px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span class="stat-name" style="font-weight: 600; color: #ddd; text-transform: capitalize;">${key}</span>
                        <span class="stat-value" style="font-weight: 600; color: ${corClasse};">${value}</span>
                    </div>
                    <div class="stat-progress" style="width: 100%; height: 8px; background: #333; border-radius: 4px; overflow: hidden;">
                        <div class="stat-fill" style="width: ${Math.min(value / 50, 100)}%; height: 100%; background: ${corClasse}; transition: width 0.3s;"></div>
                    </div>
                </div>
            `).join('');
        
        summedStatsDiv.innerHTML = `<h3 style="color: ${corClasse}; margin-bottom: 20px;">Atributos Somados</h3><div class="stats-container">${statsHtml}</div>`;
        summedStatsDiv.style.display = 'block';
    }

    // Eventos
    classSelect.addEventListener('change', populateSubclasses);
    subclass1Select.addEventListener('change', calculateSum);
    subclass2Select.addEventListener('change', calculateSum);
});
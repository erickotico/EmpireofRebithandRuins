    document.addEventListener('DOMContentLoaded', () => {
        const toggle = document.getElementById('togglePass');
        const pass = document.getElementById('password');
        if (toggle && pass) {
            toggle.addEventListener('click', () => {
                const t = pass.type === 'password' ? 'text' : 'password';
                pass.type = t;
                toggle.textContent = t === 'text' ? 'Ocultar' : 'Mostrar';
            });
        }
    });
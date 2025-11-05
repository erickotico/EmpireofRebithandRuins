document.addEventListener('DOMContentLoaded', () => {
    const togglePassword = document.querySelector('.toggle-password');
    const password = document.getElementById('password');
    const eyeIcon = document.querySelector('.eye-icon');

    togglePassword?.addEventListener('click', () => {
        if (!password) return;
        const type = password.type === 'password' ? 'text' : 'password';
        password.type = type;
        if (eyeIcon) {
            eyeIcon.src = type === 'text'
                ? './img/icons/opened-eye.png'
                : './img/icons/closed-eye.png';
        }
    });

    // Modal elements
    const modal = document.getElementById('signupModal');
    const openButton = document.getElementById('openSignup');
    const closeButton = document.getElementById('closeSignup');
    const cancelButton = document.getElementById('cancelSignup');
    const signupForm = document.getElementById('signupForm');

    // Abrir modal
    openButton?.addEventListener('click', (e) => {
        e.preventDefault();
        if (!modal) return;
        modal.hidden = false;
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        const first = modal.querySelector('input');
        first?.focus();
    });

    // Fechar modal
    const closeModal = () => {
        if (!modal) return;
        modal.hidden = true;
        modal.style.display = 'none';
        document.body.style.overflow = '';
        openButton?.focus();
    };

    closeButton?.addEventListener('click', closeModal);
    cancelButton?.addEventListener('click', closeModal);

    // Fecha clicando fora do modal
    modal?.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });

    // Fecha o modal ao pressionar ESC
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal && !modal.hidden) {
            closeModal();
        }
    });
    // Validação e submissão do formulário de cadastro
    function isValidDate(day, month, year) {
        const d = Number(day);
        const m = Number(month);
        const y = Number(year);

        if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) return false;
        const currentYear = new Date().getFullYear();
        if (y < 1900 || y > currentYear) return false;
        if (m < 1 || m > 12) return false;

        const daysInMonth = new Date(y, m, 0).getDate(); // m = 1..12
        if (d < 1 || d > daysInMonth) return false;

        // Não permite data no futuro
        const birth = new Date(y, m - 1, d);
        const today = new Date();
        if (birth > today) return false;

        return true;
    }

    signupForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        // limpa erros
        signupForm.querySelectorAll('.form-error').forEach(el => el.textContent = '');

        const vals = {
            fullName: signupForm.fullName?.value.trim() ?? '',
            email: signupForm.email?.value.trim() ?? '',
            phone: signupForm.phone?.value.trim() ?? '',
            day: signupForm.day?.value ?? '',
            month: signupForm.month?.value ?? '',
            year: signupForm.year?.value ?? '',
            password: signupForm.password?.value ?? '',
            agree: signupForm.agreeTerms?.checked ?? false
        };

        let valid = true;

        if (!vals.fullName) {
            signupForm.querySelector('[data-for="fullName"]').textContent = 'Informe seu nome.';
            valid = false;
        }

        if (!vals.email || !/\S+@\S+\.\S+/.test(vals.email)) {
            signupForm.querySelector('[data-for="signupEmail"]').textContent = 'E‑mail inválido.';
            valid = false;
        }

        if (!isValidDate(vals.day, vals.month, vals.year)) {
            signupForm.querySelector('[data-for="dob"]').textContent = 'Data de nascimento inválida.';
            valid = false;
        }

        if (!vals.password || vals.password.length < 6) {
            signupForm.querySelector('[data-for="signupPassword"]').textContent = 'Senha deve ter pelo menos 6 caracteres.';
            valid = false;
        }

        if (!vals.agree) {
            signupForm.querySelector('[data-for="agreeTerms"]').textContent = 'Você deve aceitar os termos.';
            valid = false;
        }

        if (!valid) return;

        // Simulação de envio — substituir por fetch de uma API
        const payload = {
            name: vals.fullName,
            email: vals.email,
            phone: vals.phone,
            birth: `${String(vals.year).padStart(4,'0')}-${String(vals.month).padStart(2,'0')}-${String(vals.day).padStart(2,'0')}`
        };
        console.log('Cadastrar usuário:', payload);

        // feedback simples
        const submitBtn = signupForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Criando...';
        }

        setTimeout(() => {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Criar conta';
            }
            closeModal();
            alert('Conta criada (simulado). Você pode agora fazer login.');
            signupForm.reset();
        }, 900);
    });

    // ---------- fim modal ----------
});

// Função para login com Google 
// Nota: vai precisar da configuração do Firebase ou outra API de autenticação real
function loginWithGoogle() {
    console.log('Login com Google iniciado');
}
document.addEventListener('DOMContentLoaded', () => {
    const togglePassword = document.querySelector('.toggle-password');
    const password = document.getElementById('password');
    const eyeIcon = document.querySelector('.eye-icon');

    togglePassword?.addEventListener('click', () => {
        const type = password.type === 'password' ? 'text' : 'password';
        password.type = type;
        
        eyeIcon.src = type === 'text' 
            ? './img/icons/opened-eye.png'
            : './img/icons/closed-eye.png';
    });
});
// Função para login com Google (vai precisar da configuração do Firebase ou outra API)
function loginWithGoogle() {
    // logica de autenticação com Google aqui
    console.log('Login com Google iniciado');
}
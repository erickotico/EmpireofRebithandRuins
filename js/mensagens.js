// As mensagens agora ficam numa janelinha no canto da tela (js/chat.js), em todas as páginas.
// Este endereço continua existindo para links antigos:
//   mensagens.html            → abre a janela na página inicial
//   mensagens.html?com=Apelido → abre a conversa com esse amigo
(function () {
    let logged = false;
    for (const area of ['localStorage', 'sessionStorage']) {
        try { if (window[area].getItem('sb-qjpogjpmxbpuuclpdfhv-auth-token')) logged = true; } catch { /* */ }
    }
    if (!logged) {
        document.getElementById('msgStatus').hidden = true;
        document.getElementById('msgGuest').hidden = false;
        return;
    }
    const nick = new URLSearchParams(window.location.search).get('com');
    const ok = nick && /^[A-Za-z0-9_À-ÖØ-öø-ÿĀ-ž-]{3,20}$/.test(nick);
    try { sessionStorage.setItem('eor-chat', JSON.stringify({ open: true, min: false, nick: ok ? nick : null })); } catch { /* */ }
    window.location.replace('index.html');
})();

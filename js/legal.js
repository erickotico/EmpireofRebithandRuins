// Páginas de texto legal (termos.html, privacidade.html).
// Um link como termos.html#regras funciona nos dois idiomas: se o título em
// português estiver escondido (página em inglês), rola até a versão "-en".
(function () {
    function go() {
        var id = decodeURIComponent(location.hash.slice(1));
        if (!id) return;
        var el = document.getElementById(id);
        if (el && el.offsetParent === null) el = document.getElementById(id.slice(-3) === '-en' ? id.slice(0, -3) : id + '-en');
        if (el && el.offsetParent !== null) el.scrollIntoView();
    }
    window.addEventListener('load', function () { setTimeout(go, 0); });
    window.addEventListener('hashchange', go);
})();

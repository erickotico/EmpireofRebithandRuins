// Endereço antigo "comunidade.html": agora a comunidade tem duas páginas.
//   Social  (social.html)  → momentos, prints e anúncios
//   Taverna (taverna.html) → perguntas e dicas
// Este arquivo só manda para a página certa (links antigos e avisos do sino).
(function () {
    const params = new URLSearchParams(window.location.search);
    const go = (url) => window.location.replace(url);
    const post = Number(params.get('post'));
    if (Number.isInteger(post) && post > 0) {
        // Descobre a etiqueta da publicação para abrir na página certa
        fetch('https://qjpogjpmxbpuuclpdfhv.supabase.co/rest/v1/rpc/feed', {
            method: 'POST',
            headers: {
                apikey: 'sb_publishable_mYKOcjU5XYwsDQW-4Bve8g_SpCqp1Dc',
                Authorization: 'Bearer sb_publishable_mYKOcjU5XYwsDQW-4Bve8g_SpCqp1Dc',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ p_post: post })
        })
            .then((res) => (res.ok ? res.json() : []))
            .catch(() => [])
            .then((rows) => {
                const tag = rows?.[0]?.tag;
                go(`${tag === 'pergunta' || tag === 'dica' ? 'taverna' : 'social'}.html?post=${post}`);
            });
        return;
    }
    if (params.get('filtro') === 'sem-solucao') { go('taverna.html?filtro=sem-solucao'); return; }
    const q = params.get('q');
    go(q ? `social.html?q=${encodeURIComponent(q)}` : 'social.html');
})();

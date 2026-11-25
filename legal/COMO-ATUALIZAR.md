# Como publicar uma nova versão dos documentos

Documentos do site:

| Documento | Arquivo | Observação |
|---|---|---|
| Termos de uso | `termos.html` | inclui as **Regras da comunidade** (seção 2, âncora `#regras`) |
| Política de privacidade | `privacidade.html` | prazos de guarda na seção 7 |
| Versões antigas | `legal/<documento>-AAAA-MM-DD.html` | só para consulta, nunca editar |

O popup do cadastro e do rodapé lê o texto direto desses dois arquivos, então só existe **um lugar** para editar.
Cada arquivo tem o texto em **português e em inglês**: mude os dois.

## 1. Mudança pequena (erro de digitação, link, frase mais clara sem mudar o sentido)

1. Edite o texto em `termos.html` ou `privacidade.html` (PT e EN).
2. Troque o `?v=` das páginas para o navegador não usar a cópia antiga.
3. Publique.

Não precisa mudar a data nem pedir novo aceite.

## 2. Mudança importante (novas regras, novos dados coletados, novo fornecedor, novo prazo)

Faça nesta ordem:

1. **Arquive a versão atual.** Copie `legal/privacidade-2026-11-20.html` como modelo, troque o título e a data, e cole dentro os dois `<article>` da versão que está no ar (sem os atributos `data-lang`). Salve como `legal/termos-AAAA-MM-DD.html` ou `legal/privacidade-AAAA-MM-DD.html`, usando a **data da versão antiga**.
2. **Edite o texto novo** no `termos.html` / `privacidade.html`, em PT e EN.
3. **Troque a data** em `<p class="legal-updated">` (PT: "Versão de …", EN: "Version of …").
4. **Liste a versão antiga** no bloco "Versões anteriores" no fim do documento (PT e EN), com link para o arquivo da etapa 1.
5. **Peça novo aceite** a quem já tem conta:
   - Em `js/auth.js`, mude `TERMS_VERSION` para a nova data (`'AAAA-MM-DD'`).
   - No SQL Editor do Supabase, rode (com a mesma data):
     ```sql
     create or replace function public.current_terms_version()
     returns text language sql immutable set search_path = ''
     as $$ select 'AAAA-MM-DD'::text $$;
     ```
   - Rode esse SQL **logo depois** de publicar o site (os dois juntos). A partir daí, quem aceitou a versão anterior vê o aviso "Atualizamos os Termos…" até clicar em "Concordo", e o banco grava a nova versão e a data.
6. Troque o `?v=` das páginas e publique.

Se mudar um **prazo de guarda**, mude também o intervalo correspondente em `run_maintenance()` (a versão mais nova está em `supabase/019_comunidade_moderacao.sql`; copie a função inteira, mude o prazo e rode só ela no SQL Editor) para o banco apagar no prazo novo.

## 3. Regras da comunidade

As regras ficam nos Termos de uso, seção 2. Mudar uma regra é mudar os Termos: siga o caso 1 (ajuste de texto) ou o caso 2 (regra nova ou mais rígida).

Se a regra virar um motivo de punição, atualize também os motivos prontos do painel de moderação (`REASONS` em `js/moderacao.js` e as chaves `modRs…` em `js/langSwitcher.js`).

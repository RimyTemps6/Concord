# Conecta

Chat em tempo real feito com HTML, CSS e JavaScript, usando Firebase (login + Firestore).

- Cadastro com nome, token e senha. O ID da conta é gerado automaticamente.
- Pessoas são adicionadas por QR code ou pelo ID da conta.
- Mensagens chegam na hora entre aparelhos.

## Arquivos
- `index.html`, `style.css`, `app.js`: o site
- `firebase-config.js`: dados do seu projeto Firebase
- `firestore.rules`: regras do banco (cole na aba Regras do Firestore)

## Publicar no GitHub Pages
1. Envie todos os arquivos para a raiz de um repositório.
2. Em Settings > Pages, escolha "Deploy from a branch", branch `main`, pasta `/ (root)`.
3. No Firebase, em Authentication > Configurações > Domínios autorizados, adicione `SEU-USUARIO.github.io`.

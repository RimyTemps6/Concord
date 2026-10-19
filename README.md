# Conecta

Chat em tempo real feito com HTML, CSS e JavaScript, usando Firebase (login + Firestore).

- Cadastro com nome, token e senha. O ID da conta é gerado automaticamente.
- Pessoas são adicionadas por QR code (câmera ou foto do QR) ou pelo ID da conta.
- Mensagens, grupos e status (24 h) em tempo real.
- **Perfil**: foto, banner (foto ou GIF animado de até 600 KB), nome e recado.
- **Chamadas privadas** de voz e vídeo 1 a 1 (WebRTC), pelo 📞 e 🎥 no topo da conversa.
- **Instalável** (PWA): botão "📲 Instalar app" na tela de login e no perfil.
- Layout adaptado ao celular (menu embaixo, conversa em tela cheia).

## Arquivos
- `index.html`, `style.css`, `app.js`: o site
- `firebase-config.js`: dados do seu projeto Firebase
- `firestore.rules`: regras do banco (cole na aba Regras do Firestore e clique em Publicar)
- `manifest.webmanifest`, `sw.js`, `icons/`: instalação como app

## Publicar no GitHub Pages
1. Envie **todos** os arquivos (inclusive a pasta `icons`) para a raiz de um repositório.
2. Em Settings > Pages, escolha "Deploy from a branch", branch `main`, pasta `/ (root)`.
3. No Firebase, em Authentication > Configurações > Domínios autorizados, adicione `SEU-USUARIO.github.io`.

## Observações
- Câmera, microfone e instalação só funcionam em **https** (o GitHub Pages já é).
- As chamadas usam STUN do Google e um TURN público gratuito. Para máxima confiabilidade em qualquer rede (4G, Wi-Fi corporativo), use um servidor TURN seu e troque em `ICE` no `app.js`.
- Fotos e banners ficam salvos no próprio Firestore (já reduzidos), então não precisa do Firebase Storage.

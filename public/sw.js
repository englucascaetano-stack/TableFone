// Service worker minimo, so para o navegador oferecer "instalar app". Nao guarda nada em cache:
// toda requisicao vai a rede, entao nunca serve arquivo antigo.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

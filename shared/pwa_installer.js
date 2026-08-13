// Engine Universal para Instalación PWA (Android Chrome, iOS Safari, WebViews)
window.deferredPwaPrompt = null;

// Escuchar evento de instalación nativo en Android/Chrome
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.deferredPwaPrompt = e;
  console.log("📲 Evento beforeinstallprompt capturado listo para instalar.");
  
  // Mostrar botones de instalación en la UI si existen
  const clientBtn = document.getElementById('pwaInstallBtnClient');
  const driverBtn = document.getElementById('pwaInstallBtnDriver');
  if (clientBtn) clientBtn.style.display = 'flex';
  if (driverBtn) driverBtn.style.display = 'flex';
});

// Función ejecutable desde los botones
window.installPwaApp = function(appType) {
  if (window.deferredPwaPrompt) {
    window.deferredPwaPrompt.prompt();
    window.deferredPwaPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('✅ PWA instalada exitosamente por el usuario');
      }
      window.deferredPwaPrompt = null;
    });
  } else {
    // Modal de Guía para iOS Safari o Webviews de WhatsApp
    showPwaGuideModal(appType);
  }
};

function showPwaGuideModal(appType) {
  const existing = document.getElementById('pwaGuideModal');
  if (existing) existing.remove();

  const appTitle = appType === 'driver' ? 'Repartidor' : 'Cliente';
  const modalHtml = `
    <div id="pwaGuideModal" class="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-slate-900 border border-emerald-500/40 rounded-2xl p-6 max-w-sm w-full text-center text-white shadow-2xl space-y-4">
        <div class="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto text-3xl">📱</div>
        <div>
          <h3 class="text-xl font-bold">Instalar UbaVoy ${appTitle}</h3>
          <p class="text-sm text-slate-300 mt-1">Para tener la mejor experiencia y notificaciones en tu celular:</p>
        </div>
        
        <div class="bg-slate-800/80 p-3.5 rounded-xl text-left text-xs space-y-2 border border-slate-700">
          <p><strong>En Android (Chrome):</strong> Toca los 3 puntos (⋮) arriba a la derecha y selecciona <em>"Agregar a la pantalla de inicio"</em> o <em>"Instalar aplicación"</em>.</p>
          <hr class="border-slate-700">
          <p><strong>En iPhone (Safari):</strong> Toca el botón <strong>Compartir (↑)</strong> en la barra inferior y selecciona <em>"Añadir a la pantalla de inicio (+)"</em>.</p>
        </div>
        
        <button onclick="document.getElementById('pwaGuideModal').remove()" class="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold py-3 rounded-xl transition shadow-lg">
          Entendido
        </button>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// Engine Universal PWA Installer con Detección Inteligente de OS (Prompt Directo Android 1-Clic)
let globalDeferredPrompt = null;

// Capturar el evento nativo de Android/Chrome
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  globalDeferredPrompt = e;
  console.log("🚀 Evento nativo de instalación PWA listo en Android.");
  
  // Asegurar que los botones de instalación estén visibles
  const clientBtn = document.getElementById('pwaInstallBtnClient');
  const driverBtn = document.getElementById('pwaInstallBtnDriver');
  if (clientBtn) clientBtn.style.display = 'inline-flex';
  if (driverBtn) driverBtn.style.display = 'inline-flex';
});

// Escuchar si la app ya fue instalada
window.addEventListener('appinstalled', () => {
  console.log("🎉 PWA instalada exitosamente en el dispositivo.");
  globalDeferredPrompt = null;
  alert("¡UbaVoy se instaló correctamente en tu pantalla de inicio!");
});

window.installPwaApp = async function(appType) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  // CASO 1: Android / Chrome con evento nativo listo (Instalación Directa 1-Clic)
  if (globalDeferredPrompt) {
    try {
      globalDeferredPrompt.prompt();
      const { outcome } = await globalDeferredPrompt.userChoice;
      console.log(`Resultado de instalación del usuario: ${outcome}`);
      globalDeferredPrompt = null;
    } catch (err) {
      console.error("Error al invocar prompt nativo:", err);
    }
    return;
  }

  // CASO 2: Dispositivo iOS (Safari)
  if (isIOS) {
    showIOSInstallGuide(appType);
    return;
  }

  // CASO 3: Android que ya instaló la app o navegador que requiere guía manual
  showAndroidFallbackGuide(appType);
};

function showIOSInstallGuide(appType) {
  const existing = document.getElementById('pwaGuideModalIOS');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'pwaGuideModalIOS';
  modal.innerHTML = `
    <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-slate-900 border border-emerald-500/30 rounded-2xl p-6 max-w-sm w-full text-center text-white shadow-2xl space-y-4">
        <div class="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto text-3xl">🍏</div>
        <h3 class="text-xl font-bold">Instalar en iPhone / iPad</h3>
        <p class="text-xs text-slate-300">Sigue estos 2 sencillos pasos en Safari:</p>
        <div class="bg-slate-800 p-3.5 rounded-xl text-left text-xs space-y-2 border border-slate-700">
          <p>1. Toca el botón <strong>Compartir (↑)</strong> en la barra inferior de Safari.</p>
          <p>2. Selecciona <strong>"Añadir a la pantalla de inicio (+)"</strong>.</p>
        </div>
        <button onclick="this.closest('.fixed').remove()" class="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold py-3 rounded-xl transition shadow-lg">Entendido</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function showAndroidFallbackGuide(appType) {
  const existing = document.getElementById('pwaGuideModalAndroid');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'pwaGuideModalAndroid';
  modal.innerHTML = `
    <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-slate-900 border border-amber-500/30 rounded-2xl p-6 max-w-sm w-full text-center text-white shadow-2xl space-y-4">
        <div class="w-16 h-16 bg-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center mx-auto text-3xl">🤖</div>
        <h3 class="text-xl font-bold">Instalar en Android</h3>
        <p class="text-xs text-slate-300">Si no apareció la ventana automática de instalación:</p>
        <div class="bg-slate-800 p-3.5 rounded-xl text-left text-xs space-y-2 border border-slate-700">
          <p>Toca el menú de <strong>3 puntos (⋮)</strong> en la esquina superior de Chrome y selecciona <strong>"Instalar aplicación"</strong> o <strong>"Agregar a la pantalla principal"</strong>.</p>
        </div>
        <button onclick="this.closest('.fixed').remove()" class="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold py-3 rounded-xl transition shadow-lg">Entendido</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

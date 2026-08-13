// Engine 1-Tap Native Installer para Android (Disparo directo del prompt nativo sin modales intermediarios)
let deferredNativePrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevenir que Chrome muestre su barra por defecto a destiempo
  e.preventDefault();
  // Guardar el evento nativo del sistema
  deferredNativePrompt = e;
  console.log("⚡ Evento nativo de instalación 1-Click capturado en Android");

  // Mostrar los botones de instalación directamente
  const clientBtn = document.getElementById('pwaInstallBtnClient');
  const driverBtn = document.getElementById('pwaInstallBtnDriver');
  if (clientBtn) clientBtn.classList.remove('hidden');
  if (driverBtn) driverBtn.classList.remove('hidden');
});

// Función de instalación instantánea al tocar el botón
window.installPwaAppDirect = async function(appType) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  // CASO ANDROID / DESKTOP (DISPARO DIRECTO NATIVO DE 1 CLIC)
  if (deferredNativePrompt) {
    try {
      // Disparar la ventana emergente nativa del sistema Android
      deferredNativePrompt.prompt();
      
      // Esperar la respuesta del usuario
      const { outcome } = await deferredNativePrompt.userChoice;
      console.log(`Elección de instalación del usuario: ${outcome}`);
      
      if (outcome === 'accepted') {
        console.log('✅ El usuario instaló la PWA en Android');
      }
      deferredNativePrompt = null;
    } catch (err) {
      console.error("Error al ejecutar prompt nativo:", err);
    }
    return;
  }

  // Si es iOS (Safari)
  if (isIOS) {
    alert("🍏 Para instalar en iPhone:\nToca el botón 'Compartir (↑)' en Safari y elige 'Añadir a la pantalla de inicio (+)'");
    return;
  }

  // Si el evento nativo aún no ha cargado en Android
  alert("⌛ Preparando la instalación nativa... Por favor vuelve a tocar el botón en 2 segundos.");
};

// Mantener retrocompatibilidad con window.installPwaApp
window.installPwaApp = function(appType) {
  window.installPwaAppDirect(appType);
};

// Confirmación de instalación completada
window.addEventListener('appinstalled', () => {
  console.log('🎉 PWA agregada a la pantalla de inicio del celular');
  deferredNativePrompt = null;
});

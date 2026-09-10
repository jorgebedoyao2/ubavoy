/**
 * UbaVoy - Avisos push en la app del domiciliario
 * ============================================================================
 * Hasta ahora la alarma solo sonaba con la app abierta en pantalla. Si el
 * domiciliario la cerraba, entraba una llamada o se dormía el teléfono, la
 * carrera no le llegaba. Esto hace que le suene igual con la app cerrada.
 *
 * DOS DECISIONES QUE IMPORTAN:
 *
 * 1. El permiso NO se pide al abrir la página. Se pide después de iniciar
 *    sesión y con una explicación. Un permiso negado casi no se recupera —
 *    la persona tendría que ir a los ajustes del navegador a desbloquearlo a
 *    mano, y nadie hace eso. Vale más pedirlo una vez, bien, que perderlo.
 *
 * 2. El service worker de OneSignal vive en su propio espacio (/onesignal/).
 *    La app ya tiene el suyo en /apps/driver/, que es el que hace que la PWA
 *    se instale y funcione sin señal. Si compartieran espacio se pisarían y
 *    romperíamos la instalación, que costó arreglar.
 *
 * La alarma sonora se queda: el push despierta el teléfono, la alarma es para
 * cuando ya está mirando la app. Son complementarias, no sustitutas.
 */

const AVISOS_APP_ID = '1b0051c9-b521-4a6f-9d90-03eca15afc97';
const AVISOS_SAFARI_ID = 'web.onesignal.auto.3cbb98e8-d926-4cfe-89ae-1bc86ff7cf70';

const avisosEstado = {
  listo: false,
  uid: null,
  permiso: 'desconocido',   // 'granted' | 'denied' | 'default'
};

function avisosDisponibles() {
  return typeof window !== 'undefined'
      && 'Notification' in window
      && 'serviceWorker' in navigator;
}

/** Arranca el SDK. Se llama una sola vez al cargar la app. */
function avisosIniciar() {
  if (!avisosDisponibles()) {
    console.warn('Avisos: este navegador no soporta notificaciones.');
    avisosPintarBanner();
    return;
  }

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function (OneSignal) {
    try {
      await OneSignal.init({
        appId: AVISOS_APP_ID,
        safari_web_id: AVISOS_SAFARI_ID,
        // El botón flotante de OneSignal se apaga: pedimos el permiso desde
        // nuestra propia tarjeta, donde podemos explicar para qué es.
        notifyButton: { enable: false },
        autoResubscribe: true,
        serviceWorkerParam: { scope: '/onesignal/' },
        serviceWorkerPath: 'onesignal/OneSignalSDKWorker.js',
      });

      avisosEstado.listo = true;
      avisosEstado.permiso = Notification.permission;
      avisosPintarBanner();

      // Si ya había sesión cuando terminó de cargar, se enlaza de una vez.
      if (avisosEstado.uid) avisosEnlazarDomiciliario(avisosEstado.uid);
    } catch (e) {
      console.error('Avisos: no se pudo iniciar OneSignal', e);
      avisosPintarBanner();
    }
  });
}

/**
 * Marca a este dispositivo como de un domiciliario. El servidor manda los
 * avisos filtrando por esa marca, así que sin esto no llega nada — y un
 * cliente que llegara a suscribirse tampoco recibe carreras.
 */
function avisosEnlazarDomiciliario(uid) {
  avisosEstado.uid = uid || null;
  if (!avisosEstado.listo || !uid) return;

  window.OneSignalDeferred.push(async function (OneSignal) {
    try {
      await OneSignal.login(String(uid));
      await OneSignal.User.addTags({ rol: 'domiciliario', uid: String(uid) });
      avisosEstado.permiso = Notification.permission;
      avisosPintarBanner();
    } catch (e) {
      console.error('Avisos: no se pudo enlazar el domiciliario', e);
    }
  });
}

/** Al cerrar sesión el dispositivo deja de contar como domiciliario. */
function avisosDesenlazar() {
  avisosEstado.uid = null;
  if (!avisosEstado.listo) return;
  window.OneSignalDeferred.push(async function (OneSignal) {
    try { await OneSignal.logout(); } catch (_) {}
  });
}

/** Pide el permiso. Solo se llama desde un toque de la persona. */
async function avisosPedirPermiso() {
  if (!avisosDisponibles()) return;

  if (Notification.permission === 'denied') {
    if (typeof showToast === 'function') {
      showToast('Los avisos están bloqueados. Actívalos en los ajustes del navegador.', 'error');
    }
    return;
  }

  window.OneSignalDeferred.push(async function (OneSignal) {
    try {
      await OneSignal.Notifications.requestPermission();
      avisosEstado.permiso = Notification.permission;

      if (avisosEstado.permiso === 'granted') {
        await OneSignal.User.PushSubscription.optIn();
        if (avisosEstado.uid) await OneSignal.User.addTags({ rol: 'domiciliario' });
        if (typeof showToast === 'function') {
          showToast('✅ Listo. Te avisamos aunque tengas la app cerrada.');
        }
      }
      avisosPintarBanner();
    } catch (e) {
      console.error('Avisos: fallo pidiendo permiso', e);
    }
  });
}

/**
 * Tarjeta de estado. Se muestra solo cuando hay algo que hacer: si los avisos
 * ya están activos, desaparece y no estorba.
 */
function avisosPintarBanner() {
  const caja = document.getElementById('avisos-banner');
  if (!caja) return;

  const permiso = avisosDisponibles() ? Notification.permission : 'no-soportado';
  const titulo = document.getElementById('avisos-titulo');
  const texto = document.getElementById('avisos-texto');
  const boton = document.getElementById('avisos-boton');

  if (permiso === 'granted') { caja.classList.add('hidden'); return; }
  caja.classList.remove('hidden');

  if (permiso === 'denied') {
    if (titulo) titulo.innerText = '🔕 Avisos bloqueados';
    if (texto) texto.innerText = 'No te van a llegar carreras con la app cerrada. Desbloquea las notificaciones en los ajustes del navegador para este sitio.';
    if (boton) boton.classList.add('hidden');
    return;
  }

  if (permiso === 'no-soportado') {
    if (titulo) titulo.innerText = '🔕 Este navegador no da avisos';
    if (texto) texto.innerText = 'Instala UbaVoy en tu pantalla de inicio y ábrela desde ahí. En iPhone hace falta iOS 16.4 o más nuevo.';
    if (boton) boton.classList.add('hidden');
    return;
  }

  if (titulo) titulo.innerText = '🔔 Activa los avisos';
  if (texto) texto.innerText = 'Sin esto solo te enteras de una carrera si tienes la app abierta en pantalla. Con los avisos activos te suena aunque esté cerrada.';
  if (boton) boton.classList.remove('hidden');
}

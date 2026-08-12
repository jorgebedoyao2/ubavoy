/**
 * UbaVoy - Configuración de Firebase Firestore & Utilidades de Sonido y Geolocalización
 * 
 * INSTRUCCIONES:
 * Reemplaza el objeto `firebaseConfig` a continuación con las credenciales
 * obtenidas desde la Consola de Firebase.
 * URL: https://console.firebase.google.com/
 */

const firebaseConfig = {
  apiKey: "AIzaSyYOUR_API_KEY_HERE",
  authDomain: "ubavoy-app.firebaseapp.com",
  projectId: "ubavoy-app",
  storageBucket: "ubavoy-app.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};

// Coordenadas centrales por defecto para Ubaté, Cundinamarca
const UBATE_CENTER = {
  lat: 5.3081,
  lng: -73.8144,
  zoom: 15
};

// Inicialización global de Firebase Firestore
let db = null;

try {
  if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
      console.log("⚡ [UbaVoy] Firebase inicializado correctamente.");
    }
    db = firebase.firestore();
    
    // Habilitar persistencia de datos local (Modo Offline PWA)
    db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn("⚠️ Persistencia Firebase: Múltiples pestañas abiertas.");
      } else if (err.code === 'unimplemented') {
        console.warn("⚠️ Persistencia Firebase: Navegador no compatible con almacenamiento offline.");
      }
    });
  } else {
    console.error("❌ SDK de Firebase no encontrado en el entorno.");
  }
} catch (error) {
  console.warn("⚠️ Error al inicializar Firebase Firestore:", error.message);
}

/**
 * REPRODUCTOR DE ALERTA SONORA EN TIEMPO REAL (Web Audio API)
 * Emite un tono sintético tipo 'chime' para notificar nuevos pedidos al domiciliario.
 */
function playNewOrderSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // Primer tono (Agudo)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, ctx.currentTime);
    gain1.gain.setValueAtTime(0.3, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.3);

    // Segundo tono (Más agudo - 0.15s después)
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1318.51, ctx.currentTime);
      gain2.gain.setValueAtTime(0.4, ctx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime);
      osc2.stop(ctx.currentTime + 0.4);
    }, 150);

  } catch (err) {
    console.warn("No se pudo reproducir el sonido de notificación:", err);
  }
}

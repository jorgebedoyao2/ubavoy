/**
 * UbaVoy - Configuración Compartida de Firebase Firestore & Auth (Proyecto: ubavoy)
 * 
 * Incluye inicialización de Firestore y Firebase Auth con Google Auth Provider.
 */

const firebaseConfig = {
  apiKey: "AIzaSyYOUR_API_KEY_HERE",
  authDomain: "ubavoy.firebaseapp.com",
  projectId: "ubavoy",
  storageBucket: "ubavoy.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};

// Coordenadas centrales por defecto para Ubaté, Cundinamarca
const UBATE_CENTER = {
  lat: 5.3081,
  lng: -73.8144,
  zoom: 15
};

// Inicialización global de Firebase Firestore & Auth
let db = null;
let auth = null;
let googleProvider = null;

try {
  if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
      console.log("⚡ [UbaVoy Shared] Firebase (ubavoy) inicializado correctamente.");
    }
    db = firebase.firestore();

    if (firebase.auth) {
      auth = firebase.auth();
      googleProvider = new firebase.auth.GoogleAuthProvider();
      console.log("🔒 [UbaVoy Shared] Firebase Auth & Google Provider configurados.");
    }
    
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
  console.warn("⚠️ Error al inicializar Firebase Firestore/Auth:", error.message);
}

/**
 * AUTENTICACIÓN GOOGLE AUTH
 */
async function signInWithGoogle() {
  if (!auth) {
    throw new Error("SDK de Firebase Auth no disponible");
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return await auth.signInWithPopup(provider);
}

async function signOutUser() {
  if (auth) {
    await auth.signOut();
  }
}

/**
 * REPRODUCTOR DE ALERTA SONORA EN TIEMPO REAL (Web Audio API)
 */
function playNewOrderSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

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

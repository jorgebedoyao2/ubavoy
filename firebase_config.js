/**
 * UbaVoy - Configuración de Firebase Firestore
 * 
 * INSTRUCCIONES:
 * Reemplaza el objeto `firebaseConfig` a continuación con las credenciales
 * obtenidas desde la Consola de Firebase (Configuración del proyecto -> Tus aplicaciones -> Aplicación Web).
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

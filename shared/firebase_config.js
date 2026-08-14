/**
 * UbaVoy - Configuración Compartida de Firebase Firestore & Auth (Proyecto: ubavoy)
 * 
 * Incluye inicialización de Firestore, Firebase Auth con Google Auth Provider,
 * script de sembrado de datos iniciales (seedInitialFirestoreData) y trazabilidad
 * criptográfica SHA-256 (generateOrderHash).
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

// Funciones helper SDK v10 (collection, addDoc, doc, query, where, orderBy, onSnapshot) sobre Firebase Compat
function collection(dbInstance, collectionName) {
  let name = collectionName;
  let targetDb = dbInstance;

  if (typeof dbInstance === 'string' && !collectionName) {
    name = dbInstance;
    targetDb = (typeof window !== 'undefined' && window.db) ? window.db : db;
  } else if (!targetDb || typeof targetDb.collection !== 'function') {
    targetDb = (typeof window !== 'undefined' && window.db) ? window.db : db;
  }

  if (targetDb && typeof targetDb.collection === 'function') {
    return targetDb.collection(name);
  }
  return { collectionName: name, dbInstance: targetDb };
}

async function addDoc(collRef, payload) {
  if (collRef && typeof collRef.add === 'function') {
    return await collRef.add(payload);
  }
  if (typeof collRef === 'string') {
    const targetDb = (typeof window !== 'undefined' && window.db) ? window.db : db;
    return await targetDb.collection(collRef).add(payload);
  }
  if (collRef && collRef.collectionName) {
    const targetDb = collRef.dbInstance || (typeof window !== 'undefined' && window.db) ? window.db : db;
    return await targetDb.collection(collRef.collectionName).add(payload);
  }
  throw new Error("Referencia de colección Firestore no válida");
}

function doc(dbInstance, collectionName, docId) {
  let targetDb = dbInstance;
  let coll = collectionName;
  let id = docId;

  if (typeof dbInstance === 'string' && typeof collectionName === 'string' && !docId) {
    coll = dbInstance;
    id = collectionName;
    targetDb = (typeof window !== 'undefined' && window.db) ? window.db : db;
  } else if (dbInstance && typeof dbInstance.doc === 'function') {
    return dbInstance.doc(collectionName);
  }

  if (targetDb && typeof targetDb.collection === 'function') {
    return targetDb.collection(coll).doc(id);
  }
  const fallbackDb = (typeof window !== 'undefined' && window.db) ? window.db : db;
  return fallbackDb.collection(coll).doc(id);
}

function query(collRef, ...queryConstraints) {
  let q = collRef;
  for (const constraint of queryConstraints) {
    if (typeof constraint === 'function') {
      q = constraint(q);
    }
  }
  return q;
}

function where(fieldPath, opStr, value) {
  return (q) => q.where(fieldPath, opStr, value);
}

function orderBy(fieldPath, directionStr = 'asc') {
  return (q) => q.orderBy(fieldPath, directionStr);
}

function onSnapshot(target, onNext, onError) {
  if (target && typeof target.onSnapshot === 'function') {
    return target.onSnapshot((snap) => {
      onNext(snap);
    }, onError);
  }
  console.warn("Target de onSnapshot no es válido:", target);
  return () => {};
}

if (typeof window !== 'undefined') {
  window.collection = collection;
  window.addDoc = addDoc;
  window.doc = doc;
  window.query = query;
  window.where = where;
  window.orderBy = orderBy;
  window.onSnapshot = onSnapshot;
}

try {
  if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
      console.log("⚡ [UbaVoy Shared] Firebase (ubavoy) inicializado correctamente.");
    }
    db = firebase.firestore();
    window.db = db;

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

    // Invocación automática de sembrado de datos iniciales al arrancar
    setTimeout(() => {
      seedInitialFirestoreData();
    }, 800);

  } else {
    console.error("❌ SDK de Firebase no encontrado en el entorno.");
  }
} catch (error) {
  console.warn("⚠️ Error al inicializar Firebase Firestore/Auth:", error.message);
}

/**
 * GENERADOR DE HASH DE SEGURIDAD Y TRAZABILIDAD CRIPTOGRÁFICA (SHA-256)
 */
async function generateOrderHash(orderData) {
  try {
    const rawString = `${orderData.client_phone}-${orderData.delivery_pin}-${orderData.created_at}-UBAVOY_SECRET_SALT_2026`;
    const encoder = new TextEncoder();
    const data = encoder.encode(rawString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 24).toUpperCase();
  } catch (e) {
    console.error("Error generando hash SHA-256:", e);
    return 'HASH-' + Math.random().toString(36).substring(2, 14).toUpperCase();
  }
}

/**
 * SEMBRADO DE DATOS INICIALES EN FIRESTORE (seedInitialFirestoreData)
 */
async function seedInitialFirestoreData() {
  if (!db || firebaseConfig.apiKey === "AIzaSyYOUR_API_KEY_HERE") {
    console.log("ℹ️ [UbaVoy Seeding] Modo Demo Local activo o API Key pendiente por configurar.");
    return;
  }

  try {
    // A) COLECCIÓN 'users'
    const adminRef = db.collection('users').doc('admin_system');
    const adminDoc = await adminRef.get();
    if (!adminDoc.exists) {
      await adminRef.set({
        name: 'Administrador UbaVoy',
        phone: '3000000000',
        role: 'admin',
        is_approved: true,
        created_at: firebase.firestore.Timestamp.now()
      });
    }

    const driverRef = db.collection('users').doc('driver_demo');
    const driverDoc = await driverRef.get();
    if (!driverDoc.exists) {
      await driverRef.set({
        name: 'Domiciliario Demo',
        phone: '3100000000',
        role: 'driver',
        balance: 10000,
        is_approved: true,
        vehicle: 'Moto',
        created_at: firebase.firestore.Timestamp.now()
      });
    }

    // B) COLECCIÓN 'orders'
    const orderRef = db.collection('orders').doc('order_demo_001');
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) {
      const demoCreatedAt = new Date().toISOString();
      const demoHash = await generateOrderHash({ client_phone: '3000000000', delivery_pin: '1234', created_at: demoCreatedAt });
      await orderRef.set({
        id: 'order_demo_001',
        client_phone: '3000000000',
        task_description: 'Pedido de prueba inicial UbaVoy',
        delivery_address: 'Plaza de Mercado, Ubaté',
        delivery_coords: { lat: UBATE_CENTER.lat, lng: UBATE_CENTER.lng },
        estimated_price: 5000,
        status: 'pending',
        delivery_pin: '1234',
        security_hash: demoHash,
        created_at: firebase.firestore.Timestamp.now()
      });
    }

    // C) COLECCIÓN 'system_config'
    const configRef = db.collection('system_config').doc('settings');
    const configDoc = await configRef.get();
    if (!configDoc.exists) {
      await configRef.set({
        commission_per_race: 500,
        platform_name: 'UbaVoy Ubaté',
        active_status: true,
        created_at: firebase.firestore.Timestamp.now()
      });
    }

    console.log("⚡ Colecciones de Firestore (users, orders, system_config) verificadas e inicializadas correctamente.");

  } catch (err) {
    console.warn("⚠️ [Seeding Warning] No se pudieron inicializar los documentos base en Firestore:", err.message);
  }
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

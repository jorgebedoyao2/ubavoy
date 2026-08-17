import { readFileSync } from 'fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore';

const RULES = readFileSync('firestore.rules', 'utf8');

const testEnv = await initializeTestEnvironment({
  projectId: 'demo-ubavoy',
  firestore: { rules: RULES, host: '127.0.0.1', port: 8099 },
});

// ---------- Semilla de datos (saltándose las reglas) ----------
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users/cliente1'), { role: 'client', balance: 0, is_approved: false, name: 'Ana' });
  await setDoc(doc(db, 'users/driverOK'), { role: 'driver', balance: 10000, is_approved: true, name: 'Carlos', email: 'driverok@gmail.com' });
  await setDoc(doc(db, 'users/driverPobre'), { role: 'driver', balance: 300, is_approved: true, name: 'Luis', email: 'pobre@gmail.com' });
  await setDoc(doc(db, 'users/driverNoAprob'), { role: 'driver', balance: 5000, is_approved: false, name: 'Pedro', email: 'noaprob@gmail.com' });
  // Lista blanca: solo estos correos pagaron su paquete.
  await setDoc(doc(db, 'autorizados/driverok@gmail.com'), { activo: true, nombre: 'Carlos' });
  await setDoc(doc(db, 'autorizados/pobre@gmail.com'), { activo: true, nombre: 'Luis' });
  await setDoc(doc(db, 'users/adminUid'), { role: 'admin', balance: 0, is_approved: true, name: 'Jorge' });

  await setDoc(doc(db, 'orders/pedidoLibre'), {
    client_uid: 'cliente1', client_phone: '3001112222', status: 'pending',
    estimated_price: 5000, delivery_pin: '4821',
    delivery_coords: { lat: 5.3081, lng: -73.8144 },
    delivery_address: 'Plaza Principal Ubaté', task_description: 'Farmacia',
    created_at: '2026-08-15T10:00:00Z',
  });
  await setDoc(doc(db, 'orders/pedidoTomado'), {
    client_uid: 'cliente1', client_phone: '3001112222', status: 'assigned',
    assigned_driver_id: 'driverOK', estimated_price: 5000, delivery_pin: '9999',
    delivery_coords: { lat: 5.3081, lng: -73.8144 },
    delivery_address: 'Calle 5', task_description: 'Mercado',
    created_at: '2026-08-15T09:00:00Z',
  });
});

const anon      = testEnv.unauthenticatedContext().firestore();
const cliente1  = testEnv.authenticatedContext('cliente1').firestore();
const cliente2  = testEnv.authenticatedContext('cliente2').firestore();
const driverOK  = testEnv.authenticatedContext('driverOK', { email: 'driverok@gmail.com' }).firestore();
const driverPobre = testEnv.authenticatedContext('driverPobre', { email: 'pobre@gmail.com' }).firestore();
const driverNoAprob = testEnv.authenticatedContext('driverNoAprob', { email: 'noaprob@gmail.com' }).firestore();
const admin     = testEnv.authenticatedContext('adminUid').firestore();

let pass = 0, fail = 0;
async function check(nombre, fn) {
  try { await fn(); console.log(`  OK   ${nombre}`); pass++; }
  catch (e) { console.log(`  FALLA ${nombre}\n        -> ${String(e.message).slice(0, 150)}`); fail++; }
}

console.log('\n=== 1. El hueco confirmado en vivo: lectura anónima ===');
await check('Visitante anónimo NO puede leer la colección de pedidos', () =>
  assertFails(getDocs(collection(anon, 'orders'))));
await check('Visitante anónimo NO puede leer un pedido puntual', () =>
  assertFails(getDoc(doc(anon, 'orders/pedidoLibre'))));
await check('Visitante anónimo NO puede leer perfiles de usuarios', () =>
  assertFails(getDoc(doc(anon, 'users/driverOK'))));

console.log('\n=== 2. Saldo infinito (borrar el navegador = recargarse) ===');
await check('Domiciliario NO puede subirse el saldo a 999999', () =>
  assertFails(updateDoc(doc(driverOK, 'users/driverOK'), { balance: 999999 })));
await check('Domiciliario NO puede descontarse menos de lo debido (500)', () =>
  assertFails(updateDoc(doc(driverOK, 'users/driverOK'), { balance: 10000 - 500 })));
await check('Domiciliario SÍ puede descontarse exactamente 1000 (comisión real)', () =>
  assertSucceeds(updateDoc(doc(driverOK, 'users/driverOK'), { balance: 10000 - 1000 })));
await check('Domiciliario sin saldo suficiente NO puede cobrarse', () =>
  assertFails(updateDoc(doc(driverPobre, 'users/driverPobre'), { balance: 300 - 1000 })));
await check('Domiciliario NO puede tocar el saldo de OTRO domiciliario', () =>
  assertFails(updateDoc(doc(driverPobre, 'users/driverOK'), { balance: 9500 })));

console.log('\n=== 3. Escalada de privilegios ===');
await check('Cliente NO puede autoproclamarse admin', () =>
  assertFails(updateDoc(doc(cliente1, 'users/cliente1'), { role: 'admin' })));
await check('Domiciliario NO puede auto-aprobarse', () =>
  assertFails(updateDoc(doc(driverNoAprob, 'users/driverNoAprob'), { is_approved: true })));
await check('Nadie se registra directamente como admin', () =>
  assertFails(setDoc(doc(cliente2, 'users/cliente2'), { role: 'admin', balance: 0, is_approved: false })));
await check('Admin SÍ puede aprobar a un domiciliario', () =>
  assertSucceeds(updateDoc(doc(admin, 'users/driverNoAprob'), { is_approved: true })));
await check('Admin SÍ puede acreditar saldo', () =>
  assertSucceeds(updateDoc(doc(admin, 'users/driverPobre'), { balance: 20000 })));

console.log('\n=== 4. Doble asignación de la misma carrera ===');
await check('Domiciliario aprobado SÍ puede tomar un pedido libre', () =>
  assertSucceeds(updateDoc(doc(driverOK, 'orders/pedidoLibre'), {
    status: 'assigned', assigned_driver_id: 'driverOK',
    client_uid: 'cliente1', estimated_price: 5000,
  })));
await check('Segundo domiciliario NO puede robar un pedido ya asignado', () =>
  assertFails(updateDoc(doc(driverPobre, 'orders/pedidoTomado'), {
    status: 'assigned', assigned_driver_id: 'driverPobre',
    client_uid: 'cliente1', estimated_price: 5000,
  })));
await check('Domiciliario NO aprobado no puede tomar carreras', () =>
  assertFails(updateDoc(doc(driverNoAprob, 'orders/pedidoTomado'), {
    status: 'assigned', assigned_driver_id: 'driverNoAprob',
    client_uid: 'cliente1', estimated_price: 5000,
  })));
await check('Domiciliario NO puede asignarse el pedido a nombre de otro', () =>
  assertFails(updateDoc(doc(driverPobre, 'orders/pedidoLibre'), {
    status: 'assigned', assigned_driver_id: 'driverOK',
    client_uid: 'cliente1', estimated_price: 5000,
  })));

console.log('\n=== 5. Integridad de los pedidos ===');
await check('Cliente NO puede crear un pedido con precio inventado ($100)', () =>
  assertFails(setDoc(doc(cliente1, 'orders/trampa1'), {
    client_uid: 'cliente1', status: 'pending', estimated_price: 100,
    delivery_pin: '1234', delivery_coords: { lat: 5.3, lng: -73.8 },
  })));
await check('Cliente NO puede crear un pedido a nombre de otro', () =>
  assertFails(setDoc(doc(cliente1, 'orders/trampa2'), {
    client_uid: 'cliente2', status: 'pending', estimated_price: 5000,
    delivery_pin: '1234', delivery_coords: { lat: 5.3, lng: -73.8 },
  })));
await check('Cliente NO puede crear un pedido sin coordenadas reales', () =>
  assertFails(setDoc(doc(cliente1, 'orders/trampa3'), {
    client_uid: 'cliente1', status: 'pending', estimated_price: 5000,
    delivery_pin: '1234', delivery_coords: { lat: 'x', lng: null },
  })));
await check('Cliente NO puede crearse un pedido ya asignado', () =>
  assertFails(setDoc(doc(cliente1, 'orders/trampa4'), {
    client_uid: 'cliente1', status: 'pending', estimated_price: 5000,
    delivery_pin: '1234', delivery_coords: { lat: 5.3, lng: -73.8 },
    assigned_driver_id: 'driverOK',
  })));
await check('Cliente SÍ puede crear un pedido válido', () =>
  assertSucceeds(setDoc(doc(cliente1, 'orders/bueno1'), {
    client_uid: 'cliente1', status: 'pending', estimated_price: 5000,
    delivery_pin: '4821', delivery_coords: { lat: 5.3081, lng: -73.8144 },
    delivery_address: 'Cra 7 #5-20', task_description: 'Droguería',
    created_at: '2026-08-15T12:00:00Z',
  })));
await check('Cliente NO puede leer el pedido de otro cliente', () =>
  assertFails(getDoc(doc(cliente2, 'orders/pedidoLibre'))));
await check('Nadie puede borrar un pedido (historial contable)', () =>
  assertFails(updateDoc(doc(cliente1, 'orders/pedidoTomado'), { status: 'cancelled' })));

console.log('\n=== 3b. Arranque del administrador por correo ===');
const dueno = testEnv.authenticatedContext('uidJorge', {
  email: 'devsites02@gmail.com', email_verified: true,
}).firestore();
// Este es el caso que fallaba en producción: token sin email_verified.
const duenoSinVerificar = testEnv.authenticatedContext('uidJorge', {
  email: 'devsites02@gmail.com',
}).firestore();
const duenoMayusculas = testEnv.authenticatedContext('uidJorge', {
  email: 'DevSites02@Gmail.com',
}).firestore();
const impostor = testEnv.authenticatedContext('uidMalo', {
  email: 'otro@gmail.com', email_verified: true,
}).firestore();

await check('El dueño manda aunque NO tenga documento en users', () =>
  assertSucceeds(getDocs(collection(dueno, 'orders'))));
await check('El dueño lista domiciliarios (la consulta del panel)', () =>
  assertSucceeds(getDocs(query(collection(dueno, 'users'), where('role', '==', 'driver')))));
await check('El dueño entra aunque el token no traiga email_verified', () =>
  assertSucceeds(getDocs(query(collection(duenoSinVerificar, 'users'), where('role', '==', 'driver')))));
await check('El correo del dueño en MAYÚSCULAS también entra', () =>
  assertSucceeds(getDocs(collection(duenoMayusculas, 'users'))));
await check('El dueño SÍ puede aprobar domiciliarios de entrada', () =>
  assertSucceeds(updateDoc(doc(dueno, 'users/driverNoAprob'), { is_approved: true })));
await check('Otro correo cualquiera NO es admin', () =>
  assertFails(getDocs(collection(impostor, 'users'))));

console.log('\n=== 3c. Habilitación de domiciliarios por correo (quien pagó) ===');
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  await setDoc(doc(d, 'users/driverPago'), { role: 'driver', balance: 10000, is_approved: true, email: 'pago@gmail.com' });
  await setDoc(doc(d, 'users/driverMoroso'), { role: 'driver', balance: 10000, is_approved: true, email: 'moroso@gmail.com' });
  await setDoc(doc(d, 'autorizados/pago@gmail.com'), { activo: true, nombre: 'Carlos', paquete: '10 domicilios' });
  await setDoc(doc(d, 'autorizados/moroso@gmail.com'), { activo: false, nombre: 'Luis', paquete: 'vencido' });
});

const conPago = testEnv.authenticatedContext('driverPago', { email: 'pago@gmail.com' }).firestore();
const sinPago = testEnv.authenticatedContext('driverMoroso', { email: 'moroso@gmail.com' }).firestore();
const nuncaAutorizado = testEnv.authenticatedContext('driverPago', { email: 'colado@gmail.com' }).firestore();

await check('Domiciliario con correo habilitado SÍ ve la bolsa de carreras', () =>
  assertSucceeds(getDocs(collection(conPago, 'orders'))));
await check('Domiciliario DESACTIVADO por el admin ya NO ve carreras', () =>
  assertFails(getDocs(collection(sinPago, 'orders'))));
await check('Correo que nunca fue autorizado NO ve carreras', () =>
  assertFails(getDocs(collection(nuncaAutorizado, 'orders'))));
await check('Aunque is_approved siga en true, manda la habilitación por correo', () =>
  assertFails(getDocs(collection(sinPago, 'orders'))));
await check('Cada quien puede consultar SU propia habilitación', () =>
  assertSucceeds(getDoc(doc(conPago, 'autorizados/pago@gmail.com'))));
await check('Nadie puede espiar la habilitación de OTRO correo', () =>
  assertFails(getDoc(doc(conPago, 'autorizados/moroso@gmail.com'))));
await check('Un domiciliario NO puede auto-habilitarse', () =>
  assertFails(setDoc(doc(sinPago, 'autorizados/moroso@gmail.com'), { activo: true })));
await check('Un domiciliario NO puede listar todos los autorizados', () =>
  assertFails(getDocs(collection(conPago, 'autorizados'))));
await check('El admin SÍ habilita un correo nuevo', () =>
  assertSucceeds(setDoc(doc(dueno, 'autorizados/nuevo@gmail.com'), { activo: true, nombre: 'Ana' })));
await check('El admin SÍ puede desactivar a quien no renovó', () =>
  assertSucceeds(updateDoc(doc(dueno, 'autorizados/pago@gmail.com'), { activo: false })));

console.log('\n=== 6b. Ubicación en vivo y novedades ===');
await check('Domiciliario asignado SÍ puede compartir su ubicación', () =>
  assertSucceeds(updateDoc(doc(driverOK, 'orders/pedidoTomado'), {
    driver_coords: { lat: 5.31, lng: -73.82, accuracy: 12 },
    driver_coords_at: '2026-08-15T13:00:00Z',
  })));
await check('Domiciliario asignado SÍ puede avisar una novedad', () =>
  assertSucceeds(updateDoc(doc(driverOK, 'orders/pedidoTomado'), {
    driver_novedad: 'Me demoro 5 minutos', driver_novedad_at: '2026-08-15T13:01:00Z',
  })));
await check('Otro domiciliario NO puede falsear la ubicación de esa carrera', () =>
  assertFails(updateDoc(doc(driverPobre, 'orders/pedidoTomado'), {
    driver_coords: { lat: 0, lng: 0 },
  })));
await check('Domiciliario NO puede subirse el precio con la novedad', () =>
  assertFails(updateDoc(doc(driverOK, 'orders/pedidoTomado'), {
    driver_novedad: 'ok', estimated_price: 90000,
  })));
await check('Domiciliario NO puede cambiar el PIN de entrega', () =>
  assertFails(updateDoc(doc(driverOK, 'orders/pedidoTomado'), { delivery_pin: '0000' })));
await check('Cliente SÍ puede leer la ubicación de su domiciliario', () =>
  assertSucceeds(getDoc(doc(cliente1, 'orders/pedidoTomado'))));

console.log('\n=== 8. Códigos promocionales de un solo uso ===');
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  await setDoc(doc(d, 'promociones/PROMOLIBRE'), {
    codigo: 'PROMOLIBRE', domicilios: 10, activo: true, usado_por: null,
  });
  await setDoc(doc(d, 'promociones/PROMOQUEMADA'), {
    codigo: 'PROMOQUEMADA', domicilios: 10, activo: true,
    usado_por: 'driverPobre', usado_en: '2026-08-16T10:00:00Z',
  });
});

await check('El domiciliario SÍ puede consultar un código que conoce', () =>
  assertSucceeds(getDoc(doc(driverOK, 'promociones/PROMOLIBRE'))));
await check('El domiciliario NO puede listar todos los códigos', () =>
  assertFails(getDocs(collection(driverOK, 'promociones'))));
await check('El domiciliario NO puede crear códigos', () =>
  assertFails(setDoc(doc(driverOK, 'promociones/INVENTADO'),
    { codigo: 'INVENTADO', domicilios: 50, activo: true, usado_por: null })));
await check('El domiciliario NO puede quemar un código a su favor', () =>
  assertFails(updateDoc(doc(driverOK, 'promociones/PROMOLIBRE'),
    { usado_por: 'driverOK' })));
await check('El domiciliario NO puede subirle los domicilios a un código', () =>
  assertFails(updateDoc(doc(driverOK, 'promociones/PROMOLIBRE'), { domicilios: 100 })));

await check('El admin SÍ puede crear un código', () =>
  assertSucceeds(setDoc(doc(dueno, 'promociones/BIENVENIDA20'),
    { codigo: 'BIENVENIDA20', domicilios: 20, activo: true, usado_por: null })));
await check('El admin SÍ puede consumir un código libre', () =>
  assertSucceeds(updateDoc(doc(dueno, 'promociones/PROMOLIBRE'),
    { usado_por: 'driverOK', usado_en: '2026-08-17T10:00:00Z', domicilios: 10 })));

console.log('   -- La garantía del uso único --');
await check('NADIE puede volver a usar un código ya quemado, ni el admin', () =>
  assertFails(updateDoc(doc(dueno, 'promociones/PROMOQUEMADA'),
    { usado_por: 'driverOK', domicilios: 10 })));
await check('Un código quemado tampoco se puede reactivar', () =>
  assertFails(updateDoc(doc(dueno, 'promociones/PROMOQUEMADA'), { activo: true })));
await check('Un código quemado no se puede borrar para reciclarlo', () =>
  assertFails(deleteDoc(doc(dueno, 'promociones/PROMOQUEMADA'))));
await check('El admin NO puede crear un código ya marcado como usado', () =>
  assertFails(setDoc(doc(dueno, 'promociones/TRAMPA'),
    { codigo: 'TRAMPA', domicilios: 10, activo: true, usado_por: 'driverOK' })));
await check('El admin NO puede crear un código de 500 domicilios', () =>
  assertFails(setDoc(doc(dueno, 'promociones/ENORME'),
    { codigo: 'ENORME', domicilios: 500, activo: true, usado_por: null })));

console.log('\n=== 7. Chat interno y efímero ===');
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  await setDoc(doc(d, 'chats/pedidoTomado'), {
    cliente_uid: 'cliente1', domiciliario_uid: 'driverOK', creado_en: new Date().toISOString(),
  });
});

const futuro = new Date(Date.now() + 3600e3);
const msg = (remitente, autor, texto) => ({
  remitente, autor_uid: autor, texto, creado_en: new Date(), expira_en: futuro,
});

await check('El cliente SÍ puede escribir en el chat de SU pedido', () =>
  assertSucceeds(setDoc(doc(cliente1, 'chats/pedidoTomado/mensajes/m1'),
    msg('cliente', 'cliente1', 'Hola, estoy en el segundo piso'))));
await check('El domiciliario asignado SÍ puede responder', () =>
  assertSucceeds(setDoc(doc(driverOK, 'chats/pedidoTomado/mensajes/m2'),
    msg('domiciliario', 'driverOK', 'Voy llegando en 5 minutos'))));
await check('Ambos SÍ pueden leer la conversación', () =>
  assertSucceeds(getDocs(collection(cliente1, 'chats/pedidoTomado/mensajes'))));

await check('Un tercero NO puede leer la conversación', () =>
  assertFails(getDocs(collection(cliente2, 'chats/pedidoTomado/mensajes'))));
await check('Otro domiciliario NO puede leer la conversación', () =>
  assertFails(getDocs(collection(driverPobre, 'chats/pedidoTomado/mensajes'))));
await check('Un visitante anónimo NO puede leer la conversación', () =>
  assertFails(getDocs(collection(anon, 'chats/pedidoTomado/mensajes'))));
await check('Un tercero NO puede escribir en el chat', () =>
  assertFails(setDoc(doc(cliente2, 'chats/pedidoTomado/mensajes/intruso'),
    msg('cliente', 'cliente2', 'Mensaje colado'))));

await check('BLOQUEA enviar un número de teléfono', () =>
  assertFails(setDoc(doc(cliente1, 'chats/pedidoTomado/mensajes/tel'),
    msg('cliente', 'cliente1', 'Llámame al 3125559090 y arreglamos por fuera'))));
await check('BLOQUEA enviar un número de cuenta para pagar por fuera', () =>
  assertFails(setDoc(doc(driverOK, 'chats/pedidoTomado/mensajes/nequi'),
    msg('domiciliario', 'driverOK', 'Consigna a la cuenta 30011122233'))));
await check('PERMITE direcciones con números cortos', () =>
  assertSucceeds(setDoc(doc(cliente1, 'chats/pedidoTomado/mensajes/dir'),
    msg('cliente', 'cliente1', 'Es la Calle 9 # 6-20, apto 302'))));

await check('BLOQUEA adjuntar una imagen al mensaje', () =>
  assertFails(setDoc(doc(cliente1, 'chats/pedidoTomado/mensajes/img'), {
    remitente: 'cliente', autor_uid: 'cliente1', texto: 'mira',
    creado_en: new Date(), expira_en: futuro, imagen: 'data:image/jpeg;base64,AAAA',
  })));
await check('BLOQUEA adjuntar un audio al mensaje', () =>
  assertFails(setDoc(doc(driverOK, 'chats/pedidoTomado/mensajes/aud'), {
    remitente: 'domiciliario', autor_uid: 'driverOK', texto: 'oye',
    creado_en: new Date(), expira_en: futuro, audio_url: 'https://x/a.mp3',
  })));
await check('BLOQUEA un mensaje sin fecha de expiración', () =>
  assertFails(setDoc(doc(cliente1, 'chats/pedidoTomado/mensajes/eterno'), {
    remitente: 'cliente', autor_uid: 'cliente1', texto: 'para siempre', creado_en: new Date(),
  })));
await check('BLOQUEA un mensaje de más de 500 caracteres', () =>
  assertFails(setDoc(doc(cliente1, 'chats/pedidoTomado/mensajes/largo'),
    msg('cliente', 'cliente1', 'x'.repeat(501)))));

await check('El cliente NO puede hacerse pasar por el domiciliario', () =>
  assertFails(setDoc(doc(cliente1, 'chats/pedidoTomado/mensajes/falso'),
    msg('domiciliario', 'cliente1', 'Soy el domiciliario'))));
await check('NO se puede firmar un mensaje con el uid de otro', () =>
  assertFails(setDoc(doc(cliente1, 'chats/pedidoTomado/mensajes/falso2'),
    msg('cliente', 'driverOK', 'Mensaje suplantado'))));
await check('Un mensaje enviado NO se puede editar', () =>
  assertFails(updateDoc(doc(cliente1, 'chats/pedidoTomado/mensajes/m1'), { texto: 'cambiado' })));
await check('SÍ se puede adelantar la expiración (borrado al entregar)', () =>
  assertSucceeds(updateDoc(doc(driverOK, 'chats/pedidoTomado/mensajes/m1'),
    { expira_en: new Date(Date.now() + 600e3) })));
await check('Un participante SÍ puede borrar la conversación', () =>
  assertSucceeds(deleteDoc(doc(driverOK, 'chats/pedidoTomado/mensajes/m2'))));

console.log('\n=== 6. Recargas de saldo ===');
await check('Domiciliario NO puede crear una recarga ya aprobada', () =>
  assertFails(setDoc(doc(driverOK, 'recharges/r1'), {
    driver_id: 'driverOK', amount: 10000, status: 'approved',
  })));
await check('Domiciliario SÍ puede solicitar una recarga pendiente', () =>
  assertSucceeds(setDoc(doc(driverOK, 'recharges/r2'), {
    driver_id: 'driverOK', amount: 10000, status: 'pending',
    created_at: '2026-08-15T12:00:00Z',
  })));
await check('Domiciliario NO puede aprobar su propia recarga', () =>
  assertFails(updateDoc(doc(driverOK, 'recharges/r2'), { status: 'approved' })));
await check('Admin SÍ puede aprobar la recarga', () =>
  assertSucceeds(updateDoc(doc(admin, 'recharges/r2'), { status: 'approved' })));

console.log(`\n${'='.repeat(52)}`);
console.log(`RESULTADO: ${pass} pasaron, ${fail} fallaron`);
console.log('='.repeat(52));
await testEnv.cleanup();
process.exit(fail > 0 ? 1 : 0);

import { readFileSync } from 'fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from 'firebase/firestore';

const RULES = readFileSync('firestore.rules', 'utf8');

const testEnv = await initializeTestEnvironment({
  projectId: 'demo-ubavoy',
  firestore: { rules: RULES, host: '127.0.0.1', port: 8099 },
});

// ---------- Semilla de datos (saltándose las reglas) ----------
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users/cliente1'), { role: 'client', balance: 0, is_approved: false, name: 'Ana' });
  await setDoc(doc(db, 'users/driverOK'), { role: 'driver', balance: 10000, is_approved: true, name: 'Carlos' });
  await setDoc(doc(db, 'users/driverPobre'), { role: 'driver', balance: 300, is_approved: true, name: 'Luis' });
  await setDoc(doc(db, 'users/driverNoAprob'), { role: 'driver', balance: 5000, is_approved: false, name: 'Pedro' });
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
const driverOK  = testEnv.authenticatedContext('driverOK').firestore();
const driverPobre = testEnv.authenticatedContext('driverPobre').firestore();
const driverNoAprob = testEnv.authenticatedContext('driverNoAprob').firestore();
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
await check('Domiciliario NO puede descontarse menos de lo debido (100)', () =>
  assertFails(updateDoc(doc(driverOK, 'users/driverOK'), { balance: 10000 - 100 })));
await check('Domiciliario SÍ puede descontarse exactamente 500 (cobro real)', () =>
  assertSucceeds(updateDoc(doc(driverOK, 'users/driverOK'), { balance: 10000 - 500 })));
await check('Domiciliario sin saldo suficiente NO puede cobrarse', () =>
  assertFails(updateDoc(doc(driverPobre, 'users/driverPobre'), { balance: 300 - 500 })));
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

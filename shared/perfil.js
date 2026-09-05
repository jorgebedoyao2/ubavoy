/**
 * UbaVoy - Perfil del cliente guardado en la cuenta, no en el navegador
 * ============================================================================
 * Antes el teléfono y las direcciones favoritas vivían solo en localStorage.
 * Eso significa que se perdían al cambiar de celular, al reinstalar la app o
 * al limpiar los datos del navegador, y que la misma persona era "otra"
 * en cada dispositivo. Ahora viven en users/{uid}, atados a la cuenta.
 *
 * Se conserva localStorage como copia local: la app abre al instante con lo
 * último conocido y no se ve vacía mientras Firestore responde. Firestore
 * manda cuando llega.
 *
 * LO QUE LAS REGLAS PERMITEN Y ESTE ARCHIVO RESPETA:
 * users/{uid} deja que cada quien edite sus datos de contacto, pero nunca su
 * rol, su aprobación ni su saldo. Por eso al guardar solo se envían los
 * campos del perfil; el rol se manda únicamente al crear el documento, que
 * es el único momento en que las reglas lo aceptan.
 */

const PERFIL_CAMPOS_LOCALES = 'ubavoy_client_user';
const PERFIL_CAMPOS_DIRECCIONES = 'ubavoy_saved_addresses';

function perfilDb() {
  return (typeof db !== 'undefined' && db) ? db : window.db;
}

function perfilTelefonoValido(valor) {
  const solo = (valor || '').replace(/\D/g, '');
  return solo.length >= 7 && solo.length <= 12 ? solo : null;
}

/**
 * Trae el perfil de la cuenta. Devuelve null si no hay documento todavía o
 * si Firestore no responde: quien llama sigue con lo que tenga local.
 */
async function perfilCargar(uid) {
  const base = perfilDb();
  if (!base || !uid) return null;

  try {
    const snap = await base.collection('users').doc(uid).get();
    const existe = typeof snap.exists === 'function' ? snap.exists() : snap.exists;
    if (!existe) return null;

    const datos = snap.data() || {};
    return {
      nombre: datos.name || '',
      telefono: datos.phone || '',
      direcciones: Array.isArray(datos.direcciones) ? datos.direcciones : null,
    };
  } catch (e) {
    console.error('Perfil: no se pudo leer', e);
    return null;
  }
}

/**
 * Guarda los datos de contacto. Nunca envía role, balance ni is_approved
 * sobre un documento existente: las reglas rechazarían la escritura entera
 * y se perdería también lo que sí era válido.
 */
async function perfilGuardar(uid, cambios) {
  const base = perfilDb();
  if (!base || !uid) return false;

  const carga = { updated_at: new Date().toISOString() };
  if (typeof cambios.nombre === 'string' && cambios.nombre.trim()) {
    carga.name = cambios.nombre.trim().slice(0, 80);
  }
  if (cambios.telefono !== undefined) {
    const limpio = perfilTelefonoValido(cambios.telefono);
    if (!limpio) return false;
    carga.phone = limpio;
  }
  if (Array.isArray(cambios.direcciones)) {
    // Se acotan: son datos que el usuario controla y no deben poder crecer
    // sin límite dentro de un documento.
    carga.direcciones = cambios.direcciones.slice(0, 10).map((d) => ({
      title: String(d.title || '').slice(0, 40),
      address: String(d.address || '').slice(0, 120),
      lat: Number(d.lat) || 0,
      lng: Number(d.lng) || 0,
    }));
  }

  try {
    const ref = base.collection('users').doc(uid);
    const snap = await ref.get();
    const existe = typeof snap.exists === 'function' ? snap.exists() : snap.exists;

    if (!existe) {
      // Al crear, las reglas exigen un rol válido y prohíben nacer con saldo
      // o aprobado. Se cumple explícitamente.
      carga.role = 'client';
      carga.balance = 0;
      carga.is_approved = false;
    }

    await ref.set(carga, { merge: true });
    return true;
  } catch (e) {
    console.error('Perfil: no se pudo guardar', e);
    return false;
  }
}

/** Copia local, para que la app no abra vacía mientras Firestore responde. */
function perfilGuardarLocal(cliente, direcciones) {
  try {
    if (cliente) localStorage.setItem(PERFIL_CAMPOS_LOCALES, JSON.stringify(cliente));
    if (direcciones) localStorage.setItem(PERFIL_CAMPOS_DIRECCIONES, JSON.stringify(direcciones));
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Ventana de "Mi perfil"
// ---------------------------------------------------------------------------

function perfilAbrir() {
  const usuario = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
  if (!usuario) {
    if (typeof showToast === 'function') {
      showToast('Entra con tu cuenta para ver tu perfil.', 'error');
    }
    return;
  }

  const panel = document.getElementById('perfilPanel');
  if (!panel) return;

  const nombre = document.getElementById('perfilNombre');
  const telefono = document.getElementById('perfilTelefono');
  const correo = document.getElementById('perfilCorreo');

  if (correo) correo.innerText = usuario.email || '';
  if (nombre) nombre.value = (typeof currentClient !== 'undefined' && currentClient.name) || usuario.displayName || '';
  if (telefono) telefono.value = (typeof currentClient !== 'undefined' && currentClient.phone) || '';

  panel.classList.remove('hidden');
  panel.classList.add('flex');
}

function perfilCerrar() {
  const panel = document.getElementById('perfilPanel');
  if (!panel) return;
  panel.classList.add('hidden');
  panel.classList.remove('flex');
}

async function perfilGuardarDesdeFormulario() {
  const usuario = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
  if (!usuario) return;

  const boton = document.getElementById('perfilGuardarBtn');
  const nombre = (document.getElementById('perfilNombre') || {}).value || '';
  const telefono = (document.getElementById('perfilTelefono') || {}).value || '';

  if (!perfilTelefonoValido(telefono)) {
    if (typeof showToast === 'function') {
      showToast('Escribe un número de celular válido.', 'error');
    }
    return;
  }

  if (boton) { boton.disabled = true; boton.innerText = 'Guardando...'; }

  const ok = await perfilGuardar(usuario.uid, { nombre, telefono });

  if (boton) { boton.disabled = false; boton.innerText = 'Guardar cambios'; }

  if (!ok) {
    if (typeof showToast === 'function') showToast('No se pudo guardar tu perfil.', 'error');
    return;
  }

  if (typeof currentClient !== 'undefined') {
    currentClient.name = nombre.trim() || currentClient.name;
    currentClient.phone = perfilTelefonoValido(telefono);
    perfilGuardarLocal(currentClient, null);
    if (typeof updateHeaderUserUI === 'function') updateHeaderUserUI();
  }

  // El formulario de pedido usa este campo; si no se refresca, la persona
  // guarda su número y aun así el pedido sale con el anterior.
  const campoPedido = document.getElementById('clientPhone');
  if (campoPedido) campoPedido.value = perfilTelefonoValido(telefono);

  if (typeof showToast === 'function') showToast('✅ Perfil guardado en tu cuenta.');
  perfilCerrar();
}

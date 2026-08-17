/**
 * UbaVoy - Chat interno y efímero entre cliente y domiciliario
 * ============================================================================
 * Se usa igual desde la app del cliente y la del domiciliario. La única
 * diferencia es el color y quién es "yo".
 *
 * DECISIONES DE COSTO (proyecto en plan gratuito de Firebase):
 *
 *  - El listener se abre SOLO mientras la ventana del chat está abierta y se
 *    cierra al salir. Un listener abierto todo el día cobra lecturas por cada
 *    mensaje aunque nadie esté mirando.
 *  - La consulta trae como máximo los últimos 60 mensajes. Una conversación de
 *    una entrega no llega ni cerca, pero así el costo tiene techo.
 *  - Solo texto. Nada de fotos ni audios: eso obligaría a usar Firebase
 *    Storage, que exige plan de pago, y consumiría los datos del celular del
 *    domiciliario.
 *  - Los mensajes nacen con fecha de expiración, así la base no crece para
 *    siempre. Ver notas de borrado al final del archivo.
 *
 * DECISIONES DE SEGURIDAD:
 *
 *  - Nada de lo que hay aquí es la protección real: todo se valida además en
 *    firestore.rules, que corre en los servidores de Google. Este archivo solo
 *    hace que la experiencia sea clara.
 *  - Se bloquean números largos (teléfonos, cuentas) para evitar que el
 *    negocio se salga de la plataforma o que alguien presione al cliente por
 *    fuera. La regla del servidor lo bloquea igual.
 */

const CHAT_LIMITE_MENSAJES = 60;
const CHAT_MAX_CARACTERES = 500;
const CHAT_VIDA_NORMAL_MS = 6 * 60 * 60 * 1000;   // 6 h de red de seguridad
const CHAT_VIDA_TRAS_ENTREGA_MS = 10 * 60 * 1000; // 10 min tras la entrega

const chatEstado = {
  pedidoId: null,
  yo: null,          // 'cliente' | 'domiciliario'
  miUid: null,
  unsub: null,
  abierto: false,
  cerradoEn: null,
};

/** Detecta teléfonos y números de cuenta escritos de cualquier forma. */
function chatTieneNumeroLargo(texto) {
  const soloDigitos = (texto || '').replace(/[\s\-().]/g, '');
  return /\d{7,}/.test(soloDigitos);
}

function chatEscapar(texto) {
  const d = document.createElement('div');
  d.innerText = texto == null ? '' : String(texto);
  return d.innerHTML;
}

function chatHora(valor) {
  let f = null;
  if (!valor) return '';
  if (typeof valor.toDate === 'function') f = valor.toDate();
  else f = new Date(valor);
  if (!f || isNaN(f.getTime())) return '';
  return f.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
}

function chatDb() {
  return (typeof db !== 'undefined' && db) ? db : window.db;
}

/**
 * Crea el documento del chat al aceptar la carrera. Lo llama la app del
 * domiciliario, que es quien conoce el pedido completo en ese momento.
 */
async function chatCrearParaPedido(pedidoId, clienteUid, domiciliarioUid) {
  if (!pedidoId || !clienteUid || !domiciliarioUid) return;
  try {
    await chatDb().collection('chats').doc(pedidoId).set({
      cliente_uid: clienteUid,
      domiciliario_uid: domiciliarioUid,
      creado_en: new Date().toISOString(),
      cerrado_en: null,
    });
  } catch (e) {
    // Si ya existía no pasa nada; el chat sigue sirviendo.
    console.warn('[chat] No se pudo crear el chat:', e.code || e.message);
  }
}

/**
 * Abre la conversación y empieza a escuchar. Devuelve false si el chat no
 * está disponible (por ejemplo, si el pedido ya se entregó hace rato).
 */
async function chatAbrir(pedidoId, yo, miUid) {
  if (!pedidoId || !miUid) return false;

  chatEstado.pedidoId = pedidoId;
  chatEstado.yo = yo;
  chatEstado.miUid = miUid;

  const panel = document.getElementById('chatPanel');
  if (panel) {
    panel.classList.remove('hidden');
    panel.classList.add('flex');
  }
  chatEstado.abierto = true;

  // Se consulta el estado del chat para saber si sigue vivo.
  try {
    const cab = await chatDb().collection('chats').doc(pedidoId).get();
    chatEstado.cerradoEn = cab.exists ? cab.data().cerrado_en : null;
  } catch (e) {
    chatEstado.cerradoEn = null;
  }

  chatPintarAviso();
  chatEscuchar();
  return true;
}

function chatCerrar() {
  chatEstado.abierto = false;
  if (chatEstado.unsub) {
    try { chatEstado.unsub(); } catch (e) {}
    chatEstado.unsub = null;
  }
  const panel = document.getElementById('chatPanel');
  if (panel) {
    panel.classList.add('hidden');
    panel.classList.remove('flex');
  }
}

/** Minutos que le quedan de vida a la conversación, o null si sigue activa. */
function chatMinutosRestantes() {
  if (!chatEstado.cerradoEn) return null;
  const cierre = new Date(chatEstado.cerradoEn).getTime();
  if (isNaN(cierre)) return null;
  const restanteMs = (cierre + CHAT_VIDA_TRAS_ENTREGA_MS) - Date.now();
  return Math.max(0, Math.ceil(restanteMs / 60000));
}

function chatPintarAviso() {
  const aviso = document.getElementById('chatAviso');
  const entrada = document.getElementById('chatEntrada');
  if (!aviso) return;

  const minutos = chatMinutosRestantes();

  if (minutos === null) {
    aviso.innerHTML = 'Este chat es solo para coordinar tu entrega. ' +
                      '<strong>Se borra solo</strong> al terminar el pedido.';
    aviso.className = 'text-[10px] text-slate-500 px-4 py-2 text-center border-b border-slate-800';
    if (entrada) entrada.classList.remove('hidden');
  } else if (minutos > 0) {
    aviso.innerHTML = `Pedido entregado. Esta conversación se borra en <strong>${minutos} min</strong>.`;
    aviso.className = 'text-[10px] text-amber-300 bg-amber-950/60 px-4 py-2 text-center border-b border-amber-800';
    if (entrada) entrada.classList.remove('hidden');
  } else {
    aviso.innerHTML = 'Esta conversación ya se cerró y sus mensajes fueron borrados.';
    aviso.className = 'text-[10px] text-slate-400 bg-slate-900 px-4 py-2 text-center border-b border-slate-800';
    if (entrada) entrada.classList.add('hidden');
  }
}

function chatEscuchar() {
  if (chatEstado.unsub) { try { chatEstado.unsub(); } catch (e) {} }

  chatEstado.unsub = chatDb()
    .collection('chats').doc(chatEstado.pedidoId)
    .collection('mensajes')
    .orderBy('creado_en', 'asc')
    .limit(CHAT_LIMITE_MENSAJES)
    .onSnapshot((snap) => {
      const mensajes = [];
      snap.forEach(d => mensajes.push({ id: d.id, ...d.data() }));
      chatPintarMensajes(mensajes);
    }, (err) => {
      console.error('[chat] Error escuchando mensajes:', err);
      const cuerpo = document.getElementById('chatMensajes');
      if (cuerpo) {
        cuerpo.innerHTML =
          '<p class="text-center text-[11px] text-rose-300 py-6">' +
          'No se pudo cargar la conversación (' + chatEscapar(err.code || err.message) + ')</p>';
      }
    });
}

function chatPintarMensajes(mensajes) {
  const cuerpo = document.getElementById('chatMensajes');
  if (!cuerpo) return;

  if (!mensajes.length) {
    cuerpo.innerHTML =
      '<div class="text-center py-10 px-6">' +
      '<p class="text-xs text-slate-500">Aún no hay mensajes.</p>' +
      '<p class="text-[11px] text-slate-600 mt-1">Escribe para coordinar la entrega.</p>' +
      '</div>';
    return;
  }

  cuerpo.innerHTML = mensajes.map(m => {
    const mio = m.autor_uid === chatEstado.miUid;
    const burbuja = mio
      ? 'bg-emerald-600 text-white rounded-br-sm'
      : 'bg-slate-800 text-slate-100 rounded-bl-sm';
    return `
      <div class="flex ${mio ? 'justify-end' : 'justify-start'} px-3">
        <div class="max-w-[78%] ${burbuja} rounded-2xl px-3 py-2 shadow">
          <p class="text-[13px] leading-snug break-words">${chatEscapar(m.texto)}</p>
          <p class="text-[9px] opacity-70 text-right mt-0.5">${chatEscapar(chatHora(m.creado_en))}</p>
        </div>
      </div>`;
  }).join('');

  cuerpo.scrollTop = cuerpo.scrollHeight;
}

async function chatEnviar() {
  const campo = document.getElementById('chatTexto');
  const boton = document.getElementById('chatEnviarBtn');
  if (!campo) return;

  const texto = campo.value.trim();
  if (!texto) return;

  if (texto.length > CHAT_MAX_CARACTERES) {
    chatMostrarError(`El mensaje no puede pasar de ${CHAT_MAX_CARACTERES} caracteres.`);
    return;
  }

  // Se avisa ANTES de enviar, para que la persona entienda el porqué; el
  // servidor lo rechazaría igual.
  if (chatTieneNumeroLargo(texto)) {
    chatMostrarError('Por seguridad no se pueden enviar teléfonos ni números de cuenta por el chat.');
    return;
  }

  if (boton) boton.disabled = true;
  campo.value = '';

  const ahora = Date.now();
  const expira = chatEstado.cerradoEn
    ? new Date(new Date(chatEstado.cerradoEn).getTime() + CHAT_VIDA_TRAS_ENTREGA_MS)
    : new Date(ahora + CHAT_VIDA_NORMAL_MS);

  try {
    await chatDb()
      .collection('chats').doc(chatEstado.pedidoId)
      .collection('mensajes').add({
        remitente: chatEstado.yo,
        autor_uid: chatEstado.miUid,
        texto: texto,
        creado_en: firebase.firestore.FieldValue.serverTimestamp(),
        expira_en: expira,
      });
  } catch (e) {
    console.error('[chat] Error enviando mensaje:', e);
    campo.value = texto;   // no se pierde lo que escribió
    chatMostrarError('No se pudo enviar: ' + (e.code || e.message));
  } finally {
    if (boton) boton.disabled = false;
  }
}

function chatMostrarError(mensaje) {
  if (typeof showToast === 'function') showToast(mensaje, 'error');
  else alert(mensaje);
}

/**
 * BORRADO EFÍMERO — se llama cuando el pedido queda entregado.
 *
 * Por qué está en la app y no en una Cloud Function: las Cloud Functions
 * exigen el plan Blaze (de pago). Este proyecto está en el plan gratuito, así
 * que el borrado se resuelve con dos mecanismos que no cuestan nada:
 *
 *   1. Se adelanta la expiración de todos los mensajes a 10 minutos. Si en la
 *      consola de Firestore está activada la política TTL sobre el campo
 *      expira_en de la colección 'mensajes', Google los borra solo.
 *   2. Como respaldo, cualquiera de las dos apps borra los mensajes cuando
 *      detecta que ya pasó el plazo. Así el chat desaparece incluso sin TTL.
 */
async function chatMarcarEntregado(pedidoId) {
  if (!pedidoId) return;
  const cerradoEn = new Date().toISOString();
  const expira = new Date(Date.now() + CHAT_VIDA_TRAS_ENTREGA_MS);

  try {
    const ref = chatDb().collection('chats').doc(pedidoId);
    await ref.update({ cerrado_en: cerradoEn });

    const mensajes = await ref.collection('mensajes').limit(200).get();
    if (!mensajes.empty) {
      const lote = chatDb().batch();
      mensajes.forEach(d => lote.update(d.ref, { expira_en: expira }));
      await lote.commit();
    }
    chatEstado.cerradoEn = cerradoEn;
    chatPintarAviso();
  } catch (e) {
    console.warn('[chat] No se pudo programar el borrado:', e.code || e.message);
  }
}

/**
 * Respaldo del borrado: elimina los mensajes de un chat ya vencido. Se llama
 * al abrir la app, de forma silenciosa.
 */
async function chatBorrarSiVencio(pedidoId, cerradoEn) {
  if (!pedidoId || !cerradoEn) return;
  const vence = new Date(cerradoEn).getTime() + CHAT_VIDA_TRAS_ENTREGA_MS;
  if (isNaN(vence) || Date.now() < vence) return;

  try {
    const ref = chatDb().collection('chats').doc(pedidoId);
    const mensajes = await ref.collection('mensajes').limit(200).get();
    if (mensajes.empty) return;

    const lote = chatDb().batch();
    mensajes.forEach(d => lote.delete(d.ref));
    await lote.commit();
    console.log('[chat] Conversación vencida borrada:', pedidoId);
  } catch (e) {
    console.warn('[chat] No se pudo borrar la conversación vencida:', e.code || e.message);
  }
}

/** Marca visual de mensajes sin leer para el botón que abre el chat. */
function chatEscucharNoLeidos(pedidoId, miUid, alCambiar) {
  if (!pedidoId || !miUid) return null;
  return chatDb()
    .collection('chats').doc(pedidoId)
    .collection('mensajes')
    .orderBy('creado_en', 'desc')
    .limit(1)
    .onSnapshot((snap) => {
      let hayDelOtro = false;
      snap.forEach(d => {
        const m = d.data();
        if (m.autor_uid && m.autor_uid !== miUid) hayDelOtro = true;
      });
      if (typeof alCambiar === 'function') alCambiar(hayDelOtro);
    }, () => {});
}

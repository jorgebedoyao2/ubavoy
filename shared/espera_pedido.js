/**
 * UbaVoy - Qué pasa cuando nadie toma el pedido
 * ============================================================================
 * Hasta ahora un pedido que ningún domiciliario tomaba se quedaba en 'pending'
 * para siempre. El cliente miraba la pantalla esperando algo que nunca iba a
 * pasar, sin un aviso ni una salida. Y del otro lado, un domiciliario podía
 * aceptar horas después un pedido que la persona ya había resuelto por otro
 * lado — con lo cual pagaba su comisión por una carrera muerta.
 *
 * Esto lo resuelve por los dos lados:
 *
 *   CLIENTE       a los 5 minutos sin domiciliario se le avisa y se le
 *                 ofrece cancelar o seguir esperando. La decisión es suya:
 *                 cancelar solo no seria correcto, puede que si quiera esperar.
 *
 *   DOMICILIARIO  cada carrera libre muestra su antigüedad, y las viejas
 *                 salen marcadas. Sigue pudiendo tomarlas (a las 11 p.m. una
 *                 carrera de hace media hora puede seguir viva), pero lo hace
 *                 sabiendo lo que toma.
 *
 * POR QUÉ NO SE CANCELA SOLO EN EL SERVIDOR: no hay Cloud Functions en el plan
 * gratuito de Firebase. Nada corre si no hay alguien con la app abierta. Por
 * eso el vencimiento es un aviso al cliente, no un borrado automático: se
 * apoya en la única pieza que sí está presente cuando importa, que es el
 * navegador de quien está esperando.
 */

const ESPERA_AVISO_MS      = 5 * 60 * 1000;  // sin domiciliario: se avisa
const ESPERA_REPETIR_MS    = 5 * 60 * 1000;  // "seguir esperando" aplaza esto
const ESPERA_LATIDO_MS     = 15 * 1000;      // cada cuánto se revisa la hora
const ESPERA_ANTIGUO_MIN   = 20;             // carrera vieja para el domiciliario

const esperaEstado = {
  pedidoId: null,
  reloj: null,
  avisarDesde: 0,   // momento a partir del cual corresponde avisar
  cancelando: false,
};

function esperaDb() {
  return (typeof db !== 'undefined' && db) ? db : window.db;
}

/** Convierte created_at (texto ISO o Timestamp de Firestore) en milisegundos. */
function esperaMomentoDe(valor) {
  if (!valor) return null;
  try {
    if (typeof valor.toDate === 'function') return valor.toDate().getTime();
    const t = new Date(valor).getTime();
    return isNaN(t) ? null : t;
  } catch (_) {
    return null;
  }
}

/** Minutos transcurridos desde que se creó el pedido. null si no se sabe. */
function esperaMinutosDe(order) {
  const nacio = esperaMomentoDe(order && (order.created_at || order.createdAt));
  if (!nacio) return null;
  return Math.max(0, Math.floor((Date.now() - nacio) / 60000));
}

/**
 * Etiqueta de antigüedad para la lista del domiciliario.
 * Devuelve null cuando no hay fecha: es preferible no mostrar nada a mostrar
 * un dato inventado sobre el que alguien va a decidir si acepta una carrera.
 */
function esperaEtiquetaEdad(order) {
  const min = esperaMinutosDe(order);
  if (min === null) return null;

  const texto = min < 1 ? 'recién puesta'
              : min === 1 ? 'hace 1 minuto'
              : min < 60 ? `hace ${min} minutos`
              : `hace ${Math.floor(min / 60)} h`;

  return { minutos: min, texto, vieja: min >= ESPERA_ANTIGUO_MIN };
}

// ---------------------------------------------------------------------------
// Lado del cliente
// ---------------------------------------------------------------------------

function esperaCaja() {
  return document.getElementById('espera-sin-domiciliario');
}

function esperaOcultar() {
  const caja = esperaCaja();
  if (caja) caja.classList.add('hidden');
}

function esperaDetener() {
  if (esperaEstado.reloj) {
    clearInterval(esperaEstado.reloj);
    esperaEstado.reloj = null;
  }
  esperaEstado.pedidoId = null;
  esperaOcultar();
}

function esperaMostrar(minutos) {
  const caja = esperaCaja();
  if (!caja) return;
  const texto = document.getElementById('espera-texto');
  if (texto) {
    texto.innerText = minutos < 60
      ? `Llevas ${minutos} minutos esperando y ningún domiciliario ha tomado tu mandado.`
      : `Tu mandado lleva más de una hora sin que nadie lo tome.`;
  }
  caja.classList.remove('hidden');
}

/**
 * Se llama en cada actualización del pedido y también desde el reloj interno.
 * El reloj hace falta porque mientras nada cambia en la base de datos no
 * llegan actualizaciones, y justamente el caso que nos importa es ese: que
 * NO pase nada.
 */
function esperaRevisar(order) {
  if (!order || order.status !== 'pending') { esperaDetener(); return; }

  const minutos = esperaMinutosDe(order);
  if (minutos === null) return;

  if (Date.now() >= esperaEstado.avisarDesde) esperaMostrar(minutos);
}

function esperaEvaluar(orderId, order) {
  if (!order || order.status !== 'pending') { esperaDetener(); return; }

  if (esperaEstado.pedidoId !== orderId) {
    esperaEstado.pedidoId = orderId;
    const nacio = esperaMomentoDe(order.created_at || order.createdAt) || Date.now();
    esperaEstado.avisarDesde = nacio + ESPERA_AVISO_MS;
  }

  if (!esperaEstado.reloj) {
    esperaEstado.reloj = setInterval(() => esperaRevisar(order), ESPERA_LATIDO_MS);
  }

  esperaRevisar(order);
}

/** "Seguir esperando": se aplaza el aviso, no se apaga. */
function esperaSeguirEsperando() {
  esperaEstado.avisarDesde = Date.now() + ESPERA_REPETIR_MS;
  esperaOcultar();
  if (typeof showToast === 'function') {
    showToast('Seguimos buscando. Te avisamos en unos minutos.', 'warning');
  }
}

/**
 * Cancela el pedido. Las reglas solo lo permiten mientras nadie lo haya
 * tomado y solo dejan tocar estos dos campos, así que se envían exactamente
 * esos: cualquier campo de más haría que el servidor rechace la escritura
 * completa y la persona se quedaría sin poder cancelar.
 */
async function esperaCancelarPedido() {
  if (esperaEstado.cancelando || !esperaEstado.pedidoId) return;

  const base = esperaDb();
  if (!base) return;

  const boton = document.getElementById('espera-cancelar-btn');
  esperaEstado.cancelando = true;
  if (boton) { boton.disabled = true; boton.innerText = 'Cancelando...'; }

  try {
    await base.collection('orders').doc(esperaEstado.pedidoId).update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
    });

    localStorage.removeItem('ubavoy_active_order_id');
    localStorage.removeItem('ubavoy_active_order');

    esperaDetener();

    const panel = document.getElementById('activeOrderTracking');
    if (panel) { panel.classList.add('hidden'); panel.style.display = 'none'; }

    if (typeof showToast === 'function') {
      showToast('Tu mandado quedó cancelado. Puedes pedir de nuevo cuando quieras.');
    }
  } catch (e) {
    console.error('No se pudo cancelar el pedido:', e);
    // Caso real: un domiciliario lo tomó entre que se mostró el aviso y se
    // apretó el botón. Las reglas lo rechazan, y está bien que lo hagan.
    if (typeof showToast === 'function') {
      showToast('No se pudo cancelar: es posible que un domiciliario acabe de tomarlo.', 'error');
    }
    esperaOcultar();
  } finally {
    esperaEstado.cancelando = false;
    if (boton) { boton.disabled = false; boton.innerText = 'Cancelar mandado'; }
  }
}

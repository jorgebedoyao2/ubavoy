/**
 * UbaVoy - Agente conversacional que toma el pedido hablando con el cliente
 * ============================================================================
 * La persona conversa, y al final el agente DEJA LLENO el formulario de
 * siempre. No crea el pedido por su cuenta.
 *
 * Por qué así, y no creando el pedido directamente desde aquí:
 *
 *  - El código que crea pedidos ya está probado en producción (bloqueo de
 *    doble envío, PIN, hash, comparación con el GPS del celular). Duplicarlo
 *    aquí significaría mantener dos versiones que tarde o temprano se
 *    separan, y una de ellas cobraría mal.
 *  - Las reglas de Firestore exigen coordenadas numéricas, y una dirección
 *    dicha en palabras no las trae. El mapa sigue siendo el que confirma
 *    dónde es la entrega.
 *
 * Resultado: el agente ahorra escribir, no ahorra confirmar. La persona ve
 * lo que entendió el agente, revisa el punto en el mapa y aprieta el botón
 * de siempre.
 *
 * COSTO: la conversación no toca Firestore. Solo se escribe al final, cuando
 * la persona confirma, igual que hoy.
 */

const AGENTE_MAX_CARACTERES = 400;

const agenteEstado = {
  abierto: false,
  enviando: false,
  // Lo que el agente ha logrado reunir. El servidor lo valida en cada turno.
  datos: { task_description: null, delivery_address: null, estimated_price: null },
  historial: [],
};

function agenteEscapar(texto) {
  const d = document.createElement('div');
  d.innerText = texto == null ? '' : String(texto);
  return d.innerHTML;
}

function agenteToast(mensaje, tipo) {
  if (typeof showToast === 'function') showToast(mensaje, tipo);
  else console.log(mensaje);
}

/** Pinta un mensaje. 'agente' a la izquierda, 'usuario' a la derecha. */
function agentePintar(rol, texto) {
  const caja = document.getElementById('agenteMensajes');
  if (!caja) return;

  const mio = rol === 'usuario';
  const fila = document.createElement('div');
  fila.className = 'flex px-3 ' + (mio ? 'justify-end' : 'justify-start');
  fila.innerHTML =
    '<div class="max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-snug ' +
    (mio
      ? 'bg-emerald-600 text-white rounded-br-sm'
      : 'bg-slate-800 text-slate-100 rounded-bl-sm') +
    '">' + agenteEscapar(texto) + '</div>';

  caja.appendChild(fila);
  caja.scrollTop = caja.scrollHeight;
}

/** Puntos suspensivos mientras el agente piensa. Sin esto se siente colgado. */
function agentePensando(encender) {
  const caja = document.getElementById('agenteMensajes');
  if (!caja) return;
  const previo = document.getElementById('agentePensando');
  if (previo) previo.remove();
  if (!encender) return;

  const fila = document.createElement('div');
  fila.id = 'agentePensando';
  fila.className = 'flex px-3 justify-start';
  fila.innerHTML =
    '<div class="bg-slate-800 text-slate-400 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm">' +
    '<i class="fa-solid fa-ellipsis fa-fade"></i></div>';
  caja.appendChild(fila);
  caja.scrollTop = caja.scrollHeight;
}

/**
 * Botones tocables debajo del mensaje del agente (barrios, zona).
 *
 * Por qué existen: el agente solo sabe escribir, así que para preguntar el
 * barrio recitaba los catorce dentro de la frase. Quedaba larguísimo, no se
 * podía tocar, y en un celular obliga a escribir el nombre a mano y con
 * faltas. Tocando un botón el dato llega escrito exactamente como lo
 * necesita el domiciliario.
 */
function agenteQuitarOpciones() {
  const previo = document.getElementById('agenteOpciones');
  if (previo) previo.remove();
}

function agentePintarOpciones(lista) {
  agenteQuitarOpciones();
  if (!Array.isArray(lista) || !lista.length) return;

  const caja = document.getElementById('agenteMensajes');
  if (!caja) return;

  const fila = document.createElement('div');
  fila.id = 'agenteOpciones';
  fila.className = 'flex flex-wrap gap-1.5 px-3 pt-1';

  lista.forEach((opcion) => {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className =
      'px-3 py-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 ' +
      'text-emerald-300 text-xs font-semibold active:scale-95 transition-all';
    boton.innerText = opcion;
    // Se manda tal cual está escrito en el servidor, no lo que teclee la
    // persona: así el barrio llega siempre con la misma ortografía.
    boton.onclick = () => {
      agenteQuitarOpciones();
      const entrada = document.getElementById('agenteTexto');
      if (entrada) entrada.value = opcion;
      agenteEnviar();
    };
    fila.appendChild(boton);
  });

  caja.appendChild(fila);
  caja.scrollTop = caja.scrollHeight;
}

/**
 * Muestra el detalle tecnico de un fallo, en gris y pequeño, debajo del
 * mensaje amable. No reemplaza al mensaje: la persona entiende qué hacer,
 * y quien esté probando puede leer la causa sin abrir herramientas.
 */
function agenteMostrarDetalle(estado, detalle) {
  const caja = document.getElementById('agenteMensajes');
  if (!caja) return;

  const fila = document.createElement('div');
  fila.className = 'px-4 pb-2';
  fila.innerHTML =
    '<p class="text-[10px] leading-relaxed text-slate-600 font-mono break-words">' +
    'diagnóstico ' + agenteEscapar(estado) + ' · ' + agenteEscapar(detalle) +
    '</p>';

  caja.appendChild(fila);
  caja.scrollTop = caja.scrollHeight;
}

function agenteResumen() {
  const d = agenteEstado.datos;
  const partes = [];
  if (d.task_description) partes.push('<b>Mandado:</b> ' + agenteEscapar(d.task_description));
  if (d.delivery_address) partes.push('<b>Dirección:</b> ' + agenteEscapar(d.delivery_address));
  if (d.estimated_price) partes.push('<b>Tarifa:</b> $' + d.estimated_price.toLocaleString() + ' COP');
  return partes.join('<br>');
}

/**
 * Cuando ya están los tres datos, se muestra el resumen y el paso al mapa.
 * Deliberadamente NO se envía solo: la persona tiene que ver el punto de
 * entrega antes de que salga un domiciliario para allá.
 */
function agenteMostrarCierre() {
  const pie = document.getElementById('agenteCierre');
  if (!pie) return;
  document.getElementById('agenteResumen').innerHTML = agenteResumen();
  pie.classList.remove('hidden');
}

/**
 * Vuelca lo conversado en el formulario de siempre y cierra el agente.
 * A partir de aquí manda el código que ya existía.
 */
function agentePasarAlFormulario() {
  const d = agenteEstado.datos;

  const desc = document.getElementById('taskDesc');
  const dir = document.getElementById('deliveryAddress');
  if (desc && d.task_description) desc.value = d.task_description;
  if (dir && d.delivery_address) dir.value = d.delivery_address;

  // Se reusa la función del tarifador en vez de tocar su variable interna,
  // para que los botones queden pintados igual que si se hubieran apretado.
  if (typeof selectPricingZone === 'function' && d.estimated_price) {
    if (d.estimated_price === 7000) selectPricingZone('perimeter', 7000);
    else selectPricingZone('urban', 5000);
  }

  agenteCerrar();

  const mapa = document.getElementById('map');
  if (mapa) mapa.scrollIntoView({ behavior: 'smooth', block: 'center' });
  agenteToast('Revisa el punto en el mapa y confirma tu pedido.', 'warning');
}

function agenteAbrir() {
  const usuario = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
  if (!usuario) {
    agenteToast('Entra con tu cuenta de Google para pedir conversando.', 'error');
    return;
  }

  const panel = document.getElementById('agentePanel');
  if (!panel) return;

  agenteEstado.abierto = true;
  agenteEstado.datos = {
    task_description: null, delivery_address: null, estimated_price: null,
  };
  agenteEstado.historial = [];

  const caja = document.getElementById('agenteMensajes');
  if (caja) caja.innerHTML = '';
  const cierre = document.getElementById('agenteCierre');
  if (cierre) cierre.classList.add('hidden');

  panel.classList.remove('hidden');
  panel.classList.add('flex');

  const saludo = '¡Hola! Cuéntame, ¿qué necesitas que te llevemos hoy?';
  agentePintar('agente', saludo);
  agenteEstado.historial.push({ rol: 'agente', texto: saludo });

  const entrada = document.getElementById('agenteTexto');
  if (entrada) setTimeout(() => entrada.focus(), 150);
}

function agenteCerrar() {
  const panel = document.getElementById('agentePanel');
  if (!panel) return;
  agenteEstado.abierto = false;
  panel.classList.add('hidden');
  panel.classList.remove('flex');
}

async function agenteEnviar() {
  if (agenteEstado.enviando) return;

  const entrada = document.getElementById('agenteTexto');
  const boton = document.getElementById('agenteEnviarBtn');
  const texto = (entrada ? entrada.value : '').trim().slice(0, AGENTE_MAX_CARACTERES);
  if (!texto) return;

  const usuario = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
  if (!usuario) {
    agenteToast('Tu sesión se cerró. Entra de nuevo.', 'error');
    return;
  }

  agenteEstado.enviando = true;
  if (boton) boton.disabled = true;
  if (entrada) { entrada.value = ''; entrada.style.height = 'auto'; }

  agenteQuitarOpciones();
  agentePintar('usuario', texto);
  agenteEstado.historial.push({ rol: 'usuario', texto });
  agentePensando(true);

  try {
    // La sesión viaja en la cabecera, no en la URL: así no queda en el
    // historial del navegador ni en los registros del servidor.
    const token = await usuario.getIdToken();

    const r = await fetch('/api/agente', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mensaje: texto,
        estado: agenteEstado.datos,
        historial: agenteEstado.historial.slice(-12),
      }),
    });

    agentePensando(false);

    if (!r.ok) {
      const crudo = await r.text();
      console.error('Agente:', r.status, crudo);

      if (r.status === 401) {
        agentePintar('agente', 'Tu sesión venció. Cierra y vuelve a entrar, por favor.');
        return;
      }

      agentePintar('agente',
        'Se me cruzaron los cables. Intenta otra vez o usa el formulario de abajo.');

      // El detalle técnico se muestra en pantalla, no solo en la consola.
      // Mientras el agente esté en pruebas esto ahorra una vuelta completa
      // cada vez que algo falla: el error se lee en el celular, sin conectar
      // el teléfono a un computador.
      let detalle = crudo;
      try { detalle = (JSON.parse(crudo).detail) || crudo; } catch (_) {}
      agenteMostrarDetalle(r.status, detalle);
      return;
    }

    const datos = await r.json();

    agentePintar('agente', datos.respuesta);
    agenteEstado.historial.push({ rol: 'agente', texto: datos.respuesta });

    // El estado que manda el servidor ya viene validado campo por campo.
    if (datos.estado) agenteEstado.datos = datos.estado;

    agentePintarOpciones(datos.opciones);

    if (datos.listo) agenteMostrarCierre();

  } catch (e) {
    agentePensando(false);
    console.error('Agente:', e);
    agentePintar('agente',
      'Me quedé sin señal. Revisa tu conexión o usa el formulario de abajo.');
  } finally {
    agenteEstado.enviando = false;
    if (boton) boton.disabled = false;
    if (entrada) entrada.focus();
  }
}

"""
UbaVoy - Armado del informe HTML
=============================================================================
Toma los indicadores y las graficas y produce una pagina lista para mostrar en
una reunion: con inversionistas, con la alcaldia o con quien pregunte como va
la operacion.

El diseno es deliberadamente sobrio y de una sola columna en el movil: la
pagina se lee, no se opera.
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta

BOGOTA = timezone(timedelta(hours=-5))


def _cop(valor):
    try:
        return '$' + f'{int(valor):,}'.replace(',', '.')
    except Exception:
        return '$0'


def _num(valor, sufijo=''):
    if valor is None:
        return '—'
    if isinstance(valor, float):
        return f'{valor:.1f}{sufijo}'.replace('.0' + sufijo, sufijo)
    return f'{valor}{sufijo}'


def _minutos(valor):
    if valor is None:
        return '—'
    if valor < 60:
        return f'{valor:.0f} min'
    return f'{valor / 60:.1f} h'


ESTILOS = """
:root{
  --fondo:#0B0F14; --panel:#141A22; --panel2:#1B222C;
  --linea:#242C38; --tinta:#E6EAF0; --tinta2:#95A1B2; --tinta3:#63708440;
  --verde:#10B981; --ambar:#F59E0B; --morado:#A855F7; --cielo:#38BDF8; --rosa:#FB7185;
}
*{box-sizing:border-box}
body{margin:0;background:var(--fondo);color:var(--tinta);
  font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  line-height:1.55;-webkit-font-smoothing:antialiased}
.hoja{max-width:1180px;margin:0 auto;padding:32px 20px 80px}

.tope{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;
  border-bottom:2px solid var(--linea);padding-bottom:18px;margin-bottom:26px;flex-wrap:wrap}
.marca{font-size:26px;font-weight:800;letter-spacing:-.02em;margin:0}
.marca span{color:var(--verde)}
.sub{color:var(--tinta2);font-size:13px;margin:4px 0 0}
.sello{font-size:11px;color:var(--tinta2);text-align:right;line-height:1.7;
  font-family:ui-monospace,Consolas,monospace}

h2{font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;
  color:var(--tinta2);margin:34px 0 14px;padding-bottom:8px;border-bottom:1px solid var(--linea)}

.tarjetas{display:grid;grid-template-columns:repeat(auto-fit,minmax(178px,1fr));gap:12px}
.t{background:var(--panel);border:1px solid var(--linea);border-radius:12px;padding:15px 16px}
.t .n{font-size:27px;font-weight:800;line-height:1.1;font-variant-numeric:tabular-nums}
.t .e{font-size:11px;color:var(--tinta2);text-transform:uppercase;letter-spacing:.05em;margin-top:5px}
.t .p{font-size:11px;color:var(--tinta2);margin-top:3px;opacity:.8}
.verde .n{color:var(--verde)} .ambar .n{color:var(--ambar)}
.morado .n{color:var(--morado)} .cielo .n{color:var(--cielo)} .rosa .n{color:var(--rosa)}

.grafs{display:grid;grid-template-columns:repeat(auto-fit,minmax(430px,1fr));gap:14px}
.g{background:var(--panel);border:1px solid var(--linea);border-radius:12px;padding:16px 16px 8px;min-width:0}
.g h3{margin:0 0 2px;font-size:14px;font-weight:700}
.g p{margin:0 0 10px;font-size:11.5px;color:var(--tinta2)}
.ancho{grid-column:1/-1}

table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;font-size:10px;letter-spacing:.07em;text-transform:uppercase;
  color:var(--tinta2);padding:8px 10px 8px 0;border-bottom:1px solid var(--linea)}
td{padding:9px 10px 9px 0;border-bottom:1px solid #1c232e;color:var(--tinta2)}
td.n{font-variant-numeric:tabular-nums;text-align:right;color:var(--tinta);font-weight:600}
td:first-child{color:var(--tinta);font-weight:600}

.aviso{background:#2A1A0B;border:1px solid #6B4415;border-left:4px solid var(--ambar);
  border-radius:10px;padding:15px 17px;margin-bottom:24px}
.aviso b{color:var(--ambar);display:block;margin-bottom:5px}
.aviso p{margin:0;font-size:13px;color:var(--tinta2)}
.aviso code{background:#0B0F14;padding:2px 6px;border-radius:4px;
  font-family:ui-monospace,Consolas,monospace;font-size:12px;color:var(--ambar)}

.pie{margin-top:34px;padding-top:15px;border-top:1px solid var(--linea);
  font-size:11px;color:var(--tinta2);font-family:ui-monospace,Consolas,monospace}
@media print{body{background:#fff;color:#000}.g,.t{break-inside:avoid}}
"""


def sin_credenciales():
    """Pagina cuando falta la cuenta de servicio."""
    return f"""<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>UbaVoy · Informe</title><style>{ESTILOS}</style></head><body>
<div class="hoja">
  <div class="tope">
    <div><h1 class="marca">UBA<span>VOY</span></h1>
      <p class="sub">Informe de operación · Ubaté, Cundinamarca</p></div>
  </div>
  <div class="aviso">
    <b>Abre el informe desde el panel de administración</b>
    <p>Esta dirección por sí sola no puede generar el informe: el servidor no
    tiene permitido leer la base de datos por su cuenta.</p>
  </div>

  <h2>Cómo verlo</h2>
  <ol style="color:var(--tinta2);font-size:13.5px;line-height:2">
    <li>Entra al panel en <code>ubavoy.vercel.app/apps/admin/</code> con tu cuenta de Google.</li>
    <li>Arriba, en <b>KPI Métricas Consolidadas</b>, presiona
        <b>Informe completo</b>.</li>
    <li>El informe se abre en una pestaña nueva, ya con tus datos.</li>
  </ol>

  <h2>Por qué funciona así</h2>
  <p style="color:var(--tinta2);font-size:13.5px;max-width:70ch">
    Google bloquea la creación de claves de cuenta de servicio en este proyecto,
    así que el servidor no puede consultar Firestore por sí mismo. Tu navegador
    sí puede, porque ya tiene tu sesión de administrador y las reglas se lo
    permiten. Entonces el navegador lee los datos y Python los analiza.
  </p>
  <p style="color:var(--tinta2);font-size:13.5px;max-width:70ch">
    Resulta ser más seguro que la alternativa: no existe ninguna llave maestra
    guardada en el servidor que alguien pueda robarse. Cada informe se genera
    con la sesión de quien lo pide, y esa sesión se verifica contra las llaves
    públicas de Google antes de procesar nada.
  </p>
  <p class="pie">UbaVoy · el informe se genera en Python (FastAPI + pandas + Plotly)</p>
</div></body></html>"""


def sin_datos():
    return f"""<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>UbaVoy · Informe</title><style>{ESTILOS}</style></head><body>
<div class="hoja">
  <div class="tope">
    <div><h1 class="marca">UBA<span>VOY</span></h1>
      <p class="sub">Informe de operación · Ubaté, Cundinamarca</p></div>
  </div>
  <div class="aviso">
    <b>Conectado, pero todavía no hay pedidos</b>
    <p>El informe ya lee la base de datos correctamente. Los indicadores
    aparecerán en cuanto entren los primeros pedidos reales.</p>
  </div>
  <p class="pie">UbaVoy · informe generado en Python</p>
</div></body></html>"""


def construir(k, g):
    """Arma el informe completo con indicadores (k) y graficas (g)."""
    ahora = datetime.now(BOGOTA).strftime('%d/%m/%Y %H:%M')

    filas_ranking = ''.join(
        f"<tr><td>{d['nombre']}</td><td class='n'>{d['entregas']}</td>"
        f"<td class='n'>{_cop(d['recaudado'])}</td>"
        f"<td class='n'>{_minutos(d['minutos'])}</td></tr>"
        for d in (k.get('ranking') or [])
    ) or "<tr><td colspan='4' style='color:var(--tinta2)'>Sin entregas registradas todavía.</td></tr>"

    return f"""<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>UbaVoy · Informe de operación</title>
<script src="https://cdn.plot.ly/plotly-2.27.0.min.js" charset="utf-8"></script>
<style>{ESTILOS}</style></head><body>
<div class="hoja">

  <div class="tope">
    <div>
      <h1 class="marca">UBA<span>VOY</span></h1>
      <p class="sub">Informe de operación · Ubaté, Cundinamarca</p>
    </div>
    <div class="sello">
      Generado {ahora}<br>
      {k.get('dias_operando', 0)} días de operación<br>
      Primer pedido: {k.get('primer_pedido', '—')}
    </div>
  </div>

  <h2>Resumen del negocio</h2>
  <div class="tarjetas">
    <div class="t verde"><div class="n">{k.get('total_pedidos', 0)}</div>
      <div class="e">Pedidos totales</div>
      <div class="p">{k.get('pedidos_por_dia', 0)} por día en promedio</div></div>
    <div class="t cielo"><div class="n">{k.get('tasa_exito', 0)}%</div>
      <div class="e">Tasa de entrega</div>
      <div class="p">{k.get('entregados', 0)} entregados · {k.get('cancelados', 0)} cancelados</div></div>
    <div class="t ambar"><div class="n">{_cop(k.get('gmv', 0))}</div>
      <div class="e">Valor movido</div>
      <div class="p">Ticket promedio {_cop(k.get('ticket_promedio', 0))}</div></div>
    <div class="t morado"><div class="n">{_cop(k.get('comisiones', 0))}</div>
      <div class="e">Comisiones UbaVoy</div>
      <div class="p">Ingreso de la plataforma</div></div>
  </div>

  <h2>Calidad del servicio</h2>
  <div class="tarjetas">
    <div class="t ambar"><div class="n">{_minutos(k.get('espera_mediana'))}</div>
      <div class="e">Espera hasta que alguien acepta</div>
      <div class="p">9 de cada 10 antes de {_minutos(k.get('espera_p90'))}</div></div>
    <div class="t verde"><div class="n">{_minutos(k.get('entrega_mediana'))}</div>
      <div class="e">Tiempo de entrega</div>
      <div class="p">9 de cada 10 antes de {_minutos(k.get('entrega_p90'))}</div></div>
    <div class="t cielo"><div class="n">{_minutos(k.get('total_mediana'))}</div>
      <div class="e">De pedir a recibir</div>
      <div class="p">Experiencia completa del cliente</div></div>
    <div class="t rosa"><div class="n">{k.get('pendientes', 0)}</div>
      <div class="e">Sin tomar ahora</div>
      <div class="p">Pedidos esperando domiciliario</div></div>
  </div>

  <h2>Clientes y demanda</h2>
  <div class="tarjetas">
    <div class="t verde"><div class="n">{k.get('clientes_unicos', 0)}</div>
      <div class="e">Clientes únicos</div>
      <div class="p">{k.get('pedidos_por_cliente', 0)} pedidos por cliente</div></div>
    <div class="t ambar"><div class="n">{k.get('tasa_recompra', 0)}%</div>
      <div class="e">Vuelven a pedir</div>
      <div class="p">{k.get('clientes_recurrentes', 0)} clientes recurrentes</div></div>
    <div class="t cielo"><div class="n">{k.get('pedidos_7d', 0)}</div>
      <div class="e">Últimos 7 días</div>
      <div class="p">{k.get('pedidos_30d', 0)} en los últimos 30</div></div>
    <div class="t morado"><div class="n">{k.get('domiciliarios_activos', 0)}</div>
      <div class="e">Domiciliarios activos</div>
      <div class="p">{k.get('domiciliarios', 0)} registrados</div></div>
  </div>

  <h2>Gráficas</h2>
  <div class="grafs">
    <div class="g ancho">
      <h3>Evolución diaria de pedidos</h3>
      <p>Cómo se mueve la demanda día a día. El punto ámbar es el último día registrado.</p>
      {g['dia']}
    </div>
    <div class="g">
      <h3>Demanda por hora</h3>
      <p>A qué hora piden en Ubaté. Sirve para decidir en qué franjas conviene tener domiciliarios conectados.</p>
      {g['hora']}
    </div>
    <div class="g">
      <h3>Del pedido a la entrega</h3>
      <p>Cuántos pedidos avanzan en cada etapa y dónde se pierden.</p>
      {g['embudo']}
    </div>
    <div class="g ancho">
      <h3>Mapa de calor: día de la semana y hora</h3>
      <p>Las zonas más claras son los momentos de mayor demanda de la semana.</p>
      {g['calor']}
    </div>
    <div class="g">
      <h3>Distribución de tiempos</h3>
      <p>Espera hasta que un domiciliario acepta, y duración de la entrega.</p>
      {g['tiempos']}
    </div>
    <div class="g">
      <h3>Entregas por domiciliario</h3>
      <p>Quién está sosteniendo la operación.</p>
      {g['ranking']}
    </div>
    <div class="g ancho">
      <h3>Dónde se entrega en Ubaté</h3>
      <p>Cada punto es una entrega. Muestra qué barrios concentran la demanda.</p>
      {g['mapa']}
    </div>
  </div>

  <h2>Detalle por domiciliario</h2>
  <table>
    <thead><tr><th>Domiciliario</th><th style="text-align:right">Entregas</th>
    <th style="text-align:right">Recaudado</th><th style="text-align:right">Tiempo medio</th></tr></thead>
    <tbody>{filas_ranking}</tbody>
  </table>

  <h2>Economía de la plataforma</h2>
  <div class="tarjetas">
    <div class="t verde"><div class="n">{_cop(k.get('ingresos_recargas', 0))}</div>
      <div class="e">Recargas cobradas</div>
      <div class="p">{k.get('recargas_aprobadas', 0)} paquetes vendidos</div></div>
    <div class="t ambar"><div class="n">{_cop(k.get('saldo_circulante', 0))}</div>
      <div class="e">Saldo en poder de domiciliarios</div>
      <div class="p">Servicio ya pagado y no consumido</div></div>
    <div class="t morado"><div class="n">{k.get('promos_canjeados', 0)}/{k.get('promos_creados', 0)}</div>
      <div class="e">Códigos canjeados</div>
      <div class="p">Promociones entregadas</div></div>
    <div class="t rosa"><div class="n">{k.get('recargas_pendientes', 0)}</div>
      <div class="e">Recargas por aprobar</div>
      <div class="p">Requieren tu revisión</div></div>
  </div>

  <p class="pie">
    UbaVoy · informe generado en Python (FastAPI + pandas + Plotly) leyendo Firestore ·
    Último pedido registrado: {k.get('ultimo_pedido', '—')}
  </p>
</div></body></html>"""

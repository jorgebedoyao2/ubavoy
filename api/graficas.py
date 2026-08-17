"""
UbaVoy - Graficas del panel
=============================================================================
Genera las figuras con Plotly y las devuelve como HTML incrustable.

Se usa Plotly y no una imagen estatica porque el panel se va a mostrar en
reuniones: poder pasar el cursor y ver el dato exacto vale mas que un PNG.
Todas las figuras comparten paleta y tipografia para que el informe se lea
como una sola pieza y no como graficas sueltas pegadas.
"""

from __future__ import annotations

import plotly.graph_objects as go
import plotly.io as pio

# Paleta tomada de las apps, para que el informe se reconozca como UbaVoy.
VERDE = '#10b981'
AMBAR = '#f59e0b'
MORADO = '#a855f7'
CIELO = '#38bdf8'
ROSA = '#fb7185'
TINTA = '#e2e8f0'
TENUE = '#64748b'
REJILLA = 'rgba(148,163,184,0.14)'

DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

_CONFIG = {'displayModeBar': False, 'responsive': True}


def _base(fig, alto=280):
    """Estilo comun: fondo transparente para que herede el del panel."""
    fig.update_layout(
        height=alto,
        margin=dict(l=48, r=18, t=18, b=40),
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        font=dict(family='Inter, system-ui, sans-serif', size=12, color=TINTA),
        hoverlabel=dict(bgcolor='#0f172a', font_size=12, bordercolor=TENUE),
        showlegend=False,
    )
    fig.update_xaxes(gridcolor=REJILLA, zeroline=False, linecolor=REJILLA)
    fig.update_yaxes(gridcolor=REJILLA, zeroline=False, linecolor=REJILLA)
    return fig


def _html(fig):
    return pio.to_html(fig, include_plotlyjs=False, full_html=False, config=_CONFIG)


def _vacio(mensaje):
    return (f'<div style="height:280px;display:flex;align-items:center;'
            f'justify-content:center;color:{TENUE};font-size:13px;text-align:center;'
            f'padding:0 24px">{mensaje}</div>')


def pedidos_por_dia(series):
    df = series.get('por_dia')
    if df is None or df.empty:
        return _vacio('Aún no hay pedidos suficientes para dibujar la evolución diaria.')

    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=df['dia'], y=df['pedidos'],
        mode='lines+markers',
        line=dict(color=VERDE, width=3, shape='spline'),
        marker=dict(size=7, color=VERDE, line=dict(width=2, color='#022c22')),
        fill='tozeroy', fillcolor='rgba(16,185,129,0.12)',
        hovertemplate='%{x|%d %b}<br><b>%{y}</b> pedidos<extra></extra>',
    ))
    # Se resalta el ultimo punto: es el dato que todos buscan primero.
    fig.add_trace(go.Scatter(
        x=[df['dia'].iloc[-1]], y=[df['pedidos'].iloc[-1]],
        mode='markers', marker=dict(size=13, color=AMBAR, line=dict(width=2, color='#0f172a')),
        hovertemplate='Último día<br><b>%{y}</b> pedidos<extra></extra>',
    ))
    return _html(_base(fig))


def pedidos_por_hora(series):
    s = series.get('por_hora')
    if s is None or s.sum() == 0:
        return _vacio('Sin datos de horarios todavía.')

    pico = int(s.idxmax())
    colores = [AMBAR if h == pico else 'rgba(56,189,248,0.55)' for h in s.index]

    fig = go.Figure(go.Bar(
        x=[f'{h:02d}' for h in s.index], y=s.values,
        marker=dict(color=colores, line=dict(width=0)),
        hovertemplate='%{x}:00 h<br><b>%{y}</b> pedidos<extra></extra>',
    ))
    fig.add_annotation(
        x=f'{pico:02d}', y=int(s.max()),
        text=f'Hora pico: {pico:02d}:00', showarrow=True, arrowhead=0,
        arrowcolor=AMBAR, ax=0, ay=-28,
        font=dict(color=AMBAR, size=11),
    )
    return _html(_base(fig))


def mapa_calor(series):
    m = series.get('mapa_calor')
    if m is None or m.values.sum() == 0:
        return _vacio('El mapa de calor necesita pedidos en varios días y horas.')

    fig = go.Figure(go.Heatmap(
        z=m.values,
        x=[f'{h:02d}' for h in m.columns],
        y=DIAS,
        colorscale=[[0, 'rgba(15,23,42,0.6)'], [0.5, '#0f766e'], [1, VERDE]],
        showscale=False,
        hovertemplate='%{y} a las %{x}:00<br><b>%{z}</b> pedidos<extra></extra>',
    ))
    return _html(_base(fig, alto=250))


def tiempos(series):
    espera = series.get('espera') or []
    entrega = series.get('entrega') or []
    if not espera and not entrega:
        return _vacio('Los tiempos aparecen cuando haya pedidos aceptados y entregados.')

    fig = go.Figure()
    if espera:
        fig.add_trace(go.Box(
            x=espera, name='Espera<br>hasta aceptar', marker_color=AMBAR,
            boxmean=True, orientation='h',
            hovertemplate='%{x:.0f} min<extra></extra>',
        ))
    if entrega:
        fig.add_trace(go.Box(
            x=entrega, name='Tiempo<br>de entrega', marker_color=VERDE,
            boxmean=True, orientation='h',
            hovertemplate='%{x:.0f} min<extra></extra>',
        ))
    fig.update_layout(showlegend=False)
    fig.update_xaxes(title_text='minutos', title_font=dict(size=11, color=TENUE))
    return _html(_base(fig, alto=250))


def mapa_entregas(series):
    coords = series.get('coords') or []
    if len(coords) < 2:
        return _vacio('El mapa de zonas necesita al menos dos entregas con ubicación.')

    lats = [c[0] for c in coords]
    lngs = [c[1] for c in coords]

    fig = go.Figure(go.Scattermapbox(
        lat=lats, lon=lngs, mode='markers',
        marker=dict(size=13, color=VERDE, opacity=0.75),
        hovertemplate='Entrega<br>%{lat:.4f}, %{lon:.4f}<extra></extra>',
    ))
    fig.update_layout(
        mapbox=dict(
            style='carto-darkmatter',
            center=dict(lat=sum(lats) / len(lats), lon=sum(lngs) / len(lngs)),
            zoom=13.2,
        ),
        height=330,
        margin=dict(l=0, r=0, t=0, b=0),
        paper_bgcolor='rgba(0,0,0,0)',
        font=dict(color=TINTA),
    )
    return _html(fig)


def embudo(k):
    """De cuantos pedidos entran, cuantos terminan entregados."""
    total = k.get('total_pedidos', 0)
    if not total:
        return _vacio('Sin pedidos todavía.')

    etapas = ['Pedidos creados', 'Tomados por un domiciliario', 'Entregados']
    tomados = total - k.get('pendientes', 0) - k.get('cancelados', 0)
    valores = [total, max(tomados, k.get('entregados', 0)), k.get('entregados', 0)]

    fig = go.Figure(go.Funnel(
        y=etapas, x=valores,
        marker=dict(color=[CIELO, MORADO, VERDE]),
        textinfo='value+percent initial',
        textfont=dict(size=13),
        hovertemplate='%{y}<br><b>%{x}</b><extra></extra>',
    ))
    return _html(_base(fig, alto=260))


def ranking_domiciliarios(k):
    ranking = k.get('ranking') or []
    if not ranking:
        return _vacio('Aún ningún domiciliario ha completado entregas.')

    r = list(reversed(ranking[:8]))
    fig = go.Figure(go.Bar(
        y=[x['nombre'] for x in r],
        x=[x['entregas'] for x in r],
        orientation='h',
        marker=dict(color=AMBAR, line=dict(width=0)),
        hovertemplate='%{y}<br><b>%{x}</b> entregas<extra></extra>',
    ))
    return _html(_base(fig, alto=max(200, 42 * len(r))))

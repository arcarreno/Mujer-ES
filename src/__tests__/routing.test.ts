import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  haversine,
  formatoDistancia,
  formatoTiempo,
  estimarTiempos,
  construirGrafo,
  calcularRuta,
} from '../lib/routing'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('haversine', () => {
  it('devuelve 0 para el mismo punto', () => {
    expect(haversine({ lat: 19.044348, lng: -98.198483 }, { lat: 19.044348, lng: -98.198483 })).toBe(0)
  })

  it('calcula ~111.2 km por grado de latitud en el meridiano', () => {
    const d = haversine({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })
    expect(d).toBeGreaterThan(111190)
    expect(d).toBeLessThan(111200)
  })

  it('calcula ~157.25 km para 1°x1° en el ecuador', () => {
    const d = haversine({ lat: 0, lng: 0 }, { lat: 1, lng: 1 })
    expect(d).toBeGreaterThan(157249)
    expect(d).toBeLessThan(157259)
  })
})

describe('formatoDistancia', () => {
  it('formatea metros', () => {
    expect(formatoDistancia(850)).toBe('850 m')
  })

  it('formatea kilómetros con un decimal', () => {
    expect(formatoDistancia(3480)).toBe('3.5 km')
  })
})

describe('formatoTiempo', () => {
  it('redondea hacia arriba los minutos', () => {
    expect(formatoTiempo(45.2)).toBe('46 min')
  })

  it('formatea horas y minutos', () => {
    expect(formatoTiempo(90)).toBe('1 h 30 min')
  })

  it('omite los minutos cuando es hora exacta', () => {
    expect(formatoTiempo(120)).toBe('2 h')
  })

  it('nunca devuelve 0 min', () => {
    expect(formatoTiempo(0.4)).toBe('1 min')
  })
})

describe('estimarTiempos', () => {
  it('estima tiempos por medio de transporte (5 km)', () => {
    const t = estimarTiempos(5000)
    expect(t.auto).toBe('11 min')
    expect(t.bicicleta).toBe('20 min')
    expect(t.caminando).toBe('1 h 3 min')
  })
})

describe('construirGrafo', () => {
  it('une formas en nodos y conecta vecinos solo una vez', () => {
    const elements = [
      {
        type: 'way',
        tags: { highway: 'residential', name: 'Calle A' },
        geometry: [
          { lat: 19.0, lon: -98.2 },
          { lat: 19.0005, lon: -98.2 },
        ],
      },
      {
        type: 'way',
        tags: { highway: 'residential', name: 'Calle A' },
        geometry: [
          { lat: 19.0005, lon: -98.2 },
          { lat: 19.001, lon: -98.2 },
        ],
      },
    ]
    const grafo = construirGrafo(elements)
    expect(grafo.size).toBe(3)
    const n = grafo.get(1)!
    expect(n.nombre).toBe('Calle A')
    expect(n.vecinos.length).toBe(1)
  })
})

describe('calcularRuta', () => {
  function mockOverpassWithRoads() {
    const elements = [
      {
        type: 'way',
        tags: { highway: 'residential', name: 'Calle Norte' },
        geometry: [
          { lat: 19.001, lon: -98.2 },
          { lat: 19.0005, lon: -98.2 },
          { lat: 19.0, lon: -98.2 },
        ],
      },
      {
        type: 'way',
        tags: { highway: 'residential', name: 'Calle Sur' },
        geometry: [
          { lat: 19.001, lon: -98.199 },
          { lat: 19.0005, lon: -98.199 },
          { lat: 19.0, lon: -98.199 },
        ],
      },
      {
        type: 'way',
        tags: { highway: 'residential', name: 'Conector' },
        geometry: [
          { lat: 19.001, lon: -98.2 },
          { lat: 19.001, lon: -98.199 },
        ],
      },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ elements }),
      })
    )
  }

  it('encuentra el desvío correcto con A* (U-shape, no línea recta)', async () => {
    mockOverpassWithRoads()
    const ruta = await calcularRuta(
      { lat: 19.0001, lng: -98.2001 },
      { lat: 19.0001, lng: -98.1989 }
    )
    expect(ruta.puntos.length).toBeGreaterThan(2)
    expect(ruta.distanciaM).toBeGreaterThan(300)
    expect(ruta.distanciaM).toBeLessThan(360)
    expect(ruta.pasos.length).toBeGreaterThanOrEqual(2)
    const inicio = ruta.puntos[0]
    const fin = ruta.puntos[ruta.puntos.length - 1]
    expect(Math.abs(inicio.lat - 19.0)).toBeLessThan(0.001)
    expect(Math.abs(fin.lng - -98.199)).toBeLessThan(0.001)
  })

  it('lanza error si no hay calles en la zona', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ elements: [] }),
      })
    )
    await expect(
      calcularRuta({ lat: 19.044348, lng: -98.198483 }, { lat: 19.04, lng: -98.19 })
    ).rejects.toThrow('No hay calles en la zona')
  })

  it('lanza error si el destino está demasiado lejos', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ elements: [] }),
      })
    )
    await expect(
      calcularRuta({ lat: 19.044348, lng: -98.198483 }, { lat: 19.5, lng: -97.5 })
    ).rejects.toThrow('demasiado lejos')
  })

  it('limita los pasos a 10 y agrupa el resto en uno final', async () => {
    const elements: Array<{
      type: string
      tags: Record<string, string>
      geometry: Array<{ lat: number; lon: number }>
    }> = []
    const names = Array.from({ length: 20 }, (_, i) => `Calle ${i + 1}`)
    for (let i = 0; i < names.length; i++) {
      elements.push({
        type: 'way',
        tags: { highway: 'residential', name: names[i] },
        geometry: [
          { lat: 19.0 + i * 0.0005, lon: -98.2 },
          { lat: 19.0 + (i + 1) * 0.0005, lon: -98.2 },
        ],
      })
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ elements }),
      })
    )
    const ruta = await calcularRuta(
      { lat: 19.0001, lng: -98.2001 },
      { lat: 19.0099, lng: -98.1999 }
    )
    expect(ruta.pasos.length).toBe(10)
    const ultimo = ruta.pasos[ruta.pasos.length - 1]
    expect(ultimo.instruccion).toContain('destino')
    expect(ultimo.distanciaM).toBeGreaterThan(500)
  })

  it('ancla origen y destino en la componente principal aunque haya calles aisladas cerca', async () => {
    const elements = [
      {
        type: 'way',
        tags: { highway: 'service', name: 'Calle Aislada' },
        geometry: [
          { lat: 19.0, lon: -98.2005 },
          { lat: 19.0003, lon: -98.2005 },
        ],
      },
      {
        type: 'way',
        tags: { highway: 'residential', name: 'Calle Principal' },
        geometry: [
          { lat: 19.0, lon: -98.199 },
          { lat: 19.0005, lon: -98.199 },
          { lat: 19.001, lon: -98.199 },
        ],
      },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ elements }),
      })
    )
    const ruta = await calcularRuta(
      { lat: 19.0002, lng: -98.2004 },
      { lat: 19.0005, lng: -98.1989 }
    )
    expect(ruta.puntos.length).toBeGreaterThanOrEqual(2)
    const inicio = ruta.puntos[0]
    expect(Math.abs(inicio.lng - -98.199)).toBeLessThan(0.001)
  })

  it('divide rutas largas en tramos y concatena el resultado', async () => {
    const geometry = []
    for (let i = 0; i <= 20; i++) {
      geometry.push({ lat: 19.0 + i * 0.005, lon: -98.2 })
    }
    const elements = [
      {
        type: 'way',
        tags: { highway: 'primary', name: 'Avenida Larga' },
        geometry,
      },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ elements }),
      })
    )
    const ruta = await calcularRuta(
      { lat: 19.0, lng: -98.2001 },
      { lat: 19.1, lng: -98.1999 }
    )
    expect(ruta.distanciaM).toBeGreaterThan(11000)
    expect(ruta.distanciaM).toBeLessThan(11300)
    expect(ruta.puntos.length).toBeGreaterThanOrEqual(20)
    expect(ruta.pasos.length).toBeGreaterThanOrEqual(1)
    expect(ruta.pasos.length).toBeLessThanOrEqual(10)
  })
})
export interface PuntoRuta {
  lat: number
  lng: number
}

export interface PasoRuta {
  instruccion: string
  distanciaM: number
  lat: number
  lng: number
}

export interface RutaCalculada {
  puntos: PuntoRuta[]
  distanciaM: number
  pasos: PasoRuta[]
}

export interface TiemposEstimados {
  auto: string
  bicicleta: string
  caminando: string
}

interface Nodo {
  id: number
  lat: number
  lng: number
  vecinos: { id: number; dist: number }[]
  nombre?: string
}

interface ElementoOSM {
  type: string
  tags?: { name?: string }
  geometry?: { lat: number; lon: number }[]
}

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
]

const VELOCIDAD_KMH = {
  auto: 28,
  bicicleta: 15,
  caminando: 4.8,
} as const

const PAD_BBOX = 0.008
const TIMEOUT_OVERPASS_MS = 20000
const MAX_RONDAS = 2
const RETRY_ESPERA_MS = 1000
const RUTA_MAX_M = 30000
const CHUNK_MAX_M = 7000
const PASOS_MAX = 10

export function haversine(a: PuntoRuta, b: PuntoRuta): number {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function formatoDistancia(distanciaM: number): string {
  if (distanciaM < 1000) return `${Math.round(distanciaM)} m`
  return `${(distanciaM / 1000).toFixed(1)} km`
}

export function formatoTiempo(minutos: number): string {
  const redondeado = Math.max(1, Math.ceil(minutos))
  if (redondeado < 60) return `${redondeado} min`
  const h = Math.floor(redondeado / 60)
  const m = redondeado % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

export function estimarTiempos(distanciaM: number): TiemposEstimados {
  return {
    auto: formatoTiempo((distanciaM / 1000 / VELOCIDAD_KMH.auto) * 60),
    bicicleta: formatoTiempo((distanciaM / 1000 / VELOCIDAD_KMH.bicicleta) * 60),
    caminando: formatoTiempo((distanciaM / 1000 / VELOCIDAD_KMH.caminando) * 60),
  }
}

function bboxDePuntos(a: PuntoRuta, b: PuntoRuta, pad = PAD_BBOX): string {
  const minLat = Math.min(a.lat, b.lat) - pad
  const maxLat = Math.max(a.lat, b.lat) + pad
  const minLng = Math.min(a.lng, b.lng) - pad
  const maxLng = Math.max(a.lng, b.lng) + pad
  return `(${minLat},${minLng},${maxLat},${maxLng})`
}

// Una ronda: consulta TODOS los mirrors de Overpass en paralelo y gana la primera respuesta exitosa
function consultarRonda(query: string): Promise<{ datos?: { elements: ElementoOSM[] }; error?: unknown }> {
  return new Promise((resolveFinal) => {
    const controles = OVERPASS_URLS.map(() => new AbortController())
    const timeouts = controles.map((control) =>
      setTimeout(() => control.abort(), TIMEOUT_OVERPASS_MS)
    )
    let pendientes = OVERPASS_URLS.length
    let ultimoError: unknown = null

    const abortarTodo = () => {
      timeouts.forEach((t) => clearTimeout(t))
      controles.forEach((control) => control.abort())
    }

    OVERPASS_URLS.forEach((url, i) => {
      fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'MujerES/1.0 (sitio de concientizacion)',
        },
        signal: controles[i].signal,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data = (await res.json()) as { elements: ElementoOSM[] }
          abortarTodo()
          resolveFinal({ datos: data })
        })
        .catch((e) => {
          ultimoError ??= e
          if (--pendientes === 0) {
            abortarTodo()
            resolveFinal({ error: ultimoError })
          }
        })
    })
  })
}

// Con reintento: si todos los mirrors fallan (504/429/red), espera y vuelve a intentar una vez más
async function consultarOverpass(query: string): Promise<{ elements: ElementoOSM[] }> {
  let ultimoError: unknown = null
  for (let ronda = 0; ronda < MAX_RONDAS; ronda++) {
    if (ronda > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_ESPERA_MS))
    }
    const resultado = await consultarRonda(query)
    if (resultado.datos) return resultado.datos
    ultimoError = resultado.error
  }
  throw ultimoError instanceof Error ? ultimoError : new Error('No se pudo consultar Overpass')
}

export function construirGrafo(elements: ElementoOSM[]): Map<number, Nodo> {
  const nodos = new Map<number, Nodo>()
  const porCoordenada = new Map<string, number>()

  const claveCoord = (lat: number, lng: number): string =>
    `${lat.toFixed(7)},${lng.toFixed(7)}`

  const getNodo = (lat: number, lng: number, nombre?: string): Nodo => {
    const clave = claveCoord(lat, lng)
    const existente = porCoordenada.get(clave)
    if (existente !== undefined) {
      const n = nodos.get(existente)!
      if (nombre && !n.nombre) n.nombre = nombre
      return n
    }
    const id = nodos.size + 1
    const n: Nodo = { id, lat, lng, vecinos: [], nombre }
    nodos.set(id, n)
    porCoordenada.set(clave, id)
    return n
  }

  const procesarWay = (way: ElementoOSM) => {
    const coords = way.geometry
    const nombre = way.tags?.name
    if (!coords || coords.length < 2) return

    for (let i = 0; i < coords.length; i++) {
      const a = getNodo(coords[i].lat, coords[i].lon, nombre)
      if (i > 0) {
        const b = getNodo(coords[i - 1].lat, coords[i - 1].lon, nombre)
        const dist = haversine(a, b)
        if (!a.vecinos.some((v) => v.id === b.id)) a.vecinos.push({ id: b.id, dist })
        if (!b.vecinos.some((v) => v.id === a.id)) b.vecinos.push({ id: a.id, dist })
      }
    }
  }

  for (const el of elements) {
    if (el.type === 'way') procesarWay(el)
  }
  return nodos
}

// Etiqueta cada nodo con el id de su componente conexa (BFS iterativo, O(V+E))
function etiquetarComponentes(nodos: Map<number, Nodo>): number[] {
  const componentes = new Array<number>(nodos.size + 1).fill(-1)
  let comp = 0
  for (const id of nodos.keys()) {
    if (componentes[id] !== -1) continue
    const pila = [id]
    componentes[id] = comp
    while (pila.length > 0) {
      const actual = pila.pop()!
      for (const vecino of nodos.get(actual)!.vecinos) {
        if (componentes[vecino.id] === -1) {
          componentes[vecino.id] = comp
          pila.push(vecino.id)
        }
      }
    }
    comp++
  }
  return componentes
}

function componenteMayor(nodos: Map<number, Nodo>, componentes: number[]): number {
  const tam = new Map<number, number>()
  for (const n of nodos.values()) {
    const c = componentes[n.id]
    if (c >= 0) tam.set(c, (tam.get(c) ?? 0) + 1)
  }
  let mejor = -1
  let mejorTam = -1
  for (const [c, t] of tam) {
    if (t > mejorTam) {
      mejorTam = t
      mejor = c
    }
  }
  return mejor
}

// Nodo más cercano al punto DENTRO de la componente indicada (evita islas desconectadas)
function nodoMasCercanoDe(
  nodos: Map<number, Nodo>,
  componentes: number[],
  comp: number,
  punto: PuntoRuta
): Nodo | null {
  let mejor: Nodo | null = null
  let mejorDist = Infinity
  for (const n of nodos.values()) {
    if (componentes[n.id] !== comp) continue
    const d = haversine(n, punto)
    if (d < mejorDist) {
      mejorDist = d
      mejor = n
    }
  }
  return mejor
}

interface EntradaCola {
  id: number
  f: number
}

// Min-heap binario para la lista abierta del A* (pop en O(log n))
class MinHeap {
  private items: EntradaCola[] = []

  get size(): number {
    return this.items.length
  }

  push(item: EntradaCola): void {
    const a = this.items
    a.push(item)
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p].f <= a[i].f) break
      const tmp = a[p]
      a[p] = a[i]
      a[i] = tmp
      i = p
    }
  }

  pop(): EntradaCola | undefined {
    const a = this.items
    if (a.length === 0) return undefined
    const top = a[0]
    const last = a.pop()!
    if (a.length > 0) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l].f < a[m].f) m = l
        if (r < a.length && a[r].f < a[m].f) m = r
        if (m === i) break
        const tmp = a[i]
        a[i] = a[m]
        a[m] = tmp
        i = m
      }
    }
    return top
  }
}

function astar(
  nodos: Map<number, Nodo>,
  inicioId: number,
  finId: number
): { ids: number[]; distancia: number } {
  const cerrados = new Set<number>()
  const g = new Map<number, number>([[inicioId, 0]])
  const padre = new Map<number, number>()
  const cola = new MinHeap()
  const nodoFin = nodos.get(finId)!
  cola.push({ id: inicioId, f: haversine(nodos.get(inicioId)!, nodoFin) })

  while (cola.size > 0) {
    const actualId = cola.pop()!.id
    if (cerrados.has(actualId)) continue

    if (actualId === finId) {
      const ruta: number[] = []
      let cur = actualId
      while (cur !== undefined) {
        ruta.push(cur)
        cur = padre.get(cur)!
      }
      return { ids: ruta.reverse(), distancia: g.get(actualId) ?? 0 }
    }

    cerrados.add(actualId)

    const actual = nodos.get(actualId)!
    for (const vecino of actual.vecinos) {
      if (cerrados.has(vecino.id)) continue
      const gTentativo = (g.get(actualId) ?? 0) + vecino.dist
      if (gTentativo < (g.get(vecino.id) ?? Infinity)) {
        padre.set(vecino.id, actualId)
        g.set(vecino.id, gTentativo)
        cola.push({ id: vecino.id, f: gTentativo + haversine(nodos.get(vecino.id)!, nodoFin) })
      }
    }
  }
  throw new Error('No se encontró ruta entre los puntos')
}

function nombreCalle(nodos: Map<number, Nodo>, ids: number[]): string | undefined {
  for (const id of ids) {
    const n = nodos.get(id)
    if (n?.nombre) return n.nombre
  }
  return undefined
}

function construirPasos(
  nodos: Map<number, Nodo>,
  ids: number[]
): PasoRuta[] {
  const pasos: PasoRuta[] = []
  let desde = 0

  while (desde < ids.length - 1) {
    const calleActual = nombreCalle(nodos, ids.slice(desde, desde + 3))
    let hasta = desde
    while (hasta < ids.length - 1) {
      const sig = nombreCalle(nodos, ids.slice(hasta + 1, hasta + 4))
      if (sig !== undefined && calleActual !== undefined && sig !== calleActual) break
      hasta++
    }
    if (hasta === desde) hasta = desde + 1

    const inicio = nodos.get(ids[desde])!
    const fin = nodos.get(ids[hasta])!
    const distancia = haversine(inicio, fin)
    pasos.push({
      instruccion: calleActual ? `Continúa por ${calleActual}` : `Continúa ${Math.round(distancia)} m`,
      distanciaM: Math.round(distancia),
      lat: fin.lat,
      lng: fin.lng,
    })
    desde = hasta
  }
  return pasos
}

// Fusiona pasos consecutivos con la misma instrucción (une tramos de la misma calle)
function fusionarPasos(pasos: PasoRuta[]): PasoRuta[] {
  const out: PasoRuta[] = []
  for (const paso of pasos) {
    const ultimo = out[out.length - 1]
    if (ultimo && ultimo.instruccion === paso.instruccion) {
      ultimo.distanciaM += paso.distanciaM
      ultimo.lat = paso.lat
      ultimo.lng = paso.lng
    } else {
      out.push({ ...paso })
    }
  }
  return out
}

// Limita los pasos a los PASOS_MAX más importantes y agrupa el resto en uno final
function limitarPasos(pasos: PasoRuta[]): PasoRuta[] {
  if (pasos.length <= PASOS_MAX) return pasos
  const primeros = pasos.slice(0, PASOS_MAX - 1)
  const resto = pasos.slice(PASOS_MAX - 1)
  const distanciaResto = resto.reduce((total, p) => total + p.distanciaM, 0)
  const ultimoResto = resto[resto.length - 1]
  primeros.push({
    instruccion: `Continúa ${formatoDistancia(distanciaResto)} hasta llegar al destino`,
    distanciaM: distanciaResto,
    lat: ultimoResto.lat,
    lng: ultimoResto.lng,
  })
  return primeros
}

// Divide la ruta en tramos de a lo más CHUNK_MAX_M para mantener queries chicas y rápidas
function partirEnTramos(a: PuntoRuta, b: PuntoRuta, maxM: number): PuntoRuta[] {
  const dist = haversine(a, b)
  const tramos = Math.max(1, Math.ceil(dist / maxM))
  const pts: PuntoRuta[] = []
  for (let i = 0; i <= tramos; i++) {
    pts.push({
      lat: a.lat + ((b.lat - a.lat) * i) / tramos,
      lng: a.lng + ((b.lng - a.lng) * i) / tramos,
    })
  }
  return pts
}

// Calcula la ruta dentro de una sola bbox (un tramo)
async function calcularTramo(
  origen: PuntoRuta,
  destino: PuntoRuta
): Promise<RutaCalculada> {
  const query = `
    [out:json][timeout:40];
    way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)$"]${bboxDePuntos(origen, destino)};
    (._;>;);
    out geom;
  `

  const data = await consultarOverpass(query)
  const nodos = construirGrafo(data.elements)
  if (nodos.size === 0) throw new Error('No hay calles en la zona')

  const componentes = etiquetarComponentes(nodos)
  const comp = componenteMayor(nodos, componentes)
  if (comp < 0) throw new Error('No se pudo ubicar en la red de calles')

  // Snap dentro de la componente principal: garantiza que origen y destino estén conectados
  const ini = nodoMasCercanoDe(nodos, componentes, comp, origen)
  const fin = nodoMasCercanoDe(nodos, componentes, comp, destino)
  if (!ini || !fin) throw new Error('No se pudo ubicar en la red de calles')

  const { ids, distancia } = astar(nodos, ini.id, fin.id)
  const puntos = ids.map((id) => {
    const n = nodos.get(id)!
    return { lat: n.lat, lng: n.lng }
  })
  const pasos = construirPasos(nodos, ids)

  return { puntos, distanciaM: Math.round(distancia), pasos }
}

export async function calcularRuta(
  origen: PuntoRuta,
  destino: PuntoRuta
): Promise<RutaCalculada> {
  const aerolinea = haversine(origen, destino)
  if (aerolinea > RUTA_MAX_M) {
    throw new Error('El destino está demasiado lejos para calcular una ruta aquí')
  }

  // Rutas lejanas se dividen en tramos: cada tramo usa una bbox chica (más rápida, menos 504)
  const tramos = partirEnTramos(origen, destino, CHUNK_MAX_M)
  const todosLosPuntos: PuntoRuta[] = []
  const todosLosPasos: PasoRuta[] = []
  let distanciaTotal = 0
  let fallidos = 0
  let ultimoError: unknown = null

  for (let i = 0; i < tramos.length - 1; i++) {
    const a = tramos[i]
    const b = tramos[i + 1]
    try {
      const tramo = await calcularTramo(a, b)
      for (const p of tramo.puntos) {
        const ultimo = todosLosPuntos[todosLosPuntos.length - 1]
        if (ultimo && ultimo.lat === p.lat && ultimo.lng === p.lng) continue
        todosLosPuntos.push(p)
      }
      distanciaTotal += tramo.distanciaM
      todosLosPasos.push(...tramo.pasos)
    } catch (e) {
      // Fallback: el tramo se une en línea recta para no romper toda la ruta
      fallidos++
      ultimoError = e
      todosLosPuntos.push(a, b)
      const distancia = haversine(a, b)
      distanciaTotal += distancia
      todosLosPasos.push({
        instruccion: `Continúa ${formatoDistancia(distancia)} hasta el siguiente tramo`,
        distanciaM: Math.round(distancia),
        lat: b.lat,
        lng: b.lng,
      })
    }
  }

  if (fallidos === tramos.length - 1) {
    throw ultimoError instanceof Error ? ultimoError : new Error('No se pudo calcular la ruta en este momento, intentá de nuevo')
  }

  const pasos = limitarPasos(fusionarPasos(todosLosPasos))

  return { puntos: todosLosPuntos, distanciaM: Math.round(distanciaTotal), pasos }
}
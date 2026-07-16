import { useEffect, useRef } from 'react'
import { Renderer, Camera, Transform, Plane, Program, Mesh, Texture } from 'ogl'

interface CardData {
  id: string
  title: string
  subtitle?: string
  completed?: boolean
}

interface OnboardingGalleryProps {
  cards: CardData[]
  onCardSelect: (index: number) => void
  className?: string
}

const FONT = 'bold 28px Inter, system-ui, sans-serif'

function createTextCanvas(text: string, subtitle: string | undefined, completed: boolean, width = 512, height = 320) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#1a1c2e'
  ctx.beginPath()
  ctx.roundRect(0, 0, width, height, 16)
  ctx.fill()

  if (completed) {
    ctx.fillStyle = '#065f46'
    ctx.beginPath()
    ctx.roundRect(0, 0, width, height, 16)
    ctx.fill()
    ctx.fillStyle = '#6ee7b7'
    ctx.font = '36px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('✓', width / 2, height / 2 - 12)
    ctx.fillStyle = '#a7f3d0'
    ctx.font = '16px system-ui, sans-serif'
    ctx.fillText('Completado', width / 2, height / 2 + 28)
    return canvas
  }

  ctx.fillStyle = '#ffffff'
  ctx.font = FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const maxWidth = width - 40
  const lines: string[] = []
  const words = text.split(' ')
  let line = ''
  for (const word of words) {
    const test = line + (line ? ' ' : '') + word
    if (ctx.measureText(test).width > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)

  const lineHeight = 32
  const totalHeight = lines.length * lineHeight
  let y = (height - totalHeight) / 2 + lineHeight / 2

  for (const l of lines) {
    ctx.fillText(l, width / 2, y)
    y += lineHeight
  }

  if (subtitle) {
    ctx.fillStyle = '#9ca3af'
    ctx.font = '14px system-ui, sans-serif'
    ctx.fillText(subtitle, width / 2, height - 30)
  }

  ctx.fillStyle = 'rgba(255,255,255,0.15)'
  ctx.font = '12px system-ui, sans-serif'
  ctx.fillText('Toca para responder', width / 2, height - 12)

  return canvas
}

export default function OnboardingGallery({ cards, onCardSelect, className }: OnboardingGalleryProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<{
    destroy: () => void
    getCardAt: (x: number, y: number) => number | null
  } | null>(null)

  useEffect(() => {
    if (!containerRef.current || cards.length === 0) return

    const container = containerRef.current
    const renderer = new Renderer({
      alpha: false,
      antialias: true,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
    })
    const gl = renderer.gl
    gl.clearColor(0.98, 0.98, 0.98, 1)
    container.appendChild(gl.canvas as HTMLCanvasElement)

    const camera = new Camera(gl)
    camera.fov = 50
    camera.position.z = 14

    const scene = new Transform()

    const planeGeo = new Plane(gl, { widthSegments: 1, heightSegments: 1 })

    interface CardMesh {
      mesh: Mesh
      canvasTexture: { update: () => void }
      originalX: number
    }

    const cardMeshes: CardMesh[] = []
    const spacing = 4.5

    cards.forEach((card, i) => {
      const canvas = createTextCanvas(card.title, card.subtitle, card.completed ?? false)
      const texture = new Texture(gl, { generateMipmaps: false, image: canvas })
      const program = new Program(gl, {
        vertex: `
          attribute vec3 position;
          attribute vec2 uv;
          uniform mat4 modelViewMatrix;
          uniform mat4 projectionMatrix;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragment: `
          precision highp float;
          uniform sampler2D tMap;
          varying vec2 vUv;
          void main() {
            vec4 color = texture2D(tMap, vUv);
            if (color.a < 0.1) discard;
            gl_FragColor = color;
          }
        `,
        uniforms: { tMap: { value: texture } },
        transparent: false,
      })
      const mesh = new Mesh(gl, { geometry: planeGeo, program })
      const xPos = (i - (cards.length - 1) / 2) * spacing
      mesh.position.set(xPos, 0, 0)
      mesh.scale.set(4, 2.5, 1)
      mesh.setParent(scene)

      cardMeshes.push({
        mesh,
        canvasTexture: { update: () => {} },
        originalX: xPos,
      })
    })

    let aspect = container.clientWidth / container.clientHeight
    let viewportWidth: number
    let viewportHeight: number

    function updateViewport() {
      const fov = (camera.fov * Math.PI) / 180
      viewportHeight = 2 * Math.tan(fov / 2) * camera.position.z
      viewportWidth = viewportHeight * aspect
      renderer.setSize(container.clientWidth, container.clientHeight)
    }

    updateViewport()

    let scrollTarget = 0
    let scrollCurrent = 0
    let isDown = false
    let startX = 0
    let scrollPosStart = 0

    function update() {
      scrollCurrent += (scrollTarget - scrollCurrent) * 0.08
      const H = viewportWidth / 2

      cardMeshes.forEach((cm) => {
        const x = cm.originalX - scrollCurrent
        cm.mesh.position.x = x

        const absX = Math.abs(x)
        const bend = 2
        const B_abs = Math.abs(bend)
        const R = (H * H + B_abs * B_abs) / (2 * B_abs)
        const effectiveX = Math.min(absX, H)
        const arc = R - Math.sqrt(R * R - effectiveX * effectiveX)
        cm.mesh.position.y = -arc
        cm.mesh.rotation.z = -Math.sign(x || 1) * Math.asin(effectiveX / R)

        const centerDist = absX / H
        const scale = 1 - Math.min(centerDist * 0.3, 0.4)
        cm.mesh.scale.set(4 * scale, 2.5 * scale, 1)
      })

      renderer.render({ scene, camera })
      requestAnimationFrame(update)
    }

    requestAnimationFrame(update)

    function getCardAt(x: number, _y: number): number | null {
      const rect = container.getBoundingClientRect()
      const px = ((x - rect.left) / rect.width) * 2 - 1

      const H = viewportWidth / 2
      const worldX = px * H + scrollCurrent

      let closestIdx = -1
      let closestDist = Infinity
      for (let i = 0; i < cardMeshes.length; i++) {
        const dist = Math.abs(cardMeshes[i].originalX - worldX)
        if (dist < closestDist) {
          closestDist = dist
          closestIdx = i
        }
      }

      if (closestDist < spacing * 1.2) return closestIdx
      return null
    }

    function getCenterCardIndex(): number {
      let closestIdx = 0
      let closestDist = Infinity
      for (let i = 0; i < cardMeshes.length; i++) {
        const dist = Math.abs(cardMeshes[i].originalX - scrollCurrent)
        if (dist < closestDist) {
          closestDist = dist
          closestIdx = i
        }
      }
      return closestIdx
    }

    function snapToCard(idx: number) {
      scrollTarget = cardMeshes[idx].originalX
    }

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      isDown = true
      scrollPosStart = scrollTarget
      startX = 'touches' in e ? e.touches[0].clientX : e.clientX
    }

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      if (!isDown) return
      const x = 'touches' in e ? e.touches[0].clientX : e.clientX
      const dx = (startX - x) * 0.04
      scrollTarget = scrollPosStart + dx
    }

    const handlePointerUp = (e: MouseEvent | TouchEvent) => {
      if (!isDown) return
      isDown = false

      const endX = 'changedTouches' in e ? e.changedTouches[0].clientX : (e as MouseEvent).clientX
      const dist = Math.abs(startX - endX)

      if (dist < 10) {
        const clientX = 'changedTouches' in e ? e.changedTouches[0].clientX : (e as MouseEvent).clientX
        const clientY = 'changedTouches' in e ? e.changedTouches[0].clientY : (e as MouseEvent).clientY
        const idx = getCardAt(clientX, clientY)
        if (idx !== null) {
          snapToCard(idx)
          onCardSelect(idx)
          return
        }
      }

      const centerIdx = getCenterCardIndex()
      snapToCard(centerIdx)
    }

    const handleWheel = (e: WheelEvent) => {
      scrollTarget += e.deltaY * 0.015
    }

    container.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)
    container.addEventListener('touchstart', handlePointerDown, { passive: true })
    window.addEventListener('touchmove', handlePointerMove, { passive: true })
    window.addEventListener('touchend', handlePointerUp)
    container.addEventListener('wheel', handleWheel, { passive: true })

    const handleResize = () => {
      aspect = container.clientWidth / container.clientHeight
      updateViewport()
      camera.perspective({ aspect })
    }
    window.addEventListener('resize', handleResize)

    appRef.current = {
      destroy: () => {
        container.removeEventListener('mousedown', handlePointerDown)
        window.removeEventListener('mousemove', handlePointerMove)
        window.removeEventListener('mouseup', handlePointerUp)
        container.removeEventListener('touchstart', handlePointerDown)
        window.removeEventListener('touchmove', handlePointerMove)
        window.removeEventListener('touchend', handlePointerUp)
        container.removeEventListener('wheel', handleWheel)
        window.removeEventListener('resize', handleResize)
        if (gl.canvas.parentNode) gl.canvas.parentNode.removeChild(gl.canvas as HTMLCanvasElement)
      },
      getCardAt,
    }

    return () => {
      if (appRef.current) appRef.current.destroy()
    }
  }, [cards, onCardSelect])

  return (
    <div
      ref={containerRef}
      className={`onboarding-gallery ${className ?? ''}`}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', cursor: 'grab' }}
    />
  )
}

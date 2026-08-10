import { useState, useCallback, useRef } from 'react'
import Cropper, { type Area, type Point } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import { sileo } from 'sileo'

interface AvatarCropModalProps {
  imageSrc: string
  onCancel: () => void
  onConfirm: (blob: Blob) => void
}

const CROP_SIZE = 512

async function getCroppedAvatarBlob(
  imageSrc: string,
  crop: Area,
  viewport: { width: number; height: number }
): Promise<Blob> {
  const img = new Image()
  img.src = imageSrc
  await img.decode()
  // croppedAreaPixels viven en el espacio del MEDIA MOSTRADO (el <img> del
  // cropper, cover-fit dentro del viewport, en px CSS). Reproducimos ese mismo
  // espacio con un canvas del tamaño mostrado y muestreamos el crop DIRECTAMENTE
  // (mismos píxeles, sin conversión) para que el encuadre coincida 1:1.
  const coverScale = Math.max(
    viewport.width / img.naturalWidth,
    viewport.height / img.naturalHeight
  )
  const dispW = Math.max(1, Math.round(img.naturalWidth * coverScale))
  const dispH = Math.max(1, Math.round(img.naturalHeight * coverScale))
  const shown = document.createElement('canvas')
  shown.width = dispW
  shown.height = dispH
  const shownCtx = shown.getContext('2d')
  if (!shownCtx) throw new Error('No se pudo procesar la imagen')
  shownCtx.drawImage(img, 0, 0, dispW, dispH)

  const canvas = document.createElement('canvas')
  canvas.width = CROP_SIZE
  canvas.height = CROP_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la imagen')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(shown, crop.x, crop.y, crop.width, crop.height, 0, 0, CROP_SIZE, CROP_SIZE)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.85)
  )
  if (!blob) throw new Error('No se pudo procesar la imagen')
  return blob
}

export default function AvatarCropModal({ imageSrc, onCancel, onConfirm }: AvatarCropModalProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [processing, setProcessing] = useState(false)
  const viewportRef = useRef<HTMLDivElement>(null)

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels)
  }, [])

  const handleConfirm = async () => {
    if (!croppedAreaPixels || processing) return
    const viewport = viewportRef.current
    if (!viewport || viewport.clientWidth === 0 || viewport.clientHeight === 0) return
    setProcessing(true)
    try {
      const blob = await getCroppedAvatarBlob(
        imageSrc,
        croppedAreaPixels,
        { width: viewport.clientWidth, height: viewport.clientHeight }
      )
      onConfirm(blob)
    } catch (e) {
      sileo.error({
        title: 'No se pudo recortar',
        description: e instanceof Error ? e.message : 'Intentá con otra foto',
      })
      setProcessing(false)
    }
  }

  return (
    <div className="avatar-crop-overlay" role="dialog" aria-modal="true" aria-label="Recortar foto de perfil">
      <div className="avatar-crop-card">
        <h3 className="avatar-crop-title">Ajustá tu foto</h3>
        <p className="avatar-crop-subtitle">Movela y hacé zoom para elegir el encuadre</p>

        <div className="avatar-crop-viewport" ref={viewportRef}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            minZoom={1}
            maxZoom={3}
            cropShape="rect"
            showGrid={false}
            zoomWithScroll={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="avatar-crop-zoom">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" x2="16.65" y1="21" y2="16.65" />
            <line x1="8" x2="14" y1="11" y2="11" />
          </svg>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom de la foto"
          />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" x2="16.65" y1="21" y2="16.65" />
            <line x1="11" x2="11" y1="8" y2="14" />
            <line x1="8" x2="14" y1="11" y2="11" />
          </svg>
        </div>

        <div className="avatar-crop-actions">
          <button
            className="avatar-crop-btn avatar-crop-cancel"
            onClick={onCancel}
            disabled={processing}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="avatar-crop-btn avatar-crop-confirm"
            onClick={handleConfirm}
            disabled={processing || !croppedAreaPixels}
            type="button"
          >
            {processing ? 'Procesando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
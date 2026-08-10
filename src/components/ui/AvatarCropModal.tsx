import { useState, useCallback } from 'react'
import Cropper, { type Area, type Point } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import { sileo } from 'sileo'

interface AvatarCropModalProps {
  imageSrc: string
  onCancel: () => void
  onConfirm: (blob: Blob) => void
}

const CROP_SIZE = 512

async function getCroppedAvatarBlob(imageSrc: string, crop: Area): Promise<Blob> {
  const response = await fetch(imageSrc)
  const image = await createImageBitmap(await response.blob(), {
    imageOrientation: 'from-image',
  })
  const canvas = document.createElement('canvas')
  canvas.width = CROP_SIZE
  canvas.height = CROP_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la imagen')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const sx = (crop.x / 100) * image.width
  const sy = (crop.y / 100) * image.height
  const sw = (crop.width / 100) * image.width
  const sh = (crop.height / 100) * image.height
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, CROP_SIZE, CROP_SIZE)
  image.close()
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

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels)
  }, [])

  const handleConfirm = async () => {
    if (!croppedAreaPixels || processing) return
    setProcessing(true)
    try {
      const blob = await getCroppedAvatarBlob(imageSrc, croppedAreaPixels)
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

        <div className="avatar-crop-viewport">
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
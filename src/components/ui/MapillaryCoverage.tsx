import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.vectorgrid'

const MAPILLARY_TOKEN = import.meta.env.VITE_MAPILLARY_TOKEN || ''

const TILE_URL = `https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token=${MAPILLARY_TOKEN}`

// Hide overview (polygon clusters cause "fog" effect)
// Only show: sequence lines (coverage routes) + image dots (individual images)
const VECTOR_TILE_STYLES = {
  overview: {}, // Empty = not rendered
  sequence: {
    color: '#05CB63',
    weight: 2,
    opacity: 0.7,
  },
  image: {
    radius: 4,
    fillColor: '#05CB63',
    color: '#ffffff',
    weight: 1,
    fillOpacity: 0.9,
  },
}

interface MapillaryCoverageProps {
  active: boolean
  onImageClick?: (imageId: string) => void
}

export default function MapillaryCoverage({ active, onImageClick }: MapillaryCoverageProps) {
  const map = useMap()
  const layerRef = useRef<L.VectorGrid.Protobuf | null>(null)

  useEffect(() => {
    if (!active || !MAPILLARY_TOKEN) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
      return
    }

    const vectorGrid = L.vectorGrid.protobuf(TILE_URL, {
      vectorTileLayerStyles: VECTOR_TILE_STYLES,
      interactive: true,
      maxNativeZoom: 14,
      minNativeZoom: 6,
      // Use SVG renderer — Canvas has fakeStop compatibility issue with Leaflet 1.8+
      rendererFactory: L.svg.tile,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 2,
    } as L.VectorGrid.ProtobufOptions)

    if (onImageClick) {
      vectorGrid.on('click', (e: L.LeafletEvent) => {
        const layer = (e as L.LeafletMouseEvent).layer as L.Layer & { properties?: Record<string, unknown> }
        const prop = layer?.properties
        if (prop?.id) {
          onImageClick(String(prop.id))
        }
      })
    }

    vectorGrid.addTo(map)
    layerRef.current = vectorGrid

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
    }
  }, [active, map, onImageClick])

  return null
}

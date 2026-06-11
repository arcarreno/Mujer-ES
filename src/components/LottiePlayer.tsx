import { useEffect, useRef } from 'react'
import lottie from 'lottie-web'

interface LottiePlayerProps {
  animationData: unknown
  className?: string
  loop?: boolean
  autoplay?: boolean
}

export default function LottiePlayer({ animationData, className, loop = true, autoplay = true }: LottiePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const anim = lottie.loadAnimation({
      container: containerRef.current,
      renderer: 'svg',
      loop,
      autoplay,
      animationData: animationData as any,
    })

    return () => {
      anim.destroy()
    }
  }, [animationData, loop, autoplay])

  return <div ref={containerRef} className={className} />
}

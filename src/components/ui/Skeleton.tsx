interface SkeletonProps {
  lines?: number
  className?: string
}

export default function Skeleton({ lines = 3, className = '' }: SkeletonProps) {
  return (
    <div className={`skeleton ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton-line" style={{ width: i === lines - 1 ? '60%' : '100%' }} />
      ))}
    </div>
  )
}

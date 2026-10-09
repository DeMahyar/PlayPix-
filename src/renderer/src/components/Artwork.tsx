// PlayPix renderer — artwork with generated placeholder fallback
import { useEffect, useState } from 'react'
import { artUrl } from '../lib/api'
import { hueFromString, initials } from '../lib/utils'

export function Artwork({
  artKey,
  name,
  size,
  radius = 10,
  className
}: {
  artKey: string | null | undefined
  name: string
  size?: number
  radius?: number | string
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [artKey])

  const style: React.CSSProperties = {
    width: size ?? '100%',
    height: size ?? '100%',
    borderRadius: radius,
    ...(className ? {} : {})
  }

  if (!artKey || failed) {
    const hue = hueFromString(name || 'playpix')
    return (
      <div
        className={`art-placeholder ${className ?? ''}`}
        style={{
          ...style,
          background: `linear-gradient(135deg, hsl(${hue} 42% 62%), hsl(${(hue + 46) % 360} 48% 44%))`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.9)',
          fontWeight: 700,
          fontSize: typeof size === 'number' ? Math.max(11, size / 3.2) : 18,
          letterSpacing: '0.5px',
          flexShrink: 0
        }}
      >
        {initials(name || '♪')}
      </div>
    )
  }

  return (
    <img
      src={artUrl(artKey)}
      alt=""
      loading="lazy"
      draggable={false}
      className={className}
      style={{ ...style, objectFit: 'cover', flexShrink: 0 }}
      onError={() => setFailed(true)}
    />
  )
}

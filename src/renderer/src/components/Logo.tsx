import React from 'react'
import logoUrl from '../assets/logo.png'

interface LogoProps {
  size?: number
  className?: string
  alt?: string
  style?: React.CSSProperties
}

// PlayPix renderer — logo (glowing blue P play emblem)
export function Logo({ size = 30, className, alt = 'PlayPix', style }: LogoProps) {
  return (
    <img
      src={logoUrl}
      alt={alt}
      width={size}
      height={size}
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        display: 'inline-block',
        verticalAlign: 'middle',
        userSelect: 'none',
        pointerEvents: 'none',
        filter: 'drop-shadow(0 2px 8px rgba(63, 125, 255, 0.45))',
        ...style
      }}
      draggable={false}
    />
  )
}


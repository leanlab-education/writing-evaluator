'use client'

import Avatar from 'boring-avatars'

const PALETTE = [
  '#6366f1', '#06b6d4', '#10b981', '#f59e0b',
  '#f43f5e', '#8b5cf6', '#0ea5e9', '#f97316',
]

export function UserAvatar({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 overflow-hidden rounded-full"
      style={{ width: size, height: size }}
    >
      <Avatar size={size} name={name} variant="beam" colors={PALETTE} />
    </span>
  )
}

export function TeamAvatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 overflow-hidden rounded-full"
      style={{ width: size, height: size }}
    >
      <Avatar size={size} name={name} variant="ring" colors={PALETTE} />
    </span>
  )
}

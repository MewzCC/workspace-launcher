// 幽灵图标按钮：透明背景 + hover 浅底，对齐设计稿 .ghost-icon-btn
import React from 'react'
import './GhostIconButton.css'

function GhostIconButton({
  children,
  onClick,
  variant = 'default',
  size = 18,
  ariaLabel,
  className = '',
  disabled = false
}) {
  const classes = ['ghost-icon-btn']
  if (variant === 'danger') classes.push('danger')
  if (className) classes.push(className)

  return (
    <button
      type="button"
      className={classes.join(' ')}
      onClick={onClick}
      aria-label={ariaLabel}
      disabled={disabled}
      title={ariaLabel}
    >
      {children}
    </button>
  )
}

export default GhostIconButton
export { GhostIconButton }

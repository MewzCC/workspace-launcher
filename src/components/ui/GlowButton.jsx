// 发光按钮组件：支持 primary/secondary/ghost 三种风格，sm/md/lg 三种尺寸
import React from 'react'
import './GlowButton.css'

function GlowButton({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
  style,
  type = 'button'
}) {
  // 组合类名：glow-btn + 变体 + 尺寸 + 自定义
  const classes = [
    'glow-btn',
    `glow-btn--${variant}`,
    `glow-btn--${size}`,
    className
  ].filter(Boolean).join(' ')

  return (
    <button
      type={type}
      className={classes}
      onClick={onClick}
      disabled={disabled}
      style={style}
    >
      {children}
    </button>
  )
}

export default GlowButton

// 玻璃卡片组件：可复用的 Glassmorphism 容器
import React from 'react'
import './GlassCard.css'

function GlassCard({ children, className = '', onClick, hover = true, style }) {
  // 基础类名 + 传入的 className，hover 为 true 时加上 hoverable 启用悬浮动效
  const classes = ['glass-card']
  if (hover) classes.push('hoverable')
  if (className) classes.push(className)

  return (
    <div className={classes.join(' ')} onClick={onClick} style={style}>
      {children}
    </div>
  )
}

export default GlassCard

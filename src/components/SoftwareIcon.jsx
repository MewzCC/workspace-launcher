// 共享软件图标组件
// 优先显示从 exe/lnk 提取的真实图标（通过 app.getFileIcon），无则回退到 emoji
// 模块级缓存 + 批量预加载，所有页面共享同一份缓存，避免重复 IPC 调用
import React, { useState, useEffect } from 'react'
import { softwareApi } from '../lib/ipc'
import './SoftwareIcon.css'

// 模块级图标缓存：path(小写) -> dataURL
// 所有 SoftwareIcon 实例共享，避免重复提取
const iconCache = new Map()
// 正在请求中的路径集合，避免并发重复请求同一文件
const pending = new Set()

/**
 * 批量预加载图标到模块缓存
 * 用于扫描结果、软件库等列表场景，一次性批量提取而非逐个请求
 * @param {string[]} paths - exe/lnk 文件路径数组
 */
export async function preloadSoftwareIcons(paths) {
  const missing = paths.filter(
    (p) => p && !iconCache.has(p.toLowerCase()) && !pending.has(p.toLowerCase())
  )
  if (missing.length === 0) return
  // 标记为请求中
  missing.forEach((p) => pending.add(p.toLowerCase()))
  try {
    // 限制单批大小，避免 IPC 超时
    const batch = missing.slice(0, 50)
    const result = await softwareApi.getIcons(batch)
    if (result && !result.error) {
      for (const [fp, url] of Object.entries(result)) {
        iconCache.set(fp.toLowerCase(), url)
      }
    }
  } catch (_) {
    // 忽略错误，组件会回退到 emoji
  } finally {
    missing.forEach((p) => pending.delete(p.toLowerCase()))
  }
}

/**
 * 软件图标组件
 * @param {string} path - exe/lnk 文件路径（为空则直接显示 fallback）
 * @param {string} fallback - 回退 emoji（如 '📦'）
 * @param {string} size - 尺寸 'xs'(16px) | 'sm'(20px) | 'md'(28px) | 'lg'(32px)
 * @param {string} className - 额外样式类名
 */
function SoftwareIcon({ path, fallback = '📦', size = 'sm', className = '' }) {
  const [iconUrl, setIconUrl] = useState(() => {
    if (!path) return null
    return iconCache.get(path.toLowerCase()) || null
  })

  useEffect(() => {
    if (!path) {
      setIconUrl(null)
      return
    }
    const key = path.toLowerCase()
    // 已缓存直接用
    if (iconCache.has(key)) {
      setIconUrl(iconCache.get(key))
      return
    }
    // 正在请求中，跳过（批量预加载或其它实例正在获取）
    if (pending.has(key)) return
    pending.add(key)
    softwareApi
      .getIcon(path)
      .then((result) => {
        pending.delete(key)
        if (result && !result.error) {
          iconCache.set(key, result)
          setIconUrl(result)
        }
      })
      .catch(() => {
        pending.delete(key)
      })
  }, [path])

  if (iconUrl) {
    return (
      <img
        className={`software-icon-img software-icon-img--${size} ${className}`}
        src={iconUrl}
        alt=""
      />
    )
  }
  return <span className={className}>{fallback}</span>
}

export default SoftwareIcon
export { SoftwareIcon }

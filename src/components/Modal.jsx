// 通用模态框组件：全屏覆盖 + 居中玻璃面板
// 支持 ESC 关闭、点击遮罩关闭，可选底部按钮栏（取消/保存）
import React, { useEffect } from 'react'
import GlowButton from './ui/GlowButton'
import './Modal.css'

function Modal({
  title,
  children,
  onClose,
  onSave,
  saveText = '保存',
  cancelText = '取消'
}) {
  // ESC 键关闭
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  // 点击遮罩关闭（仅当点击目标为遮罩本身时触发，避免点击面板内部误关闭）
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-panel" role="dialog" aria-modal="true">
        {/* 顶部标题 + 关闭按钮 */}
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="关闭"
            type="button"
          >
            ×
          </button>
        </div>

        {/* 内容区 */}
        <div className="modal-body">{children}</div>

        {/* 底部按钮栏（传入 onSave 时显示） */}
        {onSave && (
          <div className="modal-footer">
            <GlowButton variant="ghost" size="md" onClick={onClose}>
              {cancelText}
            </GlowButton>
            <GlowButton variant="primary" size="md" onClick={onSave}>
              {saveText}
            </GlowButton>
          </div>
        )}
      </div>
    </div>
  )
}

export default Modal
export { Modal }

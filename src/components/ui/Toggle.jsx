// 开关组件：纯 CSS 实现的拨动开关，对齐设计稿 .toggle-switch
import React from 'react'
import './Toggle.css'

function Toggle({ checked, onChange, ariaLabel, disabled = false }) {
  return (
    <label className="toggle-switch">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-label={ariaLabel}
      />
      <span className="toggle-slider"></span>
    </label>
  )
}

export default Toggle
export { Toggle }

// 教程中心抽屉：左侧导航（平台模块分类）+ 右侧具体操作步骤
import React, { useState } from 'react'
import {
  Rocket, LayoutGrid, Box, Workflow, ScanLine, ListTree, Activity,
  Download, Settings as SettingsIcon, Cat, X
} from 'lucide-react'
import { TUTORIAL_SECTIONS } from '../data/tutorials'
import { useStore } from '../store/useStore'
import { useT } from '../hooks/useT'
import './TutorialDrawer.css'

const ICONS = {
  Rocket, LayoutGrid, Box, Workflow, ScanLine, ListTree, Activity,
  Download, Settings: SettingsIcon, Cat
}

function TutorialDrawer({ onClose }) {
  const t = useT()
  const language = useStore((s) => s.language)
  const [activeKey, setActiveKey] = useState(TUTORIAL_SECTIONS[0].key)
  const active = TUTORIAL_SECTIONS.find((section) => section.key === activeKey) || TUTORIAL_SECTIONS[0]
  const ActiveIcon = ICONS[active.icon] || Rocket

  return (
    <div className="tutorial-overlay" onClick={onClose}>
      <aside
        className="tutorial-drawer"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('tutorial.title')}
      >
        <div className="tutorial-header">
          <div className="tutorial-header-copy">
            <h2>{t('tutorial.title')}</h2>
            <p>{t('tutorial.subtitle')}</p>
          </div>
          <button type="button" className="tutorial-close" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>

        <div className="tutorial-body">
          {/* 左侧导航 */}
          <nav className="tutorial-nav" aria-label={t('tutorial.sections')}>
            {TUTORIAL_SECTIONS.map((section) => {
              const Icon = ICONS[section.icon] || Rocket
              const isActive = section.key === activeKey
              return (
                <button
                  key={section.key}
                  type="button"
                  className={`tutorial-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveKey(section.key)}
                >
                  <Icon size={15} />
                  <span>{section.label[language] || section.label['zh-CN']}</span>
                </button>
              )
            })}
          </nav>

          {/* 右侧步骤 */}
          <div className="tutorial-content">
            <div className="tutorial-content-head">
              <span className="tutorial-content-icon"><ActiveIcon size={18} /></span>
              <h3>{active.label[language] || active.label['zh-CN']}</h3>
            </div>
            <ol className="tutorial-steps">
              {active.steps.map((item, index) => {
                const text = item[language] || item['zh-CN']
                return (
                  <li key={index} className="tutorial-step">
                    <span className="tutorial-step-num">{index + 1}</span>
                    <div className="tutorial-step-copy">
                      <strong>{text.t}</strong>
                      <p>{text.d}</p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      </aside>
    </div>
  )
}

export default TutorialDrawer

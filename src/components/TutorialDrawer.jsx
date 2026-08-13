// 教程中心抽屉：左侧导航（平台模块分类）+ 右侧具体操作步骤
import React, { useEffect, useState } from 'react'
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

const PET_GUIDES = {
  'zh-CN': [
    ['① 导入模型', '在“模型衣橱”选择 Codex v1 或 v2 模型目录中的 pet.json；旧版清单无需手动添加版本号。'],
    ['② 配置 AI', '在“桌宠设置”填写 API 地址、模型和 API Key。'],
    ['③ 开始陪伴', '返回“陪伴对话”，告诉桌宠你今天准备完成什么。']
  ],
  'en-US': [
    ['① Import', 'Choose pet.json from a Codex v1 or v2 pet folder. Legacy manifests do not need a version field.'],
    ['② Connect AI', 'Set the API URL, model and API key in Pet Settings.'],
    ['③ Get focused', 'Return to Companion Chat and share today’s first task.']
  ],
  'ja-JP': [
    ['① インポート', 'モデル画面で Codex v1 または v2 の pet.json を選択します。旧形式はバージョン指定不要です。'],
    ['② AI 設定', 'API URL、モデル、API Key を設定します。'],
    ['③ 作業開始', '会話画面で今日の最初のタスクを伝えます。']
  ]
}

function TutorialDrawer({ onClose, initialKey }) {
  const t = useT()
  const language = useStore((s) => s.language)
  const [activeKey, setActiveKey] = useState(initialKey || TUTORIAL_SECTIONS[0].key)
  const active = TUTORIAL_SECTIONS.find((section) => section.key === activeKey) || TUTORIAL_SECTIONS[0]
  const ActiveIcon = ICONS[active.icon] || Rocket

  useEffect(() => {
    const handleKey = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

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
          <div className="tutorial-header-mark"><span>LP</span></div>
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
            {active.key === 'pet' && (
              <div className="tutorial-pet-path">
                {(PET_GUIDES[language] || PET_GUIDES['zh-CN']).map(([title, desc]) => (
                  <div key={title}><strong>{title}</strong><p>{desc}</p></div>
                ))}
              </div>
            )}
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

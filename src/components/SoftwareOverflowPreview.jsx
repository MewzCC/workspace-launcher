import React, { useId } from 'react'
import SoftwareIcon from './SoftwareIcon'
import { useT } from '../hooks/useT'
import './SoftwareOverflowPreview.css'

function SoftwareOverflowPreview({
  items = [],
  processStatuses = {},
  onEdit,
  className = ''
}) {
  const t = useT()
  const tooltipId = useId()
  const runningCount = items.filter((item) => processStatuses[item.path]).length

  if (items.length === 0) return null

  return (
    <div className={`software-overflow-preview ${className}`.trim()}>
      <button
        type="button"
        className="software-overflow-preview__trigger"
        onClick={onEdit}
        aria-describedby={tooltipId}
        aria-label={t('common.hiddenAppsAria', { count: items.length })}
      >
        +{items.length}
      </button>

      <div id={tooltipId} className="software-overflow-preview__popover" role="tooltip">
        <div className="software-overflow-preview__header">
          <span>{t('common.otherApps')}</span>
          <span className="software-overflow-preview__summary">
            {t('common.runningSummary', { running: runningCount, total: items.length })}
          </span>
        </div>

        <div className="software-overflow-preview__list">
          {items.map((item) => {
            const running = Boolean(processStatuses[item.path])
            const statusText = running ? t('common.running') : t('common.stopped')
            return (
              <div className="software-overflow-preview__entry" key={item.id}>
                <SoftwareIcon
                  path={item.path}
                  fallback={item.icon || '📦'}
                  iconMode={item.icon_mode}
                  size="xs"
                />
                <span className="software-overflow-preview__name">{item.name}</span>
                <span
                  className={`software-overflow-preview__status ${running ? 'is-running' : 'is-stopped'}`}
                  aria-label={statusText}
                  title={statusText}
                >
                  <span aria-hidden="true" />
                  {statusText}
                </span>
              </div>
            )
          })}
        </div>

        {onEdit && (
          <button
            type="button"
            className="software-overflow-preview__action"
            onClick={onEdit}
          >
            {t('common.clickToEdit')}
          </button>
        )}
      </div>
    </div>
  )
}

export default SoftwareOverflowPreview
export { SoftwareOverflowPreview }

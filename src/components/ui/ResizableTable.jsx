import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import './ResizableTable.css'

function normalizeWidths(columns, stored) {
  const flexibleColumns = columns.filter((column) => !column.fixedWidth)
  const defaults = Object.fromEntries(flexibleColumns.map((column) => [column.key, Number(column.width) || 1]))
  const source = stored && flexibleColumns.every((column) => Number(stored[column.key]) > 0)
    ? stored
    : defaults
  const total = flexibleColumns.reduce((sum, column) => sum + Number(source[column.key] || defaults[column.key]), 0) || 1
  return Object.fromEntries(flexibleColumns.map((column) => [column.key, (Number(source[column.key]) / total) * 100]))
}

function readStoredWidths(storageKey, columns) {
  if (!storageKey) return normalizeWidths(columns)
  try {
    return normalizeWidths(columns, JSON.parse(localStorage.getItem(storageKey) || 'null'))
  } catch (_) {
    return normalizeWidths(columns)
  }
}

const ResizableTable = forwardRef(function ResizableTable({
  columns,
  rows,
  getRowKey,
  renderCell,
  storageKey,
  caption,
  empty,
  className = ''
}, ref) {
  const tableRef = useRef(null)
  const dragRef = useRef(null)
  const normalizedColumns = useMemo(() => columns, [columns])
  const fixedWidth = useMemo(() => normalizedColumns.reduce((sum, column) => sum + (Number(column.fixedWidth) || 0), 0), [normalizedColumns])
  const [widths, setWidths] = useState(() => readStoredWidths(storageKey, normalizedColumns))

  const persist = useCallback((next) => {
    if (!storageKey) return
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch (_) {}
  }, [storageKey])

  const reset = useCallback(() => {
    const next = normalizeWidths(normalizedColumns)
    setWidths(next)
    if (storageKey) {
      try { localStorage.removeItem(storageKey) } catch (_) {}
    }
  }, [normalizedColumns, storageKey])

  useImperativeHandle(ref, () => ({ reset }), [reset])

  useEffect(() => {
    setWidths(readStoredWidths(storageKey, normalizedColumns))
  }, [normalizedColumns, storageKey])

  const resizeColumn = useCallback((columnIndex, deltaPercent) => {
    setWidths((current) => {
      const column = normalizedColumns[columnIndex]
      let neighborIndex = normalizedColumns.findIndex((candidate, index) => index > columnIndex && candidate.resizable)
      if (neighborIndex < 0) {
        for (let index = columnIndex - 1; index >= 0; index -= 1) {
          if (normalizedColumns[index].resizable) {
            neighborIndex = index
            break
          }
        }
      }
      if (!column || neighborIndex < 0) return current
      const neighbor = normalizedColumns[neighborIndex]
      const tableWidth = tableRef.current?.getBoundingClientRect().width || 1
      const columnMin = ((Number(column.minWidth) || 80) / tableWidth) * 100
      const neighborMin = ((Number(neighbor.minWidth) || 80) / tableWidth) * 100
      const pairTotal = current[column.key] + current[neighbor.key]
      const requested = neighborIndex > columnIndex
        ? current[column.key] + deltaPercent
        : current[column.key] - deltaPercent
      const nextColumnWidth = Math.min(pairTotal - neighborMin, Math.max(columnMin, requested))
      const next = {
        ...current,
        [column.key]: nextColumnWidth,
        [neighbor.key]: pairTotal - nextColumnWidth
      }
      persist(next)
      return next
    })
  }, [normalizedColumns, persist])

  const startResize = (event, columnIndex) => {
    event.preventDefault()
    const tableWidth = tableRef.current?.getBoundingClientRect().width || 1
    dragRef.current = { columnIndex, lastX: event.clientX, tableWidth }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const moveResize = (event) => {
    const drag = dragRef.current
    if (!drag) return
    const delta = ((event.clientX - drag.lastX) / drag.tableWidth) * 100
    drag.lastX = event.clientX
    resizeColumn(drag.columnIndex, delta)
  }

  const stopResize = () => { dragRef.current = null }

  const resizeWithKeyboard = (event, columnIndex) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return
    event.preventDefault()
    if (event.key === 'Home') reset()
    else resizeColumn(columnIndex, event.key === 'ArrowRight' ? 1.5 : -1.5)
  }

  return (
    <div className={`resizable-table-shell ${className}`}>
      <table className="resizable-table" ref={tableRef}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <colgroup>
          {normalizedColumns.map((column) => (
            <col
              key={column.key}
              className={column.className || ''}
              style={{ width: column.fixedWidth
                ? `${column.fixedWidth}px`
                : `calc((100% - ${fixedWidth}px) * ${(widths[column.key] || 0) / 100})` }}
            />
          ))}
        </colgroup>
        <thead>
          <tr>
            {normalizedColumns.map((column, index) => (
              <th key={column.key} scope="col" className={column.className || ''}>
                <span>{column.label}</span>
                {column.resizable && (
                  <span
                    className="resizable-table__handle"
                    role="separator"
                    aria-label={column.resizeLabel || column.label}
                    aria-orientation="vertical"
                    tabIndex="0"
                    onPointerDown={(event) => startResize(event, index)}
                    onPointerMove={moveResize}
                    onPointerUp={stopResize}
                    onPointerCancel={stopResize}
                    onDoubleClick={reset}
                    onKeyDown={(event) => resizeWithKeyboard(event, index)}
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={getRowKey(row, rowIndex)}>
              {normalizedColumns.map((column) => (
                <td key={column.key} className={column.className || ''}>
                  {renderCell(row, column, rowIndex)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && empty}
    </div>
  )
})

export default ResizableTable

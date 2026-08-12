// 更新日志渲染工具（零依赖）
// releaseNotes 可能来自 electron-updater 返回的 HTML，也可能是 Markdown 文本：
// - 含 HTML 标签 → 消毒后直接注入
// - 否则按轻量 Markdown 渲染（标题/粗体/斜体/行内代码/代码块/列表/链接/引用/分隔线/段落）

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sanitizeHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?<\/embed>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '')
}

// 行内语法：代码 > 粗体 > 斜体 > 链接（代码片段用占位符保护，避免被后续规则改写）
function renderInline(text) {
  const codes = []
  let value = String(text)
  value = value.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(escapeHtml(code))
    return `\u0000${codes.length - 1}\u0000`
  })
  value = value.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  value = value.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  value = value.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (_, label, url) => {
    const safe = url.replace(/["'<>]/g, '')
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`
  })
  value = value.replace(/\u0000(\d+)\u0000/g, (_, index) => `<code>${codes[Number(index)]}</code>`)
  return value
}

function markdownToHtml(text) {
  if (!text) return ''
  const lines = String(text).replace(/\r\n/g, '\n').split('\n')
  const out = []
  let inCode = false
  let codeLines = []
  let listType = null // 'ul' | 'ol'

  const flushCode = () => {
    if (codeLines.length > 0) {
      out.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
      codeLines = []
    }
  }
  const flushList = () => {
    if (listType) {
      out.push(`</${listType}>`)
      listType = null
    }
  }

  for (const raw of lines) {
    if (/^\s*```/.test(raw)) {
      flushCode()
      flushList()
      inCode = !inCode
      continue
    }
    if (inCode) {
      codeLines.push(raw)
      continue
    }

    const trimmed = raw.trim()
    if (!trimmed) {
      flushCode()
      flushList()
      continue
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      flushCode()
      flushList()
      const level = heading[1].length
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`)
      continue
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/)
    if (unordered) {
      flushCode()
      if (listType !== 'ul') {
        flushList()
        out.push('<ul>')
        listType = 'ul'
      }
      out.push(`<li>${renderInline(unordered[1])}</li>`)
      continue
    }

    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/)
    if (ordered) {
      flushCode()
      if (listType !== 'ol') {
        flushList()
        out.push('<ol>')
        listType = 'ol'
      }
      out.push(`<li>${renderInline(ordered[1])}</li>`)
      continue
    }

    const quote = trimmed.match(/^>\s?(.+)$/)
    if (quote) {
      flushCode()
      flushList()
      out.push(`<blockquote>${renderInline(quote[1])}</blockquote>`)
      continue
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flushCode()
      flushList()
      out.push('<hr>')
      continue
    }

    flushCode()
    flushList()
    out.push(`<p>${renderInline(raw)}</p>`)
  }

  flushCode()
  flushList()
  return out.join('\n')
}

// 需要从更新日志中剔除的无关章节标题（下载入口、系统要求等，展示时无意义）
const SKIP_HEADINGS = [
  '下载', '下载建议', '下载与安装', '系统要求',
  'download', 'downloads', 'download and install', 'system requirements', 'installation',
  'ダウンロード', 'システム要件'
]

// 过滤 Markdown 中的无关章节：命中标题后跳过该标题及其内容，直到下一个标题
function filterMarkdownSections(text) {
  const lines = String(text).split('\n')
  const out = []
  let skip = false
  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.+)$/)
    if (heading) {
      const title = heading[1].trim().toLowerCase()
      skip = SKIP_HEADINGS.some((keyword) => title.includes(keyword))
    }
    if (!skip) out.push(line)
  }
  return out.join('\n')
}

// 过滤 HTML 中的无关章节：按标题元素切段，剔除命中标题所在段落
function filterHtmlSections(html) {
  const headingRe = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi
  const matches = []
  let match
  while ((match = headingRe.exec(html)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[2].replace(/<[^>]+>/g, '').trim().toLowerCase()
    })
  }
  if (matches.length === 0) return html

  const segments = [{ start: 0, end: matches[0].start, skip: false }]
  for (let index = 0; index < matches.length; index += 1) {
    const heading = matches[index]
    const nextStart = index + 1 < matches.length ? matches[index + 1].start : html.length
    const skip = SKIP_HEADINGS.some((keyword) => heading.text.includes(keyword))
    segments.push({ start: heading.start, end: nextStart, skip })
  }
  return segments
    .filter((segment) => !segment.skip)
    .map((segment) => html.slice(segment.start, segment.end))
    .join('')
}

const HTML_TAG_RE = /<(h[1-6]|p|ul|ol|li|blockquote|pre|code|strong|em|a|hr|table|br)\b/i

export function renderMarkdown(text) {
  if (!text) return ''
  const value = String(text)
  // 已经是 HTML 的更新日志：过滤无关章节后消毒注入；否则按 Markdown 渲染。
  if (HTML_TAG_RE.test(value)) return sanitizeHtml(filterHtmlSections(value))
  return markdownToHtml(filterMarkdownSections(value))
}

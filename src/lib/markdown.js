// 统一 Markdown 渲染入口（基于开源组件 marked）
// 全部 md 展示位（更新日志、桌宠气泡、聊天消息、备忘录等）共用此函数：
// - 含 HTML 标签的更新日志 → 过滤无关章节后消毒注入
// - 其余按 Markdown 渲染（GFM：嵌套列表/表格/删除线等），内嵌 HTML 一律转义
import { marked } from 'marked'

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

const mdRenderer = new marked.Renderer()

// AI/备忘录等内容的原始 HTML 一律转义展示，防止注入；更新日志 HTML 走 sanitize 分支
mdRenderer.html = (html) => escapeHtml(html)

marked.setOptions({
  renderer: mdRenderer,
  gfm: true,
  breaks: true
})

// 部分模型会把整篇 Markdown 回复再次包进 ```markdown / ```md 围栏。
// 这种围栏表达的是“下面整段采用 Markdown 格式”，不是需要展示的代码块；
// 仅当围栏覆盖完整内容且明确声明 markdown/md 时剥离，普通代码围栏保持不变。
function unwrapDocumentMarkdownFence(text) {
  const value = String(text).trim()
  const match = value.match(/^(`{3,}|~{3,})[ \t]*(?:markdown|md)[ \t]*\r?\n([\s\S]*?)\r?\n\1[ \t]*$/i)
  return match ? match[2] : value
}

function renderMarkdownContent(text) {
  const filtered = filterMarkdownSections(unwrapDocumentMarkdownFence(text))
  return marked.parse(filtered, { async: false })
}

export function renderMarkdown(text) {
  if (!text) return ''
  const value = String(text)
  // 已经是 HTML 的更新日志：过滤无关章节后消毒注入；否则按 Markdown 渲染。
  if (HTML_TAG_RE.test(value)) return sanitizeHtml(filterHtmlSections(value))
  return renderMarkdownContent(value)
}

// 轻量 i18n 模块
// 提供：语言包注册、t() 插值翻译、语言持久化与主进程同步
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'
import jaJP from './locales/ja-JP'

export const MESSAGES = {
  'zh-CN': zhCN,
  'en-US': enUS,
  'ja-JP': jaJP
}

export const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en-US', label: 'English' },
  { code: 'ja-JP', label: '日本語' }
]

export const DEFAULT_LANGUAGE = 'zh-CN'
export const LANGUAGE_STORAGE_KEY = 'lp-lang'

// 将嵌套对象拍平为 `a.b.c` 扁平键，便于 t() 快速查找
function flatten(obj, prefix = '', result = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value, path, result)
    } else {
      result[path] = value
    }
  }
  return result
}

const FLAT = Object.fromEntries(
  Object.entries(MESSAGES).map(([code, dict]) => [code, flatten(dict)])
)

// 读取初始语言：优先本地存储，回退默认语言
export function getInitialLanguage() {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    return MESSAGES[saved] ? saved : DEFAULT_LANGUAGE
  } catch (_) {
    return DEFAULT_LANGUAGE
  }
}

// 翻译：language 语言码，key 扁平键，params 插值参数
export function translate(language, key, params = {}) {
  const dict = FLAT[language] || FLAT[DEFAULT_LANGUAGE]
  const fallbackDict = FLAT[DEFAULT_LANGUAGE]
  const template =
    dict[key] != null ? dict[key] : fallbackDict[key] != null ? fallbackDict[key] : key
  return String(template).replace(/\{(\w+)\}/g, (match, name) =>
    params[name] != null ? String(params[name]) : match
  )
}

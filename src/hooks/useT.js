// useT Hook：绑定当前语言，返回 t(key, params) 翻译函数
// 组件调用 const t = useT()，语言变化时自动重渲染
import { useStore } from '../store/useStore'
import { translate } from '../i18n'

export function useT() {
  const language = useStore((s) => s.language)
  return (key, params) => translate(language, key, params)
}

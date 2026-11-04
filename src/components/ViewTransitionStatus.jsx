import { LoaderCircle } from 'lucide-react'
import { useT } from '../hooks/useT'

export default function ViewTransitionStatus({ phase }) {
  const t = useT()
  if (phase === 'idle') return null
  return <>
    <div className="view-transition-progress" aria-hidden="true"><span /></div>
    {(phase === 'exit' || phase === 'loading') && <div className="view-transition-status" role="status">
      <LoaderCircle size={20} aria-hidden="true" /><span>{t('common.switchingView')}</span>
    </div>}
  </>
}

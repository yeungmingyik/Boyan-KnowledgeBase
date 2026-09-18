import { Button } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import type { FeishuUpdateStatus } from '@shared/types/feishuUpdate'
import { RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useKnowledgePage } from '../KnowledgePageProvider'

const phaseKeys = {
  disabled: 'knowledge.feishu_update.phase.disabled',
  idle: 'knowledge.feishu_update.phase.idle',
  checking: 'knowledge.feishu_update.phase.checking',
  available: 'knowledge.feishu_update.phase.available',
  downloading: 'knowledge.feishu_update.phase.downloading',
  indexing: 'knowledge.feishu_update.phase.indexing',
  current: 'knowledge.feishu_update.phase.current',
  error: 'knowledge.feishu_update.phase.error'
} as const
const errorKeys = {
  config: 'knowledge.feishu_update.error.config',
  network: 'knowledge.feishu_update.error.network',
  integrity: 'knowledge.feishu_update.error.integrity',
  incompatible: 'knowledge.feishu_update.error.incompatible',
  rollback: 'knowledge.feishu_update.error.rollback',
  import_failed: 'knowledge.feishu_update.error.import_failed'
} as const

export default function FeishuUpdateButton() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<FeishuUpdateStatus>({ phase: 'idle' })
  const [checking, setChecking] = useState(false)
  const { selectedBase, handleCreateBaseCreated } = useKnowledgePage()
  const observedBase = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!status.baseId || observedBase.current === status.baseId) return
    observedBase.current = status.baseId
    if (selectedBase?.id === status.previousBaseId) handleCreateBaseCreated({ id: status.baseId })
  }, [status.baseId, status.previousBaseId, selectedBase?.id, handleCreateBaseCreated])

  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const refresh = async () => {
      try {
        const next = await ipcApi.request('knowledge.feishu_update.status')
        if (!disposed) setStatus(next)
      } finally {
        if (!disposed) timer = setTimeout(() => void refresh().catch(() => undefined), 2000)
      }
    }
    void refresh().catch(() => undefined)
    return () => {
      disposed = true
      clearTimeout(timer)
    }
  }, [])

  const check = async () => {
    setChecking(true)
    try {
      setStatus(
        status.availableSequence
          ? await ipcApi.request('knowledge.feishu_update.install', { sequence: status.availableSequence })
          : await ipcApi.request('knowledge.feishu_update.check')
      )
    } finally {
      setChecking(false)
    }
  }

  const busy = checking || ['checking', 'downloading', 'indexing'].includes(status.phase)
  const message = t(status.error ? errorKeys[status.error] : phaseKeys[status.phase])
  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="feishu-update">
      <Button
        variant="outline"
        size="sm"
        disabled={busy || status.phase === 'disabled' || status.error === 'config'}
        onClick={() => void check().catch(() => setStatus({ phase: 'error', error: 'network' }))}>
        <RefreshCw className={busy ? 'size-4 animate-spin' : 'size-4'} />
        {status.availableSequence ? t('knowledge.feishu_update.install') : t('knowledge.feishu_update.check')}
      </Button>
      <span role="status" className="text-muted-foreground text-xs">
        {message}
      </span>
      {status.lastUpdatedAt && (
        <span className="text-muted-foreground text-xs">
          {t('knowledge.feishu_update.updated', { time: new Date(status.lastUpdatedAt).toLocaleString() })}
        </span>
      )}
    </div>
  )
}

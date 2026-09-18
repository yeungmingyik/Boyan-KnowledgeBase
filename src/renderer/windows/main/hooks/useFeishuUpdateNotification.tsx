import { Button } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import { toast } from '@renderer/services/toast'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

export function useFeishuUpdateNotification() {
  const { t } = useTranslation()

  useEffect(() => {
    let disposed = false
    let notified: number | undefined
    let timer: ReturnType<typeof setTimeout>
    const key = 'feishu-knowledge-update'
    const install = async (sequence: number) => {
      toast.closeToast(key)
      const result = await ipcApi.request('knowledge.feishu_update.install', { sequence })
      if (disposed) return
      if (result.phase === 'current') toast.success(t('knowledge.feishu_update.phase.current'))
      else if (result.phase === 'error') toast.error(t('knowledge.feishu_update.phase.error'))
    }
    const refresh = async () => {
      try {
        const status = await ipcApi.request('knowledge.feishu_update.status')
        if (disposed) return
        if (status.phase === 'available' && status.availableSequence && notified !== status.availableSequence) {
          const sequence = status.availableSequence
          notified = sequence
          toast.info({
            key,
            timeout: 0,
            title: t('knowledge.feishu_update.phase.available'),
            description: (
              <Button
                size="sm"
                onClick={() =>
                  void install(sequence).catch(() => toast.error(t('knowledge.feishu_update.phase.error')))
                }>
                {t('knowledge.feishu_update.install')}
              </Button>
            )
          })
        } else if (['current', 'downloading', 'indexing'].includes(status.phase)) {
          toast.closeToast(key)
        }
      } finally {
        if (!disposed) timer = setTimeout(() => void refresh().catch(() => undefined), 5000)
      }
    }
    void refresh().catch(() => undefined)
    return () => {
      disposed = true
      clearTimeout(timer)
      toast.closeToast(key)
    }
  }, [t])
}

import { Button } from '@cherrystudio/ui'
import { useInvalidateCache } from '@data/hooks/useDataApi'
import { ipcApi } from '@renderer/ipc'
import { toast } from '@renderer/services/toast'
import { resolveKnowledgeFileMetadataEntryData } from '@renderer/utils/knowledgeFileEntry'
import type { FeishuImportResult } from '@shared/types/feishuPackage'
import { FileDown, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useKnowledgePage } from '../KnowledgePageProvider'
import FeishuUpdateButton from './FeishuUpdateButton'

export default function FeishuPackageImportButton() {
  const { t } = useTranslation()
  const { handleCreateBaseCreated } = useKnowledgePage()
  const invalidateCache = useInvalidateCache()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<FeishuImportResult>()

  const importPackage = async () => {
    setBusy(true)
    try {
      const files = await window.api.file.select({
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })
      if (!files?.[0]) return
      const file = await resolveKnowledgeFileMetadataEntryData(files[0])
      const imported = await ipcApi.request('knowledge.import_feishu_package', { path: file.path })
      await invalidateCache('/knowledge-bases')
      handleCreateBaseCreated({ id: imported.baseId })
      setResult(imported)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('error.unknown'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-border border-b px-3 py-2">
      <FeishuUpdateButton />
      <Button variant="outline" size="sm" disabled={busy} onClick={importPackage}>
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : <FileDown className="size-4" />}
        {t(busy ? 'knowledge.feishu_import.busy' : 'knowledge.feishu_import.title')}
      </Button>
      <span role="status" className="text-muted-foreground text-xs">
        {result
          ? t('knowledge.feishu_import.result', {
              documents: result.importedCount,
              empty: result.emptyCount,
              resources: result.resourceCount
            })
          : null}
      </span>
    </div>
  )
}

import '@testing-library/jest-dom/vitest'

import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  closeToast: vi.fn(),
  translate: (key: string) => key
}))
vi.mock('@renderer/ipc', () => ({ ipcApi: { request: mocks.request } }))
vi.mock('@renderer/services/toast', () => ({
  toast: { info: mocks.info, success: mocks.success, error: mocks.error, closeToast: mocks.closeToast }
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: mocks.translate }) }))

import { useFeishuUpdateNotification } from '../useFeishuUpdateNotification'

describe('knowledge update notification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('offers an update from the main window and installs only the version the user clicks', async () => {
    mocks.request.mockImplementation(async (route: string) =>
      route.endsWith('.status') ? { phase: 'available', availableSequence: 3 } : { phase: 'current', sequence: 3 }
    )
    const hook = renderHook(() => useFeishuUpdateNotification())
    await waitFor(() => expect(mocks.info).toHaveBeenCalledOnce())
    expect(mocks.request.mock.calls.every(([route]) => route === 'knowledge.feishu_update.status')).toBe(true)
    const notice = mocks.info.mock.calls[0][0] as { title: string; description: ReactNode }
    render(
      <div>
        {notice.title}
        {notice.description}
      </div>
    )
    expect(screen.getByText('knowledge.feishu_update.phase.available')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'knowledge.feishu_update.install' }))
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('knowledge.feishu_update.install', { sequence: 3 }))
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('knowledge.feishu_update.phase.current'))
    hook.unmount()
  })

  it('shows a failure when a requested installation cannot complete', async () => {
    mocks.request.mockImplementation(async (route: string) =>
      route.endsWith('.status') ? { phase: 'available', availableSequence: 4 } : { phase: 'error', error: 'network' }
    )
    const hook = renderHook(() => useFeishuUpdateNotification())
    await waitFor(() => expect(mocks.info).toHaveBeenCalledOnce())
    render(mocks.info.mock.calls[0][0].description)
    fireEvent.click(screen.getByRole('button', { name: 'knowledge.feishu_update.install' }))
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('knowledge.feishu_update.phase.error'))
    expect(mocks.success).not.toHaveBeenCalled()
    hook.unmount()
  })
})

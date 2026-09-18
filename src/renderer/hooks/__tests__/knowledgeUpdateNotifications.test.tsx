import { MockUseDataApiUtils, mockUseInfiniteQuery, mockUseQuery } from '@test-mocks/renderer/useDataApi'
import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAssistantApiById, useAssistantsApi } from '../useAssistant'
import { useKnowledgeBases } from '../useKnowledgeBase'

describe('background knowledge updates', () => {
  beforeEach(() => {
    MockUseDataApiUtils.resetMocks()
  })

  it('refreshes a mounted knowledge list after a background version is activated', async () => {
    let server = [{ id: 'old', name: 'Knowledge' }]
    mockUseInfiniteQuery.mockImplementation(function useKnowledgeQuery() {
      const [items, setItems] = useState(server)
      return {
        pages: [{ items }],
        isLoading: false,
        isRefreshing: false,
        hasNext: false,
        error: undefined,
        loadNext: async () => undefined,
        refresh: async () => {
          setItems(server)
        }
      } as never
    })
    const { result } = renderHook(() => useKnowledgeBases())
    expect(result.current.bases.map((base) => base.id)).toEqual(['old'])
    server = [
      { id: 'new', name: 'Knowledge' },
      { id: 'old', name: 'Knowledge archive' }
    ]
    await act(async () => {
      MockUseDataApiUtils.emitDataChange([{ endpoint: '/knowledge-bases', kind: 'membership' }])
    })
    expect(result.current.bases.map((base) => base.id)).toEqual(['new', 'old'])
  })

  it('refreshes mounted assistant bindings for the changed entity and leaves unrelated notifications alone', async () => {
    let server = { id: 'assistant', knowledgeBaseIds: ['old'] }
    mockUseQuery.mockImplementation(function useAssistantQuery() {
      const [data, setData] = useState(server)
      return {
        data,
        isLoading: false,
        isRefreshing: false,
        error: undefined,
        refetch: async () => {
          setData(server)
        },
        mutate: async () => undefined
      } as never
    })
    const { result } = renderHook(() => useAssistantApiById('assistant'))
    server = { id: 'assistant', knowledgeBaseIds: ['new'] }
    await act(async () => {
      MockUseDataApiUtils.emitDataChange([{ endpoint: '/assistants/:id', routeParams: { id: 'other' } }])
    })
    expect(result.current.assistant?.knowledgeBaseIds).toEqual(['old'])
    await act(async () => {
      MockUseDataApiUtils.emitDataChange([{ endpoint: '/assistants/:id' }])
    })
    expect(result.current.assistant?.knowledgeBaseIds).toEqual(['new'])
  })

  it('refreshes the assistant collection after bindings change in the main process', async () => {
    let server = { items: [{ id: 'assistant', knowledgeBaseIds: ['old'] }], total: 1 }
    mockUseQuery.mockImplementation(function useAssistantListQuery() {
      const [data, setData] = useState(server)
      return {
        data,
        isLoading: false,
        isRefreshing: false,
        error: undefined,
        refetch: async () => {
          setData(server)
        },
        mutate: async () => undefined
      } as never
    })
    const { result } = renderHook(() => useAssistantsApi())
    server = { items: [{ id: 'assistant', knowledgeBaseIds: ['new'] }], total: 1 }
    await act(async () => {
      MockUseDataApiUtils.emitDataChange([{ endpoint: '/assistants', kind: 'projection' }])
    })
    expect(result.current.assistants[0].knowledgeBaseIds).toEqual(['new'])
  })
})

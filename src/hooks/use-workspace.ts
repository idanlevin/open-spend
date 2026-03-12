import { useMemo } from 'react'
import { useWorkspaceStore } from '@/stores/workspace-store'

export function useWorkspace() {
  const store = useWorkspaceStore()
  const merchantOptions = useMemo(
    () =>
      [...new Set(store.transactions.map((tx) => tx.merchantFinal))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [store.transactions],
  )
  const cardholderOptions = useMemo(
    () =>
      [...new Set(store.transactions.map((tx) => tx.cardMember))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [store.transactions],
  )

  return {
    ...store,
    merchantOptions,
    cardholderOptions,
  }
}

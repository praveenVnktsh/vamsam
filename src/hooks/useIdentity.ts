import { useState, useCallback, useEffect } from 'react'

function storageKey(treeId: string): string {
  return `vamsam:iAmPersonId:${treeId}`
}

export function useIdentity(
  linkedPersonId: string | null,
  treeId: string,
) {
  const [iAmPersonId, setIAmPersonIdState] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem(storageKey(treeId))
      return stored ?? linkedPersonId
    } catch {
      return linkedPersonId
    }
  })

  useEffect(() => {
    if (linkedPersonId && !iAmPersonId) {
      setIAmPersonIdState(linkedPersonId)
    }
  }, [linkedPersonId, iAmPersonId])

  const setIAmPersonId = useCallback(
    (id: string | null) => {
      setIAmPersonIdState(id)
      try {
        if (id) {
          localStorage.setItem(storageKey(treeId), id)
        } else {
          localStorage.removeItem(storageKey(treeId))
        }
      } catch {
        // Private browsing or quota exceeded — identity works for this session only
      }
    },
    [treeId],
  )

  const hasChosenIdentity = iAmPersonId !== null

  return { iAmPersonId, setIAmPersonId, hasChosenIdentity }
}

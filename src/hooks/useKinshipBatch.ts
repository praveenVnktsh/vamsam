import { useMemo } from 'react'
import {
  resolveRelationship,
  type PersonView,
  type ResolvedRelationship,
} from '../domain/graphOps'
import type { GraphSchema } from '../domain/graph'

export function useKinshipBatch(
  graph: GraphSchema,
  iAmId: string | null,
  people: PersonView[],
): Map<string, ResolvedRelationship> {
  return useMemo(() => {
    if (!iAmId) return new Map()
    const results = new Map<string, ResolvedRelationship>()
    for (const person of people) {
      if (person.id === iAmId) continue
      const rel = resolveRelationship(graph, iAmId, person.id)
      if (rel.label || rel.labels) {
        results.set(person.id, rel)
      }
    }
    return results
  }, [graph, iAmId, people])
}

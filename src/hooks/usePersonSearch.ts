import { useMemo } from 'react'
import { displayName, fullName, type PersonView } from '../domain/graphOps'

function matchesPerson(person: PersonView, normalized: string): boolean {
  return (
    displayName(person).toLowerCase().includes(normalized) ||
    fullName(person).toLowerCase().includes(normalized) ||
    person.label.toLowerCase().includes(normalized) ||
    person.branch.toLowerCase().includes(normalized) ||
    person.birthPlace.toLowerCase().includes(normalized) ||
    person.currentResidence.toLowerCase().includes(normalized)
  )
}

export function usePersonSearch(
  people: PersonView[],
  query: string,
  visibleIds?: Set<string>,
) {
  const sortedPeople = useMemo(
    () => [...people].sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [people],
  )

  const filteredPeople = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return people.filter((person) => {
      if (visibleIds && !visibleIds.has(person.id)) return false
      if (!normalized) return true
      return matchesPerson(person, normalized)
    })
  }, [people, query, visibleIds])

  const finderPeople = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return sortedPeople.filter((person) => {
      if (!normalized) return true
      return matchesPerson(person, normalized)
    })
  }, [query, sortedPeople])

  return { sortedPeople, filteredPeople, finderPeople }
}

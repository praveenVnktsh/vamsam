import { useMemo, useState } from 'react'
import type { GraphSchema } from '../../domain/graph'
import {
  computeGenerationTiers,
  displayName,
  type PersonView,
  type ResolvedRelationship,
} from '../../domain/graphOps'
import { usePersonSearch } from '../../hooks/usePersonSearch'
import { PersonCard } from './PersonCard'
import { GenerationGroup, tierLabel } from './GenerationGroup'
import { PhotoGrid } from './PhotoGrid'
import { IAmBar } from './IAmBar'
import { PersonDetail } from './PersonDetail'

type DirectoryTab = 'browse' | 'photos' | 'find'

type DirectoryViewProps = {
  graph: GraphSchema
  people: PersonView[]
  iAmPersonId: string | null
  iAmPerson: PersonView | null
  kinshipMap: Map<string, ResolvedRelationship>
  onChangeIdentity: () => void
  peopleById: Map<string, PersonView>
}

export function DirectoryView({
  graph,
  people,
  iAmPersonId,
  iAmPerson,
  kinshipMap,
  onChangeIdentity,
  peopleById,
}: DirectoryViewProps) {
  const [activeTab, setActiveTab] = useState<DirectoryTab>('browse')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)

  const { finderPeople } = usePersonSearch(people, searchQuery)

  const generationTiers = useMemo(() => {
    if (!iAmPersonId) return new Map<string, number>()
    return computeGenerationTiers(graph, iAmPersonId)
  }, [graph, iAmPersonId])

  const groupedPeople = useMemo(() => {
    const displayPeople = searchQuery.trim() ? finderPeople : people
    const groups = new Map<number, PersonView[]>()

    for (const person of displayPeople) {
      if (person.id === iAmPersonId) continue
      const tier = generationTiers.get(person.id) ?? 999
      const list = groups.get(tier) ?? []
      list.push(person)
      groups.set(tier, list)
    }

    for (const [tier, list] of groups) {
      groups.set(
        tier,
        list.sort((a, b) => displayName(a).localeCompare(displayName(b))),
      )
    }

    return new Map([...groups.entries()].sort(([a], [b]) => a - b))
  }, [people, finderPeople, searchQuery, iAmPersonId, generationTiers])

  const selectedPerson = selectedPersonId ? peopleById.get(selectedPersonId) ?? null : null
  const selectedRelationship = selectedPersonId ? kinshipMap.get(selectedPersonId) : undefined

  return (
    <div className="dir-view">
      <IAmBar currentPerson={iAmPerson} onChangeIdentity={onChangeIdentity} />

      <div className="dir-view__search">
        <input
          type="text"
          className="dir-view__search-input"
          placeholder="Search by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            type="button"
            className="dir-view__search-clear"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      <div className="dir-view__tabs">
        <button
          type="button"
          className={`dir-view__tab${activeTab === 'browse' ? ' dir-view__tab--active' : ''}`}
          onClick={() => setActiveTab('browse')}
        >
          Browse
        </button>
        <button
          type="button"
          className={`dir-view__tab${activeTab === 'photos' ? ' dir-view__tab--active' : ''}`}
          onClick={() => setActiveTab('photos')}
        >
          Photos
        </button>
      </div>

      <div className="dir-view__content">
        {activeTab === 'browse' && (
          <div className="dir-view__browse">
            {people.length === 0 && (
              <div className="dir-view__empty">
                <p>No family members added yet.</p>
                <p>Ask the family admin to add people to the tree.</p>
              </div>
            )}
            {people.length > 0 && groupedPeople.size === 0 && searchQuery.trim() && (
              <div className="dir-view__empty">
                <p>No matching people.</p>
              </div>
            )}
            {[...groupedPeople.entries()].map(([tier, tierPeople]) => (
              <GenerationGroup key={tier} label={tierLabel(tier)}>
                {tierPeople.map((person) => (
                  <PersonCard
                    key={person.id}
                    person={person}
                    relationship={kinshipMap.get(person.id)}
                    onClick={() => setSelectedPersonId(person.id)}
                  />
                ))}
              </GenerationGroup>
            ))}
          </div>
        )}

        {activeTab === 'photos' && (
          <PhotoGrid
            people={people}
            kinshipMap={kinshipMap}
            onSelectPerson={setSelectedPersonId}
          />
        )}
      </div>

      {selectedPerson && (
        <PersonDetail
          person={selectedPerson}
          relationship={selectedRelationship}
          iAmPerson={iAmPerson}
          graph={graph}
          onClose={() => setSelectedPersonId(null)}
        />
      )}
    </div>
  )
}

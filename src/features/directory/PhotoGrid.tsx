import { PersonAvatar } from '../PersonAvatar'
import { displayName, type PersonView, type ResolvedRelationship } from '../../domain/graphOps'

type PhotoGridProps = {
  people: PersonView[]
  kinshipMap: Map<string, ResolvedRelationship>
  onSelectPerson: (personId: string) => void
}

export function PhotoGrid({ people, kinshipMap, onSelectPerson }: PhotoGridProps) {
  const sorted = [...people].sort((a, b) => {
    const aHasPhoto = a.photo.trim() ? 0 : 1
    const bHasPhoto = b.photo.trim() ? 0 : 1
    if (aHasPhoto !== bHasPhoto) return aHasPhoto - bHasPhoto
    return displayName(a).localeCompare(displayName(b))
  })

  if (sorted.length === 0) {
    return (
      <div className="dir-photo-grid__empty">
        <p>No family members added yet.</p>
      </div>
    )
  }

  return (
    <div className="dir-photo-grid" role="list" aria-label="Family members by photo">
      {sorted.map((person) => {
        const rel = kinshipMap.get(person.id)
        const kinshipLabel = rel?.labels?.en ?? rel?.label ?? ''

        return (
          <button
            key={person.id}
            type="button"
            className="dir-photo-grid__cell"
            onClick={() => onSelectPerson(person.id)}
            role="listitem"
            aria-label={kinshipLabel ? `${displayName(person)}, your ${kinshipLabel}` : displayName(person)}
          >
            <PersonAvatar person={person} className="dir-photo-grid__avatar" />
            <span className="dir-photo-grid__name">{displayName(person)}</span>
            {kinshipLabel && (
              <span className="dir-photo-grid__kinship">{kinshipLabel}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

import { PersonAvatar } from '../PersonAvatar'
import { displayName, type PersonView, type ResolvedRelationship } from '../../domain/graphOps'

type PersonCardProps = {
  person: PersonView
  relationship?: ResolvedRelationship
  onClick?: () => void
}

export function PersonCard({ person, relationship, onClick }: PersonCardProps) {
  const name = displayName(person)
  const kinshipEn = relationship?.labels?.en ?? relationship?.label ?? ''
  const kinshipTa = relationship?.labels?.ta
  const kinshipTaLatin = relationship?.labels?.taLatin
  const kinshipHi = relationship?.labels?.hi

  return (
    <button
      type="button"
      className="dir-person-card"
      onClick={onClick}
      aria-label={kinshipEn ? `${name}, your ${kinshipEn}` : name}
    >
      <PersonAvatar person={person} className="dir-person-card__avatar" />
      <div className="dir-person-card__info">
        {kinshipEn ? (
          <>
            <span className="dir-person-card__kinship">Your {kinshipEn}</span>
            <span className="dir-person-card__name">{name}</span>
            {(kinshipTa || kinshipTaLatin) && (
              <span className="dir-person-card__scripts">
                {kinshipTa}{kinshipTaLatin ? ` · ${kinshipTaLatin}` : ''}
                {kinshipHi ? ` · ${kinshipHi}` : ''}
              </span>
            )}
          </>
        ) : (
          <span className="dir-person-card__name dir-person-card__name--primary">{name}</span>
        )}
      </div>
    </button>
  )
}

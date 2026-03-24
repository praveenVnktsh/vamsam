import { useState } from 'react'
import { PersonAvatar } from '../PersonAvatar'
import { displayName, type PersonView } from '../../domain/graphOps'
import { usePersonSearch } from '../../hooks/usePersonSearch'

type IAmPickerProps = {
  people: PersonView[]
  onSelect: (personId: string) => void
  onDismiss?: () => void
}

export function IAmPicker({ people, onSelect, onDismiss }: IAmPickerProps) {
  const [query, setQuery] = useState('')
  const { finderPeople } = usePersonSearch(people, query)
  const results = query.trim() ? finderPeople.slice(0, 20) : people.slice(0, 20)

  return (
    <div className="dir-iam-picker" role="dialog" aria-label="Choose your identity">
      <div className="dir-iam-picker__header">
        <h2 className="dir-iam-picker__title">Who are you?</h2>
        <p className="dir-iam-picker__subtitle">
          Select yourself to see how everyone is related to you.
        </p>
        {onDismiss && (
          <button
            type="button"
            className="dir-iam-picker__close"
            onClick={onDismiss}
            aria-label="Close"
          >
            ×
          </button>
        )}
      </div>

      <div className="dir-iam-picker__search">
        <input
          type="text"
          className="dir-iam-picker__input"
          placeholder="Search your name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      <div className="dir-iam-picker__list">
        {results.map((person) => (
          <button
            key={person.id}
            type="button"
            className="dir-iam-picker__item"
            onClick={() => onSelect(person.id)}
          >
            <PersonAvatar person={person} className="dir-iam-picker__avatar" />
            <span className="dir-iam-picker__name">{displayName(person)}</span>
          </button>
        ))}
        {results.length === 0 && query.trim() && (
          <p className="dir-iam-picker__empty">
            Can't find yourself? Ask the family admin to add you.
          </p>
        )}
      </div>
    </div>
  )
}

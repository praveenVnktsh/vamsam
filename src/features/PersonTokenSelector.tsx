import { useMemo } from 'react'
import { displayName, fullName, type PersonView } from '../domain/graphOps'

type Selection =
  | { type: 'existing'; id: string }
  | { type: 'new'; name: string }
  | null

type PersonTokenSelectorProps = {
  label: string
  people: PersonView[]
  query: string
  selectedPersonId: string
  selection: Selection
  allowCreateNew?: boolean
  placeholder?: string
  compact?: boolean
  showSecondaryText?: boolean
  disabled?: boolean
  onQueryChange: (value: string) => void
  onSelectionChange: (selection: Selection) => void
}

export function PersonTokenSelector({
  label,
  people,
  query,
  selectedPersonId,
  selection,
  allowCreateNew = false,
  placeholder = 'Type a name',
  compact = false,
  showSecondaryText = true,
  disabled = false,
  onQueryChange,
  onSelectionChange,
}: PersonTokenSelectorProps) {
  const selectedPerson = useMemo(
    () => people.find((person) => person.id === selectedPersonId) ?? null,
    [people, selectedPersonId],
  )
  const normalizedQuery = query.trim().toLowerCase()
  const matches = useMemo(
    () =>
      people.filter((person) => {
        const full = fullName(person).toLowerCase()
        const display = displayName(person).toLowerCase()
        return full.includes(normalizedQuery) || display.includes(normalizedQuery)
      }),
    [normalizedQuery, people],
  )
  const exactMatch = useMemo(
    () =>
      people.find((person) => {
        const full = fullName(person).trim().toLowerCase()
        const display = displayName(person).trim().toLowerCase()
        return full === normalizedQuery || display === normalizedQuery
      }) ?? null,
    [normalizedQuery, people],
  )
  const showResults = !selectedPersonId && query.trim().length > 0

  return (
    <div className={compact ? 'person-token-selector person-token-selector-compact' : 'person-token-selector'}>
      <span>{label}</span>
      {selectedPerson ? (
        <div className="relationship-token">
          <span>{fullName(selectedPerson)}</span>
          <button
            type="button"
            className="relationship-token__clear"
            onClick={(event) => {
              event.stopPropagation()
            onSelectionChange(null)
            onQueryChange('')
          }}
          disabled={disabled}
        >
          ×
        </button>
        </div>
      ) : (
        <input
          value={query}
          disabled={disabled}
          onChange={(event) => {
            const nextQuery = event.target.value
            onQueryChange(nextQuery)
            onSelectionChange(null)
          }}
          placeholder={placeholder}
        />
      )}
      {showResults && (
        <div className={compact ? 'connection-picker connection-picker-compact' : 'connection-picker'}>
          {matches.slice(0, 6).map((person) => (
            <button
              key={person.id}
              type="button"
              className={
                selection?.type === 'existing' && selection.id === person.id
                  ? 'connection-picker__option active'
                  : 'connection-picker__option'
              }
              onClick={() => {
                onSelectionChange({ type: 'existing', id: person.id })
                onQueryChange(fullName(person))
              }}
              disabled={disabled}
            >
              <span>{fullName(person)}</span>
              {showSecondaryText && <small>Existing person</small>}
            </button>
          ))}
          {allowCreateNew && !exactMatch && query.trim() && (
            <button
              type="button"
              className={
                selection?.type === 'new'
                  ? 'connection-picker__option active'
                  : 'connection-picker__option'
              }
              onClick={() => {
                onSelectionChange({ type: 'new', name: query.trim() })
              }}
              disabled={disabled}
            >
              <span>Add {query.trim()}</span>
              {showSecondaryText && <small>Create new person</small>}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

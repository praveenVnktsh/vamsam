import { useMemo, useState } from 'react'
import { EdgePredicate, type GraphSchema } from '../../domain/graph'
import { personConnections, type PersonView } from '../../domain/graphOps'

type InspectorProps = {
  graph: GraphSchema
  selectedPerson: PersonView
  selectedPersonId: string
  visibleIds: Set<string>
  allPeople: PersonView[]
  onCreateStandalonePerson: (preferredName?: string) => void
  onQuickAddRelative: (type: 'parent' | 'child' | 'partner' | 'sibling') => void
  onUpdateAttr: (key: string, value: string | string[]) => void
  onUpdateConnection: (edgeId: string, predicate: string) => void
  onReverseConnection: (edgeId: string) => void
  onDeleteConnection: (edgeId: string) => void
  onAddConnectedPerson: (predicate: EdgePredicate, preferredName: string) => void
  onConnectExistingPerson: (targetId: string, predicate: EdgePredicate) => void
  onSoftDeletePerson: () => void
  onHardDeletePerson: () => void
}

export function Inspector({
  graph,
  selectedPerson,
  selectedPersonId,
  visibleIds,
  allPeople,
  onCreateStandalonePerson,
  onQuickAddRelative,
  onUpdateAttr,
  onUpdateConnection,
  onReverseConnection,
  onDeleteConnection,
  onAddConnectedPerson,
  onConnectExistingPerson,
  onSoftDeletePerson,
  onHardDeletePerson,
}: InspectorProps) {
  const [linkQuery, setLinkQuery] = useState('')
  const [linkPredicate, setLinkPredicate] = useState<EdgePredicate>(
    EdgePredicate.PARTNER_OF,
  )
  const [linkSelection, setLinkSelection] = useState<
    { type: 'existing'; id: string } | { type: 'new'; name: string } | null
  >(null)
  const [linkError, setLinkError] = useState('')
  const [newProfileLink, setNewProfileLink] = useState('')
  const datePattern = /^\d{4}(-\d{2}){0,2}$/
  const isDobValid =
    selectedPerson.dob.trim() === '' || datePattern.test(selectedPerson.dob.trim())
  const isDodValid =
    selectedPerson.dod.trim() === '' || datePattern.test(selectedPerson.dod.trim())
  const connections = useMemo(
    () => personConnections(graph, selectedPersonId, visibleIds),
    [graph, selectedPersonId, visibleIds],
  )
  const connectablePeople = useMemo(
    () =>
      allPeople
        .filter((person) => person.id !== selectedPersonId)
        .sort((a, b) => a.preferredName.localeCompare(b.preferredName)),
    [allPeople, selectedPersonId],
  )
  const normalizedLinkQuery = linkQuery.trim().toLowerCase()
  const linkMatches = useMemo(
    () =>
      connectablePeople.filter((person) =>
        person.preferredName.toLowerCase().includes(normalizedLinkQuery),
      ),
    [connectablePeople, normalizedLinkQuery],
  )
  const exactMatch = useMemo(
    () =>
      connectablePeople.find(
        (person) => person.preferredName.trim().toLowerCase() === normalizedLinkQuery,
      ) ?? null,
    [connectablePeople, normalizedLinkQuery],
  )

  function resetLinkComposer() {
    setLinkQuery('')
    setLinkSelection(null)
    setLinkError('')
  }

  function handleApplyLink() {
    const trimmed = linkQuery.trim()
    if (!trimmed) {
      setLinkError('Enter a person name.')
      return
    }

    if (linkSelection?.type === 'existing') {
      onConnectExistingPerson(linkSelection.id, linkPredicate)
      resetLinkComposer()
      return
    }

    if (linkSelection?.type === 'new') {
      onAddConnectedPerson(linkPredicate, linkSelection.name)
      resetLinkComposer()
      return
    }

    if (exactMatch) {
      onConnectExistingPerson(exactMatch.id, linkPredicate)
      resetLinkComposer()
      return
    }

    if (linkMatches.length > 0) {
      setLinkError('Choose one of the matching people or select add new.')
      return
    }

    setLinkError(`No existing person found. Select "Add ${trimmed}" to create one.`)
  }

  function handleAddProfileLink() {
    const trimmed = newProfileLink.trim()
    if (!trimmed) return
    onUpdateAttr('links', [...selectedPerson.links, trimmed])
    setNewProfileLink('')
  }

  return (
    <aside className="inspector panel">
      <div className="section-heading">
        <p className="mini-label">Inspector</p>
        <h2>{selectedPerson.preferredName}</h2>
      </div>

      <div className="profile-card">
        <div className="profile-photo">{selectedPerson.photo}</div>
        <div>
          <strong>{selectedPerson.label}</strong>
          <p>{selectedPerson.years}</p>
          <p>{selectedPerson.branch}</p>
        </div>
      </div>

      <section className="inspector-section">
        <div className="form-grid">
          <label>
            <span>Preferred name</span>
            <input
              value={selectedPerson.preferredName}
              onChange={(event) => onUpdateAttr('preferredName', event.target.value)}
            />
          </label>
          <label>
            <span>First name</span>
            <input
              value={selectedPerson.firstName}
              onChange={(event) => onUpdateAttr('firstName', event.target.value)}
            />
          </label>
          <label>
            <span>Last name</span>
            <input
              value={selectedPerson.lastName}
              onChange={(event) => onUpdateAttr('lastName', event.target.value)}
            />
          </label>
          <label>
            <span>DOB</span>
            <input
              className={isDobValid ? '' : 'invalid-field'}
              aria-invalid={!isDobValid}
              value={selectedPerson.dob}
              onChange={(event) => onUpdateAttr('dob', event.target.value)}
              placeholder="YYYY or YYYY-MM-DD"
            />
            {!isDobValid && <small className="field-hint error">Use YYYY, YYYY-MM, or YYYY-MM-DD</small>}
          </label>
          <label>
            <span>DOD</span>
            <input
              className={isDodValid ? '' : 'invalid-field'}
              aria-invalid={!isDodValid}
              value={selectedPerson.dod}
              onChange={(event) => onUpdateAttr('dod', event.target.value)}
              placeholder="YYYY or YYYY-MM-DD"
            />
            {!isDodValid && <small className="field-hint error">Use YYYY, YYYY-MM, or YYYY-MM-DD</small>}
          </label>
          <label>
            <span>Sex</span>
            <select
              value={selectedPerson.sex}
              onChange={(event) => onUpdateAttr('sex', event.target.value)}
            >
              <option value="">Unspecified</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </label>
          <label>
            <span>Birth place</span>
            <input
              value={selectedPerson.birthPlace}
              onChange={(event) => onUpdateAttr('birthPlace', event.target.value)}
            />
          </label>
          <label>
            <span>Current residence</span>
            <input
              value={selectedPerson.currentResidence}
              onChange={(event) => onUpdateAttr('currentResidence', event.target.value)}
            />
          </label>
          <label className="full-width">
            <span>Private notes</span>
            <textarea
              rows={4}
              value={selectedPerson.privateNotes}
              onChange={(event) => onUpdateAttr('privateNotes', event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="inspector-section">
        <h3>Links</h3>
        <div className="links-editor">
          {selectedPerson.links.map((link, index) => (
            <div key={`${link}-${index}`} className="links-editor__row">
              <input
                value={link}
                onChange={(event) => {
                  const nextLinks = selectedPerson.links.map((entry, entryIndex) =>
                    entryIndex === index ? event.target.value : entry,
                  )
                  onUpdateAttr('links', nextLinks)
                }}
                placeholder="https://linkedin.com/in/..."
              />
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  onUpdateAttr(
                    'links',
                    selectedPerson.links.filter((_, entryIndex) => entryIndex !== index),
                  )
                }
              >
                Remove
              </button>
            </div>
          ))}
          <div className="links-editor__row">
            <input
              value={newProfileLink}
              onChange={(event) => setNewProfileLink(event.target.value)}
              placeholder="Add link"
            />
            <button type="button" onClick={handleAddProfileLink}>
              Add
            </button>
          </div>
        </div>
      </section>

      <section className="inspector-section connections">
        <h3>Connections</h3>
        <div className="connection-create">
          <div className="connection-create__row">
            <input
              value={linkQuery}
              onChange={(event) => {
                const nextQuery = event.target.value
                setLinkQuery(nextQuery)
                setLinkError('')
                const normalized = nextQuery.trim().toLowerCase()
                const matchedPerson = connectablePeople.find(
                  (person) => person.preferredName.trim().toLowerCase() === normalized,
                )
                setLinkSelection(
                  matchedPerson ? { type: 'existing', id: matchedPerson.id } : null,
                )
              }}
              placeholder="Find existing or add new person"
            />
            <select
              value={linkPredicate}
              onChange={(event) => setLinkPredicate(event.target.value as EdgePredicate)}
            >
              <option value={EdgePredicate.PARTNER_OF}>partner of</option>
              <option value={EdgePredicate.PARENT_OF}>parent of</option>
            </select>
            <button
              type="button"
              onClick={handleApplyLink}
            >
              Apply
            </button>
          </div>
          {linkQuery.trim() && (
            <div className="connection-picker">
              {linkMatches.slice(0, 6).map((person) => (
                <button
                  key={person.id}
                  type="button"
                  className={
                    linkSelection?.type === 'existing' && linkSelection.id === person.id
                      ? 'connection-picker__option active'
                      : 'connection-picker__option'
                  }
                  onClick={() => {
                    setLinkSelection({ type: 'existing', id: person.id })
                    setLinkQuery(person.preferredName)
                    setLinkError('')
                  }}
                >
                  <span>{person.preferredName}</span>
                  <small>Existing person</small>
                </button>
              ))}
              {!exactMatch && (
                <button
                  type="button"
                  className={
                    linkSelection?.type === 'new'
                      ? 'connection-picker__option active'
                      : 'connection-picker__option'
                  }
                  onClick={() => {
                    setLinkSelection({ type: 'new', name: linkQuery.trim() })
                    setLinkError('')
                  }}
                >
                  <span>Add {linkQuery.trim()}</span>
                  <small>Create new person</small>
                </button>
              )}
            </div>
          )}
          {linkError && <p className="connection-create__error">{linkError}</p>}
        </div>
        <div className="quick-actions">
          <button type="button" onClick={() => onQuickAddRelative('parent')}>
            Add parent
          </button>
          <button type="button" onClick={() => onQuickAddRelative('child')}>
            Add child
          </button>
          <button type="button" onClick={() => onQuickAddRelative('partner')}>
            Add partner
          </button>
          <button type="button" onClick={() => onQuickAddRelative('sibling')}>
            Add sibling
          </button>
          <button type="button" className="secondary-button" onClick={() => onCreateStandalonePerson('New Person')}>
            Add standalone person
          </button>
        </div>
        <ul className="connection-list">
          {connections.map(({ edge, person }) => (
            <li key={edge.id} className="connection-item">
              <div className="connection-item__inline">
                <div className="connection-item__name">{person.preferredName}</div>
                <select
                  value={edge.predicate}
                  onChange={(event) => onUpdateConnection(edge.id, event.target.value)}
                >
                  <option value={EdgePredicate.PARENT_OF}>parent of</option>
                  <option value={EdgePredicate.PARTNER_OF}>partner of</option>
                </select>
                <small className="connection-item__direction">
                  {edge.src === selectedPersonId ? 'outgoing' : 'incoming'}
                </small>
                {edge.predicate !== EdgePredicate.PARTNER_OF && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => onReverseConnection(edge.id)}
                    >
                      Reverse
                    </button>
                  )}
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => onDeleteConnection(edge.id)}
                >
                  Clear
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="inspector-section delete-section">
        <h3>Delete Node</h3>
        <p className="delete-section__copy">
          Soft delete anonymizes this person. Hard delete removes every link connected to this node.
        </p>
        <div className="delete-section__actions">
          <button type="button" className="secondary-button" onClick={onSoftDeletePerson}>
            Soft delete
          </button>
          <button type="button" className="danger-button" onClick={onHardDeletePerson}>
            Hard delete
          </button>
        </div>
      </section>
    </aside>
  )
}

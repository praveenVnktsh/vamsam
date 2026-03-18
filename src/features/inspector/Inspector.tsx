import { useEffect, useMemo, useState } from 'react'
import { EdgePredicate, type GraphSchema } from '../../domain/graph'
import { displayName, personConnections, type PersonView } from '../../domain/graphOps'
import { PersonAvatar } from '../PersonAvatar'
import { PersonTokenSelector } from '../PersonTokenSelector'

type ConnectionComposerPredicate =
  | typeof EdgePredicate.PARENT_OF
  | typeof EdgePredicate.PARTNER_OF
  | 'child'
  | 'sibling'

type InspectorProps = {
  graph: GraphSchema
  selectedPerson: PersonView
  selectedPersonId: string
  visibleIds: Set<string>
  allPeople: PersonView[]
  collapsed: boolean
  onFlyToNode: () => void
  onClose: () => void
  onToggleCollapse: () => void
  onCreateStandalonePerson: (preferredName?: string) => void
  onQuickAddRelative: (type: 'parent' | 'child' | 'partner' | 'sibling') => void
  onUpdateAttr: (key: string, value: string | string[]) => void
  onUpdateConnection: (edgeId: string, predicate: string) => void
  onReverseConnection: (edgeId: string) => void
  onDeleteConnection: (edgeId: string) => void
  onAddConnectedPerson: (predicate: ConnectionComposerPredicate, preferredName: string) => void
  onConnectExistingPerson: (targetId: string, predicate: ConnectionComposerPredicate) => void
  onSoftDeletePerson: () => void
  onHardDeletePerson: () => void
}

export function Inspector({
  graph,
  selectedPerson,
  selectedPersonId,
  visibleIds,
  allPeople,
  collapsed,
  onFlyToNode,
  onClose,
  onToggleCollapse,
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
  const [linkPredicate, setLinkPredicate] = useState<ConnectionComposerPredicate>(
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
        .sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [allPeople, selectedPersonId],
  )

  function resetLinkComposer() {
    setLinkQuery('')
    setLinkSelection(null)
    setLinkError('')
  }

  useEffect(() => {
    resetLinkComposer()
    setLinkPredicate(EdgePredicate.PARTNER_OF)
    setNewProfileLink('')
  }, [selectedPersonId])

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

    setLinkError(`Choose an existing person or select "Add ${trimmed}" to create one.`)
  }

  function handleAddProfileLink() {
    const trimmed = newProfileLink.trim()
    if (!trimmed) return
    onUpdateAttr('links', [...selectedPerson.links, trimmed])
    setNewProfileLink('')
  }

  function connectionDescriptor(edge: (typeof connections)[number]['edge']) {
    if (edge.predicate === EdgePredicate.PARTNER_OF) return 'partner_of'
    if (edge.predicate === EdgePredicate.PARENT_OF) {
      return edge.src === selectedPersonId ? 'parent_of' : 'child_of'
    }
    return edge.predicate
  }

  function handleConnectionDescriptorChange(
    edge: (typeof connections)[number]['edge'],
    nextDescriptor: 'parent_of' | 'child_of' | 'partner_of',
  ) {
    if (nextDescriptor === 'partner_of') {
      onUpdateConnection(edge.id, EdgePredicate.PARTNER_OF)
      return
    }

    onUpdateConnection(edge.id, EdgePredicate.PARENT_OF)

    const isCurrentlyParentOf = edge.predicate === EdgePredicate.PARENT_OF && edge.src === selectedPersonId
    const isCurrentlyChildOf = edge.predicate === EdgePredicate.PARENT_OF && edge.dst === selectedPersonId

    if (nextDescriptor === 'parent_of' && isCurrentlyChildOf) {
      onReverseConnection(edge.id)
      return
    }

    if (nextDescriptor === 'child_of' && isCurrentlyParentOf) {
      onReverseConnection(edge.id)
    }
  }

  return (
    <aside className={`inspector panel${collapsed ? ' inspector-collapsed' : ''}`}>
      <div className="inspector-topbar">
        <div>
          <p className="mini-label">Inspector</p>
          <h2>{displayName(selectedPerson)}</h2>
        </div>
        <div className="inspector-topbar__actions">
          <button type="button" className="secondary-button inspector-topbar__action" onClick={(event) => {
            event.stopPropagation()
            onToggleCollapse()
          }}>
            {collapsed ? '+' : '-'}
          </button>
          <button type="button" className="secondary-button inspector-topbar__action" onClick={(event) => {
            event.stopPropagation()
            onFlyToNode()
          }}>
            Fly to node
          </button>
          <button type="button" className="secondary-button inspector-topbar__action" onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}>
            ×
          </button>
        </div>
      </div>

      {!collapsed && <div className="inspector-body">
        <div className="profile-card">
          <PersonAvatar person={selectedPerson} className="profile-photo" />
          <div>
            <strong>{selectedPerson.label}</strong>
            <p>{selectedPerson.years}</p>
            <p>{selectedPerson.branch}</p>
          </div>
        </div>

        <section className="inspector-section">
          <div className="form-grid">
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
              <span>Nickname</span>
              <input
                value={selectedPerson.nickname}
                onChange={(event) => onUpdateAttr('nickname', event.target.value)}
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
              <PersonTokenSelector
                label="Person"
                people={connectablePeople}
                query={linkQuery}
                selectedPersonId={linkSelection?.type === 'existing' ? linkSelection.id : ''}
                selection={linkSelection}
                allowCreateNew
                placeholder="Find existing or add new person"
                onQueryChange={(value) => {
                  setLinkQuery(value)
                  setLinkError('')
                }}
                onSelectionChange={(selection) => {
                  setLinkSelection(selection)
                  setLinkError('')
                }}
              />
              <select
                value={linkPredicate}
                onChange={(event) => setLinkPredicate(event.target.value as ConnectionComposerPredicate)}
              >
                <option value={EdgePredicate.PARTNER_OF}>partner of</option>
                <option value={EdgePredicate.PARENT_OF}>parent of</option>
                <option value="child">child of</option>
                <option value="sibling">sibling of</option>
              </select>
              <button
                type="button"
                onClick={handleApplyLink}
              >
                Apply
              </button>
            </div>
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
                  <small className="connection-item__verb">is</small>
                  <select
                    value={connectionDescriptor(edge)}
                    onChange={(event) =>
                      handleConnectionDescriptorChange(
                        edge,
                        event.target.value as 'parent_of' | 'child_of' | 'partner_of',
                      )
                    }
                  >
                    <option value="parent_of">parent of</option>
                    <option value="child_of">child of</option>
                    <option value="partner_of">partner of</option>
                  </select>
                  <small className="connection-item__verb">of</small>
                  <div className="connection-item__name">{displayName(person)}</div>
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
            Soft delete anonymizes this person. Hard delete removes the node and every connected link.
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
      </div>}
    </aside>
  )
}

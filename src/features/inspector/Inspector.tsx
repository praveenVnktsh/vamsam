import { useMemo, useState } from 'react'
import { EdgePredicate, type GraphSchema } from '../../domain/graph'
import { personConnections, type PersonView } from '../../domain/graphOps'

type InspectorProps = {
  graph: GraphSchema
  selectedPerson: PersonView
  selectedPersonId: string
  visibleIds: Set<string>
  allPeople: PersonView[]
  onUpdateAttr: (key: string, value: string) => void
  onRenameConnectedPerson: (personId: string, value: string) => void
  onUpdateConnection: (edgeId: string, predicate: string) => void
  onReverseConnection: (edgeId: string) => void
  onDeleteConnection: (edgeId: string) => void
  onAddConnectedPerson: (predicate: EdgePredicate, preferredName: string) => void
  onConnectExistingPerson: (targetId: string, predicate: EdgePredicate) => void
}

export function Inspector({
  graph,
  selectedPerson,
  selectedPersonId,
  visibleIds,
  allPeople,
  onUpdateAttr,
  onRenameConnectedPerson,
  onUpdateConnection,
  onReverseConnection,
  onDeleteConnection,
  onAddConnectedPerson,
  onConnectExistingPerson,
}: InspectorProps) {
  const [newConnectionName, setNewConnectionName] = useState('')
  const [newConnectionPredicate, setNewConnectionPredicate] = useState<EdgePredicate>(
    EdgePredicate.PARENT_OF,
  )
  const [existingTargetId, setExistingTargetId] = useState('')
  const [existingPredicate, setExistingPredicate] = useState<EdgePredicate>(
    EdgePredicate.PARTNER_OF,
  )
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
            <span>Gender</span>
            <input
              value={selectedPerson.gender}
              onChange={(event) => onUpdateAttr('gender', event.target.value)}
            />
          </label>
          <label>
            <span>Role label</span>
            <input
              value={selectedPerson.roleLabel}
              onChange={(event) => onUpdateAttr('roleLabel', event.target.value)}
            />
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
          <label>
            <span>Undergrad school</span>
            <input
              value={selectedPerson.undergradSchool}
              onChange={(event) => onUpdateAttr('undergradSchool', event.target.value)}
            />
          </label>
          <label>
            <span>Undergrad degree</span>
            <input
              value={selectedPerson.undergradDegree}
              onChange={(event) => onUpdateAttr('undergradDegree', event.target.value)}
            />
          </label>
          <label>
            <span>Grad school</span>
            <input
              value={selectedPerson.gradSchool}
              onChange={(event) => onUpdateAttr('gradSchool', event.target.value)}
            />
          </label>
          <label>
            <span>Field of work</span>
            <input
              value={selectedPerson.fieldOfWork}
              onChange={(event) => onUpdateAttr('fieldOfWork', event.target.value)}
            />
          </label>
          <label className="full-width">
            <span>Health history</span>
            <textarea
              rows={3}
              value={selectedPerson.healthHistory}
              onChange={(event) => onUpdateAttr('healthHistory', event.target.value)}
            />
          </label>
          <label className="full-width">
            <span>Bio</span>
            <textarea
              rows={3}
              value={selectedPerson.bio}
              onChange={(event) => onUpdateAttr('bio', event.target.value)}
            />
          </label>
          <label className="full-width">
            <span>Notes</span>
            <textarea
              rows={4}
              value={selectedPerson.notes}
              onChange={(event) => onUpdateAttr('notes', event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="inspector-section connections">
        <h3>Connections</h3>
        <div className="connection-create">
          <div className="connection-create__row">
            <input
              value={newConnectionName}
              onChange={(event) => setNewConnectionName(event.target.value)}
              placeholder="Add new person"
            />
            <select
              value={newConnectionPredicate}
              onChange={(event) =>
                setNewConnectionPredicate(event.target.value as EdgePredicate)
              }
            >
              <option value={EdgePredicate.PARENT_OF}>parent of</option>
              <option value={EdgePredicate.PARTNER_OF}>partner of</option>
              <option value={EdgePredicate.SIBLING_OF}>sibling of</option>
              <option value={EdgePredicate.GUARDIAN_OF}>guardian of</option>
              <option value={EdgePredicate.STEP_PARENT_OF}>step parent of</option>
              <option value={EdgePredicate.CLOSE_TO}>close to</option>
              <option value={EdgePredicate.ESTRANGED_FROM}>estranged from</option>
            </select>
            <button
              type="button"
              onClick={() => {
                onAddConnectedPerson(newConnectionPredicate, newConnectionName)
                setNewConnectionName('')
              }}
            >
              Add
            </button>
          </div>
          <div className="connection-create__row">
            <select
              value={existingTargetId}
              onChange={(event) => setExistingTargetId(event.target.value)}
            >
              <option value="">Connect existing person</option>
              {connectablePeople.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.preferredName}
                </option>
              ))}
            </select>
            <select
              value={existingPredicate}
              onChange={(event) => setExistingPredicate(event.target.value as EdgePredicate)}
            >
              <option value={EdgePredicate.PARTNER_OF}>partner of</option>
              <option value={EdgePredicate.SIBLING_OF}>sibling of</option>
              <option value={EdgePredicate.PARENT_OF}>parent of</option>
              <option value={EdgePredicate.GUARDIAN_OF}>guardian of</option>
              <option value={EdgePredicate.STEP_PARENT_OF}>step parent of</option>
              <option value={EdgePredicate.CLOSE_TO}>close to</option>
              <option value={EdgePredicate.ESTRANGED_FROM}>estranged from</option>
            </select>
            <button
              type="button"
              onClick={() => {
                if (!existingTargetId) return
                onConnectExistingPerson(existingTargetId, existingPredicate)
                setExistingTargetId('')
              }}
            >
              Link
            </button>
          </div>
        </div>
        <ul className="connection-list">
          {connections.map(({ edge, person }) => (
            <li key={edge.id} className="connection-item">
              <div className="connection-item__summary">
                <input
                  value={person.preferredName}
                  onChange={(event) =>
                    onRenameConnectedPerson(person.id, event.target.value)
                  }
                />
                <small>
                  {edge.src === selectedPersonId ? 'outgoing' : 'incoming'}
                </small>
              </div>
              <div className="connection-item__controls">
                <select
                  value={edge.predicate}
                  onChange={(event) => onUpdateConnection(edge.id, event.target.value)}
                >
                  <option value={EdgePredicate.PARENT_OF}>parent of</option>
                  <option value={EdgePredicate.PARTNER_OF}>partner of</option>
                  <option value={EdgePredicate.SIBLING_OF}>sibling of</option>
                  <option value={EdgePredicate.GUARDIAN_OF}>guardian of</option>
                  <option value={EdgePredicate.STEP_PARENT_OF}>step parent of</option>
                  <option value={EdgePredicate.CLOSE_TO}>close to</option>
                  <option value={EdgePredicate.ESTRANGED_FROM}>estranged from</option>
                </select>
                {edge.predicate !== EdgePredicate.PARTNER_OF &&
                  edge.predicate !== EdgePredicate.SIBLING_OF && (
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
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  )
}

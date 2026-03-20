import { useEffect, useMemo, useRef, useState } from 'react'
import { EdgePredicate, type GraphSchema } from '../../domain/graph'
import { displayName, personConnections, type PersonView } from '../../domain/graphOps'
import { cropImageFile } from '../../data/photoStorage'
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
  relationToViewer?: string
  visibleIds: Set<string>
  allPeople: PersonView[]
  collapsed: boolean
  canEditPerson: boolean
  canManageConnections: boolean
  canDeletePerson: boolean
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
  onUploadPhoto: (file: File) => Promise<void>
  onSoftDeletePerson: () => void
  onHardDeletePerson: () => void
}

export function Inspector({
  graph,
  selectedPerson,
  selectedPersonId,
  relationToViewer = '',
  visibleIds,
  allPeople,
  collapsed,
  canEditPerson,
  canManageConnections,
  canDeletePerson,
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
  onUploadPhoto,
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
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [photoUrlInput, setPhotoUrlInput] = useState('')
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null)
  const [cropPreviewUrl, setCropPreviewUrl] = useState('')
  const [cropCenterX, setCropCenterX] = useState(0.5)
  const [cropCenterY, setCropCenterY] = useState(0.5)
  const [cropZoom, setCropZoom] = useState(1)
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null)
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
    setPhotoUploading(false)
    setPhotoError('')
    setPhotoUrlInput('')
    setPendingPhotoFile(null)
    setCropPreviewUrl('')
    setCropCenterX(0.5)
    setCropCenterY(0.5)
    setCropZoom(1)
  }, [selectedPersonId])

  async function handlePhotoPicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const previewUrl = URL.createObjectURL(file)
    setPendingPhotoFile(file)
    setCropPreviewUrl(previewUrl)
    setCropCenterX(0.5)
    setCropCenterY(0.5)
    setCropZoom(1)
    setPhotoError('')
  }

  useEffect(() => {
    if (!pendingPhotoFile || !cropPreviewUrl || !cropCanvasRef.current) return

    const image = new Image()
    image.onload = () => {
      const canvas = cropCanvasRef.current
      if (!canvas) return
      const context = canvas.getContext('2d')
      if (!context) return

      const size = canvas.width
      const sourceCropSize = Math.max(1, Math.round(Math.min(image.width, image.height) / cropZoom))
      const centerX = image.width * cropCenterX
      const centerY = image.height * cropCenterY
      const sourceX = Math.max(
        0,
        Math.min(image.width - sourceCropSize, Math.round(centerX - sourceCropSize / 2)),
      )
      const sourceY = Math.max(
        0,
        Math.min(image.height - sourceCropSize, Math.round(centerY - sourceCropSize / 2)),
      )

      context.clearRect(0, 0, size, size)
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceCropSize,
        sourceCropSize,
        0,
        0,
        size,
        size,
      )
    }
    image.src = cropPreviewUrl

    return () => {
      image.onload = null
    }
  }, [cropCenterX, cropCenterY, cropPreviewUrl, cropZoom, pendingPhotoFile])

  useEffect(() => {
    return () => {
      if (cropPreviewUrl) {
        URL.revokeObjectURL(cropPreviewUrl)
      }
    }
  }, [cropPreviewUrl])

  async function handleApplyPhotoCrop() {
    if (!pendingPhotoFile) return

    setPhotoUploading(true)
    setPhotoError('')

    try {
      const croppedFile = await cropImageFile(pendingPhotoFile, {
        centerX: cropCenterX,
        centerY: cropCenterY,
        zoom: cropZoom,
      })
      await onUploadPhoto(croppedFile)
      URL.revokeObjectURL(cropPreviewUrl)
      setPendingPhotoFile(null)
      setCropPreviewUrl('')
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'Unable to upload photo.')
    } finally {
      setPhotoUploading(false)
    }
  }

  function handleCancelPhotoCrop() {
    if (cropPreviewUrl) {
      URL.revokeObjectURL(cropPreviewUrl)
    }
    setPendingPhotoFile(null)
    setCropPreviewUrl('')
    setCropCenterX(0.5)
    setCropCenterY(0.5)
    setCropZoom(1)
  }

  async function handleLoadPhotoFromLink() {
    const trimmed = photoUrlInput.trim()
    if (!trimmed) {
      setPhotoError('Enter an image URL.')
      return
    }

    try {
      const parsed = new URL(trimmed)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        setPhotoError('Use an http or https image URL.')
        return
      }
    } catch {
      setPhotoError('Enter a valid image URL.')
      return
    }

    setPhotoUploading(true)
    setPhotoError('')

    try {
      const response = await fetch(trimmed)
      if (!response.ok) {
        throw new Error('Unable to download image from link.')
      }

      const blob = await response.blob()
      if (!blob.type.startsWith('image/')) {
        throw new Error('That link does not point to an image.')
      }

      const extension = blob.type.split('/')[1] || 'jpg'
      const linkedFile = new File([blob], `linked-photo.${extension}`, { type: blob.type })
      const previewUrl = URL.createObjectURL(linkedFile)

      if (cropPreviewUrl) {
        URL.revokeObjectURL(cropPreviewUrl)
      }

      setPendingPhotoFile(linkedFile)
      setCropPreviewUrl(previewUrl)
      setCropCenterX(0.5)
      setCropCenterY(0.5)
      setCropZoom(1)
      setPhotoUrlInput('')
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'Unable to load image link.')
    } finally {
      setPhotoUploading(false)
    }
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
          {relationToViewer ? <p className="inspector-topbar__relation">{relationToViewer}</p> : null}
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
            {relationToViewer ? <p className="profile-card__relation">{relationToViewer}</p> : null}
            <p>{selectedPerson.years}</p>
            <p>{selectedPerson.branch}</p>
          </div>
        </div>

        <section className="inspector-section">
          <h3>Photo</h3>
          <div className="photo-actions">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="photo-actions__input"
              onChange={(event) => void handlePhotoPicked(event)}
            />
            <button
              type="button"
              className="secondary-button"
              onClick={() => photoInputRef.current?.click()}
              disabled={photoUploading || !canEditPerson}
            >
              {photoUploading ? 'Uploading...' : 'Upload photo'}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => onUpdateAttr('photo', '')}
              disabled={photoUploading || !selectedPerson.photo.trim() || !canEditPerson}
            >
              Clear photo
            </button>
          </div>
          <div className="photo-link-row">
            <input
              type="url"
              value={photoUrlInput}
              onChange={(event) => setPhotoUrlInput(event.target.value)}
              placeholder="Load from image link..."
            />
            <button
              type="button"
              className="secondary-button"
              onClick={() => void handleLoadPhotoFromLink()}
              disabled={photoUploading || !canEditPerson}
            >
              Load link
            </button>
          </div>
          {photoError && <small className="field-hint error">{photoError}</small>}
          {pendingPhotoFile && cropPreviewUrl && (
            <div className="photo-cropper">
              <div className="photo-cropper__preview">
                <canvas ref={cropCanvasRef} width={240} height={240} />
              </div>
              <div className="photo-cropper__controls">
                <label>
                  <span>Horizontal</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={cropCenterX * 100}
                    onChange={(event) => setCropCenterX(Number(event.target.value) / 100)}
                  />
                </label>
                <label>
                  <span>Vertical</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={cropCenterY * 100}
                    onChange={(event) => setCropCenterY(Number(event.target.value) / 100)}
                  />
                </label>
                <label>
                  <span>Zoom</span>
                  <input
                    type="range"
                    min={100}
                    max={300}
                    step={1}
                    value={cropZoom * 100}
                    onChange={(event) => setCropZoom(Number(event.target.value) / 100)}
                  />
                </label>
              </div>
              <div className="photo-cropper__actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleCancelPhotoCrop}
                  disabled={photoUploading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void handleApplyPhotoCrop()}
                  disabled={photoUploading || !canEditPerson}
                >
                  {photoUploading ? 'Uploading...' : 'Crop and upload'}
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="inspector-section">
          {!canEditPerson ? (
            <small className="field-hint">This person is outside your editable branch. Ask an admin to change these fields.</small>
          ) : null}
          <div className="form-grid">
            <label>
              <span>First name</span>
              <input
                value={selectedPerson.firstName}
                disabled={!canEditPerson}
                onChange={(event) => onUpdateAttr('firstName', event.target.value)}
              />
            </label>
            <label>
              <span>Last name</span>
              <input
                value={selectedPerson.lastName}
                disabled={!canEditPerson}
                onChange={(event) => onUpdateAttr('lastName', event.target.value)}
              />
            </label>
            <label>
              <span>Nickname</span>
              <input
                value={selectedPerson.nickname}
                disabled={!canEditPerson}
                onChange={(event) => onUpdateAttr('nickname', event.target.value)}
              />
            </label>
            <label className="full-width">
              <span>Email</span>
              <input
                type="email"
                value={selectedPerson.email}
                disabled={!canEditPerson}
                onChange={(event) => onUpdateAttr('email', event.target.value)}
                placeholder="Use this to link a signed-in person identity"
              />
            </label>
            <label>
              <span>DOB</span>
              <input
                className={isDobValid ? '' : 'invalid-field'}
                aria-invalid={!isDobValid}
                value={selectedPerson.dob}
                disabled={!canEditPerson}
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
                disabled={!canEditPerson}
                onChange={(event) => onUpdateAttr('dod', event.target.value)}
                placeholder="YYYY or YYYY-MM-DD"
              />
              {!isDodValid && <small className="field-hint error">Use YYYY, YYYY-MM, or YYYY-MM-DD</small>}
            </label>
            <label>
              <span>Sex</span>
              <select
                value={selectedPerson.sex}
                disabled={!canEditPerson}
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
                disabled={!canEditPerson}
                onChange={(event) => onUpdateAttr('birthPlace', event.target.value)}
              />
            </label>
            <label>
              <span>Current residence</span>
              <input
                value={selectedPerson.currentResidence}
                disabled={!canEditPerson}
                onChange={(event) => onUpdateAttr('currentResidence', event.target.value)}
              />
            </label>
            <label className="full-width">
              <span>Private notes</span>
              <textarea
                rows={4}
                value={selectedPerson.privateNotes}
                disabled={!canEditPerson}
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
                  disabled={!canEditPerson}
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
                  disabled={!canEditPerson}
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
                disabled={!canEditPerson}
                onChange={(event) => setNewProfileLink(event.target.value)}
                placeholder="Add link"
              />
              <button type="button" onClick={handleAddProfileLink} disabled={!canEditPerson}>
                Add
              </button>
            </div>
          </div>
        </section>

        <section className="inspector-section connections">
          <h3>Connections</h3>
          {!canManageConnections ? (
            <small className="field-hint">Relationship changes on this node require an admin review.</small>
          ) : null}
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
                disabled={!canManageConnections}
              />
              <select
                value={linkPredicate}
                disabled={!canManageConnections}
                onChange={(event) => setLinkPredicate(event.target.value as ConnectionComposerPredicate)}
              >
                <option value={EdgePredicate.PARTNER_OF}>partner of</option>
                <option value={EdgePredicate.PARENT_OF}>parent of</option>
                <option value="child">child of</option>
                <option value="sibling">sibling of</option>
              </select>
              <button
                type="button"
                disabled={!canManageConnections}
                onClick={handleApplyLink}
              >
                Apply
              </button>
            </div>
            {linkError && <p className="connection-create__error">{linkError}</p>}
          </div>
          <div className="quick-actions">
            <button type="button" onClick={() => onQuickAddRelative('parent')} disabled={!canManageConnections}>
              Add parent
            </button>
            <button type="button" onClick={() => onQuickAddRelative('child')} disabled={!canManageConnections}>
              Add child
            </button>
            <button type="button" onClick={() => onQuickAddRelative('partner')} disabled={!canManageConnections}>
              Add partner
            </button>
            <button type="button" onClick={() => onQuickAddRelative('sibling')} disabled={!canManageConnections}>
              Add sibling
            </button>
            <button type="button" className="secondary-button" onClick={() => onCreateStandalonePerson('New Person')} disabled={!canManageConnections}>
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
                    disabled={!canManageConnections}
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
                    disabled={!canManageConnections}
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
            <button type="button" className="secondary-button" onClick={onSoftDeletePerson} disabled={!canDeletePerson}>
              Soft delete
            </button>
            <button type="button" className="danger-button" onClick={onHardDeletePerson} disabled={!canDeletePerson}>
              Hard delete
            </button>
          </div>
          {!canDeletePerson ? (
            <small className="field-hint">Deleting this person requires admin review.</small>
          ) : null}
        </section>
      </div>}
    </aside>
  )
}

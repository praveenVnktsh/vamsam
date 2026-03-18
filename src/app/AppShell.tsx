import type { CSSProperties, ChangeEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  decryptGraphBackup,
  encryptGraphBackup,
  isEncryptedBackupFile,
} from '../data/backupCrypto'
import { EdgePredicate, type GraphSchema, validateGraph } from '../domain/graph'
import {
  addConnectedPerson,
  addConnection,
  addParentPerson,
  addRelative,
  addStandalonePerson,
  autoLayoutGraph,
  connectPeopleAsSiblings,
  deleteEdge,
  descendantPersonIds,
  displayName,
  expandNeighborhood,
  fullName,
  graphHasRenderablePeople,
  graphPeople,
  hardDeletePerson,
  personMap,
  reverseEdge,
  resolveRelationship,
  addSiblingPerson,
  sanitizeGraphForCoreRelationships,
  shortestBloodPath,
  softDeletePerson,
  shortestPersonPath,
  updateEdge,
  updatePersonAttr,
  updatePersonPosition,
  visibleEdges as getVisibleEdges,
  visiblePersonIds,
} from '../domain/graphOps'
import { PersonTokenSelector } from '../features/PersonTokenSelector'
import { TreeCanvas } from '../features/canvas/TreeCanvas'
import { Inspector } from '../features/inspector/Inspector'

const depthOptions = [1, 2, 3, 99] as const

type AppShellProps = {
  initialGraph: GraphSchema
  userEmail: string
  canEdit: boolean
  onPersistGraph: (graph: GraphSchema) => Promise<void>
  onResetGraph: () => Promise<GraphSchema>
  onSignOut: () => Promise<void> | void
}

export function AppShell({
  initialGraph,
  userEmail,
  canEdit,
  onPersistGraph,
  onResetGraph,
  onSignOut,
}: AppShellProps) {
  const centerStageRef = useRef<HTMLElement | null>(null)
  const viewControlsRef = useRef<HTMLDivElement | null>(null)
  const relationshipDialogRef = useRef<HTMLDivElement | null>(null)
  const [graph, setGraph] = useState<GraphSchema>(initialGraph)
  const [leftCollapsed, setLeftCollapsed] = useState(true)
  const [rightCollapsed, setRightCollapsed] = useState(true)
  const [rightSidebarWidth, setRightSidebarWidth] = useState(440)
  const [isResizingRightSidebar, setIsResizingRightSidebar] = useState(false)
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [flyToPersonRequest, setFlyToPersonRequest] = useState<{
    nonce: number
    personId: string
  } | null>(null)
  const [search, setSearch] = useState('')
  const [depth, setDepth] = useState<(typeof depthOptions)[number]>(99)
  const [viewMode, setViewMode] = useState<'overview' | 'focus' | 'lineage'>('overview')
  const [showRelationshipGraph, setShowRelationshipGraph] = useState(false)
  const [includePartners, setIncludePartners] = useState(true)
  const includeNonBlood = false
  const [compactLayout, setCompactLayout] = useState(true)
  const [layoutMode, setLayoutMode] = useState<'person' | 'family'>('family')
  const [viewControlsCollapsed, setViewControlsCollapsed] = useState(true)
  const [relationshipDialogCollapsed, setRelationshipDialogCollapsed] = useState(true)
  const [viewControlsPosition, setViewControlsPosition] = useState<{ x: number; y: number } | null>(
    null,
  )
  const [relationshipDialogPosition, setRelationshipDialogPosition] = useState<{
    x: number
    y: number
  } | null>(null)
  const [relationshipFromId, setRelationshipFromId] = useState<string>('')
  const [relationshipToId, setRelationshipToId] = useState<string>('')
  const [relationshipFromQuery, setRelationshipFromQuery] = useState('')
  const [relationshipToQuery, setRelationshipToQuery] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const encryptedFileInputRef = useRef<HTMLInputElement | null>(null)
  const graphRef = useRef(graph)
  const layoutRunRef = useRef(0)
  const overlayDragRef = useRef<{
    kind: 'view' | 'relationship'
    offsetX: number
    offsetY: number
    startX: number
    startY: number
  } | null>(null)
  const suppressViewToggleClickRef = useRef(false)
  const suppressRelationshipToggleClickRef = useRef(false)
  const depthIndex = depthOptions.indexOf(depth)

  function snapToNearestCorner(
    stageWidth: number,
    stageHeight: number,
    overlayWidth: number,
    overlayHeight: number,
    position: { x: number; y: number },
  ) {
    const inset = 12
    const maxX = Math.max(inset, stageWidth - overlayWidth - inset)
    const maxY = Math.max(inset, stageHeight - overlayHeight - inset)
    const left = position.x < stageWidth / 2 ? inset : maxX
    const top = position.y < stageHeight / 2 ? inset : maxY

    return { x: left, y: top }
  }

  useEffect(() => {
    graphRef.current = graph
  }, [graph])

  useEffect(() => {
    setGraph(initialGraph)
  }, [initialGraph])

  useEffect(() => {
    const stage = centerStageRef.current
    const viewElement = viewControlsRef.current
    const relationshipElement = relationshipDialogRef.current

    if (!stage || !viewElement || !relationshipElement) return

    setViewControlsPosition((current) =>
      snapToNearestCorner(
        stage.clientWidth,
        stage.clientHeight,
        viewElement.offsetWidth,
        viewElement.offsetHeight,
        current ?? {
          x: Math.max(12, stage.clientWidth - viewElement.offsetWidth - 18),
          y: 18,
        },
      ),
    )

    setRelationshipDialogPosition((current) =>
      snapToNearestCorner(
        stage.clientWidth,
        stage.clientHeight,
        relationshipElement.offsetWidth,
        relationshipElement.offsetHeight,
        current ?? {
          x: 12,
          y: 12,
        },
      ),
    )
  }, [
    leftCollapsed,
    relationshipDialogCollapsed,
    rightCollapsed,
    rightSidebarWidth,
    viewControlsCollapsed,
  ])

  useEffect(() => {
    if (!isResizingRightSidebar) return

    function handleMouseMove(event: MouseEvent) {
      const nextWidth = window.innerWidth - event.clientX
      setRightSidebarWidth(Math.max(340, Math.min(720, nextWidth)))
    }

    function handleMouseUp() {
      setIsResizingRightSidebar(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizingRightSidebar])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void onPersistGraph(graph)
    }, 400)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [graph, onPersistGraph])

  function startOverlayDrag(
    kind: 'view' | 'relationship',
    event: React.MouseEvent<HTMLDivElement>,
  ) {
    event.preventDefault()
    event.stopPropagation()
    const stage = centerStageRef.current
    const overlay =
      kind === 'view' ? viewControlsRef.current : relationshipDialogRef.current
    if (!stage || !overlay) return
    const stageElement = stage
    const overlayElement = overlay

    const overlayRect = overlayElement.getBoundingClientRect()
    const drag = {
      kind,
      offsetX: event.clientX - overlayRect.left,
      offsetY: event.clientY - overlayRect.top,
      startX: event.clientX,
      startY: event.clientY,
    }
    overlayDragRef.current = drag
    let didDrag = false
    let lastPosition =
      kind === 'view'
        ? viewControlsPosition ?? { x: 12, y: 12 }
        : relationshipDialogPosition ?? { x: 12, y: 12 }

    function handleMouseMove(moveEvent: MouseEvent) {
      const stageRect = stageElement.getBoundingClientRect()
      const nextX = moveEvent.clientX - stageRect.left - drag.offsetX
      const nextY = moveEvent.clientY - stageRect.top - drag.offsetY
      const maxX = Math.max(12, stageElement.clientWidth - overlayElement.offsetWidth - 12)
      const maxY = Math.max(12, stageElement.clientHeight - overlayElement.offsetHeight - 12)
      const nextPosition = {
        x: Math.max(12, Math.min(maxX, nextX)),
        y: Math.max(12, Math.min(maxY, nextY)),
      }
      lastPosition = nextPosition

      if (
        Math.abs(moveEvent.clientX - drag.startX) > 3 ||
        Math.abs(moveEvent.clientY - drag.startY) > 3
      ) {
        didDrag = true
        suppressViewToggleClickRef.current = kind === 'view'
        suppressRelationshipToggleClickRef.current = kind === 'relationship'
      }

      if (kind === 'view') {
        setViewControlsPosition(nextPosition)
      } else {
        setRelationshipDialogPosition(nextPosition)
      }
    }

    function handleMouseUp() {
      if (didDrag) {
        const snappedPosition = snapToNearestCorner(
          stageElement.clientWidth,
          stageElement.clientHeight,
          overlayElement.offsetWidth,
          overlayElement.offsetHeight,
          lastPosition,
        )

        if (kind === 'view') {
          setViewControlsPosition(snappedPosition)
        } else {
          setRelationshipDialogPosition(snappedPosition)
        }
      }

      overlayDragRef.current = null
      window.setTimeout(() => {
        suppressViewToggleClickRef.current = false
        suppressRelationshipToggleClickRef.current = false
      }, 0)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  const people = useMemo(() => graphPeople(graph), [graph])
  const peopleById = useMemo(() => personMap(people), [people])
  const selectedPerson = selectedPersonId ? peopleById.get(selectedPersonId) ?? null : null
  const lineageBloodIds = useMemo(
    () =>
      viewMode === 'lineage'
        ? descendantPersonIds(graph, selectedPerson?.id ?? '', false)
        : new Set<string>(),
    [graph, selectedPerson, viewMode],
  )

  const visibleIds = useMemo(
    () => {
      if (showRelationshipGraph && relationshipFromId && relationshipToId) {
        const pathIds = shortestPersonPath(graph, relationshipFromId, relationshipToId)
        return expandNeighborhood(graph, pathIds, 2, true, includeNonBlood)
      }

      if (viewMode === 'overview') {
        return new Set(people.map((person) => person.id))
      }

      if (viewMode === 'lineage') {
        return descendantPersonIds(
          graph,
          selectedPerson?.id ?? '',
          includePartners,
        )
      }

      return visiblePersonIds(
        graph,
        selectedPerson?.id ?? '',
        depth,
        false,
        includePartners,
        includeNonBlood,
      )
    },
    [
      depth,
      graph,
      includeNonBlood,
      includePartners,
      people,
      relationshipFromId,
      relationshipToId,
      selectedPerson,
      showRelationshipGraph,
      viewMode,
    ],
  )

  const visibleGraphEdges = useMemo(
    () => {
      if (showRelationshipGraph) {
        return getVisibleEdges(graph, visibleIds, true, includeNonBlood)
      }

      return getVisibleEdges(
        graph,
        visibleIds,
        includePartners,
        includeNonBlood,
      )
    },
    [
      graph,
      includeNonBlood,
      includePartners,
      showRelationshipGraph,
      visibleIds,
    ],
  )

  const filteredPeople = useMemo(() => {
    const normalized = search.trim().toLowerCase()

    return people.filter((person) => {
      if (!visibleIds.has(person.id)) return false
      if (!normalized) return true

      return (
        displayName(person).toLowerCase().includes(normalized) ||
        fullName(person).toLowerCase().includes(normalized) ||
        person.label.toLowerCase().includes(normalized) ||
        person.branch.toLowerCase().includes(normalized) ||
        person.birthPlace.toLowerCase().includes(normalized) ||
        person.currentResidence.toLowerCase().includes(normalized)
      )
    })
  }, [people, search, visibleIds])

  const sortedPeople = useMemo(() => [...people].sort((a, b) => displayName(a).localeCompare(displayName(b))), [people])

  useEffect(() => {
    const person = peopleById.get(relationshipFromId)
    if (person) setRelationshipFromQuery(displayName(person))
  }, [peopleById, relationshipFromId])

  useEffect(() => {
    const person = peopleById.get(relationshipToId)
    if (person) setRelationshipToQuery(displayName(person))
  }, [peopleById, relationshipToId])

  useEffect(() => {
    const runId = layoutRunRef.current + 1
    layoutRunRef.current = runId

    void (async () => {
      const scopedVisibleIds = visiblePersonIds(
        graphRef.current,
        selectedPersonId ?? '',
        depth,
        viewMode === 'overview' && !showRelationshipGraph,
        includePartners,
        includeNonBlood,
      )

      const nextGraph = await autoLayoutGraph(graphRef.current, scopedVisibleIds, {
        compact: compactLayout,
        layoutMode,
      })

      if (layoutRunRef.current === runId) {
        setGraph(nextGraph)
      }
    })()
  }, [
    compactLayout,
    depth,
    includeNonBlood,
    includePartners,
    layoutMode,
    relationshipFromId,
    relationshipToId,
    selectedPersonId,
    showRelationshipGraph,
    viewMode,
  ])

  function handleSelectPerson(id: string) {
    if (selectedPersonId && selectedPersonId !== id) {
      setRelationshipFromId(selectedPersonId)
      setRelationshipToId(id)
    } else if (!relationshipFromId || relationshipFromId === id) {
      setRelationshipFromId(id)
    } else {
      setRelationshipToId(id)
    }

    setSelectedPersonId(id)
    setSelectedEdgeId(null)
    setRightCollapsed(false)
  }

  function handleAddRelative(type: 'parent' | 'child' | 'partner' | 'sibling') {
    if (!canEdit) return
    if (!selectedPerson) return
    const result = addRelative(graph, selectedPerson, type)
    setGraph(result.graph)
    setSelectedPersonId(result.newPersonId)
    setRightCollapsed(false)
  }

  function handleCanvasPersonQuickAction(
    personId: string,
    action: 'parent' | 'child' | 'partner' | 'sibling' | 'delete',
  ) {
    if (!canEdit) return
    const person = peopleById.get(personId)
    if (!person) return

    if (action === 'delete') {
      if (!window.confirm(`Hard delete ${displayName(person)} and remove all related edges?`)) {
        return
      }
      setGraph((current) => hardDeletePerson(current, personId))
      if (selectedPersonId === personId) {
        setSelectedPersonId(null)
        setSelectedEdgeId(null)
        setRightCollapsed(true)
      }
      return
    }

    const result = addRelative(graph, person, action)
    setGraph(result.graph)
    setSelectedPersonId(result.newPersonId)
    setRightCollapsed(false)
  }

  function handleCreateStandalonePerson(defaultName = 'New Person') {
    if (!canEdit) return
    const result = addStandalonePerson(graph, defaultName)
    setGraph(result.graph)
    setSelectedPersonId(result.newPersonId)
    setRightCollapsed(false)
  }

  function handleAutoOrganize() {
    const runId = layoutRunRef.current + 1
    layoutRunRef.current = runId

    void (async () => {
      const nextGraph = await autoLayoutGraph(graphRef.current, visibleIds, {
        compact: compactLayout,
        layoutMode,
      })
      if (layoutRunRef.current === runId) {
        setGraph(nextGraph)
      }
    })()
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(graph, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'family-graph.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function handleEncryptedExport() {
    const passphrase = window.prompt('Enter a passphrase for the encrypted backup.')
    if (!passphrase) return

    const confirmation = window.prompt('Re-enter the passphrase to confirm.')
    if (confirmation !== passphrase) {
      window.alert('Passphrases did not match. Encrypted backup was not created.')
      return
    }

    try {
      const encryptedBackup = await encryptGraphBackup(graph, passphrase)
      const blob = new Blob([JSON.stringify(encryptedBackup, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'family-graph.encrypted.json'
      anchor.click()
      URL.revokeObjectURL(url)
    } catch {
      window.alert('Unable to create encrypted backup.')
    }
  }

  function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as GraphSchema
        const sanitized = sanitizeGraphForCoreRelationships(parsed)
        validateGraph(sanitized)
        setGraph(sanitized)
        setSelectedPersonId(null)
        setRightCollapsed(true)
      } catch {
        window.alert('That file is not a valid graph export.')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  function handleEncryptedImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        if (!isEncryptedBackupFile(parsed)) {
          throw new Error('not encrypted')
        }

        const passphrase = window.prompt('Enter the passphrase for this encrypted backup.')
        if (!passphrase) return

        const decryptedGraph = await decryptGraphBackup(parsed, passphrase)
        const sanitized = sanitizeGraphForCoreRelationships(decryptedGraph)
        validateGraph(sanitized)
        setGraph(sanitized)
        setSelectedPersonId(null)
        setRightCollapsed(true)
      } catch {
        window.alert('Unable to decrypt that backup. Check the passphrase and file.')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  async function handleReset() {
    const resetGraph = await onResetGraph()
    setGraph(resetGraph)
    setSelectedPersonId(null)
    setRightCollapsed(true)
  }

  const relationshipResult =
    relationshipFromId && relationshipToId
      ? resolveRelationship(graph, relationshipFromId, relationshipToId)
      : null
  const bloodPath =
    relationshipFromId && relationshipToId
      ? shortestBloodPath(graph, relationshipFromId, relationshipToId)
      : []

  const relationshipFrom = peopleById.get(relationshipFromId)
  const relationshipTo = peopleById.get(relationshipToId)
  const viewControlsStyle: CSSProperties | undefined = viewControlsPosition
    ? {
        left: `${viewControlsPosition.x}px`,
        top: `${viewControlsPosition.y}px`,
      }
    : undefined
  const relationshipDialogStyle: CSSProperties | undefined = relationshipDialogPosition
    ? {
        left: `${relationshipDialogPosition.x}px`,
        top: `${relationshipDialogPosition.y}px`,
      }
    : undefined
  const workspaceStyle: CSSProperties = {
    '--right-sidebar-width': `${rightSidebarWidth}px`,
    gridTemplateColumns: leftCollapsed
      ? rightCollapsed
        ? '28px minmax(0, 1fr) 28px'
        : `28px minmax(0, 1fr) ${rightSidebarWidth}px`
      : rightCollapsed
        ? '320px minmax(0, 1fr) 28px'
        : `320px minmax(0, 1fr) ${rightSidebarWidth}px`,
  } as CSSProperties

  return (
    <div className="app">
      <div
        className={`workspace${leftCollapsed ? ' left-collapsed' : ''}${
          rightCollapsed ? ' right-collapsed' : ''
        }`}
        style={workspaceStyle}
      >
        <aside className="left-sidebar">
          <button
            type="button"
            className="sidebar-toggle sidebar-toggle-left"
            onClick={() => setLeftCollapsed((current) => !current)}
            aria-label={leftCollapsed ? 'Expand left sidebar' : 'Collapse left sidebar'}
          >
            {leftCollapsed ? '>' : '<'}
          </button>

          {!leftCollapsed && (
            <>
          <div className="left-sidebar__header">
            <div>
              <p className="mini-label">வம்சம்</p>
              <p className="left-sidebar__romanized">Vaṃsam</p>
              <h1>{String(graph.metadata.treeName ?? 'வம்சம்')}</h1>
              <p className="left-sidebar__account">{userEmail}</p>
            </div>
          </div>

          <div className="left-sidebar__section">
            <label className="search-field">
              <span>Search people</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Maria, Reed, cousin..."
              />
            </label>
          </div>

          <div className="left-sidebar__section">
            <div className="left-sidebar__actions">
              <button type="button" onClick={() => handleCreateStandalonePerson('New Person')} disabled={!canEdit}>
                {graphHasRenderablePeople(graph) ? 'Add person' : 'Add first person'}
              </button>
              <button type="button" onClick={() => handleAddRelative('child')} disabled={!selectedPerson || !canEdit}>
                Add child
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => handleAddRelative('partner')}
                disabled={!selectedPerson || !canEdit}
              >
                Add partner
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => handleAddRelative('parent')}
                disabled={!selectedPerson || !canEdit}
              >
                Add parent
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => handleAddRelative('sibling')}
                disabled={!selectedPerson || !canEdit}
              >
                Add sibling
              </button>
            </div>
          </div>

          <div className="left-sidebar__section">
            <div className="storage-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => fileInputRef.current?.click()}
              >
                Import JSON
              </button>
              <button type="button" className="secondary-button" onClick={handleExport}>
                Export JSON
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void handleEncryptedExport()}
              >
                Export encrypted
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => encryptedFileInputRef.current?.click()}
              >
                Import encrypted
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void handleReset()}
                disabled={!canEdit}
              >
                Reset workspace
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void onSignOut()}
              >
                Sign out
              </button>
              <input
                ref={fileInputRef}
                hidden
                type="file"
                accept="application/json"
                onChange={handleImport}
              />
              <input
                ref={encryptedFileInputRef}
                hidden
                type="file"
                accept="application/json"
                onChange={handleEncryptedImport}
              />
            </div>
          </div>

          <div className="left-sidebar__section">
            <div className="section-title-row">
              <span className="mini-label">Visible list</span>
              <span className="counts-pill">
                {graph.entities.length} people · {graph.edges.length} links
              </span>
            </div>

            <div className="person-list">
              {filteredPeople.map((person, index) => (
                <button
                  key={person.id}
                  type="button"
                  className={
                    person.id === selectedPersonId
                      ? 'person-list-item active'
                      : 'person-list-item'
                  }
                  onClick={() => handleSelectPerson(person.id)}
                >
                  <span className="person-list-index">{index + 1}</span>
                  <span className="person-list-avatar">{person.photo}</span>
                  <span>
                    <strong>{displayName(person)}</strong>
                    <small>{person.years || person.currentResidence || person.birthPlace}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
            </>
          )}
        </aside>

        <section ref={centerStageRef} className="center-stage">
          <TreeCanvas
            graph={graph}
            visibleIds={visibleIds}
            deemphasizedIds={
              viewMode === 'lineage'
                ? new Set(
                    [...visibleIds].filter((id) => !lineageBloodIds.has(id)),
                  )
                : new Set()
            }
            visibleEdges={visibleGraphEdges}
            selectedPersonId={selectedPersonId ?? ''}
            selectedEdgeId={selectedEdgeId}
            layoutMode={layoutMode}
            autoCenter={showRelationshipGraph}
            flyToPersonRequest={flyToPersonRequest}
            onSelectPerson={handleSelectPerson}
            onSelectEdge={setSelectedEdgeId}
            onMovePerson={(id, x, y) =>
              canEdit ? setGraph((current) => updatePersonPosition(current, id, x, y)) : undefined
            }
            onMoveFamily={(memberIds, dx, dy) =>
              canEdit
                ? setGraph((current) =>
                    memberIds.reduce(
                      (nextGraph, memberId) => {
                        const person = graphPeople(nextGraph).find((candidate) => candidate.id === memberId)
                        if (!person) return nextGraph
                        return updatePersonPosition(nextGraph, memberId, person.x + dx, person.y + dy)
                      },
                      current,
                    ),
                  )
                : undefined
            }
            onPersonQuickAction={handleCanvasPersonQuickAction}
          />

          {!graphHasRenderablePeople(graph) && (
            <div className="empty-canvas-state">
              <p className="mini-label">வம்சம்</p>
              <p className="empty-canvas-state__romanized">Vaṃsam</p>
              <h2>Add the first person.</h2>
              <p>Then use quick actions to add parents, children, partners, and siblings through shared parents.</p>
              <button type="button" onClick={() => handleCreateStandalonePerson('First Person')} disabled={!canEdit}>
                Add first person
              </button>
            </div>
          )}

          <button
            type="button"
            className="canvas-quick-add"
            onClick={() =>
              handleCreateStandalonePerson(
                graphHasRenderablePeople(graph) ? 'New Person' : 'First Person',
              )
            }
            disabled={!canEdit}
            aria-label={graphHasRenderablePeople(graph) ? 'Add new person' : 'Add first person'}
          >
            <span className="canvas-quick-add__icon">+</span>
            <span>{graphHasRenderablePeople(graph) ? 'New person' : 'First person'}</span>
          </button>

          <div
            ref={viewControlsRef}
            className={`floating-controls${
              viewControlsCollapsed ? ' floating-controls-collapsed' : ''
            }`}
            role="dialog"
            aria-label="View controls"
            style={viewControlsStyle}
          >
            <div
              className="floating-controls__header overlay-drag-header"
              onMouseDown={(event) => startOverlayDrag('view', event)}
              onClick={() => {
                if (suppressViewToggleClickRef.current) return
                setViewControlsCollapsed((current) => !current)
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setViewControlsCollapsed((current) => !current)
                }
              }}
              aria-label={
                viewControlsCollapsed ? 'Expand view controls' : 'Collapse view controls'
              }
            >
              <span className="mini-label">View</span>
              <div className="floating-controls__header-actions">
                <span className="floating-controls__value">
                  {viewMode === 'overview'
                    ? 'Overview'
                    : viewMode === 'lineage'
                      ? 'Lineage'
                      : `${depth} hops`}
                </span>
                <span className="floating-controls__chevron">
                  {viewControlsCollapsed ? '+' : '-'}
                </span>
              </div>
            </div>

            {!viewControlsCollapsed && (
              <>
                <div className="floating-controls__section">
                  <div className="view-mode-switch" role="tablist" aria-label="View mode">
                    <button
                      type="button"
                      className={viewMode === 'overview' ? 'view-mode-pill active' : 'view-mode-pill'}
                      onClick={() => {
                        setViewMode('overview')
                        setShowRelationshipGraph(false)
                      }}
                    >
                      Overview
                    </button>
                    <button
                      type="button"
                      className={viewMode === 'focus' ? 'view-mode-pill active' : 'view-mode-pill'}
                      onClick={() => {
                        setViewMode('focus')
                        setShowRelationshipGraph(false)
                      }}
                    >
                      Focus
                    </button>
                    <button
                      type="button"
                      className={viewMode === 'lineage' ? 'view-mode-pill active' : 'view-mode-pill'}
                      onClick={() => {
                        setViewMode('lineage')
                        setShowRelationshipGraph(false)
                      }}
                      disabled={!selectedPerson}
                    >
                      Lineage
                    </button>
                  </div>
                  <label className="depth-slider">
                    <input
                      type="range"
                      min={0}
                      max={depthOptions.length - 1}
                      step={1}
                      value={depthIndex}
                      onChange={(event) => {
                        const option = depthOptions[Number(event.target.value)] ?? 2
                        setDepth(option)
                        if (option === 99) {
                          setViewMode('overview')
                          setShowRelationshipGraph(false)
                        } else {
                          setViewMode('focus')
                          setShowRelationshipGraph(false)
                        }
                      }}
                    />
                    <div className="depth-slider__ticks" aria-hidden="true">
                      <span>1</span>
                      <span>2</span>
                      <span>3</span>
                      <span>All</span>
                    </div>
                  </label>
                </div>

                <div className="floating-controls__section floating-controls__toggles">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleAutoOrganize}
                  >
                    Auto organize
                  </button>
                  <label>
                    <input
                      type="checkbox"
                      checked={compactLayout}
                      onChange={(event) => setCompactLayout(event.target.checked)}
                    />
                    Compact layout
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={layoutMode === 'family'}
                      onChange={(event) =>
                        setLayoutMode(event.target.checked ? 'family' : 'person')
                      }
                    />
                    Family units
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={includePartners}
                      onChange={(event) => setIncludePartners(event.target.checked)}
                    />
                    Partners
                  </label>
                </div>

                <div className="floating-controls__section">
                  <span className="mini-label">Legend</span>
                  <div className="edge-legend">
                    <div className="edge-legend__item">
                      <span className="edge-legend__swatch edge-legend__swatch-parent" />
                      <span>Parent</span>
                    </div>
                    <div className="edge-legend__item">
                      <span className="edge-legend__swatch edge-legend__swatch-partner" />
                      <span>Partner</span>
                    </div>
                    <div className="edge-legend__item">
                      <span className="edge-legend__swatch edge-legend__swatch-guardian" />
                      <span>Guardian / Step</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div
            ref={relationshipDialogRef}
            className={`relationship-dialog${
              relationshipDialogCollapsed ? ' relationship-dialog-collapsed' : ''
            }`}
            role="dialog"
            aria-label="Relationship finder"
            style={relationshipDialogStyle}
          >
            <div
              className="relationship-dialog__header overlay-drag-header"
              onMouseDown={(event) => startOverlayDrag('relationship', event)}
              onClick={() => {
                if (suppressRelationshipToggleClickRef.current) return
                setRelationshipDialogCollapsed((current) => !current)
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setRelationshipDialogCollapsed((current) => !current)
                }
              }}
            >
              <span className="mini-label">Relationship</span>
              <div className="floating-controls__header-actions">
                <span className="floating-controls__value">
                  {relationshipFrom && relationshipTo
                    ? `${displayName(relationshipFrom)} -> ${displayName(relationshipTo)}`
                    : 'Finder'}
                </span>
                <span className="floating-controls__chevron">
                  {relationshipDialogCollapsed ? '+' : '-'}
                </span>
              </div>
            </div>
            {!relationshipDialogCollapsed && (
              <>
            <div className="relationship-dialog__controls">
              <PersonTokenSelector
                label="Person"
                people={sortedPeople}
                query={relationshipFromQuery}
                selectedPersonId={relationshipFromId}
                selection={relationshipFromId ? { type: 'existing', id: relationshipFromId } : null}
                compact
                showSecondaryText={false}
                onQueryChange={setRelationshipFromQuery}
                onSelectionChange={(selection) => {
                  if (selection?.type === 'existing') {
                    setRelationshipFromId(selection.id)
                    return
                  }
                  setRelationshipFromId('')
                }}
              />
              <PersonTokenSelector
                label="Of"
                people={sortedPeople}
                query={relationshipToQuery}
                selectedPersonId={relationshipToId}
                selection={relationshipToId ? { type: 'existing', id: relationshipToId } : null}
                compact
                showSecondaryText={false}
                onQueryChange={setRelationshipToQuery}
                onSelectionChange={(selection) => {
                  if (selection?.type === 'existing') {
                    setRelationshipToId(selection.id)
                    return
                  }
                  setRelationshipToId('')
                }}
              />
              <div className="relationship-dialog__reverse">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setRelationshipFromId(relationshipToId)
                    setRelationshipToId(relationshipFromId)
                    setRelationshipFromQuery(relationshipToQuery)
                    setRelationshipToQuery(relationshipFromQuery)
                  }}
                  disabled={!relationshipFromId && !relationshipToId}
                >
                  Reverse
                </button>
              </div>
            </div>
            <div className="relationship-dialog__answer">
              {relationshipFrom && relationshipTo && relationshipResult ? (
                <>
                  <strong>
                    {relationshipResult.labels || relationshipResult.label
                      ? `${displayName(relationshipFrom)} is ${
                          relationshipResult.labels
                            ? relationshipResult.labels.en
                            : relationshipResult.label
                        } of ${displayName(relationshipTo)}.`
                      : `${displayName(relationshipFrom)} is connected to ${displayName(
                          relationshipTo,
                        )}.`}
                  </strong>
                  {relationshipResult.labels ? (
                    <p>
                      {relationshipResult.labels.en} / {relationshipResult.labels.taLatin} /{' '}
                      {relationshipResult.labels.hiLatin}
                    </p>
                  ) : relationshipResult.label ? (
                    <p>{relationshipResult.label}</p>
                  ) : (
                    <p>Connected in the current graph.</p>
                  )}
                  {relationshipResult.socialLabel && (
                    <p>Social: {relationshipResult.socialLabel}</p>
                  )}
                  {relationshipResult.labels && (
                    <p>
                      Tamil: {relationshipResult.labels.ta} · Hindi: {relationshipResult.labels.hi}
                    </p>
                  )}
                  {bloodPath.length > 1 ? (
                    <p>Connected by blood by {bloodPath.length - 1} hops.</p>
                  ) : (
                    <p>Not connected by blood in the current graph.</p>
                  )}
                  {!relationshipResult.label && relationshipResult.path.length > 0 && (
                    <p>Path length: {relationshipResult.path.length - 1} hops</p>
                  )}
                  <div className="relationship-dialog__actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setShowRelationshipGraph((current) => !current)}
                    >
                      {showRelationshipGraph ? 'Hide family' : 'Show family'}
                    </button>
                  </div>
                </>
              ) : (
                <strong>Select two people.</strong>
              )}
            </div>
              </>
            )}
          </div>
        </section>

        <div className="right-sidebar">
          {!rightCollapsed && (
            <div
              className="sidebar-resize-handle"
              onMouseDown={() => setIsResizingRightSidebar(true)}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize right sidebar"
            />
          )}
          <button
            type="button"
            className="sidebar-toggle sidebar-toggle-right"
            onClick={() => setRightCollapsed((current) => !current)}
            aria-label={rightCollapsed ? 'Expand right sidebar' : 'Collapse right sidebar'}
          >
            {rightCollapsed ? '<' : '>'}
          </button>

          {!rightCollapsed && selectedPerson && (
            <Inspector
              graph={graph}
              selectedPerson={selectedPerson}
              selectedPersonId={selectedPersonId ?? ''}
              visibleIds={visibleIds}
              allPeople={people}
              onFlyToNode={() => {
                if (!selectedPersonId) return
                setFlyToPersonRequest((current) => ({
                  nonce: (current?.nonce ?? 0) + 1,
                  personId: selectedPersonId,
                }))
              }}
              onCreateStandalonePerson={handleCreateStandalonePerson}
              onQuickAddRelative={(type) => handleAddRelative(type)}
              onUpdateAttr={(key, value) =>
                canEdit
                  ? setGraph((current) =>
                      updatePersonAttr(current, selectedPersonId ?? '', key, value),
                    )
                  : undefined
              }
              onUpdateConnection={(edgeId, predicate) =>
                canEdit
                  ? setGraph((current) =>
                      updateEdge(current, edgeId, {
                        predicate: predicate as GraphSchema['edges'][number]['predicate'],
                      }),
                    )
                  : undefined
              }
              onReverseConnection={(edgeId) =>
                canEdit ? setGraph((current) => reverseEdge(current, edgeId)) : undefined
              }
              onDeleteConnection={(edgeId) =>
                canEdit ? setGraph((current) => deleteEdge(current, edgeId)) : undefined
              }
              onAddConnectedPerson={(predicate, preferredName) => {
                if (!canEdit) return
                const result =
                  predicate === 'sibling'
                    ? addSiblingPerson(graph, selectedPerson, preferredName)
                    : predicate === 'child'
                      ? addParentPerson(graph, selectedPerson, preferredName)
                    : addConnectedPerson(graph, selectedPerson, predicate, preferredName)
                setGraph(result.graph)
                setSelectedPersonId(result.newPersonId)
              }}
              onConnectExistingPerson={(targetId, predicate) =>
                canEdit
                  ? setGraph((current) =>
                      predicate === 'sibling'
                        ? connectPeopleAsSiblings(current, selectedPerson.id, targetId)
                        : predicate === 'child'
                          ? addConnection(
                              current,
                              targetId,
                              selectedPerson.id,
                              EdgePredicate.PARENT_OF,
                            )
                          : addConnection(
                              current,
                              selectedPerson.id,
                              targetId,
                              predicate as EdgePredicate,
                            ),
                    )
                  : undefined
              }
              onSoftDeletePerson={() => {
                if (!canEdit) return
                if (!selectedPersonId) return
                if (!window.confirm('Soft delete this person and remove their personal information?')) {
                  return
                }
                setGraph((current) => softDeletePerson(current, selectedPersonId))
              }}
              onHardDeletePerson={() => {
                if (!canEdit) return
                if (!selectedPersonId) return
                if (!window.confirm('Hard delete this node and remove all related edges?')) {
                  return
                }
                setGraph((current) => hardDeletePerson(current, selectedPersonId))
                setSelectedPersonId(null)
                setSelectedEdgeId(null)
                setRightCollapsed(true)
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

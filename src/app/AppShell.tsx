import type { CSSProperties, ChangeEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { sampleGraph } from '../data/sampleGraph'
import { clearGraph, loadGraph, saveGraph } from '../data/storage'
import { EdgePredicate, type GraphSchema, validateGraph } from '../domain/graph'
import {
  addConnectedPerson,
  addConnection,
  addRelative,
  addStandalonePerson,
  autoLayoutGraph,
  deleteEdge,
  graphHasRenderablePeople,
  graphPeople,
  hardDeletePerson,
  personMap,
  reverseEdge,
  resolveRelationship,
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
import { TreeCanvas } from '../features/canvas/TreeCanvas'
import { Inspector } from '../features/inspector/Inspector'

const depthOptions = [1, 2, 3, 99] as const

function shouldReplacePersistedGraph(persisted: GraphSchema): boolean {
  return String(persisted.metadata.source ?? '') !== 'blank-slate-v2'
}

export function AppShell() {
  const centerStageRef = useRef<HTMLElement | null>(null)
  const viewControlsRef = useRef<HTMLDivElement | null>(null)
  const relationshipDialogRef = useRef<HTMLDivElement | null>(null)
  const [graph, setGraph] = useState<GraphSchema>(sampleGraph)
  const [isHydrated, setIsHydrated] = useState(false)
  const [leftCollapsed, setLeftCollapsed] = useState(true)
  const [rightCollapsed, setRightCollapsed] = useState(true)
  const [rightSidebarWidth, setRightSidebarWidth] = useState(440)
  const [isResizingRightSidebar, setIsResizingRightSidebar] = useState(false)
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [depth, setDepth] = useState<(typeof depthOptions)[number]>(99)
  const [viewMode, setViewMode] = useState<'overview' | 'focus'>('overview')
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
          x: Math.max(12, stage.clientWidth - relationshipElement.offsetWidth - 18),
          y: Math.max(18, stage.clientHeight - relationshipElement.offsetHeight - 18),
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
    let ignore = false

    async function hydrate() {
      const persisted = await loadGraph()
      if (ignore) return

      if (persisted) {
        try {
          validateGraph(persisted)
          if (shouldReplacePersistedGraph(persisted)) {
            setGraph(sampleGraph)
            await saveGraph(sampleGraph)
          } else {
            setGraph(sanitizeGraphForCoreRelationships(persisted))
          }
        } catch {
          setGraph(sampleGraph)
          await saveGraph(sampleGraph)
        }
      } else {
        setGraph(sampleGraph)
        await saveGraph(sampleGraph)
      }

      setIsHydrated(true)
    }

    hydrate()
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    if (!isHydrated) return
    void saveGraph(graph)
  }, [graph, isHydrated])

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

  const visibleIds = useMemo(
    () => {
      if (showRelationshipGraph && relationshipFromId && relationshipToId) {
        return new Set(shortestPersonPath(graph, relationshipFromId, relationshipToId))
      }

      if (viewMode === 'overview') {
        return new Set(people.map((person) => person.id))
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
        person.label.toLowerCase().includes(normalized) ||
        person.branch.toLowerCase().includes(normalized) ||
        person.birthPlace.toLowerCase().includes(normalized) ||
        person.currentResidence.toLowerCase().includes(normalized)
      )
    })
  }, [people, search, visibleIds])

  const sortedPeople = useMemo(
    () => [...people].sort((a, b) => a.preferredName.localeCompare(b.preferredName)),
    [people],
  )

  useEffect(() => {
    if (sortedPeople.length === 0) return
    setRelationshipFromId((current) => current || sortedPeople[0]?.id || '')
    setRelationshipToId((current) => current || sortedPeople[1]?.id || sortedPeople[0]?.id || '')
  }, [sortedPeople])

  useEffect(() => {
    const person = peopleById.get(relationshipFromId)
    if (person) setRelationshipFromQuery(person.preferredName)
  }, [peopleById, relationshipFromId])

  useEffect(() => {
    const person = peopleById.get(relationshipToId)
    if (person) setRelationshipToQuery(person.preferredName)
  }, [peopleById, relationshipToId])

  useEffect(() => {
    if (!isHydrated) return

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
    isHydrated,
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
    if (!selectedPerson) return
    const result = addRelative(graph, selectedPerson, type)
    setGraph(result.graph)
    setSelectedPersonId(result.newPersonId)
    setRightCollapsed(false)
  }

  function handleCreateStandalonePerson(defaultName = 'New Person') {
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

  async function handleReset() {
    await clearGraph()
    setGraph(sampleGraph)
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
  const filteredFromPeople = sortedPeople.filter((person) =>
    person.preferredName.toLowerCase().includes(relationshipFromQuery.trim().toLowerCase()),
  )
  const filteredToPeople = sortedPeople.filter((person) =>
    person.preferredName.toLowerCase().includes(relationshipToQuery.trim().toLowerCase()),
  )
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
              <button type="button" onClick={() => handleCreateStandalonePerson('New Person')}>
                {graphHasRenderablePeople(graph) ? 'Add person' : 'Add first person'}
              </button>
              <button type="button" onClick={() => handleAddRelative('child')} disabled={!selectedPerson}>
                Add child
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => handleAddRelative('partner')}
                disabled={!selectedPerson}
              >
                Add partner
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => handleAddRelative('parent')}
                disabled={!selectedPerson}
              >
                Add parent
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => handleAddRelative('sibling')}
                disabled={!selectedPerson}
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
                onClick={() => void handleReset()}
              >
                Reset workspace
              </button>
              <input
                ref={fileInputRef}
                hidden
                type="file"
                accept="application/json"
                onChange={handleImport}
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
                    <strong>{person.preferredName}</strong>
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
            visibleEdges={visibleGraphEdges}
            selectedPersonId={selectedPersonId ?? ''}
            selectedEdgeId={selectedEdgeId}
            layoutMode={layoutMode}
            autoCenter={showRelationshipGraph}
            onSelectPerson={handleSelectPerson}
            onSelectEdge={setSelectedEdgeId}
            onMovePerson={(id, x, y) =>
              setGraph((current) => updatePersonPosition(current, id, x, y))
            }
            onMoveFamily={(memberIds, dx, dy) =>
              setGraph((current) =>
                memberIds.reduce(
                  (nextGraph, memberId) => {
                    const person = graphPeople(nextGraph).find((candidate) => candidate.id === memberId)
                    if (!person) return nextGraph
                    return updatePersonPosition(nextGraph, memberId, person.x + dx, person.y + dy)
                  },
                  current,
                ),
              )
            }
          />

          {!graphHasRenderablePeople(graph) && (
            <div className="empty-canvas-state">
              <p className="mini-label">வம்சம்</p>
              <p className="empty-canvas-state__romanized">Vaṃsam</p>
              <h2>Add the first person.</h2>
              <p>Then use quick actions to add parents, children, partners, and siblings through shared parents.</p>
              <button type="button" onClick={() => handleCreateStandalonePerson('First Person')}>
                Add first person
              </button>
            </div>
          )}

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
                    ? `${relationshipFrom.preferredName} -> ${relationshipTo.preferredName}`
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
              <label>
                <span>Who is</span>
                <input
                  value={relationshipFromQuery}
                  onChange={(event) => setRelationshipFromQuery(event.target.value)}
                  placeholder="Type a name"
                />
                <div className="relationship-dialog__results">
                  {filteredFromPeople.slice(0, 6).map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      className="relationship-dialog__result"
                      onClick={() => {
                        setRelationshipFromId(person.id)
                        setRelationshipFromQuery(person.preferredName)
                      }}
                    >
                      {person.preferredName}
                    </button>
                  ))}
                </div>
              </label>
              <label>
                <span>to</span>
                <input
                  value={relationshipToQuery}
                  onChange={(event) => setRelationshipToQuery(event.target.value)}
                  placeholder="Type a name"
                />
                <div className="relationship-dialog__results">
                  {filteredToPeople.slice(0, 6).map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      className="relationship-dialog__result"
                      onClick={() => {
                        setRelationshipToId(person.id)
                        setRelationshipToQuery(person.preferredName)
                      }}
                    >
                      {person.preferredName}
                    </button>
                  ))}
                </div>
              </label>
            </div>
            <div className="relationship-dialog__answer">
              {relationshipFrom && relationshipTo && relationshipResult ? (
                <>
                  <strong>
                    {relationshipFrom.preferredName} is{' '}
                    {relationshipResult.label || 'connected to'} {relationshipTo.preferredName}.
                  </strong>
                  {relationshipResult.tamilLabel && (
                    <p>Tamil: {relationshipResult.tamilLabel}</p>
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
                      {showRelationshipGraph ? 'Hide BFS subgraph' : 'Show BFS subgraph'}
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
              onCreateStandalonePerson={handleCreateStandalonePerson}
              onQuickAddRelative={(type) => handleAddRelative(type)}
              onUpdateAttr={(key, value) =>
                setGraph((current) =>
                  updatePersonAttr(current, selectedPersonId ?? '', key, value),
                )
              }
              onUpdateConnection={(edgeId, predicate) =>
                setGraph((current) =>
                  updateEdge(current, edgeId, {
                    predicate: predicate as GraphSchema['edges'][number]['predicate'],
                  }),
                )
              }
              onReverseConnection={(edgeId) =>
                setGraph((current) => reverseEdge(current, edgeId))
              }
              onDeleteConnection={(edgeId) =>
                setGraph((current) => deleteEdge(current, edgeId))
              }
              onAddConnectedPerson={(predicate, preferredName) => {
                const result = addConnectedPerson(graph, selectedPerson, predicate, preferredName)
                setGraph(result.graph)
                setSelectedPersonId(result.newPersonId)
              }}
              onConnectExistingPerson={(targetId, predicate) =>
                setGraph((current) =>
                  addConnection(
                    current,
                    selectedPerson.id,
                    targetId,
                    predicate as EdgePredicate,
                  ),
                )
              }
              onSoftDeletePerson={() => {
                if (!selectedPersonId) return
                if (!window.confirm('Soft delete this person and remove their personal information?')) {
                  return
                }
                setGraph((current) => softDeletePerson(current, selectedPersonId))
              }}
              onHardDeletePerson={() => {
                if (!selectedPersonId) return
                if (!window.confirm('Hard delete this node by unlinking all related edges?')) {
                  return
                }
                setGraph((current) => hardDeletePerson(current, selectedPersonId))
                setSelectedEdgeId(null)
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

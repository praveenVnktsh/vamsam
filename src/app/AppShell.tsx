import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  encryptGraphBackup,
} from '../data/backupCrypto'
import { EdgePredicate, type GraphSchema } from '../domain/graph'
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
  estimateSharedDnaPercent,
  expandNeighborhood,
  fullName,
  graphHasRenderablePeople,
  graphPeople,
  hardDeletePerson,
  personMap,
  reverseEdge,
  resolveRelationship,
  addSiblingPerson,
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
  onSignOut,
}: AppShellProps) {
  type SaveState = 'saved' | 'dirty' | 'saving' | 'error'
  const centerStageRef = useRef<HTMLElement | null>(null)
  const [graph, setGraph] = useState<GraphSchema>(initialGraph)
  const [leftCollapsed, setLeftCollapsed] = useState(true)
  const [rightCollapsed, setRightCollapsed] = useState(true)
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
  const [layoutAlgorithm, setLayoutAlgorithm] = useState<'hierarchy' | 'organic'>('hierarchy')
  const [viewControlsCollapsed, setViewControlsCollapsed] = useState(true)
  const [relationshipDialogCollapsed, setRelationshipDialogCollapsed] = useState(true)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [relationshipFromId, setRelationshipFromId] = useState<string>('')
  const [relationshipToId, setRelationshipToId] = useState<string>('')
  const [relationshipFromQuery, setRelationshipFromQuery] = useState('')
  const [relationshipToQuery, setRelationshipToQuery] = useState('')
  const graphRef = useRef(graph)
  const layoutRunRef = useRef(0)
  const saveRunRef = useRef(0)
  const hasInitializedSaveRef = useRef(false)
  const depthIndex = depthOptions.indexOf(depth)

  function expandViewPanel() {
    setViewControlsCollapsed(false)
    setRelationshipDialogCollapsed(true)
    setInspectorCollapsed(true)
  }

  function expandRelationshipPanel() {
    setViewControlsCollapsed(true)
    setRelationshipDialogCollapsed(false)
    setInspectorCollapsed(true)
  }

  function expandInspectorPanel() {
    setViewControlsCollapsed(true)
    setRelationshipDialogCollapsed(true)
    setInspectorCollapsed(false)
  }

  function clearRelationshipSelection() {
    setRelationshipFromId('')
    setRelationshipToId('')
    setRelationshipFromQuery('')
    setRelationshipToQuery('')
    setShowRelationshipGraph(false)
  }

  useEffect(() => {
    graphRef.current = graph
  }, [graph])

  useEffect(() => {
    setGraph(initialGraph)
    setSaveState('saved')
  }, [initialGraph])

  useEffect(() => {
    if (!hasInitializedSaveRef.current) {
      hasInitializedSaveRef.current = true
      return
    }

    setSaveState('dirty')
    const timeoutId = window.setTimeout(() => {
      const runId = saveRunRef.current + 1
      saveRunRef.current = runId
      setSaveState('saving')

      void onPersistGraph(graph)
        .then(() => {
          if (saveRunRef.current === runId) {
            setSaveState('saved')
          }
        })
        .catch(() => {
          if (saveRunRef.current === runId) {
            setSaveState('error')
          }
        })
    }, 400)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [graph, onPersistGraph])

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
  const relationshipFocusIds = useMemo(
    () =>
      showRelationshipGraph && relationshipFromId && relationshipToId
        ? expandNeighborhood(
            graph,
            shortestPersonPath(graph, relationshipFromId, relationshipToId),
            2,
            true,
            includeNonBlood,
          )
        : new Set<string>(),
    [graph, includeNonBlood, relationshipFromId, relationshipToId, showRelationshipGraph],
  )

  const visibleIds = useMemo(
    () => {
      if (showRelationshipGraph && relationshipFromId && relationshipToId) {
        return new Set(people.map((person) => person.id))
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

  const relationshipPathIds = useMemo(
    () =>
      showRelationshipGraph && relationshipFromId && relationshipToId
        ? shortestPersonPath(graph, relationshipFromId, relationshipToId)
        : [],
    [graph, relationshipFromId, relationshipToId, showRelationshipGraph],
  )

  const relationshipPathEdgeIds = useMemo(() => {
    if (relationshipPathIds.length < 2) return new Set<string>()

    const edgeIds = new Set<string>()

    for (let index = 0; index < relationshipPathIds.length - 1; index += 1) {
      const sourceId = relationshipPathIds[index]
      const targetId = relationshipPathIds[index + 1]
      const matchingEdges = graph.edges.filter(
        (edge) =>
          (edge.src === sourceId && edge.dst === targetId) ||
          (edge.src === targetId && edge.dst === sourceId),
      )
      for (const edge of matchingEdges) {
        edgeIds.add(edge.id)
      }
    }

    return edgeIds
  }, [graph.edges, relationshipPathIds])

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

  const sortedPeople = useMemo(
    () => [...people].sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [people],
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
  const finderPeople = useMemo(() => {
    const normalized = search.trim().toLowerCase()

    return sortedPeople.filter((person) => {
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
  }, [search, sortedPeople])

  useEffect(() => {
    const person = peopleById.get(relationshipFromId)
    if (person) setRelationshipFromQuery(displayName(person))
  }, [peopleById, relationshipFromId])

  useEffect(() => {
    const person = peopleById.get(relationshipToId)
    if (person) setRelationshipToQuery(displayName(person))
  }, [peopleById, relationshipToId])

  useEffect(() => {
    if (relationshipFromId && relationshipToId) {
      setShowRelationshipGraph(true)
      return
    }

    setShowRelationshipGraph(false)
  }, [relationshipFromId, relationshipToId])

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
        layoutAlgorithm,
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
    layoutAlgorithm,
    relationshipFromId,
    relationshipToId,
    selectedPersonId,
    showRelationshipGraph,
    viewMode,
  ])

  function handleSelectPerson(id: string, options?: { fly?: boolean }) {
    if (!relationshipDialogCollapsed) {
      if (relationshipFromId && relationshipToId) {
        setRelationshipFromId(id)
        setRelationshipToId('')
        setRelationshipFromQuery(
          displayName(peopleById.get(id) ?? { nickname: '', firstName: '', label: '' }),
        )
        setRelationshipToQuery('')
      } else if (selectedPersonId && selectedPersonId !== id) {
        setRelationshipFromId(selectedPersonId)
        setRelationshipToId(id)
      } else if (!relationshipFromId || relationshipFromId === id) {
        setRelationshipFromId(id)
      } else {
        setRelationshipToId(id)
      }
    }

    setSelectedPersonId(id)
    setSelectedEdgeId(null)
    expandInspectorPanel()
    setRightCollapsed(false)
    if (options?.fly) {
      setFlyToPersonRequest((current) => ({
        nonce: (current?.nonce ?? 0) + 1,
        personId: id,
      }))
    }
  }

  function handleAddRelative(type: 'parent' | 'child' | 'partner' | 'sibling') {
    if (!canEdit) return
    if (!selectedPerson) return
    const result = addRelative(graph, selectedPerson, type)
    setGraph(result.graph)
    setSelectedPersonId(result.newPersonId)
    expandInspectorPanel()
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
        layoutAlgorithm,
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
  const sharedDnaPercent =
    relationshipFromId && relationshipToId
      ? estimateSharedDnaPercent(graph, relationshipFromId, relationshipToId)
      : null
  const workspaceStyle: CSSProperties = {
    '--left-sidebar-width': '320px',
    gridTemplateColumns: leftCollapsed ? '28px minmax(0, 1fr)' : '320px minmax(0, 1fr)',
  } as CSSProperties
  const saveStateLabel =
    saveState === 'saving'
      ? 'Saving'
      : saveState === 'saved'
        ? 'Saved'
        : saveState === 'error'
          ? 'Save failed'
          : 'Unsaved'

  return (
    <div className="app">
      <div
        className={`workspace${leftCollapsed ? ' left-collapsed' : ''}`}
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

          <div
            className={`save-indicator save-indicator-${saveState}${
              leftCollapsed ? ' save-indicator-collapsed' : ''
            }`}
            aria-live="polite"
          >
            <span className="save-indicator__dot" />
            <span className="save-indicator__label">{saveStateLabel}</span>
          </div>

          {!leftCollapsed && (
            <>
          <div className="left-sidebar__header">
            <div className="left-sidebar__brand">
              <p className="left-sidebar__romanized">Vaṃsam</p>
              <h1>{String(graph.metadata.treeName ?? 'வம்சம்')}</h1>
              <div className={`save-indicator save-indicator-${saveState}`} aria-live="polite">
                <span className="save-indicator__dot" />
                <span className="save-indicator__label">{saveStateLabel}</span>
              </div>
              <p className="left-sidebar__account">{userEmail}</p>
            </div>
          </div>

          <div className="left-sidebar__section">
            <div className="storage-actions">
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
                onClick={() => void onSignOut()}
              >
                Sign out
              </button>
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
              showRelationshipGraph
                ? new Set(
                    [...visibleIds].filter((id) => !relationshipFocusIds.has(id)),
                  )
                : viewMode === 'lineage'
                ? new Set(
                    [...visibleIds].filter((id) => !lineageBloodIds.has(id)),
                  )
                : new Set()
            }
            visibleEdges={visibleGraphEdges}
            highlightedEdgeIds={showRelationshipGraph ? relationshipPathEdgeIds : new Set()}
            selectedPersonId={selectedPersonId ?? ''}
            selectedEdgeId={selectedEdgeId}
            layoutMode={layoutMode}
            autoCenter={false}
            flyToPersonRequest={flyToPersonRequest}
            onSelectPerson={(id) => handleSelectPerson(id)}
            onSelectEdge={(id) => {
              setSelectedEdgeId(id)
              if (id || showRelationshipGraph || relationshipFromId || relationshipToId) {
                clearRelationshipSelection()
              }
            }}
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

          <div className="canvas-left-stack">
            <div className="finder-panel" role="dialog" aria-label="Find people">
              <div className="finder-panel__header">
                <span className="mini-label">Find</span>
              </div>
              <label className="search-field finder-panel__search">
                <div className="finder-panel__search-input">
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search people..."
                  />
                  {search && (
                    <button
                      type="button"
                      className="finder-panel__clear"
                      aria-label="Clear search"
                      onClick={() => setSearch('')}
                    >
                      ×
                    </button>
                  )}
                </div>
              </label>
              {search.trim() && (
                <div className="finder-panel__results">
                  {finderPeople.slice(0, 8).map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      className={
                        person.id === selectedPersonId
                          ? 'finder-panel__result active'
                          : 'finder-panel__result'
                      }
                      onClick={() => handleSelectPerson(person.id, { fly: true })}
                    >
                      <strong>{displayName(person)}</strong>
                      <small>{fullName(person)}</small>
                    </button>
                  ))}
                  {finderPeople.length === 0 && (
                    <p className="finder-panel__empty">No matching people.</p>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              className="canvas-quick-add"
              onClick={() =>
                handleCreateStandalonePerson(
                  graphHasRenderablePeople(graph) ? 'New Person' : 'First Person',
                )
              }
              disabled={!canEdit}
              aria-label={
                graphHasRenderablePeople(graph) ? 'Add new person' : 'Add first person'
              }
            >
              <span className="canvas-quick-add__icon">+</span>
              <span>{graphHasRenderablePeople(graph) ? 'New person' : 'First person'}</span>
            </button>
          </div>

          <div className="canvas-right-stack">
          <div
            className={`floating-controls${
              viewControlsCollapsed ? ' floating-controls-collapsed' : ''
            }`}
            role="dialog"
            aria-label="View controls"
          >
            <div
              className="floating-controls__header"
              onClick={() => {
                if (viewControlsCollapsed) {
                  expandViewPanel()
                } else {
                  setViewControlsCollapsed(true)
                }
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  if (viewControlsCollapsed) {
                    expandViewPanel()
                  } else {
                    setViewControlsCollapsed(true)
                  }
                }
              }}
              aria-label={
                viewControlsCollapsed ? 'Expand view controls' : 'Collapse view controls'
              }
            >
              <span className="mini-label">View</span>
              <div className="floating-controls__header-actions">
                <span className="floating-controls__value">
                  {layoutAlgorithm === 'organic'
                    ? 'Organic'
                    : viewMode === 'overview'
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
                      checked={layoutAlgorithm === 'organic'}
                      onChange={(event) =>
                        setLayoutAlgorithm(event.target.checked ? 'organic' : 'hierarchy')
                      }
                    />
                    Organic layout
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
            className={`relationship-dialog${
              relationshipDialogCollapsed ? ' relationship-dialog-collapsed' : ''
            }`}
            role="dialog"
            aria-label="Relationship finder"
          >
            <div
              className="relationship-dialog__header"
              onClick={() => {
                if (relationshipDialogCollapsed) {
                  expandRelationshipPanel()
                } else {
                  setRelationshipDialogCollapsed(true)
                }
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  if (relationshipDialogCollapsed) {
                    expandRelationshipPanel()
                  } else {
                    setRelationshipDialogCollapsed(true)
                  }
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
                  {sharedDnaPercent !== null && bloodPath.length > 0 && (
                    <p>
                      Approx. shared DNA:{' '}
                      {sharedDnaPercent >= 1
                        ? `${sharedDnaPercent.toFixed(sharedDnaPercent >= 10 ? 0 : 1)}%`
                        : `${sharedDnaPercent.toFixed(2)}%`}
                    </p>
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

          {!rightCollapsed && selectedPerson && (
            <div
              className={
                inspectorCollapsed
                  ? 'inspector-floating inspector-floating-collapsed'
                  : 'inspector-floating'
              }
              role="dialog"
              aria-label="Inspector"
            >
              <Inspector
                graph={graph}
                selectedPerson={selectedPerson}
                selectedPersonId={selectedPersonId ?? ''}
                visibleIds={visibleIds}
                allPeople={people}
                collapsed={inspectorCollapsed}
                onFlyToNode={() => {
                  setFlyToPersonRequest((current) => ({
                    nonce: (current?.nonce ?? 0) + 1,
                    personId: selectedPerson.id,
                  }))
                }}
                onClose={() => setRightCollapsed(true)}
                onToggleCollapse={() => {
                  if (inspectorCollapsed) {
                    expandInspectorPanel()
                  } else {
                    setInspectorCollapsed(true)
                  }
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
            </div>
          )}
          </div>
        </section>
      </div>
    </div>
  )
}

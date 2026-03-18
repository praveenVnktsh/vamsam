import type { ChangeEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { sampleGraph } from '../data/sampleGraph'
import { clearGraph, loadGraph, saveGraph } from '../data/storage'
import { EdgePredicate, type GraphSchema, validateGraph } from '../domain/graph'
import {
  addConnectedPerson,
  addConnection,
  addRelative,
  autoLayoutGraph,
  deleteEdge,
  graphHasRenderablePeople,
  graphPeople,
  personMap,
  reverseEdge,
  resolveRelationship,
  shortestBloodPath,
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
  const treeName = String(persisted.metadata.treeName ?? '')
  const source = String(persisted.metadata.source ?? '')
  const entityIds = new Set(persisted.entities.map((entity) => entity.id))

  return (
    source !== 'user spreadsheet' ||
    treeName === 'Alvarez-Reed Family' ||
    !entityIds.has('person:vakulambal') ||
    !entityIds.has('person:erumbi_santhanam_iyengar') ||
    !entityIds.has('person:shyam_iyengar')
  )
}

export function AppShell() {
  const [graph, setGraph] = useState<GraphSchema>(sampleGraph)
  const [isHydrated, setIsHydrated] = useState(false)
  const [leftCollapsed, setLeftCollapsed] = useState(true)
  const [rightCollapsed, setRightCollapsed] = useState(true)
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [depth, setDepth] = useState<(typeof depthOptions)[number]>(99)
  const [viewMode, setViewMode] = useState<'overview' | 'focus' | 'relationship'>('overview')
  const [includePartners, setIncludePartners] = useState(true)
  const [includeNonBlood, setIncludeNonBlood] = useState(true)
  const [includeSiblings, setIncludeSiblings] = useState(false)
  const [compactLayout, setCompactLayout] = useState(true)
  const [layoutMode, setLayoutMode] = useState<'person' | 'family'>('family')
  const [viewControlsCollapsed, setViewControlsCollapsed] = useState(false)
  const [relationshipFromId, setRelationshipFromId] = useState<string>('')
  const [relationshipToId, setRelationshipToId] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const graphRef = useRef(graph)
  const layoutRunRef = useRef(0)
  const depthIndex = depthOptions.indexOf(depth)

  useEffect(() => {
    graphRef.current = graph
  }, [graph])

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
            setGraph(persisted)
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

  const people = useMemo(() => graphPeople(graph), [graph])
  const peopleById = useMemo(() => personMap(people), [people])
  const selectedPerson = selectedPersonId ? peopleById.get(selectedPersonId) ?? null : null

  const visibleIds = useMemo(
    () => {
      if (viewMode === 'overview') {
        return new Set(people.map((person) => person.id))
      }

      if (viewMode === 'relationship' && relationshipFromId && relationshipToId) {
        return new Set(shortestPersonPath(graph, relationshipFromId, relationshipToId))
      }

      return visiblePersonIds(
        graph,
        selectedPerson?.id ?? '',
        depth,
        false,
        includePartners,
        includeNonBlood,
        includeSiblings,
      )
    },
    [
      depth,
      graph,
      includeNonBlood,
      includePartners,
      includeSiblings,
      people,
      relationshipFromId,
      relationshipToId,
      selectedPerson,
      viewMode,
    ],
  )

  const visibleGraphEdges = useMemo(
    () =>
      getVisibleEdges(
        graph,
        visibleIds,
        includePartners,
        includeNonBlood,
        includeSiblings,
      ),
    [graph, includeNonBlood, includePartners, includeSiblings, visibleIds],
  )

  const filteredPeople = useMemo(() => {
    const normalized = search.trim().toLowerCase()

    return people.filter((person) => {
      if (!visibleIds.has(person.id)) return false
      if (!normalized) return true

      return (
        person.label.toLowerCase().includes(normalized) ||
        person.branch.toLowerCase().includes(normalized) ||
        person.roleLabel.toLowerCase().includes(normalized)
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
    if (!isHydrated) return

    const runId = layoutRunRef.current + 1
    layoutRunRef.current = runId

    void (async () => {
      const scopedVisibleIds = visiblePersonIds(
        graphRef.current,
        selectedPersonId ?? '',
        depth,
        viewMode === 'overview',
        includePartners,
        includeNonBlood,
        includeSiblings,
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
    includeSiblings,
    isHydrated,
    layoutMode,
    relationshipFromId,
    relationshipToId,
    selectedPersonId,
    viewMode,
  ])

  function handleSelectPerson(id: string) {
    if (selectedPersonId && selectedPersonId !== id) {
      setRelationshipFromId(selectedPersonId)
      setRelationshipToId(id)
      setViewMode('relationship')
    } else if (!relationshipFromId || relationshipFromId === id) {
      setRelationshipFromId(id)
    } else {
      setRelationshipToId(id)
    }

    setSelectedPersonId(id)
    setSelectedEdgeId(null)
    setRightCollapsed(false)
  }

  function handleAddRelative(type: 'child' | 'partner') {
    if (!selectedPerson) return
    const result = addRelative(graph, selectedPerson, type)
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
        validateGraph(parsed)
        setGraph(parsed)
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

  if (!graphHasRenderablePeople(graph)) {
    return null
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

  return (
    <div className="app">
      <div
        className={`workspace${leftCollapsed ? ' left-collapsed' : ''}${
          rightCollapsed ? ' right-collapsed' : ''
        }`}
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
              <p className="mini-label">Kin</p>
              <h1>{String(graph.metadata.treeName ?? 'Family Tree')}</h1>
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
              <button type="button" onClick={() => handleAddRelative('child')}>
                Add child
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => handleAddRelative('partner')}
              >
                Add partner
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
                {graph.entities.length} entities · {graph.edges.length} edges
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
                    <small>{person.roleLabel}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
            </>
          )}
        </aside>

        <section className="center-stage">
          <TreeCanvas
            graph={graph}
            visibleIds={visibleIds}
            visibleEdges={visibleGraphEdges}
            selectedPersonId={selectedPersonId ?? ''}
            selectedEdgeId={selectedEdgeId}
            layoutMode={layoutMode}
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

          <div
            className={`floating-controls${
              viewControlsCollapsed ? ' floating-controls-collapsed' : ''
            }`}
            role="dialog"
            aria-label="View controls"
          >
            <div className="floating-controls__header">
              <span className="mini-label">View</span>
              <div className="floating-controls__header-actions">
                <span className="floating-controls__value">
                  {viewMode === 'overview'
                    ? 'Overview'
                    : viewMode === 'relationship'
                      ? 'Relationship'
                      : `${depth} hops`}
                </span>
                <button
                  type="button"
                  className="floating-controls__collapse"
                  onClick={() => setViewControlsCollapsed((current) => !current)}
                  aria-label={
                    viewControlsCollapsed ? 'Expand view controls' : 'Collapse view controls'
                  }
                >
                  {viewControlsCollapsed ? '+' : '-'}
                </button>
              </div>
            </div>

            {!viewControlsCollapsed && (
              <>
                <div className="floating-controls__section">
                  <div className="view-mode-switch" role="tablist" aria-label="View mode">
                    <button
                      type="button"
                      className={viewMode === 'overview' ? 'view-mode-pill active' : 'view-mode-pill'}
                      onClick={() => setViewMode('overview')}
                    >
                      Overview
                    </button>
                    <button
                      type="button"
                      className={viewMode === 'focus' ? 'view-mode-pill active' : 'view-mode-pill'}
                      onClick={() => setViewMode('focus')}
                    >
                      Focus
                    </button>
                    <button
                      type="button"
                      className={
                        viewMode === 'relationship' ? 'view-mode-pill active' : 'view-mode-pill'
                      }
                      onClick={() => setViewMode('relationship')}
                    >
                      Relationship
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
                        } else if (viewMode !== 'relationship') {
                          setViewMode('focus')
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
                  <label>
                    <input
                      type="checkbox"
                      checked={includeNonBlood}
                      onChange={(event) => setIncludeNonBlood(event.target.checked)}
                    />
                    Guardian links
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={includeSiblings}
                      onChange={(event) => setIncludeSiblings(event.target.checked)}
                    />
                    Sibling links
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

          <div className="relationship-dialog" role="dialog" aria-label="Relationship finder">
            <div className="relationship-dialog__header">
              <span className="mini-label">Relationship</span>
            </div>
            <div className="relationship-dialog__controls">
              <label>
                <span>Who is</span>
                <select
                  value={relationshipFromId}
                  onChange={(event) => setRelationshipFromId(event.target.value)}
                >
                  <option value="">Select person</option>
                  {sortedPeople.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.preferredName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>to</span>
                <select
                  value={relationshipToId}
                  onChange={(event) => setRelationshipToId(event.target.value)}
                >
                  <option value="">Select person</option>
                  {sortedPeople.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.preferredName}
                    </option>
                  ))}
                </select>
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
                </>
              ) : (
                <strong>Select two people.</strong>
              )}
            </div>
          </div>
        </section>

        <div className="right-sidebar">
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
              onUpdateAttr={(key, value) =>
                setGraph((current) =>
                  updatePersonAttr(current, selectedPersonId ?? '', key, value),
                )
              }
              onRenameConnectedPerson={(personId, value) =>
                setGraph((current) => updatePersonAttr(current, personId, 'preferredName', value))
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
            />
          )}
        </div>
      </div>
    </div>
  )
}

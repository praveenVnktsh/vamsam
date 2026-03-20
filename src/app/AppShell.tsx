import type { CSSProperties } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  encryptGraphBackup,
} from '../data/backupCrypto'
import {
  createInviteLink,
  fetchPendingChangeRequests,
  linkUserToPerson,
  makeChangeRequestPayload,
  reviewChangeRequest,
  submitChangeRequest,
  type ChangeRequest,
  type InvitePreview,
  type InviteRole,
} from '../data/cloudGraph'
import {
  loadRecentSnapshots,
  saveGraphSnapshot,
  type GraphSnapshot,
} from '../data/storage'
import { EdgePredicate, EntityType, type GraphSchema } from '../domain/graph'
import {
  addConnectedPerson,
  addConnection,
  addParentPerson,
  addRelative,
  addStandalonePerson,
  autoLayoutGraph,
  canDirectlyEditPerson,
  canDirectlyManageRelationship,
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
  validateGraph,
  visibleEdges as getVisibleEdges,
  visiblePersonIds,
} from '../domain/graphOps'
import { PersonTokenSelector } from '../features/PersonTokenSelector'
import { PersonAvatar } from '../features/PersonAvatar'
import { TreeCanvas } from '../features/canvas/TreeCanvas'
import { Inspector } from '../features/inspector/Inspector'
import { uploadCompressedPersonPhoto } from '../data/photoStorage'

const depthOptions = [1, 2, 3, 99] as const

type AppShellProps = {
  initialGraph: GraphSchema
  treeId: string
  userEmail: string
  currentUserId: string
  currentUserProfilePhoto: string
  linkedPersonId: string | null
  invitePreview?: InvitePreview | null
  role: 'admin' | 'editor' | 'viewer'
  canEdit: boolean
  onPersistGraph: (graph: GraphSchema) => Promise<void>
  onResetGraph: () => Promise<GraphSchema>
  onSignOut: () => Promise<void> | void
}

export function AppShell({
  initialGraph,
  treeId,
  userEmail,
  currentUserId,
  currentUserProfilePhoto,
  linkedPersonId,
  invitePreview = null,
  role,
  canEdit,
  onPersistGraph,
  onSignOut,
}: AppShellProps) {
  type SaveState = 'saved' | 'dirty' | 'saving' | 'error'
  const [graph, setGraph] = useState<GraphSchema>(initialGraph)
  const [leftCollapsed, setLeftCollapsed] = useState(true)
  const [rightCollapsed, setRightCollapsed] = useState(true)
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [flyToPersonRequest, setFlyToPersonRequest] = useState<{
    nonce: number
    personId: string
  } | null>(null)
  const [fitToNodeIdsRequest, setFitToNodeIdsRequest] = useState<{
    nonce: number
    nodeIds: string[]
  } | null>(null)
  const [search, setSearch] = useState('')
  const [depth, setDepth] = useState<(typeof depthOptions)[number]>(99)
  const [viewMode, setViewMode] = useState<'overview' | 'focus' | 'lineage'>('overview')
  const [showRelationshipGraph, setShowRelationshipGraph] = useState(false)
  const [includePartners, setIncludePartners] = useState(true)
  const includeNonBlood = false
  const [compactLayout, setCompactLayout] = useState(true)
  const [layoutMode, setLayoutMode] = useState<'person' | 'family'>('family')
  const [layoutAlgorithm, setLayoutAlgorithm] = useState<'hierarchy' | 'organic'>('organic')
  const [organicLiveSimulation, setOrganicLiveSimulation] = useState(true)
  const [organicSeedNonce, setOrganicSeedNonce] = useState(0)
  const [viewControlsCollapsed, setViewControlsCollapsed] = useState(true)
  const [relationshipDialogCollapsed, setRelationshipDialogCollapsed] = useState(true)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const [recentSnapshots, setRecentSnapshots] = useState<GraphSnapshot[]>([])
  const [relationshipFromId, setRelationshipFromId] = useState<string>('')
  const [relationshipToId, setRelationshipToId] = useState<string>('')
  const [relationshipFromQuery, setRelationshipFromQuery] = useState('')
  const [relationshipToQuery, setRelationshipToQuery] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<InviteRole>('viewer')
  const [inviteLink, setInviteLink] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [identityStep, setIdentityStep] = useState<'welcome' | 'claim' | 'create'>('welcome')
  const [identityMode, setIdentityMode] = useState<'claim' | 'create'>('claim')
  const [identityQuery, setIdentityQuery] = useState('')
  const [identitySelectedId, setIdentitySelectedId] = useState('')
  const [identitySelection, setIdentitySelection] = useState<{ type: 'existing'; id: string } | null>(null)
  const [identityFirstName, setIdentityFirstName] = useState('')
  const [identityLastName, setIdentityLastName] = useState('')
  const [identityNickname, setIdentityNickname] = useState('')
  const [identityLinkPersonId, setIdentityLinkPersonId] = useState('')
  const [identityLinkQuery, setIdentityLinkQuery] = useState('')
  const [identityLinkSelection, setIdentityLinkSelection] = useState<{ type: 'existing'; id: string } | null>(null)
  const [identityLinkType, setIdentityLinkType] = useState<'child_of' | 'parent_of' | 'sibling_of' | 'partner_of'>('child_of')
  const [identityError, setIdentityError] = useState<string | null>(null)
  const [viewerPersonId, setViewerPersonId] = useState<string | null>(linkedPersonId)
  const [pendingChangeRequests, setPendingChangeRequests] = useState<ChangeRequest[]>([])
  const [changeRequestBusyId, setChangeRequestBusyId] = useState<string | null>(null)
  const [isMobileViewport, setIsMobileViewport] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= 1024 : false,
  )
  const [mobilePanel, setMobilePanel] = useState<'none' | 'view' | 'relationship' | 'inspector'>(
    'none',
  )
  const graphRef = useRef(graph)
  const layoutRunRef = useRef(0)
  const saveRunRef = useRef(0)
  const hasInitializedSaveRef = useRef(false)
  const graphHistoryRef = useRef<{ undo: GraphSchema[]; redo: GraphSchema[] }>({
    undo: [],
    redo: [],
  })
  const skipHistoryRef = useRef(false)
  const previousGraphRef = useRef(initialGraph)
  const previousLayoutAlgorithmRef = useRef<'hierarchy' | 'organic'>('organic')
  const organicSeedKeyRef = useRef('')
  const depthIndex = depthOptions.indexOf(depth)

  function expandViewPanel() {
    if (isMobileViewport) {
      setMobilePanel('view')
      return
    }
    setViewControlsCollapsed(false)
    setRelationshipDialogCollapsed(true)
    setInspectorCollapsed(true)
  }

  function expandInspectorPanel() {
    if (isMobileViewport) {
      setMobilePanel('inspector')
      return
    }
    setViewControlsCollapsed(true)
    setRelationshipDialogCollapsed(true)
    setInspectorCollapsed(false)
  }

  function revealInspectorForViewport() {
    setRightCollapsed(false)
    if (isMobileViewport) {
      setMobilePanel('inspector')
      setViewControlsCollapsed(true)
      setRelationshipDialogCollapsed(true)
      setInspectorCollapsed(false)
      return
    }
    expandInspectorPanel()
  }

  function clearRelationshipSelection() {
    setRelationshipFromId('')
    setRelationshipToId('')
    setRelationshipFromQuery('')
    setRelationshipToQuery('')
    setShowRelationshipGraph(false)
    setRelationshipDialogCollapsed(true)
    if (isMobileViewport) {
      setMobilePanel('none')
    }
  }

  const relationshipModeActive = isMobileViewport
    ? mobilePanel === 'relationship'
    : !relationshipDialogCollapsed

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleResize = () => {
      const nextIsMobile = window.innerWidth <= 1024
      setIsMobileViewport(nextIsMobile)
      if (!nextIsMobile) {
        setMobilePanel('none')
      } else {
        setRightCollapsed(true)
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!isMobileViewport) return
    if (selectedPersonId) {
      setMobilePanel('inspector')
      return
    }
    if (relationshipModeActive) {
      setMobilePanel('relationship')
    }
  }, [
    isMobileViewport,
    relationshipModeActive,
    selectedPersonId,
  ])

  useEffect(() => {
    if (!selectedPersonId || relationshipModeActive) return

    setRightCollapsed(false)
    if (isMobileViewport) {
      setMobilePanel('inspector')
      setViewControlsCollapsed(true)
      setRelationshipDialogCollapsed(true)
      setInspectorCollapsed(false)
      return
    }

    setInspectorCollapsed(false)
    setViewControlsCollapsed(true)
    setRelationshipDialogCollapsed(true)
  }, [isMobileViewport, relationshipModeActive, selectedPersonId])

  function setGraphWithoutHistory(nextGraph: GraphSchema) {
    skipHistoryRef.current = true
    setGraph(nextGraph)
  }

  function applyValidatedGraphChange(
    nextOrUpdater: GraphSchema | ((current: GraphSchema) => GraphSchema),
  ) {
    setGraph((current) => {
      const nextGraph =
        typeof nextOrUpdater === 'function'
          ? (nextOrUpdater as (current: GraphSchema) => GraphSchema)(current)
          : nextOrUpdater

      const currentIssueKeys = new Set(
        validateGraph(current).map(
          (issue) => `${issue.code}:${issue.edgeId ?? ''}:${issue.entityId ?? ''}`,
        ),
      )
      const newIssues = validateGraph(nextGraph).filter(
        (issue) =>
          !currentIssueKeys.has(`${issue.code}:${issue.edgeId ?? ''}:${issue.entityId ?? ''}`),
      )
      if (newIssues.length > 0) {
        setValidationMessage(
          newIssues[0]?.message ?? 'This change would create an invalid graph.',
        )
        return current
      }

      setValidationMessage(null)
      return nextGraph
    })
  }

  function assignOwnerIfNeeded(nextGraph: GraphSchema, personId: string) {
    if (role === 'admin' || !personId) return nextGraph
    return updatePersonAttr(nextGraph, personId, 'ownerUserId', currentUserId)
  }

  function handleUndo() {
    const previous = graphHistoryRef.current.undo.pop()
    if (!previous) return
    graphHistoryRef.current.redo.push(graphRef.current)
    setValidationMessage(null)
    setGraphWithoutHistory(previous)
  }

  function handleRedo() {
    const next = graphHistoryRef.current.redo.pop()
    if (!next) return
    graphHistoryRef.current.undo.push(graphRef.current)
    setValidationMessage(null)
    setGraphWithoutHistory(next)
  }

  useEffect(() => {
    graphRef.current = graph
  }, [graph])

  useEffect(() => {
    graphHistoryRef.current = { undo: [], redo: [] }
    previousGraphRef.current = initialGraph
    setValidationMessage(null)
    setGraphWithoutHistory(initialGraph)
    setSaveState('saved')
    setViewerPersonId(linkedPersonId)
    setIdentityStep('welcome')
  }, [initialGraph, linkedPersonId])

  useEffect(() => {
    void loadRecentSnapshots(treeId).then(setRecentSnapshots).catch(() => undefined)
  }, [treeId])

  useEffect(() => {
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false
      previousGraphRef.current = graph
      return
    }

    if (previousGraphRef.current === graph) {
      return
    }

    graphHistoryRef.current.undo.push(previousGraphRef.current)
    if (graphHistoryRef.current.undo.length > 30) {
      graphHistoryRef.current.undo.shift()
    }
    graphHistoryRef.current.redo = []
    previousGraphRef.current = graph
  }, [graph])

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
            void saveGraphSnapshot(treeId, graph).then(() =>
              loadRecentSnapshots(treeId).then(setRecentSnapshots),
            )
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
  }, [graph, onPersistGraph, treeId])

  const people = useMemo(() => graphPeople(graph), [graph])
  const peopleById = useMemo(() => personMap(people), [people])
  const currentViewerPerson = useMemo(
    () => (viewerPersonId ? peopleById.get(viewerPersonId) ?? null : null),
    [peopleById, viewerPersonId],
  )
  const selectedPerson = selectedPersonId ? peopleById.get(selectedPersonId) ?? null : null
  const identityCandidates = useMemo(() => {
    const query = identityQuery.trim().toLowerCase()
    if (!query) return people
    return people.filter((person) => {
      const haystack = [displayName(person), fullName(person), person.nickname, person.email]
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [identityQuery, people])
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
  const relationshipFitPathIds = useMemo(() => {
    if (!relationshipFromId || !relationshipToId) return []
    const resolvedPath = shortestPersonPath(graph, relationshipFromId, relationshipToId)
    return resolvedPath.length > 0 ? resolvedPath : [relationshipFromId, relationshipToId]
  }, [graph, relationshipFromId, relationshipToId])
  const relationshipBloodPathIds = useMemo(
    () =>
      showRelationshipGraph && relationshipFromId && relationshipToId
        ? shortestBloodPath(graph, relationshipFromId, relationshipToId)
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

  useEffect(() => {
    if (!relationshipFromId || !relationshipToId || relationshipFitPathIds.length === 0) return

    setFitToNodeIdsRequest((current) => ({
      nonce: (current?.nonce ?? 0) + 1,
      nodeIds: relationshipFitPathIds,
    }))
  }, [relationshipFitPathIds, relationshipFromId, relationshipToId])

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

  const selectedPersonCanDirectEdit = useMemo(
    () =>
      canDirectlyEditPerson(
        graph,
        currentUserId,
        currentViewerPerson?.id ?? '',
        role,
        selectedPerson,
      ),
    [currentUserId, currentViewerPerson?.id, graph, role, selectedPerson],
  )

  const refreshPendingRequests = useCallback(async () => {
    if (role !== 'admin') {
      setPendingChangeRequests([])
      return
    }

    try {
      const requests = await fetchPendingChangeRequests(treeId)
      setPendingChangeRequests(requests)
    } catch {
      setPendingChangeRequests([])
    }
  }, [role, treeId])

  useEffect(() => {
    void refreshPendingRequests()
  }, [refreshPendingRequests])

  function queueGraphChangeRequest(
    nextGraph: GraphSchema,
    options: {
      actionType: string
      summary: string
      targetPersonId?: string | null
      targetRelationshipId?: string | null
    },
  ) {
    const payload = makeChangeRequestPayload(treeId, graphRef.current, nextGraph)
    return submitChangeRequest({
      treeId,
      requesterUserId: currentUserId,
      requesterEmail: userEmail,
      actionType: options.actionType,
      summary: options.summary,
      payload,
      targetPersonId: options.targetPersonId ?? null,
      targetRelationshipId: options.targetRelationshipId ?? null,
    }).then(() => {
      setValidationMessage('Change request sent to admins for review.')
      return refreshPendingRequests()
    })
  }

  function canDirectlyApplyGraphChange(previousGraph: GraphSchema, nextGraph: GraphSchema) {
    if (role === 'admin') return true
    if (role === 'viewer') return false
    if (!currentViewerPerson?.id) return false

    const diff = makeChangeRequestPayload(treeId, previousGraph, nextGraph)
    const nextPeopleById = personMap(graphPeople(nextGraph))
    const previousPeopleById = personMap(graphPeople(previousGraph))

    for (const row of diff.upsertPeople) {
      const person = nextPeopleById.get(row.person_id)
      if (
        !canDirectlyEditPerson(
          nextGraph,
          currentUserId,
          currentViewerPerson.id,
          role,
          person,
        )
      ) {
        return false
      }
    }

    for (const personId of diff.deletePersonIds) {
      const person = previousPeopleById.get(personId)
      if (
        !canDirectlyEditPerson(
          previousGraph,
          currentUserId,
          currentViewerPerson.id,
          role,
          person,
        )
      ) {
        return false
      }
    }

    for (const row of diff.upsertRelationships) {
      const edge = row.edge
      const srcPerson = nextPeopleById.get(edge.src) ?? previousPeopleById.get(edge.src)
      const dstPerson = nextPeopleById.get(edge.dst) ?? previousPeopleById.get(edge.dst)
      if (
        !canDirectlyManageRelationship(
          nextGraph,
          currentUserId,
          currentViewerPerson.id,
          role,
          srcPerson,
          dstPerson,
        )
      ) {
        return false
      }
    }

    for (const relationshipId of diff.deleteRelationshipIds) {
      const edge = previousGraph.edges.find((candidate) => candidate.id === relationshipId)
      if (!edge) continue
      const srcPerson = previousPeopleById.get(edge.src)
      const dstPerson = previousPeopleById.get(edge.dst)
      if (
        !canDirectlyManageRelationship(
          previousGraph,
          currentUserId,
          currentViewerPerson.id,
          role,
          srcPerson,
          dstPerson,
        )
      ) {
        return false
      }
    }

    return true
  }

  function applyGraphChangeWithPermissions(
    nextOrUpdater: GraphSchema | ((current: GraphSchema) => GraphSchema),
    options: {
      actionType: string
      summary: string
      targetPersonId?: string | null
      targetRelationshipId?: string | null
      allowQueue?: boolean
    },
  ) {
    const current = graphRef.current
    const nextGraph =
      typeof nextOrUpdater === 'function'
        ? (nextOrUpdater as (current: GraphSchema) => GraphSchema)(current)
        : nextOrUpdater

    const currentIssueKeys = new Set(
      validateGraph(current).map(
        (issue) => `${issue.code}:${issue.edgeId ?? ''}:${issue.entityId ?? ''}`,
      ),
    )
    const newIssues = validateGraph(nextGraph).filter(
      (issue) =>
        !currentIssueKeys.has(`${issue.code}:${issue.edgeId ?? ''}:${issue.entityId ?? ''}`),
    )
    if (newIssues.length > 0) {
      setValidationMessage(newIssues[0]?.message ?? 'This change would create an invalid graph.')
      return
    }

    if (canDirectlyApplyGraphChange(current, nextGraph)) {
      setValidationMessage(null)
      applyValidatedGraphChange(nextGraph)
      return
    }

    if (options.allowQueue === false) {
      setValidationMessage('You do not have permission to edit this person directly.')
      return
    }

    void queueGraphChangeRequest(nextGraph, options)
  }

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
    const organicSeedKey = `${layoutMode}:${compactLayout}`
    const enteringOrganic =
      previousLayoutAlgorithmRef.current !== 'organic' && layoutAlgorithm === 'organic'
    const needsInitialSeed = layoutAlgorithm === 'organic' && organicSeedKeyRef.current === ''
    const needsModeReseed =
      layoutAlgorithm === 'organic' &&
      organicSeedKeyRef.current !== '' &&
      organicSeedKeyRef.current !== organicSeedKey

    previousLayoutAlgorithmRef.current = layoutAlgorithm

    if (!enteringOrganic && !needsInitialSeed && !needsModeReseed) {
      return
    }

    if (!graphHasRenderablePeople(graphRef.current)) {
      organicSeedKeyRef.current = organicSeedKey
      return
    }

    const runId = layoutRunRef.current + 1
    layoutRunRef.current = runId

    void (async () => {
      const seededGraph = await autoLayoutGraph(graphRef.current, visibleIds, {
        compact: compactLayout,
        layoutMode,
        layoutAlgorithm: 'organic',
      })

      if (layoutRunRef.current === runId) {
        organicSeedKeyRef.current = organicSeedKey
        setOrganicSeedNonce((value) => value + 1)
        applyValidatedGraphChange(seededGraph)
      }
    })()
  }, [compactLayout, layoutAlgorithm, layoutMode, visibleIds])

  useEffect(() => {
    if (layoutAlgorithm === 'organic') {
      return
    }

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
        applyValidatedGraphChange(nextGraph)
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
    if (relationshipModeActive) {
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
      setSelectedEdgeId(null)
      setRightCollapsed(true)
      setInspectorCollapsed(true)
      return
    }

    setSelectedPersonId(id)
    setSelectedEdgeId(null)
    revealInspectorForViewport()
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
    const nextGraph = assignOwnerIfNeeded(result.graph, result.newPersonId)
    const relativeLabel =
      type === 'parent'
        ? 'parent'
        : type === 'child'
          ? 'child'
          : type === 'partner'
            ? 'partner'
            : 'sibling'
    if (canDirectlyApplyGraphChange(graphRef.current, nextGraph)) {
      applyValidatedGraphChange(nextGraph)
      setSelectedPersonId(result.newPersonId)
      revealInspectorForViewport()
      return
    }

    void queueGraphChangeRequest(nextGraph, {
      actionType: 'create_person',
      summary: `Add ${relativeLabel} for ${displayName(selectedPerson)}.`,
      targetPersonId: selectedPerson.id,
    })
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
      applyGraphChangeWithPermissions((current) => hardDeletePerson(current, personId), {
        actionType: 'delete_person',
        summary: `Delete ${displayName(person)}.`,
        targetPersonId: personId,
      })
      if (selectedPersonId === personId) {
        setSelectedPersonId(null)
        setSelectedEdgeId(null)
        setRightCollapsed(true)
      }
      return
    }

    const result = addRelative(graph, person, action)
    const nextGraph = assignOwnerIfNeeded(result.graph, result.newPersonId)
    if (canDirectlyApplyGraphChange(graphRef.current, nextGraph)) {
      applyValidatedGraphChange(nextGraph)
      setSelectedPersonId(result.newPersonId)
      revealInspectorForViewport()
      return
    }

    void queueGraphChangeRequest(nextGraph, {
      actionType: 'create_person',
      summary: `Add ${action} for ${displayName(person)}.`,
      targetPersonId: person.id,
    })
  }

  function handleCreateStandalonePerson(defaultName = 'New Person') {
    if (!canEdit) return
    const result = addStandalonePerson(graph, defaultName)
    applyValidatedGraphChange(assignOwnerIfNeeded(result.graph, result.newPersonId))
    setSelectedPersonId(result.newPersonId)
    revealInspectorForViewport()
  }

  function linkViewerEmail(graphToUpdate: GraphSchema, personId: string): GraphSchema {
    const normalizedEmail = userEmail.trim().toLowerCase()
    return {
      ...graphToUpdate,
      entities: graphToUpdate.entities.map((entity) => {
        if (entity.entityType !== EntityType.PERSON) return entity
        const currentEmail = String(entity.attrs?.email ?? '').trim().toLowerCase()
        if (entity.id === personId) {
          return {
            ...entity,
            attrs: {
              ...entity.attrs,
              email: userEmail,
            },
          }
        }
        if (currentEmail === normalizedEmail) {
          return {
            ...entity,
            attrs: {
              ...entity.attrs,
              email: '',
            },
          }
        }
        return entity
      }),
    }
  }

  function seedViewerProfilePhoto(graphToUpdate: GraphSchema, personId: string): GraphSchema {
    const trimmedProfilePhoto = currentUserProfilePhoto.trim()
    if (!trimmedProfilePhoto) return graphToUpdate

    return {
      ...graphToUpdate,
      entities: graphToUpdate.entities.map((entity) => {
        if (entity.entityType !== EntityType.PERSON || entity.id !== personId) return entity
        const existingPhoto = String(entity.attrs?.photo ?? '').trim()
        const hasRealPhoto =
          /^(https?:\/\/|data:image\/|blob:|\/)/i.test(existingPhoto) ||
          existingPhoto.startsWith('storage://') ||
          /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(existingPhoto)

        if (hasRealPhoto) return entity

        return {
          ...entity,
          attrs: {
            ...entity.attrs,
            photo: trimmedProfilePhoto,
          },
        }
      }),
    }
  }

  async function handleClaimExistingIdentity() {
    if (!identitySelectedId) {
      setIdentityError('Choose your person record first.')
      return
    }

    try {
      const nextGraph = await linkUserToPerson(
        treeId,
        currentUserId,
        userEmail,
        identitySelectedId,
        graphRef.current,
        currentUserProfilePhoto,
      )
      setGraphWithoutHistory(nextGraph)
      setViewerPersonId(identitySelectedId)
      setSelectedPersonId(identitySelectedId)
      revealInspectorForViewport()
      setIdentityError(null)
    } catch (error) {
      setIdentityError(
        error instanceof Error ? error.message : 'Unable to link your identity right now.',
      )
    }
  }

  async function handleCreateIdentity() {
    const firstName = identityFirstName.trim()
    const lastName = identityLastName.trim()
    const nickname = identityNickname.trim()
    const seededName = `${firstName} ${lastName}`.trim() || nickname || 'New Person'

    if (!seededName) {
      setIdentityError('Enter at least a first name.')
      return
    }

    const next = addStandalonePerson(graph, seededName)
    let nextGraph = linkViewerEmail(next.graph, next.newPersonId)
    nextGraph = seedViewerProfilePhoto(nextGraph, next.newPersonId)
    nextGraph = updatePersonAttr(nextGraph, next.newPersonId, 'firstName', firstName || seededName)
    nextGraph = updatePersonAttr(nextGraph, next.newPersonId, 'lastName', lastName)
    nextGraph = updatePersonAttr(nextGraph, next.newPersonId, 'nickname', nickname)

    if (identityLinkPersonId) {
      if (identityLinkType === 'child_of') {
        nextGraph = addConnection(nextGraph, identityLinkPersonId, next.newPersonId, EdgePredicate.PARENT_OF)
      } else if (identityLinkType === 'parent_of') {
        nextGraph = addConnection(nextGraph, next.newPersonId, identityLinkPersonId, EdgePredicate.PARENT_OF)
      } else if (identityLinkType === 'partner_of') {
        nextGraph = addConnection(nextGraph, identityLinkPersonId, next.newPersonId, EdgePredicate.PARTNER_OF)
      } else if (identityLinkType === 'sibling_of') {
        nextGraph = connectPeopleAsSiblings(nextGraph, identityLinkPersonId, next.newPersonId)
      }
    }

    try {
      const linkedGraph = await linkUserToPerson(
        treeId,
        currentUserId,
        userEmail,
        next.newPersonId,
        nextGraph,
      )
      setGraphWithoutHistory(linkedGraph)
      setViewerPersonId(next.newPersonId)
      setSelectedPersonId(next.newPersonId)
      revealInspectorForViewport()
      setIdentityError(null)
    } catch (error) {
      setIdentityError(
        error instanceof Error ? error.message : 'Unable to create your linked identity.',
      )
    }
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
        applyValidatedGraphChange(nextGraph)
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

  async function handleCreateInvite() {
    const normalizedEmail = inviteEmail.trim().toLowerCase()
    if (!normalizedEmail) {
      setInviteError('Enter an email address to create an invite link.')
      return
    }

    setInviteLoading(true)
    setInviteError(null)

    try {
      const invite = await createInviteLink(treeId, currentUserId, normalizedEmail, inviteRole)
      const basePath =
        window.location.pathname === '/'
          ? window.location.origin
          : `${window.location.origin}${window.location.pathname.replace(/\/$/, '')}`
      const nextInviteLink = `${basePath}#/invite/${invite.token}`
      setInviteLink(nextInviteLink)
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(nextInviteLink)
      }
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : 'Unable to create invite link.')
    } finally {
      setInviteLoading(false)
    }
  }

  async function handleReviewChangeRequest(request: ChangeRequest, approve: boolean) {
    setChangeRequestBusyId(request.id)
    try {
      const nextGraph = await reviewChangeRequest({
        request,
        approve,
        currentGraph: graphRef.current,
      })
      if (approve) {
        setValidationMessage(`Approved request: ${request.summary}`)
        setGraphWithoutHistory(nextGraph)
      }
      await refreshPendingRequests()
    } catch (error) {
      setValidationMessage(
        error instanceof Error ? error.message : 'Unable to review this change request.',
      )
    } finally {
      setChangeRequestBusyId(null)
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
  const selectedPersonRelationToViewer =
    selectedPerson && currentViewerPerson
      ? selectedPerson.id === currentViewerPerson.id
        ? 'You'
        : (() => {
            const relationship = resolveRelationship(graph, selectedPerson.id, currentViewerPerson.id)
            return (
              relationship.socialLabels?.ta
                ? `Your ${relationship.socialLabels.ta} · ${relationship.socialLabels.taLatin} · ${relationship.socialLabels.en}`
                : relationship.labels?.ta
                  ? `Your ${relationship.labels.ta} · ${relationship.labels.taLatin} · ${relationship.labels.en}`
                  : relationship.socialLabel
                    ? `Your ${relationship.socialLabel}`
                    : relationship.label
                      ? `Your ${relationship.label}`
                      : ''
            )
          })()
      : ''
  const sharedDnaPercent =
    relationshipFromId && relationshipToId
      ? estimateSharedDnaPercent(graph, relationshipFromId, relationshipToId)
      : null
  const workspaceStyle: CSSProperties = {
    '--left-sidebar-width': '320px',
  } as CSSProperties
  const saveStateLabel =
    saveState === 'saving'
      ? 'Saving'
      : saveState === 'saved'
        ? 'Saved'
        : saveState === 'error'
          ? 'Save failed'
          : 'Unsaved'
  const canUndo = graphHistoryRef.current.undo.length > 0
  const canRedo = graphHistoryRef.current.redo.length > 0

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
              <p className="left-sidebar__identity">
                {currentViewerPerson
                  ? `Linked identity: ${displayName(currentViewerPerson)}`
                  : 'Linked identity: not set'}
              </p>
            </div>
          </div>

          <div className="left-sidebar__section">
            <div className="storage-actions">
              <button type="button" className="secondary-button" onClick={handleUndo} disabled={!canEdit || !canUndo}>
                Undo
              </button>
              <button type="button" className="secondary-button" onClick={handleRedo} disabled={!canEdit || !canRedo}>
                Redo
              </button>
            </div>
            {validationMessage ? <p className="validation-banner">{validationMessage}</p> : null}
          </div>

          {role === 'admin' ? (
            <div className="left-sidebar__section">
              <div className="section-title-row">
                <span className="mini-label">Invite link</span>
              </div>
              <div className="form-grid">
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="family@example.com"
                  />
                </label>
                <label>
                  <span>Role</span>
                  <select
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value as InviteRole)}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
              </div>
              <div className="storage-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void handleCreateInvite()}
                  disabled={inviteLoading}
                >
                  {inviteLoading ? 'Creating...' : 'Create invite link'}
                </button>
              </div>
              {inviteError ? <p className="validation-banner">{inviteError}</p> : null}
              {inviteLink ? (
                <div className="invite-link-card">
                  <p className="invite-link-card__label">Copied invite link</p>
                  <input type="text" readOnly value={inviteLink} onFocus={(event) => event.currentTarget.select()} />
                </div>
              ) : null}
            </div>
          ) : null}

          {role === 'admin' ? (
            <div className="left-sidebar__section">
              <div className="section-title-row">
                <span className="mini-label">Change requests</span>
                <span className="counts-pill">{pendingChangeRequests.length}</span>
              </div>
              <div className="snapshot-list">
                {pendingChangeRequests.length === 0 ? (
                  <p className="snapshot-list__empty">No pending requests.</p>
                ) : (
                  pendingChangeRequests.map((request) => (
                    <div key={request.id} className="snapshot-list-item">
                      <strong>{request.summary}</strong>
                      <small>{request.requesterEmail}</small>
                      <div className="storage-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={changeRequestBusyId === request.id}
                          onClick={() => void handleReviewChangeRequest(request, true)}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={changeRequestBusyId === request.id}
                          onClick={() => void handleReviewChangeRequest(request, false)}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}

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
              <span className="mini-label">Recent saves</span>
              <span className="counts-pill">{recentSnapshots.length}</span>
            </div>
            <div className="snapshot-list">
              {recentSnapshots.length === 0 ? (
                <p className="snapshot-list__empty">No recent snapshots yet.</p>
              ) : (
                recentSnapshots.map((snapshot) => (
                  <button
                    key={snapshot.id}
                    type="button"
                    className="snapshot-list-item"
                    onClick={() => {
                      if (!window.confirm('Restore this saved version? Your current unsaved changes will be replaced.')) {
                        return
                      }
                      graphHistoryRef.current.redo = []
                      graphHistoryRef.current.undo.push(graphRef.current)
                      setValidationMessage(null)
                      setGraphWithoutHistory(snapshot.graph)
                    }}
                  >
                    <strong>{new Date(snapshot.createdAt).toLocaleString()}</strong>
                    <small>Restore snapshot</small>
                  </button>
                ))
              )}
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
                  <PersonAvatar person={person} className="person-list-avatar" />
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

        <section className="center-stage">
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
          highlightedNodeIds={showRelationshipGraph ? new Set(relationshipBloodPathIds) : new Set()}
          selectedPersonId={selectedPersonId ?? ''}
          selectedEdgeId={selectedEdgeId}
          layoutMode={layoutMode}
          layoutAlgorithm={layoutAlgorithm}
          organicSeedNonce={organicSeedNonce}
          organicLiveSimulation={organicLiveSimulation}
          autoCenter={false}
          flyToPersonRequest={flyToPersonRequest}
          fitToNodeIdsRequest={fitToNodeIdsRequest}
            onSelectPerson={(id) => handleSelectPerson(id)}
            onSelectEdge={(id) => {
              setSelectedEdgeId(id)
              if (id || showRelationshipGraph || relationshipFromId || relationshipToId) {
                clearRelationshipSelection()
              }
            }}
            onMovePerson={(id, x, y) =>
              canEdit
                ? (() => {
                    const person = peopleById.get(id)
                    if (
                      !canDirectlyEditPerson(
                        graphRef.current,
                        currentUserId,
                        currentViewerPerson?.id ?? '',
                        role,
                        person,
                      )
                    ) {
                      return
                    }
                    applyValidatedGraphChange((current) => updatePersonPosition(current, id, x, y))
                  })()
                : undefined
            }
            onMoveFamily={(memberIds, dx, dy) =>
              canEdit
                ? (() => {
                    const nextGraphPreview = memberIds.reduce(
                      (nextGraph, memberId) => {
                        const person = graphPeople(nextGraph).find((candidate) => candidate.id === memberId)
                        if (!person) return nextGraph
                        return updatePersonPosition(nextGraph, memberId, person.x + dx, person.y + dy)
                      },
                      graphRef.current,
                    )
                    if (
                      !canDirectlyApplyGraphChange(
                        graphRef.current,
                        nextGraphPreview,
                      )
                    ) {
                      return
                    }
                    applyValidatedGraphChange(nextGraphPreview)
                  })()
                : undefined
            }
            currentViewerPerson={currentViewerPerson}
            onPersonQuickAction={handleCanvasPersonQuickAction}
          />

          {!currentViewerPerson && (
            <div className="identity-onboarding">
              <div className="identity-onboarding__card">
                <div className="identity-onboarding__step-row">
                  <p className="mini-label">Getting started</p>
                  <span className="identity-onboarding__step-pill">
                    {identityStep === 'welcome'
                      ? 'Step 1 of 2'
                      : identityStep === 'claim'
                        ? 'Step 2 of 2 · Claim'
                        : 'Step 2 of 2 · Create'}
                  </span>
                </div>

                {identityStep === 'welcome' ? (
                  <div className="identity-onboarding__welcome">
                    <h2>Welcome to {invitePreview?.treeName ?? 'this family tree'}</h2>
                    <p className="identity-onboarding__lead">
                      Before you start editing, link this account to your person card in the family.
                    </p>
                    <div className="identity-onboarding__summary">
                      <div className="identity-onboarding__summary-item">
                        <span>Signed in as</span>
                        <strong>{userEmail}</strong>
                      </div>
                      {invitePreview ? (
                        <div className="identity-onboarding__summary-item">
                          <span>Invite role</span>
                          <strong>{invitePreview.role}</strong>
                        </div>
                      ) : null}
                      <div className="identity-onboarding__summary-item">
                        <span>Profile photo</span>
                        <strong>
                          Your Google photo will be used by default if your card does not already have one.
                        </strong>
                      </div>
                    </div>
                    <div className="identity-onboarding__choices">
                      <button
                        type="button"
                        className="identity-onboarding__choice"
                        onClick={() => {
                          setIdentityMode('claim')
                          setIdentityStep('claim')
                        }}
                      >
                        <strong>I already exist</strong>
                        <span>Search for your existing person card and claim it.</span>
                      </button>
                      <button
                        type="button"
                        className="identity-onboarding__choice"
                        onClick={() => {
                          setIdentityMode('create')
                          setIdentityStep('create')
                        }}
                      >
                        <strong>Create my card</strong>
                        <span>Add yourself and connect to one known relative.</span>
                      </button>
                    </div>
                  </div>
                ) : identityMode === 'claim' ? (
                  <div className="identity-onboarding__body">
                    <div className="identity-onboarding__back-row">
                      <button type="button" className="secondary-button" onClick={() => setIdentityStep('welcome')}>
                        Back
                      </button>
                    </div>
                    <PersonTokenSelector
                      label="Find yourself"
                      query={identityQuery}
                      selectedPersonId={identitySelectedId}
                      selection={identitySelection}
                      onQueryChange={setIdentityQuery}
                      onSelectionChange={(selection) => {
                        const nextSelection = selection?.type === 'existing' ? selection : null
                        setIdentitySelection(nextSelection)
                        setIdentitySelectedId(nextSelection?.id ?? '')
                      }}
                      people={identityCandidates}
                      placeholder="Search your name..."
                    />
                    <button type="button" onClick={handleClaimExistingIdentity}>
                      Link this card to {userEmail}
                    </button>
                  </div>
                ) : (
                  <div className="identity-onboarding__body">
                    <div className="identity-onboarding__back-row">
                      <button type="button" className="secondary-button" onClick={() => setIdentityStep('welcome')}>
                        Back
                      </button>
                    </div>
                    <div className="form-grid identity-onboarding__grid">
                      <label>
                        <span>First name</span>
                        <input value={identityFirstName} onChange={(event) => setIdentityFirstName(event.target.value)} />
                      </label>
                      <label>
                        <span>Last name</span>
                        <input value={identityLastName} onChange={(event) => setIdentityLastName(event.target.value)} />
                      </label>
                      <label>
                        <span>Nickname</span>
                        <input value={identityNickname} onChange={(event) => setIdentityNickname(event.target.value)} />
                      </label>
                    </div>

                    <div className="identity-onboarding__connect">
                      <PersonTokenSelector
                        label="Known relative"
                        query={identityLinkQuery}
                        selectedPersonId={identityLinkPersonId}
                        selection={identityLinkSelection}
                        onQueryChange={setIdentityLinkQuery}
                        onSelectionChange={(selection) => {
                          const nextSelection = selection?.type === 'existing' ? selection : null
                          setIdentityLinkSelection(nextSelection)
                          setIdentityLinkPersonId(nextSelection?.id ?? '')
                        }}
                        people={people.filter((person) => person.email.trim().toLowerCase() !== userEmail.trim().toLowerCase())}
                        placeholder="Optional known relative..."
                        compact
                      />
                      <label>
                        <span>Relationship</span>
                        <select
                          value={identityLinkType}
                          onChange={(event) =>
                            setIdentityLinkType(
                              event.target.value as 'child_of' | 'parent_of' | 'sibling_of' | 'partner_of',
                            )
                          }
                        >
                          <option value="child_of">I am child of</option>
                          <option value="parent_of">I am parent of</option>
                          <option value="sibling_of">I am sibling of</option>
                          <option value="partner_of">I am partner of</option>
                        </select>
                      </label>
                    </div>

                    <button type="button" onClick={handleCreateIdentity}>
                      Create and link me
                    </button>
                  </div>
                )}

                {identityError ? <p className="validation-banner">{identityError}</p> : null}
              </div>
            </div>
          )}

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

          {isMobileViewport ? (
            <div className="mobile-topbar">
              <div className="mobile-topbar__search finder-panel" role="dialog" aria-label="Find people">
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

              <div className="mobile-topbar__actions">
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

                <button
                  type="button"
                  className="canvas-quick-add canvas-quick-add-secondary"
                  onClick={() => {
                    if (!currentViewerPerson) return
                    setSelectedPersonId(currentViewerPerson.id)
                    setSelectedEdgeId(null)
                    revealInspectorForViewport()
                    setFlyToPersonRequest((current) => ({
                      nonce: (current?.nonce ?? 0) + 1,
                      personId: currentViewerPerson.id,
                    }))
                  }}
                  disabled={!currentViewerPerson}
                  aria-label="Fly to my node"
                >
                  {currentViewerPerson ? (
                    <PersonAvatar
                      person={currentViewerPerson}
                      className="canvas-quick-add__avatar"
                    />
                  ) : (
                    <span className="canvas-quick-add__icon canvas-quick-add__icon-secondary">◎</span>
                  )}
                  <span>Fly to me</span>
                </button>
              </div>
            </div>
          ) : (
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

            <button
              type="button"
              className="canvas-quick-add canvas-quick-add-secondary"
              onClick={() => {
                if (!currentViewerPerson) return
                setSelectedPersonId(currentViewerPerson.id)
                setSelectedEdgeId(null)
                revealInspectorForViewport()
                setFlyToPersonRequest((current) => ({
                  nonce: (current?.nonce ?? 0) + 1,
                  personId: currentViewerPerson.id,
                }))
              }}
              disabled={!currentViewerPerson}
              aria-label="Fly to my node"
              title={
                currentViewerPerson
                  ? `Fly to ${displayName(currentViewerPerson)}`
                  : 'Link your email to a person to use Fly to me'
              }
            >
              {currentViewerPerson ? (
                <PersonAvatar
                  person={currentViewerPerson}
                  className="canvas-quick-add__avatar"
                />
              ) : (
                <span className="canvas-quick-add__icon canvas-quick-add__icon-secondary">◎</span>
              )}
              <span>Fly to me</span>
            </button>
            </div>
          )}

          {!isMobileViewport && (
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
                  {layoutAlgorithm === 'organic' ? (
                    <label>
                      <input
                        type="checkbox"
                        checked={organicLiveSimulation}
                        onChange={(event) => setOrganicLiveSimulation(event.target.checked)}
                      />
                      Live simulation
                    </label>
                  ) : null}
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
                  setRelationshipDialogCollapsed(false)
                  setViewControlsCollapsed(true)
                  setInspectorCollapsed(true)
                  setRightCollapsed(false)
                  setSelectedPersonId(null)
                  setSelectedEdgeId(null)
                }
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  if (relationshipDialogCollapsed) {
                    setRelationshipDialogCollapsed(false)
                    setViewControlsCollapsed(true)
                    setInspectorCollapsed(true)
                    setRightCollapsed(false)
                    setSelectedPersonId(null)
                    setSelectedEdgeId(null)
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
                <button
                  type="button"
                  className="floating-controls__clear-button"
                  aria-label="Clear relationship finder"
                  onClick={(event) => {
                    event.stopPropagation()
                    clearRelationshipSelection()
                  }}
                  disabled={
                    !relationshipFromId &&
                    !relationshipToId &&
                    !relationshipFromQuery &&
                    !relationshipToQuery
                  }
                >
                  ×
                </button>
              </div>
            </div>
            {!relationshipDialogCollapsed && (
              <div className="relationship-dialog__body">
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
                      {relationshipResult.socialLabels ? (
                        <p>
                          Social: {relationshipResult.socialLabels.en} /{' '}
                          {relationshipResult.socialLabels.taLatin} /{' '}
                          {relationshipResult.socialLabels.hiLatin}
                        </p>
                      ) : relationshipResult.socialLabel ? (
                        <p>Social: {relationshipResult.socialLabel}</p>
                      ) : null}
                      {relationshipResult.labels && (
                        <p>
                          Tamil: {relationshipResult.labels.ta} · Hindi: {relationshipResult.labels.hi}
                        </p>
                      )}
                      {relationshipResult.socialLabels && (
                        <p>
                          Social Tamil: {relationshipResult.socialLabels.ta} · Social Hindi:{' '}
                          {relationshipResult.socialLabels.hi}
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
              </div>
            )}
            </div>
            </div>
          )}

          {!isMobileViewport && !rightCollapsed && selectedPerson && (
            <div
              className={
                inspectorCollapsed
                  ? 'inspector-flyout inspector-flyout-collapsed'
                  : 'inspector-flyout'
              }
              role="dialog"
              aria-label="Inspector"
            >
              <Inspector
                graph={graph}
                selectedPerson={selectedPerson}
                selectedPersonId={selectedPersonId ?? ''}
                relationToViewer={selectedPersonRelationToViewer}
                visibleIds={visibleIds}
                allPeople={people}
                collapsed={inspectorCollapsed}
                canEditPerson={canEdit && selectedPersonCanDirectEdit}
                canManageConnections={canEdit}
                canDeletePerson={canEdit}
                onFlyToNode={() => {
                  setFlyToPersonRequest((current) => ({
                    nonce: (current?.nonce ?? 0) + 1,
                    personId: selectedPerson.id,
                  }))
                }}
                onClose={() => {
                  setRightCollapsed(true)
                }}
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
                  canEdit && selectedPersonCanDirectEdit
                    ? applyValidatedGraphChange((current) =>
                        updatePersonAttr(current, selectedPersonId ?? '', key, value),
                      )
                    : undefined
                }
                onUpdateConnection={(edgeId, predicate) =>
                  canEdit
                    ? applyGraphChangeWithPermissions((current) =>
                        updateEdge(current, edgeId, {
                          predicate: predicate as GraphSchema['edges'][number]['predicate'],
                        }), {
                          actionType: 'update_relationship',
                          summary: `Update relationship for ${displayName(selectedPerson)}.`,
                          targetPersonId: selectedPerson.id,
                          targetRelationshipId: edgeId,
                        }
                      )
                    : undefined
                }
                onReverseConnection={(edgeId) =>
                  canEdit
                    ? applyGraphChangeWithPermissions((current) => reverseEdge(current, edgeId), {
                        actionType: 'reverse_relationship',
                        summary: `Reverse relationship for ${displayName(selectedPerson)}.`,
                        targetPersonId: selectedPerson.id,
                        targetRelationshipId: edgeId,
                      })
                    : undefined
                }
                onDeleteConnection={(edgeId) =>
                  canEdit
                    ? applyGraphChangeWithPermissions((current) => deleteEdge(current, edgeId), {
                        actionType: 'delete_relationship',
                        summary: `Disconnect one relationship from ${displayName(selectedPerson)}.`,
                        targetPersonId: selectedPerson.id,
                        targetRelationshipId: edgeId,
                      })
                    : undefined
                }
                onAddConnectedPerson={(predicate, preferredName) => {
                  if (!canEdit) return
                  const result =
                    predicate === 'sibling'
                      ? addSiblingPerson(graph, selectedPerson, preferredName)
                      : predicate === 'child'
                        ? addParentPerson(graph, selectedPerson, preferredName)
                        : addConnectedPerson(graph, selectedPerson, predicate, preferredName)
                  const nextGraph = assignOwnerIfNeeded(result.graph, result.newPersonId)
                  if (canDirectlyApplyGraphChange(graphRef.current, nextGraph)) {
                    applyValidatedGraphChange(nextGraph)
                    setSelectedPersonId(result.newPersonId)
                    return
                  }
                  void queueGraphChangeRequest(nextGraph, {
                    actionType: 'create_person',
                    summary: `Add a connected person for ${displayName(selectedPerson)}.`,
                    targetPersonId: selectedPerson.id,
                  })
                }}
                onConnectExistingPerson={(targetId, predicate) =>
                  canEdit
                    ? applyGraphChangeWithPermissions((current) =>
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
                        {
                          actionType: 'connect_people',
                          summary: `Connect ${displayName(selectedPerson)} to another person.`,
                          targetPersonId: selectedPerson.id,
                        }
                      )
                    : undefined
                }
                onUploadPhoto={async (file) => {
                  if (!canEdit || !selectedPersonId || !selectedPersonCanDirectEdit) return
                  const photoUrl = await uploadCompressedPersonPhoto(treeId, selectedPersonId, file)
                  applyValidatedGraphChange((current) => updatePersonAttr(current, selectedPersonId, 'photo', photoUrl))
                }}
                onSoftDeletePerson={() => {
                  if (!canEdit) return
                  if (!selectedPersonId) return
                  if (!window.confirm('Soft delete this person and remove their personal information?')) {
                    return
                  }
                  applyGraphChangeWithPermissions((current) => softDeletePerson(current, selectedPersonId), {
                    actionType: 'soft_delete_person',
                    summary: `Soft delete ${displayName(selectedPerson)}.`,
                    targetPersonId: selectedPersonId,
                  })
                }}
                onHardDeletePerson={() => {
                  if (!canEdit) return
                  if (!selectedPersonId) return
                  if (!window.confirm('Hard delete this node and remove all related edges?')) {
                    return
                  }
                  const nextGraph = hardDeletePerson(graphRef.current, selectedPersonId)
                  if (canDirectlyApplyGraphChange(graphRef.current, nextGraph)) {
                    applyValidatedGraphChange(nextGraph)
                    setSelectedPersonId(null)
                    setSelectedEdgeId(null)
                    setRightCollapsed(true)
                    return
                  }
                  void queueGraphChangeRequest(nextGraph, {
                    actionType: 'delete_person',
                    summary: `Delete ${displayName(selectedPerson)}.`,
                    targetPersonId: selectedPersonId,
                  })
                }}
              />
            </div>
          )}

          {isMobileViewport && (
            <>
              <div className="mobile-bottom-dock">
                <button
                  type="button"
                  className={mobilePanel === 'view' ? 'mobile-bottom-dock__tab active' : 'mobile-bottom-dock__tab'}
                  onClick={() => setMobilePanel((current) => (current === 'view' ? 'none' : 'view'))}
                >
                  View
                </button>
                <button
                  type="button"
                  className={mobilePanel === 'relationship' ? 'mobile-bottom-dock__tab active' : 'mobile-bottom-dock__tab'}
                  onClick={() => {
                    setRelationshipDialogCollapsed(false)
                    setViewControlsCollapsed(true)
                    setInspectorCollapsed(true)
                    setSelectedPersonId(null)
                    setSelectedEdgeId(null)
                    setMobilePanel('relationship')
                  }}
                >
                  Relationship
                </button>
                <button
                  type="button"
                  className={mobilePanel === 'inspector' ? 'mobile-bottom-dock__tab active' : 'mobile-bottom-dock__tab'}
                  onClick={() => setMobilePanel((current) => (current === 'inspector' ? 'none' : 'inspector'))}
                  disabled={!selectedPerson}
                >
                  Inspector
                </button>
              </div>

              {mobilePanel !== 'none' && (
                <div className="mobile-sheet">
                  {mobilePanel === 'view' && (
                    <div className="mobile-sheet__panel floating-controls" role="dialog" aria-label="View controls">
                      <div className="floating-controls__header">
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
                          <button type="button" className="floating-controls__chevron" onClick={() => setMobilePanel('none')}>
                            ×
                          </button>
                        </div>
                      </div>
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
                        <button type="button" className="secondary-button" onClick={handleAutoOrganize}>
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
                        {layoutAlgorithm === 'organic' ? (
                          <label>
                            <input
                              type="checkbox"
                              checked={organicLiveSimulation}
                              onChange={(event) => setOrganicLiveSimulation(event.target.checked)}
                            />
                            Live simulation
                          </label>
                        ) : null}
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
                    </div>
                  )}

                  {mobilePanel === 'relationship' && (
                    <div className="mobile-sheet__panel relationship-dialog" role="dialog" aria-label="Relationship finder">
                      <div className="relationship-dialog__header">
                        <span className="mini-label">Relationship</span>
                        <div className="floating-controls__header-actions">
                          <span className="floating-controls__value">
                            {relationshipFrom && relationshipTo
                              ? `${displayName(relationshipFrom)} -> ${displayName(relationshipTo)}`
                              : 'Finder'}
                          </span>
                          <button
                            type="button"
                            className="floating-controls__clear-button"
                            aria-label="Close relationship finder"
                            onClick={() => {
                              clearRelationshipSelection()
                              setMobilePanel('none')
                            }}
                          >
                            ×
                          </button>
                        </div>
                      </div>
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
                    </div>
                  )}

                  {mobilePanel === 'inspector' && selectedPerson && (
                    <div className="mobile-sheet__panel inspector-flyout">
                      <Inspector
                        graph={graph}
                        selectedPerson={selectedPerson}
                        selectedPersonId={selectedPersonId ?? ''}
                        relationToViewer={selectedPersonRelationToViewer}
                        visibleIds={visibleIds}
                        allPeople={people}
                        collapsed={false}
                        canEditPerson={canEdit && selectedPersonCanDirectEdit}
                        canManageConnections={canEdit}
                        canDeletePerson={canEdit}
                        onFlyToNode={() => {
                          setFlyToPersonRequest((current) => ({
                            nonce: (current?.nonce ?? 0) + 1,
                            personId: selectedPerson.id,
                          }))
                        }}
                        onClose={() => setMobilePanel('none')}
                        onToggleCollapse={() => setMobilePanel('none')}
                        onCreateStandalonePerson={handleCreateStandalonePerson}
                        onQuickAddRelative={(type) => handleAddRelative(type)}
                        onUpdateAttr={(key, value) =>
                          canEdit && selectedPersonCanDirectEdit
                            ? applyValidatedGraphChange((current) =>
                                updatePersonAttr(current, selectedPersonId ?? '', key, value),
                              )
                            : undefined
                        }
                        onUpdateConnection={(edgeId, predicate) =>
                          canEdit
                            ? applyGraphChangeWithPermissions((current) =>
                                updateEdge(current, edgeId, {
                                  predicate: predicate as GraphSchema['edges'][number]['predicate'],
                                }), {
                                  actionType: 'update_relationship',
                                  summary: `Update relationship for ${displayName(selectedPerson)}.`,
                                  targetPersonId: selectedPerson.id,
                                  targetRelationshipId: edgeId,
                                }
                              )
                            : undefined
                        }
                        onReverseConnection={(edgeId) =>
                          canEdit
                            ? applyGraphChangeWithPermissions((current) => reverseEdge(current, edgeId), {
                                actionType: 'reverse_relationship',
                                summary: `Reverse relationship for ${displayName(selectedPerson)}.`,
                                targetPersonId: selectedPerson.id,
                                targetRelationshipId: edgeId,
                              })
                            : undefined
                        }
                        onDeleteConnection={(edgeId) =>
                          canEdit
                            ? applyGraphChangeWithPermissions((current) => deleteEdge(current, edgeId), {
                                actionType: 'delete_relationship',
                                summary: `Disconnect one relationship from ${displayName(selectedPerson)}.`,
                                targetPersonId: selectedPerson.id,
                                targetRelationshipId: edgeId,
                              })
                            : undefined
                        }
                        onAddConnectedPerson={(predicate, preferredName) => {
                          if (!canEdit) return
                          const result =
                            predicate === 'sibling'
                              ? addSiblingPerson(graph, selectedPerson, preferredName)
                              : predicate === 'child'
                                ? addParentPerson(graph, selectedPerson, preferredName)
                                : addConnectedPerson(graph, selectedPerson, predicate, preferredName)
                          const nextGraph = assignOwnerIfNeeded(result.graph, result.newPersonId)
                          if (canDirectlyApplyGraphChange(graphRef.current, nextGraph)) {
                            applyValidatedGraphChange(nextGraph)
                            setSelectedPersonId(result.newPersonId)
                            return
                          }
                          void queueGraphChangeRequest(nextGraph, {
                            actionType: 'create_person',
                            summary: `Add a connected person for ${displayName(selectedPerson)}.`,
                            targetPersonId: selectedPerson.id,
                          })
                        }}
                        onConnectExistingPerson={(targetId, predicate) =>
                          canEdit
                            ? applyGraphChangeWithPermissions((current) =>
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
                                {
                                  actionType: 'connect_people',
                                  summary: `Connect ${displayName(selectedPerson)} to another person.`,
                                  targetPersonId: selectedPerson.id,
                                }
                              )
                            : undefined
                        }
                        onUploadPhoto={async (file) => {
                          const nextPhoto = await uploadCompressedPersonPhoto(treeId, selectedPerson.id, file)
                          applyValidatedGraphChange((current) =>
                            updatePersonAttr(current, selectedPerson.id, 'photo', nextPhoto),
                          )
                        }}
                        onSoftDeletePerson={() =>
                          canEdit
                            ? applyGraphChangeWithPermissions((current) => softDeletePerson(current, selectedPerson.id), {
                                actionType: 'soft_delete_person',
                                summary: `Hide ${displayName(selectedPerson)}.`,
                                targetPersonId: selectedPerson.id,
                              })
                            : undefined
                        }
                        onHardDeletePerson={() =>
                          canEdit
                            ? applyGraphChangeWithPermissions((current) => hardDeletePerson(current, selectedPerson.id), {
                                actionType: 'delete_person',
                                summary: `Delete ${displayName(selectedPerson)}.`,
                                targetPersonId: selectedPerson.id,
                              })
                            : undefined
                        }
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}

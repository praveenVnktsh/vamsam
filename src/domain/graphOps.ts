import ELK from 'elkjs/lib/elk.bundled.js'
import {
  Directionality,
  EdgePredicate,
  EntityType,
  PREDICATE_RULES,
  createEdge,
  createPersonEntity,
  getAttrNumber,
  getAttrString,
  isPersonEntity,
  type Edge,
  type GraphEntity,
  type GraphSchema,
} from './graph'

export type PersonView = {
  id: string
  label: string
  firstName: string
  lastName: string
  preferredName: string
  gender: string
  dob: string
  dod: string
  years: string
  branch: string
  roleLabel: string
  photo: string
  bio: string
  notes: string
  birthPlace: string
  currentResidence: string
  undergradSchool: string
  undergradDegree: string
  gradSchool: string
  fieldOfWork: string
  healthHistory: string
  x: number
  y: number
}

const LAYOUT_GRID_X = 24 / 10
const LAYOUT_GRID_Y = 24 / 7
const X_SCALE = 10
const Y_SCALE = 7

function snapLayoutValue(value: number, step: number) {
  return Math.round(value / step) * step
}

const elk = new ELK()

function yearFromDateValue(value: string): string {
  const trimmed = value.trim()
  const match = trimmed.match(/^(\d{4})/)
  return match?.[1] ?? ''
}

function deriveYears(dob: string, dod: string, fallback: string): string {
  const start = yearFromDateValue(dob)
  const end = yearFromDateValue(dod)

  if (start || end) {
    return `${start || '?'}-${end}`
  }

  return fallback
}

export function graphPeople(graph: GraphSchema): PersonView[] {
  return graph.entities.filter(isPersonEntity).map((entity) => ({
    dob: getAttrString(entity, 'dob'),
    dod: getAttrString(entity, 'dod'),
    years: deriveYears(
      getAttrString(entity, 'dob'),
      getAttrString(entity, 'dod'),
      getAttrString(entity, 'years'),
    ),
    id: entity.id,
    label: entity.label,
    firstName: getAttrString(entity, 'firstName'),
    lastName: getAttrString(entity, 'lastName'),
    preferredName: getAttrString(entity, 'preferredName') || entity.label,
    gender: getAttrString(entity, 'gender'),
    branch: getAttrString(entity, 'branch'),
    roleLabel: getAttrString(entity, 'roleLabel'),
    photo: getAttrString(entity, 'photo'),
    bio: getAttrString(entity, 'bio'),
    notes: getAttrString(entity, 'notes'),
    birthPlace: getAttrString(entity, 'birthPlace'),
    currentResidence: getAttrString(entity, 'currentResidence'),
    undergradSchool: getAttrString(entity, 'undergradSchool'),
    undergradDegree: getAttrString(entity, 'undergradDegree'),
    gradSchool: getAttrString(entity, 'gradSchool'),
    fieldOfWork: getAttrString(entity, 'fieldOfWork'),
    healthHistory: getAttrString(entity, 'healthHistory'),
    x: getAttrNumber(entity, 'x') ?? 50,
    y: getAttrNumber(entity, 'y') ?? 50,
  }))
}

export function personMap(people: PersonView[]): Map<string, PersonView> {
  return new Map(people.map((person) => [person.id, person]))
}

export function shouldTraversePredicate(
  predicate: EdgePredicate,
  includePartners: boolean,
  includeNonBlood: boolean,
  includeSiblings: boolean,
): boolean {
  if (predicate === EdgePredicate.PARTNER_OF && !includePartners) return false
  if (predicate === EdgePredicate.SIBLING_OF && !includeSiblings) return false
  if (
    (predicate === EdgePredicate.GUARDIAN_OF ||
      predicate === EdgePredicate.STEP_PARENT_OF) &&
    !includeNonBlood
  ) {
    return false
  }

  return true
}

export function visiblePersonIds(
  graph: GraphSchema,
  selectedPersonId: string,
  depth: number,
  showFullGraph: boolean,
  includePartners: boolean,
  includeNonBlood: boolean,
  includeSiblings: boolean,
): Set<string> {
  const people = graphPeople(graph)
  const map = personMap(people)

  if (!map.has(selectedPersonId)) {
    return new Set(people.map((person) => person.id))
  }

  if (showFullGraph) {
    return new Set(people.map((person) => person.id))
  }

  const adjacency = new Map<string, string[]>()

  for (const edge of graph.edges) {
    if (
      !shouldTraversePredicate(
        edge.predicate,
        includePartners,
        includeNonBlood,
        includeSiblings,
      )
    ) {
      continue
    }
    if (!map.has(edge.src) || !map.has(edge.dst)) continue

    adjacency.set(edge.src, [...(adjacency.get(edge.src) ?? []), edge.dst])
    adjacency.set(edge.dst, [...(adjacency.get(edge.dst) ?? []), edge.src])
  }

  const queue = [{ id: selectedPersonId, level: 0 }]
  const visited = new Set<string>([selectedPersonId])

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || current.level >= depth) continue

    for (const neighbor of adjacency.get(current.id) ?? []) {
      if (visited.has(neighbor)) continue
      visited.add(neighbor)
      queue.push({ id: neighbor, level: current.level + 1 })
    }
  }

  return visited
}

export function visibleEdges(
  graph: GraphSchema,
  visibleIds: Set<string>,
  includePartners: boolean,
  includeNonBlood: boolean,
  includeSiblings: boolean,
): Edge[] {
  return graph.edges.filter((edge) => {
    if (!visibleIds.has(edge.src) || !visibleIds.has(edge.dst)) return false
    return shouldTraversePredicate(
      edge.predicate,
      includePartners,
      includeNonBlood,
      includeSiblings,
    )
  })
}

export function updatePersonAttr(
  graph: GraphSchema,
  personId: string,
  key: string,
  value: string | number,
): GraphSchema {
  return {
    ...graph,
    entities: graph.entities.map((entity) => {
      if (entity.id !== personId || entity.entityType !== EntityType.PERSON) {
        return entity
      }

      const nextAttrs = { ...entity.attrs, [key]: value }
      const firstName =
        key === 'firstName' ? String(value) : getAttrString(entity, 'firstName')
      const lastName =
        key === 'lastName' ? String(value) : getAttrString(entity, 'lastName')
      const nextLabel =
        key === 'firstName' || key === 'lastName'
          ? `${firstName} ${lastName}`.trim() || entity.label
          : entity.label

      return {
        ...entity,
        label: nextLabel,
        attrs: nextAttrs,
      }
    }),
  }
}

export function updatePersonPosition(
  graph: GraphSchema,
  personId: string,
  x: number,
  y: number,
): GraphSchema {
  let next = updatePersonAttr(graph, personId, 'x', x)
  next = updatePersonAttr(next, personId, 'y', y)
  return next
}

export function updateEdge(
  graph: GraphSchema,
  edgeId: string,
  updates: Partial<Pick<Edge, 'src' | 'dst' | 'predicate' | 'notes' | 'qualifiers'>>,
): GraphSchema {
  return {
    ...graph,
    edges: graph.edges.map((edge) => {
      if (edge.id !== edgeId) return edge
      return createEdge({
        ...edge,
        ...updates,
        id: edge.id,
        src: updates.src ?? edge.src,
        dst: updates.dst ?? edge.dst,
        predicate: updates.predicate ?? edge.predicate,
      })
    }),
  }
}

export function deleteEdge(graph: GraphSchema, edgeId: string): GraphSchema {
  return {
    ...graph,
    edges: graph.edges.filter((edge) => edge.id !== edgeId),
  }
}

export function reverseEdge(graph: GraphSchema, edgeId: string): GraphSchema {
  const edge = graph.edges.find((candidate) => candidate.id === edgeId)
  if (!edge) return graph

  return updateEdge(graph, edgeId, {
    src: edge.dst,
    dst: edge.src,
  })
}

export function addConnection(
  graph: GraphSchema,
  src: string,
  dst: string,
  predicate: EdgePredicate,
): GraphSchema {
  if (src === dst) return graph

  const rule = PREDICATE_RULES[predicate]
  const exists = graph.edges.some((edge) => {
    if (edge.predicate !== predicate) return false
    if (edge.src === src && edge.dst === dst) return true
    return Boolean(rule?.symmetric && edge.src === dst && edge.dst === src)
  })
  if (exists) return graph

  const newEdge = createEdge({
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `edge:${crypto.randomUUID().slice(0, 8)}`
        : `edge:${Date.now()}`,
    src,
    dst,
    predicate,
    qualifiers:
      predicate === EdgePredicate.PARENT_OF ? { kind: 'biological' } : undefined,
  })

  return {
    ...graph,
    edges: [...graph.edges, newEdge],
  }
}

export function addConnectedPerson(
  graph: GraphSchema,
  selectedPerson: PersonView,
  predicate: EdgePredicate,
  preferredName: string,
): { graph: GraphSchema; newPersonId: string } {
  const entityId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `person:${crypto.randomUUID().slice(0, 8)}`
      : `person:${Date.now()}`
  const cleanName = preferredName.trim() || 'New Person'
  const x = selectedPerson.x + 10
  const y =
    predicate === EdgePredicate.PARENT_OF
      ? selectedPerson.y + 12
      : predicate === EdgePredicate.PARTNER_OF
        ? selectedPerson.y
        : selectedPerson.y + 4

  const newPerson = createPersonEntity({
    id: entityId,
    label: cleanName,
    attrs: {
      firstName: cleanName,
      lastName: '',
      preferredName: cleanName,
      gender: '',
      dob: '',
      dod: '',
      branch: selectedPerson.branch,
      roleLabel: 'New connection',
      photo: cleanName
        .split(/\s+/)
        .map((part) => part[0] ?? '')
        .join('')
        .slice(0, 2)
        .toUpperCase(),
      bio: '',
      notes: '',
      birthPlace: '',
      currentResidence: '',
      x,
      y,
    },
  })

  return {
    graph: addConnection(
      {
        ...graph,
        entities: [...graph.entities, newPerson],
      },
      selectedPerson.id,
      entityId,
      predicate,
    ),
    newPersonId: entityId,
  }
}

export function addRelative(
  graph: GraphSchema,
  selectedPerson: PersonView,
  type: 'child' | 'partner',
): { graph: GraphSchema; newPersonId: string } {
  const entityId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `person:${crypto.randomUUID().slice(0, 8)}`
      : `person:${Date.now()}`
  const personCount = graph.entities.filter(isPersonEntity).length
  const x =
    type === 'child'
      ? Math.min(selectedPerson.x + 8 + ((personCount % 4) * 4), 92)
      : Math.min(selectedPerson.x + 16, 92)
  const y = type === 'child' ? Math.min(selectedPerson.y + 18, 92) : selectedPerson.y

  const newPerson = createPersonEntity({
    id: entityId,
    label: type === 'child' ? 'New Child' : 'New Partner',
    attrs: {
      firstName: 'New',
      lastName: selectedPerson.lastName,
      preferredName: type === 'child' ? 'New Child' : 'New Partner',
      years: type === 'child' ? '2026-' : '',
      branch: type === 'child' ? 'Next generation' : selectedPerson.branch,
      roleLabel: type === 'child' ? 'Child' : 'Partner',
      photo: type === 'child' ? 'NC' : 'NP',
      bio: 'Replace this stub with real profile data.',
      notes: 'Locally created graph entity.',
      birthPlace: '',
      x,
      y,
    },
  })

  const newEdge = createEdge({
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `edge:${crypto.randomUUID().slice(0, 8)}`
        : `edge:${Date.now()}`,
    src: selectedPerson.id,
    dst: entityId,
    predicate: type === 'child' ? EdgePredicate.PARENT_OF : EdgePredicate.PARTNER_OF,
    qualifiers: type === 'child' ? { kind: 'biological' } : { status: 'current' },
  })

  return {
    graph: {
      ...graph,
      entities: [...graph.entities, newPerson],
      edges: [...graph.edges, newEdge],
    },
    newPersonId: entityId,
  }
}

function heuristicAutoLayoutGraph(
  graph: GraphSchema,
  scopedIds?: ReadonlySet<string>,
  options?: { compact?: boolean },
): GraphSchema {
  const compact = options?.compact ?? false
  const startX = 12
  const startY = 16
  const rowGap = compact ? 20 : 28
  const nodeGap = compact ? 16 : 20
  const groupGap = compact ? 8 : 12
  const blockGapX = compact ? 18 : 28
  const blockGapY = compact ? 22 : 32
  const maxBlockRowWidth = compact ? 132 : 180

  const people = graphPeople(graph).filter(
    (person) => !scopedIds || scopedIds.has(person.id),
  )
  const personIds = new Set(people.map((person) => person.id))
  const allRelationshipEdges = graph.edges.filter(
    (edge) => personIds.has(edge.src) && personIds.has(edge.dst),
  )
  const parentEdges = graph.edges.filter(
    (edge) => edge.predicate === EdgePredicate.PARENT_OF && personIds.has(edge.dst),
  )
  const partnerEdges = graph.edges.filter(
    (edge) =>
      edge.predicate === EdgePredicate.PARTNER_OF &&
      personIds.has(edge.src) &&
      personIds.has(edge.dst),
  )

  const adjacency = new Map<string, string[]>()
  for (const person of people) {
    adjacency.set(person.id, [])
  }
  for (const edge of allRelationshipEdges) {
    adjacency.set(edge.src, [...(adjacency.get(edge.src) ?? []), edge.dst])
    adjacency.set(edge.dst, [...(adjacency.get(edge.dst) ?? []), edge.src])
  }

  const components: PersonView[][] = []
  const seen = new Set<string>()
  const peopleById = personMap(people)

  for (const person of [...people].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (seen.has(person.id)) continue

    const stack = [person.id]
    const component: PersonView[] = []

    while (stack.length > 0) {
      const current = stack.pop()
      if (!current || seen.has(current)) continue
      seen.add(current)
      const currentPerson = peopleById.get(current)
      if (currentPerson) component.push(currentPerson)

      for (const neighbor of adjacency.get(current) ?? []) {
        if (!seen.has(neighbor)) stack.push(neighbor)
      }
    }

    components.push(component)
  }

  const rows = new Map<number, PersonView[]>()
  const positions = new Map<string, { x: number; y: number }>()
  const laidOutComponents = components.map((component) => {
    const componentIds = new Set(component.map((person) => person.id))
    const componentParentEdges = parentEdges.filter(
      (edge) => componentIds.has(edge.src) && componentIds.has(edge.dst),
    )
    const componentPartnerEdges = partnerEdges.filter(
      (edge) => componentIds.has(edge.src) && componentIds.has(edge.dst),
    )

    const childrenByParent = new Map<string, string[]>()
    const parentsByChild = new Map<string, string[]>()
    for (const edge of componentParentEdges) {
      childrenByParent.set(edge.src, [...(childrenByParent.get(edge.src) ?? []), edge.dst])
      parentsByChild.set(edge.dst, [...(parentsByChild.get(edge.dst) ?? []), edge.src])
    }

    const generation = new Map<string, number>()
    for (const person of component) {
      generation.set(person.id, 0)
    }

    const partnerAdjacency = new Map<string, string[]>()
    for (const edge of componentPartnerEdges) {
      partnerAdjacency.set(edge.src, [...(partnerAdjacency.get(edge.src) ?? []), edge.dst])
      partnerAdjacency.set(edge.dst, [...(partnerAdjacency.get(edge.dst) ?? []), edge.src])
    }

    let changed = true
    let passes = 0
    while (changed && passes < component.length * 4) {
      changed = false
      passes += 1

      for (const edge of componentParentEdges) {
        const parentGeneration = generation.get(edge.src) ?? 0
        const childGeneration = generation.get(edge.dst) ?? 0
        const nextGeneration = parentGeneration + 1

        if (nextGeneration > childGeneration) {
          generation.set(edge.dst, nextGeneration)
          changed = true
        }
      }

      for (const edge of componentPartnerEdges) {
        const srcGeneration = generation.get(edge.src) ?? 0
        const dstGeneration = generation.get(edge.dst) ?? 0
        const sharedGeneration = Math.max(srcGeneration, dstGeneration)

        if (srcGeneration !== sharedGeneration) {
          generation.set(edge.src, sharedGeneration)
          changed = true
        }
        if (dstGeneration !== sharedGeneration) {
          generation.set(edge.dst, sharedGeneration)
          changed = true
        }
      }
    }

    const partnerGroupByPerson = new Map<string, string>()
    for (const person of component) {
      if (partnerGroupByPerson.has(person.id)) continue
      const groupId = `group:${person.id}`
      const stack = [person.id]
      while (stack.length > 0) {
        const current = stack.pop()
        if (!current || partnerGroupByPerson.has(current)) continue
        partnerGroupByPerson.set(current, groupId)
        for (const neighbor of partnerAdjacency.get(current) ?? []) {
          if (!partnerGroupByPerson.has(neighbor)) stack.push(neighbor)
        }
      }
    }

    rows.clear()
    for (const person of component) {
      const row = generation.get(person.id) ?? 0
      rows.set(row, [...(rows.get(row) ?? []), person])
    }

    const localPositions = new Map<string, { x: number; y: number }>()
    const rowEntries = Array.from(rows.entries()).sort((a, b) => a[0] - b[0])
    let componentWidth = 0

    for (const [rowIndex, rowPeople] of rowEntries) {
      const groups = new Map<string, PersonView[]>()

      for (const person of rowPeople.sort((a, b) => a.x - b.x)) {
        const groupId = partnerGroupByPerson.get(person.id) ?? `group:${person.id}`
        groups.set(groupId, [...(groups.get(groupId) ?? []), person])
      }

      const orderedGroups = Array.from(groups.values())
        .map((group) => {
          const orderedPeople = [...group].sort((a, b) => a.x - b.x)
          const parentAnchors = orderedPeople.flatMap((person) =>
            (parentsByChild.get(person.id) ?? [])
              .map((parentId) => localPositions.get(parentId)?.x)
              .filter((value): value is number => value !== undefined),
          )

          const anchorX =
            parentAnchors.length > 0
              ? parentAnchors.reduce((sum, value) => sum + value, 0) / parentAnchors.length
              : Math.min(...orderedPeople.map((person) => person.x))

          const width = Math.max((orderedPeople.length - 1) * nodeGap, 0)

          return { orderedPeople, anchorX, width }
        })
        .sort((a, b) => a.anchorX - b.anchorX)

      let cursorX = 0
      for (const group of orderedGroups) {
        const desiredStartX = Math.max(group.anchorX - group.width / 2, 0)
        const groupStartX = Math.max(cursorX, desiredStartX)
        for (const [index, person] of group.orderedPeople.entries()) {
          localPositions.set(person.id, {
            x: groupStartX + index * nodeGap,
            y: rowIndex * rowGap,
          })
        }
        cursorX =
          groupStartX +
          Math.max(group.orderedPeople.length * nodeGap + groupGap, nodeGap + groupGap)
      }

      componentWidth = Math.max(componentWidth, Math.max(cursorX - groupGap, nodeGap))
    }

    const componentHeight = Math.max((rowEntries.length - 1) * rowGap, 0)

    return {
      people: component,
      positions: localPositions,
      width: componentWidth,
      height: componentHeight,
      minX: Math.min(...component.map((person) => person.x)),
      minY: Math.min(...component.map((person) => person.y)),
    }
  })

  laidOutComponents.sort((a, b) => a.minY - b.minY || a.minX - b.minX)

  let blockCursorX = startX
  let blockCursorY = startY
  let currentRowHeight = 0

  for (const component of laidOutComponents) {
    if (
      blockCursorX > startX &&
      blockCursorX + component.width > startX + maxBlockRowWidth
    ) {
      blockCursorX = startX
      blockCursorY += currentRowHeight + blockGapY
      currentRowHeight = 0
    }

    for (const person of component.people) {
      const position = component.positions.get(person.id)
      if (!position) continue
      positions.set(person.id, {
        x: snapLayoutValue(blockCursorX + position.x, LAYOUT_GRID_X),
        y: snapLayoutValue(blockCursorY + position.y, LAYOUT_GRID_Y),
      })
    }

    blockCursorX += component.width + blockGapX
    currentRowHeight = Math.max(currentRowHeight, component.height)
  }

  return {
    ...graph,
    entities: graph.entities.map((entity) => {
      if (!isPersonEntity(entity)) return entity
      const position = positions.get(entity.id)
      if (!position) return entity

      return {
        ...entity,
        attrs: {
          ...entity.attrs,
          x: position.x,
          y: position.y,
        },
      }
    }),
  }
}

type AutoLayoutOptions = {
  compact?: boolean
  layoutMode?: 'person' | 'family'
}

type LayoutNodeSpec = {
  id: string
  width: number
  height: number
}

type FamilyUnitSpec = {
  id: string
  memberIds: string[]
}

type ElkNodeLike = {
  id: string
  x?: number
  y?: number
  children?: ElkNodeLike[]
}

export async function autoLayoutGraph(
  graph: GraphSchema,
  scopedIds?: ReadonlySet<string>,
  options?: AutoLayoutOptions,
): Promise<GraphSchema> {
  const compact = options?.compact ?? false
  const layoutMode = options?.layoutMode ?? 'person'
  const people = graphPeople(graph).filter((person) => !scopedIds || scopedIds.has(person.id))

  if (people.length === 0) {
    return graph
  }

  try {
    const visiblePersonIds = new Set(people.map((person) => person.id))
    const visibleEdges = graph.edges.filter(
      (edge) => visiblePersonIds.has(edge.src) && visiblePersonIds.has(edge.dst),
    )

    const partnerEdges = visibleEdges.filter(
      (edge) => edge.predicate === EdgePredicate.PARTNER_OF,
    )

    const partnerEdgesByPerson = new Map<string, typeof partnerEdges>()
    for (const edge of partnerEdges) {
      partnerEdgesByPerson.set(edge.src, [...(partnerEdgesByPerson.get(edge.src) ?? []), edge])
      partnerEdgesByPerson.set(edge.dst, [...(partnerEdgesByPerson.get(edge.dst) ?? []), edge])
    }

    const familyUnits: FamilyUnitSpec[] = []
    const nodeIdByPerson = new Map<string, string>()

    if (layoutMode === 'family') {
      for (const edge of partnerEdges) {
        const srcPartnerEdges = partnerEdgesByPerson.get(edge.src) ?? []
        const dstPartnerEdges = partnerEdgesByPerson.get(edge.dst) ?? []
        if (srcPartnerEdges.length !== 1 || dstPartnerEdges.length !== 1) continue
        if (nodeIdByPerson.has(edge.src) || nodeIdByPerson.has(edge.dst)) continue

        const unitId = `family:${edge.id}`
        familyUnits.push({ id: unitId, memberIds: [edge.src, edge.dst] })
        nodeIdByPerson.set(edge.src, unitId)
        nodeIdByPerson.set(edge.dst, unitId)
      }
    }

    for (const person of people) {
      if (!nodeIdByPerson.has(person.id)) {
        nodeIdByPerson.set(person.id, person.id)
      }
    }

    const layoutNodes = new Map<string, LayoutNodeSpec>()
    for (const person of people) {
      const nodeId = nodeIdByPerson.get(person.id) ?? person.id
      if (layoutNodes.has(nodeId)) continue
      const isFamilyNode = nodeId.startsWith('family:')
      layoutNodes.set(nodeId, {
        id: nodeId,
        width: isFamilyNode ? (compact ? 32 : 40) : compact ? 18 : 22,
        height: isFamilyNode ? (compact ? 12 : 14) : compact ? 9 : 10,
      })
    }

    const layoutEdges = new Map<string, { id: string; sources: string[]; targets: string[] }>()
    for (const edge of visibleEdges) {
      const sourceId = nodeIdByPerson.get(edge.src) ?? edge.src
      const targetId = nodeIdByPerson.get(edge.dst) ?? edge.dst
      if (sourceId === targetId) continue

      if (edge.predicate === EdgePredicate.PARTNER_OF && layoutMode === 'family') {
        continue
      }

      const dedupeId = `${edge.predicate}:${sourceId}->${targetId}`
      if (!layoutEdges.has(dedupeId)) {
        layoutEdges.set(dedupeId, {
          id: dedupeId,
          sources: [sourceId],
          targets: [targetId],
        })
      }
    }

    const elkGraph = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'DOWN',
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
        'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
        'elk.spacing.nodeNode': String(compact ? 24 : 34),
        'elk.layered.spacing.nodeNodeBetweenLayers': String(compact ? 34 : 50),
        'elk.padding': '[top=20,left=20,bottom=20,right=20]',
      },
      children: Array.from(layoutNodes.values()).map((node) => ({
        id: node.id,
        width: node.width * X_SCALE,
        height: node.height * Y_SCALE,
      })),
      edges: Array.from(layoutEdges.values()),
    }

    const laidOut = (await elk.layout(elkGraph as never)) as unknown as ElkNodeLike & {
      children?: Array<ElkNodeLike & { width?: number; height?: number }>
    }

    const nodePositions = new Map<string, { x: number; y: number }>()
    for (const child of laidOut.children ?? []) {
      nodePositions.set(child.id, {
        x: snapLayoutValue((child.x ?? 0) / X_SCALE, LAYOUT_GRID_X),
        y: snapLayoutValue((child.y ?? 0) / Y_SCALE, LAYOUT_GRID_Y),
      })
    }

    // Partner relationships are not hierarchical; keep them on the same layer
    // after ELK computes the directed parent/child structure.
    for (const edge of partnerEdges) {
      const sourceId = nodeIdByPerson.get(edge.src) ?? edge.src
      const targetId = nodeIdByPerson.get(edge.dst) ?? edge.dst
      if (sourceId === targetId) continue

      const sourcePosition = nodePositions.get(sourceId)
      const targetPosition = nodePositions.get(targetId)
      if (!sourcePosition || !targetPosition) continue

      const sharedY = snapLayoutValue(
        (sourcePosition.y + targetPosition.y) / 2,
        LAYOUT_GRID_Y,
      )

      nodePositions.set(sourceId, { ...sourcePosition, y: sharedY })
      nodePositions.set(targetId, { ...targetPosition, y: sharedY })
    }

    return {
      ...graph,
      entities: graph.entities.map((entity) => {
        if (!isPersonEntity(entity)) return entity
        const nodeId = nodeIdByPerson.get(entity.id) ?? entity.id
        const position = nodePositions.get(nodeId)
        if (!position) return entity

        if (!nodeId.startsWith('family:')) {
          return {
            ...entity,
            attrs: {
              ...entity.attrs,
              x: position.x,
              y: position.y,
            },
          }
        }

        const unit = familyUnits.find((family) => family.id === nodeId)
        const memberIndex = unit?.memberIds.indexOf(entity.id) ?? -1
        const offset = compact ? 8 : 10

        return {
          ...entity,
          attrs: {
            ...entity.attrs,
            x: snapLayoutValue(
              position.x + (memberIndex === 0 ? -offset / 2 : offset / 2),
              LAYOUT_GRID_X,
            ),
            y: position.y,
          },
        }
      }),
    }
  } catch {
    return heuristicAutoLayoutGraph(graph, scopedIds, { compact })
  }
}

export function personConnections(
  graph: GraphSchema,
  personId: string,
  visibleOnly?: Set<string>,
): Array<{ edge: Edge; person: PersonView }> {
  const people = personMap(graphPeople(graph))

  return graph.edges
    .filter((edge) => edge.src === personId || edge.dst === personId)
    .filter((edge) => !visibleOnly || (visibleOnly.has(edge.src) && visibleOnly.has(edge.dst)))
    .map((edge) => {
      const relatedId = edge.src === personId ? edge.dst : edge.src
      const person = people.get(relatedId)
      return person ? { edge, person } : null
    })
    .filter(Boolean) as Array<{ edge: Edge; person: PersonView }>
}

export function predicateLabel(predicate: EdgePredicate): string {
  return predicate.replaceAll('_', ' ')
}

export function shortestPersonPath(
  graph: GraphSchema,
  fromId: string,
  toId: string,
): string[] {
  if (fromId === toId) return [fromId]

  const people = new Set(graph.entities.filter(isPersonEntity).map((entity) => entity.id))
  if (!people.has(fromId) || !people.has(toId)) return []

  const adjacency = new Map<string, string[]>()
  for (const edge of graph.edges) {
    if (!people.has(edge.src) || !people.has(edge.dst)) continue
    adjacency.set(edge.src, [...(adjacency.get(edge.src) ?? []), edge.dst])
    adjacency.set(edge.dst, [...(adjacency.get(edge.dst) ?? []), edge.src])
  }

  const queue = [fromId]
  const previous = new Map<string, string | null>([[fromId, null]])

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue

    for (const neighbor of adjacency.get(current) ?? []) {
      if (previous.has(neighbor)) continue
      previous.set(neighbor, current)
      if (neighbor === toId) {
        const path: string[] = []
        let cursor: string | null = toId
        while (cursor) {
          path.unshift(cursor)
          cursor = previous.get(cursor) ?? null
        }
        return path
      }
      queue.push(neighbor)
    }
  }

  return []
}

export function shortestBloodPath(
  graph: GraphSchema,
  fromId: string,
  toId: string,
): string[] {
  if (fromId === toId) return [fromId]

  const people = new Set(graph.entities.filter(isPersonEntity).map((entity) => entity.id))
  if (!people.has(fromId) || !people.has(toId)) return []

  const adjacency = new Map<string, string[]>()
  for (const edge of graph.edges) {
    if (!people.has(edge.src) || !people.has(edge.dst)) continue
    if (
      edge.predicate !== EdgePredicate.PARENT_OF &&
      edge.predicate !== EdgePredicate.SIBLING_OF
    ) {
      continue
    }

    adjacency.set(edge.src, [...(adjacency.get(edge.src) ?? []), edge.dst])
    adjacency.set(edge.dst, [...(adjacency.get(edge.dst) ?? []), edge.src])
  }

  const queue = [fromId]
  const previous = new Map<string, string | null>([[fromId, null]])

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue

    for (const neighbor of adjacency.get(current) ?? []) {
      if (previous.has(neighbor)) continue
      previous.set(neighbor, current)
      if (neighbor === toId) {
        const path: string[] = []
        let cursor: string | null = toId
        while (cursor) {
          path.unshift(cursor)
          cursor = previous.get(cursor) ?? null
        }
        return path
      }
      queue.push(neighbor)
    }
  }

  return []
}

export function relationshipExplanation(
  graph: GraphSchema,
  fromId: string,
  toId: string,
): string {
  const resolved = resolveRelationship(graph, fromId, toId)
  if (resolved.label) {
    return resolved.tamilLabel
      ? `${resolved.label} (${resolved.tamilLabel})`
      : resolved.label
  }

  const people = personMap(graphPeople(graph))
  const path = shortestPersonPath(graph, fromId, toId)
  if (path.length === 0) return 'No relationship path found in the current graph.'

  if (path.length === 1) return `${people.get(fromId)?.preferredName ?? 'This person'} is the selected person.`

  const segments: string[] = []

  for (let index = 0; index < path.length - 1; index += 1) {
    const current = path[index]
    const next = path[index + 1]
    const edge = graph.edges.find(
      (candidate) =>
        (candidate.src === current && candidate.dst === next) ||
        (candidate.src === next && candidate.dst === current),
    )
    const currentPerson = people.get(current)
    const nextPerson = people.get(next)
    if (!edge || !currentPerson || !nextPerson) continue

    segments.push(`${currentPerson.preferredName} -> ${predicateLabel(edge.predicate)} -> ${nextPerson.preferredName}`)
  }

  return segments.join(' / ')
}

function getDirectRelationship(graph: GraphSchema, fromId: string, toId: string) {
  return graph.edges.find(
    (candidate) =>
      (candidate.src === fromId && candidate.dst === toId) ||
      (candidate.src === toId && candidate.dst === fromId),
  )
}

function inferGenderLabel(gender: string, maleLabel: string, femaleLabel: string, fallback: string) {
  const normalized = gender.trim().toLowerCase()
  if (normalized === 'male') return maleLabel
  if (normalized === 'female') return femaleLabel
  return fallback
}

function isParentOf(graph: GraphSchema, parentId: string, childId: string) {
  return graph.edges.some(
    (edge) => edge.predicate === EdgePredicate.PARENT_OF && edge.src === parentId && edge.dst === childId,
  )
}

function parentIdsOf(graph: GraphSchema, personId: string): string[] {
  return graph.edges
    .filter((edge) => edge.predicate === EdgePredicate.PARENT_OF && edge.dst === personId)
    .map((edge) => edge.src)
}

function partnerIdsOf(graph: GraphSchema, personId: string): string[] {
  return graph.edges
    .filter(
      (edge) =>
        edge.predicate === EdgePredicate.PARTNER_OF &&
        (edge.src === personId || edge.dst === personId),
    )
    .map((edge) => (edge.src === personId ? edge.dst : edge.src))
}

function siblingIdsOf(graph: GraphSchema, personId: string): string[] {
  const explicit = graph.edges
    .filter(
      (edge) =>
        edge.predicate === EdgePredicate.SIBLING_OF &&
        (edge.src === personId || edge.dst === personId),
    )
    .map((edge) => (edge.src === personId ? edge.dst : edge.src))

  const parents = new Set(parentIdsOf(graph, personId))
  const inferred = graph.edges
    .filter(
      (edge) => edge.predicate === EdgePredicate.PARENT_OF && parents.has(edge.src) && edge.dst !== personId,
    )
    .map((edge) => edge.dst)

  return Array.from(new Set([...explicit, ...inferred]))
}

export function resolveRelationship(
  graph: GraphSchema,
  fromId: string,
  toId: string,
): { label: string; tamilLabel?: string; path: string[] } {
  const people = personMap(graphPeople(graph))
  const from = people.get(fromId)
  const to = people.get(toId)
  const path = shortestPersonPath(graph, fromId, toId)

  if (!from || !to) return { label: '', path }
  if (fromId === toId) return { label: 'same person', path }

  const direct = getDirectRelationship(graph, fromId, toId)
  if (direct?.predicate === EdgePredicate.PARTNER_OF) {
    return { label: 'spouse / partner', path }
  }
  if (direct?.predicate === EdgePredicate.SIBLING_OF) {
    return { label: 'sibling', path }
  }
  if (direct?.predicate === EdgePredicate.PARENT_OF && direct.src === fromId) {
    return {
      label: inferGenderLabel(from.gender, 'father', 'mother', 'parent'),
      path,
    }
  }
  if (direct?.predicate === EdgePredicate.PARENT_OF && direct.dst === fromId) {
    return {
      label: inferGenderLabel(from.gender, 'son', 'daughter', 'child'),
      path,
    }
  }

  if (isParentOf(graph, fromId, toId)) {
    return { label: inferGenderLabel(from.gender, 'father', 'mother', 'parent'), path }
  }
  if (isParentOf(graph, toId, fromId)) {
    return { label: inferGenderLabel(from.gender, 'son', 'daughter', 'child'), path }
  }

  const toParents = parentIdsOf(graph, toId)
  if (toParents.some((parentId) => isParentOf(graph, fromId, parentId))) {
    return { label: 'grandparent', path }
  }

  const fromParents = parentIdsOf(graph, fromId)
  if (fromParents.some((parentId) => isParentOf(graph, toId, parentId))) {
    return { label: 'grandchild', path }
  }

  const fromSiblings = new Set(siblingIdsOf(graph, fromId))
  if (toParents.some((parentId) => fromSiblings.has(parentId))) {
    const parent = toParents.find((parentId) => fromSiblings.has(parentId))
    const parentPerson = parent ? people.get(parent) : undefined
    const isMaternal = parentPerson?.gender.trim().toLowerCase() === 'female'
    return {
      label: inferGenderLabel(from.gender, 'uncle', 'aunt', 'aunt / uncle'),
      tamilLabel: inferGenderLabel(
        from.gender,
        isMaternal ? 'mama' : 'mama',
        isMaternal ? 'chitti' : 'athai',
        'relative',
      ),
      path,
    }
  }

  for (const parentId of toParents) {
    const parentSiblings = siblingIdsOf(graph, parentId)
    if (parentSiblings.some((siblingId) => partnerIdsOf(graph, siblingId).includes(fromId))) {
      const parent = people.get(parentId)
      const isMaternal = parent?.gender.trim().toLowerCase() === 'female'
      return {
        label: inferGenderLabel(from.gender, 'uncle by marriage', 'aunt by marriage', 'in-law'),
        tamilLabel: inferGenderLabel(
          from.gender,
          isMaternal ? 'athimber' : 'athimber',
          isMaternal ? 'mami' : 'mami',
          'in-law',
        ),
        path,
      }
    }
  }

  const fromParentsSet = new Set(fromParents)
  if (parentIdsOf(graph, toId).some((parentId) => fromParentsSet.has(parentId))) {
    return { label: 'sibling', path }
  }

  const toAuntUncleIds = new Set(
    toParents.flatMap((parentId) => [
      ...siblingIdsOf(graph, parentId),
      ...siblingIdsOf(graph, parentId).flatMap((siblingId) => partnerIdsOf(graph, siblingId)),
    ]),
  )
  if (parentIdsOf(graph, fromId).some((parentId) => toAuntUncleIds.has(parentId))) {
    return { label: 'cousin', path }
  }

  return { label: '', path }
}

export function graphHasRenderablePeople(graph: GraphSchema): boolean {
  return graph.entities.some((entity: GraphEntity) => entity.entityType === EntityType.PERSON)
}

export function edgeClassName(predicate: EdgePredicate): string {
  if (predicate === EdgePredicate.PARENT_OF) return 'edge-parent_of'
  if (predicate === EdgePredicate.PARTNER_OF) return 'edge-partner_of'
  if (
    predicate === EdgePredicate.GUARDIAN_OF ||
    predicate === EdgePredicate.STEP_PARENT_OF
  ) {
    return 'edge-guardian_of'
  }

  return 'edge-generic'
}

export function edgeMarker(predicate: EdgePredicate): Directionality {
  return predicate === EdgePredicate.PARTNER_OF
    ? Directionality.UNDIRECTED
    : Directionality.DIRECTED
}

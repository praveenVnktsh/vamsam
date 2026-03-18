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
import {
  labelsForRelation,
  type CanonicalRelationKey,
  type KinshipLabelSet,
} from './kinship'

function getAttrStringArray(entity: GraphEntity, key: string): string[] {
  const value = entity.attrs[key]
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

export type PersonView = {
  id: string
  label: string
  firstName: string
  nickname: string
  lastName: string
  sex: string
  dob: string
  dod: string
  years: string
  branch: string
  photo: string
  birthPlace: string
  currentResidence: string
  privateNotes: string
  links: string[]
  x: number
  y: number
}

export type ResolvedRelationship = {
  key?: CanonicalRelationKey
  label: string
  labels?: KinshipLabelSet
  path: string[]
  socialLabel?: string
}

const LAYOUT_GRID_X = 24 / 10
const LAYOUT_GRID_Y = 24 / 7
const X_SCALE = 10
const Y_SCALE = 7

function snapLayoutValue(value: number, step: number) {
  return Math.round(value / step) * step
}

const elk = new ELK()
const PERSON_LAYOUT_WIDTH = 18
const FAMILY_LAYOUT_WIDTH = 34
const PERSON_LAYOUT_HEIGHT = 10
const FAMILY_LAYOUT_HEIGHT = 14

function yearFromDateValue(value: string): string {
  const trimmed = value.trim()
  const match = trimmed.match(/^(\d{4})/)
  return match?.[1] ?? ''
}

function deriveAge(dob: string): string {
  const trimmed = dob.trim()
  const match = trimmed.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/)
  if (!match) return ''

  const birthYear = Number(match[1])
  const birthMonth = match[2] ? Number(match[2]) : null
  const birthDay = match[3] ? Number(match[3]) : null
  const now = new Date()

  let age = now.getFullYear() - birthYear

  if (birthMonth !== null) {
    const monthIndex = birthMonth - 1
    const currentMonth = now.getMonth()
    const currentDay = now.getDate()
    if (
      currentMonth < monthIndex ||
      (currentMonth === monthIndex && birthDay !== null && currentDay < birthDay)
    ) {
      age -= 1
    }
  }

  return age >= 0 ? `Age ${age}` : ''
}

function deriveYears(dob: string, dod: string, fallback: string): string {
  if (dob.trim() && !dod.trim()) {
    const age = deriveAge(dob)
    if (age) return age
  }

  const start = yearFromDateValue(dob)
  const end = yearFromDateValue(dod)

  if (start || end) {
    return `${start || '?'} - ${end}`
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
    nickname: getAttrString(entity, 'nickname'),
    lastName: getAttrString(entity, 'lastName'),
    sex: getAttrString(entity, 'sex') || getAttrString(entity, 'gender'),
    branch: getAttrString(entity, 'branch'),
    photo: getAttrString(entity, 'photo'),
    birthPlace: getAttrString(entity, 'birthPlace'),
    currentResidence: getAttrString(entity, 'currentResidence'),
    privateNotes: getAttrString(entity, 'privateNotes') || getAttrString(entity, 'notes'),
    links: getAttrStringArray(entity, 'links'),
    x: getAttrNumber(entity, 'x') ?? 50,
    y: getAttrNumber(entity, 'y') ?? 50,
  }))
}

export function personMap(people: PersonView[]): Map<string, PersonView> {
  return new Map(people.map((person) => [person.id, person]))
}

export function displayName(
  person: Pick<PersonView, 'nickname' | 'firstName' | 'label'>,
): string {
  return person.nickname.trim() || person.firstName.trim() || person.label
}

function possessiveName(name: string): string {
  const trimmed = name.trim() || 'Person'
  return trimmed.endsWith('s') ? `${trimmed}'` : `${trimmed}'s`
}

function placeholderRelativeName(
  person: Pick<PersonView, 'nickname' | 'firstName' | 'label'>,
  relation: string,
): string {
  return `${possessiveName(displayName(person))} ${relation}`
}

export function fullName(
  person: Pick<PersonView, 'firstName' | 'lastName' | 'label'>,
): string {
  const combined = `${person.firstName.trim()} ${person.lastName.trim()}`.trim()
  return combined || person.label
}

export function shouldTraversePredicate(
  predicate: EdgePredicate,
  includePartners: boolean,
  includeNonBlood: boolean,
): boolean {
  if (predicate === EdgePredicate.PARTNER_OF && !includePartners) return false
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

export function expandNeighborhood(
  graph: GraphSchema,
  seedIds: Iterable<string>,
  depth: number,
  includePartners: boolean,
  includeNonBlood: boolean,
): Set<string> {
  const people = graphPeople(graph)
  const map = personMap(people)
  const adjacency = new Map<string, string[]>()

  for (const edge of graph.edges) {
    if (!shouldTraversePredicate(edge.predicate, includePartners, includeNonBlood)) continue
    if (!map.has(edge.src) || !map.has(edge.dst)) continue

    adjacency.set(edge.src, [...(adjacency.get(edge.src) ?? []), edge.dst])
    adjacency.set(edge.dst, [...(adjacency.get(edge.dst) ?? []), edge.src])
  }

  const queue: Array<{ id: string; level: number }> = []
  const visited = new Set<string>()

  for (const id of seedIds) {
    if (!map.has(id) || visited.has(id)) continue
    visited.add(id)
    queue.push({ id, level: 0 })
  }

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

export function descendantPersonIds(
  graph: GraphSchema,
  rootPersonId: string,
  includePartners: boolean,
): Set<string> {
  const people = graphPeople(graph)
  const map = personMap(people)

  if (!map.has(rootPersonId)) {
    return new Set(people.map((person) => person.id))
  }

  const childrenByParent = new Map<string, string[]>()
  for (const edge of graph.edges) {
    if (edge.predicate !== EdgePredicate.PARENT_OF) continue
    if (!map.has(edge.src) || !map.has(edge.dst)) continue
    childrenByParent.set(edge.src, [...(childrenByParent.get(edge.src) ?? []), edge.dst])
  }

  const visited = new Set<string>([rootPersonId])
  const queue = [rootPersonId]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue

    for (const childId of childrenByParent.get(current) ?? []) {
      if (visited.has(childId)) continue
      visited.add(childId)
      queue.push(childId)
    }
  }

  if (includePartners) {
    for (const edge of graph.edges) {
      if (edge.predicate !== EdgePredicate.PARTNER_OF) continue
      if (!map.has(edge.src) || !map.has(edge.dst)) continue
      if (visited.has(edge.src)) visited.add(edge.dst)
      if (visited.has(edge.dst)) visited.add(edge.src)
    }
  }

  return visited
}

export function visibleEdges(
  graph: GraphSchema,
  visibleIds: Set<string>,
  includePartners: boolean,
  includeNonBlood: boolean,
): Edge[] {
  return graph.edges.filter((edge) => {
    if (!visibleIds.has(edge.src) || !visibleIds.has(edge.dst)) return false
    return shouldTraversePredicate(
      edge.predicate,
      includePartners,
      includeNonBlood,
    )
  })
}

function isCoreRelationshipPredicate(predicate: EdgePredicate) {
  return (
    predicate === EdgePredicate.PARENT_OF ||
    predicate === EdgePredicate.PARTNER_OF
  )
}

export function sanitizeGraphForCoreRelationships(graph: GraphSchema): GraphSchema {
  return {
    ...graph,
    metadata: {
      ...graph.metadata,
      source: 'blank-slate-v2',
    },
    edges: graph.edges.filter((edge) => isCoreRelationshipPredicate(edge.predicate)),
  }
}

export function updatePersonAttr(
  graph: GraphSchema,
  personId: string,
  key: string,
  value: string | number | string[],
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

export function softDeletePerson(graph: GraphSchema, personId: string): GraphSchema {
  return {
    ...graph,
    entities: graph.entities.map((entity) => {
      if (entity.id !== personId || entity.entityType !== EntityType.PERSON) {
        return entity
      }

      return {
        ...entity,
        label: 'Deleted person',
        attrs: {
          ...entity.attrs,
          firstName: '',
          nickname: '',
          lastName: '',
          sex: '',
          dob: '',
          dod: '',
          branch: '',
          photo: 'DP',
          birthPlace: '',
          currentResidence: '',
          privateNotes: '',
          links: [],
        },
      }
    }),
  }
}

export function hardDeletePerson(graph: GraphSchema, personId: string): GraphSchema {
  return {
    ...graph,
    entities: graph.entities.filter((entity) => entity.id !== personId),
    edges: graph.edges.filter((edge) => edge.src !== personId && edge.dst !== personId),
  }
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
  if (!isCoreRelationshipPredicate(predicate)) return graph
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
  if (!isCoreRelationshipPredicate(predicate)) {
    return { graph, newPersonId: selectedPerson.id }
  }
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
      nickname: '',
      lastName: '',
      sex: '',
      dob: '',
      dod: '',
      branch: selectedPerson.branch,
      photo: cleanName
        .split(/\s+/)
        .map((part) => part[0] ?? '')
        .join('')
        .slice(0, 2)
        .toUpperCase(),
      birthPlace: '',
      currentResidence: '',
      privateNotes: '',
      links: [],
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

export function addSiblingPerson(
  graph: GraphSchema,
  selectedPerson: PersonView,
  preferredName: string,
): { graph: GraphSchema; newPersonId: string } {
  const siblingResult = addStandalonePerson(graph, preferredName.trim() || 'New Sibling')
  const nextGraph = connectPeopleAsSiblings(
    siblingResult.graph,
    selectedPerson.id,
    siblingResult.newPersonId,
  )

  return {
    graph: nextGraph,
    newPersonId: siblingResult.newPersonId,
  }
}

export function addParentPerson(
  graph: GraphSchema,
  selectedPerson: PersonView,
  preferredName: string,
): { graph: GraphSchema; newPersonId: string } {
  const parentResult = addStandalonePerson(
    graph,
    preferredName.trim() || placeholderRelativeName(selectedPerson, 'parent'),
  )
  const parentGraph = updatePersonPosition(
    parentResult.graph,
    parentResult.newPersonId,
    selectedPerson.x,
    Math.max(6, selectedPerson.y - 18),
  )

  return {
    graph: addConnection(
      parentGraph,
      parentResult.newPersonId,
      selectedPerson.id,
      EdgePredicate.PARENT_OF,
    ),
    newPersonId: parentResult.newPersonId,
  }
}

export function addStandalonePerson(
  graph: GraphSchema,
  preferredName: string,
): { graph: GraphSchema; newPersonId: string } {
  const entityId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `person:${crypto.randomUUID().slice(0, 8)}`
      : `person:${Date.now()}`
  const cleanName = preferredName.trim() || 'New Person'
  const personCount = graph.entities.filter(isPersonEntity).length
  const column = personCount % 4
  const row = Math.floor(personCount / 4)

  const newPerson = createPersonEntity({
    id: entityId,
    label: cleanName,
    attrs: {
      firstName: cleanName,
      nickname: '',
      lastName: '',
      sex: '',
      dob: '',
      dod: '',
      branch: '',
      photo: cleanName
        .split(/\s+/)
        .map((part) => part[0] ?? '')
        .join('')
        .slice(0, 2)
        .toUpperCase(),
      birthPlace: '',
      currentResidence: '',
      privateNotes: '',
      links: [],
      x: 24 + column * 18,
      y: 24 + row * 18,
    },
  })

  return {
    graph: {
      ...graph,
      entities: [...graph.entities, newPerson],
    },
    newPersonId: entityId,
  }
}

export function addRelative(
  graph: GraphSchema,
  selectedPerson: PersonView,
  type: 'parent' | 'child' | 'partner' | 'sibling',
): { graph: GraphSchema; newPersonId: string } {
  if (type === 'parent') {
    const parentResult = addParentPerson(
      graph,
      selectedPerson,
      placeholderRelativeName(selectedPerson, 'parent'),
    )

    const siblingUnitIds = [selectedPerson.id, ...siblingIdsOf(graph, selectedPerson.id)]
    const nextGraph = siblingUnitIds.reduce(
      (currentGraph, childId) =>
        addConnection(
          currentGraph,
          parentResult.newPersonId,
          childId,
          EdgePredicate.PARENT_OF,
        ),
      parentResult.graph,
    )

    return {
      graph: nextGraph,
      newPersonId: parentResult.newPersonId,
    }
  }

  if (type === 'sibling') {
    return addSiblingPerson(graph, selectedPerson, 'New Sibling')
  }

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
      nickname: '',
      lastName: selectedPerson.lastName,
      sex: '',
      years: type === 'child' ? '2026-' : '',
      branch: type === 'child' ? 'Next generation' : selectedPerson.branch,
      photo: type === 'child' ? 'NC' : 'NP',
      birthPlace: '',
      currentResidence: '',
      privateNotes: '',
      links: [],
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

  let nextGraph: GraphSchema = {
    ...graph,
    entities: [...graph.entities, newPerson],
    edges: [...graph.edges, newEdge],
  }

  if (type === 'child') {
    const partnerIds = partnerIdsOf(graph, selectedPerson.id)
    if (partnerIds.length === 1) {
      nextGraph = addConnection(
        nextGraph,
        partnerIds[0],
        entityId,
        EdgePredicate.PARENT_OF,
      )
    }
  }

  return {
    graph: nextGraph,
    newPersonId: entityId,
  }
}

export function connectPeopleAsSiblings(
  graph: GraphSchema,
  selectedPersonId: string,
  targetPersonId: string,
): GraphSchema {
  if (selectedPersonId === targetPersonId) return graph

  const selectedParents = parentIdsOf(graph, selectedPersonId)
  const targetParents = parentIdsOf(graph, targetPersonId)

  if (selectedParents.length > 0) {
    return selectedParents.reduce(
      (currentGraph, parentId) =>
        addConnection(currentGraph, parentId, targetPersonId, EdgePredicate.PARENT_OF),
      graph,
    )
  }

  if (targetParents.length > 0) {
    return targetParents.reduce(
      (currentGraph, parentId) =>
        addConnection(currentGraph, parentId, selectedPersonId, EdgePredicate.PARENT_OF),
      graph,
    )
  }

  const people = personMap(graphPeople(graph))
  const selectedPerson = people.get(selectedPersonId)
  const targetPerson = people.get(targetPersonId)
  const placeholderName = selectedPerson
    ? placeholderRelativeName(selectedPerson, 'parent')
    : targetPerson
      ? placeholderRelativeName(targetPerson, 'parent')
      : 'Person\'s parent'

  const parentResult = addStandalonePerson(graph, placeholderName)
  let next = addConnection(
    parentResult.graph,
    parentResult.newPersonId,
    selectedPersonId,
    EdgePredicate.PARENT_OF,
  )
  next = addConnection(
    next,
    parentResult.newPersonId,
    targetPersonId,
    EdgePredicate.PARENT_OF,
  )
  return next
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

function resolveHorizontalLayoutOverlaps(
  nodePositions: Map<string, { x: number; y: number }>,
  layoutNodes: Map<string, LayoutNodeSpec>,
  compact: boolean,
) {
  const minGap = compact ? 4 : 6
  const rows = new Map<number, string[]>()

  for (const [nodeId, position] of nodePositions.entries()) {
    rows.set(position.y, [...(rows.get(position.y) ?? []), nodeId])
  }

  for (const rowNodeIds of rows.values()) {
    const ordered = [...rowNodeIds].sort((leftId, rightId) => {
      const left = nodePositions.get(leftId)
      const right = nodePositions.get(rightId)
      return (left?.x ?? 0) - (right?.x ?? 0)
    })

    let cursorX: number | null = null
    for (const nodeId of ordered) {
      const position = nodePositions.get(nodeId)
      const node = layoutNodes.get(nodeId)
      if (!position || !node) continue

      const nextX: number =
        cursorX === null ? position.x : Math.max(position.x, cursorX + minGap)

      nodePositions.set(nodeId, {
        ...position,
        x: snapLayoutValue(nextX, LAYOUT_GRID_X),
      })

      cursorX = nextX + node.width
    }
  }
}

function centerRowsUnderParentAnchors(
  nodePositions: Map<string, { x: number; y: number }>,
  layoutNodes: Map<string, LayoutNodeSpec>,
  layoutEdges: Map<string, { id: string; sources: string[]; targets: string[] }>,
  compact: boolean,
) {
  const minGap = compact ? 4 : 6
  const anchorByNode = new Map<string, number>()
  const parentKeyByNode = new Map<string, string>()

  for (const edge of layoutEdges.values()) {
    if (!edge.id.startsWith(`${EdgePredicate.PARENT_OF}:`)) continue

    for (const targetId of edge.targets) {
      const sourceAnchors = edge.sources
        .map((sourceId) => nodePositions.get(sourceId)?.x)
        .filter((value): value is number => value !== undefined)

      if (sourceAnchors.length === 0) continue

      const sourceCenter =
        sourceAnchors.reduce((sum, value) => sum + value, 0) / sourceAnchors.length
      anchorByNode.set(targetId, sourceCenter)
      parentKeyByNode.set(targetId, [...edge.sources].sort().join('|'))
    }
  }

  const rows = new Map<number, string[]>()
  for (const [nodeId, position] of nodePositions.entries()) {
    rows.set(position.y, [...(rows.get(position.y) ?? []), nodeId])
  }

  for (const rowNodeIds of rows.values()) {
    const groups = new Map<
      string,
      { nodeIds: string[]; anchorX: number }
    >()

    for (const nodeId of rowNodeIds) {
      const key = parentKeyByNode.get(nodeId) ?? `solo:${nodeId}`
      const anchorX = anchorByNode.get(nodeId) ?? nodePositions.get(nodeId)?.x ?? 0
      const current = groups.get(key)
      if (current) {
        current.nodeIds.push(nodeId)
      } else {
        groups.set(key, { nodeIds: [nodeId], anchorX })
      }
    }

    const orderedGroups = [...groups.values()]
      .map((group) => ({
        ...group,
        nodeIds: [...group.nodeIds].sort(
          (leftId, rightId) =>
            (nodePositions.get(leftId)?.x ?? 0) - (nodePositions.get(rightId)?.x ?? 0),
        ),
      }))
      .sort((left, right) => left.anchorX - right.anchorX)

    let cursorX: number | null = null
    for (const group of orderedGroups) {
      const groupWidth = group.nodeIds.reduce((sum, nodeId, index) => {
        const node = layoutNodes.get(nodeId)
        if (!node) return sum
        return sum + node.width + (index > 0 ? minGap : 0)
      }, 0)

      const preferredLeft = group.anchorX - groupWidth / 2
      const groupStartX: number =
        cursorX === null ? preferredLeft : Math.max(preferredLeft, cursorX + minGap)

      let localCursorX = groupStartX
      for (const nodeId of group.nodeIds) {
        const position = nodePositions.get(nodeId)
        const node = layoutNodes.get(nodeId)
        if (!position || !node) continue

        nodePositions.set(nodeId, {
          ...position,
          x: snapLayoutValue(localCursorX, LAYOUT_GRID_X),
        })

        localCursorX += node.width + minGap
      }

      cursorX = localCursorX - minGap
    }
  }
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
        width: isFamilyNode ? FAMILY_LAYOUT_WIDTH : PERSON_LAYOUT_WIDTH,
        height: isFamilyNode ? FAMILY_LAYOUT_HEIGHT : PERSON_LAYOUT_HEIGHT,
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
        'elk.spacing.nodeNode': String(compact ? 34 : 44),
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

    centerRowsUnderParentAnchors(nodePositions, layoutNodes, layoutEdges, compact)
    resolveHorizontalLayoutOverlaps(nodePositions, layoutNodes, compact)

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

  const fromAncestors = ancestorDepths(graph, fromId)
  const toAncestors = ancestorDepths(graph, toId)
  const fromPrevious = ancestorPredecessors(graph, fromId)
  const toPrevious = ancestorPredecessors(graph, toId)

  let bestAncestor:
    | {
        id: string
        fromDepth: number
        toDepth: number
        score: number
      }
    | undefined

  for (const [ancestorId, fromDepth] of fromAncestors.entries()) {
    const toDepth = toAncestors.get(ancestorId)
    if (toDepth === undefined) continue

    const score = fromDepth + toDepth
    if (
      !bestAncestor ||
      score < bestAncestor.score ||
      (score === bestAncestor.score &&
        Math.max(fromDepth, toDepth) <
          Math.max(bestAncestor.fromDepth, bestAncestor.toDepth))
    ) {
      bestAncestor = {
        id: ancestorId,
        fromDepth,
        toDepth,
        score,
      }
    }
  }

  if (!bestAncestor) return []

  const fromLine = buildAncestorLine(fromPrevious, fromId, bestAncestor.id)
  const toLine = buildAncestorLine(toPrevious, toId, bestAncestor.id)
  if (fromLine.length === 0 || toLine.length === 0) return []

  return [...fromLine, ...toLine.reverse().slice(1)]
}

export function relationshipExplanation(
  graph: GraphSchema,
  fromId: string,
  toId: string,
): string {
  const resolved = resolveRelationship(graph, fromId, toId)
  if (resolved.label) {
    return resolved.labels
      ? `${resolved.label} (${resolved.labels.ta}; ${resolved.labels.hi})`
      : resolved.label
  }

  const people = personMap(graphPeople(graph))
  const path = shortestPersonPath(graph, fromId, toId)
  if (path.length === 0) return 'No relationship path found in the current graph.'

  if (path.length === 1) {
    const currentPerson = people.get(fromId)
    return `${currentPerson ? displayName(currentPerson) : 'This person'} is the selected person.`
  }

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

    segments.push(`${displayName(currentPerson)} -> ${predicateLabel(edge.predicate)} -> ${displayName(nextPerson)}`)
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

function inferSexLabel<T extends string>(sex: string, maleLabel: T, femaleLabel: T, fallback: T) {
  const normalized = sex.trim().toLowerCase()
  if (normalized === 'male') return maleLabel
  if (normalized === 'female') return femaleLabel
  return fallback
}

function buildResolvedRelationship(
  key: CanonicalRelationKey,
  path: string[],
  socialLabel?: string,
): ResolvedRelationship {
  const labels = labelsForRelation(key)
  return {
    key,
    label: labels.en,
    labels,
    path,
    socialLabel,
  }
}

function buildFreeformRelationship(
  label: string,
  path: string[],
  socialLabel?: string,
): ResolvedRelationship {
  return {
    label,
    path,
    socialLabel,
  }
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
  const parents = new Set(parentIdsOf(graph, personId))
  const inferred = graph.edges
    .filter(
      (edge) => edge.predicate === EdgePredicate.PARENT_OF && parents.has(edge.src) && edge.dst !== personId,
    )
    .map((edge) => edge.dst)

  return Array.from(new Set(inferred))
}

function ancestorDepths(graph: GraphSchema, personId: string): Map<string, number> {
  const depths = new Map<string, number>([[personId, 0]])
  const queue = [{ id: personId, depth: 0 }]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue

    for (const parentId of parentIdsOf(graph, current.id)) {
      const nextDepth = current.depth + 1
      const knownDepth = depths.get(parentId)
      if (knownDepth !== undefined && knownDepth <= nextDepth) continue
      depths.set(parentId, nextDepth)
      queue.push({ id: parentId, depth: nextDepth })
    }
  }

  return depths
}

function ancestorPredecessors(graph: GraphSchema, personId: string): Map<string, string | null> {
  const previous = new Map<string, string | null>([[personId, null]])
  const queue = [personId]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue

    for (const parentId of parentIdsOf(graph, current)) {
      if (previous.has(parentId)) continue
      previous.set(parentId, current)
      queue.push(parentId)
    }
  }

  return previous
}

function buildAncestorLine(
  previous: Map<string, string | null>,
  startId: string,
  ancestorId: string,
): string[] {
  const path = [ancestorId]
  let cursor = ancestorId

  while (cursor !== startId) {
    const next = previous.get(cursor)
    if (!next) return []
    path.unshift(next)
    cursor = next
  }

  return path
}

function ordinal(value: number): string {
  const mod100 = value % 100
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`
  const mod10 = value % 10
  if (mod10 === 1) return `${value}st`
  if (mod10 === 2) return `${value}nd`
  if (mod10 === 3) return `${value}rd`
  return `${value}th`
}

function removedLabel(removal: number): string {
  if (removal === 1) return 'once removed'
  if (removal === 2) return 'twice removed'
  return `${removal} times removed`
}

function cousinRelationshipLabel(graph: GraphSchema, fromId: string, toId: string): string {
  const fromAncestors = ancestorDepths(graph, fromId)
  const toAncestors = ancestorDepths(graph, toId)

  let best:
    | {
        fromDepth: number
        toDepth: number
        score: number
      }
    | undefined

  for (const [ancestorId, fromDepth] of fromAncestors.entries()) {
    const toDepth = toAncestors.get(ancestorId)
    if (toDepth === undefined) continue
    if (fromDepth < 2 || toDepth < 2) continue

    const score = fromDepth + toDepth
    if (
      !best ||
      score < best.score ||
      (score === best.score && Math.max(fromDepth, toDepth) < Math.max(best.fromDepth, best.toDepth))
    ) {
      best = { fromDepth, toDepth, score }
    }
  }

  if (!best) return 'cousin'

  const degree = Math.min(best.fromDepth, best.toDepth) - 1
  const removal = Math.abs(best.fromDepth - best.toDepth)

  if (degree <= 0) return 'cousin'
  if (removal === 0) return `${ordinal(degree)} cousin`
  return `${ordinal(degree)} cousin ${removedLabel(removal)}`
}

function socialAddressForResolvedRelationship(
  graph: GraphSchema,
  from: PersonView,
  to: PersonView,
  relationship: ResolvedRelationship,
): string | undefined {
  if (relationship.key) {
    switch (relationship.key) {
      case 'father':
      case 'mother':
      case 'parent':
        return 'parent'
      case 'son':
      case 'daughter':
      case 'child':
        return 'child'
      case 'brother':
      case 'sister':
      case 'sibling':
        return 'sibling'
      case 'grandfather':
      case 'grandmother':
      case 'grandparent':
        return 'grandparent'
      case 'grandson':
      case 'granddaughter':
      case 'grandchild':
        return 'grandchild'
      case 'maternal_uncle':
      case 'paternal_uncle':
      case 'maternal_uncle_spouse':
      case 'paternal_aunt_spouse':
      case 'maternal_aunt_uncle':
      case 'paternal_aunt_uncle':
      case 'maternal_in_law':
      case 'paternal_in_law':
        return 'uncle'
      case 'maternal_aunt':
      case 'paternal_aunt':
      case 'maternal_aunt_spouse':
      case 'paternal_uncle_spouse':
        return 'aunty'
      default:
        return undefined
    }
  }

  const bloodPath = shortestBloodPath(graph, from.id, to.id)
  if (bloodPath.length === 0) return undefined

  const fromAncestors = ancestorDepths(graph, from.id)
  const toAncestors = ancestorDepths(graph, to.id)
  let best:
    | {
        fromDepth: number
        toDepth: number
        score: number
      }
    | undefined

  for (const [ancestorId, fromDepth] of fromAncestors.entries()) {
    const toDepth = toAncestors.get(ancestorId)
    if (toDepth === undefined) continue
    const score = fromDepth + toDepth
    if (
      !best ||
      score < best.score ||
      (score === best.score && Math.max(fromDepth, toDepth) < Math.max(best.fromDepth, best.toDepth))
    ) {
      best = { fromDepth, toDepth, score }
    }
  }

  if (!best) return undefined

  if (best.fromDepth >= 1 && best.toDepth >= 2) {
    return from.sex.trim().toLowerCase() === 'female' ? 'aunty' : 'uncle'
  }

  return undefined
}

export function resolveRelationship(
  graph: GraphSchema,
  fromId: string,
  toId: string,
): ResolvedRelationship {
  const people = personMap(graphPeople(graph))
  const from = people.get(fromId)
  const to = people.get(toId)
  const path = shortestPersonPath(graph, fromId, toId)
  const bloodPath = shortestBloodPath(graph, fromId, toId)
  const hasBloodConnection = bloodPath.length > 0

  if (!from || !to) return { label: '', path }
  if (fromId === toId) return buildResolvedRelationship('same_person', path)

  const direct = getDirectRelationship(graph, fromId, toId)
  if (direct?.predicate === EdgePredicate.PARTNER_OF) {
    const resolved = buildResolvedRelationship(
      inferSexLabel(from.sex, 'husband', 'wife', 'spouse_partner') as CanonicalRelationKey,
      path,
    )
    resolved.socialLabel = socialAddressForResolvedRelationship(graph, from, to, resolved)
    return resolved
  }
  if (direct?.predicate === EdgePredicate.PARENT_OF && direct.src === fromId) {
    const resolved = buildResolvedRelationship(
      inferSexLabel(from.sex, 'father', 'mother', 'parent') as CanonicalRelationKey,
      path,
    )
    resolved.socialLabel = socialAddressForResolvedRelationship(graph, from, to, resolved)
    return resolved
  }
  if (direct?.predicate === EdgePredicate.PARENT_OF && direct.dst === fromId) {
    const resolved = buildResolvedRelationship(
      inferSexLabel(from.sex, 'son', 'daughter', 'child') as CanonicalRelationKey,
      path,
    )
    resolved.socialLabel = socialAddressForResolvedRelationship(graph, from, to, resolved)
    return resolved
  }

  if (hasBloodConnection && isParentOf(graph, fromId, toId)) {
    const resolved = buildResolvedRelationship(
      inferSexLabel(from.sex, 'father', 'mother', 'parent') as CanonicalRelationKey,
      path,
    )
    resolved.socialLabel = socialAddressForResolvedRelationship(graph, from, to, resolved)
    return resolved
  }
  if (hasBloodConnection && isParentOf(graph, toId, fromId)) {
    const resolved = buildResolvedRelationship(
      inferSexLabel(from.sex, 'son', 'daughter', 'child') as CanonicalRelationKey,
      path,
    )
    resolved.socialLabel = socialAddressForResolvedRelationship(graph, from, to, resolved)
    return resolved
  }

  const toParents = parentIdsOf(graph, toId)
  if (hasBloodConnection && toParents.some((parentId) => isParentOf(graph, fromId, parentId))) {
    const resolved = buildResolvedRelationship(
      inferSexLabel(from.sex, 'grandfather', 'grandmother', 'grandparent') as CanonicalRelationKey,
      path,
    )
    resolved.socialLabel = socialAddressForResolvedRelationship(graph, from, to, resolved)
    return resolved
  }

  const fromParents = parentIdsOf(graph, fromId)
  if (hasBloodConnection && fromParents.some((parentId) => isParentOf(graph, toId, parentId))) {
    const resolved = buildResolvedRelationship(
      inferSexLabel(from.sex, 'grandson', 'granddaughter', 'grandchild') as CanonicalRelationKey,
      path,
    )
    resolved.socialLabel = socialAddressForResolvedRelationship(graph, from, to, resolved)
    return resolved
  }

  const fromSiblings = new Set(siblingIdsOf(graph, fromId))
  if (hasBloodConnection && toParents.some((parentId) => fromSiblings.has(parentId))) {
    const parent = toParents.find((parentId) => fromSiblings.has(parentId))
    const parentPerson = parent ? people.get(parent) : undefined
    const isMaternal = parentPerson?.sex.trim().toLowerCase() === 'female'
    const resolved = buildResolvedRelationship(
      inferSexLabel(
        from.sex,
        isMaternal ? 'maternal_uncle' : 'paternal_uncle',
        isMaternal ? 'maternal_aunt' : 'paternal_aunt',
        isMaternal ? 'maternal_aunt_uncle' : 'paternal_aunt_uncle',
      ) as CanonicalRelationKey,
      path,
    )
    resolved.socialLabel = socialAddressForResolvedRelationship(graph, from, to, resolved)
    return resolved
  }

  for (const parentId of toParents) {
    const parentSiblings = siblingIdsOf(graph, parentId)
    if (parentSiblings.some((siblingId) => partnerIdsOf(graph, siblingId).includes(fromId))) {
      const parent = people.get(parentId)
      const isMaternal = parent?.sex.trim().toLowerCase() === 'female'
      const resolved = buildResolvedRelationship(
        inferSexLabel(
          from.sex,
          isMaternal ? 'maternal_aunt_spouse' : 'paternal_aunt_spouse',
          isMaternal ? 'maternal_uncle_spouse' : 'paternal_uncle_spouse',
          isMaternal ? 'maternal_in_law' : 'paternal_in_law',
        ) as CanonicalRelationKey,
        path,
      )
      resolved.socialLabel = socialAddressForResolvedRelationship(graph, from, to, resolved)
      return resolved
    }
  }

  const fromParentsSet = new Set(fromParents)
  if (hasBloodConnection && parentIdsOf(graph, toId).some((parentId) => fromParentsSet.has(parentId))) {
    const resolved = buildResolvedRelationship(
      inferSexLabel(from.sex, 'brother', 'sister', 'sibling') as CanonicalRelationKey,
      path,
    )
    resolved.socialLabel = socialAddressForResolvedRelationship(graph, from, to, resolved)
    return resolved
  }

  const toAuntUncleIds = new Set(
    toParents.flatMap((parentId) => siblingIdsOf(graph, parentId)),
  )
  if (
    hasBloodConnection &&
    parentIdsOf(graph, fromId).some((parentId) => toAuntUncleIds.has(parentId))
  ) {
    const resolved = buildFreeformRelationship(cousinRelationshipLabel(graph, fromId, toId), path)
    resolved.socialLabel = socialAddressForResolvedRelationship(graph, from, to, resolved)
    return resolved
  }

  if (bloodPath.length > 0) {
    const cousinLabel = cousinRelationshipLabel(graph, fromId, toId)
    if (cousinLabel !== 'cousin' || bloodPath.length > 4) {
      const resolved = buildFreeformRelationship(cousinLabel, path)
      resolved.socialLabel = socialAddressForResolvedRelationship(graph, from, to, resolved)
      return resolved
    }
  }

  return { label: '', path, socialLabel: undefined }
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

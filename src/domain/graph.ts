export const EntityType = {
  PERSON: 'Person',
  GROUP: 'Group',
  EVENT: 'Event',
  PLACE: 'Place',
  ARTIFACT: 'Artifact',
} as const

export type EntityType = (typeof EntityType)[keyof typeof EntityType]

export const EdgePredicate = {
  PARENT_OF: 'parent_of',
  PARTNER_OF: 'partner_of',
  SIBLING_OF: 'sibling_of',
  GUARDIAN_OF: 'guardian_of',
  STEP_PARENT_OF: 'step_parent_of',
  CLOSE_TO: 'close_to',
  ESTRANGED_FROM: 'estranged_from',
  CAREGIVER_FOR: 'caregiver_for',
  DEPENDS_ON: 'depends_on',
  MENTORED: 'mentored',
  MEMBER_OF: 'member_of',
  BELONGS_TO_HOUSEHOLD: 'belongs_to_household',
  ATTENDED: 'attended',
  HOSTED: 'hosted',
  OCCURRED_AT: 'occurred_at',
  LIVES_AT: 'lives_at',
  APPEARS_IN: 'appears_in',
  OWNS: 'owns',
  MENTIONED_IN: 'mentioned_in',
} as const

export type EdgePredicate = (typeof EdgePredicate)[keyof typeof EdgePredicate]

export const ConfidenceLevel = {
  CONFIRMED: 'confirmed',
  LIKELY: 'likely',
  UNCERTAIN: 'uncertain',
  DISPUTED: 'disputed',
  PERSONAL_VIEW: 'personal_view',
} as const

export type ConfidenceLevel =
  (typeof ConfidenceLevel)[keyof typeof ConfidenceLevel]

export const ClaimStatus = {
  ASSERTED: 'asserted',
  DISPUTED: 'disputed',
  REVOKED: 'revoked',
  SUPERSEDED: 'superseded',
  UNKNOWN: 'unknown',
} as const

export type ClaimStatus = (typeof ClaimStatus)[keyof typeof ClaimStatus]

export const VisibilityScope = {
  PRIVATE: 'private',
  SHARED: 'shared',
  PUBLIC: 'public',
  CUSTOM: 'custom',
} as const

export type VisibilityScope =
  (typeof VisibilityScope)[keyof typeof VisibilityScope]

export const Directionality = {
  DIRECTED: 'directed',
  UNDIRECTED: 'undirected',
} as const

export type Directionality =
  (typeof Directionality)[keyof typeof Directionality]

export const TimePrecision = {
  YEAR: 'year',
  MONTH: 'month',
  DAY: 'day',
  DATETIME: 'datetime',
  UNKNOWN: 'unknown',
} as const

export type TimePrecision = (typeof TimePrecision)[keyof typeof TimePrecision]

export type ProvenanceSourceType =
  | 'user_entered'
  | 'inferred'
  | 'imported'
  | 'document'
  | 'photo'
  | 'conversation'
  | 'system'

export type InheritanceMode = 'inherit' | 'override'

export type TimeValue = {
  value?: string
  precision: TimePrecision
  approximate?: boolean
  note?: string
}

export type TemporalInterval = {
  start?: TimeValue
  end?: TimeValue
  isCurrent?: boolean
  note?: string
}

export type Provenance = {
  sourceType: ProvenanceSourceType
  sourceRef?: string
  assertedBy?: string
  createdBy?: string
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
  notes?: string
}

export type AccessPolicy = {
  visibility: VisibilityScope
  viewers: string[]
  editors: string[]
  owners: string[]
  redactedFields: string[]
  inheritanceMode: InheritanceMode
}

export type Claim = {
  status: ClaimStatus
  confidence: ConfidenceLevel
  disputedBy: string[]
  supersedes?: string
  notes?: string
}

export type Annotation = {
  key: string
  value: unknown
  namespace?: string
}

export type ExternalReference = {
  system: string
  externalId: string
  url?: string
  metadata: Record<string, unknown>
}

export type BaseEntity = {
  id: string
  entityType: EntityType
  label: string
  aliases: string[]
  description?: string
  tags: string[]
  temporal?: TemporalInterval
  provenance: Provenance
  access: AccessPolicy
  attrs: Record<string, unknown>
  annotations: Annotation[]
  externalRefs: ExternalReference[]
}

export type PersonEntity = BaseEntity & {
  entityType: typeof EntityType.PERSON
}

export type GroupEntity = BaseEntity & {
  entityType: typeof EntityType.GROUP
}

export type EventEntity = BaseEntity & {
  entityType: typeof EntityType.EVENT
}

export type PlaceEntity = BaseEntity & {
  entityType: typeof EntityType.PLACE
}

export type ArtifactEntity = BaseEntity & {
  entityType: typeof EntityType.ARTIFACT
}

export type GraphEntity =
  | PersonEntity
  | GroupEntity
  | EventEntity
  | PlaceEntity
  | ArtifactEntity

export type Edge = {
  id: string
  src: string
  dst: string
  predicate: EdgePredicate
  directionality: Directionality
  inversePredicate?: string
  symmetric: boolean
  qualifiers: Record<string, unknown>
  weight?: number
  ordinal?: number
  temporal?: TemporalInterval
  claim: Claim
  provenance: Provenance
  access: AccessPolicy
  notes?: string
  annotations: Annotation[]
}

export type GraphSchema = {
  version: string
  rootOwnerId: string
  entities: GraphEntity[]
  edges: Edge[]
  metadata: Record<string, unknown>
}

export type PredicateRule = {
  srcTypes: EntityType[]
  dstTypes: EntityType[]
  symmetric: boolean
  inverse?: string
  allowedQualifiers: string[]
}

export const defaultProvenance = (): Provenance => ({
  sourceType: 'user_entered',
})

export const defaultAccessPolicy = (): AccessPolicy => ({
  visibility: VisibilityScope.PRIVATE,
  viewers: [],
  editors: [],
  owners: [],
  redactedFields: [],
  inheritanceMode: 'override',
})

export const defaultClaim = (): Claim => ({
  status: ClaimStatus.ASSERTED,
  confidence: ConfidenceLevel.CONFIRMED,
  disputedBy: [],
})

export const PREDICATE_RULES: Partial<Record<EdgePredicate, PredicateRule>> = {
  [EdgePredicate.PARENT_OF]: {
    srcTypes: [EntityType.PERSON],
    dstTypes: [EntityType.PERSON],
    symmetric: false,
    inverse: 'child_of',
    allowedQualifiers: ['kind', 'legal_status', 'side'],
  },
  [EdgePredicate.PARTNER_OF]: {
    srcTypes: [EntityType.PERSON],
    dstTypes: [EntityType.PERSON],
    symmetric: true,
    allowedQualifiers: ['status', 'kind'],
  },
  [EdgePredicate.SIBLING_OF]: {
    srcTypes: [EntityType.PERSON],
    dstTypes: [EntityType.PERSON],
    symmetric: true,
    allowedQualifiers: ['kind'],
  },
  [EdgePredicate.GUARDIAN_OF]: {
    srcTypes: [EntityType.PERSON],
    dstTypes: [EntityType.PERSON],
    symmetric: false,
    inverse: 'ward_of',
    allowedQualifiers: ['kind', 'legal_status'],
  },
  [EdgePredicate.CLOSE_TO]: {
    srcTypes: [EntityType.PERSON],
    dstTypes: [EntityType.PERSON],
    symmetric: false,
    allowedQualifiers: ['context', 'strength'],
  },
  [EdgePredicate.ESTRANGED_FROM]: {
    srcTypes: [EntityType.PERSON],
    dstTypes: [EntityType.PERSON],
    symmetric: true,
    allowedQualifiers: ['severity', 'reason'],
  },
  [EdgePredicate.CAREGIVER_FOR]: {
    srcTypes: [EntityType.PERSON],
    dstTypes: [EntityType.PERSON],
    symmetric: false,
    inverse: 'receives_care_from',
    allowedQualifiers: ['kind', 'intensity'],
  },
  [EdgePredicate.DEPENDS_ON]: {
    srcTypes: [EntityType.PERSON],
    dstTypes: [EntityType.PERSON, EntityType.GROUP],
    symmetric: false,
    allowedQualifiers: ['kind', 'degree'],
  },
  [EdgePredicate.MEMBER_OF]: {
    srcTypes: [EntityType.PERSON],
    dstTypes: [EntityType.GROUP],
    symmetric: false,
    inverse: 'has_member',
    allowedQualifiers: ['role'],
  },
  [EdgePredicate.BELONGS_TO_HOUSEHOLD]: {
    srcTypes: [EntityType.PERSON],
    dstTypes: [EntityType.GROUP],
    symmetric: false,
    inverse: 'has_household_member',
    allowedQualifiers: ['role', 'residency_status'],
  },
  [EdgePredicate.ATTENDED]: {
    srcTypes: [EntityType.PERSON],
    dstTypes: [EntityType.EVENT],
    symmetric: false,
    allowedQualifiers: ['attendance_status', 'role'],
  },
  [EdgePredicate.HOSTED]: {
    srcTypes: [EntityType.PERSON, EntityType.GROUP],
    dstTypes: [EntityType.EVENT],
    symmetric: false,
    allowedQualifiers: ['role'],
  },
  [EdgePredicate.OCCURRED_AT]: {
    srcTypes: [EntityType.EVENT],
    dstTypes: [EntityType.PLACE],
    symmetric: false,
    allowedQualifiers: [],
  },
  [EdgePredicate.LIVES_AT]: {
    srcTypes: [EntityType.PERSON],
    dstTypes: [EntityType.PLACE],
    symmetric: false,
    allowedQualifiers: ['residency_status'],
  },
  [EdgePredicate.APPEARS_IN]: {
    srcTypes: [EntityType.PERSON],
    dstTypes: [EntityType.ARTIFACT],
    symmetric: false,
    allowedQualifiers: ['certainty', 'role'],
  },
  [EdgePredicate.OWNS]: {
    srcTypes: [EntityType.PERSON, EntityType.GROUP],
    dstTypes: [EntityType.ARTIFACT, EntityType.PLACE],
    symmetric: false,
    inverse: 'owned_by',
    allowedQualifiers: ['ownership_kind', 'share'],
  },
  [EdgePredicate.MENTIONED_IN]: {
    srcTypes: [EntityType.PERSON, EntityType.GROUP, EntityType.EVENT, EntityType.PLACE],
    dstTypes: [EntityType.ARTIFACT],
    symmetric: false,
    allowedQualifiers: ['certainty'],
  },
}

export function createPersonEntity(
  overrides: Partial<PersonEntity> & Pick<PersonEntity, 'id' | 'label'>,
): PersonEntity {
  return {
    id: overrides.id,
    label: overrides.label,
    entityType: EntityType.PERSON,
    aliases: overrides.aliases ?? [],
    description: overrides.description,
    tags: overrides.tags ?? [],
    temporal: overrides.temporal,
    provenance: overrides.provenance ?? defaultProvenance(),
    access: overrides.access ?? defaultAccessPolicy(),
    attrs: overrides.attrs ?? {},
    annotations: overrides.annotations ?? [],
    externalRefs: overrides.externalRefs ?? [],
  }
}

export function createEdge(
  overrides: Partial<Edge> & Pick<Edge, 'id' | 'src' | 'dst' | 'predicate'>,
): Edge {
  const rule = PREDICATE_RULES[overrides.predicate]
  const symmetric = overrides.symmetric ?? rule?.symmetric ?? false
  const directionality =
    overrides.directionality ??
    (symmetric ? Directionality.UNDIRECTED : Directionality.DIRECTED)

  return {
    id: overrides.id,
    src: overrides.src,
    dst: overrides.dst,
    predicate: overrides.predicate,
    directionality,
    inversePredicate: overrides.inversePredicate ?? rule?.inverse,
    symmetric,
    qualifiers: overrides.qualifiers ?? {},
    weight: overrides.weight,
    ordinal: overrides.ordinal,
    temporal: overrides.temporal,
    claim: overrides.claim ?? defaultClaim(),
    provenance: overrides.provenance ?? defaultProvenance(),
    access: overrides.access ?? defaultAccessPolicy(),
    notes: overrides.notes,
    annotations: overrides.annotations ?? [],
  }
}

export function isPersonEntity(entity: GraphEntity): entity is PersonEntity {
  return entity.entityType === EntityType.PERSON
}

export function getAttrString(entity: GraphEntity, key: string): string {
  const value = entity.attrs[key]
  return typeof value === 'string' ? value : ''
}

export function getAttrNumber(entity: GraphEntity, key: string): number | undefined {
  const value = entity.attrs[key]
  return typeof value === 'number' ? value : undefined
}

export function validateEntity(entity: GraphEntity): void {
  if (!entity.id) {
    throw new Error('Entity id is required')
  }

  if (!entity.label) {
    throw new Error(`Entity ${entity.id} must have a label`)
  }
}

export function validateEdge(edge: Edge, entityMap: Map<string, GraphEntity>): void {
  const srcEntity = entityMap.get(edge.src)
  const dstEntity = entityMap.get(edge.dst)

  if (!srcEntity) {
    throw new Error(`Edge ${edge.id}: missing src entity ${edge.src}`)
  }

  if (!dstEntity) {
    throw new Error(`Edge ${edge.id}: missing dst entity ${edge.dst}`)
  }

  const rule = PREDICATE_RULES[edge.predicate]
  if (!rule) return

  if (!rule.srcTypes.includes(srcEntity.entityType)) {
    throw new Error(
      `Edge ${edge.id}: invalid src type ${srcEntity.entityType} for predicate ${edge.predicate}`,
    )
  }

  if (!rule.dstTypes.includes(dstEntity.entityType)) {
    throw new Error(
      `Edge ${edge.id}: invalid dst type ${dstEntity.entityType} for predicate ${edge.predicate}`,
    )
  }

  const extraQualifiers = Object.keys(edge.qualifiers).filter(
    (qualifier) => !rule.allowedQualifiers.includes(qualifier),
  )

  if (extraQualifiers.length > 0) {
    throw new Error(
      `Edge ${edge.id}: unsupported qualifiers for ${edge.predicate}: ${extraQualifiers.join(', ')}`,
    )
  }
}

export function validateGraph(graph: GraphSchema): void {
  const entityMap = new Map<string, GraphEntity>()
  const edgeIds = new Set<string>()

  for (const entity of graph.entities) {
    if (entityMap.has(entity.id)) {
      throw new Error(`Duplicate entity id found: ${entity.id}`)
    }

    validateEntity(entity)
    entityMap.set(entity.id, entity)
  }

  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      throw new Error(`Duplicate edge id found: ${edge.id}`)
    }

    edgeIds.add(edge.id)
    validateEdge(edge, entityMap)
  }
}

import type { User } from '@supabase/supabase-js'
import {
  type Edge,
  type GraphEntity,
  type GraphSchema,
  isPersonEntity,
} from '../domain/graph'
import { sampleGraph } from './sampleGraph'
import { supabase } from './supabase'

export type TreeRole = 'admin' | 'editor' | 'viewer'

export type TreeAccess = {
  id: string
  name: string
  graph: GraphSchema
  role: TreeRole
  linkedPersonId: string | null
}

export type InviteRole = TreeRole

export type InvitePreview = {
  targetEmail: string
  role: InviteRole
  expiresAt: string
  treeName: string
}

export type InviteCreation = {
  token: string
  targetEmail: string
  role: InviteRole
  expiresAt: string
}

export type ChangeRequestStatus = 'pending' | 'approved' | 'rejected'

export type ChangeRequest = {
  id: string
  treeId: string
  requesterUserId: string
  requesterEmail: string
  actionType: string
  summary: string
  payload: GraphDiff
  targetPersonId: string | null
  targetRelationshipId: string | null
  status: ChangeRequestStatus
  reviewNote: string
  createdAt: string
}

type PeopleRow = {
  tree_id: string
  person_id: string
  owner_user_id: string | null
  entity: GraphEntity
  updated_at?: string
}

type RelationshipRow = {
  tree_id: string
  relationship_id: string
  edge: Edge
  updated_at?: string
}

type GraphDiff = {
  upsertPeople: PeopleRow[]
  deletePersonIds: string[]
  upsertRelationships: RelationshipRow[]
  deleteRelationshipIds: string[]
  nextGraph: GraphSchema
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  return supabase
}

function emptyGraphForTree(treeName: string, userId: string): GraphSchema {
  return {
    ...sampleGraph,
    rootOwnerId: userId,
    metadata: {
      ...sampleGraph.metadata,
      treeName,
      source: 'supabase',
    },
  }
}

function patchPersonEntity(entity: GraphEntity, ownerUserId: string | null): GraphEntity {
  if (!isPersonEntity(entity)) return entity

  return {
    ...entity,
    attrs: {
      ...entity.attrs,
      ownerUserId: ownerUserId ?? '',
    },
  }
}

function buildGraphFromRows(
  peopleRows: PeopleRow[],
  relationshipRows: RelationshipRow[],
  treeName: string,
  userId: string,
): GraphSchema {
  const entities = peopleRows
    .map((row) => patchPersonEntity(row.entity, row.owner_user_id))
    .sort((a, b) => a.id.localeCompare(b.id))
  const edges = relationshipRows.map((row) => row.edge).sort((a, b) => a.id.localeCompare(b.id))

  return {
    ...emptyGraphForTree(treeName, userId),
    entities,
    edges,
  }
}

function personEntityToRow(treeId: string, entity: GraphEntity): PeopleRow {
  const ownerUserId =
    isPersonEntity(entity) && typeof entity.attrs.ownerUserId === 'string'
      ? entity.attrs.ownerUserId.trim() || null
      : null

  return {
    tree_id: treeId,
    person_id: entity.id,
    owner_user_id: ownerUserId,
    entity,
  }
}

function relationshipToRow(treeId: string, edge: Edge): RelationshipRow {
  return {
    tree_id: treeId,
    relationship_id: edge.id,
    edge,
  }
}

function normalizeEntityJson(value: unknown): GraphEntity | null {
  if (!value || typeof value !== 'object') return null
  return value as GraphEntity
}

function normalizeEdgeJson(value: unknown): Edge | null {
  if (!value || typeof value !== 'object') return null
  return value as Edge
}

function computeGraphDiff(treeId: string, previous: GraphSchema, next: GraphSchema): GraphDiff {
  const previousPeople = new Map(
    previous.entities.filter(isPersonEntity).map((entity) => [entity.id, entity]),
  )
  const nextPeople = new Map(
    next.entities.filter(isPersonEntity).map((entity) => [entity.id, entity]),
  )
  const previousEdges = new Map(previous.edges.map((edge) => [edge.id, edge]))
  const nextEdges = new Map(next.edges.map((edge) => [edge.id, edge]))

  const upsertPeople: PeopleRow[] = []
  const deletePersonIds: string[] = []
  const upsertRelationships: RelationshipRow[] = []
  const deleteRelationshipIds: string[] = []

  for (const [personId, entity] of nextPeople) {
    const previousEntity = previousPeople.get(personId)
    if (!previousEntity || JSON.stringify(previousEntity) !== JSON.stringify(entity)) {
      upsertPeople.push(personEntityToRow(treeId, entity))
    }
  }

  for (const personId of previousPeople.keys()) {
    if (!nextPeople.has(personId)) {
      deletePersonIds.push(personId)
    }
  }

  for (const [relationshipId, edge] of nextEdges) {
    const previousEdge = previousEdges.get(relationshipId)
    if (!previousEdge || JSON.stringify(previousEdge) !== JSON.stringify(edge)) {
      upsertRelationships.push(relationshipToRow(treeId, edge))
    }
  }

  for (const relationshipId of previousEdges.keys()) {
    if (!nextEdges.has(relationshipId)) {
      deleteRelationshipIds.push(relationshipId)
    }
  }

  return {
    upsertPeople,
    deletePersonIds,
    upsertRelationships,
    deleteRelationshipIds,
    nextGraph: next,
  }
}

async function ensureTreeNormalized(treeId: string) {
  const client = requireSupabase()
  const { error } = await client.rpc('ensure_tree_normalized', {
    p_tree_id: treeId,
  })

  if (error) {
    throw error
  }
}

async function ensureLinkedPersonFromEmail(treeId: string, userId: string, email: string) {
  const client = requireSupabase()
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) return null

  const { data: existingLink, error: linkError } = await client
    .from('user_person_links')
    .select('person_id')
    .eq('tree_id', treeId)
    .eq('user_id', userId)
    .maybeSingle()

  if (linkError) throw linkError
  if (existingLink?.person_id) return String(existingLink.person_id)

  const { data: people, error: peopleError } = await client
    .from('people')
    .select('person_id, owner_user_id, entity')
    .eq('tree_id', treeId)

  if (peopleError) throw peopleError

  const matches = (people ?? []).filter((row) => {
    const entity = normalizeEntityJson(row.entity)
    if (!entity || !isPersonEntity(entity)) return false
    const entityEmail = String(entity.attrs.email ?? '').trim().toLowerCase()
    return entityEmail === normalizedEmail
  })

  if (matches.length !== 1) return null

  const match = matches[0]
  const entity = normalizeEntityJson(match.entity)
  if (!entity || !isPersonEntity(entity)) return null

  const nextEntity = patchPersonEntity(
    {
      ...entity,
      attrs: {
        ...entity.attrs,
        email,
        ownerUserId: userId,
      },
    },
    userId,
  )

  const { error: linkInsertError } = await client.from('user_person_links').upsert({
    tree_id: treeId,
    user_id: userId,
    person_id: match.person_id,
    is_primary: true,
  })
  if (linkInsertError) throw linkInsertError

  const { error: peopleUpdateError } = await client
    .from('people')
    .update({
      owner_user_id: userId,
      entity: nextEntity,
      updated_at: new Date().toISOString(),
    })
    .eq('tree_id', treeId)
    .eq('person_id', match.person_id)
  if (peopleUpdateError) throw peopleUpdateError

  return String(match.person_id)
}

export async function fetchPrimaryTreeAccess(
  userId: string,
  userEmail = '',
): Promise<TreeAccess | null> {
  const client = requireSupabase()
  const { data: membership, error: membershipError } = await client
    .from('tree_members')
    .select('tree_id, role')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (membershipError) {
    throw membershipError
  }

  if (!membership) return null

  const { data: tree, error: treeError } = await client
    .from('trees')
    .select('id, name')
    .eq('id', membership.tree_id)
    .maybeSingle()

  if (treeError) {
    throw treeError
  }

  if (!tree) return null

  await ensureTreeNormalized(tree.id)
  const linkedPersonId = await ensureLinkedPersonFromEmail(tree.id, userId, userEmail)

  const [{ data: peopleRows, error: peopleError }, { data: relationshipRows, error: relationshipsError }] =
    await Promise.all([
      client.from('people').select('tree_id, person_id, owner_user_id, entity').eq('tree_id', tree.id),
      client
        .from('relationships')
        .select('tree_id, relationship_id, edge')
        .eq('tree_id', tree.id),
    ])

  if (peopleError) throw peopleError
  if (relationshipsError) throw relationshipsError

  const graph = buildGraphFromRows(
    (peopleRows ?? [])
      .map((row) => ({
        tree_id: row.tree_id,
        person_id: row.person_id,
        owner_user_id: row.owner_user_id,
        entity: normalizeEntityJson(row.entity)!,
      }))
      .filter((row) => row.entity && isPersonEntity(row.entity)),
    (relationshipRows ?? [])
      .map((row) => ({
        tree_id: row.tree_id,
        relationship_id: row.relationship_id,
        edge: normalizeEdgeJson(row.edge)!,
      }))
      .filter((row) => Boolean(row.edge)),
    tree.name,
    userId,
  )

  const { data: explicitLink, error: explicitLinkError } = await client
    .from('user_person_links')
    .select('person_id')
    .eq('tree_id', tree.id)
    .eq('user_id', userId)
    .maybeSingle()
  if (explicitLinkError) throw explicitLinkError

  return {
    id: tree.id,
    name: tree.name,
    graph,
    role: membership.role,
    linkedPersonId: explicitLink?.person_id ?? linkedPersonId ?? null,
  }
}

export async function createInviteLink(
  treeId: string,
  createdByUserId: string,
  email: string,
  role: InviteRole = 'viewer',
): Promise<InviteCreation> {
  const client = requireSupabase()
  const normalizedEmail = email.trim().toLowerCase()
  const token =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`.slice(0, 48)
      : `${Date.now()}${Math.random().toString(16).slice(2)}`
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { error: preapproveError } = await client.from('preapproved_emails').upsert({
    email: normalizedEmail,
    role,
  })
  if (preapproveError) throw preapproveError

  const { error } = await client.from('invite_links').insert({
    tree_id: treeId,
    target_email: normalizedEmail,
    role,
    token_hash: token,
    expires_at: expiresAt,
    created_by: createdByUserId,
  })
  if (error) throw error

  return { token, targetEmail: normalizedEmail, role, expiresAt }
}

export async function fetchInvitePreview(token: string): Promise<InvitePreview | null> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('get_invite_link', { token })
  if (error) throw error

  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null

  return {
    targetEmail: row.target_email,
    role: row.role,
    expiresAt: row.expires_at,
    treeName: row.tree_name,
  }
}

export async function redeemInviteLink(token: string): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.rpc('redeem_invite_link', { token })
  if (error) throw error
}

export async function createPrimaryTree(user: User, name = 'வம்சம்'): Promise<TreeAccess> {
  const client = requireSupabase()
  const graph = emptyGraphForTree(name, user.id)

  const { data: treeInsert, error: treeError } = await client
    .from('trees')
    .insert({
      name,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (treeError) throw treeError

  const { error: memberError } = await client.from('tree_members').insert({
    tree_id: treeInsert.id,
    user_id: user.id,
    role: 'admin',
  })
  if (memberError) throw memberError

  await replaceNormalizedWithGraph(treeInsert.id, {
    previousGraph: sampleGraph,
    nextGraph: graph,
  })

  const tree = await fetchPrimaryTreeAccess(user.id, user.email ?? '')
  if (!tree) {
    throw new Error('Tree was created, but could not be loaded afterward.')
  }

  return tree
}

export async function savePrimaryTreeGraph(treeId: string, graph: GraphSchema): Promise<void> {
  await ensureTreeNormalized(treeId)
  const { graph: previousGraph } = await fetchNormalizedTreeGraph(treeId, graph.rootOwnerId)

  await replaceNormalizedWithGraph(treeId, {
    previousGraph,
    nextGraph: graph,
  })
}

export async function resetPrimaryTreeGraph(
  treeId: string,
  treeName: string,
  userId: string,
): Promise<GraphSchema> {
  const graph = emptyGraphForTree(treeName, userId)
  await replaceNormalizedWithGraph(treeId, {
    previousGraph: (await fetchNormalizedTreeGraph(treeId, userId)).graph,
    nextGraph: graph,
  })
  return graph
}

async function fetchNormalizedTreeGraph(
  treeId: string,
  userId: string,
): Promise<{ name: string; graph: GraphSchema }> {
  const client = requireSupabase()
  const [{ data: tree, error: treeError }, { data: peopleRows, error: peopleError }, { data: relationshipRows, error: relationshipsError }] =
    await Promise.all([
      client.from('trees').select('name').eq('id', treeId).maybeSingle(),
      client.from('people').select('tree_id, person_id, owner_user_id, entity').eq('tree_id', treeId),
      client.from('relationships').select('tree_id, relationship_id, edge').eq('tree_id', treeId),
    ])

  if (treeError) throw treeError
  if (peopleError) throw peopleError
  if (relationshipsError) throw relationshipsError

  return {
    name: String(tree?.name ?? 'வம்சம்'),
    graph: buildGraphFromRows(
      (peopleRows ?? [])
        .map((row) => ({
          tree_id: row.tree_id,
          person_id: row.person_id,
          owner_user_id: row.owner_user_id,
          entity: normalizeEntityJson(row.entity)!,
        }))
        .filter((row) => row.entity && isPersonEntity(row.entity)),
      (relationshipRows ?? [])
        .map((row) => ({
          tree_id: row.tree_id,
          relationship_id: row.relationship_id,
          edge: normalizeEdgeJson(row.edge)!,
        }))
        .filter((row) => Boolean(row.edge)),
      String(tree?.name ?? 'வம்சம்'),
      userId,
    ),
  }
}

export async function replaceNormalizedWithGraph(
  treeId: string,
  graphs: { previousGraph: GraphSchema; nextGraph: GraphSchema },
): Promise<void> {
  const client = requireSupabase()
  const diff = computeGraphDiff(treeId, graphs.previousGraph, graphs.nextGraph)

  if (diff.upsertPeople.length > 0) {
    const { error } = await client.from('people').upsert(
      diff.upsertPeople.map((row) => ({
        tree_id: row.tree_id,
        person_id: row.person_id,
        owner_user_id: row.owner_user_id,
        entity: row.entity,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'tree_id,person_id' },
    )
    if (error) throw error
  }

  if (diff.upsertRelationships.length > 0) {
    const { error } = await client.from('relationships').upsert(
      diff.upsertRelationships.map((row) => ({
        tree_id: row.tree_id,
        relationship_id: row.relationship_id,
        src_person_id: row.edge.src,
        dst_person_id: row.edge.dst,
        predicate: row.edge.predicate,
        edge: row.edge,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'tree_id,relationship_id' },
    )
    if (error) throw error
  }

  if (diff.deleteRelationshipIds.length > 0) {
    const { error } = await client
      .from('relationships')
      .delete()
      .eq('tree_id', treeId)
      .in('relationship_id', diff.deleteRelationshipIds)
    if (error) throw error
  }

  if (diff.deletePersonIds.length > 0) {
    const { error: deleteLinksError } = await client
      .from('user_person_links')
      .delete()
      .eq('tree_id', treeId)
      .in('person_id', diff.deletePersonIds)
    if (deleteLinksError) throw deleteLinksError

    const { error } = await client
      .from('people')
      .delete()
      .eq('tree_id', treeId)
      .in('person_id', diff.deletePersonIds)
    if (error) throw error
  }
}

export async function linkUserToPerson(
  treeId: string,
  userId: string,
  userEmail: string,
  personId: string,
  graph: GraphSchema,
): Promise<GraphSchema> {
  const client = requireSupabase()
  const personEntity = graph.entities.find(
    (entity) => isPersonEntity(entity) && entity.id === personId,
  )
  if (!personEntity || !isPersonEntity(personEntity)) {
    throw new Error('Unable to find that person in the current graph.')
  }

  const normalizedEmail = userEmail.trim().toLowerCase()
  const conflictingOwner = graph.entities.find(
    (entity) =>
      isPersonEntity(entity) &&
      entity.id === personId &&
      typeof entity.attrs.ownerUserId === 'string' &&
      entity.attrs.ownerUserId &&
      entity.attrs.ownerUserId !== userId,
  )
  if (conflictingOwner) {
    throw new Error('That person is already claimed by another user.')
  }

  const nextGraph = {
    ...graph,
    entities: graph.entities.map((entity) => {
      if (!isPersonEntity(entity)) return entity
      const entityEmail = String(entity.attrs.email ?? '').trim().toLowerCase()
      if (entity.id === personId) {
        return patchPersonEntity(
          {
            ...entity,
            attrs: {
              ...entity.attrs,
              email: userEmail,
            },
          },
          userId,
        )
      }
      if (entityEmail === normalizedEmail) {
        return patchPersonEntity(
          {
            ...entity,
            attrs: {
              ...entity.attrs,
              email: '',
            },
          },
          '',
        )
      }
      return entity
    }),
  }

  const { error: linkError } = await client.from('user_person_links').upsert({
    tree_id: treeId,
    user_id: userId,
    person_id: personId,
    is_primary: true,
  })
  if (linkError) throw linkError

  await replaceNormalizedWithGraph(treeId, { previousGraph: graph, nextGraph })
  return nextGraph
}

export async function fetchPendingChangeRequests(treeId: string): Promise<ChangeRequest[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('change_requests')
    .select(
      'id, tree_id, requester_user_id, requester_email, action_type, summary, payload, target_person_id, target_relationship_id, status, review_note, created_at',
    )
    .eq('tree_id', treeId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) throw error

  return (data ?? []).map((row) => ({
    id: row.id,
    treeId: row.tree_id,
    requesterUserId: row.requester_user_id,
    requesterEmail: row.requester_email,
    actionType: row.action_type,
    summary: row.summary,
    payload: row.payload as GraphDiff,
    targetPersonId: row.target_person_id,
    targetRelationshipId: row.target_relationship_id,
    status: row.status,
    reviewNote: row.review_note ?? '',
    createdAt: row.created_at,
  }))
}

export async function submitChangeRequest(input: {
  treeId: string
  requesterUserId: string
  requesterEmail: string
  actionType: string
  summary: string
  payload: GraphDiff
  targetPersonId?: string | null
  targetRelationshipId?: string | null
}): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.from('change_requests').insert({
    tree_id: input.treeId,
    requester_user_id: input.requesterUserId,
    requester_email: input.requesterEmail,
    action_type: input.actionType,
    summary: input.summary,
    payload: input.payload,
    target_person_id: input.targetPersonId ?? null,
    target_relationship_id: input.targetRelationshipId ?? null,
    status: 'pending',
  })
  if (error) throw error
}

export async function reviewChangeRequest(input: {
  request: ChangeRequest
  approve: boolean
  currentGraph: GraphSchema
}): Promise<GraphSchema> {
  const client = requireSupabase()

  if (input.approve) {
    await replaceNormalizedWithGraph(input.request.treeId, {
      previousGraph: input.currentGraph,
      nextGraph: input.request.payload.nextGraph,
    })
  }

  const { error } = await client
    .from('change_requests')
    .update({
      status: input.approve ? 'approved' : 'rejected',
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', input.request.id)
  if (error) throw error

  return input.approve ? input.request.payload.nextGraph : input.currentGraph
}

export function makeChangeRequestPayload(
  treeId: string,
  previousGraph: GraphSchema,
  nextGraph: GraphSchema,
): GraphDiff {
  return computeGraphDiff(treeId, previousGraph, nextGraph)
}

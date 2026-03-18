import type { User } from '@supabase/supabase-js'
import { sampleGraph } from './sampleGraph'
import { supabase } from './supabase'
import type { GraphSchema } from '../domain/graph'

export type TreeAccess = {
  id: string
  name: string
  graph: GraphSchema
  role: 'admin' | 'editor' | 'viewer'
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  return supabase
}

function graphForTree(graph: GraphSchema | null | undefined, treeName: string, userId: string): GraphSchema {
  return {
    ...(graph ?? sampleGraph),
    rootOwnerId: userId,
    metadata: {
      ...(graph?.metadata ?? sampleGraph.metadata),
      treeName,
      source: 'supabase',
    },
  }
}

export async function fetchPrimaryTreeAccess(userId: string): Promise<TreeAccess | null> {
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
    .select('id, name, graph')
    .eq('id', membership.tree_id)
    .maybeSingle()

  if (treeError) {
    throw treeError
  }

  if (!tree) return null

  return {
    id: tree.id,
    name: tree.name,
    graph: graphForTree(tree.graph as GraphSchema | null | undefined, tree.name, userId),
    role: membership.role,
  }
}

export async function createPrimaryTree(user: User, name = 'வம்சம்'): Promise<TreeAccess> {
  const client = requireSupabase()
  const graph = graphForTree(sampleGraph, name, user.id)

  const { data: treeInsert, error: treeError } = await client
    .from('trees')
    .insert({
      name,
      created_by: user.id,
      graph,
    })
    .select('id')
    .single()

  if (treeError) {
    throw treeError
  }

  const { error: memberError } = await client.from('tree_members').insert({
    tree_id: treeInsert.id,
    user_id: user.id,
    role: 'admin',
  })

  if (memberError) {
    throw memberError
  }

  const tree = await fetchPrimaryTreeAccess(user.id)
  if (!tree) {
    throw new Error('Tree was created, but could not be loaded afterward.')
  }

  return tree
}

export async function savePrimaryTreeGraph(treeId: string, graph: GraphSchema): Promise<void> {
  const client = requireSupabase()
  const { error } = await client
    .from('trees')
    .update({
      graph,
      updated_at: new Date().toISOString(),
    })
    .eq('id', treeId)

  if (error) {
    throw error
  }
}

export async function resetPrimaryTreeGraph(
  treeId: string,
  treeName: string,
  userId: string,
): Promise<GraphSchema> {
  const graph = graphForTree(sampleGraph, treeName, userId)
  await savePrimaryTreeGraph(treeId, graph)
  return graph
}

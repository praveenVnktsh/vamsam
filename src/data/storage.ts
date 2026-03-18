import { openDB } from 'idb'
import type { GraphSchema } from '../domain/graph'

const DB_NAME = 'family-tree-db'
const STORE_NAME = 'graphs'
const GRAPH_KEY = 'workspace'

async function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    },
  })
}

export async function loadGraph(): Promise<GraphSchema | null> {
  const db = await getDb()
  const graph = await db.get(STORE_NAME, GRAPH_KEY)
  return (graph as GraphSchema | undefined) ?? null
}

export async function saveGraph(graph: GraphSchema): Promise<void> {
  const db = await getDb()
  await db.put(STORE_NAME, graph, GRAPH_KEY)
}

export async function clearGraph(): Promise<void> {
  const db = await getDb()
  await db.delete(STORE_NAME, GRAPH_KEY)
}

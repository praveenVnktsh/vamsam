import { openDB } from 'idb'
import type { GraphSchema } from '../domain/graph'

const DB_NAME = 'family-tree-db'
const STORE_NAME = 'graphs'
const GRAPH_KEY = 'workspace'
const SNAPSHOT_STORE_NAME = 'snapshots'
const PUBLISHED_KEY_PREFIX = 'published:'

export type GraphSnapshot = {
  id: string
  treeId: string
  createdAt: string
  graph: GraphSchema
}

async function getDb() {
  return openDB(DB_NAME, 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE_NAME)) {
        const snapshotStore = db.createObjectStore(SNAPSHOT_STORE_NAME, {
          keyPath: 'id',
        })
        snapshotStore.createIndex('treeId', 'treeId')
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

export async function loadRecentSnapshots(
  treeId: string,
  limit = 10,
): Promise<GraphSnapshot[]> {
  const db = await getDb()
  const snapshots = ((await db.getAllFromIndex(
    SNAPSHOT_STORE_NAME,
    'treeId',
    treeId,
  )) as GraphSnapshot[])
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )
    .slice(0, limit)

  return snapshots
}

export async function saveGraphSnapshot(
  treeId: string,
  graph: GraphSchema,
  maxSnapshots = 10,
): Promise<void> {
  const db = await getDb()
  const snapshot: GraphSnapshot = {
    id: `${treeId}:${Date.now()}`,
    treeId,
    createdAt: new Date().toISOString(),
    graph,
  }

  const tx = db.transaction(SNAPSHOT_STORE_NAME, 'readwrite')
  await tx.store.put(snapshot)

  const existing = ((await tx.store.index('treeId').getAll(treeId)) as GraphSnapshot[]).sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  )

  for (const stale of existing.slice(maxSnapshots)) {
    await tx.store.delete(stale.id)
  }

  await tx.done
}

export async function publishGraphSnapshot(
  treeId: string,
  graph: GraphSchema,
): Promise<GraphSnapshot> {
  const db = await getDb()
  const snapshot: GraphSnapshot = {
    id: `${PUBLISHED_KEY_PREFIX}${treeId}`,
    treeId,
    createdAt: new Date().toISOString(),
    graph: JSON.parse(JSON.stringify(graph)),
  }
  await db.put(SNAPSHOT_STORE_NAME, snapshot)
  return snapshot
}

export async function loadPublishedSnapshot(
  treeId: string,
): Promise<GraphSnapshot | null> {
  const db = await getDb()
  const snapshot = await db.get(
    SNAPSHOT_STORE_NAME,
    `${PUBLISHED_KEY_PREFIX}${treeId}`,
  )
  return (snapshot as GraphSnapshot | undefined) ?? null
}

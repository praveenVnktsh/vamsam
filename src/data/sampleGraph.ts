import baseGraph from './defaults/default-family-graph.json'
import esBranch from './defaults/es-branch.json'
import iyengarSiblings from './defaults/iyengar-siblings.json'
import type { GraphSchema } from '../domain/graph'

const mergedGraph = {
  ...(baseGraph as GraphSchema),
  metadata: {
    ...(baseGraph as GraphSchema).metadata,
    source: 'user spreadsheet',
  },
  entities: [
    ...(baseGraph as GraphSchema).entities,
    ...((esBranch as { entities: GraphSchema['entities'] }).entities ?? []),
    ...((iyengarSiblings as { entities: GraphSchema['entities'] }).entities ?? []),
  ],
  edges: [
    ...(baseGraph as GraphSchema).edges,
    ...((esBranch as { edges: GraphSchema['edges'] }).edges ?? []),
    ...((iyengarSiblings as { edges: GraphSchema['edges'] }).edges ?? []),
  ],
} satisfies GraphSchema

export const sampleGraph = mergedGraph

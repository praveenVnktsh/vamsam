import { useEffect, useMemo } from 'react'
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge as FlowEdge,
  type NodeChange,
  type Node as FlowNode,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { EdgePredicate, type GraphSchema } from '../../domain/graph'
import { graphPeople, personMap, type PersonView } from '../../domain/graphOps'

const X_SCALE = 10
const Y_SCALE = 7
const SNAP_GRID: [number, number] = [24, 24]

function snapTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

type TreeCanvasProps = {
  graph: GraphSchema
  visibleIds: Set<string>
  visibleEdges: GraphSchema['edges']
  selectedPersonId: string
  selectedEdgeId: string | null
  layoutMode: 'person' | 'family'
  onSelectPerson: (id: string) => void
  onSelectEdge: (id: string | null) => void
  onMovePerson: (id: string, x: number, y: number) => void
  onMoveFamily: (memberIds: string[], dx: number, dy: number) => void
}

type PersonNodeData = {
  person: PersonView
  selected: boolean
}

type UnionNodeData = {
  label: string
}

type FamilyNodeData = {
  leftPerson: PersonView
  rightPerson: PersonView
  selectedPersonId: string
  onSelectPerson: (id: string) => void
  avgX: number
  avgY: number
  memberIds: string[]
}

type FlowCanvasNode = FlowNode<PersonNodeData | UnionNodeData | FamilyNodeData>

function PersonNode({ data }: { data: PersonNodeData }) {
  const { person, selected } = data

  return (
    <div className={selected ? 'flow-person-card selected' : 'flow-person-card'}>
      <Handle id="top" type="target" position={Position.Top} className="flow-handle" />
      <Handle id="left" type="target" position={Position.Left} className="flow-handle" />
      <Handle id="bottom" type="source" position={Position.Bottom} className="flow-handle" />
      <Handle id="right" type="source" position={Position.Right} className="flow-handle" />
      <span className="flow-person-photo">{person.photo}</span>
      <div>
        <strong>{person.preferredName}</strong>
        <small>{person.years}</small>
      </div>
    </div>
  )
}

function UnionNode({ data }: { data: UnionNodeData }) {
  return (
    <div className="flow-union-node" aria-label={data.label}>
      <Handle id="top" type="target" position={Position.Top} className="flow-handle" />
      <Handle id="left" type="target" position={Position.Left} className="flow-handle" />
      <Handle id="bottom" type="source" position={Position.Bottom} className="flow-handle" />
      <Handle id="right" type="source" position={Position.Right} className="flow-handle" />
    </div>
  )
}

function FamilyNode({ data }: { data: FamilyNodeData }) {
  const { leftPerson, rightPerson, selectedPersonId, onSelectPerson } = data

  return (
    <div className="flow-family-card">
      <Handle id="top" type="target" position={Position.Top} className="flow-handle" />
      <Handle id="bottom" type="source" position={Position.Bottom} className="flow-handle" />
      <div className="flow-family-card__members">
        {[leftPerson, rightPerson].map((person) => (
          <button
            key={person.id}
            type="button"
            className={
              person.id === selectedPersonId
                ? 'flow-family-person active'
                : 'flow-family-person'
            }
            onClick={(event) => {
              event.stopPropagation()
              onSelectPerson(person.id)
            }}
          >
            <span className="flow-person-photo">{person.photo}</span>
            <span>
              <strong>{person.preferredName}</strong>
              <small>{person.years}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

const nodeTypes = {
  person: PersonNode,
  union: UnionNode,
  family: FamilyNode,
}

function edgeStyle(predicate: EdgePredicate) {
  if (predicate === EdgePredicate.PARENT_OF) {
    return { stroke: 'rgba(26, 59, 66, 0.88)', strokeWidth: 2.5 }
  }

  if (predicate === EdgePredicate.PARTNER_OF) {
    return { stroke: 'rgba(191, 101, 43, 0.96)', strokeWidth: 2.5 }
  }

  if (
    predicate === EdgePredicate.GUARDIAN_OF ||
    predicate === EdgePredicate.STEP_PARENT_OF
  ) {
    return {
      stroke: 'rgba(102, 86, 130, 0.9)',
      strokeWidth: 2.5,
      strokeDasharray: '8 5',
    }
  }

  return { stroke: 'rgba(84, 95, 87, 0.88)', strokeWidth: 2.5 }
}

function recomputeUnionNodes(
  nodes: FlowCanvasNode[],
  visibleEdges: GraphSchema['edges'],
): FlowCanvasNode[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))

  return nodes.map((node) => {
    if (node.type !== 'union') return node

    const partnerEdgeId = node.id.replace('union:', '')
    const partnerEdge = visibleEdges.find((edge) => edge.id === partnerEdgeId)
    if (!partnerEdge) return node

    const leftNode = nodeMap.get(partnerEdge.src)
    const rightNode = nodeMap.get(partnerEdge.dst)
    if (!leftNode || !rightNode) return node

    return {
      ...node,
      position: {
        x: (leftNode.position.x + rightNode.position.x) / 2,
        y: (leftNode.position.y + rightNode.position.y) / 2 + 18,
      },
    }
  })
}

export function TreeCanvas({
  graph,
  visibleIds,
  visibleEdges,
  selectedPersonId,
  selectedEdgeId,
  layoutMode,
  onSelectPerson,
  onSelectEdge,
  onMovePerson,
  onMoveFamily,
}: TreeCanvasProps) {
  const people = useMemo(
    () => graphPeople(graph).filter((person) => visibleIds.has(person.id)),
    [graph, visibleIds],
  )

  const familyUnits = useMemo(() => {
    const peopleById = personMap(people)

    return visibleEdges
      .filter(
        (edge) =>
          edge.predicate === EdgePredicate.PARTNER_OF &&
          peopleById.has(edge.src) &&
          peopleById.has(edge.dst),
      )
      .map((edge) => {
        const leftPerson = peopleById.get(edge.src)
        const rightPerson = peopleById.get(edge.dst)
        if (!leftPerson || !rightPerson) return null

        return {
          id: `family:${edge.id}`,
          edgeId: edge.id,
          leftPerson,
          rightPerson,
          memberIds: [leftPerson.id, rightPerson.id],
          avgX: (leftPerson.x + rightPerson.x) / 2,
          avgY: (leftPerson.y + rightPerson.y) / 2,
        }
      })
      .filter(Boolean) as Array<{
      id: string
      edgeId: string
      leftPerson: PersonView
      rightPerson: PersonView
      memberIds: string[]
      avgX: number
      avgY: number
    }>
  }, [people, visibleEdges])

  const familyByMemberId = useMemo(() => {
    const map = new Map<string, (typeof familyUnits)[number]>()
    for (const unit of familyUnits) {
      for (const memberId of unit.memberIds) {
        map.set(memberId, unit)
      }
    }
    return map
  }, [familyUnits])

  const flowNodes = useMemo<FlowNode<PersonNodeData | UnionNodeData | FamilyNodeData>[]>(() => {
    if (layoutMode === 'family') {
      const unitMemberIds = new Set(familyUnits.flatMap((unit) => unit.memberIds))
      const singlePersonNodes: FlowNode<PersonNodeData>[] = people
        .filter((person) => !unitMemberIds.has(person.id))
        .map((person) => ({
          id: person.id,
          type: 'person',
          position: { x: person.x * X_SCALE, y: person.y * Y_SCALE },
          draggable: true,
          selectable: true,
          data: {
            person,
            selected: person.id === selectedPersonId,
          },
        }))

      const familyNodes: FlowNode<FamilyNodeData>[] = familyUnits.map((unit) => ({
        id: unit.id,
        type: 'family',
        position: { x: unit.avgX * X_SCALE, y: unit.avgY * Y_SCALE },
        draggable: true,
        selectable: true,
        data: {
          leftPerson: unit.leftPerson,
          rightPerson: unit.rightPerson,
          selectedPersonId,
          onSelectPerson,
          avgX: unit.avgX,
          avgY: unit.avgY,
          memberIds: unit.memberIds,
        },
      }))

      return [...singlePersonNodes, ...familyNodes]
    }

    const personNodes: FlowNode<PersonNodeData>[] = people.map((person) => ({
      id: person.id,
      type: 'person',
      position: { x: person.x * X_SCALE, y: person.y * Y_SCALE },
      draggable: true,
      selectable: true,
      data: {
        person,
        selected: person.id === selectedPersonId,
      },
    }))

    const peopleById = personMap(people)
    const partnerEdges = visibleEdges.filter(
      (edge) =>
        edge.predicate === EdgePredicate.PARTNER_OF &&
        peopleById.has(edge.src) &&
        peopleById.has(edge.dst),
    )

    const unionNodes: FlowNode<UnionNodeData>[] = partnerEdges.flatMap((edge) => {
      const leftPerson = peopleById.get(edge.src)
      const rightPerson = peopleById.get(edge.dst)
      if (!leftPerson || !rightPerson) return []

      const sharedChildren = visibleEdges.filter((candidate) => {
        if (
          candidate.predicate !== EdgePredicate.PARENT_OF &&
          candidate.predicate !== EdgePredicate.GUARDIAN_OF &&
          candidate.predicate !== EdgePredicate.STEP_PARENT_OF
        ) {
          return false
        }

        const firstMatches =
          candidate.src === leftPerson.id &&
          visibleEdges.some(
            (other) =>
              other.id !== candidate.id &&
              other.dst === candidate.dst &&
              other.src === rightPerson.id &&
              (other.predicate === EdgePredicate.PARENT_OF ||
                other.predicate === EdgePredicate.GUARDIAN_OF ||
                other.predicate === EdgePredicate.STEP_PARENT_OF),
          )

        return firstMatches
      })

      if (sharedChildren.length === 0) return []

      return [
        {
          id: `union:${edge.id}`,
          type: 'union',
          draggable: false,
          selectable: false,
          position: {
            x: ((leftPerson.x + rightPerson.x) / 2) * X_SCALE,
            y: ((leftPerson.y + rightPerson.y) / 2) * Y_SCALE + 18,
          },
          data: {
            label: `${leftPerson.preferredName} and ${rightPerson.preferredName}`,
          },
        },
      ]
    })

    return [...personNodes, ...unionNodes]
  }, [familyUnits, layoutMode, onSelectPerson, people, selectedPersonId, visibleEdges])

  const flowEdges = useMemo<FlowEdge[]>(() => {
    if (layoutMode === 'family') {
      const directEdges: FlowEdge[] = []
      const mergedFamilyChildEdges = new Map<string, FlowEdge>()

      for (const edge of visibleEdges) {
        if (edge.predicate === EdgePredicate.PARTNER_OF) continue

        const family = familyByMemberId.get(edge.src)
        if (
          family &&
          (edge.predicate === EdgePredicate.PARENT_OF ||
            edge.predicate === EdgePredicate.GUARDIAN_OF ||
            edge.predicate === EdgePredicate.STEP_PARENT_OF)
        ) {
          const mergedId = `family-child:${family.id}:${edge.dst}:${edge.predicate}`
          if (!mergedFamilyChildEdges.has(mergedId)) {
            mergedFamilyChildEdges.set(mergedId, {
              id: mergedId,
              source: family.id,
              target: edge.dst,
              sourceHandle: 'bottom',
              targetHandle: 'top',
              type: 'simplebezier',
              label: selectedEdgeId === mergedId ? edge.predicate.replaceAll('_', ' ') : '',
              markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20 },
              animated: false,
              style: edgeStyle(edge.predicate),
              labelStyle: {
                fontSize: 12,
                fill: '#18333d',
                fontWeight: 600,
              },
              labelBgStyle: {
                fill: 'rgba(255, 248, 240, 0.96)',
                fillOpacity: 1,
              },
              labelBgPadding: [6, 4],
              labelBgBorderRadius: 6,
              selected: selectedEdgeId === mergedId,
            })
          }
          continue
        }

        if (familyByMemberId.has(edge.src) || familyByMemberId.has(edge.dst)) {
          continue
        }

        directEdges.push({
          id: edge.id,
          source: edge.src,
          target: edge.dst,
          sourceHandle: 'bottom',
          targetHandle: 'top',
          type: 'simplebezier',
          label: edge.id === selectedEdgeId ? edge.predicate.replaceAll('_', ' ') : '',
          markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20 },
          animated: false,
          style: edgeStyle(edge.predicate),
          labelStyle: {
            fontSize: 12,
            fill: '#18333d',
            fontWeight: 600,
          },
          labelBgStyle: {
            fill: 'rgba(255, 248, 240, 0.96)',
            fillOpacity: 1,
          },
          labelBgPadding: [6, 4],
          labelBgBorderRadius: 6,
          selected: edge.id === selectedEdgeId,
        })
      }

      return [...Array.from(mergedFamilyChildEdges.values()), ...directEdges]
    }

    const peopleById = personMap(people)
    const partnerEdges = visibleEdges.filter(
      (edge) =>
        edge.predicate === EdgePredicate.PARTNER_OF &&
        peopleById.has(edge.src) &&
        peopleById.has(edge.dst),
    )

    const childToUnion = new Map<string, { unionId: string; predicate: EdgePredicate }>()
    const unionConnectorEdges: FlowEdge[] = []

    for (const edge of partnerEdges) {
      const leftPerson = peopleById.get(edge.src)
      const rightPerson = peopleById.get(edge.dst)
      if (!leftPerson || !rightPerson) continue

      const sharedChildEdges = visibleEdges.filter((candidate) => {
        if (
          candidate.predicate !== EdgePredicate.PARENT_OF &&
          candidate.predicate !== EdgePredicate.GUARDIAN_OF &&
          candidate.predicate !== EdgePredicate.STEP_PARENT_OF
        ) {
          return false
        }

        return (
          candidate.src === leftPerson.id &&
          visibleEdges.some(
            (other) =>
              other.id !== candidate.id &&
              other.dst === candidate.dst &&
              other.src === rightPerson.id &&
              (other.predicate === EdgePredicate.PARENT_OF ||
                other.predicate === EdgePredicate.GUARDIAN_OF ||
                other.predicate === EdgePredicate.STEP_PARENT_OF),
          )
        )
      })

      unionConnectorEdges.push({
        id: edge.id,
        source: leftPerson.id,
        target: rightPerson.id,
        sourceHandle: 'right',
        targetHandle: 'left',
        type: 'simplebezier',
        style: edgeStyle(EdgePredicate.PARTNER_OF),
        selected: edge.id === selectedEdgeId,
      })

      if (sharedChildEdges.length === 0) continue

      const unionId = `union:${edge.id}`

      for (const childEdge of sharedChildEdges) {
        if (!childToUnion.has(childEdge.dst)) {
          childToUnion.set(childEdge.dst, { unionId, predicate: childEdge.predicate })
        }
      }
    }

    const directEdges = visibleEdges.flatMap((edge) => {
      if (!peopleById.has(edge.src) || !peopleById.has(edge.dst)) return []
      if (edge.predicate === EdgePredicate.PARTNER_OF) return []
      if (childToUnion.has(edge.dst) && childToUnion.get(edge.dst)?.predicate === edge.predicate) {
        return []
      }

      return [
        {
          id: edge.id,
          source: edge.src,
          target: edge.dst,
          sourceHandle: 'bottom',
          targetHandle: 'top',
          type: 'simplebezier',
          label: edge.id === selectedEdgeId ? edge.predicate.replaceAll('_', ' ') : '',
          markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20 },
          animated: false,
          style: edgeStyle(edge.predicate),
          labelStyle: {
            fontSize: 12,
            fill: '#18333d',
            fontWeight: 600,
          },
          labelBgStyle: {
            fill: 'rgba(255, 248, 240, 0.96)',
            fillOpacity: 1,
          },
          labelBgPadding: [6, 4],
          labelBgBorderRadius: 6,
          selected: edge.id === selectedEdgeId,
        } satisfies FlowEdge,
      ]
    })

    const mergedChildEdges: FlowEdge[] = Array.from(childToUnion.entries()).map(
      ([childId, union]) => ({
        id: `merged:${union.unionId}:${childId}`,
        source: union.unionId,
        target: childId,
        sourceHandle: 'bottom',
        targetHandle: 'top',
        type: 'simplebezier',
        label:
          selectedEdgeId === `merged:${union.unionId}:${childId}`
            ? union.predicate.replaceAll('_', ' ')
            : '',
        markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20 },
        animated: false,
        style: edgeStyle(union.predicate),
        labelStyle: {
          fontSize: 12,
          fill: '#18333d',
          fontWeight: 600,
        },
        labelBgStyle: {
          fill: 'rgba(255, 248, 240, 0.96)',
          fillOpacity: 1,
        },
        labelBgPadding: [6, 4],
        labelBgBorderRadius: 6,
        selected: selectedEdgeId === `merged:${union.unionId}:${childId}`,
      }),
    )

    return [...unionConnectorEdges, ...directEdges, ...mergedChildEdges]
  }, [familyByMemberId, layoutMode, people, selectedEdgeId, visibleEdges])

  const [nodes, setNodes] = useNodesState(flowNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges)

  useEffect(() => {
    setNodes(flowNodes)
  }, [flowNodes, setNodes])

  useEffect(() => {
    setEdges(flowEdges)
  }, [flowEdges, setEdges])

  return (
    <div className="canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodeOrigin={[0.5, 0.5]}
        snapToGrid
        snapGrid={SNAP_GRID}
        selectNodesOnDrag={false}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        panOnDrag
        panOnScroll
        zoomOnPinch
        zoomOnScroll={false}
        minZoom={0.35}
        maxZoom={1.6}
        defaultViewport={{ x: 40, y: 40, zoom: 0.9 }}
        onNodeClick={(_, node) => {
          if (node.type === 'person') {
            onSelectPerson(node.id)
          }
        }}
        onPaneClick={() => onSelectEdge(null)}
        onEdgeClick={(_, edge) => onSelectEdge(edge.id)}
        onNodesChange={(changes: NodeChange[]) => {
          setNodes((current) => {
            const next = applyNodeChanges(changes, current)
            return layoutMode === 'family' ? next : recomputeUnionNodes(next, visibleEdges)
          })
        }}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={(_, node) => {
          const snappedX = snapTo(node.position.x, SNAP_GRID[0])
          const snappedY = snapTo(node.position.y, SNAP_GRID[1])
          if (node.type === 'family') {
            const data = node.data as FamilyNodeData
            onMoveFamily(
              data.memberIds,
              snappedX / X_SCALE - data.avgX,
              snappedY / Y_SCALE - data.avgY,
            )
            return
          }

          onMovePerson(node.id, snappedX / X_SCALE, snappedY / Y_SCALE)
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          gap={SNAP_GRID[0]}
          size={1}
          color="rgba(72, 77, 67, 0.12)"
          variant={BackgroundVariant.Lines}
        />
        <Background
          gap={SNAP_GRID[0] * 5}
          size={1}
          color="rgba(72, 77, 67, 0.18)"
          variant={BackgroundVariant.Lines}
        />
        <Controls />
      </ReactFlow>
    </div>
  )
}

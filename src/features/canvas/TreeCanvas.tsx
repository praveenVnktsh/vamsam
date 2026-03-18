import { useEffect, useMemo, useRef } from 'react'
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
  type ReactFlowInstance,
  type Edge as FlowEdge,
  type NodeChange,
  type Node as FlowNode,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { EdgePredicate, type GraphSchema } from '../../domain/graph'
import { displayName, graphPeople, personMap, type PersonView } from '../../domain/graphOps'

const X_SCALE = 10
const Y_SCALE = 7
const SNAP_GRID: [number, number] = [24, 24]

function snapTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

type TreeCanvasProps = {
  graph: GraphSchema
  visibleIds: Set<string>
  deemphasizedIds: Set<string>
  visibleEdges: GraphSchema['edges']
  highlightedEdgeIds: Set<string>
  selectedPersonId: string
  selectedEdgeId: string | null
  layoutMode: 'person' | 'family'
  autoCenter: boolean
  flyToPersonRequest: { nonce: number; personId: string } | null
  onSelectPerson: (id: string) => void
  onSelectEdge: (id: string | null) => void
  onMovePerson: (id: string, x: number, y: number) => void
  onMoveFamily: (memberIds: string[], dx: number, dy: number) => void
  onPersonQuickAction: (
    personId: string,
    action: 'parent' | 'child' | 'partner' | 'sibling' | 'delete',
  ) => void
}

type PersonNodeData = {
  person: PersonView
  selected: boolean
  deemphasized: boolean
  onQuickAction: (
    personId: string,
    action: 'parent' | 'child' | 'partner' | 'sibling' | 'delete',
  ) => void
}

type UnionNodeData = {
  label: string
}

type FamilyNodeData = {
  leftPerson: PersonView
  rightPerson: PersonView
  selectedPersonId: string
  onSelectPerson: (id: string) => void
  deemphasizedIds: Set<string>
  avgX: number
  avgY: number
  memberIds: string[]
  onQuickAction: (
    personId: string,
    action: 'parent' | 'child' | 'partner' | 'sibling' | 'delete',
  ) => void
}

type FlowCanvasNode = FlowNode<PersonNodeData | UnionNodeData | FamilyNodeData>

function sexToneClass(sex: string) {
  const normalized = sex.trim().toLowerCase()
  if (normalized === 'female') return 'sex-female'
  if (normalized === 'male') return 'sex-male'
  return 'sex-unspecified'
}

function PersonNode({ data }: { data: PersonNodeData }) {
  const { person, selected, deemphasized, onQuickAction } = data

  return (
    <div
      className={`${selected ? 'flow-person-card selected' : 'flow-person-card'} ${sexToneClass(person.sex)}${deemphasized ? ' deemphasized' : ''}`}
    >
      <div className="flow-card-actions" role="toolbar" aria-label={`Quick actions for ${displayName(person)}`}>
        <button type="button" title="Add parent" aria-label="Add parent" onClick={(event) => { event.stopPropagation(); onQuickAction(person.id, 'parent') }}>↑</button>
        <button type="button" title="Add child" aria-label="Add child" onClick={(event) => { event.stopPropagation(); onQuickAction(person.id, 'child') }}>↓</button>
        <button type="button" title="Add sibling" aria-label="Add sibling" onClick={(event) => { event.stopPropagation(); onQuickAction(person.id, 'sibling') }}>≋</button>
        <button type="button" title="Add partner" aria-label="Add partner" onClick={(event) => { event.stopPropagation(); onQuickAction(person.id, 'partner') }}>↔</button>
        <button type="button" title="Delete node" aria-label="Delete node" className="danger" onClick={(event) => { event.stopPropagation(); onQuickAction(person.id, 'delete') }}>×</button>
      </div>
      <Handle id="top" type="target" position={Position.Top} className="flow-handle" />
      <Handle id="left" type="target" position={Position.Left} className="flow-handle" />
      <Handle id="bottom" type="source" position={Position.Bottom} className="flow-handle" />
      <Handle id="right" type="source" position={Position.Right} className="flow-handle" />
      <span className="flow-person-photo">{person.photo}</span>
      <div>
        <strong>{displayName(person)}</strong>
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
  const { leftPerson, rightPerson, selectedPersonId, onSelectPerson, deemphasizedIds, onQuickAction } = data

  return (
    <div className="flow-family-card">
      <Handle id="top" type="target" position={Position.Top} className="flow-handle" />
      <Handle id="bottom" type="source" position={Position.Bottom} className="flow-handle" />
      <div className="flow-family-card__members">
        {[leftPerson, rightPerson].map((person) => (
          <div
            key={person.id}
            className={
              person.id === selectedPersonId
                ? `flow-family-person-shell active ${sexToneClass(person.sex)}${deemphasizedIds.has(person.id) ? ' deemphasized' : ''}`
                : `flow-family-person-shell ${sexToneClass(person.sex)}${deemphasizedIds.has(person.id) ? ' deemphasized' : ''}`
            }
          >
            <div className="flow-card-actions flow-card-actions-inline" role="toolbar" aria-label={`Quick actions for ${displayName(person)}`}>
              <button type="button" title="Add parent" aria-label="Add parent" onClick={(event) => { event.stopPropagation(); onQuickAction(person.id, 'parent') }}>↑</button>
              <button type="button" title="Add child" aria-label="Add child" onClick={(event) => { event.stopPropagation(); onQuickAction(person.id, 'child') }}>↓</button>
              <button type="button" title="Add sibling" aria-label="Add sibling" onClick={(event) => { event.stopPropagation(); onQuickAction(person.id, 'sibling') }}>≋</button>
              <button type="button" title="Add partner" aria-label="Add partner" onClick={(event) => { event.stopPropagation(); onQuickAction(person.id, 'partner') }}>↔</button>
              <button type="button" title="Delete node" aria-label="Delete node" className="danger" onClick={(event) => { event.stopPropagation(); onQuickAction(person.id, 'delete') }}>×</button>
            </div>
            <button
              type="button"
              className={`flow-family-person ${sexToneClass(person.sex)}`}
              onClick={(event) => {
                event.stopPropagation()
                onSelectPerson(person.id)
              }}
            >
              <span className="flow-person-photo">{person.photo}</span>
              <span>
                <strong>{displayName(person)}</strong>
                <small>{person.years}</small>
              </span>
            </button>
          </div>
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

function familyConnectionStyle(predicate: EdgePredicate) {
  const base = edgeStyle(predicate)
  return {
    ...base,
    stroke:
      predicate === EdgePredicate.PARTNER_OF
        ? 'rgba(191, 101, 43, 0.48)'
        : predicate === EdgePredicate.PARENT_OF
          ? 'rgba(26, 59, 66, 0.4)'
          : 'rgba(84, 95, 87, 0.42)',
    strokeWidth: 1.6,
  }
}

function deemphasizedEdgeStyle(predicate: EdgePredicate) {
  const base = edgeStyle(predicate)
  return {
    ...base,
    stroke: base.stroke.replace(/0\.\d+\)/, '0.28)'),
    strokeWidth: 1.6,
  }
}

function highlightedEdgeStyle(predicate: EdgePredicate) {
  const base = edgeStyle(predicate)
  return {
    ...base,
    stroke: predicate === EdgePredicate.PARTNER_OF ? '#d06a2a' : '#1a73e8',
    strokeWidth: 3.6,
  }
}

function edgeMarker(predicate: EdgePredicate) {
  const style = edgeStyle(predicate)
  return {
    type: MarkerType.ArrowClosed,
    width: 14,
    height: 14,
    color: style.stroke,
  }
}

function highlightedEdgeMarker(predicate: EdgePredicate) {
  const style = highlightedEdgeStyle(predicate)
  return {
    type: MarkerType.ArrowClosed,
    width: 14,
    height: 14,
    color: style.stroke,
  }
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
  deemphasizedIds,
  visibleEdges,
  highlightedEdgeIds,
  selectedPersonId,
  selectedEdgeId,
  layoutMode,
  autoCenter,
  flyToPersonRequest,
  onSelectPerson,
  onSelectEdge,
  onMovePerson,
  onMoveFamily,
  onPersonQuickAction,
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
            deemphasized: deemphasizedIds.has(person.id),
            onQuickAction: onPersonQuickAction,
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
          deemphasizedIds,
          avgX: unit.avgX,
          avgY: unit.avgY,
          memberIds: unit.memberIds,
          onQuickAction: onPersonQuickAction,
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
        deemphasized: deemphasizedIds.has(person.id),
        onQuickAction: onPersonQuickAction,
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
            label: `${displayName(leftPerson)} and ${displayName(rightPerson)}`,
          },
        },
      ]
    })

    return [...personNodes, ...unionNodes]
  }, [familyUnits, layoutMode, onPersonQuickAction, onSelectPerson, people, selectedPersonId, visibleEdges])

  const flowEdges = useMemo<FlowEdge[]>(() => {
    if (layoutMode === 'family') {
      const directEdges: FlowEdge[] = []
      const mergedFamilyChildEdges = new Map<
        string,
        FlowEdge & { data?: { rawEdgeIds: string[] } }
      >()

      for (const edge of visibleEdges) {
        if (edge.predicate === EdgePredicate.PARTNER_OF) continue

        const sourceNodeId = familyByMemberId.get(edge.src)?.id ?? edge.src
        const targetNodeId = familyByMemberId.get(edge.dst)?.id ?? edge.dst
        if (sourceNodeId === targetNodeId) continue

        const family = familyByMemberId.get(edge.src)
        if (
          family &&
          (edge.predicate === EdgePredicate.PARENT_OF ||
            edge.predicate === EdgePredicate.GUARDIAN_OF ||
            edge.predicate === EdgePredicate.STEP_PARENT_OF)
        ) {
          const mergedId = `family-child:${sourceNodeId}:${targetNodeId}:${edge.predicate}`
          if (!mergedFamilyChildEdges.has(mergedId)) {
            mergedFamilyChildEdges.set(mergedId, {
              id: mergedId,
              source: sourceNodeId,
              target: targetNodeId,
              sourceHandle: 'bottom',
              targetHandle: 'top',
              type: 'simplebezier',
              label: selectedEdgeId === mergedId ? edge.predicate.replaceAll('_', ' ') : '',
              markerEnd: highlightedEdgeIds.has(edge.id)
                ? highlightedEdgeMarker(edge.predicate)
                : edgeMarker(edge.predicate),
              animated: false,
              style: highlightedEdgeIds.has(edge.id)
                ? highlightedEdgeStyle(edge.predicate)
                : familyConnectionStyle(edge.predicate),
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
              data: { rawEdgeIds: [edge.id] },
            })
          } else {
            const existing = mergedFamilyChildEdges.get(mergedId)
            if (existing) {
              existing.data = {
                rawEdgeIds: Array.from(new Set([...(existing.data?.rawEdgeIds ?? []), edge.id])),
              }
              const isHighlighted = existing.data.rawEdgeIds.some((rawId: string) =>
                highlightedEdgeIds.has(rawId),
              )
              existing.markerEnd = isHighlighted
                ? highlightedEdgeMarker(edge.predicate)
                : edgeMarker(edge.predicate)
              existing.style = isHighlighted
                ? highlightedEdgeStyle(edge.predicate)
                : familyConnectionStyle(edge.predicate)
            }
          }
          continue
        }

        directEdges.push({
          id: `${edge.id}:${sourceNodeId}:${targetNodeId}`,
          source: sourceNodeId,
          target: targetNodeId,
          sourceHandle: 'bottom',
          targetHandle: 'top',
          type: 'simplebezier',
          label:
            edge.id === selectedEdgeId ||
            `${edge.id}:${sourceNodeId}:${targetNodeId}` === selectedEdgeId
              ? edge.predicate.replaceAll('_', ' ')
              : '',
          markerEnd: highlightedEdgeIds.has(edge.id)
            ? highlightedEdgeMarker(edge.predicate)
            : edgeMarker(edge.predicate),
          animated: false,
          style: highlightedEdgeIds.has(edge.id)
            ? highlightedEdgeStyle(edge.predicate)
            : sourceNodeId.startsWith('family:') && targetNodeId.startsWith('family:')
              ? familyConnectionStyle(edge.predicate)
              : deemphasizedIds.has(edge.src) ||
                  deemphasizedIds.has(edge.dst)
                ? deemphasizedEdgeStyle(edge.predicate)
                : edgeStyle(edge.predicate),
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
          selected:
            edge.id === selectedEdgeId ||
            `${edge.id}:${sourceNodeId}:${targetNodeId}` === selectedEdgeId,
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

    const childToUnion = new Map<
      string,
      { unionId: string; predicate: EdgePredicate; edgeIds: string[] }
    >()
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
        style: highlightedEdgeIds.has(edge.id)
          ? highlightedEdgeStyle(EdgePredicate.PARTNER_OF)
          : edgeStyle(EdgePredicate.PARTNER_OF),
        selected: edge.id === selectedEdgeId,
      })

      if (sharedChildEdges.length === 0) continue

      const unionId = `union:${edge.id}`

      for (const childEdge of sharedChildEdges) {
        if (!childToUnion.has(childEdge.dst)) {
          childToUnion.set(childEdge.dst, {
            unionId,
            predicate: childEdge.predicate,
            edgeIds: [childEdge.id],
          })
        } else {
          const existing = childToUnion.get(childEdge.dst)
          if (existing) {
            existing.edgeIds = Array.from(new Set([...existing.edgeIds, childEdge.id]))
          }
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
          markerEnd: highlightedEdgeIds.has(edge.id)
            ? highlightedEdgeMarker(edge.predicate)
            : edgeMarker(edge.predicate),
          animated: false,
          style: highlightedEdgeIds.has(edge.id)
            ? highlightedEdgeStyle(edge.predicate)
            : edgeStyle(edge.predicate),
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
        markerEnd: union.edgeIds.some((edgeId) => highlightedEdgeIds.has(edgeId))
          ? highlightedEdgeMarker(union.predicate)
          : edgeMarker(union.predicate),
        animated: false,
        style: union.edgeIds.some((edgeId) => highlightedEdgeIds.has(edgeId))
          ? highlightedEdgeStyle(union.predicate)
          : edgeStyle(union.predicate),
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
  }, [deemphasizedIds, familyByMemberId, highlightedEdgeIds, layoutMode, people, selectedEdgeId, visibleEdges])

  const [nodes, setNodes] = useNodesState(flowNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges)
  const flowInstanceRef = useRef<ReactFlowInstance | null>(null)
  const handledFlyNonceRef = useRef<number | null>(null)

  useEffect(() => {
    setNodes(flowNodes)
  }, [flowNodes, setNodes])

  useEffect(() => {
    setEdges(flowEdges)
  }, [flowEdges, setEdges])

  useEffect(() => {
    if (!autoCenter) return
    const instance = flowInstanceRef.current
    if (!instance || nodes.length === 0) return

    requestAnimationFrame(() => {
      void instance.fitView({
        padding: 0.24,
        duration: 280,
        nodes: nodes.map((node) => ({ id: node.id })),
        maxZoom: 1.15,
      })
    })
  }, [autoCenter, nodes])

  useEffect(() => {
    if (!flyToPersonRequest?.personId) return
    if (handledFlyNonceRef.current === flyToPersonRequest.nonce) return
    const instance = flowInstanceRef.current
    if (!instance || nodes.length === 0) return

    const targetNode =
      nodes.find((node) => node.id === flyToPersonRequest.personId) ??
      nodes.find((node) => {
        if (node.type !== 'family') return false
        const data = node.data as FamilyNodeData
        return data.memberIds.includes(flyToPersonRequest.personId)
      })

    if (!targetNode) return
    handledFlyNonceRef.current = flyToPersonRequest.nonce

    requestAnimationFrame(() => {
      void instance.setCenter(targetNode.position.x, targetNode.position.y, {
        duration: 280,
        zoom: instance.getZoom(),
      })
    })
  }, [flyToPersonRequest, nodes])

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
        onInit={(instance) => {
          flowInstanceRef.current = instance
        }}
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

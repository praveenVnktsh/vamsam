import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import {
  displayName,
  graphPeople,
  personMap,
  quickBirthdayLabel,
  resolveRelationship,
  type PersonView,
} from '../../domain/graphOps'
import { PersonAvatar } from '../PersonAvatar'

const X_SCALE = 10
const Y_SCALE = 7
const SNAP_GRID: [number, number] = [24, 24]
const ORGANIC_PERSON_RADIUS = 118
const ORGANIC_FAMILY_RADIUS = 180
const HOVER_CARD_SHOW_DELAY_MS = 220

function snapTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

type TreeCanvasProps = {
  graph: GraphSchema
  visibleIds: Set<string>
  deemphasizedIds: Set<string>
  visibleEdges: GraphSchema['edges']
  highlightedEdgeIds: Set<string>
  highlightedNodeIds: Set<string>
  selectedPersonId: string
  selectedEdgeId: string | null
  layoutMode: 'person' | 'family'
  layoutAlgorithm: 'hierarchy' | 'organic'
  organicSeedNonce: number
  organicLiveSimulation: boolean
  autoCenter: boolean
  flyToPersonRequest: { nonce: number; personId: string } | null
  fitToNodeIdsRequest: { nonce: number; nodeIds: string[] } | null
  onSelectPerson: (id: string) => void
  onSelectedPersonAnchorChange?: (anchor: { x: number; y: number } | null) => void
  onSelectEdge: (id: string | null) => void
  currentViewerPerson: PersonView | null
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
  highlighted: boolean
  deemphasized: boolean
  relationToViewer: string
  onSelectPerson: (id: string) => void
  onHoverStart: (person: PersonView, element: HTMLElement, buttons: number) => void
  onHoverEnd: () => void
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
  highlightedNodeIds: Set<string>
  onSelectPerson: (id: string) => void
  deemphasizedIds: Set<string>
  relationLabelsById: Map<string, string>
  avgX: number
  avgY: number
  memberIds: string[]
  onHoverStart: (person: PersonView, element: HTMLElement, buttons: number) => void
  onHoverEnd: () => void
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

function GlobalHoverCard({
  graph,
  person,
  currentViewerPerson,
  onSelectPerson,
  onQuickAction,
  onMouseEnter,
  onMouseLeave,
}: {
  graph: GraphSchema
  person: PersonView
  currentViewerPerson: PersonView | null
  onSelectPerson: (id: string) => void
  onQuickAction: (
    personId: string,
    action: 'parent' | 'child' | 'partner' | 'sibling' | 'delete',
  ) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  const birthdayLabel = quickBirthdayLabel(person.dob)
  const relationshipToViewer =
    currentViewerPerson && currentViewerPerson.id !== person.id
      ? resolveRelationship(graph, person.id, currentViewerPerson.id)
      : null
  const relationLabel = relationshipToViewer?.socialLabels?.ta
    ? `Your ${relationshipToViewer.socialLabels.ta} · ${relationshipToViewer.socialLabels.taLatin} · ${relationshipToViewer.socialLabels.en}`
    : relationshipToViewer?.labels?.ta
      ? `Your ${relationshipToViewer.labels.ta} · ${relationshipToViewer.labels.taLatin} · ${relationshipToViewer.labels.en}`
      : currentViewerPerson && currentViewerPerson.id === person.id
        ? 'This is you'
        : ''
  const infoRows = [
    relationLabel ? { label: 'Relation', value: relationLabel } : null,
    birthdayLabel ? { label: 'Birthday', value: birthdayLabel } : null,
    person.currentResidence ? { label: 'Lives in', value: person.currentResidence } : null,
    person.birthPlace ? { label: 'From', value: person.birthPlace } : null,
    person.branch ? { label: 'Branch', value: person.branch } : null,
    person.years ? { label: 'Life', value: person.years } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>

  return (
    <div
      className="flow-hover-panel"
      role="toolbar"
      aria-label={`Quick actions for ${displayName(person)}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(event) => {
        event.stopPropagation()
        onSelectPerson(person.id)
      }}
    >
      <div className={`flow-hover-panel__hero ${sexToneClass(person.sex)}`}>
        <PersonAvatar person={person} className="flow-hover-panel__cover-photo" />
        <div className="flow-hover-panel__overlay">
          <strong>{displayName(person)}</strong>
          <small>{person.currentResidence || person.birthPlace || person.branch || 'Family member'}</small>
        </div>
      </div>
      <div className="flow-hover-panel__details">
        {infoRows.slice(0, 4).map((item) => (
          <div key={`${item.label}:${item.value}`} className="flow-hover-panel__detail">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
      <div className="flow-hover-panel__actions">
        <button
          type="button"
          className="flow-hover-panel__icon-button"
          aria-label={`Add parent for ${displayName(person)}`}
          data-tooltip="Add parent"
          onClick={(event) => { event.stopPropagation(); onQuickAction(person.id, 'parent') }}
        >
          <span aria-hidden="true">↑</span>
        </button>
        <button
          type="button"
          className="flow-hover-panel__icon-button"
          aria-label={`Add child for ${displayName(person)}`}
          data-tooltip="Add child"
          onClick={(event) => { event.stopPropagation(); onQuickAction(person.id, 'child') }}
        >
          <span aria-hidden="true">↓</span>
        </button>
        <button
          type="button"
          className="flow-hover-panel__icon-button"
          aria-label={`Add sibling for ${displayName(person)}`}
          data-tooltip="Add sibling"
          onClick={(event) => { event.stopPropagation(); onQuickAction(person.id, 'sibling') }}
        >
          <span aria-hidden="true">≈</span>
        </button>
        <button
          type="button"
          className="flow-hover-panel__icon-button"
          aria-label={`Add partner for ${displayName(person)}`}
          data-tooltip="Add partner"
          onClick={(event) => { event.stopPropagation(); onQuickAction(person.id, 'partner') }}
        >
          <span aria-hidden="true">↔</span>
        </button>
      </div>
      <div className="flow-hover-panel__footer">
        <button
          type="button"
          className="danger flow-hover-panel__icon-button"
          aria-label={`Delete ${displayName(person)}`}
          data-tooltip="Delete person"
          onClick={(event) => { event.stopPropagation(); onQuickAction(person.id, 'delete') }}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </div>
  )
}

function PersonNode({ data }: { data: PersonNodeData }) {
  const {
    person,
    selected,
    highlighted,
    deemphasized,
    relationToViewer,
    onSelectPerson,
    onHoverStart,
    onHoverEnd,
  } = data

  return (
    <div
      className={`${selected ? 'flow-person-card selected' : 'flow-person-card'}${highlighted ? ' highlighted' : ''} ${sexToneClass(person.sex)}${deemphasized ? ' deemphasized' : ''}`}
      onMouseEnter={(event) => onHoverStart(person, event.currentTarget, event.buttons)}
      onMouseLeave={onHoverEnd}
      onClick={(event) => {
        event.stopPropagation()
        onSelectPerson(person.id)
      }}
    >
      <Handle id="target-top" type="target" position={Position.Top} className="flow-handle" />
      <Handle id="target-left" type="target" position={Position.Left} className="flow-handle" />
      <Handle id="target-bottom" type="target" position={Position.Bottom} className="flow-handle" />
      <Handle id="target-right" type="target" position={Position.Right} className="flow-handle" />
      <Handle id="source-top" type="source" position={Position.Top} className="flow-handle" />
      <Handle id="source-left" type="source" position={Position.Left} className="flow-handle" />
      <Handle id="source-bottom" type="source" position={Position.Bottom} className="flow-handle" />
      <Handle id="source-right" type="source" position={Position.Right} className="flow-handle" />
      <PersonAvatar person={person} className="flow-person-photo" />
      <div>
        <strong>{displayName(person)}</strong>
        {relationToViewer ? <small className="flow-person-relation">{relationToViewer}</small> : null}
        <small>{person.years}</small>
      </div>
    </div>
  )
}

function UnionNode({ data }: { data: UnionNodeData }) {
  return (
    <div className="flow-union-node" aria-label={data.label}>
      <Handle id="target-top" type="target" position={Position.Top} className="flow-handle" />
      <Handle id="target-left" type="target" position={Position.Left} className="flow-handle" />
      <Handle id="target-bottom" type="target" position={Position.Bottom} className="flow-handle" />
      <Handle id="target-right" type="target" position={Position.Right} className="flow-handle" />
      <Handle id="source-top" type="source" position={Position.Top} className="flow-handle" />
      <Handle id="source-left" type="source" position={Position.Left} className="flow-handle" />
      <Handle id="source-bottom" type="source" position={Position.Bottom} className="flow-handle" />
      <Handle id="source-right" type="source" position={Position.Right} className="flow-handle" />
    </div>
  )
}

function FamilyNode({ data }: { data: FamilyNodeData }) {
  const {
    leftPerson,
    rightPerson,
    selectedPersonId,
    highlightedNodeIds,
    onSelectPerson,
    deemphasizedIds,
    onHoverStart,
    onHoverEnd,
    relationLabelsById,
  } = data

  return (
    <div className="flow-family-card">
      <Handle id="target-top" type="target" position={Position.Top} className="flow-handle" />
      <Handle id="target-left" type="target" position={Position.Left} className="flow-handle" />
      <Handle id="target-bottom" type="target" position={Position.Bottom} className="flow-handle" />
      <Handle id="target-right" type="target" position={Position.Right} className="flow-handle" />
      <Handle id="source-top" type="source" position={Position.Top} className="flow-handle" />
      <Handle id="source-left" type="source" position={Position.Left} className="flow-handle" />
      <Handle id="source-bottom" type="source" position={Position.Bottom} className="flow-handle" />
      <Handle id="source-right" type="source" position={Position.Right} className="flow-handle" />
      <div className="flow-family-card__members">
        {[leftPerson, rightPerson].map((person) => (
          <div
            key={person.id}
            className={
              person.id === selectedPersonId
                ? `flow-family-person-shell active ${sexToneClass(person.sex)}${deemphasizedIds.has(person.id) ? ' deemphasized' : ''}`
                : `flow-family-person-shell ${sexToneClass(person.sex)}${deemphasizedIds.has(person.id) ? ' deemphasized' : ''}${highlightedNodeIds.has(person.id) ? ' highlighted' : ''}`
            }
          >
            <button
              type="button"
              className={`flow-family-person ${sexToneClass(person.sex)}`}
              onMouseEnter={(event) => onHoverStart(person, event.currentTarget, event.buttons)}
              onMouseLeave={onHoverEnd}
              onClick={(event) => {
                event.stopPropagation()
                onSelectPerson(person.id)
              }}
            >
              <PersonAvatar person={person} className="flow-person-photo" />
              <span>
                <strong>{displayName(person)}</strong>
                {relationLabelsById.get(person.id) ? (
                  <small className="flow-person-relation">{relationLabelsById.get(person.id)}</small>
                ) : null}
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

function edgeHandlesBetween(
  source: { x: number; y: number },
  target: { x: number; y: number },
) {
  return verticalEdgeHandlesBetween(source, target)
}

function verticalEdgeHandlesBetween(
  source: { x: number; y: number },
  target: { x: number; y: number },
) {
  return target.y >= source.y
    ? { sourceHandle: 'source-bottom', targetHandle: 'target-top' }
    : { sourceHandle: 'source-top', targetHandle: 'target-bottom' }
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
  highlightedNodeIds,
  selectedPersonId,
  layoutMode,
  layoutAlgorithm,
  organicSeedNonce,
  organicLiveSimulation,
  autoCenter,
  flyToPersonRequest,
  fitToNodeIdsRequest,
  onSelectPerson,
  onSelectedPersonAnchorChange,
  onSelectEdge,
  currentViewerPerson,
  onMovePerson,
  onMoveFamily,
  onPersonQuickAction,
}: TreeCanvasProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [viewportNonce, setViewportNonce] = useState(0)
  const [hoveredPersonCard, setHoveredPersonCard] = useState<{
    person: PersonView
    anchor: { x: number; y: number }
  } | null>(null)
  const hoverShowTimeoutRef = useRef<number | null>(null)
  const hoverHideTimeoutRef = useRef<number | null>(null)
  const suppressHoverRef = useRef(false)
  const people = useMemo(
    () => graphPeople(graph).filter((person) => visibleIds.has(person.id)),
    [graph, visibleIds],
  )

  const clearHoverShowTimeout = useCallback(() => {
    if (hoverShowTimeoutRef.current !== null) {
      window.clearTimeout(hoverShowTimeoutRef.current)
      hoverShowTimeoutRef.current = null
    }
  }, [])

  const clearHoverHideTimeout = useCallback(() => {
    if (hoverHideTimeoutRef.current !== null) {
      window.clearTimeout(hoverHideTimeoutRef.current)
      hoverHideTimeoutRef.current = null
    }
  }, [])

  const cancelHoveredPersonCard = useCallback(() => {
    clearHoverShowTimeout()
    clearHoverHideTimeout()
    setHoveredPersonCard(null)
  }, [clearHoverHideTimeout, clearHoverShowTimeout])

  const handleHoverStart = useCallback((person: PersonView, element: HTMLElement, buttons: number) => {
    if (buttons !== 0 || suppressHoverRef.current) {
      clearHoverShowTimeout()
      return
    }
    clearHoverShowTimeout()
    clearHoverHideTimeout()
    const canvasElement = canvasRef.current
    if (!canvasElement) return
    const canvasRect = canvasElement.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()
    const nextCard = {
      person,
      anchor: {
        x: elementRect.right - canvasRect.left + 14,
        y: elementRect.top - canvasRect.top + elementRect.height / 2,
      },
    }
    hoverShowTimeoutRef.current = window.setTimeout(() => {
      if (suppressHoverRef.current) {
        hoverShowTimeoutRef.current = null
        return
      }
      setHoveredPersonCard(nextCard)
      hoverShowTimeoutRef.current = null
    }, HOVER_CARD_SHOW_DELAY_MS)
  }, [clearHoverHideTimeout, clearHoverShowTimeout])

  const handleHoverEnd = useCallback(() => {
    clearHoverShowTimeout()
    clearHoverHideTimeout()
    hoverHideTimeoutRef.current = window.setTimeout(() => {
      setHoveredPersonCard(null)
      hoverHideTimeoutRef.current = null
    }, 120)
  }, [clearHoverHideTimeout, clearHoverShowTimeout])

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

  const relationLabelsById = useMemo(() => {
    const labels = new Map<string, string>()
    if (!currentViewerPerson) return labels

    for (const person of people) {
      if (person.id === currentViewerPerson.id) {
        labels.set(person.id, 'You')
        continue
      }

      const relationship = resolveRelationship(graph, person.id, currentViewerPerson.id)
      const label =
        relationship.socialLabels
          ? `${relationship.socialLabels.ta} · ${relationship.socialLabels.taLatin} · ${relationship.socialLabels.en}`
          : relationship.labels
            ? `${relationship.labels.ta} · ${relationship.labels.taLatin} · ${relationship.labels.en}`
            : relationship.label

      if (!label) continue
      labels.set(person.id, label)
    }

    return labels
  }, [currentViewerPerson, graph, people])

  const flowNodes = useMemo<FlowNode<PersonNodeData | UnionNodeData | FamilyNodeData>[]>(() => {
    if (layoutMode === 'family') {
      const unitMemberIds = new Set(familyUnits.flatMap((unit) => unit.memberIds))
      const singlePersonNodes: FlowNode<PersonNodeData>[] = people
        .filter((person) => !unitMemberIds.has(person.id))
        .map((person) => ({
          id: person.id,
          type: 'person',
          position: { x: person.x * X_SCALE, y: person.y * Y_SCALE },
          draggable: layoutAlgorithm !== 'organic',
          selectable: true,
          data: {
            person,
            selected: person.id === selectedPersonId,
            highlighted: highlightedNodeIds.has(person.id),
            deemphasized: deemphasizedIds.has(person.id),
            relationToViewer: relationLabelsById.get(person.id) ?? '',
            onSelectPerson,
            onHoverStart: handleHoverStart,
            onHoverEnd: handleHoverEnd,
            onQuickAction: onPersonQuickAction,
          },
        }))

      const familyNodes: FlowNode<FamilyNodeData>[] = familyUnits.map((unit) => ({
        id: unit.id,
        type: 'family',
        position: { x: unit.avgX * X_SCALE, y: unit.avgY * Y_SCALE },
        draggable: layoutAlgorithm !== 'organic',
        selectable: true,
        data: {
          leftPerson: unit.leftPerson,
          rightPerson: unit.rightPerson,
          selectedPersonId,
          highlightedNodeIds,
          onSelectPerson,
          deemphasizedIds,
          relationLabelsById,
          avgX: unit.avgX,
          avgY: unit.avgY,
          memberIds: unit.memberIds,
          onHoverStart: handleHoverStart,
          onHoverEnd: handleHoverEnd,
          onQuickAction: onPersonQuickAction,
        },
      }))

      return [...singlePersonNodes, ...familyNodes]
    }

    const personNodes: FlowNode<PersonNodeData>[] = people.map((person) => ({
      id: person.id,
      type: 'person',
      position: { x: person.x * X_SCALE, y: person.y * Y_SCALE },
      draggable: layoutAlgorithm !== 'organic',
      selectable: true,
        data: {
        person,
        selected: person.id === selectedPersonId,
        highlighted: highlightedNodeIds.has(person.id),
        deemphasized: deemphasizedIds.has(person.id),
        relationToViewer: relationLabelsById.get(person.id) ?? '',
        onSelectPerson,
        onHoverStart: handleHoverStart,
        onHoverEnd: handleHoverEnd,
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
  }, [deemphasizedIds, familyUnits, handleHoverEnd, handleHoverStart, highlightedNodeIds, layoutAlgorithm, layoutMode, onPersonQuickAction, onSelectPerson, people, relationLabelsById, selectedPersonId, visibleEdges])

  const hoveredPersonCardStyle = useMemo(() => {
    if (!hoveredPersonCard || !canvasRef.current) return null
    const width = 248
    const height = 360
    const canvasWidth = canvasRef.current.clientWidth
    const canvasHeight = canvasRef.current.clientHeight
    const maxLeft = Math.max(12, canvasWidth - width - 12)
    const maxTop = Math.max(12, canvasHeight - height - 12)
    let left =
      hoveredPersonCard.anchor.x + width <= canvasWidth - 12
        ? hoveredPersonCard.anchor.x
        : Math.max(12, hoveredPersonCard.anchor.x - width - 26)
    let top = Math.min(maxTop, Math.max(12, hoveredPersonCard.anchor.y - height / 2))

    return { left: Math.min(maxLeft, left), top }
  }, [hoveredPersonCard])

  const flowEdges = useMemo<FlowEdge[]>(() => {
    const nodeCenters = new Map<string, { x: number; y: number }>()
    if (layoutMode === 'family') {
      for (const person of people) {
        const family = familyByMemberId.get(person.id)
        if (family) {
          nodeCenters.set(family.id, {
            x: family.avgX * X_SCALE,
            y: family.avgY * Y_SCALE,
          })
        } else {
          nodeCenters.set(person.id, { x: person.x * X_SCALE, y: person.y * Y_SCALE })
        }
      }
    } else {
      for (const person of people) {
        nodeCenters.set(person.id, { x: person.x * X_SCALE, y: person.y * Y_SCALE })
      }
      const peopleById = personMap(people)
      for (const edge of visibleEdges) {
        if (edge.predicate !== EdgePredicate.PARTNER_OF) continue
        const leftPerson = peopleById.get(edge.src)
        const rightPerson = peopleById.get(edge.dst)
        if (!leftPerson || !rightPerson) continue
        const unionId = `union:${edge.id}`
        nodeCenters.set(unionId, {
          x: ((leftPerson.x + rightPerson.x) / 2) * X_SCALE,
          y: ((leftPerson.y + rightPerson.y) / 2) * Y_SCALE + 18,
        })
      }
    }

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
          const handles = verticalEdgeHandlesBetween(
            nodeCenters.get(sourceNodeId) ?? { x: 0, y: 0 },
            nodeCenters.get(targetNodeId) ?? { x: 0, y: 0 },
          )
          if (!mergedFamilyChildEdges.has(mergedId)) {
            mergedFamilyChildEdges.set(mergedId, {
              id: mergedId,
              source: sourceNodeId,
              target: targetNodeId,
              sourceHandle: handles.sourceHandle,
              targetHandle: handles.targetHandle,
              type: 'simplebezier',
              label: '',
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
              selected: false,
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

        const handles =
          sourceNodeId.startsWith('family:') || targetNodeId.startsWith('family:')
            ? verticalEdgeHandlesBetween(
                nodeCenters.get(sourceNodeId) ?? { x: 0, y: 0 },
                nodeCenters.get(targetNodeId) ?? { x: 0, y: 0 },
              )
            : edgeHandlesBetween(
                nodeCenters.get(sourceNodeId) ?? { x: 0, y: 0 },
                nodeCenters.get(targetNodeId) ?? { x: 0, y: 0 },
              )
        directEdges.push({
          id: `${edge.id}:${sourceNodeId}:${targetNodeId}`,
          source: sourceNodeId,
          target: targetNodeId,
          sourceHandle: handles.sourceHandle,
          targetHandle: handles.targetHandle,
          type: 'simplebezier',
          label: '',
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
          selected: false,
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

      const partnerHandles = edgeHandlesBetween(
        nodeCenters.get(leftPerson.id) ?? { x: leftPerson.x * X_SCALE, y: leftPerson.y * Y_SCALE },
        nodeCenters.get(rightPerson.id) ?? { x: rightPerson.x * X_SCALE, y: rightPerson.y * Y_SCALE },
      )
      unionConnectorEdges.push({
        id: edge.id,
        source: leftPerson.id,
        target: rightPerson.id,
        sourceHandle: partnerHandles.sourceHandle,
        targetHandle: partnerHandles.targetHandle,
        type: 'simplebezier',
        style: highlightedEdgeIds.has(edge.id)
          ? highlightedEdgeStyle(EdgePredicate.PARTNER_OF)
          : edgeStyle(EdgePredicate.PARTNER_OF),
        selected: false,
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

      const handles = edgeHandlesBetween(
        nodeCenters.get(edge.src) ?? { x: 0, y: 0 },
        nodeCenters.get(edge.dst) ?? { x: 0, y: 0 },
      )
      return [
        {
          id: edge.id,
          source: edge.src,
          target: edge.dst,
          sourceHandle: handles.sourceHandle,
          targetHandle: handles.targetHandle,
          type: 'simplebezier',
          label: '',
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
          selected: false,
        } satisfies FlowEdge,
      ]
    })

    const mergedChildEdges: FlowEdge[] = Array.from(childToUnion.entries()).map(
      ([childId, union]) => {
        const handles = verticalEdgeHandlesBetween(
          nodeCenters.get(union.unionId) ?? { x: 0, y: 0 },
          nodeCenters.get(childId) ?? { x: 0, y: 0 },
        )
        return {
        id: `merged:${union.unionId}:${childId}`,
        source: union.unionId,
        target: childId,
        sourceHandle: handles.sourceHandle,
        targetHandle: handles.targetHandle,
        type: 'simplebezier',
        label: '',
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
        selected: false,
      }},
    )

    return [...unionConnectorEdges, ...directEdges, ...mergedChildEdges]
  }, [deemphasizedIds, familyByMemberId, highlightedEdgeIds, layoutMode, people, visibleEdges])

  const organicPhysicsEdges = useMemo(() => {
    if (layoutMode === 'family') {
      return visibleEdges.flatMap((edge) => {
        if (edge.predicate === EdgePredicate.PARTNER_OF) return []

        const sourceNodeId = familyByMemberId.get(edge.src)?.id ?? edge.src
        const targetNodeId = familyByMemberId.get(edge.dst)?.id ?? edge.dst
        if (sourceNodeId === targetNodeId) return []

        return [
          {
            id: `${edge.id}:${sourceNodeId}:${targetNodeId}`,
            source: sourceNodeId,
            target: targetNodeId,
            predicate: edge.predicate,
          },
        ]
      })
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

      if (sharedChildEdges.length === 0) continue

      const unionId = `union:${edge.id}`
      for (const childEdge of sharedChildEdges) {
        if (!childToUnion.has(childEdge.dst)) {
          childToUnion.set(childEdge.dst, {
            unionId,
            predicate: childEdge.predicate,
            edgeIds: [childEdge.id],
          })
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
          predicate: edge.predicate,
        },
      ]
    })

    const partnerPhysicsEdges = partnerEdges.map((edge) => ({
      id: edge.id,
      source: edge.src,
      target: edge.dst,
      predicate: edge.predicate,
    }))

    const mergedChildPhysicsEdges = Array.from(childToUnion.entries()).map(([childId, union]) => ({
      id: `merged:${union.unionId}:${childId}`,
      source: union.unionId,
      target: childId,
      predicate: union.predicate,
    }))

    return [...partnerPhysicsEdges, ...directEdges, ...mergedChildPhysicsEdges]
  }, [familyByMemberId, layoutMode, people, visibleEdges])

  const [nodes, setNodes] = useNodesState(flowNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges)
  const flowInstanceRef = useRef<ReactFlowInstance | null>(null)
  const handledFlyNonceRef = useRef<number | null>(null)
  const handledFitNonceRef = useRef<number | null>(null)
  const organicVelocityRef = useRef(new Map<string, { x: number; y: number }>())
  const organicStableFramesRef = useRef(0)
  const organicAnchorRef = useRef<{ x: number; y: number } | null>(null)
  const handledOrganicSeedNonceRef = useRef<number>(organicSeedNonce)

  useEffect(() => {
    if (layoutAlgorithm !== 'organic') {
      setNodes(flowNodes)
      return
    }

    const shouldApplySeed = handledOrganicSeedNonceRef.current !== organicSeedNonce
    handledOrganicSeedNonceRef.current = organicSeedNonce

    setNodes((current) => {
      const currentById = new Map(current.map((node) => [node.id, node]))
      return flowNodes.map((node) => {
        const existing = currentById.get(node.id)
        if (!existing || node.type === 'union' || shouldApplySeed) {
          return node
        }

        return {
          ...node,
          position: existing.position,
        }
      })
    })
  }, [flowNodes, layoutAlgorithm, organicSeedNonce, setNodes])

  useEffect(() => {
    if (layoutAlgorithm !== 'organic') return
    organicVelocityRef.current.clear()
    organicStableFramesRef.current = 0
    organicAnchorRef.current = null
  }, [layoutAlgorithm, organicSeedNonce])

  useEffect(() => {
    setEdges(flowEdges)
  }, [flowEdges, setEdges])

  useEffect(() => {
    if (layoutAlgorithm !== 'organic' || !organicLiveSimulation) {
      organicVelocityRef.current.clear()
      organicStableFramesRef.current = 0
      organicAnchorRef.current = null
      return
    }

    organicStableFramesRef.current = 0

    let frameId = 0

    const tick = () => {
      let shouldContinue = true
      setNodes((current) => {
        const positionById = new Map(
          current
            .filter((node) => node.type !== 'union')
            .map((node) => [node.id, { x: node.position.x, y: node.position.y }]),
        )
        const nodeIds = Array.from(positionById.keys())
        if (nodeIds.length <= 1) {
          return current
        }

        if (!organicAnchorRef.current) {
          organicAnchorRef.current = {
            x:
              nodeIds.reduce((sum, nodeId) => sum + (positionById.get(nodeId)?.x ?? 0), 0) /
              nodeIds.length,
            y:
              nodeIds.reduce((sum, nodeId) => sum + (positionById.get(nodeId)?.y ?? 0), 0) /
              nodeIds.length,
          }
        }

        const substeps = 3
        const repelStrength = layoutMode === 'family' ? 32000 : 24000
        const springStrength = 0.0064
        const gravityStrength = 0.0018
        const radialStrength = layoutMode === 'family' ? 0.026 : 0.022
        const damping = 0.82
        const accelerationScale = 0.16
        const maxVelocity = 4.6
        const degreeByNode = new Map<string, number>(nodeIds.map((nodeId) => [nodeId, 0]))

        for (const edge of organicPhysicsEdges) {
          if (degreeByNode.has(edge.source)) {
            degreeByNode.set(edge.source, (degreeByNode.get(edge.source) ?? 0) + 1)
          }
          if (degreeByNode.has(edge.target)) {
            degreeByNode.set(edge.target, (degreeByNode.get(edge.target) ?? 0) + 1)
          }
        }

        const maxDegree = Math.max(...degreeByNode.values(), 1)

        for (let step = 0; step < substeps; step += 1) {
          const forces = new Map(nodeIds.map((nodeId) => [nodeId, { x: 0, y: 0 }]))

          for (let index = 0; index < nodeIds.length; index += 1) {
            const sourceId = nodeIds[index]
            const sourcePosition = positionById.get(sourceId)
            if (!sourcePosition) continue

            for (let innerIndex = index + 1; innerIndex < nodeIds.length; innerIndex += 1) {
              const targetId = nodeIds[innerIndex]
              const targetPosition = positionById.get(targetId)
              if (!targetPosition) continue

              let dx = targetPosition.x - sourcePosition.x
              let dy = targetPosition.y - sourcePosition.y
              let distanceSquared = dx * dx + dy * dy

              if (distanceSquared < 1) {
                dx = 1
                dy = 1
                distanceSquared = 2
              }

              const distance = Math.sqrt(distanceSquared)
              const force = repelStrength / distanceSquared
              const fx = (dx / distance) * force
              const fy = (dy / distance) * force
              const sourceForce = forces.get(sourceId)
              const targetForce = forces.get(targetId)
              if (!sourceForce || !targetForce) continue

              sourceForce.x -= fx
              sourceForce.y -= fy
              targetForce.x += fx
              targetForce.y += fy
            }
          }

          for (const edge of organicPhysicsEdges) {
            const sourcePosition = positionById.get(edge.source)
            const targetPosition = positionById.get(edge.target)
            if (!sourcePosition || !targetPosition) continue

            let dx = targetPosition.x - sourcePosition.x
            let dy = targetPosition.y - sourcePosition.y
            let distance = Math.sqrt(dx * dx + dy * dy)
            if (distance < 1) {
              dx = 1
              dy = 1
              distance = Math.sqrt(2)
            }

            const isParentLike =
              edge.predicate === EdgePredicate.PARENT_OF ||
              edge.predicate === EdgePredicate.GUARDIAN_OF ||
              edge.predicate === EdgePredicate.STEP_PARENT_OF
            const isPartner = edge.predicate === EdgePredicate.PARTNER_OF
            const desiredDistance = isParentLike
              ? layoutMode === 'family'
                ? 150
                : 138
              : isPartner
                ? 170
                : layoutMode === 'family'
                  ? 260
                  : 240
            const forceScale = isParentLike ? 1.7 : isPartner ? 0.7 : 0.12
            const delta = distance - desiredDistance
            const force = delta * springStrength * forceScale
            const fx = (dx / distance) * force
            const fy = (dy / distance) * force
            const sourceForce = forces.get(edge.source)
            const targetForce = forces.get(edge.target)
            if (!sourceForce || !targetForce) continue

            sourceForce.x += fx
            sourceForce.y += fy
            targetForce.x -= fx
            targetForce.y -= fy
          }

          const centroidX =
            nodeIds.reduce((sum, nodeId) => sum + (positionById.get(nodeId)?.x ?? 0), 0) /
            nodeIds.length
          const centroidY =
            nodeIds.reduce((sum, nodeId) => sum + (positionById.get(nodeId)?.y ?? 0), 0) /
            nodeIds.length

          const minTargetRadius = layoutMode === 'family' ? 120 : 90
          const maxTargetRadius =
            minTargetRadius + Math.max(120, Math.sqrt(nodeIds.length) * (layoutMode === 'family' ? 46 : 40))

          for (const nodeId of nodeIds) {
            const position = positionById.get(nodeId)
            const force = forces.get(nodeId)
            if (!position || !force) continue

            force.x += (centroidX - position.x) * gravityStrength
            force.y += (centroidY - position.y) * gravityStrength

            const degree = degreeByNode.get(nodeId) ?? 0
            const normalizedDegree = maxDegree > 0 ? degree / maxDegree : 0
            const leafBias = 1 - normalizedDegree
            const targetRadius =
              minTargetRadius + Math.pow(leafBias, 1.35) * (maxTargetRadius - minTargetRadius)
            let radialDx = position.x - centroidX
            let radialDy = position.y - centroidY
            let radialDistance = Math.sqrt(radialDx * radialDx + radialDy * radialDy)
            if (radialDistance < 1) {
              radialDx = 1
              radialDy = 0
              radialDistance = 1
            }
            const radialDelta = targetRadius - radialDistance
            force.x += (radialDx / radialDistance) * radialDelta * radialStrength
            force.y += (radialDy / radialDistance) * radialDelta * radialStrength

            const velocity = organicVelocityRef.current.get(nodeId) ?? { x: 0, y: 0 }
            velocity.x = velocity.x * damping + force.x * accelerationScale
            velocity.y = velocity.y * damping + force.y * accelerationScale
            velocity.x = Math.max(-maxVelocity, Math.min(maxVelocity, velocity.x))
            velocity.y = Math.max(-maxVelocity, Math.min(maxVelocity, velocity.y))
            organicVelocityRef.current.set(nodeId, velocity)

            position.x += velocity.x
            position.y += velocity.y
          }

          let avgVelocityX = 0
          let avgVelocityY = 0
          for (const nodeId of nodeIds) {
            const velocity = organicVelocityRef.current.get(nodeId)
            if (!velocity) continue
            avgVelocityX += velocity.x
            avgVelocityY += velocity.y
          }
          avgVelocityX /= nodeIds.length
          avgVelocityY /= nodeIds.length

          for (const nodeId of nodeIds) {
            const velocity = organicVelocityRef.current.get(nodeId)
            const position = positionById.get(nodeId)
            if (!velocity || !position) continue

            velocity.x -= avgVelocityX
            velocity.y -= avgVelocityY
            position.x -= avgVelocityX
            position.y -= avgVelocityY
          }

          for (let index = 0; index < nodeIds.length; index += 1) {
            const sourceId = nodeIds[index]
            const sourcePosition = positionById.get(sourceId)
            const sourceNode = current.find((node) => node.id === sourceId)
            if (!sourcePosition || !sourceNode) continue

            for (let innerIndex = index + 1; innerIndex < nodeIds.length; innerIndex += 1) {
              const targetId = nodeIds[innerIndex]
              const targetPosition = positionById.get(targetId)
              const targetNode = current.find((node) => node.id === targetId)
              if (!targetPosition || !targetNode) continue

              let dx = targetPosition.x - sourcePosition.x
              let dy = targetPosition.y - sourcePosition.y
              let distance = Math.sqrt(dx * dx + dy * dy)
              if (distance < 1) {
                dx = 1
                dy = 1
                distance = Math.sqrt(2)
              }

              const sourceRadius =
                sourceNode.type === 'family' ? ORGANIC_FAMILY_RADIUS : ORGANIC_PERSON_RADIUS
              const targetRadius =
                targetNode.type === 'family' ? ORGANIC_FAMILY_RADIUS : ORGANIC_PERSON_RADIUS
              const minDistance = sourceRadius + targetRadius

              if (distance >= minDistance) continue

              const overlap = (minDistance - distance) / 2
              const ux = dx / distance
              const uy = dy / distance

              sourcePosition.x -= ux * overlap
              sourcePosition.y -= uy * overlap
              targetPosition.x += ux * overlap
              targetPosition.y += uy * overlap

              const sourceVelocity = organicVelocityRef.current.get(sourceId)
              if (sourceVelocity) {
                sourceVelocity.x *= 0.5
                sourceVelocity.y *= 0.5
              }
              const targetVelocity = organicVelocityRef.current.get(targetId)
              if (targetVelocity) {
                targetVelocity.x *= 0.5
                targetVelocity.y *= 0.5
              }
            }
          }
        }

        const anchor = organicAnchorRef.current
        if (anchor) {
          const currentCentroidX =
            nodeIds.reduce((sum, nodeId) => sum + (positionById.get(nodeId)?.x ?? 0), 0) /
            nodeIds.length
          const currentCentroidY =
            nodeIds.reduce((sum, nodeId) => sum + (positionById.get(nodeId)?.y ?? 0), 0) /
            nodeIds.length
          const shiftX = currentCentroidX - anchor.x
          const shiftY = currentCentroidY - anchor.y

          if (Math.abs(shiftX) > 0.001 || Math.abs(shiftY) > 0.001) {
            for (const nodeId of nodeIds) {
              const position = positionById.get(nodeId)
              if (!position) continue
              position.x -= shiftX
              position.y -= shiftY
            }
          }
        }

        let maxObservedVelocity = 0
        for (const nodeId of nodeIds) {
          const velocity = organicVelocityRef.current.get(nodeId)
          if (!velocity) continue
          maxObservedVelocity = Math.max(
            maxObservedVelocity,
            Math.abs(velocity.x),
            Math.abs(velocity.y),
          )
        }

        if (maxObservedVelocity < 0.1) {
          organicStableFramesRef.current += 1
        } else {
          organicStableFramesRef.current = 0
        }

        shouldContinue = organicStableFramesRef.current < 10
        if (!shouldContinue) {
          for (const nodeId of nodeIds) {
            organicVelocityRef.current.set(nodeId, { x: 0, y: 0 })
          }
        }

        const next = current.map((node) => {
          if (node.type === 'union') return node

          const position = positionById.get(node.id)
          if (!position) return node

          return {
            ...node,
            position: {
              x: position.x,
              y: position.y,
            },
          }
        })

        return layoutMode === 'family' ? next : recomputeUnionNodes(next, visibleEdges)
      })

      if (shouldContinue) {
        frameId = window.requestAnimationFrame(tick)
      }
    }

    frameId = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [layoutAlgorithm, layoutMode, organicLiveSimulation, organicPhysicsEdges, setNodes, visibleEdges])

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

  useEffect(() => {
    if (!fitToNodeIdsRequest?.nodeIds?.length) return
    if (handledFitNonceRef.current === fitToNodeIdsRequest.nonce) return
    const instance = flowInstanceRef.current
    if (!instance || nodes.length === 0) return

    const targetNodeIds = new Set<string>()
    for (const requestedId of fitToNodeIdsRequest.nodeIds) {
      const directNode = nodes.find((node) => node.id === requestedId)
      if (directNode) {
        targetNodeIds.add(directNode.id)
        continue
      }

      const familyNode = nodes.find((node) => {
        if (node.type !== 'family') return false
        const data = node.data as FamilyNodeData
        return data.memberIds.includes(requestedId)
      })
      if (familyNode) {
        targetNodeIds.add(familyNode.id)
      }
    }

    if (targetNodeIds.size === 0) return
    handledFitNonceRef.current = fitToNodeIdsRequest.nonce

    requestAnimationFrame(() => {
      void instance.fitView({
        padding: 0.28,
        duration: 320,
        nodes: Array.from(targetNodeIds).map((id) => ({ id })),
        maxZoom: 1.05,
      })
    })
  }, [fitToNodeIdsRequest, nodes])

  useEffect(() => {
    const canvasElement = canvasRef.current
    const instance = flowInstanceRef.current
    if (!canvasElement || !instance || !selectedPersonId) {
      onSelectedPersonAnchorChange?.(null)
      return
    }

    const targetNode =
      nodes.find((node) => node.id === selectedPersonId) ??
      nodes.find((node) => {
        if (node.type !== 'family') return false
        const data = node.data as FamilyNodeData
        return data.memberIds.includes(selectedPersonId)
      })

    if (!targetNode) {
      onSelectedPersonAnchorChange?.(null)
      return
    }

    const viewport = instance.getViewport()
    const rect = canvasElement.getBoundingClientRect()
    const x = targetNode.position.x * viewport.zoom + viewport.x
    const y = targetNode.position.y * viewport.zoom + viewport.y
    const width =
      targetNode.type === 'family'
        ? 280
        : targetNode.type === 'union'
          ? 20
          : 200
    const height =
      targetNode.type === 'family'
        ? 112
        : targetNode.type === 'union'
          ? 20
          : 92

    onSelectedPersonAnchorChange?.({
      x: Math.max(0, Math.min(rect.width, x + (width * viewport.zoom) / 2)),
      y: Math.max(0, Math.min(rect.height, y - (height * viewport.zoom) / 2)),
    })
  }, [nodes, onSelectedPersonAnchorChange, selectedPersonId, viewportNonce])

  return (
    <div className="canvas" ref={canvasRef}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodeOrigin={[0.5, 0.5]}
        snapToGrid
        snapGrid={SNAP_GRID}
        selectNodesOnDrag={false}
        nodeDragThreshold={6}
        nodesDraggable={layoutAlgorithm !== 'organic'}
        nodesConnectable={false}
        elementsSelectable
        edgesFocusable={false}
        panOnDrag
        panOnScroll={false}
        zoomOnPinch
        zoomOnScroll
        minZoom={0.35}
        maxZoom={1.6}
        defaultViewport={{ x: 40, y: 40, zoom: 0.9 }}
        onInit={(instance) => {
          flowInstanceRef.current = instance
        }}
        onMoveStart={() => {
          suppressHoverRef.current = true
          cancelHoveredPersonCard()
        }}
        onMove={() => {
          setViewportNonce((current) => current + 1)
        }}
        onMoveEnd={() => {
          window.setTimeout(() => {
            suppressHoverRef.current = false
          }, 80)
        }}
        onNodeClick={(_, node) => {
          if (node.type === 'person') {
            onSelectPerson(node.id)
          }
        }}
        onPaneClick={() => onSelectEdge(null)}
        onEdgeClick={() => {}}
        onNodesChange={(changes: NodeChange[]) => {
          setNodes((current) => {
            const next = applyNodeChanges(changes, current)
            return layoutMode === 'family' ? next : recomputeUnionNodes(next, visibleEdges)
          })
        }}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={() => {
          suppressHoverRef.current = true
          cancelHoveredPersonCard()
        }}
        onNodeDragStop={(_, node) => {
          window.setTimeout(() => {
            suppressHoverRef.current = false
          }, 80)
          if (layoutAlgorithm === 'organic') return
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
      {hoveredPersonCard && hoveredPersonCardStyle ? (
        <div className="canvas-hover-layer">
          <div className="canvas-hover-layer__card" style={hoveredPersonCardStyle}>
            <GlobalHoverCard
              graph={graph}
              person={hoveredPersonCard.person}
              currentViewerPerson={currentViewerPerson}
              onSelectPerson={onSelectPerson}
              onQuickAction={onPersonQuickAction}
              onMouseEnter={clearHoverHideTimeout}
              onMouseLeave={handleHoverEnd}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

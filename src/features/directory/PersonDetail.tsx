import { useRef, useState, useCallback } from 'react'
import { PersonAvatar } from '../PersonAvatar'
import {
  displayName,
  buildRelationshipPath,
  shortestPersonPath,
  type PersonView,
  type ResolvedRelationship,
} from '../../domain/graphOps'
import type { GraphSchema } from '../../domain/graph'

type PersonDetailProps = {
  person: PersonView
  relationship?: ResolvedRelationship
  iAmPerson?: PersonView | null
  graph: GraphSchema
  onClose: () => void
}

export function PersonDetail({ person, relationship, iAmPerson, graph, onClose }: PersonDetailProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startY = useRef(0)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY
    setDragging(true)
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging) return
    const delta = e.touches[0].clientY - startY.current
    if (delta > 0) setDragY(delta)
  }, [dragging])

  const handleTouchEnd = useCallback(() => {
    if (dragY > 100) {
      onClose()
    }
    setDragY(0)
    setDragging(false)
  }, [dragY, onClose])

  const kinshipEn = relationship?.labels?.en ?? relationship?.label ?? ''
  const kinshipTa = relationship?.labels?.ta
  const kinshipTaLatin = relationship?.labels?.taLatin
  const kinshipHi = relationship?.labels?.hi
  const kinshipHiLatin = relationship?.labels?.hiLatin

  const path = iAmPerson
    ? shortestPersonPath(graph, iAmPerson.id, person.id)
    : []
  const pathString = path.length > 1
    ? buildRelationshipPath(graph, path)
    : ''

  return (
    <>
      <div className="dir-detail-backdrop" onClick={onClose} />
      <div
        ref={sheetRef}
        className="dir-detail-sheet"
        style={{ transform: dragY > 0 ? `translateY(${dragY}px)` : undefined }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        role="dialog"
        aria-label={`Details for ${displayName(person)}`}
      >
        <div className="dir-detail-sheet__handle" />

        <div className="dir-detail-sheet__content">
          <PersonAvatar person={person} className="dir-detail-sheet__avatar" />
          <h2 className="dir-detail-sheet__name">{displayName(person)}</h2>

          {kinshipEn && (
            <div className="dir-detail-sheet__kinship">
              <span className="dir-detail-sheet__kinship-en">Your {kinshipEn}</span>
              {kinshipTa && (
                <span className="dir-detail-sheet__kinship-script">{kinshipTa}</span>
              )}
              {kinshipTaLatin && (
                <span className="dir-detail-sheet__kinship-latin">{kinshipTaLatin}</span>
              )}
              {kinshipHi && (
                <span className="dir-detail-sheet__kinship-script">{kinshipHi}</span>
              )}
              {kinshipHiLatin && (
                <span className="dir-detail-sheet__kinship-latin">{kinshipHiLatin}</span>
              )}
            </div>
          )}

          {pathString && (
            <div className="dir-detail-sheet__path">
              <span className="dir-detail-sheet__path-label">How you're connected</span>
              <span className="dir-detail-sheet__path-chain">{pathString}</span>
            </div>
          )}

          {(person.dob || person.dod) && (
            <div className="dir-detail-sheet__dates">
              {person.dob && <span>Born: {person.dob}</span>}
              {person.dod && <span>Died: {person.dod}</span>}
            </div>
          )}

          {person.currentResidence && (
            <div className="dir-detail-sheet__residence">
              Lives in {person.currentResidence}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

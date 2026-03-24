import { PersonAvatar } from '../PersonAvatar'
import { displayName, type PersonView } from '../../domain/graphOps'

type IAmBarProps = {
  currentPerson: PersonView | null
  onChangeIdentity: () => void
}

export function IAmBar({ currentPerson, onChangeIdentity }: IAmBarProps) {
  if (!currentPerson) return null

  return (
    <div className="dir-iam-bar">
      <PersonAvatar person={currentPerson} className="dir-iam-bar__avatar" />
      <div className="dir-iam-bar__text">
        <span className="dir-iam-bar__label">I am</span>
        <span className="dir-iam-bar__name">{displayName(currentPerson)}</span>
      </div>
      <button
        type="button"
        className="dir-iam-bar__change"
        onClick={onChangeIdentity}
      >
        Change
      </button>
    </div>
  )
}

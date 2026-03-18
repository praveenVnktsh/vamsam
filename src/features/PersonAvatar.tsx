import { useEffect, useMemo, useState } from 'react'
import { type PersonView, personInitials } from '../domain/graphOps'

type PersonAvatarProps = {
  person: Pick<PersonView, 'photo' | 'firstName' | 'lastName' | 'label' | 'nickname'>
  className: string
}

function isImageSource(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return false

  return (
    /^(https?:\/\/|data:image\/|blob:|\/)/i.test(trimmed) ||
    /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(trimmed)
  )
}

export function PersonAvatar({ person, className }: PersonAvatarProps) {
  const photoSource = useMemo(
    () => (isImageSource(person.photo) ? person.photo.trim() : ''),
    [person.photo],
  )
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [photoSource])

  if (photoSource && !imageFailed) {
    return (
      <span className={className}>
        <img
          src={photoSource}
          alt={person.label || person.nickname || person.firstName || 'Person'}
          onError={() => setImageFailed(true)}
        />
      </span>
    )
  }

  return <span className={className}>{personInitials(person)}</span>
}

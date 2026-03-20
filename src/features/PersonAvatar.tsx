import { useEffect, useMemo, useState } from 'react'
import { type PersonView, personInitials } from '../domain/graphOps'
import { isStoredPhotoRef, resolvePhotoUrl } from '../data/photoStorage'

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
  const photoValue = useMemo(() => person.photo.trim(), [person.photo])
  const [photoSource, setPhotoSource] = useState(
    photoValue && isImageSource(photoValue) ? photoValue : '',
  )
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) return
      setImageFailed(false)

      if (!photoValue) {
        setPhotoSource('')
        return
      }

      if (isStoredPhotoRef(photoValue)) {
        void resolvePhotoUrl(photoValue)
          .then((url) => {
            if (!cancelled) {
              setPhotoSource(url)
            }
          })
          .catch(() => {
            if (!cancelled) {
              setPhotoSource('')
            }
          })
        return
      }

      setPhotoSource(isImageSource(photoValue) ? photoValue : '')
    })

    return () => {
      cancelled = true
    }
  }, [photoValue])

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

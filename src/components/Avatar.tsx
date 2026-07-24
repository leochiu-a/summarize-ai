import { FRAMES } from '../constants'

const SPRITE_URL = chrome.runtime.getURL('assets/sprite.png')

export function Avatar({
  frame,
  onActivate,
  title = '點我摘要這個頁面',
}: {
  frame: number
  onActivate: () => void
  title?: string
}) {
  return (
    <div className="avatar-wrap">
      <div
        className="avatar"
        role="button"
        tabIndex={0}
        title={title}
        style={{
          backgroundImage: `url("${SPRITE_URL}")`,
          backgroundPosition: `${(frame / (FRAMES - 1)) * 100}% 0`,
        }}
        onClick={onActivate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onActivate()
          }
        }}
      />
    </div>
  )
}

import { FRAMES } from '../styles'

const SPRITE_URL = chrome.runtime.getURL('assets/sprite.png')

export function Avatar({ frame, onActivate }: { frame: number; onActivate: () => void }) {
  return (
    <div className="avatar-wrap">
      <div
        className="avatar"
        role="button"
        tabIndex={0}
        title="點我摘要這個頁面"
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

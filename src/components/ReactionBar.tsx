import { EmojiIcon } from './EmojiIcon'
import { REACTIONS } from '../lib/reactions'

interface ReactionBarProps {
  reaction: { code: string; line: string } | null
  onReact: (code: string) => void
}

// 摘要完成後的反應列：小夥伴回嘴 + 一排 emoji（預設靜態 SVG，hover 播放動畫 webp）
export function ReactionBar({ reaction, onReact }: ReactionBarProps) {
  return (
    <div className="reactions">
      {reaction && <div className="reaction-reply">「{reaction.line}」</div>}
      <div className="reaction-row">
        {REACTIONS.map((r) => (
          <button
            key={r.code}
            type="button"
            className={reaction?.code === r.code ? 'reaction-btn on' : 'reaction-btn'}
            aria-label={r.label}
            onClick={() => onReact(r.code)}
          >
            <EmojiIcon code={r.code} label={r.label} />
          </button>
        ))}
      </div>
    </div>
  )
}

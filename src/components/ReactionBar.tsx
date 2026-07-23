import { REACTIONS } from '../lib/reactions'

const emojiSvg = (code: string) => chrome.runtime.getURL(`assets/emoji/${code}.svg`)
const emojiWebp = (code: string) => chrome.runtime.getURL(`assets/emoji/${code}.webp`)

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
            <img className="reaction-static" src={emojiSvg(r.code)} alt={r.label} />
            <img className="reaction-anim" src={emojiWebp(r.code)} alt="" aria-hidden="true" loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  )
}

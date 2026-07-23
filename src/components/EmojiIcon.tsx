// 共用的 Noto emoji 圖示：預設顯示靜態 .svg，hover / 選中（.on 祖先）時播放動畫 .webp。
// 資產路徑固定為 assets/emoji/<code>.svg｜.webp，隨 extension 打包，不靠外部網路。

function assetUrl(path: string): string {
  return typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL(path) : path
}

interface EmojiIconProps {
  code: string
  label: string
}

export function EmojiIcon({ code, label }: EmojiIconProps) {
  return (
    <>
      <img className="emoji-static" src={assetUrl(`assets/emoji/${code}.svg`)} alt={label} />
      <img
        className="emoji-anim"
        src={assetUrl(`assets/emoji/${code}.webp`)}
        alt=""
        aria-hidden="true"
        loading="lazy"
      />
    </>
  )
}

// Shadow DOM 內的樣式（避免被宿主頁面的 CSS 污染，也不污染對方）

export const FRAMES = 3
export const AVATAR_W = 110
export const AVATAR_H = Math.round(AVATAR_W * (272 / 500))

export const styles = `
  :host { all: initial; }
  * { box-sizing: border-box; margin: 0; padding: 0; }

  .buddy {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 10px;
    font-family: -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif;
  }

  .avatar-wrap { position: relative; }

  .avatar {
    width: ${AVATAR_W}px;
    height: ${AVATAR_H}px;
    background-size: ${FRAMES * 100}% 100%;
    background-repeat: no-repeat;
    image-rendering: pixelated;
    cursor: pointer;
    filter: drop-shadow(0 4px 10px rgba(0, 0, 0, .3));
    transition: transform .15s ease;
  }
  .avatar:hover { transform: translateY(-3px) scale(1.04); }

  .bubble {
    width: min(380px, calc(100vw - 60px));
    max-height: 55vh;
    overflow-y: auto;
    background: #fffef8;
    border: 3px solid #26243a;
    border-radius: 10px;
    box-shadow: 4px 4px 0 #26243a, 0 10px 24px rgba(0, 0, 0, .25);
    padding: 16px 18px;
    font-size: 16px;
    line-height: 1.75;
    color: #26243a;
    word-break: break-word;
  }
  .bubble::-webkit-scrollbar { width: 8px; }
  .bubble::-webkit-scrollbar-thumb { background: #26243a55; border-radius: 4px; }

  .bubble-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
  }
  .title {
    font-weight: 700;
    font-size: 13px;
    letter-spacing: .08em;
    color: #00b3d1;
    text-transform: uppercase;
  }
  .bubble-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .cache-badge {
    font-size: 11px;
    color: #6b6980;
    background: #26243a11;
    border-radius: 4px;
    padding: 1px 6px;
  }
  .resummarize {
    all: unset;
    cursor: pointer;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    anchor-name: --resummarize-anchor;
    transition: transform .12s ease, background .12s ease;
  }
  .resummarize:hover { background: #26243a11; transform: scale(1.12); }
  .resummarize:active { transform: scale(.9); }
  /* 預設靜態 SVG，hover 播放動畫 webp（同反應 emoji 的機制，尺寸較小） */
  .resummarize .emoji-static,
  .resummarize .emoji-anim { width: 18px; height: 18px; }
  .resummarize:hover .emoji-static { display: none; }
  .resummarize:hover .emoji-anim { display: block; }

  /* tooltip：Popover API（top layer）+ CSS anchor positioning，錨在按鈕上方 */
  .tooltip {
    margin: 0;
    border: 0;
    padding: 4px 9px;
    background: #26243a;
    color: #fff;
    font-size: 12px;
    line-height: 1.4;
    border-radius: 6px;
    white-space: nowrap;
    box-shadow: 0 4px 12px rgba(0, 0, 0, .25);
    position: fixed;
    position-anchor: --resummarize-anchor;
    position-area: top;
    margin-bottom: 8px;
  }
  .error { color: #d14343; }

  /* 思考時的碎念：斜體灰字，字尾三個點依序閃動 */
  .thinking-text {
    color: #6b6980;
    font-style: italic;
  }
  .thinking-text::after {
    content: "⋯";
    animation: buddy-think 1.4s ease-in-out infinite;
  }
  /* 被催時的不耐煩台詞：正體、橘紅色，語氣更強一點 */
  .thinking-text.impatient {
    color: #c2410c;
    font-style: normal;
    font-weight: 600;
  }
  .thinking-text.impatient::after { content: ""; }
  @keyframes buddy-think {
    0%, 100% { opacity: .2; }
    50% { opacity: 1; }
  }

  .content ul, .content ol { padding-left: 1.3em; margin: 4px 0; }
  .content li { margin: 6px 0; }
  .content p { margin: 6px 0; }
  .content code {
    background: #26243a12;
    border-radius: 4px;
    padding: 1px 5px;
    font-size: .9em;
    font-family: ui-monospace, Menlo, monospace;
  }
  .content strong { color: #008cad; }

  /* 摘要完成後的反應區 */
  .reactions {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid #26243a1f;
  }
  .reaction-reply {
    color: #008cad;
    font-weight: 600;
    margin-bottom: 8px;
    animation: buddy-pop .25s ease;
  }
  @keyframes buddy-pop {
    0% { opacity: 0; transform: translateY(4px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  .reaction-row { display: flex; gap: 4px; }
  .reaction-btn {
    all: unset;
    cursor: pointer;
    line-height: 0;
    padding: 5px;
    border-radius: 8px;
    transition: transform .12s ease, background .12s ease;
  }
  /* EmojiIcon 共用基底：預設顯示靜態 SVG，hover / 選中（.on 祖先）時換成 Noto 動畫 webp */
  .emoji-static,
  .emoji-anim { width: 26px; height: 26px; display: block; }
  .emoji-anim { display: none; }
  .reaction-btn:hover,
  .reaction-btn.on { background: #26243a11; transform: scale(1.15); }
  .reaction-btn:active { transform: scale(.9); }
  .reaction-btn:hover .emoji-static,
  .reaction-btn.on .emoji-static { display: none; }
  .reaction-btn:hover .emoji-anim,
  .reaction-btn.on .emoji-anim { display: block; }

  .tail {
    width: 0; height: 0;
    margin-right: ${Math.round(AVATAR_W / 2) - 8}px;
    margin-bottom: -10px;
    border-left: 9px solid transparent;
    border-right: 9px solid transparent;
    border-top: 12px solid #26243a;
  }
`

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

  .title {
    font-weight: 700;
    font-size: 13px;
    letter-spacing: .08em;
    color: #00b3d1;
    margin-bottom: 8px;
    text-transform: uppercase;
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

  .tail {
    width: 0; height: 0;
    margin-right: ${Math.round(AVATAR_W / 2) - 8}px;
    margin-bottom: -10px;
    border-left: 9px solid transparent;
    border-right: 9px solid transparent;
    border-top: 12px solid #26243a;
  }
`

// A rename field as wide as its text (D-110): measured in the field's own font as it opens and on
// every keystroke, so it starts at the current name's width and follows what's typed. A canvas
// measures without touching the page's layout.
let ctx: CanvasRenderingContext2D | null | undefined;

export function fitToText(input: HTMLInputElement) {
  ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return;
  const cs = getComputedStyle(input);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const text = ctx.measureText(input.value || ' ').width;
  // Border-box: the padding, plus a pixel or two so the caret at the end never scrolls the text.
  const width = text + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 2;
  input.style.width = `${Math.ceil(width)}px`;
}

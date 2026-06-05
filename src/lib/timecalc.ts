import { CharInfo } from '../types';

export function getCharIndices(
  editedText: string,
  actualStart: number,
  actualEnd: number,
  originalChars: CharInfo[] | undefined
): { charStartIdx: number; charEndIdx: number } {
  const charsLen = originalChars?.length || 0;
  if (!originalChars || charsLen === 0) {
    const textLen = Math.max(1, editedText.length);
    return {
      charStartIdx: Math.round((actualStart / textLen) * charsLen),
      charEndIdx: Math.round((actualEnd / textLen) * charsLen)
    };
  }

  const textBeforeStart = editedText.substring(0, actualStart).replace(/\s+/g, '');
  const textBeforeEnd = editedText.substring(0, actualEnd).replace(/\s+/g, '');

  let charStartIdx = 0;
  let charEndIdx = 0;
  let accLen = 0;

  for (let i = 0; i < originalChars.length; i++) {
    const charLen = originalChars[i].char.replace(/\s+/g, '').length || 1;
    accLen += charLen;
    if (accLen > textBeforeStart.length && charStartIdx === 0 && actualStart > 0) {
      charStartIdx = i;
    }
    if (accLen >= textBeforeEnd.length && charEndIdx === 0 && actualEnd > 0) {
      charEndIdx = i + 1;
    }
  }

  if (actualStart === 0) charStartIdx = 0;
  else if (charStartIdx === 0) charStartIdx = originalChars.length;

  if (actualEnd === editedText.length) charEndIdx = originalChars.length;
  else if (charEndIdx === 0) charEndIdx = charStartIdx;

  charStartIdx = Math.max(0, Math.min(charStartIdx, originalChars.length));
  charEndIdx = Math.max(0, Math.min(charEndIdx, originalChars.length));

  return { charStartIdx, charEndIdx };
}

import { Segment, CharInfo } from '../types';

export function matchSegmentsToChars(segments: Segment[], chars: CharInfo[]): Segment[] {
  if (!chars || chars.length === 0) return segments;

  let charIndex = 0;

  return segments.map(seg => {
    const textToMatch = seg.editedText.replace(/\s+/g, '');
    const matchedChars: CharInfo[] = [];

    let currentTextIndex = 0;
    
    while (currentTextIndex < textToMatch.length && charIndex < chars.length) {
      const charStr = chars[charIndex].char.replace(/\s+/g, '');
      
      if (charStr.length > 0 && textToMatch.substring(currentTextIndex).startsWith(charStr)) {
        matchedChars.push(chars[charIndex]);
        charIndex++;
        currentTextIndex += charStr.length;
      } else {
        let found = false;
        let lookahead = 0;
        while (charIndex + lookahead < chars.length && lookahead < 50) {
           const nextCharStr = chars[charIndex + lookahead].char.replace(/\s+/g, '');
           if (nextCharStr.length > 0 && textToMatch.substring(currentTextIndex).startsWith(nextCharStr)) {
               charIndex = charIndex + lookahead;
               matchedChars.push(chars[charIndex]);
               charIndex++;
               currentTextIndex += nextCharStr.length;
               found = true;
               break;
           }
           lookahead++;
        }
        
        if (!found) {
            currentTextIndex++;
        }
      }
    }

    return {
      ...seg,
      originalChars: matchedChars.length > 0 ? matchedChars : seg.originalChars,
    };
  });
}

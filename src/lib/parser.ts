import { Segment, CharInfo } from '../types';

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

// Deep search to find an array if user pasted `{ "data": [...] }` or similar wrappers
function findArray(obj: any): any[] | null {
  if (Array.isArray(obj)) return obj;
  if (typeof obj === 'object' && obj !== null) {
    for (const key of Object.keys(obj)) {
      const res = findArray(obj[key]);
      if (res) return res;
    }
  }
  return null;
}

function parseSRTTime(timeStr: string): number {
  // Format: hh:mm:ss,mmm or hh:mm:ss.mmm
  const parts = timeStr.replace(',', '.').split(':');
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  return 0;
}

export function parseInputData(input: string): { segments: Segment[], chars: CharInfo[] } {
  // 1. Try parsing As SRT
  if (input.includes('-->')) {
    const segments: Segment[] = [];
    const chars: CharInfo[] = [];
    const blocks = input.trim().replace(/\r\n/g, '\n').split(/\n\s*\n/);
    
    blocks.forEach((block, index) => {
      const lines = block.split('\n');
      if (lines.length >= 3) {
        const timeLine = lines[1];
        const textLines = lines.slice(2).join('\n');
        const timeParts = timeLine.split('-->');
        if (timeParts.length === 2) {
          const [startStr, endStr] = timeParts.map(s => s.trim());
          const startTime = parseSRTTime(startStr);
          segments.push({
            id: generateId(),
            startTime,
            endTime: parseSRTTime(endStr),
            originalChars: [], // No char-level timing available in pure SRT
            editedText: textLines
          });
          chars.push({ char: textLines + ' ', time: startTime });
        }
      }
    });

    if (segments.length > 0) return { segments, chars };
  }

  // 2. Try parsing as JSON array
  let parsedJson;
  try {
    parsedJson = JSON.parse(input);
  } catch (e) {
    throw new Error('Unrecognized format. Please provide a JSON array (character timings) or SRT format.');
  }

  const arr = findArray(parsedJson);
  if (!arr || arr.length === 0) {
    throw new Error('Could not find an array of subtitle data in the JSON provided.');
  }

  // Normalize array elements into CharInfo form
  const chars: CharInfo[] = arr.map((item: any) => {
    // Fuzzily find the literal text and the time
    let char = '';
    if (typeof item.char === 'string') char = item.char;
    else if (typeof item.text === 'string') char = item.text;
    else if (typeof item.word === 'string') char = item.word;
    else if (typeof item.w === 'string') char = item.w;

    let time = 0;
    if (typeof item.time === 'number') time = item.time;
    else if (typeof item.start === 'number') time = item.start;
    else if (typeof item.t === 'number') time = item.t;
    else if (typeof item.s === 'number') time = item.s;
    else {
      // attempt parsing string representations of time
      const timeStr = item.time || item.start || item.t || item.s;
      if (timeStr) time = parseFloat(timeStr);
    }

    return { char: char.trim(), time };
  }).filter(c => c.char.length > 0);

  if (chars.length === 0) {
    throw new Error('Found a JSON array, but it did not contain characters/words with time fields.');
  }

  return { segments: chunkCharsIntoSegments(chars), chars };
}

function chunkCharsIntoSegments(chars: CharInfo[]): Segment[] {
  const segments: Segment[] = [];
  let currentChars: CharInfo[] = [];
  
  // Standard sentence terminators in Chinese and English
  const terminators = new Set(['。', '！', '？', '!', '?', '.', '\\n', '\n']);

  for (let i = 0; i < chars.length; i++) {
    currentChars.push(chars[i]);
    
    const charValue = chars[i].char;
    const isTerminator = charValue.length === 1 && terminators.has(charValue);
    
    // Group roughly by sentence, or force split if pause > 1.5s or block too long
    const isTooLong = currentChars.length >= 35; 
    let hasLongPause = false;
    
    if (i < chars.length - 1) {
      hasLongPause = (chars[i+1].time - chars[i].time > 1.5);
    }

    if (isTerminator || isTooLong || hasLongPause || i === chars.length - 1) {
      if (currentChars.length > 0) {
        segments.push({
          id: generateId(),
          startTime: currentChars[0].time,
          // End time is slightly after the last character's start time
          endTime: currentChars[currentChars.length - 1].time + 0.3, 
          originalChars: currentChars,
          editedText: currentChars.map(c => c.char).join('')
        });
        currentChars = [];
      }
    }
  }

  return segments;
}

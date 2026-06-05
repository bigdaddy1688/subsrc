export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}

export function formatTimeCode(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00:00.000';
  
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  const hStr = h.toString().padStart(2, '0');
  const mStr = m.toString().padStart(2, '0');
  const sStr = s.toString().padStart(2, '0');
  const msStr = ms.toString().padStart(3, '0');

  if (h > 0) {
    return `${hStr}:${mStr}:${sStr}.${msStr}`;
  }
  return `${mStr}:${sStr}.${msStr}`;
}

export function formatSRTTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00:00,000';
  
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  const hStr = h.toString().padStart(2, '0');
  const mStr = m.toString().padStart(2, '0');
  const sStr = s.toString().padStart(2, '0');
  const msStr = ms.toString().padStart(3, '0');

  return `${hStr}:${mStr}:${sStr},${msStr}`;
}

export function generateSRTContent(segments: any[]): string {
  return [...segments]
    .sort((a, b) => a.startTime - b.startTime)
    .filter(seg => seg.editedText.trim().length > 0)
    .map((seg, i) => {
      const start = formatSRTTime(seg.startTime);
      const end = formatSRTTime(seg.endTime);
      return `${i + 1}\n${start} --> ${end}\n${seg.editedText}\n`;
    })
    .join('\n');
}

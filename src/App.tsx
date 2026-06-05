import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Download, Upload, Video as VideoIcon, FileJson, Play, Pause, Layers, Plus, Trash2 } from 'lucide-react';
import { Segment, CharInfo } from './types';
import { parseInputData } from './lib/parser';
import { matchSegmentsToChars } from './lib/matcher';
import { getCharIndices } from './lib/timecalc';
import { cn, formatTimeCode, generateSRTContent } from './lib/utils';

export default function App() {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [unifiedChars, setUnifiedChars] = useState<CharInfo[]>([]);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [playing, setPlaying] = useState<boolean>(false);
  const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null);
  const [pickingMode, setPickingMode] = useState<{ id: string; type: 'start' | 'end' } | null>(null);
  const [activeCharTime, setActiveCharTime] = useState<number | null>(null);
  
  const [inputText, setInputText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  const [timelineInputText, setTimelineInputText] = useState('');
  const [showTimelineImport, setShowTimelineImport] = useState(false);
  const [timelineParseError, setTimelineParseError] = useState<string | null>(null);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    options: { label: string; action: () => void; danger?: boolean; disabled?: boolean }[];
  } | null>(null);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, []);

  const videoRef = useRef<HTMLVideoElement>(null);

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoSrc(URL.createObjectURL(file));
      setCurrentTime(0);
      setDuration(0);
      setPlaying(false);
    }
  };

  const handleDataParse = () => {
    try {
      setParseError(null);
      const { chars } = parseInputData(inputText);
      setSegments([]); // Do not automatically generate segments
      setUnifiedChars(chars);
      setPickingMode(null);
      setActiveCharTime(null);
    } catch (e: any) {
      setParseError(e.message || 'Failed to parse JSON/SRT formats.');
    }
  };

  const handleTimelineParse = () => {
    try {
      setTimelineParseError(null);
      const { segments: newSegments, chars } = parseInputData(timelineInputText);
      newSegments.sort((a, b) => a.startTime - b.startTime);
      
      let finalSegments = newSegments;
      if (unifiedChars.length > 0) {
        finalSegments = matchSegmentsToChars(newSegments, unifiedChars);
      } else if (chars.length > 0) {
        setUnifiedChars(chars);
        finalSegments = matchSegmentsToChars(newSegments, chars);
      }
      
      setSegments(finalSegments);
      setPickingMode(null);
      setActiveCharTime(null);
      setShowTimelineImport(false);
    } catch (e: any) {
      setTimelineParseError(e.message || 'Failed to parse JSON/SRT formats.');
    }
  };

  const handleDataFileUpload = (e: React.ChangeEvent<HTMLInputElement>, isTimeline: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (isTimeline) {
        setTimelineInputText(text);
      } else {
        setInputText(text);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleTextChange = (id: string, newText: string) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, editedText: newText } : s));
  };

  const deleteSegment = (id: string) => {
    setSegments(prev => prev.filter(s => s.id !== id));
  };

  const moveTextToNextLine = (idx: number, start: number, end: number, createNew: boolean) => {
    setSegments(prev => {
      const newSegments = [...prev];
      const curr = newSegments[idx];
      
      const isSelection = start !== end;
      const actualStart = isSelection ? start : start;
      const actualEnd = isSelection ? end : curr.editedText.length;
      
      if (actualStart === actualEnd) {
         if (!createNew && idx < newSegments.length - 1) {
             const nextSeg = newSegments[idx + 1];
             newSegments[idx + 1] = {
               ...nextSeg,
               originalChars: [...(curr.originalChars || []), ...(nextSeg.originalChars || [])],
               editedText: curr.editedText + (curr.editedText && nextSeg.editedText ? ' ' : '') + nextSeg.editedText,
               startTime: curr.startTime
             };
             newSegments.splice(idx, 1);
         } else if (createNew) {
             const newStartTime = curr.endTime + 0.001;
             const nextSeg = newSegments[idx + 1];
             const newEndTime = nextSeg ? nextSeg.startTime - 0.001 : curr.endTime + 2;
             
             newSegments.splice(idx + 1, 0, {
               id: Math.random().toString(36).substring(2, 9),
               startTime: newStartTime,
               endTime: newEndTime,
               editedText: '',
               originalChars: []
             });
         }
         return newSegments;
      }
      
      const textToMove = curr.editedText.substring(actualStart, actualEnd);
      const newCurrText = curr.editedText.substring(0, actualStart) + curr.editedText.substring(actualEnd);
      
      const textLen = Math.max(1, curr.editedText.length);
      const dur = curr.endTime - curr.startTime;
      const fracStart = actualStart / textLen;
      const fracEnd = actualEnd / textLen;
      const splitTimeStart = curr.startTime + dur * fracStart;
      const splitTimeEnd = curr.startTime + dur * fracEnd;
      
      const { charStartIdx, charEndIdx } = getCharIndices(curr.editedText, actualStart, actualEnd, curr.originalChars);
      
      let movedChars: CharInfo[] = [];
      let newCurrChars = curr.originalChars || [];
      let newCurrStartTime = curr.startTime;
      let newCurrEndTime = curr.endTime;
      let movedStartTime = splitTimeStart;
      let movedEndTime = splitTimeEnd;

      if (curr.originalChars && curr.originalChars.length > 0) {
        movedChars = curr.originalChars.slice(charStartIdx, charEndIdx);
        newCurrChars = [
          ...curr.originalChars.slice(0, charStartIdx),
          ...curr.originalChars.slice(charEndIdx)
        ];
        
        newCurrStartTime = curr.startTime;
        if (newCurrChars.length > 0) {
           newCurrEndTime = newCurrChars[newCurrChars.length - 1].time;
        } else {
           newCurrEndTime = movedChars.length > 0 ? movedChars[0].time : curr.startTime;
        }

        if (movedChars.length > 0) {
           movedStartTime = movedChars[0].time;
           movedEndTime = movedChars[movedChars.length - 1].time;
        } else {
           movedStartTime = newCurrEndTime;
           movedEndTime = curr.endTime;
        }
        
        if (actualEnd === curr.editedText.length) {
            movedEndTime = curr.endTime;
        }
        if (actualStart === 0) {
            movedStartTime = curr.startTime;
        }
      } else {
        if (actualEnd === curr.editedText.length) {
          // Moved the end part out
          newCurrEndTime = splitTimeStart;
          movedStartTime = splitTimeStart;
          movedEndTime = curr.endTime;
        } else if (actualStart === 0) {
          // Moved the start part out
          newCurrStartTime = splitTimeEnd;
          movedStartTime = curr.startTime;
          movedEndTime = splitTimeEnd;
        } else {
          // Moved middle out
          newCurrEndTime = curr.endTime - dur * (fracEnd - fracStart);
        }
      }
      
      newSegments[idx] = {
        ...curr,
        editedText: newCurrText,
        originalChars: newCurrChars,
        startTime: newCurrStartTime,
        endTime: newCurrEndTime,
      };
      
      if (createNew) {
        const newId = Math.random().toString(36).substring(2, 9);
        newSegments.splice(idx + 1, 0, {
          id: newId,
          startTime: movedStartTime,
          endTime: movedEndTime,
          editedText: textToMove,
          originalChars: movedChars
        });
      } else {
         if (idx >= newSegments.length - 1) return prev;
         const nextSeg = newSegments[idx + 1];
         const combinedChars = [...movedChars, ...(nextSeg.originalChars || [])];
         newSegments[idx + 1] = {
           ...nextSeg,
           editedText: textToMove + (textToMove && nextSeg.editedText ? ' ' : '') + nextSeg.editedText,
           originalChars: combinedChars,
           startTime: combinedChars.length > 0 ? combinedChars[0].time : Math.min(nextSeg.startTime, movedStartTime),
         };
         // If moving left nothing behind, delete current
         if (newCurrText.trim() === '' && newCurrChars.length === 0 && actualStart === 0) {
            newSegments.splice(idx, 1);
         }
      }
      
      return newSegments;
    });
  };

  const moveTextToPreviousLine = (idx: number, start: number, end: number, createNew: boolean) => {
    setSegments(prev => {
      const newSegments = [...prev];
      const curr = newSegments[idx];
      
      const isSelection = start !== end;
      const actualStart = isSelection ? start : 0;
      const actualEnd = isSelection ? end : start;
      
      if (actualStart === actualEnd) {
         if (!createNew && idx > 0) {
             const prevSeg = newSegments[idx - 1];
             newSegments[idx - 1] = {
               ...prevSeg,
               originalChars: [...(prevSeg.originalChars || []), ...(curr.originalChars || [])],
               editedText: prevSeg.editedText + (prevSeg.editedText && curr.editedText ? ' ' : '') + curr.editedText,
               endTime: curr.endTime
             };
             newSegments.splice(idx, 1);
         } else if (createNew) {
             const prevSeg = newSegments[idx - 1];
             const newStartTime = prevSeg ? prevSeg.endTime + 0.001 : Math.max(0, curr.startTime - 2);
             const newEndTime = curr.startTime - 0.001;
             newSegments.splice(idx, 0, {
               id: Math.random().toString(36).substring(2, 9),
               startTime: newStartTime,
               endTime: newEndTime,
               editedText: '',
               originalChars: []
             });
         }
         return newSegments;
      }
      
      const textToMove = curr.editedText.substring(actualStart, actualEnd);
      const newCurrText = curr.editedText.substring(0, actualStart) + curr.editedText.substring(actualEnd);
      
      const textLen = Math.max(1, curr.editedText.length);
      const dur = curr.endTime - curr.startTime;
      const fracStart = actualStart / textLen;
      const fracEnd = actualEnd / textLen;
      const splitTimeStart = curr.startTime + dur * fracStart;
      const splitTimeEnd = curr.startTime + dur * fracEnd;

      const { charStartIdx, charEndIdx } = getCharIndices(curr.editedText, actualStart, actualEnd, curr.originalChars);
      
      let movedChars: CharInfo[] = [];
      let newCurrChars = curr.originalChars || [];
      let newCurrStartTime = curr.startTime;
      let newCurrEndTime = curr.endTime;
      let movedStartTime = splitTimeStart;
      let movedEndTime = splitTimeEnd;

      if (curr.originalChars && curr.originalChars.length > 0) {
        movedChars = curr.originalChars.slice(charStartIdx, charEndIdx);
        newCurrChars = [
          ...curr.originalChars.slice(0, charStartIdx),
          ...curr.originalChars.slice(charEndIdx)
        ];
        
        if (actualStart === 0) {
           movedStartTime = curr.startTime;
        } else if (movedChars.length > 0) {
           movedStartTime = movedChars[0].time;
        } else {
           movedStartTime = curr.startTime;
        }
        
        if (movedChars.length > 0) {
           movedEndTime = movedChars[movedChars.length - 1].time;
        } else {
           movedEndTime = newCurrChars.length > 0 ? newCurrChars[0].time : curr.startTime;
        }

        if (actualEnd === curr.editedText.length) {
            newCurrEndTime = curr.endTime;
        } else if (newCurrChars.length > 0) {
            newCurrEndTime = newCurrChars[newCurrChars.length - 1].time;
        } else {
            newCurrEndTime = curr.endTime;
        }
        
        if (newCurrChars.length > 0) {
            newCurrStartTime = newCurrChars[0].time;
        } else {
            newCurrStartTime = movedEndTime;
        }
      } else {
        if (actualStart === 0) {
          // Moved the start part out
          newCurrStartTime = splitTimeEnd;
          movedStartTime = curr.startTime;
          movedEndTime = splitTimeEnd;
        } else if (actualEnd === curr.editedText.length) {
          // Moved the end part out
          newCurrEndTime = splitTimeStart;
          movedStartTime = splitTimeStart;
          movedEndTime = curr.endTime;
        } else {
          // Moved middle out
          newCurrStartTime = curr.startTime + dur * (fracEnd - fracStart);
        }
      }
      
      newSegments[idx] = {
        ...curr,
        editedText: newCurrText,
        originalChars: newCurrChars,
        startTime: newCurrStartTime,
        endTime: newCurrEndTime,
      };
      
      if (createNew) {
        const newId = Math.random().toString(36).substring(2, 9);
        newSegments.splice(idx, 0, {
          id: newId,
          startTime: movedStartTime,
          endTime: movedEndTime,
          editedText: textToMove,
          originalChars: movedChars
        });
      } else {
         if (idx <= 0) return prev;
         const prevSeg = newSegments[idx - 1];
         const combinedChars = [...(prevSeg.originalChars || []), ...movedChars];
         newSegments[idx - 1] = {
           ...prevSeg,
           editedText: prevSeg.editedText + (prevSeg.editedText && textToMove ? ' ' : '') + textToMove,
           originalChars: combinedChars,
           endTime: combinedChars.length > 0 ? combinedChars[combinedChars.length - 1].time : Math.max(prevSeg.endTime, movedEndTime),
         };
         // If moving left nothing behind, delete current
         if (newCurrText.trim() === '' && newCurrChars.length === 0 && actualEnd === curr.editedText.length) {
            newSegments.splice(idx, 1);
         }
      }
      
      return newSegments;
    });
  };

  const handleStartContextMenu = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      options: [
        { label: 'Insert Previous Line', action: () => moveTextToPreviousLine(idx, 0, 0, true) },
        { label: 'Merge with Previous Line', action: () => moveTextToPreviousLine(idx, 0, 0, false), disabled: idx === 0 }
      ]
    });
  };

  const handleEndContextMenu = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      options: [
        { label: 'Insert Next Line', action: () => moveTextToNextLine(idx, 0, 0, true) },
        { label: 'Merge with Next Line', action: () => moveTextToNextLine(idx, 0, 0, false), disabled: idx === segments.length - 1 }
      ]
    });
  };

  const handleInputContextMenu = (e: React.MouseEvent<HTMLInputElement>, idx: number, seg: Segment) => {
    e.preventDefault();
    const input = e.target as HTMLInputElement;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const hasSelection = start !== end;
    
    if (start === 0 && end === input.value.length && hasSelection) {
      return;
    }

    let isStart = false;
    let isEnd = false;

    if (start === 0) {
      isStart = true;
    } else if (end === input.value.length) {
      isEnd = true;
    }

    if (!isStart && !isEnd) {
      return;
    }

    const options = [];
    
    if (isStart) {
      options.push({ 
        label: hasSelection ? 'Split Selection to New Previous Line' : 'Split at Cursor to New Previous Line', 
        action: () => moveTextToPreviousLine(idx, start, end, true) 
      });
      options.push({ 
        label: hasSelection ? 'Merge Selection to Previous Line' : 'Merge Text Before Cursor to Previous Line', 
        action: () => moveTextToPreviousLine(idx, start, end, false), 
        disabled: idx === 0 
      });
    } else if (isEnd) {
      options.push({ 
        label: hasSelection ? 'Split Selection to New Next Line' : 'Split at Cursor to New Next Line', 
        action: () => moveTextToNextLine(idx, start, end, true) 
      });
      options.push({ 
        label: hasSelection ? 'Merge Selection to Next Line' : 'Merge Text After Cursor to Next Line', 
        action: () => moveTextToNextLine(idx, start, end, false), 
        disabled: idx === segments.length - 1 
      });
    }

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      options
    });
  };

  const handleCharContextMenu = (e: React.MouseEvent, charTime: number) => {
    e.preventDefault();

    const segIdx = segments.findIndex(s => {
      if (s.originalChars && s.originalChars.length > 0) {
        return charTime >= s.originalChars[0].time && charTime <= s.originalChars[s.originalChars.length - 1].time;
      }
      return charTime >= s.startTime && charTime <= s.endTime;
    });

    if (segIdx === -1) return;

    const seg = segments[segIdx];
    let isStart = false;
    let isEnd = false;

    if (seg.originalChars && seg.originalChars.length > 0) {
      if (charTime === seg.originalChars[0].time) isStart = true;
      if (charTime === seg.originalChars[seg.originalChars.length - 1].time) isEnd = true;
    } else {
      if (charTime === seg.startTime) isStart = true;
      if (charTime === seg.endTime) isEnd = true;
    }

    if (!isStart && !isEnd) {
       const mid = (seg.startTime + seg.endTime) / 2;
       if (charTime < mid) isStart = true;
       else isEnd = true;
    }

    const options = [];
    
    let strIdx = 0;
    if (seg.originalChars && seg.originalChars.length > 0) {
       const charIdx = seg.originalChars.findIndex(c => c.time === charTime);
       if (charIdx !== -1) {
          strIdx = Math.round((charIdx / seg.originalChars.length) * seg.editedText.length);
       }
    } else {
       const fraction = (charTime - seg.startTime) / Math.max(0.001, seg.endTime - seg.startTime);
       strIdx = Math.round(fraction * seg.editedText.length);
    }
    
    if (isStart) {
      options.push({ label: 'Split at Character to New Previous Line', action: () => moveTextToPreviousLine(segIdx, strIdx, strIdx, true) });
      options.push({ label: 'Merge Text Before Character to Previous Line', action: () => moveTextToPreviousLine(segIdx, strIdx, strIdx, false), disabled: segIdx === 0 });
    }
    
    if (isEnd) {
      options.push({ label: 'Split at Character to New Next Line', action: () => moveTextToNextLine(segIdx, strIdx, strIdx, true) });
      options.push({ label: 'Merge Text After Character to Next Line', action: () => moveTextToNextLine(segIdx, strIdx, strIdx, false), disabled: segIdx === segments.length - 1 });
    }

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      options
    });
  };

  const addNewSegment = () => {
    const newId = Math.random().toString(36).substring(2, 9);
    setSegments(prev => {
      let newStartTime = currentTime;
      if (prev.length > 0) {
        const sorted = [...prev].sort((a, b) => a.startTime - b.startTime);
        const lastSeg = sorted[sorted.length - 1];
        const nextCharIdx = unifiedChars.findIndex(c => c.time > lastSeg.endTime + 0.001);
        if (nextCharIdx !== -1) {
          newStartTime = unifiedChars[nextCharIdx].time;
        } else {
          newStartTime = lastSeg.endTime + 0.1;
        }
      }

      let newEndTime = newStartTime + 3;
      const charsInSeg = unifiedChars.filter(c => c.time >= newStartTime && c.time <= newEndTime);
      if (charsInSeg.length > 0) {
        newEndTime = charsInSeg[charsInSeg.length - 1].time;
      }

      const newSegments = [
        {
          id: newId,
          startTime: newStartTime,
          endTime: newEndTime,
          originalChars: charsInSeg,
          editedText: charsInSeg.map(c => c.char).join('')
        },
        ...prev
      ];
      return newSegments;
    });
  };

  const seekTo = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const activeSegmentIndex = useMemo(() => {
    let activeIdx = -1;
    for (let i = 0; i < segments.length; i++) {
      if (currentTime >= segments[i].startTime && currentTime <= segments[i].endTime) {
        return i;
      }
      if (currentTime >= segments[i].startTime) {
        activeIdx = i;
      }
    }
    return activeIdx;
  }, [currentTime, segments]);

  const activeSegmentId = activeSegmentIndex >= 0 ? segments[activeSegmentIndex].id : null;

  useEffect(() => {
    if (playing && activeSegmentId) {
      document.getElementById(`timeline-seg-${activeSegmentId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeSegmentId, playing]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    setPlayingSegmentId(null);
    if (playing) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPlayingSegmentId(null);
    seekTo(parseFloat(e.target.value));
  };

  const activeSegToHighlight = pickingMode 
    ? segments.find(s => s.id === pickingMode.id) 
    : segments.find(s => s.id === activeSegmentId);

  const handleCaretMove = (e: React.SyntheticEvent<HTMLInputElement>, seg: Segment) => {
    let index = (e.target as HTMLInputElement).selectionStart || 0;
    if (index >= seg.editedText.length && index > 0) {
      index = index - 1;
    }
    if (seg.originalChars && seg.originalChars.length > 0) {
      const charIndex = Math.min(index, seg.originalChars.length - 1);
      if (charIndex >= 0) {
        const char = seg.originalChars[charIndex];
        setActiveCharTime(char.time);
        seekTo(char.time);
      }
    }
  };

  const exportSRT = () => {
    const content = generateSRTContent(segments);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'corrected_subtitles.srt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-screen w-full flex flex-col bg-zinc-950 text-slate-100 font-sans overflow-hidden">
      {/* Header Bar */}
      <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center text-primary">
            <VideoIcon size={20} />
          </div>
          <h1 className="text-xl font-medium tracking-tight">Precision Subtitle Corrector</h1>
        </div>
        <div className="flex items-center gap-3">
          {segments.length > 0 && (
            <button 
              onClick={exportSRT}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-medium transition-colors"
            >
              <Download size={16} />
              Export SRT
            </button>
          )}
        </div>
      </header>

      {/* Main Layout - Split View */}
      <main className="flex-1 flex flex-row overflow-hidden w-full h-full">
        
        {/* LEFT PANE - Unified Source Text View (40%) */}
        <section className="w-[40%] flex flex-col border-r border-zinc-800 bg-zinc-950 shrink-0 h-full relative">
          {/* Data Import Controls */}
          <div className="p-4 border-b border-zinc-800 shrink-0 bg-zinc-900/40">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-zinc-300">
                <FileJson size={18} className="text-indigo-400"/>
                <h2 className="text-sm font-medium">Text & Time Data</h2>
              </div>
              <label className="cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2.5 py-1 rounded text-xs font-medium transition-colors">
                Upload File
                <input type="file" accept=".json,.srt,.txt" className="hidden" onChange={(e) => handleDataFileUpload(e, false)} />
              </label>
            </div>
            
            <textarea 
              className="w-full h-24 bg-zinc-950/80 border border-zinc-800 focus:border-indigo-500/50 p-3 text-xs font-mono text-zinc-400 placeholder-zinc-600 outline-none resize-y rounded mb-2 transition-colors"
              placeholder="Paste raw character arrays or SRT content here..."
              value={inputText}
              onChange={e => setInputText(e.target.value)}
            />
            
            {parseError && (
              <div className="text-red-400 text-xs bg-red-400/10 p-2 rounded ring-1 ring-red-400/20 mb-2">
                {parseError}
              </div>
            )}

            <button 
              onClick={handleDataParse}
              disabled={!inputText.trim()}
              className="w-full bg-zinc-200 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-zinc-900 py-2 rounded text-sm font-medium transition-colors"
            >
              Parse & Render Text
            </button>
          </div>

          {/* Unified Text Flow Body */}
          <div className={cn(
             "flex-1 overflow-y-auto p-6 relative transition-all",
             pickingMode?.type === 'start' ? "bg-emerald-950/20 ring-2 ring-inset ring-emerald-500/50" :
             pickingMode?.type === 'end' ? "bg-rose-950/20 ring-2 ring-inset ring-rose-500/50" : "bg-zinc-900/20"
          )}>
             {unifiedChars.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-3 text-center px-4">
                   <FileJson size={32} className="opacity-20" />
                   <div className="text-sm">Loaded text will appear here as a unified block.<br/>Click any character to jump to precisely that moment.</div>
                </div>
             ) : (
                <div className="leading-[2.5] text-[1.1rem]">
                   {unifiedChars.map((c, i) => {
                     const isCurrent = currentTime >= c.time && (!unifiedChars[i+1] || currentTime < unifiedChars[i+1].time);
                     const isCharInActiveSeg = activeSegToHighlight ? (c.time >= activeSegToHighlight.startTime && c.time <= activeSegToHighlight.endTime) : false;
                     const isCharSelectedActive = activeCharTime === c.time;
                     const isMapped = segments.some(seg => seg.id !== pickingMode?.id && c.time >= seg.startTime && c.time <= seg.endTime);
                     const isCurrentSegMapped = pickingMode ? segments.some(seg => seg.id === pickingMode.id && c.time >= seg.startTime && c.time <= seg.endTime) : false;

                     let charClasses = "cursor-pointer transition-colors mx-[1px] relative inline-block px-[2px] py-[1px] rounded-sm ";
                     
                     if (isCharSelectedActive) {
                        charClasses += "bg-yellow-400 text-black font-bold z-10 shadow-md ring-2 ring-yellow-400/50 ";
                     } else if (isCharInActiveSeg) {
                        charClasses += "bg-indigo-600 font-medium text-white shadow-sm ";
                     } else if (isCurrent) {
                        charClasses += "bg-zinc-600 font-medium text-white shadow-sm ";
                     } else if (isMapped && !pickingMode) {
                        charClasses += "text-zinc-600 ";
                     } else {
                        charClasses += "text-zinc-300 ";
                     }

                     if (pickingMode) {
                        if (pickingMode.type === 'start') {
                           charClasses += "hover:bg-emerald-500 hover:text-white ";
                        } else {
                           charClasses += "hover:bg-rose-500 hover:text-white ";
                        }
                        
                        if (isMapped) {
                           charClasses += "opacity-30 ";
                        } else if (isCurrentSegMapped) {
                           charClasses += pickingMode.type === 'start' ? "text-emerald-300 font-medium " : "text-rose-300 font-medium ";
                        }
                     } else if (!isMapped && !isCharSelectedActive && !isCharInActiveSeg && !isCurrent) {
                        charClasses += "hover:bg-zinc-700 hover:text-zinc-100 ";
                     }

                     return (
                        <span 
                          key={i} 
                          onClick={() => {
                             if (pickingMode) {
                                setSegments(prev => {
                                   const newSegments = prev.map(s => {
                                      if (s.id === pickingMode.id) {
                                         const newStartTime = pickingMode.type === 'start' ? c.time : s.startTime;
                                         const newEndTime = pickingMode.type === 'end' ? c.time : s.endTime;
                                         const minT = Math.min(newStartTime, newEndTime || Infinity);
                                         const maxT = Math.max(newStartTime, newEndTime || -Infinity);
                                         const selectedChars = unifiedChars.filter(char => char.time >= minT && char.time <= maxT);
                                         const newText = selectedChars.map(char => char.char).join('');
                                         return { ...s, startTime: newStartTime, endTime: newEndTime, editedText: newText, originalChars: selectedChars };
                                      }
                                      return s;
                                   });
                                   return newSegments.sort((a, b) => a.startTime - b.startTime);
                                });
                                setPickingMode(null);
                             } else {
                                seekTo(c.time);
                             }
                          }} 
                          onContextMenu={(e) => handleCharContextMenu(e, c.time)}
                          title={`Click to ${pickingMode ? 'pick ' + pickingMode.type + ' time' : 'seek to'} ${formatTimeCode(c.time)}`}
                          className={charClasses}
                        >
                          {c.char}
                        </span>
                     );
                   })}
                </div>
             )}
          </div>
        </section>

        {/* RIGHT PANE - Video Player & Timeline (60%) */}
        <section className="w-[60%] flex flex-col h-full bg-zinc-950 relative">
          
          {/* TOP: Video Section */}
          <div className="h-[50%] flex flex-col bg-black border-b border-zinc-800 relative shrink-0">
            {!videoSrc ? (
               <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-400 bg-zinc-900/30">
                  <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
                    <Upload size={24} className="text-zinc-500" />
                  </div>
                  <h2 className="text-lg font-medium text-zinc-200 mb-2">Upload Reference Video</h2>
                  <p className="text-sm mb-6 max-w-sm">
                    Select your local video showing the original subtitles. We'll play it here without blocking the subtitle area.
                  </p>
                  <label className="cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-2.5 rounded shadow text-sm font-medium transition-colors">
                    Choose MP4/WebM File
                    <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
                  </label>
               </div>
            ) : (
               <>
                  <div className="flex-1 relative overflow-hidden flex items-center justify-center" onClick={togglePlay}>
                     <video
                        ref={videoRef}
                        src={videoSrc}
                        className="max-w-full max-h-full object-contain cursor-pointer"
                        onTimeUpdate={(e) => {
                          const time = e.currentTarget.currentTime;
                          setCurrentTime(time);
                          if (playingSegmentId) {
                            const seg = segments.find(s => s.id === playingSegmentId);
                            if (seg && time >= seg.endTime) {
                              e.currentTarget.pause();
                              setPlayingSegmentId(null);
                            }
                          }
                        }}
                        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                        onPlay={() => setPlaying(true)}
                        onPause={() => setPlaying(false)}
                     />
                  </div>
                  
                  {/* Separate Decoupled Controls Bar (Inside Video Pane, Bottom Edge) */}
                  <div className="h-14 bg-zinc-900 p-3 px-4 flex items-center gap-4 shrink-0 text-zinc-400 border-t border-zinc-800">
                     <button 
                       onClick={togglePlay}
                       className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                     >
                       {playing ? <Pause fill="currentColor" size={14} /> : <Play fill="currentColor" size={14} className="translate-x-0.5" />}
                     </button>
                     <span className="text-xs font-mono w-14 text-right flex-shrink-0">
                       {formatTimeCode(currentTime).slice(3, 8)}
                     </span>
                     <input 
                       type="range"
                       min={0}
                       max={duration || 100}
                       step="0.001"
                       value={currentTime}
                       onChange={handleScrub}
                       className="flex-1 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                     />
                     <span className="text-xs font-mono w-14 flex-shrink-0">
                       {formatTimeCode(duration).slice(3, 8)}
                     </span>
                  </div>
               </>
            )}
          </div>

          {/* BOTTOM: Timeline Subtitle Editor */}
          <div className="flex-1 flex flex-col bg-zinc-900/10 relative overflow-hidden">
            {/* Sticky Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-800/50 text-zinc-300 shrink-0 bg-zinc-900/40">
               <div className="flex items-center gap-2">
                 <Layers size={16} className="text-indigo-400" />
                 <h2 className="font-medium text-sm">Timeline Editor</h2>
               </div>
               <div className="flex items-center gap-2">
                 <button
                   onClick={() => setShowTimelineImport(!showTimelineImport)}
                   className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded font-medium transition-colors"
                 >
                   Import
                 </button>
                 <button 
                   onClick={addNewSegment}
                   className="flex items-center gap-1.5 bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 px-3 py-1.5 rounded text-xs font-medium transition-colors"
                 >
                   <Plus size={14} /> Add Segment
                 </button>
               </div>
            </div>
            
            {showTimelineImport && (
               <div className="p-4 border-b border-zinc-800/50 bg-zinc-950/80 shrink-0 flex flex-col gap-2 relative">
                 <button 
                   onClick={() => setShowTimelineImport(false)}
                   className="absolute top-2 right-2 text-zinc-500 hover:text-zinc-300 transition-colors"
                   title="Close"
                 >
                   ✕
                 </button>
                 <h3 className="text-xs font-medium text-zinc-400 mb-1">Import Subtitles (JSON/SRT)</h3>
                 <textarea
                   className="w-full h-20 bg-zinc-900 border border-zinc-800 focus:border-indigo-500/50 p-3 text-xs font-mono text-zinc-400 placeholder-zinc-600 outline-none resize-y rounded transition-colors"
                   placeholder="Paste JSON array or SRT to import segments..."
                   value={timelineInputText}
                   onChange={e => setTimelineInputText(e.target.value)}
                 />
                 {timelineParseError && (
                   <div className="text-red-400 text-xs bg-red-400/10 p-2 rounded ring-1 ring-red-400/20">
                     {timelineParseError}
                   </div>
                 )}
                 <div className="flex items-center justify-between">
                   <button
                     onClick={handleTimelineParse}
                     disabled={!timelineInputText.trim()}
                     className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded text-xs font-medium transition-colors"
                   >
                     Parse & Import
                   </button>
                   <label className="cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5">
                     <FileJson size={14} /> Upload File
                     <input type="file" accept=".json,.srt,.txt" className="hidden" onChange={(e) => handleDataFileUpload(e, true)} />
                   </label>
                 </div>
               </div>
            )}
            
            {/* Scrollable Subtitle List */}
            <div className="flex-1 overflow-y-auto p-4">
              {segments.length === 0 ? (
                 <div className="flex flex-col items-center justify-center py-6 bg-zinc-900/50 rounded-lg border border-dashed border-zinc-800 text-zinc-500 text-sm gap-3">
                    <p>Click "Add Segment" or create one to map text regions here.</p>
                    <button onClick={addNewSegment} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded transition-colors text-xs">+ Create Segment</button>
                 </div>
              ) : (
                 <div className="flex flex-col gap-2 pb-32">
                   {segments.map((seg, idx) => {
                    const isActive = pickingMode ? pickingMode.id === seg.id : activeSegmentId === seg.id;
                    return (
                       <div 
                         key={seg.id} 
                         id={`timeline-seg-${seg.id}`}
                         className={cn(
                           "flex items-center gap-2 p-2 rounded bg-zinc-900/50 ring-1 transition-all group",
                           isActive ? "ring-indigo-500/60 shadow-lg shadow-indigo-900/10 bg-zinc-800/80" : "ring-zinc-800/50 hover:bg-zinc-800/50"
                         )}
                       >
                          {/* Left Controls (ID & Times) */}
                          <div className="flex items-center gap-2 shrink-0 border-r border-zinc-700/50 pr-2">
                             <span className={cn("font-mono text-xs w-5 text-right font-bold pr-1", isActive ? "text-indigo-400" : "text-zinc-600")}>
                               {idx + 1}
                             </span>
                             
                             <div className="flex items-center gap-1">
                               <button 
                                 onClick={() => setPickingMode(pickingMode?.id === seg.id && pickingMode?.type === 'start' ? null : { id: seg.id, type: 'start' })}
                                 className={cn("w-14 py-0.5 flex flex-col items-center justify-center rounded transition-colors ring-1",
                                    pickingMode?.id === seg.id && pickingMode?.type === 'start'
                                       ? "bg-emerald-600 text-white ring-emerald-500 shadow-md transform scale-105"
                                       : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 ring-zinc-700/50"
                                 )}
                                 onContextMenu={(e) => handleStartContextMenu(e, idx)}
                                 title="Pick Start Time (Right-click for options)"
                               >
                                 <span className={cn("text-[8px] font-bold leading-none mb-0.5 tracking-wider uppercase", pickingMode?.id !== seg.id || pickingMode?.type !== 'start' ? "text-emerald-400" : "text-emerald-100")}>Start</span>
                                 <span className="text-xs font-mono leading-none">{formatTimeCode(seg.startTime).slice(3, 8)}</span>
                               </button>
                               
                               <span className="text-zinc-600 mx-0.5 text-xs">-</span>
                               
                               <button 
                                 onClick={() => setPickingMode(pickingMode?.id === seg.id && pickingMode?.type === 'end' ? null : { id: seg.id, type: 'end' })}
                                 className={cn("w-14 py-0.5 flex flex-col items-center justify-center rounded transition-colors ring-1",
                                    pickingMode?.id === seg.id && pickingMode?.type === 'end'
                                       ? "bg-rose-600 text-white ring-rose-500 shadow-md transform scale-105"
                                       : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 ring-zinc-700/50"
                                 )}
                                 onContextMenu={(e) => handleEndContextMenu(e, idx)}
                                 title="Pick End Time (Right-click for options)"
                               >
                                  <span className={cn("text-[8px] font-bold leading-none mb-0.5 tracking-wider uppercase", pickingMode?.id !== seg.id || pickingMode?.type !== 'end' ? "text-rose-400" : "text-rose-100")}>End</span>
                                  <span className="text-xs font-mono leading-none">{formatTimeCode(seg.endTime).slice(3, 8)}</span>
                               </button>
                             </div>
                          </div>
                          
                          {/* Text Input */}
                          <input
                            type="text"
                            value={seg.editedText}
                            onChange={(e) => handleTextChange(seg.id, e.target.value)}
                            onClick={(e) => handleCaretMove(e, seg)}
                            onKeyUp={(e) => handleCaretMove(e, seg)}
                            onContextMenu={(e) => handleInputContextMenu(e, idx, seg)}
                            onBlur={() => setActiveCharTime(null)}
                            className={cn(
                              "flex-1 bg-transparent px-2 py-1 outline-none text-sm rounded transition-colors min-w-0 border-none",
                              isActive ? "text-zinc-100 bg-zinc-950/40 ring-1 ring-indigo-500/30 font-medium" : "text-zinc-300 focus:bg-zinc-950/40 focus:ring-1 focus:ring-zinc-600 hover:bg-zinc-950/20"
                            )}
                            placeholder="Subtitle text..."
                          />

                          {/* Right Controls (Action Icons) */}
                          <div className="flex items-center gap-1 shrink-0 border-l border-zinc-700/50 pl-2 opacity-60 group-hover:opacity-100 transition-opacity">
                             <button
                               onClick={() => {
                                 setPlayingSegmentId(seg.id);
                                 seekTo(seg.startTime);
                                 if (videoRef.current) videoRef.current.play();
                               }}
                               className="p-1.5 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/20 rounded transition-colors"
                               title="Play Segment"
                             >
                                <Play size={14}/>
                             </button>
                             <button
                               onClick={() => deleteSegment(seg.id)}
                               className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded transition-colors"
                               title="Delete Segment"
                             >
                                <Trash2 size={14}/>
                             </button>
                          </div>
                       </div>
                    );
                  })}
               </div>
            )}
            </div>
          </div>

        </section>
      </main>

      {contextMenu && (
        <div 
          className="fixed z-50 bg-zinc-800 border border-zinc-700 shadow-xl rounded py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.options.map((opt, i) => (
            <button
              key={i}
              disabled={opt.disabled}
              className={cn(
                "w-full text-left px-4 py-2 text-sm transition-colors",
                opt.disabled 
                  ? "text-zinc-500 cursor-not-allowed" 
                  : opt.danger 
                    ? "text-red-400 hover:bg-zinc-700" 
                    : "text-zinc-200 hover:bg-zinc-700"
              )}
              onClick={(e) => {
                e.stopPropagation();
                if (!opt.disabled) {
                  opt.action();
                  setContextMenu(null);
                }
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

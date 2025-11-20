
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { AppSettings, Block, Backlink } from '../types';
import { GripVertical, Wand2, ChevronDown, Layers, Copy, ArrowDownUp, CheckSquare, Bold, Italic, Underline, Highlighter, MoreHorizontal, PaintBucket, Link as LinkIcon, Braces, Table, ArrowRightCircle, GalleryHorizontalEnd } from 'lucide-react';
import { generateFlashcardsFromTopic } from '../services/geminiService';
import { CardTable } from './CardTable';
import { generateId } from '../utils';

interface EditorProps {
  title: string;
  blocks: Block[];
  allDocTitles: { id: string; title: string }[];
  backlinks?: Backlink[]; // New prop
  settings: AppSettings;
  onChangeTitle: (title: string) => void;
  onChangeBlocks: (blocks: Block[]) => void;
  onStartStudy: (options: { mode: 'spaced' | 'all' | 'order' | 'flashcards', specificCardIds?: string[] }) => void;
  onNavigateToDoc?: (docId: string) => void;
}

interface SelectionState {
  show: boolean;
  x: number;
  y: number;
  blockIndex: number;
  start: number;
  end: number;
}

// -- Memoized Block Component for Performance --
interface BlockRowProps {
    block: Block;
    index: number;
    isSelected: boolean;
    selectionMode: boolean;
    onChange: (index: number, content: string) => void;
    onKeyDown: (e: React.KeyboardEvent, index: number) => void;
    onSelect: (id: string) => void;
    onFocusRef: (el: HTMLTextAreaElement | null, index: number) => void;
    onMouseUp: (e: React.MouseEvent, index: number) => void;
}

const BlockRow = React.memo(({ block, index, isSelected, selectionMode, onChange, onKeyDown, onSelect, onFocusRef, onMouseUp }: BlockRowProps) => {
    const handleResize = (el: HTMLTextAreaElement | null) => {
        if(el) {
            el.style.height = 'auto';
            el.style.height = el.scrollHeight + 'px';
        }
    };

    // Determine if block is a card (visual indicator)
    const isCard = block.content.includes('::') || block.content.includes(';;') || /\{[^}]+\}/.test(block.content);

    return (
        <div
            className={`group flex items-start py-1 ${isSelected ? 'bg-gray-100 dark:bg-slate-800 -mx-4 px-4 rounded' : ''}`}
            style={{ paddingLeft: selectionMode ? '0px' : `${block.level * 24}px` }}
          >
            {selectionMode ? (
               <div className="mr-3 mt-2">
                   <input 
                    type="checkbox" 
                    checked={isSelected} 
                    onChange={() => onSelect(block.id)} 
                    className="w-4 h-4 rounded border-gray-300"
                   />
               </div>
            ) : (
                <div className="w-6 flex items-center justify-center pt-1.5 opacity-0 group-hover:opacity-30 cursor-grab active:cursor-grabbing select-none">
                   <GripVertical size={14} className="text-gray-400 dark:text-slate-500" />
                </div>
            )}
            
            <div className="flex-1 relative">
               {!selectionMode && (
                 <span className={`absolute left-[-18px] top-2.5 w-1.5 h-1.5 rounded-full ${isCard ? 'bg-gray-400 dark:bg-slate-400' : 'bg-gray-300 dark:bg-slate-600'}`}></span>
               )}
               
               <textarea
                ref={(el) => { 
                    onFocusRef(el, index); 
                    handleResize(el); 
                }}
                value={block.content}
                onChange={(e) => onChange(index, e.target.value)}
                onKeyDown={(e) => onKeyDown(e, index)}
                onMouseUp={(e) => onMouseUp(e, index)}
                onKeyUp={(e) => {
                    // Also check selection on key up (shift+arrow keys)
                    // Passing synthetic event as partial mouse event for handler reuse
                    onMouseUp(e as unknown as React.MouseEvent, index)
                }}
                rows={1}
                className={`w-full bg-transparent outline-none text-gray-700 dark:text-slate-200 selection:bg-blue-200 dark:selection:bg-blue-800 resize-none overflow-hidden block py-1 ${isCard ? 'font-semibold text-gray-800 dark:text-white' : ''}`}
                placeholder={index === 0 ? "Type ;; for flashcards..." : ""}
                spellCheck={false}
              />
              
              {isCard && (
                 <div className="absolute right-0 top-1 text-[10px] bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 px-1.5 py-0.5 rounded border border-gray-200 dark:border-slate-700 pointer-events-none opacity-50 select-none">
                    CARD
                 </div>
              )}
            </div>
          </div>
    );
}, (prev, next) => {
    // Custom comparison for performance
    return (
        prev.block.content === next.block.content &&
        prev.block.level === next.block.level &&
        prev.isSelected === next.isSelected &&
        prev.selectionMode === next.selectionMode &&
        prev.index === next.index
    );
});


export const Editor: React.FC<EditorProps> = ({
  title,
  blocks,
  allDocTitles,
  backlinks = [],
  settings,
  onChangeTitle,
  onChangeBlocks,
  onStartStudy,
  onNavigateToDoc
}) => {
  const inputRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const [showStudyMenu, setShowStudyMenu] = useState(false);
  const [showCardTable, setShowCardTable] = useState(false); 
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set());
  
  // References UI
  const [refTriggerIdx, setRefTriggerIdx] = useState<number | null>(null);
  const [refSearch, setRefSearch] = useState("");
  
  // Text Selection Toolbar State
  const [selectionState, setSelectionState] = useState<SelectionState>({
      show: false, x: 0, y: 0, blockIndex: -1, start: 0, end: 0
  });

  const menuRef = useRef<HTMLDivElement>(null);

  const flashcardCount = useMemo(() => {
      return blocks.filter(b => 
        b.isFlashcard || 
        b.content.includes('::') || 
        b.content.includes(';;') || 
        /\{[^}]+\}/.test(b.content)
      ).length;
  }, [blocks]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowStudyMenu(false);
      }
      if (refTriggerIdx !== null && !(event.target as HTMLElement).closest('.ref-popup')) {
          setRefTriggerIdx(null);
      }
      // Close text selection toolbar if clicking outside the toolbar and outside any textarea
      const isTextarea = (event.target as HTMLElement).tagName === 'TEXTAREA';
      const isToolbar = (event.target as HTMLElement).closest('.formatting-toolbar');
      if (!isTextarea && !isToolbar) {
          setSelectionState(s => ({ ...s, show: false }));
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [refTriggerIdx]);

  const focusBlock = (index: number) => {
    setTimeout(() => {
      if (inputRefs.current[index]) {
        inputRefs.current[index]?.focus();
        // Move cursor to end
        const len = inputRefs.current[index]?.value.length || 0;
        inputRefs.current[index]?.setSelectionRange(len, len);
      }
    }, 0);
  };

  const handleBlockChange = (index: number, content: string) => {
    // Check for Reference Trigger
    if (content.endsWith('[[') && !content.includes('[[' + ' ')) {
        setRefTriggerIdx(index);
        setRefSearch("");
    }

    let newContent = content;
    
    // Replacements
    if (newContent.endsWith(';; ')) newContent = newContent.replace(';; ', '⇒ ');
    if (newContent.endsWith(':: ')) newContent = newContent.replace(':: ', '↔ ');

    const newBlocks = [...blocks];
    
    if (newBlocks[index].content !== newContent) {
        newBlocks[index] = {
            ...newBlocks[index],
            content: newContent,
        };
        onChangeBlocks(newBlocks);
    }
  };

  // --- Formatting Logic ---

  const handleTextSelection = (e: React.MouseEvent, index: number) => {
      const el = inputRefs.current[index];
      if (!el) return;

      if (el.selectionStart !== el.selectionEnd) {
          setSelectionState({
              show: true,
              x: e.clientX,
              y: e.clientY - 40, // Above cursor
              blockIndex: index,
              start: el.selectionStart,
              end: el.selectionEnd
          });
      } else {
          // Hide if no selection
          setSelectionState(prev => ({ ...prev, show: false }));
      }
  };

  const applyFormat = (formatType: 'bold' | 'italic' | 'underline' | 'highlight' | 'cloze' | 'ref' | 'color', colorValue?: string) => {
      const { blockIndex, start, end } = selectionState;
      if (blockIndex === -1) return;

      const block = blocks[blockIndex];
      const text = block.content;
      const selection = text.substring(start, end);
      
      let newText = text;
      let prefix = '';
      let suffix = '';

      switch (formatType) {
          case 'bold':
              prefix = '**'; suffix = '**';
              break;
          case 'italic':
              prefix = '*'; suffix = '*';
              break;
          case 'underline':
              prefix = '<u>'; suffix = '</u>';
              break;
          case 'highlight':
              prefix = '^^'; suffix = '^^';
              break;
          case 'cloze':
              prefix = '{'; suffix = '}';
              break;
          case 'ref':
              prefix = '[['; suffix = ']]';
              break;
          case 'color':
              if (colorValue) {
                  prefix = `<span style="color:${colorValue}">`;
                  suffix = '</span>';
              }
              break;
      }
      
      const before = text.substring(0, start);
      const after = text.substring(end);
      
      newText = before + prefix + selection + suffix + after;

      handleBlockChange(blockIndex, newText);
      setSelectionState(prev => ({ ...prev, show: false }));

      // Refocus
      setTimeout(() => {
          const el = inputRefs.current[blockIndex];
          if (el) {
              el.focus();
          }
      }, 0);
  };

  // --- End Formatting Logic ---

  const insertReference = (docTitle: string) => {
      if (refTriggerIdx === null) return;
      const block = blocks[refTriggerIdx];
      const newContent = block.content.replace(/\[\[$/, `[[${docTitle}]] `);
      handleBlockChange(refTriggerIdx, newContent);
      setRefTriggerIdx(null);
      focusBlock(refTriggerIdx);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (refTriggerIdx !== null) return; 

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const newBlock: Block = {
        id: generateId(),
        content: '',
        level: blocks[index].level,
      };
      const newBlocks = [...blocks];
      newBlocks.splice(index + 1, 0, newBlock);
      onChangeBlocks(newBlocks);
      focusBlock(index + 1);
    } else if (e.key === 'Backspace' && blocks[index].content === '') {
      e.preventDefault();
      if (blocks.length > 1) {
        const newBlocks = blocks.filter((_, i) => i !== index);
        onChangeBlocks(newBlocks);
        focusBlock(index - 1);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const newBlocks = [...blocks];
      if (e.shiftKey) {
        if (newBlocks[index].level > 0) {
          newBlocks[index].level -= 1;
          onChangeBlocks(newBlocks);
        }
      } else {
        if (index > 0 && newBlocks[index].level <= newBlocks[index - 1].level) {
            newBlocks[index].level += 1;
            onChangeBlocks(newBlocks);
        }
      }
    } else if (e.key === 'ArrowUp') {
       const el = inputRefs.current[index];
       if (el && el.selectionStart === 0) {
           e.preventDefault();
           if (index > 0) focusBlock(index - 1);
       }
    } else if (e.key === 'ArrowDown') {
       const el = inputRefs.current[index];
       if (el && el.selectionStart === el.value.length) {
           e.preventDefault();
           if (index < blocks.length - 1) focusBlock(index + 1);
       }
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    try {
      const newBlocks = await generateFlashcardsFromTopic(prompt);
      onChangeBlocks([...blocks, ...newBlocks]);
      setPrompt("");
      setShowPrompt(false);
    } catch (e) {
      alert("Failed to generate content");
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleSelection = (id: string) => {
      const newSet = new Set(selectedBlockIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedBlockIds(newSet);
  };

  const handleToggleDisable = (blockId: string) => {
      const newBlocks = blocks.map(b => {
          if (b.id === blockId) {
              return {
                  ...b,
                  srsData: {
                      ...b.srsData,
                      // Preserve existing SRS data or init defaults if missing, then toggle
                      nextReview: b.srsData?.nextReview || 0,
                      interval: b.srsData?.interval || 0,
                      easeFactor: b.srsData?.easeFactor || 2.5,
                      repetitions: b.srsData?.repetitions || 0,
                      lapses: b.srsData?.lapses || 0,
                      disabled: !b.srsData?.disabled
                  }
              };
          }
          return b;
      });
      onChangeBlocks(newBlocks);
  };

  // Ref Handler
  const setRef = (el: HTMLTextAreaElement | null, index: number) => {
      inputRefs.current[index] = el;
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-white dark:bg-slate-950 flex flex-col transition-colors duration-300 relative">
      
      {/* Card Table Modal */}
      <CardTable 
          isOpen={showCardTable} 
          onClose={() => setShowCardTable(false)} 
          blocks={blocks}
          docTitle={title}
          settings={settings}
          onToggleDisable={handleToggleDisable}
          onStartStudy={onStartStudy}
      />

      {/* Floating Formatting Toolbar */}
      {selectionState.show && (
          <div 
            className="fixed z-50 flex items-center gap-1 p-1 bg-gray-900 text-white rounded-lg shadow-xl transform -translate-x-1/2 formatting-toolbar animate-in fade-in zoom-in-95 duration-100"
            style={{ top: selectionState.y, left: selectionState.x }}
            onMouseDown={(e) => e.preventDefault()} // Prevent blur
          >
             <button onClick={() => applyFormat('bold')} className="p-1.5 hover:bg-gray-700 rounded transition-colors" title="Bold">
                 <Bold size={14} strokeWidth={3} />
             </button>
             <button onClick={() => applyFormat('italic')} className="p-1.5 hover:bg-gray-700 rounded transition-colors" title="Italic">
                 <Italic size={14} />
             </button>
             <button onClick={() => applyFormat('underline')} className="p-1.5 hover:bg-gray-700 rounded transition-colors" title="Underline">
                 <Underline size={14} />
             </button>
             <div className="w-px h-4 bg-gray-700 mx-0.5"></div>
             <button onClick={() => applyFormat('cloze')} className="p-1.5 hover:bg-gray-700 rounded transition-colors text-yellow-400 font-bold" title="Cloze Card {...}">
                 <Braces size={14} />
             </button>
             <button onClick={() => applyFormat('highlight')} className="p-1.5 hover:bg-gray-700 rounded transition-colors text-yellow-200" title="Highlight ^^...^^">
                 <Highlighter size={14} />
             </button>
             <button onClick={() => applyFormat('ref')} className="p-1.5 hover:bg-gray-700 rounded transition-colors text-blue-300" title="Reference [[...]]">
                 <LinkIcon size={14} />
             </button>
             <div className="w-px h-4 bg-gray-700 mx-0.5"></div>
             
             {/* Colors */}
             <button onClick={() => applyFormat('color', 'red')} className="p-1.5 hover:bg-gray-700 rounded transition-colors" title="Red Text">
                 <div className="w-3 h-3 rounded-full bg-red-500"></div>
             </button>
             <button onClick={() => applyFormat('color', 'blue')} className="p-1.5 hover:bg-gray-700 rounded transition-colors" title="Blue Text">
                 <div className="w-3 h-3 rounded-full bg-blue-500"></div>
             </button>
             <button onClick={() => applyFormat('color', 'green')} className="p-1.5 hover:bg-gray-700 rounded transition-colors" title="Green Text">
                 <div className="w-3 h-3 rounded-full bg-green-500"></div>
             </button>
          </div>
      )}

      {/* Reference Popup */}
      {refTriggerIdx !== null && (
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 max-h-60 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-2xl rounded-lg z-50 overflow-y-auto ref-popup p-2">
              <div className="text-xs font-bold text-gray-400 uppercase px-2 mb-2">Link to Document</div>
              {allDocTitles.map(d => (
                  <div 
                    key={d.id} 
                    className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer rounded text-sm text-gray-700 dark:text-slate-200"
                    onClick={() => insertReference(d.title)}
                  >
                      {d.title}
                  </div>
              ))}
          </div>
      )}

      <div className="p-8 pb-4 max-w-4xl mx-auto w-full">
        <input
          type="text"
          value={title}
          onChange={(e) => onChangeTitle(e.target.value)}
          placeholder="Untitled Document"
          className="text-4xl font-bold text-gray-900 dark:text-slate-100 w-full outline-none placeholder-gray-300 dark:placeholder-slate-600 bg-transparent"
          autoFocus
        />
        <div className="flex items-center gap-4 mt-4 text-gray-500 dark:text-slate-400 text-sm flex-wrap">
          <div className="flex items-center gap-2">
             <span className="bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-gray-200 dark:border-slate-700 font-mono text-xs">{`{}`}</span> cloze
          </div>
          <div className="flex-1"></div>

          <button 
            onClick={() => setSelectionMode(!selectionMode)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors text-sm font-medium ${selectionMode ? 'bg-gray-200 text-gray-800' : 'hover:bg-gray-100 text-gray-500'}`}
          >
            <CheckSquare size={14} />
            Select
          </button>

          <button 
            onClick={() => setShowPrompt(!showPrompt)}
            className="flex items-center gap-2 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 px-3 py-1.5 rounded-full transition-colors text-sm font-medium"
          >
            <Wand2 size={14} />
            AI Assist
          </button>
          
          <div className="relative" ref={menuRef}>
            <div className="flex items-center bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all">
               <button 
                 onClick={() => onStartStudy({ mode: 'spaced' })}
                 className="px-3 py-1.5 flex items-center gap-2 text-gray-700 dark:text-slate-200 text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 rounded-l-lg border-r border-gray-200 dark:border-slate-700"
               >
                  <Layers size={16} className="text-blue-600" />
                  <span>{flashcardCount} / {flashcardCount}</span>
               </button>
               <button 
                  onClick={() => setShowStudyMenu(!showStudyMenu)}
                  className="px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-r-lg text-gray-500 dark:text-slate-400"
               >
                  <ChevronDown size={16} />
               </button>
            </div>

            {showStudyMenu && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700 z-50 p-2 animate-in fade-in zoom-in-95 duration-100 transform origin-top-right">
                  <button 
                      onClick={() => { onStartStudy({ mode: 'spaced' }); setShowStudyMenu(false); }}
                      className="w-full bg-gray-900 dark:bg-blue-600 hover:bg-black dark:hover:bg-blue-700 text-white rounded-lg py-2.5 px-3 flex items-center gap-2 mb-2 font-semibold text-sm transition-colors shadow-sm"
                  >
                      <Layers size={18} />
                      Practice with Spaced Repetition
                  </button>
                  
                  <div className="space-y-0.5">
                      <button 
                          onClick={() => { onStartStudy({ mode: 'all' }); setShowStudyMenu(false); }}
                          className="w-full flex items-center justify-between px-3 py-2 text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm transition-colors"
                      >
                          <div className="flex items-center gap-3">
                              <Copy size={16} className="text-gray-400" />
                              <span>Practice All Flashcards</span>
                          </div>
                      </button>

                      <button 
                           onClick={() => { onStartStudy({ mode: 'order' }); setShowStudyMenu(false); }}
                           className="w-full flex items-center justify-between px-3 py-2 text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm transition-colors"
                      >
                          <div className="flex items-center gap-3">
                              <ArrowDownUp size={16} className="text-gray-400" />
                              <span>Practice in Order</span>
                          </div>
                      </button>

                      <button 
                           onClick={() => { onStartStudy({ mode: 'flashcards' }); setShowStudyMenu(false); }}
                           className="w-full flex items-center justify-between px-3 py-2 text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm transition-colors"
                      >
                          <div className="flex items-center gap-3">
                              <GalleryHorizontalEnd size={16} className="text-gray-400" />
                              <span>Flashcards (Quizlet Style)</span>
                          </div>
                      </button>

                      <div className="h-px bg-gray-100 dark:bg-slate-700 my-1"></div>

                      {/* New Option: View Card Table */}
                      <button 
                           onClick={() => { setShowCardTable(true); setShowStudyMenu(false); }}
                           className="w-full flex items-center justify-between px-3 py-2 text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm transition-colors"
                      >
                          <div className="flex items-center gap-3">
                              <Table size={16} className="text-gray-400" />
                              <span>View Card Table</span>
                          </div>
                      </button>
                  </div>
              </div>
            )}
          </div>
        </div>

        {showPrompt && (
          <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-900/50 animate-in fade-in slide-in-from-top-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Topic to generate notes/cards for..."
                className="flex-1 px-3 py-2 rounded-md border border-purple-200 dark:border-purple-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-300 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              />
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt}
                className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
              >
                {isGenerating ? '...' : 'Generate'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 px-8 pb-20 max-w-4xl mx-auto w-full" onClick={() => {
          if (blocks.length > 0) focusBlock(blocks.length - 1);
      }}>
        {blocks.map((block, index) => (
            <BlockRow 
                key={block.id}
                block={block}
                index={index}
                isSelected={selectedBlockIds.has(block.id)}
                selectionMode={selectionMode}
                onChange={handleBlockChange}
                onKeyDown={handleKeyDown}
                onSelect={toggleSelection}
                onFocusRef={setRef}
                onMouseUp={handleTextSelection}
            />
        ))}
        
        <div className="h-16 cursor-text" onClick={(e) => {
             e.stopPropagation();
             if (blocks.length === 0) {
                onChangeBlocks([{ id: generateId(), content: '', level: 0}]);
             } else {
                const lastBlock = blocks[blocks.length -1];
                if(lastBlock.content !== "") {
                     const newBlocks = [...blocks, { id: generateId(), content: '', level: 0 }];
                     onChangeBlocks(newBlocks);
                     setTimeout(() => focusBlock(newBlocks.length - 1), 10);
                }
             }
        }}></div>

        {/* --- Linked References (Backlinks) --- */}
        {backlinks.length > 0 && (
            <div className="mt-12 border-t border-gray-200 dark:border-slate-800 pt-6">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <ArrowRightCircle size={14}/> Linked References
                </h3>
                <div className="space-y-2">
                    {backlinks.map((link, i) => (
                        <div 
                            key={i} 
                            className="group p-3 rounded-lg border border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 hover:border-blue-200 dark:hover:border-blue-800 cursor-pointer transition-all"
                            onClick={() => onNavigateToDoc?.(link.sourceDocId)}
                        >
                            <div className="flex items-center gap-2 mb-1 text-xs font-bold text-blue-600 dark:text-blue-400">
                                <LinkIcon size={12} />
                                {link.sourceDocTitle || "Untitled"}
                            </div>
                            <div className="text-sm text-gray-700 dark:text-slate-300 line-clamp-2">
                                {link.content}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

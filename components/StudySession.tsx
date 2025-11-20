
import React, { useState, useEffect, useRef } from 'react';
import { Flashcard, StudyRating, OrderRating, AppSettings, Document } from '../types';
import { CheckCircle, XCircle, BrainCircuit, Eye, ChevronRight, MoreHorizontal, ArrowLeft, Ban, Keyboard, Volume2, FileText, ArrowRight, Maximize, Minimize, Pencil, Save, X, Settings2, PlayCircle, MousePointer2, Layers, HelpCircle, Globe, RotateCw, Shuffle, Search, Play, Pause, RotateCcw, Check } from 'lucide-react';
import { explainConcept } from '../services/geminiService';

interface StudySessionProps {
  cards: Flashcard[];
  documents: Document[];
  onClose: () => void;
  settings: AppSettings;
  mode: 'spaced' | 'all' | 'order' | 'flashcards';
  onUpdateCardProgress: (card: Flashcard, rating: StudyRating | OrderRating) => void;
  onNavigateToDoc: (docId: string) => void;
  onEditCard: (card: Flashcard, newFront: string, newBack: string) => void;
  onUpdateSettings?: (settings: AppSettings) => void;
}

// --- Rich Text Renderer ---
const RichText: React.FC<{ text: string, isCloze: boolean, isRevealed: boolean }> = ({ text, isCloze, isRevealed }) => {
    const processFormatting = (content: string): React.ReactNode[] => {
        let html = content;

        // Safe Encode
        html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

        // Restore HTML-like tags we support (un-escape them)
        html = html.replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/g, "<u>$1</u>");
        html = html.replace(/&lt;span style="color:(.*?)"&gt;(.*?)&lt;\/span&gt;/g, "<span style='color:$1'>$2</span>");

        // Markdown to HTML
        html = html.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");
        html = html.replace(/\*(.*?)\*/g, "<i>$1</i>");
        html = html.replace(/\^\^(.*?)\^\^/g, "<mark>$1</mark>");
        html = html.replace(/\[\[(.*?)\]\]/g, "<span class='text-blue-500 underline cursor-pointer'>$1</span>");

        // Cloze Logic
        if (isCloze) {
            html = html.replace(/\{(.*?)\}/g, (match, p1) => {
                 if (isRevealed) {
                     return `<span class='font-bold text-blue-600 border-b-2 border-blue-400 px-1 bg-blue-50 rounded'>${p1}</span>`;
                 } else {
                     return `<span class='font-bold text-blue-600 bg-blue-100 px-2 rounded select-none'>[...]</span>`;
                 }
            });
        } else {
            html = html.replace(/\{(.*?)\}/g, "<span class='text-blue-600 font-medium'>$1</span>");
        }

        return <span dangerouslySetInnerHTML={{ __html: html }} />;
    };

    return <div className="inline">{processFormatting(text)}</div>;
};


export const StudySession: React.FC<StudySessionProps> = ({ cards, documents, onClose, settings, mode, onUpdateCardProgress, onNavigateToDoc, onEditCard, onUpdateSettings }) => {
  // We keep the original full set of cards to allow filtering/unfiltering
  const [originalQueue] = useState<Flashcard[]>(cards);
  const [queue, setQueue] = useState<Flashcard[]>(cards);
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isAIHintLoading, setIsAIHintLoading] = useState(false);
  const [aiHint, setAiHint] = useState<string | null>(null);
  
  // Interaction Modes
  const [showMenu, setShowMenu] = useState(false);
  const [showTTSModal, setShowTTSModal] = useState(false);
  const [typeAnswerMode, setTypeAnswerMode] = useState(false);
  const [userAnswer, setUserAnswer] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false); // For Quizlet mode visual flip
  
  // Filtering State (Flashcard Mode)
  const [filterTerm, setFilterTerm] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  // Flashcard Auto-Play & Swipe Logic
  const [isPlaying, setIsPlaying] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [missedCards, setMissedCards] = useState<string[]>([]); // Store IDs of "Bad" cards
  const autoPlayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // TTS State
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Editing State
  const [isEditing, setIsEditing] = useState(false);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  
  const currentCard = queue[currentIndex];
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const currentIndexRef = useRef(currentIndex);

  useEffect(() => {
      currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Load Voices
  useEffect(() => {
    const updateVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      // Filter duplicates if any and sort
      const uniqueVoices = Array.from(new Set(voices.map(v => v.name)))
        .map(name => voices.find(v => v.name === name))
        .filter((v): v is SpeechSynthesisVoice => !!v)
        .sort((a, b) => a.name.localeCompare(b.name));
        
      setAvailableVoices(uniqueVoices);
    };
    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // --- Filtering Logic ---
  useEffect(() => {
    if (mode === 'flashcards') {
        if (!filterTerm.trim()) {
            setQueue(originalQueue);
        } else {
            const term = filterTerm.toLowerCase();
            const filtered = originalQueue.filter(card => 
                card.front.toLowerCase().includes(term) || 
                card.back.toLowerCase().includes(term)
            );
            setQueue(filtered);
            setCurrentIndex(0);
        }
    }
  }, [filterTerm, originalQueue, mode]);

  // Focus Search input when opened
  useEffect(() => {
      if (showSearch && searchInputRef.current) {
          searchInputRef.current.focus();
      }
  }, [showSearch]);

  // --- Auto Play Logic (Flashcard Mode) ---
  useEffect(() => {
    // Clear any existing timer when state changes
    if (autoPlayRef.current) {
        clearTimeout(autoPlayRef.current);
    }

    if (isPlaying && mode === 'flashcards' && currentCard) {
        // If we are front facing
        if (!isFlipped) {
            autoPlayRef.current = setTimeout(() => {
                handleFlip();
            }, 2000); // Wait 2 seconds on front
        } 
        // If we are back facing (revealed)
        else {
            autoPlayRef.current = setTimeout(() => {
               handleCardAction('right'); // Automatically mark as good
            }, 3000); // Wait 3 seconds on back
        }
    }

    return () => {
        if (autoPlayRef.current) clearTimeout(autoPlayRef.current);
    };
  }, [isPlaying, isFlipped, currentCard, mode]);


  // --- Helper: Detect Language for Auto Mode ---
  const detectLanguage = (text: string): string => {
      // Heuristics for Auto Detection
      const lower = text.toLowerCase();
      if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uF900-\uFAFF]/.test(text)) return 'ja-JP'; // Japanese / Chinese
      if (/[\u0400-\u04FF]/.test(text)) return 'ru-RU'; // Cyrillic
      if (/[áéíóúñü]/.test(lower)) return 'es-ES'; // Spanish (basic)
      if (/[àâçéèêëîïôûùü]/.test(lower)) return 'fr-FR'; // French (basic)
      if (/[äöüß]/.test(lower)) return 'de-DE'; // German
      if (/[àèìòù]/.test(lower)) return 'it-IT'; // Italian
      if (/[ãõçêô]/.test(lower)) return 'pt-BR'; // Portuguese
      return 'en-US'; // Default
  };

  // --- Helper: Speak Text ---
  const speakText = (text: string, isBack: boolean) => {
      if (!settings.tts.enabled) return;

      window.speechSynthesis.cancel(); 

      // 1. Prepare Text (Remove markdown, handle Cloze)
      let cleanText = text.replace(/[*_^]/g, '').replace(/\[\[(.*?)\]\]/g, '$1');
      
      // Crucial: If it's a cloze card and we are on the FRONT (not revealed), mask the answer
      if (!isBack && currentCard.cardType === 'cloze') {
          cleanText = cleanText.replace(/\{.*?\}/g, ' ... blank ... '); 
      } else if (isBack && currentCard.cardType === 'cloze') {
           cleanText = cleanText.replace(/\{(.*?)\}/g, '$1');
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);
      
      // 2. Determine Language/Voice
      const langSetting = isBack ? settings.tts.backLang : settings.tts.frontLang;
      
      if (langSetting && langSetting !== 'auto') {
          // User selected a specific voice
          const voice = availableVoices.find(v => v.voiceURI === langSetting);
          if (voice) {
              utterance.voice = voice;
              utterance.lang = voice.lang;
          }
      } else {
          // Auto-Detect
          const detectedLang = detectLanguage(cleanText);
          const matchingVoice = availableVoices.find(v => v.lang.startsWith(detectedLang.split('-')[0]));
          if (matchingVoice) {
              utterance.voice = matchingVoice;
          }
          utterance.lang = detectedLang;
      }

      utterance.rate = 1.0; 
      window.speechSynthesis.speak(utterance);
  };

  // Auto-Play Front
  useEffect(() => {
    if (currentCard && settings.tts.enabled && settings.tts.autoplay) {
        setTimeout(() => speakText(currentCard.front, false), 400);
    }
  }, [currentIndex, currentCard, settings.tts.enabled]); 

  // Auto-Play Back (on Reveal)
  useEffect(() => {
    if (isRevealed && currentCard && settings.tts.enabled && settings.tts.autoplay) {
        setTimeout(() => {
             const textToRead = currentCard.cardType === 'cloze' ? currentCard.front : currentCard.back;
             speakText(textToRead, true);
        }, 200);
    }
  }, [isRevealed]);


  useEffect(() => {
    setIsRevealed(false);
    setIsFlipped(false); 
    setAiHint(null);
    setUserAnswer("");
    setShowMenu(false);
    setIsEditing(false);
    setSwipeDirection(null);
    
    if (typeAnswerMode && !isRevealed) {
        setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [currentIndex, queue, typeAnswerMode]);

  useEffect(() => {
      if (currentCard) {
          setEditFront(currentCard.front);
          setEditBack(currentCard.back);
      }
  }, [currentCard]);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
              setShowMenu(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Shortcuts
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (isEditing) return; 
          // If searching, don't trigger navigation
          if (document.activeElement === searchInputRef.current) return;

          if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
              if (e.key === 'Enter' && !isRevealed && mode !== 'flashcards') {
                  setIsRevealed(true);
              }
              return;
          }

          if (e.key === 'Escape') onClose();
          
          if (mode === 'flashcards') {
              if (e.key === 'ArrowLeft') { 
                  if (swipeDirection) return; 
                  handleCardAction('left'); 
                  return; 
              }
              if (e.key === 'ArrowRight') { 
                  if (swipeDirection) return; 
                  handleCardAction('right'); 
                  return; 
              }
              if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  // Pause auto play if manually flipping
                  if(isPlaying) setIsPlaying(false);
                  handleFlip();
                  return;
              }
          }

          if (e.key === 'ArrowLeft') handlePrevCard();
          if (e.key === 'b' || e.key === 'B') handleDisableCard();
          if (e.key === 'g' || e.key === 'G') handleGoToRem();
          
          if ((e.key === ' ' || e.key === 'Enter') && !isRevealed && !typeAnswerMode && mode !== 'flashcards') {
              e.preventDefault();
              setIsRevealed(true);
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, isRevealed, typeAnswerMode, isEditing, mode, isPlaying, swipeDirection]);
  
  const handlePrevCard = () => {
      if (currentIndex > 0) {
          setCurrentIndex(currentIndex - 1);
          if (mode !== 'flashcards') setIsRevealed(true);
      }
  };
  
  const handleNextCard = () => {
      if (currentIndex < queue.length - 1) {
          setCurrentIndex(currentIndex + 1);
      } else {
           // If manual next in other modes, maybe stop?
           if (mode !== 'flashcards') setCurrentIndex(currentIndex + 1);
           else {
             // In flashcard mode, end of deck triggers the end screen naturally via render check
             setCurrentIndex(currentIndex + 1);
           }
      }
  };

  // New Handler for Swipe/Sort in Flashcard Mode
  const handleCardAction = (direction: 'left' | 'right') => {
      if (!currentCard) return;

      setSwipeDirection(direction);

      // If left (Bad), add to missed queue
      if (direction === 'left') {
          setMissedCards(prev => [...prev, currentCard.id]);
      }

      // Wait for animation then move next
      setTimeout(() => {
          handleNextCard();
      }, 300); // Match CSS duration
  };

  const handleRestartMissed = () => {
      const missed = originalQueue.filter(c => missedCards.includes(c.id));
      setQueue(missed);
      setMissedCards([]);
      setCurrentIndex(0);
      setIsRevealed(false);
      setIsFlipped(false);
  };

  const handleRestartAll = () => {
      setQueue(originalQueue);
      setMissedCards([]);
      setCurrentIndex(0);
      setIsRevealed(false);
      setIsFlipped(false);
  };

  const handleDisableCard = () => {
      alert("Card disabled for this session.");
      if (currentIndex < queue.length - 1) {
          setCurrentIndex(currentIndex + 1);
      }
  };

  const handleGoToRem = () => {
      if (currentCard) {
          onNavigateToDoc(currentCard.docId);
      }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(e => console.log(e));
        setIsFullscreen(true);
    } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
          setIsFullscreen(false);
        }
    }
  };
  
  const handleRate = (rating: StudyRating | OrderRating) => {
    if (!currentCard) return;

    onUpdateCardProgress(currentCard, rating);

    if (rating === StudyRating.AGAIN || rating === OrderRating.TWO_SEC) {
        const cardToRequeue = { ...currentCard };
        setCurrentIndex(prev => prev + 1);
        setTimeout(() => {
            setQueue(currentQueue => {
                const currentPos = currentIndexRef.current;
                if (currentPos > currentQueue.length) return [...currentQueue, cardToRequeue];
                const newQueue = [...currentQueue];
                const insertIndex = currentPos < currentQueue.length ? currentPos + 1 : currentPos;
                newQueue.splice(insertIndex, 0, cardToRequeue);
                return newQueue;
            });
        }, settings.failDelay);

    } else {
        setCurrentIndex(prev => prev + 1);
    }
  };

  const handleAIHint = async () => {
      if(!currentCard) return;
      setIsAIHintLoading(true);
      try {
          const explanation = await explainConcept(currentCard.front);
          setAiHint(explanation);
      } catch(e) {
          setAiHint("Could not generate hint.");
      } finally {
          setIsAIHintLoading(false);
      }
  };

  const handleReveal = () => {
      setIsRevealed(true);
  };

  const handleFlip = () => {
      setIsRevealed(!isRevealed);
      setIsFlipped(!isFlipped);
  };

  const handleShuffle = () => {
      if (mode === 'flashcards') {
          const shuffled = [...queue];
          // Fisher-Yates
          for (let i = shuffled.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          setQueue(shuffled);
          setCurrentIndex(0);
      }
  };

  const handleSaveEdit = () => {
      if (!currentCard) return;
      onEditCard(currentCard, editFront, editBack);
      
      const newQueue = [...queue];
      newQueue[currentIndex] = { ...currentCard, front: editFront, back: editBack };
      setQueue(newQueue);
      
      setIsEditing(false);
  };

  const handleTTSChange = (key: keyof AppSettings['tts'], value: any) => {
      if (onUpdateSettings) {
          onUpdateSettings({
              ...settings,
              tts: {
                  ...settings.tts,
                  [key]: value
              }
          });
      }
  };

  const getContextPath = (): string[] => {
      if (!settings.showContext || !currentCard) return [];
      const doc = documents.find(d => d.id === currentCard.docId);
      if (!doc) return [];
      const blockIndex = doc.blocks.findIndex(b => b.id === currentCard.blockId);
      if (blockIndex === -1) return [doc.title || "Untitled"];
      const currentBlock = doc.blocks[blockIndex];
      let currentLevel = currentBlock.level;
      const parents: string[] = [];
      for (let i = blockIndex - 1; i >= 0; i--) {
          if (doc.blocks[i].level < currentLevel) {
              parents.unshift(doc.blocks[i].content.trim());
              currentLevel = doc.blocks[i].level;
              if (currentLevel === 0) break;
          }
      }
      return [doc.title || "Untitled", ...parents];
  };

  const contextPath = getContextPath();
  const arrowSymbol = currentCard?.cardType === 'bidirectional' ? '↔' : '⇒';
  const isCloze = currentCard?.cardType === 'cloze';

  // Check for empty queue after filtering
  if (queue.length === 0 && mode === 'flashcards' && filterTerm) {
      return (
          <div className="fixed inset-0 z-50 flex flex-col bg-gray-100 dark:bg-slate-950">
             {/* Header for Empty Search State */}
             <div className="h-16 px-6 flex items-center justify-between bg-white dark:bg-slate-900 shadow-sm z-20">
                 <div className="flex items-center gap-4">
                     <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full text-gray-600 dark:text-slate-300">
                         <ArrowLeft size={20}/>
                     </button>
                     <div className="relative">
                         <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"/>
                         <input 
                            ref={searchInputRef}
                            type="text"
                            value={filterTerm}
                            onChange={(e) => setFilterTerm(e.target.value)}
                            placeholder="Filter cards..."
                            className="pl-9 pr-4 py-1.5 bg-gray-100 dark:bg-slate-800 rounded-full text-sm w-64 outline-none focus:ring-2 focus:ring-blue-500 border border-transparent focus:border-blue-500 transition-all"
                            autoFocus
                         />
                         <button onClick={() => setFilterTerm("")} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">
                             <XCircle size={14} fill="currentColor" className="text-gray-300"/>
                         </button>
                     </div>
                 </div>
                 <button onClick={onClose}><X size={24} className="text-gray-500"/></button>
             </div>
             <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                 <Search size={48} className="mb-4 opacity-20"/>
                 <p>No cards found matching "{filterTerm}"</p>
                 <button onClick={() => setFilterTerm("")} className="mt-4 text-blue-500 hover:underline text-sm">Clear Filter</button>
             </div>
          </div>
      )
  }

  if (!currentCard || currentIndex >= queue.length) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl max-w-md w-full border border-gray-100 dark:border-slate-800 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="w-16 h-16 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle size={32} />
            </div>
            <h2 className="text-xl font-bold text-center text-gray-800 dark:text-white mb-2">Session Complete!</h2>
            <p className="text-gray-500 dark:text-slate-400 mb-8 text-sm text-center">
                {mode === 'flashcards' ? `You've reviewed ${queue.length} cards.` : "No more cards are due right now."}
            </p>
            
            {/* End Screen for Flashcards Mode with Missed Cards Logic */}
            {mode === 'flashcards' && missedCards.length > 0 && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-800">
                    <div className="text-center text-red-600 dark:text-red-400 font-bold mb-2">
                        {missedCards.length} cards marked as "Hard"
                    </div>
                    <button 
                        onClick={handleRestartMissed}
                        className="w-full bg-red-600 text-white py-2 rounded-lg font-medium hover:bg-red-700 transition-colors text-sm mb-2"
                    >
                        Study Only Missed Cards
                    </button>
                </div>
            )}

            <div className="flex flex-col gap-2">
                {mode === 'flashcards' ? (
                    <button 
                        onClick={handleRestartAll}
                        className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors text-sm"
                    >
                        Restart All Cards
                    </button>
                ) : (
                    <button 
                        onClick={() => { setCurrentIndex(0); }}
                        className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors text-sm"
                    >
                        Restart Session
                    </button>
                )}
                
                <button 
                    onClick={onClose}
                    className="w-full bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 py-2.5 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors text-sm"
                >
                    Back to Workspace
                </button>
            </div>
        </div>
      </div>
    );
  }

  // --- FLASHCARDS MODE RENDER ---
  if (mode === 'flashcards') {
      return (
        <div className="fixed inset-0 z-50 flex flex-col bg-gray-100 dark:bg-slate-950">
             
             {/* TTS Settings Modal */}
             {showTTSModal && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowTTSModal(false)}>
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-gray-200 dark:border-slate-700" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between bg-gray-50 dark:bg-slate-800/50">
                            <div className="flex items-center gap-2 text-gray-800 dark:text-white font-bold text-base">
                                <Settings2 size={18} className="text-blue-600 dark:text-blue-400"/>
                                TTS Configuration
                            </div>
                            <button onClick={() => setShowTTSModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300">
                                <X size={20}/>
                            </button>
                        </div>
                        <div className="p-5 space-y-5">
                            <div className="flex items-center justify-between">
                                <div className="font-medium text-sm text-gray-700 dark:text-slate-200 flex items-center gap-2"><Volume2 size={16}/> Enable Audio</div>
                                <button onClick={() => handleTTSChange('enabled', !settings.tts.enabled)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.tts.enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-slate-600'}`}>
                                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${settings.tts.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                                </button>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="font-medium text-sm text-gray-700 dark:text-slate-200 flex items-center gap-2"><PlayCircle size={16}/> Autoplay</div>
                                <button onClick={() => handleTTSChange('autoplay', !settings.tts.autoplay)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.tts.autoplay ? 'bg-blue-600' : 'bg-gray-200 dark:bg-slate-600'}`}>
                                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${settings.tts.autoplay ? 'translate-x-5' : 'translate-x-1'}`} />
                                </button>
                            </div>
                            
                             {/* Voice Selectors */}
                            <div className="h-px bg-gray-100 dark:bg-slate-700"></div>
                            <div>
                                <label className="flex items-center gap-2 text-xs font-bold uppercase text-gray-400 mb-2"><Globe size={12}/> Front Card Voice</label>
                                <select 
                                    value={settings.tts.frontLang}
                                    onChange={(e) => handleTTSChange('frontLang', e.target.value)}
                                    className="w-full p-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-gray-700 dark:text-slate-200 outline-none"
                                >
                                    <option value="auto">✨ Auto-Detect</option>
                                    {availableVoices.map(v => (<option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>))}
                                </select>
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-xs font-bold uppercase text-gray-400 mb-2"><Globe size={12}/> Back Card Voice</label>
                                <select 
                                    value={settings.tts.backLang}
                                    onChange={(e) => handleTTSChange('backLang', e.target.value)}
                                    className="w-full p-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-gray-700 dark:text-slate-200 outline-none"
                                >
                                    <option value="auto">✨ Auto-Detect</option>
                                    {availableVoices.map(v => (<option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>))}
                                </select>
                            </div>
                        </div>
                        <div className="p-3 bg-gray-50 dark:bg-slate-800/50 text-center">
                            <button onClick={() => setShowTTSModal(false)} className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">Close Settings</button>
                        </div>
                    </div>
                </div>
             )}

             {/* Header */}
             <div className="h-16 px-6 flex items-center justify-between bg-white dark:bg-slate-900 shadow-sm z-20">
                 <div className="flex items-center gap-4 flex-1">
                     <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full text-gray-600 dark:text-slate-300">
                         <ArrowLeft size={20}/>
                     </button>
                     <div className="flex flex-col mr-4 hidden sm:flex">
                        <span className="font-bold text-gray-800 dark:text-white">Flashcards</span>
                        <span className="text-xs text-gray-500">{currentIndex + 1} / {queue.length}</span>
                     </div>

                     {/* Live Search Bar */}
                     <div className={`relative transition-all duration-300 ${showSearch || filterTerm ? 'w-64' : 'w-10'}`}>
                         {(!showSearch && !filterTerm) ? (
                             <button 
                                onClick={() => setShowSearch(true)}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full text-gray-500"
                                title="Filter Cards"
                             >
                                 <Search size={20}/>
                             </button>
                         ) : (
                            <div className="relative w-full animate-in fade-in zoom-in-95">
                                <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"/>
                                <input 
                                    ref={searchInputRef}
                                    type="text"
                                    value={filterTerm}
                                    onChange={(e) => setFilterTerm(e.target.value)}
                                    placeholder="Filter current deck..."
                                    className="w-full pl-9 pr-8 py-1.5 bg-gray-100 dark:bg-slate-800 rounded-full text-sm outline-none focus:ring-2 focus:ring-blue-500 border border-transparent focus:border-blue-500 transition-all"
                                    onBlur={() => { if(!filterTerm) setShowSearch(false); }}
                                />
                                {filterTerm && (
                                    <button onClick={() => setFilterTerm("")} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                        <XCircle size={14} fill="currentColor" className="text-gray-300"/>
                                    </button>
                                )}
                            </div>
                         )}
                     </div>
                 </div>
                 
                 <div className="flex items-center gap-2">
                     <button 
                        onClick={handleShuffle}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded text-gray-500 dark:text-slate-400" 
                        title="Shuffle"
                     >
                         <Shuffle size={20}/>
                     </button>

                     {/* Menu for Settings/TTS/TypeAnswer */}
                     <div className="relative" ref={menuRef}>
                         <button 
                             onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                             className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded text-gray-500 dark:text-slate-400"
                         >
                             <MoreHorizontal size={20}/>
                         </button>
                         {showMenu && (
                             <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 py-2 z-50 text-left" onClick={(e) => e.stopPropagation()}>
                                 {/* Type Answer Toggle */}
                                 <div 
                                    onClick={() => { setTypeAnswerMode(!typeAnswerMode); }}
                                    className="px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer flex items-center justify-between text-sm text-gray-700 dark:text-slate-200"
                                 >
                                     <div className="flex items-center gap-2"><Keyboard size={16}/> Type Answer</div>
                                     <div className={`w-8 h-4 rounded-full relative transition-colors ${typeAnswerMode ? 'bg-blue-500' : 'bg-gray-200 dark:bg-slate-600'}`}>
                                         <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${typeAnswerMode ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                     </div>
                                 </div>
                                 {/* TTS Options */}
                                 <button 
                                    onClick={() => { setShowTTSModal(true); setShowMenu(false); }}
                                    className="w-full px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center justify-between text-sm text-gray-700 dark:text-slate-200"
                                 >
                                     <div className="flex items-center gap-2"><Volume2 size={16}/> Audio Options</div>
                                     <Settings2 size={14} className="text-gray-400"/>
                                 </button>
                             </div>
                         )}
                     </div>

                     <button 
                        onClick={toggleFullscreen}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded text-gray-500 dark:text-slate-400"
                     >
                         {isFullscreen ? <Minimize size={20}/> : <Maximize size={20}/>}
                     </button>
                     <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded text-gray-500 dark:text-slate-400">
                         <X size={24}/>
                     </button>
                 </div>
             </div>

             {/* Card Area */}
             <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 overflow-hidden">
                 
                 {/* The Card Container - 3D Flip Effect & Swipe Animation */}
                 <div 
                    className="relative w-full max-w-3xl aspect-[5/3] cursor-pointer perspective-1000" 
                    onClick={handleFlip}
                 >
                     <div 
                        className={`w-full h-full transition-all duration-300 transform-style-3d relative ${isFlipped ? 'rotate-y-180' : ''}`}
                        style={{
                            transform: swipeDirection === 'right' 
                                ? `translateX(100%) rotate(10deg) ${isFlipped ? 'rotateY(180deg)' : ''}`
                                : swipeDirection === 'left'
                                ? `translateX(-100%) rotate(-10deg) ${isFlipped ? 'rotateY(180deg)' : ''}`
                                : undefined,
                            opacity: swipeDirection ? 0 : 1
                        }}
                     >
                         
                         {/* Front Face */}
                         <div className="absolute inset-0 backface-hidden bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-gray-200 dark:border-slate-800 flex flex-col items-center justify-center p-8 text-center">
                             <div className="w-full text-3xl font-medium text-gray-800 dark:text-white select-none flex flex-col items-center justify-center gap-4">
                                 <div className="flex items-center justify-center gap-3 w-full">
                                     <RichText text={currentCard.front} isCloze={isCloze} isRevealed={false} />
                                     <button 
                                        onClick={(e) => { e.stopPropagation(); speakText(currentCard.front, false); }}
                                        className="p-2 text-gray-400 hover:text-blue-500 transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 shrink-0"
                                        title="Read Aloud"
                                     >
                                         <Volume2 size={20} />
                                     </button>
                                 </div>

                                 {typeAnswerMode && (
                                     <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md mt-8">
                                         <input 
                                            ref={inputRef}
                                            type="text"
                                            value={userAnswer}
                                            onChange={(e) => setUserAnswer(e.target.value)}
                                            placeholder="Type your answer..."
                                            className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-950 text-lg text-center outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 placeholder-gray-400"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleFlip();
                                            }}
                                         />
                                     </div>
                                 )}
                             </div>
                             <div className="absolute bottom-4 text-xs text-gray-400 uppercase tracking-widest">Click to Flip</div>
                         </div>

                         {/* Back Face */}
                         <div className="absolute inset-0 backface-hidden rotate-y-180 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-gray-200 dark:border-slate-800 flex flex-col items-center justify-center p-8 text-center">
                             <div className="w-full text-3xl font-medium text-gray-800 dark:text-white select-none flex flex-col items-center justify-center gap-4">
                                 <div className="flex items-center justify-center gap-3 w-full">
                                     <RichText text={isCloze ? currentCard.front : currentCard.back} isCloze={isCloze} isRevealed={true} />
                                     <button 
                                        onClick={(e) => { e.stopPropagation(); speakText(isCloze ? currentCard.front : currentCard.back, true); }}
                                        className="p-2 text-gray-400 hover:text-blue-500 transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 shrink-0"
                                        title="Read Aloud"
                                     >
                                         <Volume2 size={20} />
                                     </button>
                                 </div>
                                 
                                 {typeAnswerMode && (
                                     <div className="mt-6 flex flex-col items-center w-full">
                                         <div className="text-xs uppercase tracking-widest text-gray-400 mb-2 font-bold">Your Answer</div>
                                         <div className={`text-xl font-medium px-4 py-2 rounded-lg bg-gray-50 dark:bg-slate-800/50 border ${userAnswer.trim().toLowerCase() === currentCard.back.trim().toLowerCase() ? 'text-green-600 border-green-200 dark:text-green-400' : 'text-red-500 border-red-200 dark:text-red-400'}`}>
                                             {userAnswer || "(Empty)"}
                                         </div>
                                     </div>
                                 )}
                             </div>
                             <div className="absolute bottom-4 text-xs text-gray-400 uppercase tracking-widest">Front</div>
                         </div>

                     </div>
                 </div>

                 {/* Controls: Play, X, Check */}
                 <div className="mt-8 flex items-center gap-12">
                     
                     {/* Bad (Left) Button */}
                     <button 
                        onClick={(e) => { e.stopPropagation(); handleCardAction('left'); }}
                        className="w-16 h-16 rounded-full bg-white dark:bg-slate-800 shadow-lg border-2 border-transparent hover:border-red-500 flex items-center justify-center text-gray-400 hover:text-red-500 transition-all transform hover:scale-110"
                        title="Mark as Hard (Study Later)"
                     >
                         <X size={32} strokeWidth={3}/>
                     </button>

                     {/* Auto Play Toggle */}
                     <button 
                        onClick={(e) => { e.stopPropagation(); setIsPlaying(!isPlaying); }}
                        className={`w-14 h-14 rounded-full shadow-md flex items-center justify-center transition-all ${isPlaying ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-50'}`}
                        title={isPlaying ? "Pause Auto-Play" : "Start Auto-Play"}
                     >
                         {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1"/>}
                     </button>

                     {/* Good (Right) Button */}
                     <button 
                        onClick={(e) => { e.stopPropagation(); handleCardAction('right'); }}
                        className="w-16 h-16 rounded-full bg-white dark:bg-slate-800 shadow-lg border-2 border-transparent hover:border-green-500 flex items-center justify-center text-gray-400 hover:text-green-500 transition-all transform hover:scale-110"
                        title="Mark as Good"
                     >
                         <Check size={32} strokeWidth={3}/>
                     </button>
                 </div>
                 
                 <div className="mt-6 text-xs text-gray-400">
                    {isPlaying ? "Auto-playing..." : "Use ← arrows → or buttons"}
                 </div>

             </div>
             
             {/* CSS for 3D Flip */}
             <style>{`
                .perspective-1000 { perspective: 1000px; }
                .transform-style-3d { transform-style: preserve-3d; }
                .backface-hidden { backface-visibility: hidden; }
                .rotate-y-180 { transform: rotateY(180deg); }
             `}</style>
        </div>
      );
  }

  // --- STANDARD SRS/LEARNING MODE RENDER ---
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-8">
      
      {/* TTS Settings Modal - TRIGGERED FROM MENU */}
      {showTTSModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowTTSModal(false)}>
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-gray-200 dark:border-slate-700" onClick={e => e.stopPropagation()}>
                  <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between bg-gray-50 dark:bg-slate-800/50">
                      <div className="flex items-center gap-2 text-gray-800 dark:text-white font-bold text-base">
                          <Settings2 size={18} className="text-blue-600 dark:text-blue-400"/>
                          TTS Configuration
                      </div>
                      <button onClick={() => setShowTTSModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300">
                          <X size={20}/>
                      </button>
                  </div>
                  
                  <div className="p-5 space-y-5">
                      {/* Enable Toggle */}
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-sm text-gray-700 dark:text-slate-200 flex items-center gap-2">
                            <Volume2 size={16}/> Enable Audio
                        </div>
                        <button
                            onClick={() => handleTTSChange('enabled', !settings.tts.enabled)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            settings.tts.enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-slate-600'
                            }`}
                        >
                            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${settings.tts.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                      </div>

                      {/* Autoplay Toggle */}
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-sm text-gray-700 dark:text-slate-200 flex items-center gap-2">
                            <PlayCircle size={16}/> Autoplay
                        </div>
                        <button
                            onClick={() => handleTTSChange('autoplay', !settings.tts.autoplay)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            settings.tts.autoplay ? 'bg-blue-600' : 'bg-gray-200 dark:bg-slate-600'
                            }`}
                        >
                            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${settings.tts.autoplay ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                      </div>

                      <div className="h-px bg-gray-100 dark:bg-slate-700"></div>

                      {/* Front Voice Selection */}
                      <div>
                          <label className="flex items-center gap-2 text-xs font-bold uppercase text-gray-400 mb-2">
                             <Globe size={12}/> Front Card Voice
                          </label>
                          <select 
                              value={settings.tts.frontLang}
                              onChange={(e) => handleTTSChange('frontLang', e.target.value)}
                              className="w-full p-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-gray-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                          >
                              <option value="auto">✨ Auto-Detect Language</option>
                              {availableVoices.map(v => (
                                  <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
                              ))}
                          </select>
                      </div>

                      {/* Back Voice Selection */}
                      <div>
                          <label className="flex items-center gap-2 text-xs font-bold uppercase text-gray-400 mb-2">
                             <Globe size={12}/> Back Card Voice
                          </label>
                          <select 
                              value={settings.tts.backLang}
                              onChange={(e) => handleTTSChange('backLang', e.target.value)}
                              className="w-full p-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-gray-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                          >
                              <option value="auto">✨ Auto-Detect Language</option>
                              {availableVoices.map(v => (
                                  <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
                              ))}
                          </select>
                      </div>
                  </div>

                  <div className="p-3 bg-gray-50 dark:bg-slate-800/50 text-center">
                      <button 
                        onClick={() => setShowTTSModal(false)}
                        className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                      >
                          Close Settings
                      </button>
                  </div>
              </div>
          </div>
      )}

      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-full max-h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-slate-800 relative">
       
       {/* Top Bar */}
       <div className="h-14 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between px-4 bg-white dark:bg-slate-900 relative z-20 shrink-0">
          <div className="flex items-center gap-3">
              <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded">
                  <XCircle size={20} />
              </button>
              
              <div className="h-4 w-px bg-gray-200 dark:bg-slate-700"></div>

              <div className="flex flex-col">
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400 font-medium">
                    <span>{currentIndex + 1} / {queue.length}</span>
                    <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-slate-600"></span>
                    <span className="uppercase">{mode}</span>
                </div>
              </div>
          </div>

          <div className="flex items-center gap-2">
               {isEditing ? (
                   <>
                    <button onClick={() => setIsEditing(false)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200">
                        <X size={14}/> Cancel
                    </button>
                    <button onClick={handleSaveEdit} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700">
                        <Save size={14}/> Save
                    </button>
                   </>
               ) : (
                   <button 
                    onClick={() => setIsEditing(true)}
                    className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-slate-800 rounded" 
                    title="Edit Flashcard"
                   >
                    <Pencil size={18}/>
                   </button>
               )}

               {/* MENU Dropdown Trigger */}
               <div className="relative" ref={menuRef}>
                   <button 
                    onClick={() => setShowMenu(!showMenu)}
                    className={`p-2 rounded transition-colors ${showMenu ? 'bg-gray-100 text-gray-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
                   >
                       <MoreHorizontal size={20}/>
                   </button>

                   {showMenu && (
                       <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 py-2 z-50 animate-in fade-in zoom-in-95 duration-100 select-none">
                           
                           {/* Previous Card */}
                           <button 
                            onClick={() => { handlePrevCard(); setShowMenu(false); }} 
                            disabled={currentIndex === 0}
                            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                           >
                               <div className="flex items-center gap-3 text-gray-700 dark:text-slate-200">
                                   <ArrowLeft size={16} className="text-gray-400"/>
                                   <span>Previous Card</span>
                               </div>
                               <span className="text-[10px] bg-gray-100 dark:bg-slate-700 text-gray-500 border border-gray-200 dark:border-slate-600 px-1.5 py-0.5 rounded min-w-[20px] text-center">←</span>
                           </button>

                           {/* Disable Card */}
                           <button 
                            onClick={() => { handleDisableCard(); setShowMenu(false); }} 
                            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors text-sm"
                           >
                               <div className="flex items-center gap-3 text-gray-700 dark:text-slate-200">
                                   <Ban size={16} className="text-gray-400"/>
                                   <span>Disable this card</span>
                               </div>
                               <span className="text-[10px] bg-gray-100 dark:bg-slate-700 text-gray-500 border border-gray-200 dark:border-slate-600 px-1.5 py-0.5 rounded min-w-[20px] text-center">B</span>
                           </button>

                           <div className="h-px bg-gray-100 dark:bg-slate-700 my-1"></div>

                           {/* Type in Answer Toggle */}
                           <div 
                            onClick={() => setTypeAnswerMode(!typeAnswerMode)}
                            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer text-sm"
                           >
                               <div className="flex items-center gap-3 text-gray-700 dark:text-slate-200">
                                   <Keyboard size={16} className="text-gray-400"/>
                                   <span>Type in Answer</span>
                               </div>
                               <div className={`w-9 h-5 rounded-full relative transition-colors duration-200 ${typeAnswerMode ? 'bg-blue-500' : 'bg-gray-200 dark:bg-slate-600'}`}>
                                   <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform duration-200 shadow-sm ${typeAnswerMode ? 'translate-x-4' : 'translate-x-0'}`}></div>
                               </div>
                           </div>

                           {/* TTS Toggle/Settings - MODIFIED to Open Modal */}
                           <button 
                            onClick={() => { setShowTTSModal(true); setShowMenu(false); }}
                            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer text-sm group"
                           >
                               <div className="flex items-center gap-3 text-gray-700 dark:text-slate-200">
                                   <Volume2 size={16} className="text-gray-400 group-hover:text-blue-500 transition-colors"/>
                                   <span>Text to Speech Options</span>
                               </div>
                               <div className="flex items-center gap-2">
                                   <Settings2 size={14} className="text-gray-400"/>
                                   {settings.tts.enabled && <div className="w-2 h-2 bg-green-500 rounded-full"></div>}
                               </div>
                           </button>

                           <div className="h-px bg-gray-100 dark:bg-slate-700 my-1"></div>

                           {/* Go to Rem */}
                           <button 
                            onClick={() => { handleGoToRem(); setShowMenu(false); }} 
                            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors text-sm"
                           >
                               <div className="flex items-center gap-3 text-gray-700 dark:text-slate-200">
                                   <ArrowRight size={16} className="text-gray-400"/>
                                   <span>Go to Rem</span>
                               </div>
                               <span className="text-[10px] bg-gray-100 dark:bg-slate-700 text-gray-500 border border-gray-200 dark:border-slate-600 px-1.5 py-0.5 rounded min-w-[20px] text-center">G</span>
                           </button>

                           {/* Fullscreen */}
                           <button 
                            onClick={() => { toggleFullscreen(); setShowMenu(false); }}
                            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors text-sm"
                           >
                               <div className="flex items-center gap-3 text-gray-700 dark:text-slate-200">
                                   {isFullscreen ? <Minimize size={16} className="text-gray-400"/> : <Maximize size={16} className="text-gray-400"/>}
                                   <span>{isFullscreen ? 'Exit Fullscreen' : 'Open Fullscreen'}</span>
                               </div>
                           </button>
                       </div>
                   )}
               </div>
          </div>
       </div>
       
       <div className="w-full h-1 bg-gray-100 dark:bg-slate-800 shrink-0">
          <div 
            className="h-full bg-gray-800 dark:bg-blue-500 transition-all duration-300"
            style={{ width: `${((currentIndex) / queue.length) * 100}%` }}
          ></div>
       </div>

      <div className="flex-1 flex flex-col px-8 md:px-12 w-full overflow-y-auto">
         <div className="flex-1 flex flex-col justify-center min-h-[200px] py-8">
             
             {settings.showContext && contextPath.length > 0 && (
                 <div className="mb-6 flex flex-col items-start font-medium select-none space-y-1 opacity-80">
                     {contextPath.map((crumb, i) => (
                         <div 
                            key={i} 
                            className="relative flex items-center text-xs text-gray-400 dark:text-slate-500" 
                            style={{ paddingLeft: `${i * 16}px` }}
                         >
                             {i > 0 && (
                                <div className="absolute left-0 top-[-6px] w-[calc(100%-4px)] h-[16px] border-l border-b border-gray-200 dark:border-slate-700 rounded-bl-sm -ml-[6px]"></div>
                             )}
                             <span className="truncate max-w-[400px] bg-white dark:bg-slate-900 px-1 relative z-10">
                                {crumb}
                             </span>
                         </div>
                     ))}
                 </div>
             )}

             <div className="text-xl md:text-2xl text-gray-800 dark:text-white leading-relaxed font-serif" style={{ paddingLeft: settings.showContext ? `${Math.max(0, contextPath.length * 16)}px` : '0px' }}>
                 
                 {isEditing ? (
                     <div className="flex flex-col gap-4">
                         <div>
                            <label className="text-xs uppercase text-gray-400 font-sans font-bold mb-1 block">Front</label>
                            <textarea 
                                value={editFront}
                                onChange={(e) => setEditFront(e.target.value)}
                                className="w-full p-2 border border-blue-300 rounded text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 dark:text-white"
                                rows={2}
                            />
                         </div>
                         {!isCloze && (
                             <div>
                                <label className="text-xs uppercase text-gray-400 font-sans font-bold mb-1 block">Back</label>
                                <textarea 
                                    value={editBack}
                                    onChange={(e) => setEditBack(e.target.value)}
                                    className="w-full p-2 border border-blue-300 rounded text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 dark:text-white"
                                    rows={2}
                                />
                             </div>
                         )}
                     </div>
                 ) : (
                     // Viewing Mode
                     isCloze ? (
                         // CLOZE DISPLAY
                         <RichText text={currentCard.front} isCloze={true} isRevealed={isRevealed} />
                     ) : (
                        // STANDARD DISPLAY
                        <div className="inline leading-normal">
                            <span className="font-medium text-gray-900 dark:text-slate-100 select-text cursor-text align-baseline">
                                <RichText text={currentCard.front} isCloze={false} isRevealed={true} />
                            </span>
                            
                            {settings.tts.enabled && !settings.tts.autoplay && (
                                 <button onClick={() => speakText(currentCard.front, false)} className="inline-block mx-2 text-gray-300 hover:text-blue-500 transition-colors align-middle">
                                     <Volume2 size={16} />
                                 </button>
                            )}

                            <span className="mx-3 text-gray-300 dark:text-slate-600 font-bold select-none scale-90 inline-block align-baseline">
                                {arrowSymbol}
                            </span>
                            
                            {isRevealed ? (
                                <>
                                    <span className="text-gray-800 dark:text-slate-200 font-normal animate-in fade-in duration-300 align-baseline select-text cursor-text">
                                        <RichText text={currentCard.back} isCloze={false} isRevealed={true} />
                                    </span>
                                    {settings.tts.enabled && !settings.tts.autoplay && (
                                        <button onClick={() => speakText(currentCard.back, true)} className="inline-block mx-2 text-gray-300 hover:text-blue-500 transition-colors align-middle">
                                            <Volume2 size={16} />
                                        </button>
                                    )}
                                </>
                            ) : (
                                <span className="inline-flex items-center justify-center px-2 py-0.5 ml-1 bg-gray-100 dark:bg-slate-800 rounded text-gray-300 dark:text-slate-700 text-sm select-none align-middle h-6 min-w-[30px]">
                                    ???
                                </span>
                            )}
                        </div>
                     )
                 )}

                 {typeAnswerMode && !isRevealed && !isEditing && !isCloze && (
                     <div className="mt-4 animate-in fade-in slide-in-from-left-1 block">
                         <input 
                            ref={inputRef}
                            type="text"
                            value={userAnswer}
                            onChange={(e) => setUserAnswer(e.target.value)}
                            placeholder="Type answer..."
                            className="w-full max-w-md bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-base"
                            onKeyDown={(e) => e.key === 'Enter' && handleReveal()}
                         />
                     </div>
                 )}
                 
                 {typeAnswerMode && isRevealed && !isEditing && !isCloze && (
                    <div className="mt-4 p-3 bg-gray-50 dark:bg-slate-800/50 rounded border border-gray-100 dark:border-slate-800">
                        <div className="text-xs text-gray-400 uppercase font-bold mb-1">Your Answer</div>
                        <div className={`text-lg ${userAnswer.trim().toLowerCase() === currentCard.back.trim().toLowerCase() ? 'text-green-600' : 'text-red-500'}`}>
                            {userAnswer || "(No answer typed)"}
                        </div>
                    </div>
                 )}
             </div>

             {isRevealed && aiHint && !isEditing && (
                 <div className="mt-6 p-3 bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-900/30 rounded-lg text-sm text-purple-900 dark:text-purple-200 animate-in fade-in slide-in-from-bottom-2 max-w-2xl">
                     <div className="font-bold mb-1 text-purple-700 dark:text-purple-300 flex items-center gap-2 text-xs uppercase tracking-wide"><BrainCircuit size={12}/> AI Explanation</div>
                     {aiHint}
                 </div>
             )}
         </div>
      </div>

      {/* Footer Controls */}
      <div className="p-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/50 shrink-0">
            {!isRevealed && !isEditing ? (
                <button 
                    onClick={handleReveal}
                    className="w-full bg-gray-900 dark:bg-blue-600 text-white h-12 rounded-lg font-medium text-base shadow-sm hover:bg-black dark:hover:bg-blue-700 transition-all flex items-center justify-center gap-2 transform active:scale-[0.99]"
                >
                    <Eye size={18} />
                    Show Answer
                </button>
            ) : (
                !isEditing && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                         {!aiHint && (
                            <button 
                                onClick={handleAIHint} 
                                className="self-center text-xs text-purple-500 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 flex items-center gap-1 mb-1 opacity-60 hover:opacity-100 transition-opacity"
                                disabled={isAIHintLoading}
                            >
                                {isAIHintLoading ? "..." : "AI Context"} <BrainCircuit size={12}/>
                            </button>
                         )}
                        
                        {/* Buttons Container */}
                        <div className="grid grid-cols-4 gap-2 w-full">
                            {mode === 'order' ? (
                                <>
                                    <StudyButton label="Fail" subLabel="2s" color="red" onClick={() => handleRate(OrderRating.TWO_SEC)} />
                                    <StudyButton label="Good" subLabel="15m" color="blue" onClick={() => handleRate(OrderRating.FIFTEEN_MIN)} />
                                    <StudyButton label="Very Good" subLabel="30m" color="green" onClick={() => handleRate(OrderRating.THIRTY_MIN)} />
                                    <StudyButton label="Excellent" subLabel="1h" color="purple" onClick={() => handleRate(OrderRating.ONE_HOUR)} />
                                </>
                            ) : (
                                <>
                                    <StudyButton label="Again" subLabel={settings.intervals.again} color="red" onClick={() => handleRate(StudyRating.AGAIN)} />
                                    <StudyButton label="Hard" subLabel={settings.intervals.hard} color="orange" onClick={() => handleRate(StudyRating.HARD)} />
                                    <StudyButton label="Good" subLabel={settings.intervals.good} color="blue" onClick={() => handleRate(StudyRating.GOOD)} />
                                    <StudyButton label="Easy" subLabel={settings.intervals.easy} color="green" onClick={() => handleRate(StudyRating.EASY)} />
                                </>
                            )}
                        </div>
                    </div>
                )
            )}
         </div>
         </div>
    </div>
  );
};

const StudyButton: React.FC<{
    label: string; 
    subLabel: string; 
    color: 'red' | 'orange' | 'blue' | 'green' | 'purple'; 
    onClick: () => void;
}> = ({ label, subLabel, color, onClick }) => {
    
    const colorClasses = {
        red: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800 dark:hover:bg-red-900/40',
        orange: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800 dark:hover:bg-orange-900/40',
        blue: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800 dark:hover:bg-blue-900/40',
        green: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800 dark:hover:bg-green-900/40',
        purple: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800 dark:hover:bg-purple-900/40',
    };

    return (
        <button 
            onClick={onClick} 
            className={`flex flex-col items-center justify-center py-2.5 rounded-lg border transition-all ${colorClasses[color]}`}
        >
            <span className="font-semibold text-sm">{label}</span>
            <span className="text-[10px] opacity-60 font-mono">{subLabel}</span>
        </button>
    );
};

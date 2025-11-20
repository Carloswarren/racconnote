
import React, { useState, useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { StudySession } from './components/StudySession';
import { SettingsModal } from './components/SettingsModal';
import { Document, Block, Flashcard, AppSettings, Folder, StudyRating, OrderRating, Backlink } from './types';
import { Menu } from 'lucide-react';
import { generateId } from './utils';

// Initial Data
const initialDocId = 'welcome-doc';
const initialFolderId = 'welcome-folder';

const initialDocs: Document[] = [
  {
    id: initialDocId,
    folderId: null,
    title: "Welcome to MemNote",
    lastModified: Date.now(),
    blocks: [
      { id: 'b1', content: "Welcome to your new intelligent notebook!", level: 0 },
      { id: 'b2', content: "How to use MemNote", level: 0 },
      { id: 'b3', content: "Type ';;' for a forward card ;; This is the answer", level: 1, isFlashcard: true },
      { id: 'b4', content: "Type '::' for a two-way card :: This works both ways", level: 1, isFlashcard: true },
      { id: 'b5', content: "Use {curly braces} to create a cloze deletion card.", level: 1, isFlashcard: true },
      { id: 'b6', content: "Select text to format it (Bold, Italic, Highlight, etc).", level: 1 },
      { id: 'b7', content: "Folders & References", level: 0 },
      { id: 'b8', content: "Create folders in the sidebar to organize.", level: 1 },
      { id: 'b9', content: "Type '[[' to reference other documents.", level: 1 },
    ]
  }
];

const initialFolders: Folder[] = [
  { id: initialFolderId, name: "My Knowledge Base", isOpen: true }
];

export const App: React.FC = () => {
  // Load from LocalStorage or fall back to initial data
  const [documents, setDocuments] = useState<Document[]>(() => {
    try {
      const saved = localStorage.getItem('memnote-docs');
      return saved ? JSON.parse(saved) : initialDocs;
    } catch (e) {
      return initialDocs;
    }
  });
  
  const [folders, setFolders] = useState<Folder[]>(() => {
    try {
      const saved = localStorage.getItem('memnote-folders');
      return saved ? JSON.parse(saved) : initialFolders;
    } catch (e) {
      return initialFolders;
    }
  });

  // Load Settings
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('memnote-settings');
      if (saved) return JSON.parse(saved);
    } catch (e) { /* ignore */ }
    return {
      darkMode: false,
      showContext: true,
      failDelay: 2000, 
      leechThreshold: 5,
      intervals: { again: '1m', hard: '2d', good: '5d', easy: '8d' },
      tts: { enabled: false, autoplay: true, frontLang: 'auto', backLang: 'auto' }
    };
  });

  const [activeDocId, setActiveDocId] = useState<string | null>(() => {
      if (documents.length > 0) {
        // Try to preserve last open doc or default to first
        return documents[0].id;
      }
      return null;
  });
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [mode, setMode] = useState<'edit' | 'study'>('edit');
  const [studyModeType, setStudyModeType] = useState<'spaced' | 'all' | 'order' | 'flashcards'>('spaced');
  const [studyCards, setStudyCards] = useState<Flashcard[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Persistence Effects
  useEffect(() => {
    localStorage.setItem('memnote-docs', JSON.stringify(documents));
  }, [documents]);

  useEffect(() => {
    localStorage.setItem('memnote-folders', JSON.stringify(folders));
  }, [folders]);

  useEffect(() => {
    localStorage.setItem('memnote-settings', JSON.stringify(settings));
  }, [settings]);

  // Apply Dark Mode
  useEffect(() => {
    if (settings.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.darkMode]);

  const activeDoc = documents.find(d => d.id === activeDocId) || documents[0];

  // --- Backlinks Calculation ---
  const activeBacklinks = useMemo(() => {
      if (!activeDoc) return [];
      const links: Backlink[] = [];
      const titlePattern = `[[${activeDoc.title}]]`;
      
      documents.forEach(doc => {
          doc.blocks.forEach(block => {
             if (block.content.includes(titlePattern)) {
                 links.push({
                     sourceDocId: doc.id,
                     sourceDocTitle: doc.title,
                     sourceBlockId: block.id,
                     content: block.content
                 });
             }
          });
      });
      return links;
  }, [activeDoc, documents]);

  // --- Handlers ---

  const handleUpdateBlocks = (blocks: Block[]) => {
    setDocuments(prev => prev.map(doc => 
      doc.id === activeDocId ? { ...doc, blocks, lastModified: Date.now() } : doc
    ));
  };

  const handleUpdateTitle = (title: string) => {
    setDocuments(prev => prev.map(doc => 
      doc.id === activeDocId ? { ...doc, title, lastModified: Date.now() } : doc
    ));
  };

  const handleRenameDoc = (id: string, newTitle: string) => {
    setDocuments(prev => prev.map(doc => 
        doc.id === id ? { ...doc, title: newTitle, lastModified: Date.now() } : doc
    ));
  };

  // Folder Logic
  const handleCreateFolder = () => {
    const name = prompt("Enter folder name:");
    if (name && name.trim()) {
      setFolders([...folders, { id: generateId(), name: name.trim(), isOpen: true }]);
    }
  };

  const handleRenameFolder = (id: string, newName: string) => {
    setFolders(folders.map(f => f.id === id ? { ...f, name: newName } : f));
  };

  const handleToggleFolder = (folderId: string) => {
    setFolders(folders.map(f => f.id === folderId ? { ...f, isOpen: !f.isOpen } : f));
  };

  const handleDeleteFolder = (folderId: string) => {
      const folder = folders.find(f => f.id === folderId);
      if (!folder) return;

      const docsInFolder = documents.filter(d => d.folderId === folderId);
      const hasDocs = docsInFolder.length > 0;
      
      const message = hasDocs 
          ? `Delete folder "${folder.name}"?\n\n${docsInFolder.length} document(s) inside will be moved to "Unsorted".`
          : `Delete empty folder "${folder.name}"?`;

      if (window.confirm(message)) {
          // Move docs to root (null folderId)
          if (hasDocs) {
              setDocuments(docs => docs.map(d => d.folderId === folderId ? { ...d, folderId: null } : d));
          }
          // Delete folder
          setFolders(prev => prev.filter(f => f.id !== folderId));
      }
  };

  const handleMoveDoc = (docId: string, folderId: string | null) => {
    setDocuments(docs => docs.map(d => d.id === docId ? { ...d, folderId } : d));
  };

  // Doc Logic
  const handleCreateDoc = (folderId: string | null) => {
    const newDoc: Document = {
      id: generateId(),
      folderId: folderId,
      title: "Untitled Document",
      blocks: [{ id: generateId(), content: "", level: 0 }],
      lastModified: Date.now()
    };
    setDocuments([...documents, newDoc]);
    setActiveDocId(newDoc.id);
    
    // Expand folder if needed
    if (folderId) {
        setFolders(folders.map(f => f.id === folderId ? { ...f, isOpen: true } : f));
    }
    
    // Mobile UX: close sidebar
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const handleDeleteDoc = (id: string) => {
      const doc = documents.find(d => d.id === id);
      if (!doc) return;

      if (documents.length <= 1) {
          alert("You cannot delete the only document. Try clearing its content instead.");
          return;
      }
      
      if (window.confirm(`Delete document "${doc.title || 'Untitled'}"?`)) {
          const newDocs = documents.filter(d => d.id !== id);
          setDocuments(newDocs);
          
          // If we deleted the active doc, switch to another one
          if (activeDocId === id) {
              setActiveDocId(newDocs[0].id);
          }
      }
  };

  // Study Logic
  const extractCards = (docsToScan: Document[]): Flashcard[] => {
      const extracted: Flashcard[] = [];
      docsToScan.forEach(doc => {
          doc.blocks.forEach(block => {
              const srs = block.srsData || { nextReview: 0, interval: 0, easeFactor: 2.5, repetitions: 0, lapses: 0, disabled: false };
              
              if (srs.disabled) return;

              const baseCard = {
                  blockId: block.id,
                  docId: doc.id,
                  status: srs.repetitions === 0 ? 'new' : 'review' as any,
                  interval: srs.interval,
                  easeFactor: srs.easeFactor,
                  repetitions: srs.repetitions,
                  lapses: srs.lapses,
                  disabled: srs.disabled,
                  nextReview: srs.nextReview
              };

              if (block.content.includes('::')) {
                   const parts = block.content.split('::');
                   if (parts.length >= 2) {
                       extracted.push({ ...baseCard, id: block.id + '_fwd', front: parts[0].trim(), back: parts[1].trim(), cardType: 'forward' });
                   }
              } else if (block.content.includes(';;')) {
                   const parts = block.content.split(';;');
                   if (parts.length >= 2) {
                       extracted.push({ ...baseCard, id: block.id + '_fwd', front: parts[0].trim(), back: parts[1].trim(), cardType: 'forward' });
                   }
              } else if (/\{[^}]+\}/.test(block.content)) {
                  extracted.push({ ...baseCard, id: block.id + '_cloze', front: block.content, back: block.content, cardType: 'cloze' });
              }
          });
      });
      return extracted;
  };

  const handleStartStudy = (options: { mode: 'spaced' | 'all' | 'order' | 'flashcards', specificCardIds?: string[] } = { mode: 'spaced' }) => {
      setStudyModeType(options.mode);
      let docsToStudy: Document[] = (options.mode === 'all' || options.mode === 'flashcards') 
          ? documents 
          : (activeDoc ? [activeDoc] : documents);
      
      if (options.mode === 'flashcards' && activeDoc && !options.specificCardIds) {
          // For flashcard mode defaulting to active doc context if not "study all"
          if (options.mode === 'flashcards') {
             // If triggered from global button usually means all, but let's respect context
             // If triggered from sidebar "Flashcard Home", we usually want all.
             // If triggered from within a doc, maybe just that doc?
             // Current implementation of Sidebar "Study All" calls handleStartStudy({mode: 'all'})
             // So if we are here with 'flashcards', it's likely from the dropdown menu in Editor.
          }
      }

      let cards = extractCards(docsToStudy);
      
      if (options.specificCardIds && options.specificCardIds.length > 0) {
          const idSet = new Set(options.specificCardIds);
          cards = cards.filter(c => idSet.has(c.id));
      }

      if (cards.length === 0) {
          alert("No flashcards found!");
          return;
      }

      if (options.mode !== 'order') {
          // Shuffle
          for (let i = cards.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [cards[i], cards[j]] = [cards[j], cards[i]];
          }
      }

      setStudyCards(cards);
      setMode('study');
  };

  const handleNavigateToDoc = (docId: string) => {
      setActiveDocId(docId);
      setMode('edit');
  };

  const handleUpdateCardProgress = (card: Flashcard, rating: StudyRating | OrderRating) => {
      setDocuments(prevDocs => prevDocs.map(doc => {
          if (doc.id !== card.docId) return doc;
          return {
              ...doc,
              blocks: doc.blocks.map(block => {
                  if (block.id !== card.blockId) return block;
                  const currentSRS = block.srsData || { nextReview: 0, interval: 0, easeFactor: 2.5, repetitions: 0, lapses: 0, disabled: false };
                  let newLapses = currentSRS.lapses || 0;
                  let newReps = currentSRS.repetitions;
                  if (rating === StudyRating.AGAIN || rating === OrderRating.TWO_SEC) {
                      newLapses += 1;
                      newReps = 0;
                  } else {
                      newReps += 1;
                  }
                  return {
                      ...block,
                      srsData: { ...currentSRS, repetitions: newReps, lapses: newLapses, lastReview: Date.now() }
                  };
              })
          };
      }));
  };

  const handleEditCard = (card: Flashcard, newFront: string, newBack: string) => {
      setDocuments(docs => docs.map(d => {
          if (d.id === card.docId) {
              return {
                  ...d,
                  blocks: d.blocks.map(b => {
                      if (b.id === card.blockId) {
                          if (card.cardType === 'cloze') return { ...b, content: newFront };
                          let sep = b.content.includes('::') ? '::' : ';;';
                          return { ...b, content: `${newFront} ${sep} ${newBack}` };
                      }
                      return b;
                  })
              };
          }
          return d;
      }));
  };

  return (
    <div className="flex h-screen w-full bg-white dark:bg-slate-950 transition-colors duration-300 overflow-hidden">
      
      <div className={`fixed inset-y-0 left-0 z-40 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:relative md:flex transition-transform duration-300 ease-in-out shadow-xl md:shadow-none`}>
        <Sidebar 
            documents={documents}
            folders={folders}
            activeDocId={activeDocId}
            onSelectDoc={(id) => { setActiveDocId(id); setMode('edit'); if(window.innerWidth < 768) setIsSidebarOpen(false); }}
            onCreateDoc={handleCreateDoc}
            onCreateFolder={handleCreateFolder}
            onRenameFolder={handleRenameFolder}
            onToggleFolder={handleToggleFolder}
            onDeleteFolder={handleDeleteFolder}
            onMoveDoc={handleMoveDoc}
            onDeleteDoc={handleDeleteDoc}
            onRenameDoc={handleRenameDoc}
            onStudyAll={() => handleStartStudy({ mode: 'all' })}
            onOpenSettings={() => setIsSettingsOpen(true)}
            isOpen={true}
        />
      </div>

      {!isSidebarOpen && (
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="absolute top-4 left-4 z-30 p-2 bg-white dark:bg-slate-800 rounded-md shadow-md text-gray-600 dark:text-slate-300 md:hidden"
          >
              <Menu size={20} />
          </button>
      )}
      
      {isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          ></div>
      )}

      <div className="flex-1 h-full relative flex flex-col min-w-0">
        {mode === 'edit' && activeDoc ? (
           <Editor 
             title={activeDoc.title}
             blocks={activeDoc.blocks}
             allDocTitles={documents.map(d => ({ id: d.id, title: d.title }))}
             backlinks={activeBacklinks}
             settings={settings}
             onChangeTitle={handleUpdateTitle}
             onChangeBlocks={handleUpdateBlocks}
             onStartStudy={handleStartStudy}
             onNavigateToDoc={handleNavigateToDoc}
           />
        ) : mode === 'study' ? (
            <StudySession 
                cards={studyCards}
                documents={documents}
                onClose={() => setMode('edit')}
                settings={settings}
                mode={studyModeType}
                onUpdateCardProgress={handleUpdateCardProgress}
                onNavigateToDoc={handleNavigateToDoc}
                onEditCard={handleEditCard}
                onUpdateSettings={setSettings}
            />
        ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                    <p className="mb-4">No document selected.</p>
                    <button onClick={() => handleCreateDoc(null)} className="text-blue-600 hover:underline">Create a new document</button>
                </div>
            </div>
        )}
      </div>

      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={setSettings}
      />
    </div>
  );
};

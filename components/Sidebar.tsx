
import React, { useState, useRef, useEffect } from 'react';
import { Document, Folder } from '../types';
import { Plus, FileText, BookOpen, Trash2, Settings, Folder as FolderIcon, FolderOpen, ChevronRight, ChevronDown, FilePlus, Pencil, ArrowRightCircle, FolderPlus, FolderInput } from 'lucide-react';

interface SidebarProps {
  documents: Document[];
  folders: Folder[];
  activeDocId: string | null;
  onSelectDoc: (id: string) => void;
  onCreateDoc: (folderId: string | null) => void;
  onCreateFolder: () => void;
  onRenameFolder: (folderId: string, newName: string) => void;
  onToggleFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onMoveDoc: (docId: string, folderId: string | null) => void;
  onDeleteDoc: (id: string) => void;
  onRenameDoc: (id: string, newTitle: string) => void;
  onStudyAll: () => void;
  onOpenSettings: () => void;
  isOpen: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  documents,
  folders,
  activeDocId,
  onSelectDoc,
  onCreateDoc,
  onCreateFolder,
  onRenameFolder,
  onToggleFolder,
  onDeleteFolder,
  onMoveDoc,
  onDeleteDoc,
  onRenameDoc,
  onStudyAll,
  onOpenSettings,
  isOpen
}) => {
  const [movingDocId, setMovingDocId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | 'root' | null>(null);
  const moveMenuRef = useRef<HTMLDivElement>(null);

  // Close move menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (moveMenuRef.current && !moveMenuRef.current.contains(event.target as Node)) {
        setMovingDocId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [movingDocId]);

  if (!isOpen) return null;

  const unorganizedDocs = documents.filter(d => !d.folderId);

  const handleRenameClick = (e: React.MouseEvent, doc: Document) => {
      e.stopPropagation();
      const newTitle = prompt("Rename document:", doc.title);
      if (newTitle !== null) {
          onRenameDoc(doc.id, newTitle);
      }
  };

  const handleRenameFolderClick = (e: React.MouseEvent, folder: Folder) => {
      e.stopPropagation();
      const newName = prompt("Rename folder:", folder.name);
      if (newName !== null) {
          onRenameFolder(folder.id, newName);
      }
  };

  // --- Drag and Drop Handlers ---

  const handleDragStart = (e: React.DragEvent, docId: string) => {
      e.dataTransfer.setData("text/plain", docId);
      e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, targetId: string | 'root') => {
      e.preventDefault(); 
      e.stopPropagation();
      if (dragOverTarget !== targetId) {
        setDragOverTarget(targetId);
      }
      e.dataTransfer.dropEffect = "move";
  };

  const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent, folderId: string | null) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverTarget(null);
      const docId = e.dataTransfer.getData("text/plain");
      if (docId) {
          const doc = documents.find(d => d.id === docId);
          // Only move if folder actually changed
          if (doc && doc.folderId !== folderId) {
              onMoveDoc(docId, folderId);
          }
      }
  };

  // --- End DnD ---

  const handleMoveClick = (e: React.MouseEvent, docId: string) => {
      e.stopPropagation();
      setMovingDocId(docId);
  };

  const handleSelectMoveDest = (e: React.MouseEvent, folderId: string | null) => {
      e.stopPropagation();
      if (movingDocId) {
          onMoveDoc(movingDocId, folderId);
          setMovingDocId(null);
      }
  };

  const renderDocItem = (doc: Document) => {
      const isMoving = movingDocId === doc.id;

      return (
        <div
            key={doc.id}
            draggable
            onDragStart={(e) => handleDragStart(e, doc.id)}
            className={`group flex items-center justify-between px-3 py-1.5 rounded-md cursor-pointer transition-colors relative ${
                activeDocId === doc.id
                ? 'bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-slate-100 font-medium'
                : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800/50'
            }`}
            onClick={() => onSelectDoc(doc.id)}
        >
            <div className="flex items-center gap-2 overflow-hidden flex-1">
                <FileText size={14} className={activeDocId === doc.id ? 'text-gray-500' : 'text-gray-300'} />
                <span className="truncate text-sm select-none">{doc.title || "Untitled"}</span>
            </div>
            
            <div className="flex items-center gap-1">
                <button 
                    onClick={(e) => handleMoveClick(e, doc.id)}
                    className={`p-1 rounded ${isMoving ? 'bg-blue-100 text-blue-600' : 'text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700 hover:text-gray-600'}`}
                    title="Move to Folder"
                >
                    <ArrowRightCircle size={12} />
                </button>
                <button 
                    onClick={(e) => handleRenameClick(e, doc)}
                    className="p-1 text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700 hover:text-gray-600 rounded"
                    title="Rename"
                >
                    <Pencil size={12} />
                </button>
                <button 
                    onClick={(e) => { e.stopPropagation(); onDeleteDoc(doc.id); }}
                    className="p-1 text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-500 rounded"
                    title="Delete"
                >
                    <Trash2 size={12} />
                </button>
            </div>

            {/* Move Dropdown */}
            {isMoving && (
                <div 
                    ref={moveMenuRef}
                    className="absolute left-8 top-full mt-1 w-48 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden"
                >
                    <div className="text-[10px] uppercase bg-gray-50 dark:bg-slate-900 px-2 py-1 text-gray-400 font-semibold">Move to...</div>
                    <button 
                        onClick={(e) => handleSelectMoveDest(e, null)}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-2"
                    >
                         <FolderIcon size={12}/> Root (Unsorted)
                    </button>
                    {folders.map(f => (
                        <button 
                            key={f.id}
                            onClick={(e) => handleSelectMoveDest(e, f.id)}
                            className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-2 truncate"
                        >
                             <FolderIcon size={12}/> {f.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
      );
  };

  return (
    <div className="w-72 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 h-full flex flex-col shrink-0 transition-all duration-300 absolute md:relative z-10">
      <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
        <h1 className="font-bold text-gray-800 dark:text-slate-100 text-xl tracking-tight flex items-center gap-2">
          <span className="bg-gray-900 text-white p-1 rounded text-sm font-serif">MN</span> MemNote
        </h1>
      </div>

      <div className="p-3 flex-1 flex flex-col overflow-hidden">
        <button
          onClick={onStudyAll}
          className="w-full flex items-center gap-2 justify-center bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 px-4 py-2 rounded-lg font-medium transition-colors mb-4 text-sm shadow-sm shrink-0"
        >
          <BookOpen size={16} className="text-gray-500 dark:text-slate-400" />
          Flashcard Home
        </button>

        <div className="flex items-center justify-between mb-2 px-2 shrink-0">
             <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Library</div>
        </div>
        
        <div className="space-y-0.5 overflow-y-auto flex-1 no-scrollbar pb-2">
          
          {/* Folders */}
          {folders.map(folder => {
              const folderDocs = documents.filter(d => d.folderId === folder.id);
              const isDragTarget = dragOverTarget === folder.id;
              
              return (
                <div 
                    key={folder.id} 
                    className={`mb-1 rounded transition-all duration-200 ${isDragTarget ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-800 border shadow-inner' : 'border border-transparent'}`}
                    onDragOver={(e) => handleDragOver(e, folder.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, folder.id)}
                >
                    <div 
                        className="flex items-center justify-between px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded cursor-pointer text-gray-700 dark:text-slate-300 group"
                        onClick={() => onToggleFolder(folder.id)}
                    >
                         <div className="flex items-center gap-2 overflow-hidden flex-1">
                             {folder.isOpen ? <ChevronDown size={14} className="text-gray-400"/> : <ChevronRight size={14} className="text-gray-400"/>}
                             <FolderOpen size={16} className={`text-gray-400 dark:text-slate-500 transition-colors ${isDragTarget ? 'text-blue-500 scale-110' : 'group-hover:text-yellow-500'}`}/>
                             <span className="text-sm font-medium truncate select-none">{folder.name}</span>
                         </div>
                         
                         <div className="flex items-center gap-1 transition-opacity">
                             <button 
                                onClick={(e) => handleRenameFolderClick(e, folder)} 
                                className="text-gray-300 hover:text-gray-600 dark:hover:text-slate-200 p-0.5 hover:bg-gray-200 dark:hover:bg-slate-700 rounded"
                                title="Rename Folder"
                             >
                                 <Pencil size={12}/>
                             </button>
                             <button 
                                onClick={(e) => {e.stopPropagation(); onDeleteFolder(folder.id)}} 
                                className="text-gray-300 hover:text-red-500 p-0.5 hover:bg-gray-200 dark:hover:bg-slate-700 rounded"
                                title="Delete Folder"
                             >
                                 <Trash2 size={12}/>
                             </button>
                             <button 
                                onClick={(e) => {e.stopPropagation(); onCreateDoc(folder.id)}} 
                                className="text-gray-300 hover:text-gray-600 dark:hover:text-slate-200 p-0.5 hover:bg-gray-200 dark:hover:bg-slate-700 rounded"
                                title="Add Doc to Folder"
                             >
                                 <Plus size={14}/>
                             </button>
                         </div>
                    </div>
                    
                    {folder.isOpen && (
                        <div className="mt-0.5 ml-[11px] border-l border-gray-200 dark:border-slate-700 pl-3 space-y-0.5">
                            {folderDocs.map(doc => renderDocItem(doc))}
                            {folderDocs.length === 0 && (
                                <div className="px-3 py-1.5 text-xs text-gray-400 italic">Empty (Drop docs here)</div>
                            )}
                        </div>
                    )}
                </div>
              );
          })}

          {/* Root Docs / Unsorted Drop Zone */}
          <div 
            className={`mt-4 min-h-[60px] rounded transition-all duration-200 ${dragOverTarget === 'root' ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-800 shadow-inner' : 'border border-transparent'}`}
            onDragOver={(e) => handleDragOver(e, 'root')}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, null)}
          >
             <div className="px-2 mb-1 flex items-center justify-between">
                <div className="text-xs text-gray-300 dark:text-slate-600 uppercase font-bold">Unsorted</div>
                {dragOverTarget === 'root' && <span className="text-[10px] text-blue-500 font-bold uppercase">Drop Here</span>}
             </div>
             <div className="space-y-0.5">
                {unorganizedDocs.map(doc => renderDocItem(doc))}
                {unorganizedDocs.length === 0 && dragOverTarget !== 'root' && (
                    <div className="px-3 py-2 text-xs text-gray-400 italic text-center border border-dashed border-gray-200 dark:border-slate-800 rounded">
                        Drag documents here to remove from folder
                    </div>
                )}
             </div>
          </div>

        </div>
      </div>

      {/* Footer with New Buttons */}
      <div className="p-4 border-t border-gray-200 dark:border-slate-700 mt-auto space-y-2 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-2">
             <button
                onClick={() => onCreateDoc(null)}
                className="flex-1 flex items-center gap-2 justify-center bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 px-3 py-2 rounded-lg font-medium text-sm transition-colors shadow-sm"
             >
                <FilePlus size={16} />
                New Doc
             </button>
             <button
                onClick={onCreateFolder}
                className="flex-1 flex items-center gap-2 justify-center bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 px-3 py-2 rounded-lg font-medium text-sm transition-colors shadow-sm"
                title="New Folder"
             >
                <FolderPlus size={16} />
                New Folder
             </button>
        </div>

        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 justify-center text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
        >
          <Settings size={16} />
          Settings
        </button>
      </div>
    </div>
  );
};

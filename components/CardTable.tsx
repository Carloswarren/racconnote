
import React, { useMemo, useState } from 'react';
import { AppSettings, Block } from '../types';
import { X, Search, Filter, ArrowRightLeft, ArrowRight, Braces, ChevronRight, FileText, Tag, Eye, MoreHorizontal, Settings, Play, ArrowLeft } from 'lucide-react';

interface CardTableProps {
  isOpen: boolean;
  onClose: () => void;
  blocks: Block[];
  docTitle: string;
  settings: AppSettings;
  onToggleDisable: (blockId: string) => void;
  onStartStudy: (options: { mode: 'spaced', specificCardIds?: string[] }) => void;
}

interface TableRow {
  id: string;
  blockId: string;
  ancestors: string[];
  front: string;
  back: string;
  type: 'forward' | 'bidirectional' | 'cloze';
  lapses: number;
  disabled: boolean;
  repetitions: number;
}

type TabType = 'all' | 'leech' | 'struggling' | 'disabled' | 'enabled' | 'new';

export const CardTable: React.FC<CardTableProps> = ({ isOpen, onClose, blocks, docTitle, settings, onToggleDisable, onStartStudy }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<TabType>('enabled');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const tableData = useMemo(() => {
    const rows: TableRow[] = [];

    blocks.forEach((block, index) => {
      // 1. Calculate Ancestors
      const ancestors: string[] = [];
      let currentLevel = block.level;
      
      // Look backwards for parents
      for (let i = index - 1; i >= 0; i--) {
        if (blocks[i].level < currentLevel) {
          ancestors.unshift(blocks[i].content);
          currentLevel = blocks[i].level;
          if (currentLevel === 0) break;
        }
      }

      const lapses = block.srsData?.lapses || 0;
      const disabled = block.srsData?.disabled || false;
      const repetitions = block.srsData?.repetitions || 0;

      // 2. Identify and Create Cards
      const content = block.content;
      
      if (content.includes('::')) {
        // Bidirectional
        const [front, back] = content.split('::').map(s => s.trim());
        if (front && back) {
          // Forward
          rows.push({
            id: `${block.id}-fwd`,
            blockId: block.id,
            ancestors,
            front,
            back,
            type: 'bidirectional',
            lapses,
            disabled,
            repetitions
          });
          // Backward
          rows.push({
            id: `${block.id}-bwd`,
            blockId: block.id,
            ancestors,
            front: back,
            back: front,
            type: 'bidirectional',
            lapses,
            disabled,
            repetitions
          });
        }
      } else if (content.includes(';;')) {
        // Forward Only
        const [front, back] = content.split(';;').map(s => s.trim());
        if (front && back) {
          rows.push({
            id: `${block.id}-fwd`,
            blockId: block.id,
            ancestors,
            front,
            back,
            type: 'forward',
            lapses,
            disabled,
            repetitions
          });
        }
      } else if (/\{[^}]+\}/.test(content)) {
        // Cloze
        rows.push({
          id: `${block.id}-cloze`,
          blockId: block.id,
          ancestors,
          front: content,
          back: "...",
          type: 'cloze',
          lapses,
          disabled,
          repetitions
        });
      }
    });

    return rows;
  }, [blocks, docTitle]);

  const getFilteredData = () => {
      let data = tableData;

      // Text Filter
      if (searchTerm) {
          const lower = searchTerm.toLowerCase();
          data = data.filter(row => 
            row.front.toLowerCase().includes(lower) || 
            row.back.toLowerCase().includes(lower) ||
            row.ancestors.some(a => a.toLowerCase().includes(lower))
          );
      }

      // Tab Filter
      switch (activeTab) {
          case 'leech':
              return data.filter(r => r.lapses >= settings.leechThreshold && !r.disabled);
          case 'struggling':
              return data.filter(r => r.lapses > 0 && r.lapses < settings.leechThreshold && !r.disabled);
          case 'disabled':
              return data.filter(r => r.disabled);
          case 'new':
              return data.filter(r => r.repetitions === 0 && !r.disabled);
          case 'enabled':
              return data.filter(r => !r.disabled);
          case 'all':
          default:
              return data;
      }
  };

  const filteredData = getFilteredData();

  // Counts for Tabs
  const counts = useMemo(() => {
      return {
          leech: tableData.filter(r => r.lapses >= settings.leechThreshold && !r.disabled).length,
          struggling: tableData.filter(r => r.lapses > 0 && r.lapses < settings.leechThreshold && !r.disabled).length,
          disabled: tableData.filter(r => r.disabled).length,
          new: tableData.filter(r => r.repetitions === 0 && !r.disabled).length,
          enabled: tableData.filter(r => !r.disabled).length,
          all: tableData.length
      };
  }, [tableData, settings.leechThreshold]);


  const toggleSelection = (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedIds(newSet);
  };

  const toggleAll = () => {
      if (selectedIds.size === filteredData.length) {
          setSelectedIds(new Set());
      } else {
          setSelectedIds(new Set(filteredData.map(r => r.id)));
      }
  };

  const handlePracticeFiltered = () => {
      const ids = filteredData.map(r => r.id);
      onStartStudy({ mode: 'spaced', specificCardIds: ids });
      onClose();
  };

  if (!isOpen) return null;

  const TabButton = ({ id, label, count }: { id: TabType, label: string, count: number }) => (
      <button 
        onClick={() => setActiveTab(id)}
        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${
            activeTab === id 
            ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm border border-gray-200 dark:border-slate-700' 
            : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800'
        }`}
      >
          {label}
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === id ? 'bg-blue-50 text-blue-600' : 'bg-gray-200 dark:bg-slate-700 text-gray-500'}`}>
              {count}
          </span>
      </button>
  );

  const getPracticeLabel = () => {
      if (searchTerm) return `Practice ${filteredData.length} Search Results`;
      if (activeTab === 'all' || activeTab === 'enabled') return `Practice ${filteredData.length} Cards`;
      return `Practice ${filteredData.length} ${activeTab} Cards`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-slate-950 flex flex-col animate-in fade-in duration-200">
        {/* Top Navigation Bar */}
        <div className="h-12 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between px-4 bg-white dark:bg-slate-900 shrink-0">
            <div className="flex items-center gap-2 text-sm text-gray-500">
                 <button onClick={onClose} className="hover:text-gray-900 dark:hover:text-slate-200 flex items-center gap-1">
                     <ArrowLeft size={14}/> Go to "{docTitle}" Document
                 </button>
            </div>
            <div className="flex items-center gap-2">
                 <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded text-gray-500">
                     <X size={18}/>
                 </button>
            </div>
        </div>

        {/* Header Section */}
        <div className="px-6 pt-6 pb-2 bg-gray-50 dark:bg-slate-900/50 shrink-0">
            <div className="flex items-center gap-3 mb-6">
                <FileText className="text-blue-500" size={24}/>
                <h1 className="text-2xl font-bold text-gray-800 dark:text-white select-none">{docTitle}</h1>
            </div>

            <div className="flex flex-col gap-4">
                {/* Controls Row */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 bg-gray-200 dark:bg-slate-800 p-1 rounded-lg">
                        <button className="px-3 py-1.5 bg-white dark:bg-slate-700 rounded-md text-sm font-medium text-gray-800 dark:text-white shadow-sm flex items-center gap-2">
                            {docTitle}
                        </button>
                        <button className="p-1.5 text-gray-500 hover:text-gray-800 dark:hover:text-white rounded">
                            <Tag size={16}/>
                        </button>
                        <button className="p-1.5 text-gray-500 hover:text-gray-800 dark:hover:text-white rounded">
                            <Filter size={16}/>
                        </button>
                        <button className="p-1.5 text-gray-500 hover:text-gray-800 dark:hover:text-white rounded">
                            <Eye size={16}/>
                        </button>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"/>
                            <input 
                                type="text" 
                                placeholder="Search..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 pr-4 py-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-full text-sm outline-none focus:ring-2 focus:ring-blue-500 w-64"
                            />
                        </div>
                        <button 
                            onClick={handlePracticeFiltered}
                            disabled={filteredData.length === 0}
                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-full text-sm font-medium flex items-center gap-2 shadow-sm"
                        >
                            <Play size={14} fill="currentColor"/> 
                            {getPracticeLabel()}
                        </button>
                         <button className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200">
                            <Settings size={18}/>
                        </button>
                    </div>
                </div>

                {/* Tabs Row */}
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2 border-b border-gray-200 dark:border-slate-800">
                    <TabButton id="leech" label="Leech" count={counts.leech} />
                    <TabButton id="struggling" label="Struggling" count={counts.struggling} />
                    <TabButton id="disabled" label="Disabled" count={counts.disabled} />
                    <TabButton id="enabled" label="Enabled" count={counts.enabled} />
                    <TabButton id="new" label="New" count={counts.new} />
                    <div className="w-px h-6 bg-gray-300 dark:bg-slate-700 mx-2"></div>
                     <button 
                        onClick={() => setActiveTab('all')}
                        className={`text-sm font-medium px-2 ${activeTab === 'all' ? 'text-blue-600' : 'text-gray-500'}`}
                     >
                         View All <span className="text-xs opacity-70">({counts.all})</span>
                     </button>
                </div>
            </div>
        </div>

        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-8 py-3 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 text-xs font-bold text-gray-400 uppercase tracking-wider select-none shrink-0">
            <div className="col-span-3">Ancestors</div>
            <div className="col-span-4">Front of the Card</div>
            <div className="col-span-4">Back of the Card</div>
            <div className="col-span-1 text-right flex items-center justify-end gap-2 cursor-pointer hover:text-gray-600" onClick={toggleAll}>
                Select
            </div>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-900 p-4 sm:px-8">
            {filteredData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm italic border border-dashed border-gray-200 dark:border-slate-800 rounded-lg">
                    No cards match this filter.
                </div>
            ) : (
                <div className="space-y-1">
                    {filteredData.map((row) => (
                        <div 
                            key={row.id} 
                            className={`grid grid-cols-12 gap-4 px-4 py-3 rounded-lg border transition-colors items-start text-sm group ${
                                selectedIds.has(row.id) 
                                ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800' 
                                : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-600'
                            }`}
                        >
                            
                            {/* Ancestors */}
                            <div className="col-span-3 flex flex-wrap gap-1 items-center content-start pr-2">
                                <div className="flex flex-wrap items-center gap-1">
                                    <span className="text-gray-400 dark:text-slate-600 font-serif italic text-xs truncate max-w-[120px]">
                                        {docTitle}
                                    </span>
                                    {row.ancestors.length > 0 && <ChevronRight size={10} className="text-gray-300"/>}
                                    {row.ancestors.map((crumb, i) => (
                                        <React.Fragment key={i}>
                                            <span className="text-gray-500 dark:text-slate-400 font-medium text-xs truncate max-w-[100px]" title={crumb}>
                                                {crumb}
                                            </span>
                                            {i < row.ancestors.length - 1 && <ChevronRight size={10} className="text-gray-300"/>}
                                        </React.Fragment>
                                    ))}
                                </div>
                            </div>

                            {/* Front */}
                            <div className="col-span-4 text-gray-800 dark:text-slate-200 leading-relaxed relative pl-6">
                                <div className="absolute left-0 top-0.5 text-gray-300 group-hover:text-gray-400" title={row.type}>
                                    {row.type === 'bidirectional' && <ArrowRightLeft size={14}/>}
                                    {row.type === 'forward' && <ArrowRight size={14}/>}
                                    {row.type === 'cloze' && <Braces size={14}/>}
                                </div>
                                {row.type === 'cloze' ? (
                                    <span dangerouslySetInnerHTML={{ __html: row.front.replace(/\{(.*?)\}/g, "<span class='text-blue-600 font-bold'>{$1}</span>") }} />
                                ) : (
                                    row.front
                                )}
                            </div>

                            {/* Back */}
                            <div className="col-span-4 text-gray-600 dark:text-slate-400 leading-relaxed">
                                {row.type === 'cloze' ? (
                                    <span className="italic text-gray-400 text-xs">Cloze Test</span>
                                ) : (
                                    row.back
                                )}
                                <div className="mt-1 flex gap-2">
                                    {row.lapses > 0 && (
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${row.lapses >= settings.leechThreshold ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
                                            {row.lapses} Lapses
                                        </span>
                                    )}
                                    {row.disabled && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-200 text-gray-600">
                                            Disabled
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Select */}
                            <div className="col-span-1 flex justify-end items-start gap-2">
                                {row.disabled ? (
                                    <button onClick={() => onToggleDisable(row.blockId)} className="p-1 text-xs text-blue-600 hover:bg-blue-50 rounded" title="Enable">Enable</button>
                                ): (
                                     <button onClick={() => onToggleDisable(row.blockId)} className="p-1 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity" title="Disable">Disable</button>
                                )}
                                <input 
                                    type="checkbox" 
                                    checked={selectedIds.has(row.id)}
                                    onChange={() => toggleSelection(row.id)}
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer mt-1"
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
        
        {/* Sticky Footer Actions */}
        {selectedIds.size > 0 && (
            <div className="px-8 py-4 bg-white dark:bg-slate-900 border-t border-blue-100 dark:border-slate-800 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] flex items-center justify-between animate-in slide-in-from-bottom-4 duration-200">
                <div className="text-sm font-medium text-gray-700 dark:text-slate-300">
                    <span className="text-blue-600 font-bold">{selectedIds.size}</span> cards selected
                </div>
                <div className="flex gap-3">
                    <button className="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors text-red-600">
                        Disable Selected
                    </button>
                    <button className="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors text-gray-700 dark:text-slate-200">
                        Reset Progress
                    </button>
                </div>
            </div>
        )}
    </div>
  );
};

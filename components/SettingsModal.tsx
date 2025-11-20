
import React, { useState, useEffect } from 'react';
import { X, Moon, Sun, Clock, ListTree, Timer, Volume2, AlertTriangle } from 'lucide-react';
import { AppSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      setVoices(available.sort((a, b) => a.name.localeCompare(b.name)));
    };
    
    loadVoices();
    // Chrome loads voices asynchronously
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  if (!isOpen) return null;

  const handleIntervalChange = (key: keyof AppSettings['intervals'], value: string) => {
    onUpdateSettings({
      ...settings,
      intervals: {
        ...settings.intervals,
        [key]: value,
      },
    });
  };

  const handleTTSChange = (key: keyof AppSettings['tts'], value: any) => {
      onUpdateSettings({
          ...settings,
          tts: {
              ...settings.tts,
              [key]: value
          }
      });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h2 className="font-bold text-lg text-slate-800 dark:text-white">Settings</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500 dark:text-slate-400">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-8 h-[60vh] overflow-y-auto">
          {/* Appearance */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Appearance</h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300">
                  {settings.darkMode ? <Moon size={20} /> : <Sun size={20} />}
                </div>
                <div>
                  <div className="font-medium text-slate-700 dark:text-slate-200">Dark Mode</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Easier on the eyes at night</div>
                </div>
              </div>
              <button
                onClick={() => onUpdateSettings({ ...settings, darkMode: !settings.darkMode })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.darkMode ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.darkMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Text To Speech */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Volume2 size={14} /> Text to Speech
            </h3>
            
            <div className="space-y-4">
                {/* Enabled Toggle */}
                <div className="flex items-center justify-between">
                    <div className="font-medium text-sm text-slate-700 dark:text-slate-200">Enable TTS</div>
                    <button
                        onClick={() => handleTTSChange('enabled', !settings.tts.enabled)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        settings.tts.enabled ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
                        }`}
                    >
                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${settings.tts.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                </div>

                {/* Autoplay Toggle */}
                <div className="flex items-center justify-between">
                    <div className="font-medium text-sm text-slate-700 dark:text-slate-200">Autoplay Audio</div>
                    <button
                        onClick={() => handleTTSChange('autoplay', !settings.tts.autoplay)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        settings.tts.autoplay ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
                        }`}
                    >
                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${settings.tts.autoplay ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                </div>

                {/* Front Voice */}
                <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Front Card Voice</label>
                    <select 
                        value={settings.tts.frontLang}
                        onChange={(e) => handleTTSChange('frontLang', e.target.value)}
                        className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm outline-none focus:border-blue-500"
                    >
                        <option value="auto">✨ Auto-Detect Language</option>
                        {voices.map(v => (
                            <option key={v.voiceURI} value={v.voiceURI}>
                                {v.name} ({v.lang})
                            </option>
                        ))}
                    </select>
                </div>

                {/* Back Voice */}
                <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Back Card Voice</label>
                    <select 
                        value={settings.tts.backLang}
                        onChange={(e) => handleTTSChange('backLang', e.target.value)}
                        className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm outline-none focus:border-blue-500"
                    >
                        <option value="auto">✨ Auto-Detect Language</option>
                        {voices.map(v => (
                            <option key={v.voiceURI} value={v.voiceURI}>
                                {v.name} ({v.lang})
                            </option>
                        ))}
                    </select>
                </div>
            </div>
          </div>

          {/* Study Settings */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Study Options</h3>
            <div className="space-y-4">
                {/* Hierarchy Toggle */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300">
                        <ListTree size={20} />
                        </div>
                        <div>
                        <div className="font-medium text-slate-700 dark:text-slate-200">Show Hierarchy</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Show parent blocks during study</div>
                        </div>
                    </div>
                    <button
                        onClick={() => onUpdateSettings({ ...settings, showContext: !settings.showContext })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        settings.showContext ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
                        }`}
                    >
                        <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            settings.showContext ? 'translate-x-6' : 'translate-x-1'
                        }`}
                        />
                    </button>
                </div>

                {/* Fail Delay */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300">
                        <Timer size={20} />
                        </div>
                        <div>
                        <div className="font-medium text-slate-700 dark:text-slate-200">Fail/Again Delay</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Delay (ms) before failed card reappears</div>
                        </div>
                    </div>
                    <input 
                        type="number" 
                        min="0"
                        step="500"
                        value={settings.failDelay} 
                        onChange={(e) => onUpdateSettings({...settings, failDelay: parseInt(e.target.value) || 0})}
                        className="w-20 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-right dark:text-white outline-none focus:border-blue-500"
                    />
                </div>

                 {/* Leech Threshold */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300">
                        <AlertTriangle size={20} />
                        </div>
                        <div>
                        <div className="font-medium text-slate-700 dark:text-slate-200">Leech Threshold</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Failures before marking as Leech</div>
                        </div>
                    </div>
                    <input 
                        type="number" 
                        min="1"
                        step="1"
                        value={settings.leechThreshold} 
                        onChange={(e) => onUpdateSettings({...settings, leechThreshold: parseInt(e.target.value) || 5})}
                        className="w-20 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-right dark:text-white outline-none focus:border-blue-500"
                    />
                </div>
            </div>
          </div>

          {/* Spaced Repetition Settings */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
               <Clock size={14} /> Spaced Repetition Intervals
            </h3>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Again (Fail)</label>
                    <input 
                        type="text" 
                        value={settings.intervals.again}
                        onChange={(e) => handleIntervalChange('again', e.target.value)}
                        className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Hard</label>
                    <input 
                        type="text" 
                        value={settings.intervals.hard}
                        onChange={(e) => handleIntervalChange('hard', e.target.value)}
                        className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Good</label>
                    <input 
                        type="text" 
                        value={settings.intervals.good}
                        onChange={(e) => handleIntervalChange('good', e.target.value)}
                        className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Easy</label>
                    <input 
                        type="text" 
                        value={settings.intervals.easy}
                        onChange={(e) => handleIntervalChange('easy', e.target.value)}
                        className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
            </div>
            <p className="mt-2 text-xs text-slate-400">
                Custom text labels for study buttons (e.g., '10m', '3d').
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

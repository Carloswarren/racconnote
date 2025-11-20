
export interface Block {
  id: string;
  content: string;
  level: number; // Indentation level (0, 1, 2...)
  isFlashcard?: boolean;
  parentId?: string | null;
  // Persist SRS data directly on the block
  srsData?: {
    nextReview: number;
    interval: number;
    easeFactor: number;
    repetitions: number;
    lapses?: number; // New: Count of failures
    disabled?: boolean; // New: If card is suspended
  };
}

export interface Document {
  id: string;
  folderId?: string | null; // New: Folder support
  title: string;
  blocks: Block[];
  lastModified: number;
}

export interface Folder {
  id: string;
  name: string;
  isOpen: boolean;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  blockId: string;
  docId: string; // New: To find context
  cardType: 'forward' | 'bidirectional' | 'cloze'; // Added 'cloze'
  status: 'new' | 'learning' | 'review' | 'mastered';
  
  // SRS Fields
  nextReview?: number; // Timestamp
  interval: number; // Days (or minutes for short term)
  easeFactor: number; // Multiplier
  repetitions: number; // Successful reviews in a row
  lapses?: number; // New
  disabled?: boolean; // New
}

export interface Backlink {
  sourceDocId: string;
  sourceDocTitle: string;
  sourceBlockId: string;
  content: string;
}

export enum StudyRating {
  AGAIN = 1,
  HARD = 2,
  GOOD = 3,
  EASY = 4
}

// Specific ratings for "Order" mode as requested
export enum OrderRating {
  TWO_SEC = '2s',
  FIFTEEN_MIN = '15m',
  THIRTY_MIN = '30m',
  ONE_HOUR = '1h'
}

export interface AppSettings {
  darkMode: boolean;
  showContext: boolean; // New: Toggle hierarchy in study
  failDelay: number; // New: Delay in ms for "Again" cards to reappear
  leechThreshold: number; // New: Failures before marking as leech
  intervals: {
    again: string;
    hard: string;
    good: string;
    easy: string;
  };
  tts: {
    enabled: boolean;
    autoplay: boolean;
    frontLang: string; // 'auto' or voiceURI
    backLang: string; // 'auto' or voiceURI
  };
}

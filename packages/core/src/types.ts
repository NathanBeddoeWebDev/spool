export type OverflowMode = 'thread' | 'article';

export interface DraftImage {
  id: string;
  /** Already resized/compressed to fit Bluesky's 1 MB blob limit. */
  blob: Blob;
  alt: string;
  width: number;
  height: number;
}

export interface StrongRef {
  uri: string;
  cid: string;
}

/**
 * Resume state for a thread that failed partway. Record keys are generated
 * up front, so a retry writes to the same keys and never double-posts.
 */
export interface ThreadProgress {
  texts: string[];
  imageGroups: number[][];
  rkeys: string[];
  created: Array<StrongRef | null>;
}

export interface Draft {
  id: string;
  text: string;
  /** Article title. Empty means "derive it". */
  title: string;
  /** Text of the Bluesky post announcing an article. Empty means "derive it". */
  shareText: string;
  images: DraftImage[];
  /** Mode picked for this draft; null falls back to preferences. */
  mode: OverflowMode | null;
  numbering: boolean;
  langs: string[];
  updatedAt: string;
  threadProgress?: ThreadProgress;
  /**
   * Record keys reserved before publishing, so a retry writes to the same
   * keys instead of posting twice. A post uses one; an article uses two
   * (document, then post). Threads keep theirs in `threadProgress`.
   */
  rkeys?: string[];
}

export interface Prefs {
  /** 'ask' shows the chooser whenever a draft overflows. */
  overflowMode: 'ask' | OverflowMode;
  /** Preselected in the chooser: whatever was used last time. */
  lastChoice: OverflowMode;
  numbering: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  overflowMode: 'ask',
  lastChoice: 'thread',
  numbering: false,
};

export interface PrefsStore {
  get(): Promise<Prefs>;
  set(patch: Partial<Prefs>): Promise<Prefs>;
}

export interface DraftStore {
  load(): Promise<Draft | null>;
  save(draft: Draft): Promise<void>;
  clear(): Promise<void>;
}

export function newDraft(partial: Partial<Draft> = {}): Draft {
  return {
    id: crypto.randomUUID(),
    text: '',
    title: '',
    shareText: '',
    images: [],
    mode: null,
    numbering: false,
    langs: [],
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

export type PublishKind = 'post' | OverflowMode;

export type PublishResult =
  | { kind: 'post'; url: string; uri: string }
  | { kind: 'thread'; url: string; uri: string; count: number }
  | { kind: 'article'; url: string; postUrl: string; documentUri: string; postUri: string };

export interface PublishProgress {
  step: string;
  done: number;
  total: number;
}

export interface PublishHooks {
  onProgress?: (p: PublishProgress) => void;
  /** Called after every post in a thread so callers can persist resume state. */
  onThreadProgress?: (p: ThreadProgress) => void | Promise<void>;
}

export type ScheduleStatus = 'scheduled' | 'publishing' | 'published' | 'failed';

export interface ScheduledPost {
  id: string;
  kind: PublishKind;
  /** ISO time the writer picked. */
  publishAt: string;
  /** ISO time of the next attempt, when that's later than publishAt after a failure. */
  retryAt?: string;
  status: ScheduleStatus;
  /** Opening text of the post, or the article's title. */
  summary: string;
  /** Posts in a thread; 1 otherwise. */
  count: number;
  images: number;
  /** Last failure. Set on failed posts, and on scheduled ones waiting to retry. */
  error?: string;
  result?: PublishResult;
}

/**
 * How the composer publishes. The extension publishes straight from the
 * browser; the web app goes through its server, which can also schedule.
 */
export interface Publisher {
  publish(kind: PublishKind, draft: Draft, hooks?: PublishHooks): Promise<PublishResult>;
  /** Absent when this client can't schedule. */
  schedule?(kind: PublishKind, draft: Draft, at: Date): Promise<ScheduledPost>;
}

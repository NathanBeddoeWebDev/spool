import type { PublishProgress, PublishResult, ScheduledPost } from '@spool/core';

export interface Account {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

export interface PageContext {
  url: string;
  title: string;
  selection: string;
}

export type IconName =
  | 'image'
  | 'article'
  | 'thread'
  | 'settings'
  | 'x'
  | 'check'
  | 'external'
  | 'link'
  | 'plus'
  | 'logout'
  | 'chevron'
  | 'alert'
  | 'quote'
  | 'clock';

export type SheetState =
  | { kind: 'publishing'; progress: PublishProgress }
  | { kind: 'done'; result: PublishResult }
  | { kind: 'scheduled'; post: ScheduledPost }
  | { kind: 'error'; message: string; partial?: { done: number; total: number } };

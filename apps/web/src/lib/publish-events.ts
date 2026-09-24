import type { PublishProgress, PublishResult, ThreadProgress } from '@spool/core';

/** One line of the NDJSON stream /api/publish answers with. */
export type PublishEvent =
  | { type: 'progress'; progress: PublishProgress }
  | { type: 'thread'; progress: ThreadProgress }
  | { type: 'done'; result: PublishResult }
  | { type: 'error'; message: string };

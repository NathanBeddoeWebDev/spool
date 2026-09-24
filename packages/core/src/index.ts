// Everything here is cheap to load: the composer imports it before the user
// can type. Code that needs @atproto/api (publishing, the public agent) lives
// behind '@spool/core/publish' and '@spool/core/richtext' so apps can load it lazily.
export * from './types.ts';
export * from './text.ts';
export * from './split.ts';
export * from './records.ts';
export type { BuiltText } from './richtext.ts';
export type { Publication, PublishContext } from './publish.ts';
export { excerpt, extractTitle, markdownToText } from './markdown.ts';
export * from './oauth.ts';
export * from './transport.ts';

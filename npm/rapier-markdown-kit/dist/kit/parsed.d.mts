// SPDX-License-Identifier: MIT
export type Json = null | string | number | boolean | readonly Json[] | {readonly [key: string]: Json};
export type Revision = string | number;
export interface GrammarIdentity {
  readonly id: string;
  readonly options: {readonly [key: string]: Json};
  readonly [key: string]: Json;
}
export interface Utf16Span { readonly start: number; readonly end: number; readonly unit: 'utf16'; }
export interface TokenSpan extends Utf16Span { readonly scope: 'lines'; }
export interface MarkdownTokenInput {
  readonly type: string;
  readonly tag?: string;
  readonly nesting: -1 | 0 | 1;
  readonly level?: number;
  readonly block?: boolean;
  readonly hidden?: boolean;
  readonly content?: string;
  readonly markup?: string;
  readonly info?: string;
  readonly attrs?: unknown;
  readonly meta?: unknown;
  readonly map?: readonly [number, number] | null;
  readonly children?: readonly MarkdownTokenInput[] | null;
}
export interface ParsedMarkdown {
  /** The exact full document, before normalization or front matter removal. */
  readonly source: string;
  readonly revision: Revision;
  /** Includes every option or plugin setting that can change this parse's meaning. */
  readonly grammar: GrammarIdentity;
  readonly complete: true;
  /** The shared front matter owner's body offset; zero if the parser read the full source.
   * Token maps and recorded layout target offsets must be relative to that parsed body. */
  readonly bodyOffset?: number;
  readonly tokens: readonly MarkdownTokenInput[];
  readonly env?: {
    readonly references?: unknown;
    readonly abbreviations?: unknown;
    readonly footnotes?: {readonly list?: readonly {readonly label?: string; readonly count?: number}[]};
  };
}
export interface ProjectedToken {
  readonly type: string;
  readonly tag: string;
  readonly nesting: -1 | 0 | 1;
  readonly level: number | null;
  readonly block: boolean;
  readonly hidden: boolean;
  readonly content: string;
  readonly markup: string;
  readonly info: string;
  readonly attrs: Json;
  readonly meta: Json;
  readonly span: TokenSpan | null;
  readonly children: readonly ProjectedToken[] | null;
}
export interface MarkdownProjection {
  readonly format: 'rapier-parsed/1';
  readonly source: {
    readonly revision: Revision;
    readonly chars: number;
    readonly hash: {readonly algorithm: 'sha256'; readonly encoding: 'utf16le'; readonly value: string};
  };
  readonly grammar: GrammarIdentity;
  readonly body: Utf16Span;
  readonly frontmatter: Utf16Span | null;
  readonly tokens: readonly ProjectedToken[];
  readonly definitions: Json;
  readonly coverage: {readonly tokens: 'complete'; readonly tokenCount: number; readonly spans: 'complete' | 'partial'};
  readonly omissions: readonly {readonly domain: string; readonly reason: string; readonly count?: number}[];
}
/** Project one completed parse. Does not parse again, normalize source, render or admit edits. */
export function projectMarkdown(parsed: ParsedMarkdown): MarkdownProjection;
/** Checks source, revision and grammar binding; does not authenticate an externally supplied projection. */
export function projectionMatches(projection: MarkdownProjection, current: {
  readonly source: string; readonly revision: Revision; readonly grammar: GrammarIdentity;
}): boolean;

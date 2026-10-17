// SPDX-License-Identifier: MIT
// rapier-html: Markdown to one offline HTML file that carries its exact source, and back.
export type Part = 'drawing' | 'math' | 'mermaid';
export type DocKind = 'markdown' | 'text' | 'code';
export interface WrapOptions {
  kind?: DocKind;
  /** The view the page opens on, with the document behind it. */
  view?: 'draw' | 'notes';
  /** An SVG drawing carried beside the document, opened on Draw. */
  drawing?: string;
  drawingName?: string;
  /** The original text (or a page carrying it); the page opens showing the diff. */
  base?: string;
  baseName?: string;
  /** With base: the name and time shown on the diff. */
  by?: string;
  at?: string;
  /** A one-use return URL and its expiry, both from the door's show {target: "return"}. */
  return?: string;
  return_expires_at?: string;
  /** A rapier-ledger/2 history and its authorship projection, verified against the text. */
  ledger?: unknown;
  authorship?: unknown;
}
export interface Unwrapped {
  /** The exact carried source, or null for a page without one. */
  text: string | null;
  name: string | null;
  kind: DocKind | null;
  view: 'draw' | 'notes' | null;
  drawing: string | null;
  drawingName: string | null;
  base: string | null;
  baseName: string | null;
  baseSha256: string | null;
  baseRevision: string | null;
  by: string | null;
  at: string | null;
  return: string | null;
  return_expires_at: string | null;
  ledger: unknown;
  authorship: unknown;
  comparisonBase: unknown;
  html: string;
}
/** Markdown to a page in one call: the editor this package carries, cut to what the document displays with. */
export function writePage(text: string, name?: string, options?: WrapOptions & {include?: Part[]}): Promise<string>;
/** Puts the document into a Rapier page you supply (for example a carry() of the packaged page). */
export function wrap(pageHtml: string, text: string, name?: string, options?: WrapOptions): string;
/** Reads the exact document back out of a page. */
export function unwrap(pageHtml: string): Unwrapped;
/** The page with only the named parts inline. */
export function carry(pageHtml: string, include?: Part[]): string;
/** The parts a document displays with: math, mermaid. */
export function portableNeeds(text: string, options?: {base?: string; flowchart?: (source: string) => boolean}): Part[];
export function encodeCarried(text: string): string;
export function decodeCarried(text: string): string;
/** The command line: rapier-html <document.md> [out.html] [options]. Resolves the written path, or null for --help. */
export function main(argv: string[], pagesDir: string, options?: {log?: (line: string) => void}): Promise<string | null>;

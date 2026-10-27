// SPDX-License-Identifier: MIT
export {};
export interface MarkdownReference {href: string; title: string}
/** Plugins may add their own entries; known references retain their concrete shape. */
export interface MarkdownEnvironment {
  references?: Record<string, MarkdownReference>;
  [name: string | symbol]: unknown;
}
export interface MarkdownToken {
  type: string;
  tag: string;
  nesting: -1 | 0 | 1;
  attrs: [string, string | number][] | null;
  map: [number, number] | null;
  level: number;
  children: MarkdownToken[] | null;
  content: string;
  markup: string;
  info: string;
  meta: Record<string, unknown> | null;
  block: boolean;
  hidden: boolean;
  attrIndex(name: string): number;
  attrPush(attr: [string, string | number]): void;
  attrSet(name: string, value: string | number): void;
  attrGet(name: string): string | number | null;
  attrJoin(name: string, value: string | number): void;
}
export interface MarkdownOptions {
  html?: boolean; xhtmlOut?: boolean; breaks?: boolean; langPrefix?: string;
  linkify?: boolean; typographer?: boolean; quotes?: string | string[]; maxNesting?: number;
  highlight?: ((source: string, language: string, attrs: string) => string) | null;
}
export interface MarkdownCoreState {
  src: string;
  env: MarkdownEnvironment;
  tokens: MarkdownToken[];
  inlineMode: boolean;
  md: MarkdownParser;
}
export interface MarkdownInlineState {
  src: string; env: MarkdownEnvironment; md: MarkdownParser; tokens: MarkdownToken[];
  pos: number; posMax: number; level: number; pending: string; pendingLevel: number;
  push(type: string, tag: string, nesting: -1 | 0 | 1): MarkdownToken;
  pushPending(): MarkdownToken;
}
export interface MarkdownBlockState {
  src: string; env: MarkdownEnvironment; md: MarkdownParser; tokens: MarkdownToken[];
  bMarks: number[]; eMarks: number[]; tShift: number[]; sCount: number[]; bsCount: number[];
  blkIndent: number; line: number; lineMax: number; tight: boolean; listIndent: number;
  parentType: string; level: number;
  push(type: string, tag: string, nesting: -1 | 0 | 1): MarkdownToken;
  getLines(begin: number, end: number, indent: number, keepLastLF: boolean): string;
  isEmpty(line: number): boolean;
}
// A parser may enrich these states. Rules receive the concrete state of their parser.
export type MarkdownCoreRule = {run(state: MarkdownCoreState): void}['run'];
export type MarkdownInlineRule = {run(state: MarkdownInlineState, silent: boolean): boolean}['run'];
export type MarkdownBlockRule = {run(state: MarkdownBlockState, start: number, end: number, silent: boolean): boolean}['run'];
export interface MarkdownRuler<Rule> {
  /** Present on markdown-it at runtime; omitted by some upstream declaration versions. */
  __rules__?: {name: string; fn: Rule; enabled: boolean; alt: string[]}[];
  at(name: string, rule: Rule, options?: {alt: string[]}): void;
  before(before: string, name: string, rule: Rule, options?: {alt: string[]}): void;
  after(after: string, name: string, rule: Rule, options?: {alt: string[]}): void;
  push(name: string, rule: Rule, options?: {alt: string[]}): void;
  getRules(chain: string): Rule[];
}
export type MarkdownRenderRule = {render(tokens: MarkdownToken[], index: number, options: MarkdownOptions,
  env: MarkdownEnvironment, renderer: MarkdownRenderer): string}['render'];
export interface MarkdownRenderer {
  rules: Record<string, MarkdownRenderRule | undefined>;
  rapierTransformHtml?(html: string): string;
  renderToken(tokens: MarkdownToken[], index: number, options: MarkdownOptions): string;
  renderInline(tokens: MarkdownToken[], options: MarkdownOptions, env: MarkdownEnvironment): string;
  renderInlineAsText(tokens: MarkdownToken[], options: MarkdownOptions, env: MarkdownEnvironment): string;
  render(tokens: MarkdownToken[], options: MarkdownOptions, env: MarkdownEnvironment): string;
}
/** The markdown-it instance hooks used by the portable kit. No parser package is required for these types. */
export interface MarkdownParser {
  core: {ruler: MarkdownRuler<MarkdownCoreRule>};
  inline: {
    ruler: MarkdownRuler<MarkdownInlineRule>;
    parse(source: string, parser: MarkdownParser, env: MarkdownEnvironment, tokens: MarkdownToken[]): void;
  };
  block: {ruler: MarkdownRuler<MarkdownBlockRule>};
  renderer: MarkdownRenderer;
  options: MarkdownOptions;
  helpers: {
    parseLinkDestination(source: string, start: number, end: number): {ok: boolean; pos: number; str: string};
    parseLinkLabel(state: MarkdownInlineState, start: number, disableNested?: boolean): number;
  };
  utils: {unescapeAll(source: string): string; escapeHtml(source: string): string; normalizeReference(source: string): string};
  validateLink(url: string): boolean;
  normalizeLink(url: string): string;
  parse(source: string, env: MarkdownEnvironment): MarkdownToken[];
  parseInline(source: string, env: MarkdownEnvironment): MarkdownToken[];
  render(source: string, env?: MarkdownEnvironment): string;
  renderInline(source: string, env?: MarkdownEnvironment): string;
}
/** Direct parser-internal consumers require markdown-it's runtime state constructor and rule records. */
export interface MarkdownParserInternals extends MarkdownParser {
  core: {ruler: MarkdownRuler<MarkdownCoreRule> & {__rules__: {name: string; fn: MarkdownCoreRule; enabled: boolean; alt: string[]}[]}};
  inline: MarkdownParser['inline'] & {
    State: new (source: string, parser: MarkdownParser, env: MarkdownEnvironment, tokens: MarkdownToken[]) => MarkdownInlineState;
    ruler: MarkdownRuler<MarkdownInlineRule> & {__rules__: {name: string; fn: MarkdownInlineRule; enabled: boolean; alt: string[]}[]};
  };
  block: {ruler: MarkdownRuler<MarkdownBlockRule> & {__rules__: {name: string; fn: MarkdownBlockRule; enabled: boolean; alt: string[]}[]}};
}

export const TEXT_COLOR_NAMES: Readonly<{
  green: '#1c7547'; red: '#b32034'; blue: '#175dc4'; gold: '#865818'; purple: '#7924d7';
}>;
export const PAGE_BREAK_MARKER: '<!--md-break:v1 page-->';
export interface FontStack {readonly stack: string; readonly css: string; readonly word: string}
export const FONT_STACKS: Readonly<Record<'sans' | 'serif' | 'mono' | 'system' | 'hand', FontStack>>;
export interface TypographyFamily {readonly name: string; readonly css: string; readonly custom: boolean}
export interface TypographySize {
  readonly css: string;
  readonly unit: 'pt' | 'px';
  readonly value: number;
  readonly points: number;
  readonly halfPoints: number;
}
export interface TypographyStyle {
  readonly size?: string;
  readonly color?: string;
  readonly family?: TypographyFamily;
}
export interface TypographyInput {size?: string; color?: string; family?: string | TypographyFamily}
export interface TypographyChanges {size?: string | null; color?: string | null; family?: string | TypographyFamily | null}
export interface NormalizedTypographyChanges {
  readonly size?: string | null;
  readonly color?: string | null;
  readonly family?: TypographyFamily | null;
}
export interface TypographySourceRange {start: number; innerStart: number; innerEnd: number; end: number; style: TypographyStyle}
export interface TypographyRuns {text: string; paint: TypographyStyle[]; leaves: {start: number; end: number; blocked: boolean}[]}
export interface TypographyGrammar {
  normalizeFontFamily(value: unknown): string | null;
  fontFamilyCss(value: unknown): string;
  FONT_STACKS: Readonly<Record<string, FontStack>>;
}
export interface InlineTypography {
  size(value: unknown): TypographySize | null;
  color(value: unknown): string | null;
  family(value: unknown): TypographyFamily | null;
  familyCss(value: unknown): TypographyFamily | null;
  normalize(value: TypographyInput, removals?: false): TypographyStyle;
  normalize(value: TypographyChanges, removals: true): NormalizedTypographyChanges;
  normalize(value: TypographyInput, removals: boolean): TypographyStyle;
  parseStyle(value: unknown, editable?: false): TypographyStyle;
  parseStyle(value: unknown, editable: boolean): TypographyStyle | null;
  style(value: TypographyInput): string;
  open(value: TypographyInput): string;
  wrap(value: TypographyInput, content: string): string;
  parseOpen(source: string, decode?: (source: string) => string, editable?: boolean): TypographyStyle | null;
  nodeStyle(node: Pick<Element, 'getAttribute'> | null | undefined): TypographyStyle;
  runs(root: Node): TypographyRuns;
  install<P extends MarkdownParser>(parser: P): P;
}
export function normalizeFontFamily(value: unknown): string | null;
export function fontFamilyCss(value: unknown): string;
export function formatFontRun(family: string, content: string): string;
export function formatColorRun(hex: string, content: string): string;
/** This factory configures inline source typography, not DOM paragraph refinement. */
export function createTypography(grammar: TypographyGrammar): Readonly<InlineTypography>;
export const typography: Readonly<InlineTypography>;
export function typographySourceRanges(source: string, parser: MarkdownParser): TypographySourceRange[];

export type InkKind = 'under' | 'strike' | 'ring' | 'bracket' | 'free' | 'arrow' | 'end';
export const INK_KINDS: readonly ['under', 'strike', 'ring', 'bracket', 'free', 'arrow', 'end'];
export const INK_CLOSE: '<!--/ink-->';
export const INK_PATH_MAX: 160;
export const INK_INT_MAX: 999999;
export const INK_OPEN_PATTERN: string;
export type InkPoint = readonly [number, number];
interface InkStroke {
  hex?: string | null;
  width?: number | null;
  box?: InkPoint | null;
  at?: InkPoint | null;
}
export type InkInput =
  | (InkStroke & {kind: 'under' | 'strike'; id?: never; path?: readonly InkPoint[] | null})
  | (InkStroke & {kind: 'ring' | 'bracket' | 'free'; id?: never; path: readonly [InkPoint, ...InkPoint[]]})
  | (InkStroke & {kind: 'arrow'; id: number; path?: readonly InkPoint[] | null})
  | {kind: 'end'; id: number; hex?: null; width?: null; box?: null; at?: null; path?: readonly [] | null};
interface ParsedInkStroke {
  readonly hex: string | null;
  readonly width?: number;
  readonly box: [number, number] | null;
  readonly at: [number, number] | null;
}
export type ParsedInk =
  | (ParsedInkStroke & {readonly kind: 'under' | 'strike'; readonly id?: never; readonly path: [number, number][]})
  | (ParsedInkStroke & {readonly kind: 'ring' | 'bracket' | 'free'; readonly id?: never; readonly path: [[number, number], ...[number, number][]]})
  | (ParsedInkStroke & {readonly kind: 'arrow'; readonly id: number; readonly path: [number, number][]})
  | {readonly kind: 'end'; readonly id: number; readonly hex: null; readonly width?: never;
      readonly box: null; readonly at: null; readonly path: []};
export function readInkMatch(match: RegExpMatchArray): Readonly<ParsedInk> | null;
export function parseInkOpen(comment: string): Readonly<ParsedInk> | null;
export function parseInkBody(body: string): Readonly<ParsedInk> | null;
export function formatInkOpen(mark: InkInput): string;
export function formatInkRun(mark: InkInput, content: string): string;
export function matchInkOpen(text: string): {mark: Readonly<ParsedInk>; length: number} | null;
export function inkOpenBody(opener: string): string | null;
export function formatInkOpenFromBody(body: string): string | null;
export function isInkClose(comment: unknown): boolean;
export interface InkSourceView {
  readonly length: number;
  contains(value: string): boolean;
  readSlice(start: number, end: number): string;
}
export interface InkEdit {pos: number; removed: string; inserted: string}
export function mayRetireInk(source: InkSourceView, rows: readonly InkEdit[]): boolean;
export type InkMarker =
  | {start: number; end: number; mark: Readonly<ParsedInk>; close: false}
  | {start: number; end: number; mark: null; close: true; arrowId?: number};
export interface InkRun {start: number; end: number; innerStart: number; innerEnd: number; mark: Readonly<ParsedInk>}
export interface InkSpanPairs {runs: InkRun[]; strays: InkMarker[]}
export interface InkArrow {
  id: number;
  tail: Omit<InkRun, 'mark'> & {mark: Extract<ParsedInk, {kind: 'arrow'}>};
  head: Omit<InkRun, 'mark'> & {mark: Extract<ParsedInk, {kind: 'end'}>};
}
export interface InkPairs extends InkSpanPairs {arrows: InkArrow[]}
export function scanInkMarkers(source: string): InkMarker[];
export function pairInkMarkers(source: string, markers?: readonly InkMarker[] | null): InkPairs;
export function pairInkSpans(source: string, markers?: readonly InkMarker[] | null): InkSpanPairs;
export function pairMarkers(source: string, kind: 'ink', markers?: readonly InkMarker[] | null): InkPairs;
export function quotedWillSpan(source: string, spans: readonly (readonly [number, number])[]): {
  start: number; end: number; where: 'fence' | 'raw-pre' | 'raw-div' | 'raw-table' | 'raw-html' | 'frontmatter';
} | null;
export function sliceInkArrows(source: string, start?: number, end?: number, markers?: readonly InkMarker[] | null): string;
export function prepareInkPaste(source: string, existing?: string, markers?: readonly InkMarker[] | null): string;
export function stripInkMarkers(text: string): string;
export function hasInkMarker(text: string): boolean;
export function formatPageBreak(): typeof PAGE_BREAK_MARKER;
export function isPageBreakLine(text: unknown): boolean;
export function isPageBreakBlock(text: unknown): boolean;

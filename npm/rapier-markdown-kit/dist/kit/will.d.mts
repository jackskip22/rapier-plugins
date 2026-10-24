// SPDX-License-Identifier: MIT
// Will/1: permissions a Markdown document gives agents, as HTML comments on their own lines.
//   <!-- will/1 keep -->  ...  <!-- /will -->     keep: no change; append: add after the region's text only; edit: any change
export type WillLaw = 'keep' | 'append' | 'edit';
export type WillFault = 'malformed_marker' | 'unpaired_marker';
/** A paired region; `start` to `end` is its text between the marker lines (UTF-16 offsets). */
export interface WillRegion {
  index: number; law: WillLaw; intent: string | null;
  openerLine: number; openerStart: number; openerEnd: number; openerContentEnd: number;
  closerLine: number; closerStart: number; closerEnd: number;
  start: number; end: number;
}
export interface WillMarker { kind: 'open' | 'close' | 'near'; law: WillLaw | ''; intent: string | null; content: string; fault?: WillFault; line?: number; start?: number; end?: number; contentEnd?: number; }
export interface Will {
  /** True when the text has any marker line. */
  present: boolean;
  /** The first fault, or ''. A document with a fault is all keep. */
  fault: WillFault | '';
  faults: {mode: WillFault; line: number; start: number; end: number}[];
  /** Every marker line, as [start, end) with its terminator. */
  blocks: {start: number; end: number}[];
  markers: WillMarker[];
  regions: WillRegion[];
  text: string;
}
/** A quick test for any marker line. */
export function hasWillMarkers(text: string): boolean;
export function parseWill(text: string): Will;
/** The law over [start, end): 'keep' when a fault, a marker or a keep region is touched; 'append' inside an append region; else 'edit'. */
export function willGovern(will: Will, start: number, end: number): WillLaw;
/** The regions [start, end) touches (an empty range: the regions it stands in). */
export function willRegionsIn(will: Will, start: number, end: number): WillRegion[];
/** The region or marker line [start, end) touches, or null. */
export function willTouchesMarker(will: Will, start: number, end: number): WillRegion | {law: 'keep'} | null;
/** The intent words of the one region wholly containing [start, end), or ''. */
export function willIntentOf(will: Will, start: number, end: number): string;
/** Reads one line as a marker, or null. */
export function willMarkerOf(line: string): WillMarker | null;
/** The width of a line terminator ending at `last` (char code), with `prior` before it: 0, 1 or 2. */
export function terminatorWidth(last: number, prior: number): number;
/** The text without one trailing line terminator. */
export function stripOneTerminator(text: string): string;
/** Judges sequential UTF-16 source splices, including the resulting marker identities and protected text. */
export function evaluateWill(beforeText: string, splices: {pos: number; removed: string; inserted: string}[]):
  {outcome: 'applied'} | {outcome: 'invalid' | 'refused'; reason: string; rule: string; law?: WillLaw; region?: number};

// SPDX-License-Identifier: MIT
import type {Layout} from './layout.mjs';
export {};

export interface RichTextItem {
  text: string;
  font: string;
  letterSpacing?: number;
  extraWidth?: number;
  break?: 'normal' | 'never';
  hyphenate?: boolean;
  width?: never;
}
export interface RichBoxItem {width: number; text?: never}
export type RichItem = RichTextItem | RichBoxItem;
export interface PreparationOptions {
  whiteSpace?: 'normal' | 'pre-wrap';
  wordBreak?: 'normal' | 'keep-all';
  language?: string;
  policy?: 'wrap' | 'paragraph';
  hanging?: boolean;
  paragraphBreaks?: readonly number[] | null;
}
declare const preparedInline: unique symbol;
declare const preparedParagraph: unique symbol;
/** Opaque measured source. Retain the handle rather than cloning or serializing it. */
export interface PreparedRichParagraph {readonly [preparedInline]: true}
/** Paragraph-fit geometry is distinct from the inline engine's handle. */
export interface ParagraphGeometry {readonly [preparedParagraph]: true}
export type PreparedHandle = PreparedRichParagraph | ParagraphGeometry;
type WrapPreparation = PreparationOptions & {policy?: 'wrap'};
type ParagraphPreparation = PreparationOptions & {policy: 'paragraph'};
/** Cancellation with return() publishes no handle or plan. */
export interface PreparationWork<T> extends IterableIterator<void, T | null | undefined, void> {
  return(value?: T | null): IteratorReturnResult<T | null | undefined>;
}
export type PreparationSteps = PreparationWork<PreparedHandle>;
export interface FitWidthRequest {segment: number; word: number; from: number; to: number}
export type ReadKnownWidth = (request: FitWidthRequest) => number | undefined;
export type FitWork<P> = Generator<FitWidthRequest | null, P | null, number | undefined>;
export type FrozenFitPlan<P extends {lines: object[]}> = Readonly<Omit<P, 'lines'>> & {
  readonly lines: readonly Readonly<P['lines'][number]>[];
};
export interface PreparationScope {
  prepare(owner: object, items: readonly RichItem[], options: ParagraphPreparation): ParagraphGeometry | null;
  prepare(owner: object, items: readonly RichItem[], options?: WrapPreparation): PreparedRichParagraph | null;
  prepare(owner: object, items: readonly RichItem[], options: PreparationOptions): PreparedHandle | null;
  prepareSteps(owner: object, items: readonly RichItem[], options: ParagraphPreparation): PreparationWork<ParagraphGeometry>;
  prepareSteps(owner: object, items: readonly RichItem[], options?: WrapPreparation): PreparationWork<PreparedRichParagraph>;
  prepareSteps(owner: object, items: readonly RichItem[], options: PreparationOptions): PreparationSteps;
  fit<P extends {lines: object[]}>(owner: object, handle: ParagraphGeometry,
    createWork: (readKnown: ReadKnownWidth) => FitWork<P>): FrozenFitPlan<P> | null;
  fitSteps<P extends {lines: object[]}>(owner: object, handle: ParagraphGeometry,
    createWork: (readKnown: ReadKnownWidth) => FitWork<P>): PreparationWork<FrozenFitPlan<P>>;
  current(handle: PreparedHandle | null | undefined): boolean;
  invalidateFonts(): number;
  forget(owner: object): void;
  retire(options?: {documentChanged?: boolean}): void;
}
export function createPreparationScope(document?: Document | null): PreparationScope;
export function prepareRichParagraph(items: readonly RichItem[], options: ParagraphPreparation): ParagraphGeometry | null;
export function prepareRichParagraph(items: readonly RichItem[], options?: WrapPreparation): PreparedRichParagraph | null;
export function prepareRichParagraph(items: readonly RichItem[], options: PreparationOptions): PreparedHandle | null;
export function captureFontAuthority(document?: Document | null): number;
export function invalidateRichMetrics(document?: Document | null): number;
/** Unsupported properties are accepted as input and return false, without changing the source. */
export interface RichStyle {
  writingMode?: string; direction?: string; unicodeBidi?: string; textTransform?: string;
  fontKerning?: string; fontOpticalSizing?: string; fontStretch?: string; fontSizeAdjust?: string;
  textRendering?: string; verticalAlign?: string; whiteSpace?: string; wordBreak?: string;
  hyphens?: string; lineBreak?: string; hangingPunctuation?: string; tabSize?: string;
  textWrapStyle?: string; fontFeatureSettings?: string; fontVariationSettings?: string;
  fontVariant?: string; fontVariantLigatures?: string; fontVariantCaps?: string;
  fontVariantNumeric?: string; fontVariantEastAsian?: string; fontVariantPosition?: string;
  fontVariantAlternates?: string; fontSynthesis?: string; fontSynthesisWeight?: string;
  fontSynthesisStyle?: string; fontSynthesisSmallCaps?: string; letterSpacing?: string; wordSpacing?: string;
}
export function supportsRichStyle(style: RichStyle | null | undefined, contentLanguage?: string): boolean;

declare const richCursor: unique symbol;
declare const fragmentCursor: unique symbol;
export interface RichInlineCursor {readonly [richCursor]: true}
export interface RichFragmentCursor {readonly [fragmentCursor]: true}
export interface RichInlineFragmentRange {
  itemIndex: number;
  gapBefore: number;
  gapItemIndex: number;
  occupiedWidth: number;
  start: RichFragmentCursor;
  end: RichFragmentCursor;
}
export interface RichInlineLineRange {
  fragments: RichInlineFragmentRange[];
  width: number;
  end: RichInlineCursor;
}
export interface FlowFragment {
  itemIndex: number;
  sourceStart: number;
  sourceEnd: number;
  gapBefore: number;
  gapItemIndex: number;
  occupiedWidth: number;
}
export interface MaterializedFragment extends FlowFragment {
  text: string;
}
export interface MaterializedLine {
  fragments: MaterializedFragment[];
  width: number;
  end: RichInlineCursor;
}
export function layoutNextRichInlineLineRange(prepared: PreparedRichParagraph, maxWidth: number,
  start?: RichInlineCursor): RichInlineLineRange | null;
export function materializeRichInlineLineRange(prepared: PreparedRichParagraph, line: RichInlineLineRange): MaterializedLine;
export interface MappedFragment {text: string; offsets: number[]; start: number; end: number}
export type MappableFragment = {sourceStart: number; sourceEnd: number} & (
  {text: string; derive?: false} | {derive: true; glyph?: string}
);
export function mapFragment(run: string | {raw: string; break?: 'normal' | 'never'}, fragment: MappableFragment,
  options?: {whiteSpace?: 'normal' | 'pre-wrap'}): MappedFragment | null;

export interface LineMetrics {line: number; cap: number; capTop: number}
export interface FontMeasurementAuthority {
  captureFontAuthority(document: Document): number;
  fontReady(document: Document, font: string, text: string): boolean;
}
export function createLineMeasurer(authority?: FontMeasurementAuthority | null): (element: Element | null | undefined) => LineMetrics | null;
export function lineMetrics(element: Element | null | undefined): LineMetrics | null;
export function linesHeight(lines: number, metrics: Pick<LineMetrics, 'line' | 'cap'> | null | undefined): number | null;
export interface PictureBox {x: number; width: number; height: number}
export interface Rect extends PictureBox {y: number}
export function linesSlices<T extends Rect>(slices: readonly T[], layout: Layout | null | undefined,
  metrics: LineMetrics | null | undefined, y: number, height: number): T[] | readonly T[];
export function linesTop(layout: Layout | null | undefined, metrics: LineMetrics | null | undefined): number;
export function imageBox(columnWidth: number, naturalWidth: number, naturalHeight: number, layout?: Layout,
  defaultWidth?: number, metrics?: LineMetrics | null): PictureBox | null;
export interface ReservedRaster {
  fit: PictureBox;
  reserved: PictureBox;
  visualDeltaX: number;
  visualDeltaY: number;
}
export function rasterReserved(columnWidth: number, unrotated: PictureBox | null, rad: number): ReservedRaster | null;
export type ProfileSpan = readonly [number, number];
export interface SpanProfile {
  spanAt(t: number): ProfileSpan | null;
  runsAt?(t: number): readonly ProfileSpan[] | null;
}
export type ShapeProfile = SpanProfile | {runsAt(t: number): readonly ProfileSpan[] | null; spanAt?(t: number): ProfileSpan | null};
export interface RunProfile extends SpanProfile {runsAt(t: number): readonly ProfileSpan[]}
export function alphaProfile(image: HTMLImageElement): RunProfile | null;
export function polygonProfile(corners: readonly ProfileSpan[]): SpanProfile;
export function rotatedBoundsRad(width: number, height: number, rad: number): {width: number; height: number};
export function rasterTiltProfile(width: number, height: number, rad: number): SpanProfile;
export function rotatedRasterAlpha(baseAlpha: RunProfile | null, width: number, height: number, rad: number): RunProfile | null;
export function bandsProfile(bands: readonly (readonly ProfileSpan[])[]): RunProfile | null;
export function serializeProfile(profile: ShapeProfile | null | undefined, count?: number): string;
export function parseProfile(text: string): RunProfile | null;
export function frameScale(element: Element | null | undefined): number;
export function pictureSlices(profile: ShapeProfile | null, x: number, y: number, width: number, height: number, scale?: number): Rect[];
export function besideSlices<T extends Rect>(slices: readonly T[], columnLeft: number, columnRight: number,
  pictureLeft: number, pictureWidth: number): readonly T[];
export interface BandSlot {x: number; width: number}
export interface FlowSlot extends BandSlot {y: number; block?: number; channel?: number}
export type SlotsForBand = (width: number, obstacles: readonly Rect[], top: number, height: number, minWidth?: number) => BandSlot[] | null;
export const slotsForBand: SlotsForBand;
export interface SlotSequenceResult {slots: FlowSlot[]; end: number; multiple: boolean}
export type SlotSequence = (width: number, top: number, obstacles: readonly Rect[], lineHeight: number,
  minWidth: number, slotsForBand: SlotsForBand, direction?: 'ltr' | 'rtl', order?: 'columns' | 'rows') => SlotSequenceResult | null;
export const slotSequence: SlotSequence;
export function columnsFilled(slots: readonly FlowSlot[], placed: readonly FlowSlot[]): boolean;
export type FlowLine<F extends FlowFragment = MaterializedFragment> = FlowSlot & {fragments: F[]} &
  (F extends MaterializedFragment ? {end: RichInlineCursor} : {wordSpacing: number});
export interface FlowPlan<F extends FlowFragment = MaterializedFragment> {lines: FlowLine<F>[]; height: number}
export function flowLines(flow: PreparedRichParagraph, width: number, top: number, obstacles: readonly Rect[],
  lineHeight: number, minWidth: number, direction?: 'ltr' | 'rtl', balance?: number,
  align?: 'start' | 'end' | 'left' | 'right' | 'center' | 'justify'): FlowPlan | null;
export interface WrapShape {boxWidth: number; boxHeight: number; startY: number; points: [number, number][]}
export function wrapShape(side: 'left' | 'right', obstacles: readonly Rect[], width: number, top: number): WrapShape | null;
export function boxClearance(obstacles: readonly Rect[], width: number, top: number, height: number,
  floor: number): {left: number; right: number; fits: boolean} | null;
export interface EdgeLine {block: Element; top: number; bottom: number; start: number; content: number}
export function edgeLines(root: Element, skip?: (text: Text) => boolean): EdgeLine[];
export interface EdgeMarks {
  markers: {item: Element; shift: number}[];
  bars: {quote: Element; runs: {shift: number; top: number; bottom: number}[]}[];
  steps: Element[];
}
export function edgeMarks(root: Element, before: readonly EdgeLine[], skip?: (text: Text) => boolean): EdgeMarks;
export function imageOnly(paragraph: Node, image: Node): boolean;

// SPDX-License-Identifier: MIT
import type {RichTextItem, PreparationOptions, Rect, SlotsForBand, SlotSequence, FlowPlan,
  FlowFragment, FlowSlot} from './model.mjs';

export interface TypographyApplyResult {
  changed: number;
  released: number;
  pending: boolean;
  prepared: number;
}
export interface InitialRange {start: number; end: number; text: string}
export interface TypographySlotInput {
  width: number;
  top: number;
  obstacles: readonly Rect[];
  lineHeight: number;
  minWidth: number;
  slotsForBand: SlotsForBand;
  slotSequence: SlotSequence;
  columnsFilled(slots: readonly FlowSlot[], placed: readonly FlowSlot[]): boolean;
  justify: boolean;
  hyphenate: boolean;
}
export interface DerivedFlowFragment extends FlowFragment {
  derive: true;
  glyph?: string;
}
export interface TypographyController {
  /** Pending work requires a subsequent call after the host yields. */
  apply(root: Element | Document | DocumentFragment, options?: {all?: boolean; editing?: boolean}): TypographyApplyResult;
  clear(root: Element | Document | DocumentFragment, options?: {forget?: boolean; keepSelection?: boolean}): void;
  clearSelection(root: Element | Document | DocumentFragment): number;
  firstLineEnd(paragraph: Element | null | undefined): number | null;
  initialRange(input: string | Pick<Node, 'textContent'> | null | undefined): InitialRange | null;
  protectInitial(root: Element | Document | DocumentFragment): void;
  invalidateFonts(document?: Document | null): number;
  retire(root: Element | Document | DocumentFragment, options?: {documentChanged?: boolean}): void;
  slotPlan(paragraph: Element, items: readonly RichTextItem[],
    options: Pick<PreparationOptions, 'language' | 'wordBreak'>, input: TypographySlotInput): FlowPlan<DerivedFlowFragment> | null;
}
/** Creates an independent disposable DOM projection owner; it never changes Markdown source. */
export function createTypography(): TypographyController;

// SPDX-License-Identifier: MIT
export {};
export type Alignment = 'left' | 'center' | 'right' | 'justify';
export type Wrap = 'around' | 'beside' | 'box' | 'behind' | 'front';
export type LineSpacing = number | `${number}pt` | `${number}pt+`;
export interface TextLayout {
  first?: number;
  indent?: number;
  marker?: number;
  hyphens?: 'auto';
  caps?: 'small';
  hanging?: 'on';
  before?: number;
  after?: number;
  line?: LineSpacing;
}
interface LayoutFacts extends TextLayout {
  rotate?: number;
  opacity?: number;
  lock?: 'on';
}
type LayoutSize = {width?: number; lines?: never} | {lines?: number; width?: never};
type LayoutPosition =
  | {align?: Alignment; wrap?: never; x?: never; y?: never}
  | {align?: never; wrap: Wrap; x?: number; y?: number}
  | {align?: never; wrap?: never; width: number; x?: number; y?: never};
/** Numeric bounds and precision are checked by validLayout and formatLayout. */
export type Layout = LayoutFacts & LayoutSize & LayoutPosition;
export type LayoutField = 'align' | 'width' | 'lines' | 'wrap' | 'x' | 'y' | 'rotate' | 'opacity' |
  'first' | 'indent' | 'marker' | 'lock' | 'hyphens' | 'caps' | 'hanging' | 'before' | 'after' | 'line';
export const fields: Set<LayoutField>;
export const SPACING_FIELDS: readonly ['before', 'after', 'line'];
export const alignments: Set<Alignment>;
export const wraps: Set<Wrap>;
export const INDENT_LIMIT: 64;
export function indentLevel(value: unknown): value is number;
export function stepIndent(value: number | null | undefined, step: number): number;
export function validLayout(value: unknown): value is Layout;
export function parseLayout(comment: string): Layout | null;
export function decodeLayoutAttribute(value: string | null | undefined): string;
export function parseLayoutAttribute(value: string | null | undefined): Layout | null;
export function textStyle(value: Layout, options?: {portable?: boolean; pointSize?: number; indentOffset?: number}): string;
export function textLayout(style: CSSStyleDeclaration | Readonly<Record<string, string>> | null | undefined,
  options?: {listMarker?: boolean; pointSize?: number; offset?: number}): TextLayout;
export function imageStyle(value: Layout): string;
export function linesHeightCss(lines: number): string;
export interface ObjectSizeAttributes {
  height?: number | `${number}` | 'auto';
  viewport?: `${number}x${number}`;
  resize?: 'scale' | 'reflow';
}
export function objectHeight(width: number, naturalHeight: number, attrs: ObjectSizeAttributes, line: number): number;
export function wrapTextBlock<T extends Element>(element: T | null | undefined): T | null;
export type WrapClassification<Stop> = string | false | null | undefined | {stop: Stop};
export function wrapNeighbour<T extends Element, Stop = T | null>(node: T,
  classify: (node: Element) => WrapClassification<Stop>): Element | Stop | null;
export function wrapNeighbour<T, Stop = T | null>(node: T,
  classify: (node: T) => WrapClassification<Stop>, step: (node: T, direction: 1 | -1) => T | null | undefined): T | Stop | null;
export function wrapColumnFloor(fontSize: number | null | undefined): number;
/** Throws TypeError when the supplied values do not belong to the closed v1 grammar. */
export function formatLayout(value: Layout): string;

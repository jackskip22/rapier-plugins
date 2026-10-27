// SPDX-License-Identifier: MIT
import type {MarkdownParser} from './marks.mjs';
import type {Splice} from './ledger.mjs';

/** A parser instance or a factory for the caller's Markdown grammar. */
export type ParserFactory = MarkdownParser | ((options: {html: boolean; maxNesting: number}) => MarkdownParser);
export interface ImageDefinition { href: string; title: string; }
export type ImageCodec = 'image/jxl' | 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'image/svg+xml';
export interface DataImage {
  codec: ImageCodec;
  byteLength: number;
  /** UTF-16 offset within the data URL. */
  payloadStart: number;
  encoding?: 'percent';
}
export interface AssetBlock {
  id: string;
  label: string;
  source: string;
  url: string;
  title: string;
  start: number;
  end: number;
  codec: ImageCodec;
  byteLength: number;
  encoding?: 'percent';
  urlStart: number | null;
  urlEnd: number | null;
  payloadStart: number | null;
  payloadEnd: number | null;
  status: 'unverified' | 'asset_count_limit';
  active: boolean;
  topLevel: boolean;
}
export interface AssetIndex {
  assets: Map<string, AssetBlock>;
  blocks: AssetBlock[];
  duplicateLabels: Set<string>;
  appendixStart: number;
  references: Record<string, ImageDefinition>;
}
export interface PackedAssetIndex {
  blocks: (Omit<AssetBlock, 'source' | 'url'> & {url?: string})[];
  references: Record<string, ImageDefinition | {row: number; title: string}>;
  duplicateLabels: string[];
  appendixStart: number;
}
export interface ImageProjection {
  source: string;
  records: {start: number; end: number; id: string; codec: ImageCodec; payload: string; url: string}[];
  references: Record<string, ImageDefinition>;
}
export interface AssetInput {label: string; url: string; title?: string;}
export interface AddressedAsset extends AssetInput {id: string;}
export interface AssetAppend {
  source: string;
  id: string;
  reference: string;
  added: boolean;
  suffix: string;
}
export interface AssetOmission {
  start: number;
  end: number;
  chars: number;
  domain: 'image_bytes';
  reason: 'embedded_asset';
  profile: 'embedded';
  type: string;
  bytes: number | null;
}
export interface AssetSourceStore {
  readonly length: number;
  contains(text: string, ignoreCase?: boolean): boolean;
  readSlice(start: number, end: number): string;
  read(): string;
}
export const IMAGE_LIMITS: Readonly<{bytes: number; sourceChars: number; dimension: number; pixels: number; assets: number}>;
/** Sets the default parser and opening-front-matter splitter for this module instance. */
export function configureParser(parser: ParserFactory | null, split?: ((source: string) => {bodyOffset: number}) | null): void;
export function normalizeLabel(label: unknown): string;
export function assetTitle(value: unknown): string;
export function installMarkdownImages<T extends MarkdownParser>(md: T): T;
export function markdownParser(factory?: ParserFactory): MarkdownParser;
export function markdownBodyOffset(source: string): number;
/** Inspects the URL spelling; does not decode or validate its image pixels. */
export function dataImage(url: unknown): DataImage | null;
export function parseAssets(source: string, factory?: ParserFactory, bodyOffset?: number): AssetIndex;
export function documentAssets(source: string, factory?: ParserFactory): AssetIndex;
export function packAssetIndex(index: AssetIndex, offset?: number): PackedAssetIndex;
/** Restores a packet from a trusted parse of this exact source. It is not input validation. */
export function restoreAssetIndex(source: string, packet: PackedAssetIndex, options?: {offset?: number; bodyOffset?: number; factory?: ParserFactory}): AssetIndex;
export function projectImageDefinitions(source: string, index: AssetIndex): ImageProjection;
export function blockwiseAssets<T extends {start: number; raw: string}>(source: string, rows: T[], parse?: (raw: string, row: T) => AssetIndex, bodyOffset?: number): AssetIndex | null;
export function imageEnvironment(source: string, factory?: ParserFactory): {references: Record<string, ImageDefinition>};
/** Uncertainty retains the definition: a parser failure returns true. */
export function referenceOccurs(source: string, id: string, factory?: ParserFactory): boolean;
export function mayRetireImageDefinitions(source: string | AssetSourceStore, splices: Splice[], factory?: ParserFactory, hint?: {excluded?: {start: number; end: number}}): boolean;
export function retireDeletedImageDefinitions(before: string, after: string, splices: Splice[], factory?: ParserFactory): Splice[];
export function assetOmissions(source: string): AssetOmission[];
export function isAssetBlock(raw: string): boolean;
export function escapeImageAlt(value: unknown): string;
export function serializeAsset(asset: AssetInput): string;
/** Appends or reuses an exact image definition; throws on conflicting labels or limits. */
export function appendAssetText(source: string, asset: AddressedAsset, lineEnding?: '\n' | '\r\n' | '\r', options?: {preserveLabel?: boolean}): AssetAppend;
export function appendAsset(source: string, asset: AddressedAsset): Promise<AssetAppend>;

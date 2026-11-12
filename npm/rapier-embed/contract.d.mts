// SPDX-License-Identifier: MIT
// The host's optional policy, file picker and picture exchange (rapier-embed/contract).
export type Feature = 'draw' | 'paint' | 'notes' | 'readAloud' | 'share' | 'find';
export type Accent = 'Teal' | 'Blue' | 'Amber' | 'Green' | 'Red' | 'Purple' | 'Pink' | 'Gray';
export type AssetType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'image/jxl' | 'image/svg+xml';
export interface Limits { readonly documentBytes: number; readonly pictureBytes: number; }
export const FEATURES: readonly Feature[];
/** The ceilings: 64 MiB of UTF-8 document text and 16 MiB of encoded picture bytes. */
export const LIMITS: Limits;
export const ASSET_TYPES: readonly AssetType[];
/** Every refusal is an Error with a code. */
export interface Refusal extends Error { code: string; }
export function refusal(code: string, reason?: string): Refusal;
/** A refusal of any error type (TypeError for a bad option) with its code. */
export function coded<T extends ErrorConstructor>(code: string, Type: T, message: string): InstanceType<T> & {code: string};
/** A session's settings. Absent features mean everything the build has; an empty list means none. */
export interface Settings {
  features?: Feature[];
  /** A BCP 47 tag; this release carries English, and another tag falls back to `en`. */
  language?: string;
  /** Positive integer byte counts, clamped to LIMITS. */
  limits?: Partial<Limits>;
  palette?: {accent: Accent};
}
export interface AcceptedSettings {
  readonly features: readonly Feature[];
  readonly language: string;
  readonly limits: Limits;
  readonly palette?: {readonly accent: Accent};
}
/** Throws a Refusal (`settings_*`) for an unknown or malformed field. */
export function normalizeSettings(value?: Settings, policy?: {features?: readonly Feature[]; accents?: readonly Accent[]; languages?: readonly string[]; limits?: Limits}): AcceptedSettings;
/** The fields the host offered, normalized and frozen; undefined stays undefined. */
export function snapshotSettings(value: Settings | undefined): Readonly<Partial<AcceptedSettings>> | undefined;
/** Opens the device's file chooser; resolves null when canceled or aborted. */
export function pickDeviceFile(document: Document, signal?: AbortSignal): Promise<File | null>;
export interface FilePickerSnapshot {
  port: unknown;
  portGeneration: unknown;
  baseRevision: number | string | null;
  timer?: ReturnType<typeof setTimeout>;
  reading?: boolean;
  committing?: boolean;
}
/** Ticket-owned fields replace or widen snapshot fields as the picker advances. */
export type FilePickerPending<Snapshot extends FilePickerSnapshot = FilePickerSnapshot> =
  Omit<Snapshot, 'requestId' | 'controller' | 'started' | 'host' | 'timer' | 'reading' | 'committing'> & {
    requestId: string;
    controller: AbortController;
    started(value: boolean): void;
    host: boolean;
    timer?: ReturnType<typeof setTimeout>;
    reading?: boolean;
    committing?: boolean;
  };
export type FilePickerReply = {requestId: string; baseRevision: number | string | null} & (
  {type: 'open-ack'; payload?: Record<string, never>} |
  {type: 'open-result'; payload: {file: File | null}} |
  {type: 'open-nack'; payload: {code: string; reason: string}}
);
export interface FilePickerPorts<Snapshot extends FilePickerSnapshot = FilePickerSnapshot> {
  document: Document;
  refusal(): string | null | undefined;
  snapshot(): Snapshot;
  current(row: FilePickerPending<Snapshot>): boolean;
  settle(): boolean;
  post(type: 'open-request' | 'open-cancel', payload: Record<string, never>, requestId: string, baseRevision: number | string | null): boolean;
  /** The picker awaits completion but does not use the returned value. */
  open(file: File, row: FilePickerPending<Snapshot>): unknown;
  notify(code: string): void;
  error(failure: unknown): void;
}
export interface FilePicker<Snapshot extends FilePickerSnapshot = FilePickerSnapshot> {
  pending: FilePickerPending<Snapshot> | null;
  refusal(): string | null | undefined;
  current(row: FilePickerPending<Snapshot> | null | undefined): boolean;
  check(): void;
  cancel(code?: string, tellHost?: boolean): void;
  begin(event?: Pick<Event, 'isTrusted'> | null): false | Promise<boolean>;
  answer(data: FilePickerReply): string;
  selected(file: File | null, row: FilePickerPending<Snapshot>): Promise<void>;
}
/** The page's open-file exchange, not a mount option. Call methods on the returned picker. */
export function createFilePicker<Snapshot extends FilePickerSnapshot>(ports: FilePickerPorts<Snapshot>): FilePicker<Snapshot>;
/** An absolute HTTPS address without credentials, at most 4,096 code units; throws `asset_url_invalid`. */
export function assetURL(value: string): string;
/** Nonempty bytes within the picture limit; throws `asset_bytes_invalid` or `picture_too_large`. */
export function assetBytes(value: Uint8Array, limit?: number): Uint8Array;
/** Lowercase hex SHA-256. */
export function bytesHash(bytes: BufferSource): Promise<string>;
/** The picture's Markdown with the host's address; an address in the folder of `base` (the load's baseUrl) is written relative to it. */
export function externalImage(raw: string, asset: {label: string; title?: string}, url: string | null | undefined, base?: string): string;
export interface BrokerAsset {
  bytes: Uint8Array;
  codec: AssetType;
  [metadata: string]: unknown;
}
/** A shallow asset copy with owned bytes; metadata is not cloned or frozen. */
export interface RetainedAsset extends BrokerAsset { bytes: Uint8Array<ArrayBuffer>; }
export interface AssetBrokerState {
  identity: unknown;
  generation: unknown;
  connected: boolean;
  granted: boolean;
  pictureBytes: number;
  baseRevision: number | string | null;
}
export type AssetBrokerResult = {url: string} | {code: string};
export interface AssetBrokerPorts {
  current(): AssetBrokerState;
  send(type: 'asset-request', payload: {bytesSha256: string; mediaType: AssetType; bytes: Uint8Array<ArrayBuffer>}, requestId: string, baseRevision: number | string | null): boolean;
}
export interface AssetBroker {
  request(asset: BrokerAsset): Promise<AssetBrokerResult>;
  answer(message: {type: 'asset-ack' | 'asset-nack'; requestId: string; baseRevision: number | string | null; payload?: {url?: string; code?: string; reason?: string}}): AssetBrokerResult;
  cancel(code?: string): void;
  lookup(url: string): RetainedAsset | null;
}
/** The page's picture exchange, not the host's assets callback. */
export function createAssetBroker(ports: AssetBrokerPorts): Readonly<AssetBroker>;
/** Not a mount option: the option is `baseUrl` on `load`. The host's picture base: returns a function that turns a relative picture address into an address under `baseUrl` (or null), with
 * `vouched`, the addresses it produced. Null when no base is given; throws `invalid_base_url` for anything but an absolute https address (or http on localhost). Used by the page itself. */
export function pictureBase(value: string | null | undefined): (((src: string) => string | null) & {vouched: Set<string>; base: string}) | null;

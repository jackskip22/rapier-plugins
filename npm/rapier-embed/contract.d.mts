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
/** The editor page's open-file exchange; used by the page itself. */
export function createFilePicker(ports: Record<string, unknown>): unknown;
/** An absolute HTTPS address without credentials, at most 4,096 code units; throws `asset_url_invalid`. */
export function assetURL(value: string): string;
/** Nonempty bytes within the picture limit; throws `asset_bytes_invalid` or `picture_too_large`. */
export function assetBytes(value: Uint8Array, limit?: number): Uint8Array;
/** Lowercase hex SHA-256. */
export function bytesHash(bytes: BufferSource): Promise<string>;
export function externalImage(raw: string, asset: {label: string; title?: string}, url: string | null | undefined): string;
/** The editor page's picture exchange; used by the page itself. */
export function createAssetBroker(ports: Record<string, unknown>): unknown;
/** Not a mount option: the option is `baseUrl` on `load`. The host's picture base: returns a function that turns a relative picture address into an address under `baseUrl` (or null), with
 * `vouched`, the addresses it produced. Null when no base is given; throws `invalid_base_url` for anything but an absolute https address (or http on localhost). Used by the page itself. */
export function pictureBase(value: string | null | undefined): (((src: string) => string | null) & {vouched: Set<string>}) | null;

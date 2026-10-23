// SPDX-License-Identifier: MIT
// rapier-embed: Rapier.mount and the <rapier-editor> form field.
import type {AssetType, Refusal, Settings, AcceptedSettings} from './contract.mjs';
export type {Feature, Accent, AssetType, Limits, Refusal, Settings, AcceptedSettings} from './contract.mjs';

/** A durable revision: a nonnegative safe integer or a string of 1 to 256 code units. */
export type Revision = number | string;
export type Theme = 'light' | 'dark' | 'system';
export type DocKind = 'markdown' | 'text' | 'code';
/** `full` is rapier.html (Draw, Paint, Notes, agents); `reader` is the read-only reader. `document` names `full`. */
export type Build = 'full' | 'reader' | 'document';

export interface LoadRecord { content: string; revision: Revision; filename?: string; readOnly?: boolean; title?: string; }
export interface SaveRequest { content: string; filename: string; docKind: DocKind; codeLang: string; requestId: string; baseRevision: Revision; }
export interface DocumentState { loaded: boolean; dirty: boolean; saving: boolean; closing: boolean; readOnly: boolean; filename?: string; docKind?: DocKind; }
export interface AssetRequest { requestId: string; baseRevision: Revision; bytesSha256: string; mediaType: AssetType; bytes: Uint8Array; signal: AbortSignal; }
export interface ReaderStyle { css?: string; fonts?: {family: string; source: string | ArrayBuffer | ArrayBufferView; descriptors?: FontFaceDescriptors}[]; }
/** What load() resolves: the revision the frame now holds, whether it brought back the person's unsaved draft, and read-only. */
export interface LoadResult { revision: Revision; recoveredDraft: boolean; readOnly: boolean; }
/** What compare() resolves: the name the comparison shows. */
export interface CompareResult { filename: string; }
export type CloseAnswer = 'save' | 'discard' | 'cancel';
export type CloseResult = {saved: true} | {discarded: true} | {forced: true} | {cancelled: true};

export interface MountOptions {
  build?: Build;
  /** Your copy of the page; omitted, the hosted current build. HTTPS, or HTTP on localhost. */
  src?: string;
  sessionId?: string;
  documentId?: string;
  /** Grants `open`. */
  load?: LoadRecord | (() => Promise<LoadRecord>);
  /** Grants `read` and `changes`. Return the new revision only after durable storage; throw Rapier.conflict(current) on a conflict. */
  save?(request: SaveRequest): Promise<{revision: Revision}>;
  /** Grants `changes`. */
  onState?(state: DocumentState): void;
  /** Grants `compare`. */
  compare?: boolean;
  /** Grants `close`. */
  onClose?(state: {dirty: boolean}): CloseAnswer | Promise<CloseAnswer>;
  /** Grants `agent`: your app's agent edits over WebMCP. Needs load and save. */
  agent?: boolean;
  /** The name the editor shows for your agent, at most 96 characters. */
  agentName?: string;
  /** Grants `assets`: store the picture bytes and return their absolute HTTPS address. */
  assets?(request: AssetRequest): Promise<{url: string}>;
  /** Chooses the file the person opens when they tap Open in the frame (the host's own picker, for example in a WebView).
   * Called with the frame's request; resolve a File, or null when the person cancels. Omitted, the browser's file picker. */
  openFile?(request: {requestId: string; baseRevision: Revision; signal: AbortSignal}): File | null | Promise<File | null>;
  settings?: Settings;
  theme?: Theme;
  /** The reader's look; the reader build only. */
  style?: ReaderStyle;
  /** The directory that holds the plug-in files, on the page's own origin. */
  plugins?: string;
  /** The iframe's accessible title. */
  title?: string;
  /** Milliseconds a loaded frame has to connect before `ready` rejects with `connect_timeout`; default 15000. */
  timeout?: number;
  onError?(error: Refusal | Error): void;
}

export interface EditorEvents {
  connected: {settings?: AcceptedSettings} & Record<string, unknown>;
  state: DocumentState;
  'close-request': Record<string, unknown>;
  closed: CloseResult;
  error: Refusal | Error;
}

export interface MountedEditor {
  readonly iframe: HTMLIFrameElement;
  /** Resolves with this handle once the frame accepts the grants; rejects with a Refusal (`boot_failed`, `connect_timeout`, ...). */
  readonly ready: Promise<MountedEditor>;
  readonly connected: boolean;
  /** The frame's Rapier version and contract, once connected; null before. */
  readonly version: string | null;
  readonly contract: number | null;
  /** Rejects with `revision_stale` for a revision older than the frame's, `revision_conflict` for the same revision with other
   * content, and `document_unshowable` when the reader cannot show the document. */
  load(content: string, options?: {revision?: Revision; filename?: string; readOnly?: boolean; title?: string}): Promise<LoadResult>;
  /** Resolves once the frame holds no newer edits than the durable revision. */
  save(): Promise<{revision: Revision}>;
  compare(content: string, options?: {filename?: string}): Promise<CompareResult>;
  close(): Promise<CloseResult>;
  theme(value: Theme): Promise<void>;
  style(value: ReaderStyle): Promise<void>;
  disconnect(): void;
  /** Returns an unsubscribe function. */
  on<K extends keyof EditorEvents>(type: K, listener: (value: EditorEvents[K]) => void): () => void;
}

export const Rapier: {
  /** Frames Rapier in an iframe or a container. Throws a TypeError for an invalid option, with a code for an unknown option
   * (`option_unknown`), a build that does not match its page (`build_mismatch`) and a reader feature the reader lacks
   * (`settings_feature_unavailable`). */
  mount(target: HTMLIFrameElement | HTMLElement, options?: MountOptions): MountedEditor;
  /** The error a save callback throws when the stored document has changed. */
  conflict(currentRevision: Revision): Error & {code: 'conflict'; currentRevision: Revision};
  /** This package's version. */
  readonly version: string;
  /** The host contract this package speaks. */
  readonly contract: 1;
};

/** A form-associated field that submits its exact Markdown as a text/markdown file part. */
export class RapierEditor extends HTMLElement {
  static readonly formAssociated: true;
  value: string;
  name: string;
  disabled: boolean;
  required: boolean;
  readonly form: HTMLFormElement | null;
  readonly labels: NodeList;
  readonly validity: ValidityState;
  readonly validationMessage: string;
  readonly willValidate: boolean;
  checkValidity(): boolean;
  reportValidity(): boolean;
  setCustomValidity(message: string): void;
  /** Captures the editor's latest source into value. */
  save(): Promise<{revision: number} | void>;
}
/** Defines <rapier-editor> once; returns the class. */
export function defineRapierEditor(registry?: CustomElementRegistry): typeof RapierEditor;

declare global {
  interface HTMLElementTagNameMap { 'rapier-editor': RapierEditor; }
}

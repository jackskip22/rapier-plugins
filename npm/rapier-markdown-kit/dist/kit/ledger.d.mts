// SPDX-License-Identifier: MIT
// rapier-markdown-kit/rapier-ledger: a document's edit history with authorship, Undo of any act and offline merge.
// Offsets count UTF-16 code units; splices run in their recorded order.
export type ActorKind = 'human' | 'agent' | 'system';
export interface Actor { kind: ActorKind; id: string; }
export type DocKind = 'markdown' | 'text' | 'code';
export interface Metadata { filename: string; docKind: DocKind; }
export interface Splice { pos: number; removed: string; inserted: string; }
export interface Transaction {
  id: string; documentAuthority: string; baseRevision: number; revision: number; actor: Actor;
  transport: string; operation: string; requestId: string | null; sourceTransactionId: string | null;
  affectedBlockIds: string[]; parent: string | null; reverts: string | null; reapplies: string | null;
  createdAt: string | null; turnId?: string; sourceTransactionIds?: string[];
}
export interface LedgerRecord { transaction: Transaction; splices: Splice[]; beforeHash: string; afterHash: string; metadata?: Record<string, unknown>; authored?: unknown; }
/** rapier-ledger/2: plain JSON. */
export interface LedgerEnvelope {
  format: 'rapier-ledger/2';
  documentAuthority: string;
  start: {text: string; revision: number; root: string; sha256: string; metadata: Metadata};
  records: LedgerRecord[];
  head: {revision: number; root: string; sha256: string; metadata: Metadata};
  complete: boolean;
  sha256: string;
}
/** Runs of [start, end, actor kind, actor id, createdAt] over the current text. */
export interface AuthorshipEnvelope { format: 'rapier-authorship/1'; sha256: string; runs: [number, number, ActorKind, string, string | number | null][]; }
export interface ReadLedger { ledger: LedgerEnvelope; text: string; metadata: Metadata; root: string; revision: number; complete: boolean; }
export interface LedgerInput { text: string; metadata: Metadata; records: LedgerRecord[]; documentAuthority?: string; revision?: number; root?: string; complete?: boolean; }

/** A new ledger with no history. Give every copy that may later merge the same documentAuthority. */
export function openLedger(text: string, options?: {filename?: string; docKind?: DocKind; documentAuthority?: string}): LedgerEnvelope;
export function exportLedger(input: LedgerInput): LedgerEnvelope;
/** Verifies the envelope (and, when given, that it describes this text and metadata); throws when it does not. */
export function readLedger(input: LedgerEnvelope, expectedText?: string, expectedMetadata?: Metadata): ReadLedger;
/** Records one replacement of the whole text as an act by `actor`. */
export function replaceLedgerText(input: LedgerEnvelope, text: string, options?: {actor?: Actor; operation?: string; at?: string}): LedgerEnvelope;
export function ledgerWithStart(input: LedgerEnvelope, text: string): LedgerEnvelope;
export function historyEnvelope(input: LedgerEnvelope, segmentIdentity?: unknown[], expectedText?: string, expectedMetadata?: Metadata): Record<string, unknown>;
/** The actor id an agent writes under, for a door and an agent name. */
export function agentActorId(door: string, agent: string): string;
export function textRoot(text: string): string;
export function rootAfter(root: string, splice: Splice): string;
export function sha256State(): {update(text: string): unknown; digest(): string};

export function authorship(input: LedgerEnvelope): AuthorshipEnvelope;
export function readAuthorship(input: AuthorshipEnvelope, text: string): AuthorshipEnvelope;
export function ledgerFromAuthorship(input: AuthorshipEnvelope, text: string, documentAuthority: string, metadata: Metadata): LedgerEnvelope;

export interface MergeConflict { kind: string; code?: string; actId?: string; [key: string]: unknown; }
export interface MergeResult {
  text: string; metadata: Metadata; ledger: LedgerEnvelope;
  /** False when a person must review: conflicts, or Will keep regions that differ. */
  clean: boolean;
  conflicts: MergeConflict[];
  review: {required: boolean; base: string; proposed: string};
}
/** Merges two copies of one document (same documentAuthority) without a server. */
export function merge(first: LedgerEnvelope, second: LedgerEnvelope): MergeResult;
export function transportInterval(start: number, end: number, splices: Splice[]): {start: number; end: number} | null;
export function transportTouchedInterval(start: number, end: number, splices: Splice[]): {start: number; end: number};

export interface HistoryInput { source: string; metadata: Metadata; records: LedgerRecord[]; revision: number; earliestRevision: number; complete: boolean; }
export interface HistoryFailure { ok?: false; code: string; [key: string]: unknown; }
/** Reverses chosen acts while later work stays. */
export function selectiveUndo(input: HistoryInput, actIds: string[], options?: {actor?: Actor; splitSplice?: (...args: unknown[]) => unknown}): Record<string, unknown> | HistoryFailure;
export function replayHistory(input: HistoryInput): unknown;
export function sourceBefore(input: HistoryInput, actId: string): unknown;
export function historyProjection(input: HistoryInput, range?: {from?: number; to?: number; actId?: string}): unknown;
export function historyProjections(input: HistoryInput, ranges: unknown[]): unknown;
export function historyPlaces(input: HistoryInput, blocks: unknown[]): unknown;
export function groupHistoryActs(acts: unknown[]): unknown;
export function pictureHistorySplices(input: unknown, target: unknown, redo: boolean): Splice[] | null;
export function transposeSource(base: string, splices: Splice[], client: unknown, log: unknown): unknown;
export function authoredBasis(...args: unknown[]): unknown;
export function authoredPlacement(...args: unknown[]): unknown;
export function authoredHistory(base: string, records: LedgerRecord[], selected?: unknown): unknown;
export function transposeAuthored(base: string, records: LedgerRecord[], incoming: unknown, submitted: unknown): unknown;

export {writeDocument, readDocument, writeParts, readParts} from './ledger/carried.mjs';

export interface TextConflict { kind: 'text'; id: string; start: number; end: number; block: string; variants: string[]; }
export interface TextMerge { text: string; clean: boolean; conflicts: (TextConflict | {kind: string; advisory?: boolean})[]; }
/** Exact three-way text merge; a region both sides changed becomes a marked choice in the text. */
export function mergeText(base: string | null, ours: string, theirs: string, options?: Record<string, unknown>): TextMerge;
export function inspectTextConflicts(text: string, options?: {nested?: boolean}): TextConflict[];
export function resolveTextConflict(text: string, conflict: TextConflict | string, device: unknown): string;
export function mapTextConflictVariants(text: string, mapper: (variant: string) => string): string;

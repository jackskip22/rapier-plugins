// SPDX-License-Identifier: MIT
// rapier-markdown-kit/rapier-ledger: a document's edit history with authorship, Undo of any act and offline merge.
// Offsets count UTF-16 code units; splices run in their recorded order.
export type ActorKind = 'human' | 'agent' | 'system';
export interface Actor { kind: ActorKind; id: string; name?: string; }
export type DocKind = 'markdown' | 'text' | 'code';
export interface Metadata { filename: string; docKind: DocKind; }
export interface MetadataEffect {
  filename?: {before: string; after: string};
  docKind?: {before: DocKind; after: DocKind};
}
export type LedgerData = null | boolean | number | string | LedgerData[] | {[key: string]: LedgerData};
export interface Splice { pos: number; removed: string; inserted: string; }
export interface Transaction {
  id: string; documentAuthority: string; baseRevision: number; revision: number; actor: Actor;
  transport: 'platform' | 'webmcp'; operation: string; requestId: string | null; sourceTransactionId: string | null;
  affectedBlockIds: number[]; parent: string | null; reverts: string | null; reapplies: string | null;
  createdAt: number | null; turnId?: string | null; sourceTransactionIds?: string[];
  label?: string | null; turnLabel?: string | null; turnBaseRevision?: number;
  contribution?: string; contributionBaseRevision?: number; remoteTransactionId?: string;
}
export interface AuthoredPlacement { basis: string[]; source: string; splices: Splice[]; }
/** A retained journal may omit navigation splices: the target's exact rows supply them. */
export interface JournalRecord {
  transaction: Transaction; splices?: Splice[]; beforeHash: string; afterHash: string;
  metadata?: MetadataEffect; authored?: AuthoredPlacement; derivedCommentIndex?: number;
  changeSet?: {[key: string]: LedgerData};
}
/** An exported envelope expands every navigation record to exact splices. */
export interface LedgerRecord extends JournalRecord { splices: Splice[]; }
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
export interface AuthorshipEnvelope { format: 'rapier-authorship/1'; sha256: string; runs: [number, number, ActorKind, string, number | null][]; }
export interface ReadLedger { ledger: LedgerEnvelope; text: string; metadata: Metadata; root: string; revision: number; complete: boolean; }
export interface LedgerInput { text: string; metadata: Metadata; records: JournalRecord[]; earlier?: JournalRecord[]; documentAuthority?: string; revision?: number; root?: string; complete?: boolean; }

/** A new ledger with no history. Give every copy that may later merge the same documentAuthority. */
export function openLedger(text: string, options?: {filename?: string; docKind?: DocKind; documentAuthority?: string}): LedgerEnvelope;
export function exportLedger(input: LedgerInput): LedgerEnvelope;
/** Verifies the envelope (and, when given, that it describes this text and metadata); throws when it does not. */
export function readLedger(input: LedgerEnvelope, expectedText?: string, expectedMetadata?: Metadata): ReadLedger;
/** Records one replacement of the whole text as an act by `actor`. */
export function replaceLedgerText(input: LedgerEnvelope, text: string, options?: {actor?: Actor; operation?: string; at?: number | null}): LedgerEnvelope;
export function ledgerWithStart(input: LedgerEnvelope, text: string): LedgerEnvelope;
export interface HistoryEnvelope<Segment = unknown> {
  schemaVersion: 5; documentAuthority: string; documentRevision: number;
  ledger: LedgerRecord[]; branch: string[]; cursor: number; earliestRevision: number;
  earliestHash: string; sourceRootId: string; earliestMetadata: Metadata; documentMetadata: Metadata;
  segmentIdentity: Segment[]; historyComplete: boolean; trimReason: '' | 'carried_start'; trimmedBytes: 0;
}
export function historyEnvelope<Segment = unknown>(input: LedgerEnvelope, segmentIdentity?: Segment[], expectedText?: string, expectedMetadata?: Metadata): HistoryEnvelope<Segment>;
/** The actor id an agent writes under, for a door and an agent name. */
export function agentActorId(door: string, agent?: {name: string} | null): string;
export function textRoot(text: string): string;
export function rootAfter(root: string, splice: Splice): string;
/** Feed bytes, then call finish once. `bytes` counts the input supplied so far. */
export function sha256State(): {update(input: Uint8Array): void; finish(): string; readonly bytes: number};

export function authorship(input: LedgerEnvelope): AuthorshipEnvelope;
export function readAuthorship(input: AuthorshipEnvelope, text: string): AuthorshipEnvelope;
export function ledgerFromAuthorship(input: AuthorshipEnvelope, text: string, documentAuthority: string, metadata: Metadata): LedgerEnvelope;

export type MergeConflict =
  | {kind: 'identity'; code: 'act_identity_conflict' | 'act_order_conflict'; actId?: string}
  | {kind: 'history'; code: 'record_transport_conflict'}
  | {kind: 'metadata'; code: 'metadata_assignment_conflict' | 'inverse_target_unavailable' | 'record_transport_conflict'; fields?: (keyof Metadata)[]}
  | (TextMergeConflict & {code: 'text_overlap_unpreserved'});
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

export type HistoryTransaction = Pick<Transaction, 'id' | 'baseRevision' | 'revision' | 'actor' | 'createdAt'> & Partial<Transaction>;
export interface HistoryRecord {
  transaction: HistoryTransaction; splices?: Splice[]; beforeHash?: string; afterHash?: string;
  metadata?: MetadataEffect; authored?: AuthoredPlacement; derivedCommentIndex?: number;
  changeSet?: {[key: string]: LedgerData};
}
export interface HistoryInput {
  source: string; metadata: Metadata; records: HistoryRecord[];
  revision?: number; earliestRevision?: number; earliestRoot?: string; complete?: boolean;
}
export interface HistoryFailure {
  ok: false;
  reason: 'history_invalid' | 'history_unavailable' | 'range_invalid' | 'act_unavailable' | 'act_invalid' | 'act_forbidden' | 'will_refused';
}
export interface HistoryAct {
  id: string; actor: Actor; createdAt: number | null; baseRevision: number; revision: number; operation: string;
  turnId?: string; contribution?: string; sourceTransactionId?: string; sourceTransactionIds?: string[];
  reverts?: string; reapplies?: string; label?: LedgerData; affectedBlockIds?: number[];
  metadata?: MetadataEffect; active?: boolean;
}
export interface HistoryGroup { id: string; actor: Actor; actIds: string[]; createdAt: number | null; turnId?: string; }
export interface HistorySnapshot { source: string; revision: number; earliestRevision: number; complete: boolean; }
export interface HistoryReplay extends HistorySnapshot {
  ok: true; initialSource: string; metadata: Metadata; initialMetadata: Metadata;
  acts: HistoryAct[]; effectiveActIds: string[]; groups: HistoryGroup[];
}
export interface HistorySourceBefore extends HistorySnapshot { ok: true; metadata: Metadata; act: HistoryAct; }
export interface HistoryRange { from?: number; to?: number; actId?: string; }
export interface HistorySourceRange { from: number; to: number; source: string; }
export interface ProjectedHistoryAct extends HistoryAct { before: HistorySourceRange; after: HistorySourceRange; }
export interface HistoryProjection extends HistorySnapshot, HistorySourceRange {
  ok: true; acts: ProjectedHistoryAct[]; groups: HistoryGroup[]; before?: HistorySourceRange;
}
export interface HistoryBlock<Id = unknown> { id: Id; from: number; to: number; }
export interface HistoryPlaces<Id = unknown> extends HistorySnapshot {
  ok: true; initialSource: string; acts: HistoryAct[];
  blocks: (HistoryBlock<Id> & {source: string; acts: ProjectedHistoryAct[]})[]; reversed: string[];
}
export interface UndoHunk {
  actId: string; spliceIndex: number; hunkIndex: number; splice: Splice;
  beforeSource: string; actSource: string; priorSplices: Splice[];
}
export interface SelectiveUndoOptions {
  actor?: Actor;
  /** Retain this exact hunk while reversing the other selected hunks. */
  keepHunk?: (hunk: UndoHunk) => boolean;
  /** Refinements must replay to the same exact text as the supplied splice. */
  splitSplice?: (input: {actId: string; beforeSource: string; splice: Splice}) => Splice[];
}
export interface SupersededHunk { actId: string; hunk: string; laterActIds: string[]; reason: 'later_edit' | 'already_undone'; }
export interface SelectiveUndo {
  ok: true; splices: Splice[]; after: string; actIds: string[]; sourceTransactionIds: string[];
  metadata: MetadataEffect | null; afterMetadata: Metadata; effectChanged: boolean; unchanged: boolean;
  superseded: SupersededHunk[]; overlaps: SupersededHunk[];
}
/** Reverses chosen acts while later work stays. */
export function selectiveUndo(input: HistoryInput, actIds: string[], options?: SelectiveUndoOptions): SelectiveUndo | HistoryFailure;
export function replayHistory(input: HistoryInput): HistoryReplay | HistoryFailure;
export function sourceBefore(input: HistoryInput, actId: string): HistorySourceBefore | HistoryFailure;
export function historyProjection(input: HistoryInput, range?: HistoryRange): HistoryProjection | HistoryFailure;
export function historyProjections(input: HistoryInput, ranges: (HistoryRange | undefined)[]): {ok: true; projections: (HistoryProjection | HistoryFailure)[]} | HistoryFailure;
export function historyPlaces<Id>(input: HistoryInput, blocks: HistoryBlock<Id>[]): HistoryPlaces<Id> | HistoryFailure;
export function groupHistoryActs(acts: Pick<HistoryAct, 'id' | 'actor' | 'createdAt' | 'turnId'>[]): HistoryGroup[];
export function pictureHistorySplices(input: Pick<HistoryInput, 'source' | 'records'>, target: HistoryRecord, redo: boolean): Splice[] | null;
/** Canonical input splices use `pos/removed/inserted`; the host's reciprocal log uses `at/remove/insert`. */
export interface SourceTransportEntry { client: string; splices: {at: number; remove: number; insert: string}[]; }
export interface AuthoredRecord {
  transaction: Pick<Transaction, 'id'> & Partial<Transaction>; splices: Splice[];
  authored?: AuthoredPlacement; metadata?: MetadataEffect; derivedCommentIndex?: number;
}
export interface SourceTransposition {
  text: string; splices: Splice[]; sourceIndices: number[];
  against: {transaction: {id: string}; splices: Splice[]}[];
}
export interface AuthoredHistory<Record extends AuthoredRecord = AuthoredRecord> {
  text: string; records: Record[]; origins: Map<string, AuthoredPlacement>;
}
export interface ProjectedAuthoredHistory<Record extends AuthoredRecord = AuthoredRecord> extends AuthoredHistory<Record> {
  sourceIndices: Map<string, number[]>;
}
export interface AuthoredTransposition<Record extends AuthoredRecord = AuthoredRecord> {
  text: string; splices: Splice[]; submittedBefore: string; submitted: string; against: Record[];
}
export function transposeSource(base: string, splices: Splice[], client: string, log: SourceTransportEntry[]): SourceTransposition;
export function authoredBasis(records: Pick<AuthoredRecord, 'transaction' | 'authored'>[]): string[];
export function authoredPlacement(source: string, splices: Splice[], basis: string[]): AuthoredPlacement;
export function authoredHistory<Record extends AuthoredRecord>(base: string, records: Record[], selected: ReadonlySet<string>): ProjectedAuthoredHistory<Record>;
export function authoredHistory<Record extends AuthoredRecord>(base: string, records: Record[], selected?: null): AuthoredHistory<Record>;
export function authoredHistory<Record extends AuthoredRecord>(base: string, records: Record[], selected?: ReadonlySet<string> | null): AuthoredHistory<Record> | ProjectedAuthoredHistory<Record>;
export function transposeAuthored<Record extends AuthoredRecord>(base: string, records: Record[], incoming: AuthoredRecord & {authored: AuthoredPlacement}, submitted: string[]): AuthoredTransposition<Record>;

export {writeDocument, readDocument, writeParts, readParts} from './ledger/carried.mjs';

export interface TextConflictVariant { device: string; text: string; }
export interface TextConflictDescriptor { start: number; end: number; block: string; variants: TextConflictVariant[]; }
export interface TextConflict extends TextConflictDescriptor { kind: 'text'; id: string; }
export type TextMergeConflict =
  | (TextConflictDescriptor & {kind: 'text' | 'no-ancestor' | 'will' | 'document-bindings' | 'ambiguous-alignment-or-budget'; base: string | null})
  | {kind: 'existing-conflict'; advisory: true};
export interface TextMerge { text: string; clean: boolean; conflicts: TextMergeConflict[]; }
export interface TextMergeOptions { oursId: string; theirsId: string; }
/** Exact three-way text merge; a region both sides changed becomes a marked choice in the text. */
export function mergeText(base: string | null, ours: string, theirs: string, options?: TextMergeOptions): TextMerge;
export function inspectTextConflicts(text: string, options?: {nested?: boolean}): TextConflict[];
export function resolveTextConflict(text: string, conflict: TextConflictDescriptor, device: string | number): string;
export function mapTextConflictVariants(text: string, mapper: (variant: string) => string): string;

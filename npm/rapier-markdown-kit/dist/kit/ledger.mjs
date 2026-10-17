// SPDX-License-Identifier: MIT
import {exportLedger} from './ledger/format.mjs';
export {exportLedger, replaceLedgerText, readLedger, ledgerWithStart, textRoot, rootAfter, historyEnvelope, agentActorId} from './ledger/format.mjs';
export {authorship, readAuthorship, ledgerFromAuthorship} from './ledger/authorship.mjs';
export {merge, transportInterval, transportTouchedInterval} from './ledger/merge.mjs';
export {replayHistory, sourceBefore, historyProjection, historyProjections, historyPlaces, selectiveUndo, groupHistoryActs, pictureHistorySplices} from './ledger/history.mjs';
export {sha256State} from './ledger/hash.mjs';
export {transposeSource, authoredBasis, authoredPlacement, authoredHistory, transposeAuthored} from './ledger/transport.mjs';
export {writeDocument, readDocument, writeParts, readParts} from './ledger/carried.mjs';
export {mergeText, resolveTextConflict, inspectTextConflicts, mapTextConflictVariants} from './ledger/text-merge.mjs';

export function openLedger(text, {filename = 'document.md', docKind = 'markdown', documentAuthority = globalThis.crypto.randomUUID()} = {}) {
  return exportLedger({text, metadata: {filename, docKind}, records: [], documentAuthority, complete: true});
}

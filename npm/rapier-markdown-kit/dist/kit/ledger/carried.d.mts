// SPDX-License-Identifier: MIT
// The ledger and authorship carried inside the document: an optional HTML comment at the end of the file.
import type {LedgerEnvelope, AuthorshipEnvelope, Metadata} from '../ledger.mjs';
export interface DocumentParts { ledger?: LedgerEnvelope | null; authorship?: AuthorshipEnvelope | null; metadata?: Metadata; }
export interface ReadParts { text: string; ledger: LedgerEnvelope | null; authorship: AuthorshipEnvelope | null; }
/** The text with its parts appended as one EOF comment; the text alone when there are none. */
export function writeDocument(text: string, parts?: DocumentParts): string;
/** The verified EOF comment without copying the source; empty when there are no carried parts. */
export function documentTrailer(text: string, parts?: DocumentParts): string;
/** Splits a saved file into its exact text and verified parts; throws on a damaged or mismatched comment. */
export function readDocument(source: string): ReadParts;
export function writeParts(text: string, parts?: DocumentParts): string;
export function readParts(text: string, elements: unknown): {ledger: LedgerEnvelope | null; authorship: AuthorshipEnvelope | null};
export function validateParts(text: string, parts?: DocumentParts): {ledger: LedgerEnvelope | null; authorship: AuthorshipEnvelope | null};
export function takeParts(html: string, text?: string): {html: string; ledger: LedgerEnvelope | null; authorship: AuthorshipEnvelope | null};
export function encodeCarried(text: string): string;
export function decodeCarried(text: string): string;
export interface ComparisonBase { text: string; sha256: string; revision: string; name: string; by: string; at: string; }
export function readBase(value: Partial<ComparisonBase>): ComparisonBase;
export function writeBase(text: string, value: Partial<ComparisonBase>): string;
export function readBaseElements(elements: unknown): ComparisonBase | null;
export function takeBase(html: string): {html: string; base: ComparisonBase | null};

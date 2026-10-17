// SPDX-License-Identifier: MIT
// Attach the exact source to a PDF Rapier wrote, without rewriting its pages (rapier-markdown-kit/pdf).
export function readPdfPageCount(input: Uint8Array | ArrayBuffer): number;
/** The PDF with `source` attached as an associated file; throws `pdf_source_invalid` for a PDF it cannot extend. */
export function attachPdfSource(input: Uint8Array | ArrayBuffer, options: {source: string; filename: string; maxBytes?: number; check?: () => void}): Promise<Uint8Array>;

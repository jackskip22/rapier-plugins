// SPDX-License-Identifier: MIT
// md.use(rapierMarkdown): Self-contained Markdown in markdown-it, with the reference style's markup.
import type {MarkdownParser} from './marks.mjs';
export function rapierMarkdown<T extends MarkdownParser>(md: T): T;

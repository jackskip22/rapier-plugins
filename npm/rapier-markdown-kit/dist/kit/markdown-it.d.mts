// SPDX-License-Identifier: MIT
// md.use(rapierMarkdown): Self-contained Markdown in markdown-it, with the reference style's markup.
interface MarkdownItLike { use(plugin: (md: any, ...params: any[]) => unknown, ...params: any[]): any; renderer: {rules: Record<string, unknown>}; core: {ruler: {after(after: string, name: string, rule: (state: any) => unknown): void}}; }
export function rapierMarkdown<T extends MarkdownItLike>(md: T): T;

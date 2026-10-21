// SPDX-License-Identifier: MIT
import {parseLayout, imageStyle} from './layout.mjs';
import {typography, isPageBreakBlock} from './marks.mjs';
import {installMarkdownImages} from './assets.mjs';
import {tuneMarkdownEngine} from '../spec/md-engine.mjs';

const PAGE_BREAK = '<div class="rapier-page-break" data-md-break="page" role="separator" aria-label="Page break"></div>\n';

export function rapierMarkdown(md) {
  if (md.__rapierMarkdownInstalled) return md;
  md.__rapierMarkdownInstalled = true;
  tuneMarkdownEngine(md);
  typography.install(installMarkdownImages(md));
  md.renderer.rules.table_open = (tokens, index, options, env, renderer) =>
    '<div class="table-scroll-wrap">\n' + renderer.renderToken(tokens, index, options);
  md.renderer.rules.table_close = (tokens, index, options, env, renderer) =>
    renderer.renderToken(tokens, index, options) + '</div>\n';
  md.core.ruler.after('inline', 'rapier-layout', state => {
    for (let i = 1; i < state.tokens.length; i++) {
      const inline = state.tokens[i];
      if (inline.type !== 'inline') continue;
      const children = inline.children, marker = children[children.length - 1];
      if (marker?.type !== 'html_inline') continue;
      const owner = state.tokens[i - 1];
      if (owner.type !== 'paragraph_open' && owner.type !== 'heading_open') continue;
      const layout = parseLayout(marker.content);
      if (!layout) continue;
      children.pop();
      if (layout.align) owner.attrSet('data-md-align', layout.align);
      const visible = children.filter(token => token.type !== 'text' || token.content.trim());
      if (visible.length === 1 && visible[0].type === 'image' && layout.width) {
        visible[0].attrSet('style', imageStyle(layout));
        visible[0].attrSet('data-md-image-width', String(layout.width));
      }
    }
  });
  const htmlBlock = md.renderer.rules.html_block || ((tokens, index) => tokens[index].content);
  md.renderer.rules.html_block = (tokens, index, options, env, renderer) =>
    isPageBreakBlock(tokens[index].content) ? PAGE_BREAK : htmlBlock(tokens, index, options, env, renderer);
  return md;
}

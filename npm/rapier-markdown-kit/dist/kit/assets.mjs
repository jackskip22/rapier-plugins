// SPDX-License-Identifier: MIT
// Re-export from ../spec/md-assets.mjs only: ../images/assets.mjs pulls AGPL decoders into the MIT graph (tools/check-kit.mjs).
export {IMAGE_LIMITS, configureParser, normalizeLabel, assetTitle, installMarkdownImages, markdownParser, markdownBodyOffset,
  dataImage, parseAssets, documentAssets, packAssetIndex, restoreAssetIndex, projectImageDefinitions, blockwiseAssets,
  imageEnvironment, referenceOccurs, mayRetireImageDefinitions, retireDeletedImageDefinitions, assetOmissions, isAssetBlock,
  escapeImageAlt, serializeAsset, appendAssetText, appendAsset} from '../spec/md-assets.mjs';

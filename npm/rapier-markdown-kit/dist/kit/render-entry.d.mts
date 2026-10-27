// SPDX-License-Identifier: MIT
import type {MarkdownParser, MarkdownParserInternals, MarkdownToken, MarkdownEnvironment, MarkdownOptions} from './marks.mjs';
import type {Layout} from './layout.mjs';
import type {ShapeProfile} from './model.mjs';
import type {LedgerEnvelope, AuthorshipEnvelope} from './ledger.mjs';
import type {ComparisonBase, DocumentParts} from './ledger/carried.mjs';

export type Awaitable<T> = T | PromiseLike<T>;
export type DocumentKind = 'markdown' | 'text' | 'code';
export type RenderTheme = 'system' | 'light' | 'dark';
export type SanitizeContext = 'render' | 'paste' | 'diagram' | 'raw' | 'export' | 'source';
export interface RenderWork {
  signal?: AbortSignal;
  check?(): void;
  onProgress?(fraction?: number, label?: string): void;
  yield?(fraction?: number, label?: string): Awaitable<void>;
}
export interface RenderMetadata {
  filename?: string;
  docKind?: DocumentKind;
  codeLang?: string;
  bom?: boolean;
}
/** BOM metadata is read from the source; callers cannot override it. */
export interface RenderOptions extends Omit<RenderMetadata, 'bom'> {}
export interface HtmlArtifact { html: string; filename: string; }
export interface FileArtifact { blob: Blob; filename: string; }
export interface FontChoice { family: string; css: string; stack: string; word: string; }
/** Document settings use twips for page sizes and margins. */
export interface RenderDocumentSettings {
  title?: string | null;
  subtitle?: string | null;
  lang?: string | null;
  mainfont?: FontChoice | null;
  sansfont?: FontChoice | null;
  monofont?: FontChoice | null;
  defaultfont?: FontChoice | null;
  fontsize?: {step: string; unit: number; css: string; halfPoints: number} | null;
  linestretch?: {step: string; factor: number; css: string; line: number} | null;
  papersize?: {name: string; width: number; height: number; css: string} | null;
  geometry?: {margin: string; twips: number | null; top: number; right: number; bottom: number; left: number} | null;
  pagestyle?: 'plain' | 'empty' | null;
  template?: 'page' | null;
  word?: boolean;
  spacing?: {
    preset?: 'compact' | 'standard' | 'roomy';
    paragraph?: Spacing; h1?: Spacing; h2?: Spacing; h3?: Spacing; h4?: Spacing; h5?: Spacing; h6?: Spacing;
    list?: Spacing; item?: Spacing; table?: Spacing; picture?: Spacing; drawing?: Spacing;
    quote?: Spacing; code?: Spacing; rule?: Spacing; footnote?: Spacing; toc?: Spacing;
  } | null;
}
export interface Spacing {before?: number; after?: number; line?: number;}
export interface FontRunOptions {
  settings?: RenderDocumentSettings | null;
  css?: string;
  fontCss?: string;
}
export interface FontValidationOptions {family: string; format?: string;}
/** Only the boolean true admits a font. Errors, including cancellation, propagate. */
export type FontValidator = (bytes: Uint8Array, options: FontValidationOptions) => Awaitable<boolean>;
export type FontSubsetter = (bytes: Uint8Array, text: string) => Awaitable<Uint8Array | null>;
export interface ExportFontOptions extends FontRunOptions {
  subset: FontSubsetter;
  validateFont?: FontValidator;
  portableFactory?: boolean;
  customFontCss?: string;
}
/** The renderer calls a host wrapper which owns the subsetter and factory font CSS. */
export interface HostExportFontOptions extends FontRunOptions {
  theme: RenderTheme;
  portableFactory?: boolean;
  customFontCss?: string;
}
export interface CapturedFontAsset {family: string; url: string; data: string; format: string;}
export interface FontAssetIndex {
  assets: readonly CapturedFontAsset[];
  references: Readonly<Record<string, {href: string; title: string}>>;
}
export interface RequiredFontOptions extends FontRunOptions {
  parser: RenderMarkdownParser;
  index: FontAssetIndex;
  root: Element;
  validateFont?: FontValidator;
}
export interface FontRequest {family: string; style: string; weight: string; stretch: string;}
export interface WaitForFontOptions extends FontRunOptions {install?: boolean;}
/** Returns CSS. Optional factory subsetting can return an empty string; cancellation still rejects. */
export function exportFontCss(root: Element, options: ExportFontOptions): Promise<string>;
/** Validates used captured font bytes; rejects with export_font_unavailable or export_font_invalid. Does not install fonts. */
export function requireDocumentFonts(source: string, options: RequiredFontOptions): Promise<void>;
export function fontRequests(root: Element, options?: FontRunOptions): FontRequest[];
/** Resolves to the cleanup callback for the faces installed by this call. */
export function waitForFonts(root: Element, options?: WaitForFontOptions): Promise<() => void>;
export function waitForFontRequests(document: Pick<Document, 'fonts'>, requests?: readonly FontRequest[] | null): Promise<void>;

export interface RenderStylesHost {
  _rapierArtifactAccent(): string;
  _rapierStyleText(id: string): string;
}
export interface RenderStyles {
  _rapierArtifactThemeCss(houseDefaults?: boolean): string;
  _rapierArtifactPrintCss(): string;
  _rapierDocumentPrintCss(hostSelector: string): string;
  _rapierArtifactStyles(theme: RenderTheme, includeFonts: boolean, printMode: boolean, houseDefaults?: boolean, fontCss?: string | null): string;
}
export function createRenderStyles(host: RenderStylesHost): RenderStyles;

export interface SanitizeAttributeHookData {
  attrName: string;
  attrValue: string;
  keepAttr: boolean;
  forceKeepAttr?: boolean;
}
export interface SanitizeElementHookData {tagName: string; allowedTags: Record<string, boolean>;}
export interface SanitizerConfig {
  ALLOWED_TAGS?: readonly string[];
  ALLOWED_ATTR?: readonly string[];
  FORBID_TAGS?: readonly string[];
  FORBID_CONTENTS?: readonly string[];
  FORBID_ATTR?: readonly string[];
  ADD_TAGS?: readonly string[] | ((tagName: string) => boolean);
  ADD_DATA_URI_TAGS?: readonly string[];
  HTML_INTEGRATION_POINTS?: Readonly<Record<string, boolean>>;
  ALLOW_DATA_ATTR?: boolean;
  RETURN_DOM_FRAGMENT?: boolean;
  KEEP_CONTENT?: boolean;
  ALLOWED_URI_REGEXP?: RegExp;
}
/** The host supplies its sanitizer; this package does not bundle DOMPurify. */
export interface RenderDOMPurify {
  sanitize(source: string): string | DocumentFragment;
  setConfig(options?: SanitizerConfig): void;
  addHook(name: 'uponSanitizeAttribute', hook: (node: Element, data: SanitizeAttributeHookData) => void): void;
  addHook(name: 'uponSanitizeElement', hook: (node: Node, data: SanitizeElementHookData) => void): void;
  addHook(name: 'afterSanitizeAttributes', hook: (node: Element) => void): void;
  addHook(name: 'afterSanitizeElements', hook: (node: Node) => void): void;
  removeHook(name: 'uponSanitizeAttribute', hook: (node: Element, data: SanitizeAttributeHookData) => void): void;
  removeHook(name: 'uponSanitizeElement', hook: (node: Node, data: SanitizeElementHookData) => void): void;
  removeHook(name: 'afterSanitizeAttributes', hook: (node: Element) => void): void;
}
export interface RemoteContentPolicy {allowed: boolean;}
export interface SanitizeRuntime {context?: SanitizeContext; chromeIds?: Set<string>;}
export interface SanitizerRealm {
  document?: Document;
  RapierMarkdownSpec?: {wordListLevel(style: string): number; wordListIsMarker(style: string): boolean};
  RapierImageAssets?: Pick<RenderImageAssets, 'dataImage' | 'decodeDataImageBytes' | 'isJxl'>;
  RapierEmbedPictureBase?: MarkdownRealm['RapierEmbedPictureBase'];
}
export interface RenderSanitizerHost {
  CSSStyleSheet: typeof CSSStyleSheet;
  DOMPurify: RenderDOMPurify;
  RAPIER_RASTER_DATA_URL_RE: RegExp;
  URL: typeof URL;
  _rapierCssDeclaration(): CSSStyleDeclaration;
  _rapierDropRemoteDeclarations(style: CSSStyleDeclaration): boolean;
  _rapierRemoteContent: RemoteContentPolicy;
  _rapierRuleDescriptorIsRemote(rule: CSSRule): boolean;
  _rapierSanitizeRuntime: SanitizeRuntime;
  document: Document;
  globalThis: SanitizerRealm;
  location: Pick<Location, 'protocol' | 'host'>;
}
export interface RenderSanitizer {
  _rapierVerifyRasterBytes(bytes: Uint8Array, mime: string): boolean;
  _rapierInstallSanitizeHooks(): void;
  _rapierInstallDocumentSanitizeHooks(): void;
  sanitizeRapierHtml(value: unknown, context?: SanitizeContext): string;
  sanitizeRapierFragment: ((value: unknown, context?: SanitizeContext) => DocumentFragment) | undefined;
  diagramLabelStyle(property: string, value: string): boolean;
  escapeRapierHtmlText(value: unknown): string;
  _rapierChromeOwnsId(id: string): boolean;
  _rapierLinkDestinationToConfirm(href: string, text?: string): string;
  _rapierSafeRasterDataUrl(value: string): boolean;
  _rapierCssPresentationIsRemote(property: string, value: string): boolean;
  _rapierRemoteSubresourceOrigin(value: string | null | undefined): string;
  _rapierStyleWithoutRemoteUrls(value: string | null | undefined): string;
  _rapierStylesheetWithoutRemoteUrls(css: string | null | undefined): string;
  _rapierDropRemoteRules(rules: CSSRuleList, owner: {deleteRule(index: number): void}): void;
}
export function createRenderSanitizer(host: RenderSanitizerHost): RenderSanitizer;

export interface WillMarkerPlan {canonical: string; markers: string[]; sentinel: string;}
export interface WillCarrierFont {family: 'RapierWillCarrier'; bytes: Uint8Array; size: number; codes: number[]; bounds: [number, number, number, number];}
export interface TemplatePage {
  url: string; width: number; height: number;
  margins: {top: number; right: number; bottom: number; left: number};
}
export interface PrintSource {
  root: HTMLElement;
  css: string;
  fontCss?: string;
  canonical: string;
  bom?: boolean;
  filename: string;
  title?: string;
  settings?: RenderDocumentSettings | null;
  templatePage?: TemplatePage | null;
}
export interface CaptureRequest {
  root: Element;
  clip: {x: number; y: number; width: number; height: number};
  transparent?: boolean;
  scale?: number;
  signal?: AbortSignal;
  current?: () => boolean;
  pixels?: boolean;
}
export type CaptureResult = {rgb: Uint8Array; alpha: Uint8Array; width: number; height: number}
  | {mimeType: string; data: string; width?: number; height?: number};
export type PrintCapture = (request: CaptureRequest) => Awaitable<CaptureResult>;
export interface PrintFilmRequest {root: Element; signal?: AbortSignal; current?: () => boolean; frame: {width: number; height: number};}
export interface PrintFilmSession {
  raster(clip: CaptureRequest['clip'], options: {transparent: boolean}): Awaitable<{
    width: number; height: number; rgb: Uint8Array; alpha?: Uint8Array | null;
  }>;
  close(): void;
}
export interface PrintOptions {
  capture: PrintCapture;
  signal?: AbortSignal;
  current?: () => boolean;
  maxBytes?: number;
  film(request: PrintFilmRequest): Awaitable<PrintFilmSession>;
  ink?(root: HTMLElement): void;
}
export interface PaintedGlyph {text: string; reason: string; family: string; page?: number;}
export interface PrintPdf {bytes: Uint8Array; pages: number; painted: PaintedGlyph[];}
export interface PrintRendererHost {
  Node: Pick<typeof Node, 'ELEMENT_NODE' | 'TEXT_NODE'>;
  _rapierWillParse(source: string): {present: boolean; blocks: readonly {start: number; end: number}[]};
  crypto: Pick<Crypto, 'randomUUID'>;
  document: Document;
  globalThis: PrintRealm;
}
export interface PrintRenderer {
  _rapierWillSentinelPlan(canonical: string, kind: DocumentKind): WillMarkerPlan | null;
  _rapierPrintWillAdmit(canonical: string, plan: WillMarkerPlan): void;
  _rapierPrintWillFont(markers: string[], advanceOverride?: number): WillCarrierFont;
  _rapierPrintWillMetrics(markers: string[]): {size: number; advance: number};
  _rapierPrintWillPlace(root: HTMLElement, plan: WillMarkerPlan): void;
  _rapierPrintWillLost(why: string, fix: string): Error;
  _rapierPrintWillPageCss(): string;
  /** Uses an isolated print frame. Closes its film/removes the frame on success or refusal; rejects cancellation/document changes. */
  _rapierWritePrintPdf(source: PrintSource, options: PrintOptions): Promise<PrintPdf>;
}
export function createPrintRenderer(host: PrintRendererHost): PrintRenderer;

export interface PdfFontAsset {
  family: string; weight: string | number; style?: string; italic?: boolean;
  data?: string; read?(): Awaitable<Uint8Array>;
  system?: boolean; postscriptName?: string;
}
export interface PreparedPdfFont {
  bytes: Uint8Array; cids?: readonly number[]; postscriptName?: string; subset?: boolean;
}
/** Optional PDF font providers belong to the host, including their licenses. */
export interface PrintRealm {
  document?: Document;
  RapierMath?: {fit(root: Element): number};
  RapierImageAssets?: {sanitizeSvgText?(source: string): string};
  RapierExportFonts?: {
    preparePdfFont?(bytes: Uint8Array, text: string, style: CSSStyleDeclaration, face: PdfFontAsset,
      options: {subset?: FontSubsetter}): Awaitable<Uint8Array | PreparedPdfFont | null>;
    systemPdfFonts?(): Awaitable<PdfFontAsset[]>;
    maskPdfFont?(bytes: Uint8Array, glyphs: number[]): Awaitable<Uint8Array>;
  };
  RapierFontSubsetPlugin?: {subset: FontSubsetter};
  RapierDocxFonts?: {DOCX_FONTS: readonly PdfFontAsset[]};
}

/** Parser interfaces are shared with marks/assets and the bundled parser door. */
export type RenderToken = MarkdownToken;
export type RenderEnvironment = MarkdownEnvironment;
export type RenderMarkdownParser = MarkdownParser;
export type {MarkdownOptions} from './marks.mjs';

export interface MathDiagnostic {
  code: string; message: string; offset: number; command?: string; suggestion?: string;
  sourceOmitted?: boolean; messageTruncated?: boolean; commandTruncated?: boolean;
}
export interface MathSemantics {
  mathml: string;
  status: 'complete' | 'presentation-fallback' | 'refused';
  errors: MathDiagnostic[];
  source: {encoding: 'application/x-tex' | 'application/x-rapier-tex-utf16' | null; omitted?: boolean};
  metrics: {nodes: number; depth: number; outputCodeUnits: number; links: number};
}
export interface MathEquation {
  source: string; tex: string; displayMode: boolean; semantics: MathSemantics; errors: MathDiagnostic[];
}
export interface MathProvider {
  status: string;
  request?(): boolean | void;
  renderToString?(source: string, options: {displayMode: boolean}): string;
  renderWithMathML?(source: string, options: {displayMode: boolean}): {svg: string; semantics: MathSemantics; errors: MathDiagnostic[]};
}
export interface RenderProviders {
  math?: MathProvider;
  mermaid?: {status: string; request?(): boolean | void; renderToString?(source: string): Awaitable<string>};
}
export interface SemanticCarry {slugs?: Record<string, number>; headingIds?: readonly string[]; captions?: number; continued?: boolean;}
export interface SemanticOptions extends RenderWork {
  work?: RenderWork;
  carry?: SemanticCarry;
  imagePresentation?: boolean; passive?: boolean; page?: boolean; providers?: boolean;
  wikiEmbedding?: boolean; wikiLinks?: false | 'links' | 'label';
  mathEquations?: MathEquation[];
  maxNesting?: number; codeBudget?: number;
  parsed?: {tokens: RenderToken[]; env: RenderEnvironment};
}
export interface ProjectionOptions {
  baseName?: string;
  keepLayoutData?: boolean; inPlace?: boolean; keepMath?: boolean; keepDiagrams?: boolean; heldPictures?: boolean;
  work?: RenderWork;
}
export interface PlainTextOptions {visible?: boolean; inPre?: boolean; heldPictures?: boolean; finalNewline?: boolean; work?: RenderWork;}
export interface ClipboardOptions {
  formatted?: boolean; baseName?: string; work?: RenderWork;
  materialize?(semanticRoot: HTMLDivElement): Awaitable<boolean | void>;
}
export interface ClipboardPayload {plain: string; html?: string; withoutPictures?: (() => Promise<string>) | null;}
export interface SourceBlock {type: string; raw: string; _sourceStart?: number; _sourceEnd?: number; rendered?: string | null;}
export interface ImageGeometry {width: number; height: number;}
export interface MarkdownRenderer {
  /** A missing docKind uses the plain-document path; supply docKind: 'markdown' for Markdown. */
  render(source: string, metadata?: RenderMetadata): string;
  /** Throws when a ready math provider with renderToString and renderWithMathML is unavailable. */
  renderWithMathML(source: string, metadata?: RenderMetadata): {html: string; equations: MathEquation[]};
  /** Creates/configures the parser and replaces this instance's parser binding. */
  initMarkdownIt(): void;
  parser(): RenderMarkdownParser | null | undefined;
  _rapierReadPartDecorations(canonical: string, metadata: RenderMetadata, options?: SemanticOptions): Readonly<{headingIds: readonly string[]; captionStart: number}>;
  _rapierClipboardPayloadAsync(canonical: string, metadata: RenderMetadata, options?: ClipboardOptions): Promise<ClipboardPayload | null>;
  _rapierPlainTextFileAsync(context: RenderContext): Promise<string>;
  _rapierCloneRootAsync<T extends Node>(root: T, work?: RenderWork): Promise<T>;
  _rapierPortablePlainTextAsync(root: Element, options?: PlainTextOptions): Promise<string>;
  _rapierHeldPicturesAsWordsAsync<T extends Element>(root: T, work?: RenderWork): Promise<T>;
  _rapierRenderSemanticRootAsync(canonical: string, metadata: RenderMetadata, options?: SemanticOptions): Promise<HTMLDivElement>;
  _rapierProjectPortableRootAsync(semanticRoot: HTMLElement, options?: ProjectionOptions): Promise<HTMLElement>;
  _rapierPortableHtmlAsync(root: Element, work?: RenderWork): Promise<string>;
  _rapierCalloutInfo(blockquote: Element | null): {first: Element; type: string; existing: Element | null} | null;
  _rapierRemoveCalloutMarker(first: Element | null): void;
  _rapierMathSource(node: Element | null): string;
  _rapierFlattenPortableDetails(root: Element): void;
  _rapierProjectPortableRoot(semanticRoot: HTMLElement, options?: ProjectionOptions): HTMLElement;
  _rapierPortableHtml(root: Element): string;
  _rapierNormalizeInlineText(value: string): string;
  _rapierPortableInlineText(node: Node | null, options?: PlainTextOptions): string;
  _rapierPortableListText(list: Element, depth: number, options?: PlainTextOptions): string;
  _rapierPortableTableText(table: Element, options?: PlainTextOptions): string;
  _rapierPortablePlainText(root: Element, options?: PlainTextOptions): string;
  _rapierPlainTextFile(context: RenderContext): string;
  _rapierHeldPicturesAsWords<T extends Element>(root: T): T;
  _rapierSourceTokenValue(node: Element | null): string | null;
  _rapierResolveSoftBreakTokens<T extends Element>(root: T): T;
  _rapierInertParse(markups: readonly string[]): {doc: Document; boxes: Element[] | null};
  _rapierUnwrapElement(element: Element): void;
  _rapierBidiStrong(codePoint: number): 'L' | 'R' | null;
  _rapierSealBlockHtml(html: string): string;
  _rapierMergeForeignBlocks(blocks: SourceBlock[], source: string, parser: RenderMarkdownParser): SourceBlock[];
  _rapierRenderSemanticRoot(canonical: string, metadata: RenderMetadata, options?: SemanticOptions): HTMLDivElement;
  _rapierInstallSemanticProbe(instance: RenderMarkdownParser): void;
  _rapierApplyImageGeometry(image: HTMLImageElement, geometry?: ImageGeometry): boolean;
  _rapierImageAltSize(value: string): {alt: string; width: number} | null;
  _rapierImageAltSourceParts(value: string): {alt: string; width: number};
  _rapierImageAltText(value: string, environment?: RenderEnvironment): string;
  _rapierImageSizeAttributes(size: {width: number} | null, marker: string | null, geometry?: ImageGeometry, automatic?: boolean): string;
  _rapierRawHtmlFragment(source: string, rewrite: (tag: string) => string, parser: MarkdownParserInternals): string;
  _rapierApplyBlockDirection(root: Element): void;
  _rapierFirstStrongDir(text: string): 'ltr' | 'rtl';
  _rapierAssignHeadingSlugs(root: Element, selector?: string, reserveExisting?: boolean, taken?: Record<string, number> | null, assigned?: readonly string[] | null): void;
  _rapierDisambiguateRenderedAnchors(root: Element): void;
  _rapierDecodeHash(hash: string | null): string;
  _rapierDecorateJumpLists(root: Element, carry?: SemanticCarry | null): void;
  _rapierMarkFigureCaptions(root: Element): void;
  _rapierMarkListContinuations(blocks: Iterable<Element>, mark?: (element: Element, name: string) => void): void;
  _rapierMarkTableCaptions(root: Element, carry?: SemanticCarry | null): void;
  _rapierNormalizeCodeElement(code: Element): void;
  _rapierLanguageClass(element: Element): string;
  _relabelFootnoteHtml(html: string, labels: readonly string[]): string;
  _footnoteIdFromLabel(label: string): string;
  wrapDisplayMath(html: string): string;
}

export interface MarkdownRendererCommonHost {
  Node: Pick<typeof Node, 'ELEMENT_NODE' | 'TEXT_NODE'>;
  _rapierPrefixPortableAnchors: Renderer['_rapierPrefixPortableAnchors'];
  RAPIER_RENDERED_HEADING_SELECTOR: string;
  _rapierChromeOwnsId(id: string): boolean;
  _rapierDormantHeadings(root: ParentNode, selector: string, includeRoot?: boolean): Element[];
  _rapierEmbedAssetSource?(source: string): boolean;
  _rapierHeadingSlugBase(text: string): string;
  _rapierNextHeadingSlug(base: string, taken: Record<string, number>): string;
  _rapierMarkdownPreview?(source: string): string;
  _rapierProviders: RenderProviders;
  _rapierRemoteContent: RemoteContentPolicy;
  _rapierRemoteSubresourceOrigin(value: string): string;
  _rapierRenderedAnchorOriginalIds: WeakMap<Element, string>;
  _rapierSplitOpeningFrontmatter(source: string): {body: string; bodyOffset?: number};
  document: Document;
  escapeRapierHtmlText(value: unknown): string;
  globalThis: Partial<MarkdownRealm>;
  sanitizeRapierHtml(value: string, context?: SanitizeContext): string;
  sanitizeRapierFragment?(value: string, context?: SanitizeContext): DocumentFragment;
  parseAsync?(source: string, options: SemanticOptions): Awaitable<{tokens: RenderToken[]; env: RenderEnvironment}>;
  prefixAnchorsSteps?: Renderer['_rapierPrefixPortableAnchorsSteps'];
}
/** Parser installation and image/typography helpers use these ports. A prebound parser can omit unused helpers. */
export interface MarkdownInitializationPorts {
  RAPIER_HIGHLIGHT_COLOR_BY_MARKER: Readonly<Record<string, string>>;
  RAPIER_MARKDOWN_SPEC: {options: MarkdownOptions; rules: {mathBlock: string}};
  _rapierApplyMarkdownSpec(parser: RenderMarkdownParser, window: MarkdownWindow): void;
  _rapierCodeHtml(source: string, language: string): string;
  _rapierDeriveDarkColor(color: string): string;
  _rapierHighlightAdmitted(source: string): boolean;
  _rapierInstallMarkdownMath(parser: RenderMarkdownParser, blockRule: string): void;
  _rapierPlainLayout(): boolean;
  _rapierRemoteImagePlaceholder(source: string, alt: string, title: string, size: {alt: string; width: number} | null, layout: string, rawAlt: string): string;
  _rapierSourceCharEscaped(source: string, index: number): boolean;
  _rapierUiDiagram?: {request(): void};
  _rapierUiMath?: {request(): void};
}
export type PreboundMarkdownRendererHost = MarkdownRendererCommonHost & Partial<MarkdownInitializationPorts> & {
  md: RenderMarkdownParser;
  window?: Pick<Window, 'addEventListener'>;
};
export type ConstructedMarkdownRendererHost = MarkdownRendererCommonHost & MarkdownInitializationPorts & {
  md?: null;
  window: MarkdownWindow;
  globalThis: MarkdownRealm;
  _rapierSplitOpeningFrontmatter(source: string): {body: string; bodyOffset: number};
};
export type MarkdownRendererHost = PreboundMarkdownRendererHost | ConstructedMarkdownRendererHost;
export interface MarkdownWindow extends Pick<Window, 'addEventListener'> {
  markdownit(options: MarkdownOptions): RenderMarkdownParser;
}
export function createMarkdownRenderer(host: MarkdownRendererHost): MarkdownRenderer;

export interface CapturedDocument {
  canonical: string;
  metadata: RenderMetadata;
  baseName: string;
  ledger?: LedgerEnvelope | null;
  carried?: string;
  comparisonBase?: ComparisonBase | null;
  work?: RenderWork;
}
export interface RenderContext extends CapturedDocument {semanticRoot: HTMLElement;}
export interface StyledProjectionOptions extends ProjectionOptions {metadata?: RenderMetadata; print?: boolean;}
export interface ArtifactOptions {
  kind?: 'standalone' | 'page' | 'publishing' | 'fragment';
  print?: boolean;
  scripts?: boolean;
  extraCss?: string;
  work?: RenderWork;
  willFont?: WillCarrierFont | null;
  afterRoot?(root: HTMLElement): Awaitable<void>;
  afterFonts?(root: HTMLElement, style: {
    css: string; fontCss: string; settings: RenderDocumentSettings | null; language: string; theme: RenderTheme;
  }): Awaitable<void>;
}
export interface RenderedArtifact extends HtmlArtifact {
  metadata: RenderMetadata;
  bodyHtml?: string; css?: string; fontCss?: string;
  fontRequests?: FontRequest[];
  settings?: RenderDocumentSettings | null;
  templatePage?: TemplatePage | null;
  docClass?: string; language?: string; documentTitle?: string;
}
export interface SharedSourceForms {resolved: string; carried: string; ids: string[]; definitions: string[];}
export interface SharedDocument {
  source: string; filename: string; kind: DocumentKind; bom: boolean;
  ledger?: LedgerEnvelope | null; authorship?: AuthorshipEnvelope | null;
  comparisonBase: ComparisonBase | null;
}
export interface ImageRun {open: string; close: string;}
export interface MarkdownImageSource {
  kind: 'inline' | 'reference'; start: number; end: number;
  source: string; altStart?: number; altEnd?: number; parenStart?: number; innerStart?: number; innerEnd?: number;
  altSource?: string; destinationSource?: string; titleSource?: string; referenceSource?: string;
  renderIndex?: number; reference?: string; destination?: string | null; title?: string;
  openRuns?: ImageRun[]; tokenEnd?: number; layoutStart?: number; placementSource?: string; placement?: Layout;
}
export interface HtmlImageSource {
  htmlBlock: true; renderIndex: 0; alt: string; altSource: ''; tokenEnd: number;
  source: string; start: number; end: number; fenceEnd: number;
  info: string; body: string; infoStart: number; infoEnd: number;
  attrs: {id?: string; viewport?: string; overflow?: 'clip'; [name: string]: string | undefined};
  layout: Layout; placement: Layout;
  marker: {start: number; end: number; text: string} | null;
  standalone: true; imageOnly: true;
}
export interface ImageDestination {
  start: number; end: number; outerStart: number; outerEnd: number; delimited: boolean;
  destination: string; source: string; image?: MarkdownImageSource; reference?: string; title?: string;
}
export interface ArtifactFactories {
  factories: Record<string, () => object>;
  groups?: Record<string, readonly string[]>;
  inkLicense?: string;
}
export interface ArtifactLayoutSession {reflow(): void; destroy(options?: {documentChanged?: boolean}): void;}
export interface Renderer {
  /** Writes an offline HTML page. Rejects invalid source/filename, unavailable resources, or host cancellation. */
  render(source: string, options?: RenderOptions): Promise<HtmlArtifact>;
  _rapierDataImageDestinationsAsync(source: string, work?: RenderWork): Promise<ImageDestination[]>;
  _rapierSharedSourceFormsAsync(source: string, root: Element, work?: RenderWork): Promise<SharedSourceForms>;
  _rapierPrefixPortableAnchorsSteps(root: Element, baseName: string): Generator<void, void, unknown>;
  _rapierPortableAnchorId(baseName: string, id: string): string;
  _rapierProjectStyledRootAsync(semanticRoot: HTMLElement, options?: StyledProjectionOptions): Promise<HTMLElement>;
  _rapierBuildArtifact(options?: ArtifactOptions, providedContext?: RenderContext): Promise<RenderedArtifact>;
  _rapierBuildPublishedPage(context: RenderContext): Promise<RenderedArtifact>;
  _rapierProjectStyledRoot(semanticRoot: HTMLElement, options?: StyledProjectionOptions): HTMLElement;
  _rapierDocxRenderStyles(root: HTMLElement): void;
  _rapierPaintCode(element: Element, html: string): void;
  _rapierPrefixPortableAnchors(root: Element, baseName: string): void;
  _rapierDocumentSettingsOf(canonical: string): RenderDocumentSettings | null;
  _rapierDocumentSettingsCss(settings: RenderDocumentSettings | null): string;
  _rapierExportedPageCsp(nonce: string, fonts: boolean): string;
  _rapierArtifactNonce(): string;
  _rapierAnnotateExportBoxPolygons(root: Element): void;
  _rapierSharedSourceHash(source: string, work?: RenderWork | null): Promise<string>;
  _rapierSharedSourceForms(source: string, root: Element): SharedSourceForms;
  _rapierSharedSourceCarrier(context: CapturedDocument, root: Element): Promise<string>;
  _rapierSharedResolve(text: string, ids: string[], images: Map<string, string | null>, definitions: Set<string>): {text: string; broken: boolean};
  _rapierReadSharedDocument(text: string, filename: string): Promise<SharedDocument | null>;
  _rapierSharedPageFallbackCss(clearOnly?: boolean): string;
  _rapierShareWrapKind(element: Element): 'prose' | 'picture' | 'metadata' | null;
  _rapierSharePictureParagraph(image: HTMLImageElement): HTMLParagraphElement | null;
  _rapierSharedPageLayout(root: HTMLElement): void;
  _rapierShareCapLongCodeBlocks(root: HTMLElement): void;
  _rapierRequireOfflinePageImages(root: Element): Promise<void>;
  _rapierCssValueUrls(value: string): string[] | null;
  _rapierBuildSharedPage(captured: CapturedDocument): Promise<FileArtifact>;
  _rapierImageSources(tokens: readonly RenderToken[] | null | undefined): Set<string>;
  _rapierImageDestinations(source: string, accepts: (url: string) => boolean): ImageDestination[];
  _rapierScanMarkdownImages(source: string, parsedTokens?: RenderToken[] | null): (MarkdownImageSource | HtmlImageSource)[];
  _rapierParseMarkdownImageDestination(inner: string): {destination: string; title: string};
  _rapierImageOpenRunsList(tokens: readonly RenderToken[]): ImageRun[][];
  _rapierArtifactFactoryModules(dependencies: ArtifactFactories, group: string): string;
  _rapierProjectArtifactLayout(root: HTMLElement, metadata: typeof import('./layout.mjs'), geometry: typeof import('./model.mjs'), preparation: Pick<typeof import('./model.mjs'), 'createPreparationScope'>): Readonly<ArtifactLayoutSession> | null;
  _rapierArtifactLayoutScript(root: Element, nonce?: string, options?: {pictures?: boolean}): string;
  _rapierArtifactInkScript(root: Element, nonce?: string): string;
}

/** Feature ports may be omitted when the host refuses source/options requiring that feature. */
export interface RendererHostPorts {
  RapierPageReturnAddress: {PAGE_SEED: string};
  RapierTextCodec: {normalizeDocument(source: string): string; maxDocumentBytes: number};
  _rapierArtifactHighlight(source: string, language: string): string;
  _rapierArtifactPreference(name: string, values: readonly string[]): string;
  _rapierArtifactStyles: RenderStyles['_rapierArtifactStyles'];
  _rapierBlobDataUrl?(blob: Blob): Awaitable<string>;
  _rapierBuildInterchangeContext?(options: ArtifactOptions): RenderContext;
  _rapierDocumentNameIsAdmissible(filename: string): boolean;
  _rapierLedgerParts?(source: string, ledger?: LedgerEnvelope | null, carried?: string): DocumentParts;
  _rapierDrawReadSVGRecipe?(source: string): DrawingRecipe | null;
  _rapierDrawShapeProfileFor?(recipe: DrawingRecipe, glyphs: ShapeProfile | null): ShapeProfile | null;
  _rapierExportFontCss?(root: Element, options: HostExportFontOptions): Awaitable<string>;
  _rapierFillDiagram?(element: Element, force?: boolean): Awaitable<void>;
  _rapierFinalizeExportCode?(root: Element): Awaitable<void>;
  _rapierLanguageClass(element: Element): string;
  _rapierLineStartOffsets?(source: string): number[];
  _rapierMarkdownEnvironment?(): RenderEnvironment;
  _rapierPortableHtml: MarkdownRenderer['_rapierPortableHtml'];
  _rapierPrepareInterchangeContext(options: {kind: 'share'}, captured: CapturedDocument): Awaitable<RenderContext>;
  _rapierProjectPortableRoot: MarkdownRenderer['_rapierProjectPortableRoot'];
  _rapierProjectPortableRootAsync?: MarkdownRenderer['_rapierProjectPortableRootAsync'];
  _rapierPortableHtmlAsync?: MarkdownRenderer['_rapierPortableHtmlAsync'];
  _rapierProviders?: RenderProviders;
  _rapierSourceCharEscaped?(source: string, index: number): boolean;
  _rapierSourceLineSpan?(source: string, starts: readonly number[], startLine: number, endLine: number): {start: number; end: number};
  crypto: Pick<Crypto, 'getRandomValues' | 'subtle'>;
  document: Document;
  escapeRapierHtmlText(value: unknown): string;
  globalThis: RenderRealm;
  sanitizeRapierHtml(value: string, context?: SanitizeContext): string;
  md: RenderMarkdownParser;
  materializeDocumentFonts?(source: string, options: {parser: RenderMarkdownParser}): Awaitable<string>;
  validateFont?: FontValidator;
  dataImageDestinationsAsync?(source: string, work?: RenderWork): Awaitable<ImageDestination[]>;
}
/** A ledger module and the callback that supplies its document parts are one capability. */
export type RendererHost = RendererHostPorts & (
  {RapierLedgerCarried?: null; _rapierLedgerParts?: RendererHostPorts['_rapierLedgerParts']}
  | {RapierLedgerCarried: typeof import('./ledger/carried.mjs'); _rapierLedgerParts: NonNullable<RendererHostPorts['_rapierLedgerParts']>}
);
export function createRenderer<Host extends RendererHost>(host: Host): Renderer;

/** These are the recipe fields read here; the drawing provider may retain more data. */
export interface DrawingRecipe {
  canvas: {w: number; h: number};
  view?: {x: number; y: number; w: number; h: number};
  shapes: readonly {recognized?: string; label?: string}[];
}

export interface RenderImageAssets extends Pick<typeof import('./assets.mjs'), 'dataImage' | 'installMarkdownImages' | 'configureParser'> {
  decodeDataImageBytes(source: string): {bytes: Uint8Array};
  drawingImageAlt(source: string): string | null;
  imagePlaceholderDimensions(source: string): ImageGeometry | null;
  isJxl?(bytes: Uint8Array): boolean;
  sanitizeSvgText?(source: string): string;
  imageAnimation?(source: string): {first: string; width: number; height: number} | null;
}

export interface MarkdownRealm {
  document?: Document;
  location?: Pick<Location, 'href'>;
  RapierMarkdownSpec: typeof import('./marks.mjs');
  RapierMarkdownLayout: typeof import('./layout.mjs');
  RapierImageAssets: RenderImageAssets;
  RapierEmbedPictureBase?: ((source: string) => string | null) & {vouched?: Set<string>};
  RapierSiblingPictures?: Set<string>;
  RapierPlatform?: {files: {relativeCandidate?(source: string): boolean}};
  RapierOriginalFolderCore?: {currentOriginal(): null | {
    embed(href: string): Promise<{text: string; displayPath: string}>;
    addressFrom(displayPath: string, address: string): Promise<string>;
  }};
  RapierEmbeddedImages?: {
    imageHtml(reference: string | null | undefined, alt: string, title: string, size: {alt: string; width: number} | null,
      layout: string, rawAlt: string, source: string | undefined, url: string, presentation: boolean): string;
    geometry?(source: string): ImageGeometry | null;
  };
  RapierFlowchart?: {parseFlowchart(source: string): {ok: boolean}};
  rapierRenderPreview?(source: string): string;
}

/** Host-supplied module capabilities. Optional feature ports retain their own licenses. */
export interface RenderRealm {
  document?: Document;
  navigator?: Pick<Navigator, 'language'>;
  location?: Pick<Location, 'href'>;
  RapierMarkdownSpec?: typeof import('./marks.mjs') & {
    readDocumentSettings?(source: string): RenderDocumentSettings | null;
    documentSettingsStyle?(settings: RenderDocumentSettings): string;
    documentSettingsPageRule?(settings: RenderDocumentSettings): string | null;
    documentTitle?(settings: RenderDocumentSettings): string;
    wordListLevel?(style: string): number;
    wordListIsMarker?(style: string): boolean;
  };
  RapierMarkdownLayout?: typeof import('./layout.mjs');
  RapierImageLayout?: typeof import('./model.mjs');
  RapierImageAssets?: RenderImageAssets;
  RapierEmbedPictureBase?: ((source: string) => string | null) & {vouched?: Set<string>};
  RapierSiblingPictures?: Set<string>;
  RapierPlatform?: {files: {relativeCandidate?(source: string): boolean}};
  RapierOriginalFolderCore?: {currentOriginal(): null | {
    embed(href: string): Promise<{text: string; displayPath: string}>;
    addressFrom(displayPath: string, address: string): Promise<string>;
  }};
  RapierArtifactLayoutDependencies?: ArtifactFactories;
  RapierMath?: {fit(root: Element): number};
  rapierRenderPreview?(source: string): string;
}

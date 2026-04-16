/**
 * MarkView Renderer — Universal JavaScript rendering engine
 *
 * Shared module for all web surfaces: Teams, SharePoint, Outlook, Chrome extension.
 * Uses marked.js for markdown parsing, DOMPurify for XSS sanitization,
 * mermaid.js for diagrams (lazy-loaded), and KaTeX for math (lazy-loaded).
 *
 * API:
 *   markviewRender(markdown, options)              -> sanitized HTML string
 *   markviewRenderToElement(el, markdown, options)  -> renders into DOM element
 *   markviewSetTheme(theme, scheme)                -> apply color scheme
 *   markviewGetCSS()                               -> theme stylesheet URL
 *
 * Options: { theme, scheme, width, showToc, mermaidTheme, katexEnabled }
 */

/* global marked, DOMPurify, mermaid, katex */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

var MARKVIEW_CDN = 'https://cdn.jsdelivr.net/npm';
var MERMAID_VERSION = '11';
var KATEX_VERSION = '0.16';

// In Chrome extension context, CDN script loading is blocked by CSP.
// Native render via markview.exe handles mermaid/katex, so skip CDN attempts.
var _inExtension = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);

var _mermaidLoaded = false;
var _mermaidLoading = false;
var _katexLoaded = false;
var _katexLoading = false;

// DOMPurify config shared across all sanitization calls
var PURIFY_CONFIG = {
    ADD_TAGS: ['foreignObject', 'math', 'semantics', 'mrow', 'mi', 'mo', 'mn',
        'msup', 'msub', 'mfrac', 'munderover', 'mspace', 'mtext', 'annotation'],
    ADD_ATTR: ['target', 'data-mv-theme', 'data-mv-scheme', 'mathvariant',
        'encoding', 'xmlns'],
    ALLOW_DATA_ATTR: true
};

// ---------------------------------------------------------------------------
// Core render function
// ---------------------------------------------------------------------------

/**
 * Render markdown to a sanitized HTML string.
 * Does NOT process mermaid or KaTeX (those require DOM; use markviewRenderToElement).
 *
 * @param {string} markdown - Raw markdown text
 * @param {object} [options] - Render options
 * @returns {string} Sanitized HTML string
 */
function markviewRender(markdown, options) {
    options = options || {};
    var theme = options.theme || 'light';
    var scheme = options.scheme || 'default';
    var showToc = options.showToc || false;

    if (typeof marked === 'undefined') {
        return '<pre>' + _escapeHtml(markdown) + '</pre>';
    }

    var html = marked.parse(markdown, { gfm: true, breaks: true });

    var tocHtml = '';
    if (showToc) {
        tocHtml = _generateToc(html);
    }

    var output = '<div class="mv-root" data-mv-theme="' + _escapeAttr(theme) +
        '" data-mv-scheme="' + _escapeAttr(scheme) + '">';
    if (tocHtml) output += tocHtml;
    output += html;
    output += '</div>';

    if (typeof DOMPurify !== 'undefined') {
        output = DOMPurify.sanitize(output, Object.assign({}, PURIFY_CONFIG, {RETURN_DOM: false}));
    }

    return output;
}

/**
 * Render markdown into a DOM element with full post-processing
 * (mermaid diagrams, KaTeX math, Drive image URL rewriting).
 *
 * @param {HTMLElement} el - Target container element
 * @param {string} markdown - Raw markdown text
 * @param {object} [options] - Render options
 * @returns {Promise<void>}
 */
async function markviewRenderToElement(el, markdown, options) {
    options = options || {};
    var html = markviewRender(markdown, options);

    el.replaceChildren();
    if (typeof DOMPurify !== 'undefined') {
        var fragment = DOMPurify.sanitize(html, Object.assign({}, PURIFY_CONFIG, {RETURN_DOM_FRAGMENT: true}));
        el.appendChild(fragment);
    } else {
        el.textContent = markdown;
        return;
    }

    _fixDriveImageUrls(el);

    // Lazy-load and render mermaid diagrams
    var mermaidBlocks = el.querySelectorAll('code.language-mermaid');
    if (mermaidBlocks.length > 0) {
        await _renderMermaidBlocks(el, mermaidBlocks, options.mermaidTheme || 'default');
    }

    // Lazy-load and render KaTeX math
    if (options.katexEnabled !== false) {
        if (_textContainsMath(el.textContent)) {
            await _renderKatexMath(el);
        }
    }
}

// ---------------------------------------------------------------------------
// Theme management
// ---------------------------------------------------------------------------

function markviewSetTheme(theme, scheme) {
    document.body.setAttribute('data-mv-theme', theme);
    if (scheme) document.body.setAttribute('data-mv-scheme', scheme);
    var roots = document.querySelectorAll('.mv-root');
    for (var i = 0; i < roots.length; i++) {
        roots[i].setAttribute('data-mv-theme', theme);
        if (scheme) roots[i].setAttribute('data-mv-scheme', scheme);
    }
}

function markviewGetCSS() {
    return 'markview-themes.css';
}

// ---------------------------------------------------------------------------
// Table of Contents
// ---------------------------------------------------------------------------

function _generateToc(html) {
    var re = /<h([1-6])\s+id="([^"]*)"[^>]*>(.*?)<\/h[1-6]>/gi;
    var m;
    var items = [];
    while ((m = re.exec(html)) !== null) {
        items.push({ level: parseInt(m[1], 10), id: m[2], text: m[3].replace(/<[^>]+>/g, '') });
    }
    if (items.length === 0) return '';

    var toc = '<nav class="mv-toc"><h2>Table of Contents</h2><ul>';
    for (var i = 0; i < items.length; i++) {
        toc += '<li class="toc-level-' + items[i].level + '">' +
            '<a href="#' + _escapeAttr(items[i].id) + '">' + _escapeHtml(items[i].text) + '</a></li>';
    }
    return toc + '</ul></nav>';
}

// ---------------------------------------------------------------------------
// Mermaid (lazy-loaded)
// ---------------------------------------------------------------------------

function _loadMermaid() {
    if (_inExtension) return Promise.resolve(false);
    if (_mermaidLoaded) return Promise.resolve(true);
    if (_mermaidLoading) {
        return new Promise(function(resolve) {
            var t = setInterval(function() {
                if (_mermaidLoaded || !_mermaidLoading) { clearInterval(t); resolve(_mermaidLoaded); }
            }, 100);
        });
    }
    _mermaidLoading = true;
    return new Promise(function(resolve) {
        var s = document.createElement('script');
        s.src = MARKVIEW_CDN + '/mermaid@' + MERMAID_VERSION + '/dist/mermaid.min.js';
        s.onload = function() { _mermaidLoaded = true; _mermaidLoading = false; resolve(true); };
        s.onerror = function() { _mermaidLoading = false; resolve(false); };
        document.head.appendChild(s);
    });
}

async function _renderMermaidBlocks(container, codeBlocks, theme) {
    var loaded = await _loadMermaid();
    if (!loaded || typeof mermaid === 'undefined') return;

    mermaid.initialize({ startOnLoad: false, theme: theme === 'dark' ? 'dark' : 'default', securityLevel: 'strict' });

    for (var j = 0; j < codeBlocks.length; j++) {
        var code = codeBlocks[j];
        var source = code.textContent;
        var pre = code.parentElement;

        // Honor %%{init: {...}}%% directives (matching desktop D2D behavior)
        var initMatch = source.match(/%%\{init:\s*(\{[\s\S]*?\})\s*\}%%/);
        if (initMatch) {
            try {
                var cfg = JSON.parse(initMatch[1].replace(/'/g, '"'));
                mermaid.initialize(Object.assign({ startOnLoad: false, securityLevel: 'strict' }, cfg));
            } catch (_e) { /* ignore invalid directives */ }
        }

        var div = document.createElement('div');
        div.className = 'mermaid';
        div.textContent = source;
        if (pre && pre.parentElement) pre.parentElement.replaceChild(div, pre);
    }

    try {
        await mermaid.run({ nodes: container.querySelectorAll('.mermaid') });
    } catch (e) {
        console.warn('[MarkView] Mermaid error:', e);
    }
}

// ---------------------------------------------------------------------------
// KaTeX math (lazy-loaded)
// ---------------------------------------------------------------------------

function _textContainsMath(text) {
    return /\$[^$\n]+\$/.test(text) || /\$\$[\s\S]+?\$\$/.test(text);
}

function _loadKatex() {
    if (_inExtension) return Promise.resolve(false);
    if (_katexLoaded) return Promise.resolve(true);
    if (_katexLoading) {
        return new Promise(function(resolve) {
            var t = setInterval(function() {
                if (_katexLoaded || !_katexLoading) { clearInterval(t); resolve(_katexLoaded); }
            }, 100);
        });
    }
    _katexLoading = true;

    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = MARKVIEW_CDN + '/katex@' + KATEX_VERSION + '/dist/katex.min.css';
    document.head.appendChild(link);

    return new Promise(function(resolve) {
        var s = document.createElement('script');
        s.src = MARKVIEW_CDN + '/katex@' + KATEX_VERSION + '/dist/katex.min.js';
        s.onload = function() { _katexLoaded = true; _katexLoading = false; resolve(true); };
        s.onerror = function() { _katexLoading = false; resolve(false); };
        document.head.appendChild(s);
    });
}

async function _renderKatexMath(container) {
    var loaded = await _loadKatex();
    if (!loaded || typeof katex === 'undefined') return;

    var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    var textNodes = [];
    var n;
    while ((n = walker.nextNode())) {
        if (n.textContent.indexOf('$') >= 0) textNodes.push(n);
    }

    for (var i = 0; i < textNodes.length; i++) {
        var text = textNodes[i].textContent;
        var parent = textNodes[i].parentElement;
        if (parent && (parent.tagName === 'CODE' || parent.tagName === 'PRE')) continue;

        if (!/\$/.test(text)) continue;

        // Replace display math ($$...$$) then inline math ($...$)
        var result = text.replace(/\$\$([\s\S]+?)\$\$/g, function(_, expr) {
            try { return katex.renderToString(expr.trim(), { displayMode: true, throwOnError: false }); }
            catch (_e) { return _; }
        }).replace(/\$([^$\n]+?)\$/g, function(_, expr) {
            try { return katex.renderToString(expr.trim(), { displayMode: false, throwOnError: false }); }
            catch (_e) { return _; }
        });

        if (result !== text) {
            var span = document.createElement('span');
            // Sanitize KaTeX output (MathML tags)
            if (typeof DOMPurify !== 'undefined') {
                span.appendChild(DOMPurify.sanitize(result, Object.assign({}, PURIFY_CONFIG, {RETURN_DOM_FRAGMENT: true})));
            } else {
                span.textContent = result;
            }
            textNodes[i].parentElement.replaceChild(span, textNodes[i]);
        }
    }
}

// ---------------------------------------------------------------------------
// Drive image URL fix
// ---------------------------------------------------------------------------

/**
 * Fix image URLs in rendered content.
 * Tier 1: Rewrite Drive viewer URLs to direct content URLs.
 * Tier 2: For broken relative images, try resolving from the file's
 *         parent folder (via _driveParentFiles lookup if available).
 * Tier 3: For local files, resolve from _imageBaseDir if set.
 */
function _fixDriveImageUrls(container) {
    var imgs = container.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
        var src = imgs[i].getAttribute('src') || '';

        // Tier 1: Rewrite Drive viewer URLs
        var m = src.match(/drive\.google\.com\/file\/d\/([^/]+)\/(view|preview)/);
        if (m) { imgs[i].setAttribute('src', 'https://drive.google.com/uc?id=' + m[1] + '&export=view'); continue; }
        var m2 = src.match(/drive\.google\.com\/open\?id=([^&]+)/);
        if (m2) { imgs[i].setAttribute('src', 'https://drive.google.com/uc?id=' + m2[1] + '&export=view'); continue; }

        // Tier 2: For relative paths on Drive, add onerror fallback
        if (_driveParentFiles && !src.startsWith('http') && !src.startsWith('data:')) {
            (function(img, filename) {
                var basename = filename.split('/').pop();
                var found = _driveParentFiles[basename.toLowerCase()];
                if (found) {
                    img.setAttribute('src', 'https://drive.google.com/uc?id=' + found + '&export=view');
                }
            })(imgs[i], src);
            continue;
        }

        // Tier 3: For local files with _markviewLocalImages map
        if (!src.startsWith('http') && !src.startsWith('data:') && typeof window !== 'undefined' && window._markviewLocalImages) {
            var basename3 = src.split('/').pop().toLowerCase();
            var localUrl = window._markviewLocalImages[basename3];
            if (localUrl) {
                imgs[i].setAttribute('src', localUrl);
            }
        }
    }
}

// Drive parent folder file index: { "filename.png": "driveFileId", ... }
// Populated by the content script after calling the Drive API.
var _driveParentFiles = null;

// Local image base directory handle (File System Access API)
// Set by the "File > Image Location" menu action.
var _imageBaseDir = null;

/**
 * Set the Drive parent folder file lookup table.
 * Called by the Chrome extension content script after listing the
 * parent folder via the Google Drive API.
 *
 * @param {Object} fileMap - { "filename.png": "driveFileId", ... }
 */
function markviewSetDriveFiles(fileMap) {
    _driveParentFiles = fileMap;
}

function markviewGetDriveFiles() {
    return _driveParentFiles;
}

/**
 * Set the local image base directory.
 * Called by the "File > Image Location" menu action.
 *
 * @param {FileSystemDirectoryHandle} dirHandle
 */
function markviewSetImageDir(dirHandle) {
    _imageBaseDir = dirHandle;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function _escapeHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function _escapeAttr(s) { return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { markviewRender: markviewRender, markviewRenderToElement: markviewRenderToElement, markviewSetTheme: markviewSetTheme, markviewGetCSS: markviewGetCSS, markviewSetDriveFiles: markviewSetDriveFiles, markviewGetDriveFiles: markviewGetDriveFiles, markviewSetImageDir: markviewSetImageDir };
}
if (typeof window !== 'undefined') {
    window.markviewRender = markviewRender;
    window.markviewRenderToElement = markviewRenderToElement;
    window.markviewSetTheme = markviewSetTheme;
    window.markviewGetCSS = markviewGetCSS;
    window.markviewSetDriveFiles = markviewSetDriveFiles;
    window.markviewGetDriveFiles = markviewGetDriveFiles;
    window.markviewSetImageDir = markviewSetImageDir;
}

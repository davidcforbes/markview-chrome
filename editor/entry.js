/**
 * CodeMirror 6 bundle entry point for MarkView.
 *
 * Builds into codemirror-bundle.js via esbuild.
 * Exports window.markviewCreateEditor(parent, options).
 */
import { EditorView, basicSetup } from 'codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { oneDark } from '@codemirror/theme-one-dark';
import { keymap } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';

// ---------------------------------------------------------------------------
// Formatting helpers — CodeMirror transaction-based
// ---------------------------------------------------------------------------

function wrapSelection(view, before, after) {
  if (after === undefined) after = before;
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const replacement = before + selected + after;
  view.dispatch({
    changes: { from, to, insert: replacement },
    selection: { anchor: from + before.length, head: from + before.length + selected.length }
  });
  view.focus();
}

function prependLines(view, prefix) {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc;
  const startLine = doc.lineAt(from).number;
  const endLine = doc.lineAt(to).number;
  const changes = [];
  for (let i = startLine; i <= endLine; i++) {
    const line = doc.line(i);
    changes.push({ from: line.from, to: line.from, insert: prefix });
  }
  view.dispatch({ changes });
  view.focus();
}

function numberedList(view) {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc;
  const startLine = doc.lineAt(from).number;
  const endLine = doc.lineAt(to).number;
  const changes = [];
  let num = 1;
  for (let i = startLine; i <= endLine; i++) {
    const line = doc.line(i);
    changes.push({ from: line.from, to: line.from, insert: num + '. ' });
    num++;
  }
  view.dispatch({ changes });
  view.focus();
}

function insertAtCursor(view, text) {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length }
  });
  view.focus();
}

function insertLink(view) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  if (selected.length > 0) {
    const replacement = '[' + selected + '](url)';
    view.dispatch({
      changes: { from, to, insert: replacement },
      selection: { anchor: from + selected.length + 3, head: from + selected.length + 6 }
    });
  } else {
    const template = '[text](url)';
    view.dispatch({
      changes: { from, to, insert: template },
      selection: { anchor: from + 1, head: from + 5 }
    });
  }
  view.focus();
}

// Formatting command map (used by toolbar and keybindings)
const formatCommands = {
  bold: (view) => wrapSelection(view, '**'),
  italic: (view) => wrapSelection(view, '*'),
  strikethrough: (view) => wrapSelection(view, '~~'),
  inlineCode: (view) => wrapSelection(view, '`'),
  h1: (view) => prependLines(view, '# '),
  h2: (view) => prependLines(view, '## '),
  h3: (view) => prependLines(view, '### '),
  bulletList: (view) => prependLines(view, '- '),
  numberedList: (view) => numberedList(view),
  taskList: (view) => prependLines(view, '- [ ] '),
  link: (view) => insertLink(view),
  image: (view) => insertAtCursor(view, '![alt](url)'),
  codeBlock: (view) => insertAtCursor(view, '\n```\n\n```\n'),
  blockquote: (view) => prependLines(view, '> '),
  horizontalRule: (view) => insertAtCursor(view, '\n---\n'),
};

// ---------------------------------------------------------------------------
// Formatting toolbar
// ---------------------------------------------------------------------------

function createFormatToolbar(view, theme) {
  var bar = document.createElement('div');
  bar.className = 'mv-format-bar';
  bar.style.cssText = 'display:flex;gap:4px;padding:4px 8px;background:var(--mv-toolbar-bg,#fff);border-bottom:1px solid var(--mv-border,#e1e4e8);flex-wrap:wrap;box-sizing:border-box';

  var buttons = [
    { label: 'B', title: 'Bold (Ctrl+B)', style: 'font-weight:bold', cmd: 'bold' },
    { label: 'I', title: 'Italic (Ctrl+I)', style: 'font-style:italic', cmd: 'italic' },
    { label: 'S', title: 'Strikethrough', style: 'text-decoration:line-through', cmd: 'strikethrough' },
    { label: '<>', title: 'Inline Code', style: 'font-family:monospace', cmd: 'inlineCode' },
    { label: 'H1', title: 'Heading 1', style: 'font-weight:bold;font-size:11px', cmd: 'h1' },
    { label: 'H2', title: 'Heading 2', style: 'font-weight:bold;font-size:10px', cmd: 'h2' },
    { label: 'H3', title: 'Heading 3', style: 'font-weight:bold;font-size:9px', cmd: 'h3' },
    { label: '\u2022', title: 'Bullet List', style: '', cmd: 'bulletList' },
    { label: '1.', title: 'Numbered List', style: '', cmd: 'numberedList' },
    { label: '\u2610', title: 'Task List', style: '', cmd: 'taskList' },
    { label: '\uD83D\uDD17', title: 'Link (Ctrl+K)', style: '', cmd: 'link' },
    { label: '\uD83D\uDDBC', title: 'Image', style: '', cmd: 'image' },
    { label: '```', title: 'Code Block', style: 'font-family:monospace;font-size:10px', cmd: 'codeBlock' },
    { label: '>', title: 'Blockquote', style: 'font-weight:bold', cmd: 'blockquote' },
    { label: '\u2500', title: 'Horizontal Rule', style: '', cmd: 'horizontalRule' },
  ];

  buttons.forEach(function(spec) {
    var btn = document.createElement('button');
    btn.textContent = spec.label;
    btn.title = spec.title;
    btn.style.cssText = 'background:none;border:1px solid var(--mv-border,#ccc);color:var(--mv-toolbar-text,#24292e);cursor:pointer;padding:2px 6px;border-radius:3px;font-size:12px;line-height:1.2;min-width:24px;text-align:center;transition:background 0.15s;' + (spec.style || '');
    btn.addEventListener('mouseenter', function() { btn.style.background = 'var(--mv-toolbar-btn-hover,#f0f0f0)'; });
    btn.addEventListener('mouseleave', function() { btn.style.background = 'none'; });
    btn.addEventListener('click', function() {
      var cmd = formatCommands[spec.cmd];
      if (cmd) cmd(view);
    });
    bar.appendChild(btn);
  });

  return bar;
}

// ---------------------------------------------------------------------------
// Theme compartment for live switching
// ---------------------------------------------------------------------------

const themeCompartment = new Compartment();

function getThemeExtension(theme) {
  return theme === 'dark' ? oneDark : EditorView.theme({});
}

// ---------------------------------------------------------------------------
// Public API: markviewCreateEditor
// ---------------------------------------------------------------------------

function markviewCreateEditor(parent, options) {
  options = options || {};
  var content = options.content || '';
  var theme = options.theme || 'light';
  var onChange = options.onChange || null;
  var onSave = options.onSave || null;

  // Create container
  var container = document.createElement('div');
  container.className = 'mv-editor-container';
  container.style.cssText = 'display:flex;flex-direction:column;height:100%';

  // Create editor holder
  var editorHolder = document.createElement('div');
  editorHolder.className = 'mv-editor-holder';
  editorHolder.style.cssText = 'flex:1;overflow:hidden';

  // Debounced onChange
  var changeTimer = null;
  var updateListener = onChange ? EditorView.updateListener.of(function(update) {
    if (update.docChanged) {
      clearTimeout(changeTimer);
      changeTimer = setTimeout(function() {
        onChange(view.state.doc.toString());
      }, 2000);
    }
  }) : [];

  // Custom keybindings
  var customKeys = keymap.of([
    { key: 'Mod-b', run: function(v) { formatCommands.bold(v); return true; } },
    { key: 'Mod-i', run: function(v) { formatCommands.italic(v); return true; } },
    { key: 'Mod-k', run: function(v) { formatCommands.link(v); return true; } },
    { key: 'Mod-s', run: function(v) { if (onSave) onSave(v.state.doc.toString()); return true; } },
    { key: 'Tab', run: function(v) { insertAtCursor(v, '  '); return true; } },
  ]);

  // Create CodeMirror
  var view = new EditorView({
    doc: content,
    extensions: [
      customKeys,
      basicSetup,
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      themeCompartment.of(getThemeExtension(theme)),
      updateListener,
      EditorView.lineWrapping,
    ],
    parent: editorHolder,
  });

  // Create formatting toolbar
  var toolbar = createFormatToolbar(view, theme);

  // Assemble
  container.appendChild(toolbar);
  container.appendChild(editorHolder);
  parent.appendChild(container);

  // Focus editor
  view.focus();

  // Public API
  return {
    getContent: function() { return view.state.doc.toString(); },
    setTheme: function(t) {
      theme = t;
      view.dispatch({ effects: themeCompartment.reconfigure(getThemeExtension(t)) });
    },
    destroy: function() {
      clearTimeout(changeTimer);
      view.destroy();
      if (container.parentNode) container.parentNode.removeChild(container);
    },
    view: view,
    formatCommands: formatCommands,
  };
}

// Export to global
window.markviewCreateEditor = markviewCreateEditor;

/**
 * markview-toolbar.js — Shared docked toolbar + cascading hamburger menu.
 *
 * One canonical menu structure everywhere, matching the desktop app.
 * Top-level: File, Edit, Format, View, AI Assistant, Help — each cascades right.
 * Actions that are null/undefined render as disabled items.
 */
(function(root) {
  'use strict';

  var _cssInjected = false;
  function injectCSS() {
    if (_cssInjected) return;
    _cssInjected = true;
    var s = document.createElement('style');
    s.textContent = [
      '.mv-tb-menu-wrap { position:relative; }',
      /* Main dropdown — 6 category items, each a submenu parent */
      '.mv-tb-dropdown { display:none; position:absolute; left:0; top:100%;',
      '  min-width:160px; background:var(--mv-toolbar-bg,#fff);',
      '  border:1px solid var(--mv-border,#e1e4e8); border-radius:6px;',
      '  box-shadow:0 4px 16px rgba(0,0,0,0.25); z-index:100000;',
      '  padding:4px 0; margin-top:4px; font-size:13px;',
      '  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }',
      /* Items */
      '.mv-tb-item { padding:7px 16px; cursor:pointer; white-space:nowrap;',
      '  color:var(--mv-toolbar-text,#24292e); transition:background 0.1s; }',
      '.mv-tb-item:hover { background:var(--mv-toolbar-btn-hover,#f0f0f0); }',
      '.mv-tb-item[data-disabled="true"] { opacity:0.4; pointer-events:none; }',
      '.mv-tb-sep { height:1px; background:var(--mv-border,#e1e4e8); margin:4px 8px; }',
      '.mv-tb-shortcut { float:right; opacity:0.5; font-size:11px; margin-left:2em; }',
      /* Submenu parents & arrows */
      '.mv-tb-sub-parent { position:relative; }',
      '.mv-tb-sub-arrow { float:right; opacity:0.5; margin-left:1.5em; font-size:14px; }',
      /* Submenus — cascade to the right, overlapping pad prevents hover gap */
      '.mv-tb-submenu { display:none; position:absolute; left:calc(100% - 4px); top:-4px;',
      '  min-width:200px; max-height:70vh; overflow-y:auto;',
      '  background:var(--mv-toolbar-bg,#fff);',
      '  border:1px solid var(--mv-border,#e1e4e8); border-radius:6px;',
      '  box-shadow:0 4px 16px rgba(0,0,0,0.25); z-index:100001;',
      '  padding:4px 0; padding-left:4px; }',
      '.mv-tb-sub-parent:hover > .mv-tb-submenu { display:block; }',
      /* Nested submenus (e.g. Color Scheme inside View) */
      '.mv-tb-submenu .mv-tb-submenu { z-index:100002; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  // -------------------------------------------------------------------------
  // Menu helpers
  // -------------------------------------------------------------------------
  function _addItem(parent, dropdown, label, shortcut, action) {
    var item = document.createElement('div');
    item.className = 'mv-tb-item';
    item.textContent = label;
    if (!action) item.setAttribute('data-disabled', 'true');
    if (shortcut) {
      var sc = document.createElement('span');
      sc.className = 'mv-tb-shortcut';
      sc.textContent = shortcut;
      item.appendChild(sc);
    }
    if (action) {
      item.addEventListener('click', function() {
        dropdown.style.display = 'none';
        action();
      });
    }
    parent.appendChild(item);
    return item;
  }

  function _addSep(parent) {
    var sep = document.createElement('div');
    sep.className = 'mv-tb-sep';
    parent.appendChild(sep);
  }

  function _addSubmenu(parent, label) {
    var wrap = document.createElement('div');
    wrap.className = 'mv-tb-sub-parent mv-tb-item';
    wrap.textContent = label;
    var arrow = document.createElement('span');
    arrow.className = 'mv-tb-sub-arrow';
    arrow.textContent = '\u203A';
    wrap.appendChild(arrow);
    var sub = document.createElement('div');
    sub.className = 'mv-tb-submenu';
    wrap.appendChild(sub);
    parent.appendChild(wrap);
    return sub;
  }

  // -------------------------------------------------------------------------
  // Build the canonical cascading menu (matches desktop app)
  // -------------------------------------------------------------------------
  function buildCanonicalMenu(dropdown, actions, zoomFns, opts) {
    actions = actions || {};
    opts = opts || {};

    // Helper that binds addItem to close the root dropdown
    function item(parent, label, shortcut, action) {
      return _addItem(parent, dropdown, label, shortcut, action);
    }

    // ---- FILE ----
    var fileSub = _addSubmenu(dropdown, 'File');
    item(fileSub, 'New', 'Ctrl+N', actions.newFile);
    item(fileSub, 'Open\u2026', 'Ctrl+O', actions.openFile);
    _addSep(fileSub);
    item(fileSub, 'Save', 'Ctrl+S', actions.save);
    item(fileSub, 'Save As\u2026', '', actions.saveAs);
    _addSep(fileSub);
    item(fileSub, 'Print', 'Ctrl+P', actions.print || function() { window.print(); });
    item(fileSub, 'Export to PDF', '', actions.exportPdf);
    item(fileSub, 'Image Location\u2026', '', actions.imageLocation);
    _addSep(fileSub);
    item(fileSub, 'Close', '', actions.closeTab);

    // ---- EDIT ----
    var editSub = _addSubmenu(dropdown, 'Edit');
    item(editSub, 'Find', 'Ctrl+F', actions.find);
    item(editSub, 'Replace', 'Ctrl+H', actions.replace);
    _addSep(editSub);
    item(editSub, 'Fix Lint Warnings', '', actions.lint);

    // ---- FORMAT ----
    var fmtSub = _addSubmenu(dropdown, 'Format');
    item(fmtSub, 'Bold', 'Ctrl+B', actions.bold);
    item(fmtSub, 'Italic', 'Ctrl+I', actions.italic);
    item(fmtSub, 'Strikethrough', '', actions.strikethrough);
    item(fmtSub, 'Inline Code', '', actions.inlineCode);
    _addSep(fmtSub);
    item(fmtSub, 'Heading 1', '', actions.h1);
    item(fmtSub, 'Heading 2', '', actions.h2);
    item(fmtSub, 'Heading 3', '', actions.h3);
    _addSep(fmtSub);
    item(fmtSub, 'Bullet List', '', actions.bulletList);
    item(fmtSub, 'Numbered List', '', actions.numberedList);
    item(fmtSub, 'Task List', '', actions.taskList);
    _addSep(fmtSub);
    item(fmtSub, 'Link', '', actions.link);
    item(fmtSub, 'Image', '', actions.image);
    item(fmtSub, 'Code Block', '', actions.codeBlock);
    item(fmtSub, 'Blockquote', '', actions.blockquote);
    item(fmtSub, 'Horizontal Rule', '', actions.horizontalRule);

    // ---- VIEW ----
    var viewSub = _addSubmenu(dropdown, 'View');
    item(viewSub, 'Toggle Theme', 'F5', actions.toggleTheme);
    item(viewSub, 'Toggle Edit Mode', 'F2', actions.toggleEdit);
    item(viewSub, 'Toggle Raw', '', actions.toggleRaw);
    item(viewSub, 'Word Wrap', '', actions.wordWrap);
    _addSep(viewSub);
    item(viewSub, 'Zoom In', 'Ctrl+=', zoomFns.zoomIn);
    item(viewSub, 'Zoom Out', 'Ctrl+-', zoomFns.zoomOut);
    item(viewSub, 'Reset Zoom', 'Ctrl+0', zoomFns.zoomReset);

    // Color Scheme nested submenu inside View
    if (opts.colorSchemes && opts.colorSchemes.length > 0) {
      _addSep(viewSub);
      var schemeSub = _addSubmenu(viewSub, 'Color Scheme');
      for (var i = 0; i < opts.colorSchemes.length; i++) {
        (function(sname) {
          var isActive = opts.activeScheme === sname;
          item(schemeSub, (isActive ? '\u2713 ' : '   ') + sname, '', function() {
            if (opts.onSchemeChange) opts.onSchemeChange(sname);
          });
        })(opts.colorSchemes[i]);
      }
    }

    // ---- AI ASSISTANT ----
    var aiSub = _addSubmenu(dropdown, 'AI Assistant');
    item(aiSub, 'Ask Claude\u2026', 'F6', actions.askClaude);
    _addSep(aiSub);
    item(aiSub, 'Clear Chat', '', actions.clearChat);
    item(aiSub, 'Restart Session', '', actions.restartSession);

    // ---- HELP ----
    var helpSub = _addSubmenu(dropdown, 'Help');
    item(helpSub, 'MarkView Overview', 'F1', actions.overview || function() {
      window.open('https://github.com/davidcforbes/markview#readme', '_blank');
    });
    item(helpSub, 'Keyboard Shortcuts', '', actions.shortcuts);
    _addSep(helpSub);
    item(helpSub, 'Submit Issue Report', '', actions.submitIssue || function() {
      window.open('https://github.com/davidcforbes/markview/issues/new', '_blank');
    });
    item(helpSub, 'Discussion Board', '', actions.discussionBoard || function() {
      window.open('https://github.com/davidcforbes/markview/discussions', '_blank');
    });
    _addSep(helpSub);
    item(helpSub, 'About MarkView', '', actions.about);
  }

  // -------------------------------------------------------------------------
  // Main toolbar creation
  // -------------------------------------------------------------------------
  function markviewCreateToolbar(container, opts) {
    opts = opts || {};
    var theme = opts.theme || 'light';
    var zoomLevel = 100;
    var actions = opts.actions || {};

    injectCSS();

    // --- Toolbar element ---
    var toolbar = document.createElement('div');
    toolbar.className = 'mv-toolbar';
    toolbar.style.cssText = [
      'position:sticky', 'top:0', 'width:100%', 'display:flex',
      'align-items:center', 'gap:0.25rem',
      'background:var(--mv-toolbar-bg,#fff)',
      'box-shadow:0 1px 4px var(--mv-toolbar-shadow,rgba(0,0,0,0.10))',
      'padding:0.35rem 0.5rem', 'z-index:99999', 'box-sizing:border-box',
      'font-size:13px',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif'
    ].join(';');

    // --- Hamburger button + dropdown ---
    var menuWrap = document.createElement('div');
    menuWrap.className = 'mv-tb-menu-wrap';
    var menuBtn = document.createElement('button');
    menuBtn.textContent = '\u2630';
    menuBtn.title = 'Menu';
    menuBtn.style.cssText = 'background:none;border:none;color:var(--mv-toolbar-text,#24292e);cursor:pointer;padding:0.35rem 0.5rem;border-radius:4px;font-size:16px;font-family:inherit;line-height:1;min-width:28px;text-align:center;transition:background 0.15s';
    menuBtn.addEventListener('mouseenter', function() { menuBtn.style.background = 'var(--mv-toolbar-btn-hover,#f0f0f0)'; });
    menuBtn.addEventListener('mouseleave', function() { menuBtn.style.background = 'none'; });
    menuWrap.appendChild(menuBtn);

    var dropdown = document.createElement('div');
    dropdown.className = 'mv-tb-dropdown';
    menuWrap.appendChild(dropdown);

    // --- Zoom (content-only) ---
    function applyZoom() {
      var c = document.getElementById('content') || document.getElementById('markdown-body') || document.getElementById('markview-root');
      if (c) c.style.zoom = (zoomLevel / 100).toString();
    }
    function zoomIn() { zoomLevel = Math.min(200, zoomLevel + 10); applyZoom(); }
    function zoomOut() { zoomLevel = Math.max(50, zoomLevel - 10); applyZoom(); }
    function zoomReset() { zoomLevel = 100; applyZoom(); }

    // Build cascading menu
    buildCanonicalMenu(dropdown, actions, { zoomIn: zoomIn, zoomOut: zoomOut, zoomReset: zoomReset }, {
      colorSchemes: opts.colorSchemes,
      activeScheme: opts.activeScheme,
      onSchemeChange: opts.onSchemeChange
    });

    menuBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
    });
    dropdown.addEventListener('click', function(e) { e.stopPropagation(); });
    document.addEventListener('click', function() { dropdown.style.display = 'none'; });

    toolbar.appendChild(menuWrap);

    // --- Brand label ---
    var brand = document.createElement('span');
    brand.style.cssText = 'font-weight:600;font-size:13px;color:var(--mv-toolbar-text,#24292e);margin-right:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;padding-left:0.25rem';
    brand.textContent = 'MarkView' + (opts.fileName ? ' \u2014 ' + opts.fileName : '');
    toolbar.appendChild(brand);

    // --- Quick-action button helpers ---
    function addBtn(label, title, onClick) {
      var btn = document.createElement('button');
      btn.textContent = label;
      btn.title = title;
      btn.style.cssText = 'background:none;border:none;color:var(--mv-toolbar-text,#24292e);cursor:pointer;padding:0.35rem 0.5rem;border-radius:4px;font-size:16px;font-family:inherit;white-space:nowrap;transition:background 0.15s;line-height:1;min-width:28px;text-align:center';
      btn.addEventListener('mouseenter', function() { btn.style.background = 'var(--mv-toolbar-btn-hover,#f0f0f0)'; });
      btn.addEventListener('mouseleave', function() { btn.style.background = 'none'; });
      btn.addEventListener('click', onClick);
      toolbar.appendChild(btn);
      return btn;
    }
    function addSep() {
      var sep = document.createElement('div');
      sep.style.cssText = 'width:1px;height:20px;background:var(--mv-border,#e1e4e8);margin:0 0.25rem';
      toolbar.appendChild(sep);
    }

    // --- Quick-action buttons (right side) ---
    addBtn('\u2212', 'Zoom Out (Ctrl+-)', zoomOut);
    addBtn('+', 'Zoom In (Ctrl+=)', zoomIn);
    addSep();

    var themeBtn = addBtn(
      theme === 'dark' ? '\u2600' : '\u263E',
      theme === 'dark' ? 'Switch to light theme (F5)' : 'Switch to dark theme (F5)',
      function() {
        theme = theme === 'dark' ? 'light' : 'dark';
        themeBtn.textContent = theme === 'dark' ? '\u2600' : '\u263E';
        themeBtn.title = theme === 'dark' ? 'Switch to light theme (F5)' : 'Switch to dark theme (F5)';
        if (opts.onThemeToggle) opts.onThemeToggle(theme);
      }
    );

    var editBtn = null;
    if (actions.toggleEdit) {
      editBtn = addBtn('\u270F', 'Edit (F2)', actions.toggleEdit);
    }

    addBtn('\u2399', 'Print (Ctrl+P)', function() {
      if (actions.print) actions.print(); else window.print();
    });
    addBtn('\u2191', 'Scroll to top', function() {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // --- Insert ---
    container.insertBefore(toolbar, container.firstChild);

    // --- Keyboard shortcuts ---
    document.addEventListener('keydown', function(e) {
      if (e.key === 'F2') { e.preventDefault(); if (actions.toggleEdit) actions.toggleEdit(); }
      if (e.key === 'F5') { e.preventDefault(); themeBtn.click(); }
      if (e.key === 'F1') { e.preventDefault(); if (actions.overview) actions.overview(); else window.open('https://github.com/davidcforbes/markview#readme', '_blank'); }
      if (e.ctrlKey && e.key === '=') { e.preventDefault(); zoomIn(); }
      if (e.ctrlKey && e.key === '-') { e.preventDefault(); zoomOut(); }
      if (e.ctrlKey && e.key === '0') { e.preventDefault(); zoomReset(); }
      if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); if (actions.print) actions.print(); else window.print(); }
    });

    return {
      element: toolbar,
      setTheme: function(t) {
        theme = t;
        themeBtn.textContent = t === 'dark' ? '\u2600' : '\u263E';
        themeBtn.title = t === 'dark' ? 'Switch to light theme (F5)' : 'Switch to dark theme (F5)';
      },
      setFileName: function(name) {
        brand.textContent = 'MarkView' + (name ? ' \u2014 ' + name : '');
      },
      getTheme: function() { return theme; },
      editBtn: editBtn
    };
  }

  root.markviewCreateToolbar = markviewCreateToolbar;

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);

(function() {
    var params = new URLSearchParams(window.location.search);
    var name = params.get('name') || 'document';
    var key = params.get('key');
    var theme = params.get('theme') || 'light';

    document.title = 'MarkView \u2014 ' + name;

    if (typeof markviewSetTheme === 'function') {
        markviewSetTheme(theme, 'default');
    }
    document.body.style.background = 'var(--mv-bg, #1e1e1e)';
    document.body.style.color = 'var(--mv-text, #e6e6e6)';

    if (!key) {
        document.getElementById('loading').textContent = 'No content. Please reopen the file.';
        return;
    }

    chrome.runtime.sendMessage({ type: 'getMarkdown', key: key }, function(response) {
        if (chrome.runtime.lastError || !response || !response.markdown) {
            document.getElementById('loading').textContent = 'No content. Please reopen the file.';
            return;
        }

        var markdown = response.markdown;
        var el = document.getElementById('content');

        // Set Drive file map for image resolution (if available)
        if (response.driveFiles && typeof markviewSetDriveFiles === 'function') {
            markviewSetDriveFiles(response.driveFiles);
        }

        // Fix image URLs in rendered content after each render
        var driveFiles = response.driveFiles || {};
        var imageCache = {}; // basename -> data URL cache

        function loadDriveImage(img, fileId) {
            var cacheKey = fileId;
            if (imageCache[cacheKey]) {
                img.setAttribute('src', imageCache[cacheKey]);
                return;
            }
            chrome.runtime.sendMessage({ type: 'fetchDriveImage', fileId: fileId }, function(resp) {
                if (chrome.runtime.lastError || !resp || !resp.dataUrl) return;
                imageCache[cacheKey] = resp.dataUrl;
                img.setAttribute('src', resp.dataUrl);
            });
        }

        function fixImages() {
            var imgs = el.querySelectorAll('img');
            var unresolvedNames = [];
            for (var i = 0; i < imgs.length; i++) {
                var src = imgs[i].getAttribute('src') || '';
                if (src.startsWith('http') || src.startsWith('data:')) continue;
                var basename = src.split('/').pop().toLowerCase();
                var fileId = driveFiles[basename];
                if (fileId) {
                    loadDriveImage(imgs[i], fileId);
                } else if (basename) {
                    unresolvedNames.push(basename);
                }
            }
            // Search Drive for unresolved images
            if (unresolvedNames.length > 0) {
                chrome.runtime.sendMessage({
                    type: 'searchDriveImages',
                    filenames: unresolvedNames
                }, function(searchResp) {
                    if (chrome.runtime.lastError || !searchResp || !searchResp.fileMap) return;
                    var found = searchResp.fileMap;
                    for (var k in found) { driveFiles[k] = found[k]; }
                    var allImgs = el.querySelectorAll('img');
                    for (var j = 0; j < allImgs.length; j++) {
                        var s = allImgs[j].getAttribute('src') || '';
                        if (s.startsWith('http') || s.startsWith('data:')) continue;
                        var bn = s.split('/').pop().toLowerCase();
                        if (found[bn]) {
                            loadDriveImage(allImgs[j], found[bn]);
                        }
                    }
                });
            }
        }

        // Send a command to markview.exe via native messaging
        function nativeSendCommand(cmd) {
            chrome.runtime.sendMessage({
                type: 'nativeCommand',
                command: cmd,
                markdown: markdown,
                fileName: name,
                theme: theme
            }, function(resp) {
                if (chrome.runtime.lastError) {
                    console.warn('[MarkView] Native command failed:', cmd, chrome.runtime.lastError.message);
                    if (typeof markviewShowError === 'function') {
                        markviewShowError(
                            'MarkView desktop host is not reachable. Install the MarkView desktop app to enable ' + cmd + '.',
                            'warn'
                        );
                    }
                }
            });
        }

        function requestNativeRender(renderTheme) {
            chrome.runtime.sendMessage({
                type: 'nativeRender',
                markdown: markdown,
                theme: renderTheme
            }, function(nativeResp) {
                if (chrome.runtime.lastError) return;
                if (nativeResp && nativeResp.html) {
                    el.replaceChildren();
                    el.insertAdjacentHTML('afterbegin', nativeResp.html);
                    fixImages();
                }
            });
        }

        function doToggleTheme() {
            theme = theme === 'dark' ? 'light' : 'dark';
            tb.setTheme(theme);
            if (typeof markviewSetTheme === 'function') markviewSetTheme(theme, 'default');
            document.body.style.background = 'var(--mv-bg)';
            document.body.style.color = 'var(--mv-text)';
            requestNativeRender(theme);
        }

        // Shortcuts dialog
        function showShortcutsDialog() {
            var existing = document.getElementById('mv-shortcuts-dialog');
            if (existing) { existing.remove(); return; }
            var shortcuts = [
                ['', 'Navigation'],
                ['Escape', 'Close Menu / Dialog / AI Panel'],
                ['Up / Down', 'Scroll Up / Down 1 Row'],
                ['PgUp / PgDn', 'Scroll Up / Down 1 Screen'],
                ['Home / End', 'Cursor to Start / End of Row (Edit)'],
                ['Ctrl+Home / End', 'Top / Bottom of File'],
                ['', 'File'],
                ['Ctrl+N', 'New Document'],
                ['Ctrl+O', 'Open File'],
                ['Ctrl+S', 'Save'],
                ['Ctrl+P', 'Print'],
                ['', 'Edit'],
                ['F2', 'Toggle Edit Mode'],
                ['Ctrl+A', 'Select All'],
                ['Ctrl+C / X / V', 'Copy / Cut / Paste'],
                ['Ctrl+Z / Y', 'Undo / Redo'],
                ['Ctrl+F', 'Find'],
                ['Ctrl+H', 'Find & Replace'],
                ['', 'Format'],
                ['Ctrl+B', 'Bold'],
                ['Ctrl+I', 'Italic'],
                ['Ctrl+K', 'Link'],
                ['', 'View'],
                ['F5', 'Toggle Theme'],
                ['Ctrl+= / -', 'Zoom In / Out'],
                ['Ctrl+0', 'Reset Zoom'],
                ['Alt+Z', 'Toggle Word Wrap'],
                ['', 'AI Assistant'],
                ['F6', 'Toggle AI Chat Panel'],
                ['Ctrl+Enter', 'Submit Prompt'],
                ['', 'Help'],
                ['F1', 'MarkView Overview']
            ];
            var overlay = document.createElement('div');
            overlay.id = 'mv-shortcuts-dialog';
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:200000;display:flex;align-items:center;justify-content:center';
            var box = document.createElement('div');
            box.style.cssText = 'background:var(--mv-toolbar-bg,#fff);color:var(--mv-toolbar-text,#24292e);border-radius:8px;padding:24px;max-width:480px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.3);font-size:13px';
            var h3 = document.createElement('h3');
            h3.style.cssText = 'margin:0 0 12px';
            h3.textContent = 'Keyboard Shortcuts';
            box.appendChild(h3);
            var table = document.createElement('table');
            table.style.cssText = 'width:100%;border-collapse:collapse';
            for (var i = 0; i < shortcuts.length; i++) {
                var tr = document.createElement('tr');
                if (!shortcuts[i][0]) {
                    // Section header
                    var th = document.createElement('td');
                    th.colSpan = 2;
                    th.style.cssText = 'padding:8px 8px 4px;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;opacity:0.6;border-top:1px solid var(--mv-border,#e1e4e8)';
                    if (i === 0) th.style.borderTop = 'none';
                    th.textContent = shortcuts[i][1];
                    tr.appendChild(th);
                } else {
                    var tdKey = document.createElement('td');
                    tdKey.style.cssText = 'padding:3px 8px;font-family:monospace;font-size:12px;opacity:0.7;white-space:nowrap';
                    tdKey.textContent = shortcuts[i][0];
                    var tdDesc = document.createElement('td');
                    tdDesc.style.cssText = 'padding:3px 8px';
                    tdDesc.textContent = shortcuts[i][1];
                    tr.appendChild(tdKey);
                    tr.appendChild(tdDesc);
                }
                table.appendChild(tr);
            }
            box.appendChild(table);
            var btnRow = document.createElement('div');
            btnRow.style.cssText = 'text-align:right;margin-top:12px';
            var closeBtn = document.createElement('button');
            closeBtn.textContent = 'Close';
            closeBtn.style.cssText = 'padding:6px 16px;border:1px solid var(--mv-border,#ccc);border-radius:4px;background:none;color:inherit;cursor:pointer';
            closeBtn.addEventListener('click', function() { overlay.remove(); });
            btnRow.appendChild(closeBtn);
            box.appendChild(btnRow);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
        }

        // ---------------------------------------------------------------
        // Edit mode state
        // ---------------------------------------------------------------
        var isEditing = false;
        var isDirty = false;
        var editorInstance = null;
        var driveFileId = response.driveFileId || null;

        // Auto-save key
        var autosaveKey = driveFileId ? 'mv-autosave-drive-' + driveFileId
            : 'mv-autosave-session-' + key;

        function autosaveSave(content) {
            try {
                localStorage.setItem(autosaveKey, JSON.stringify({
                    content: content,
                    timestamp: Date.now()
                }));
            } catch (_e) {}
        }

        function autosaveLoad() {
            try {
                var raw = localStorage.getItem(autosaveKey);
                if (raw) return JSON.parse(raw);
            } catch (_e) {}
            return null;
        }

        function autosaveDelete() {
            try { localStorage.removeItem(autosaveKey); } catch (_e) {}
        }

        function doSave() {
            var content = editorInstance ? editorInstance.getContent() : markdown;
            markdown = content;
            isDirty = false;
            autosaveDelete();
            if (driveFileId) {
                chrome.runtime.sendMessage({
                    type: 'saveToDrive',
                    fileId: driveFileId,
                    content: content
                }, function(resp) {
                    if (chrome.runtime.lastError || (resp && resp.error)) {
                        console.warn('[MarkView] Drive save failed:', resp ? resp.error : chrome.runtime.lastError.message);
                    } else {
                        console.log('[MarkView] Saved to Drive');
                    }
                });
            }
        }

        function doSaveAs() {
            var content = editorInstance ? editorInstance.getContent() : markdown;
            var blob = new Blob([content], { type: 'text/markdown' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = name.endsWith('.md') ? name : name + '.md';
            a.click();
            URL.revokeObjectURL(url);
        }

        function toggleEditMode() {
            if (isEditing) {
                exitEditMode();
            } else {
                enterEditMode();
            }
        }

        function enterEditMode() {
            if (isEditing || typeof markviewCreateEditor !== 'function') return;
            isEditing = true;

            // Check for autosave recovery
            var saved = autosaveLoad();
            var contentToLoad = markdown;
            if (saved && saved.content && saved.content !== markdown) {
                var when = new Date(saved.timestamp).toLocaleString();
                if (confirm('Unsaved changes recovered from ' + when + '.\n\nRestore recovered content?\n\nOK = Restore, Cancel = Discard')) {
                    contentToLoad = saved.content;
                } else {
                    autosaveDelete();
                }
            }

            // Hide rendered content
            el.style.display = 'none';

            // Create editor
            var editorContainer = document.createElement('div');
            editorContainer.id = 'mv-editor-container';
            editorContainer.style.cssText = 'height:calc(100vh - 42px)';
            el.parentNode.insertBefore(editorContainer, el);

            editorInstance = markviewCreateEditor(editorContainer, {
                content: contentToLoad,
                theme: theme,
                onChange: function(content) {
                    isDirty = true;
                    autosaveSave(content);
                },
                onSave: function(content) {
                    markdown = content;
                    doSave();
                }
            });

            // Update toolbar button
            if (tb.editBtn) {
                tb.editBtn.textContent = '\u25C9';
                tb.editBtn.title = 'Exit Edit Mode (F2)';
            }
        }

        function exitEditMode() {
            if (!isEditing) return;

            if (isDirty) {
                var choice = confirm('You have unsaved changes.\n\nOK = Save and exit\nCancel = Discard and exit');
                if (choice) {
                    markdown = editorInstance.getContent();
                    doSave();
                } else {
                    autosaveDelete();
                }
            }

            // Sync content
            if (editorInstance) {
                if (!isDirty) {
                    // No unsaved changes — still sync the content
                    markdown = editorInstance.getContent();
                }
                editorInstance.destroy();
                editorInstance = null;
            }

            var editorContainer = document.getElementById('mv-editor-container');
            if (editorContainer) editorContainer.remove();

            isEditing = false;
            isDirty = false;

            // Re-render
            el.style.display = 'block';
            requestNativeRender(theme);

            // Update toolbar button
            if (tb.editBtn) {
                tb.editBtn.textContent = '\u270F';
                tb.editBtn.title = 'Toggle Edit Mode (F2)';
            }
        }

        // Warn on close if dirty
        window.addEventListener('beforeunload', function(e) {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        });

        // ---------------------------------------------------------------
        // Create toolbar with canonical menu — all actions wired
        // ---------------------------------------------------------------
        function fmtCmd(cmdName) {
            return function() {
                if (editorInstance && editorInstance.formatCommands && editorInstance.formatCommands[cmdName]) {
                    editorInstance.formatCommands[cmdName](editorInstance.view);
                }
            };
        }

        var tb = markviewCreateToolbar(document.body, {
            fileName: name,
            theme: theme,
            onThemeToggle: function(newTheme) {
                theme = newTheme;
                if (typeof markviewSetTheme === 'function') markviewSetTheme(theme, 'default');
                document.body.style.background = 'var(--mv-bg)';
                document.body.style.color = 'var(--mv-text)';
                if (editorInstance) editorInstance.setTheme(theme);
                else requestNativeRender(theme);
            },
            actions: {
                // File
                save: doSave,
                saveAs: doSaveAs,
                print: function() { window.print(); },
                exportPdf: function() { nativeSendCommand('export_pdf'); },
                closeTab: function() { window.close(); },
                // Edit
                find: function() { try { window.find(); } catch(_e) {} },
                toggleEdit: toggleEditMode,
                // Format
                bold: fmtCmd('bold'),
                italic: fmtCmd('italic'),
                strikethrough: fmtCmd('strikethrough'),
                inlineCode: fmtCmd('inlineCode'),
                h1: fmtCmd('h1'),
                h2: fmtCmd('h2'),
                h3: fmtCmd('h3'),
                bulletList: fmtCmd('bulletList'),
                numberedList: fmtCmd('numberedList'),
                taskList: fmtCmd('taskList'),
                link: fmtCmd('link'),
                image: fmtCmd('image'),
                codeBlock: fmtCmd('codeBlock'),
                blockquote: fmtCmd('blockquote'),
                horizontalRule: fmtCmd('horizontalRule'),
                // View
                toggleTheme: doToggleTheme,
                // AI Assistant
                askClaude: function() { nativeSendCommand('ask_claude'); },
                clearChat: function() { nativeSendCommand('clear_chat'); },
                restartSession: function() { nativeSendCommand('restart_session'); },
                // Help
                shortcuts: showShortcutsDialog
            }
        });

        // Initial JS render
        if (typeof markviewRenderToElement === 'function') {
            markviewRenderToElement(el, markdown, {
                theme: theme,
                scheme: 'default',
                mermaidTheme: theme === 'dark' ? 'dark' : 'default'
            }).then(function() {
                document.getElementById('loading').style.display = 'none';
                el.style.display = 'block';
                fixImages();
            });
        } else {
            el.textContent = markdown;
            document.getElementById('loading').style.display = 'none';
            el.style.display = 'block';
        }

        // Native render
        requestNativeRender(theme);
    });
})();

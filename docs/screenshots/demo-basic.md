# Welcome to MarkView

MarkView turns any Markdown file into a beautifully rendered document, right
in your browser. Open a `.md` from your disk, the web, or your cloud —
nothing else to configure.

## Why MarkView?

- **Zero configuration**: install once, markdown renders everywhere.
- **Every cloud** you already use: Google Drive, SharePoint, OneDrive, Dropbox, Box.
- **Private by design**: no servers, no telemetry, no account.

## A quick tour

### Tables

| Feature | Status | Notes |
|---------|:------:|-------|
| GFM tables | ✅ | Alignment + pipe-escapes supported |
| Task lists | ✅ | Clickable checkboxes in the viewer tab |
| Mermaid | ✅ | Flowchart, sequence, state, class, ER, gantt |
| KaTeX math | ✅ | Inline and display modes |
| Syntax highlighting | ✅ | Broad language set |

### Code

```rust
fn render(markdown: &str) -> String {
    let parser = pulldown_cmark::Parser::new(markdown);
    let mut output = String::new();
    pulldown_cmark::html::push_html(&mut output, parser);
    output
}
```

```typescript
interface Document {
  title: string;
  body: string;
  tags: readonly string[];
}

async function fetchDocument(url: string): Promise<Document> {
  const response = await fetch(url);
  const body = await response.text();
  return { title: extractTitle(body), body, tags: [] };
}
```

### Task lists

- [x] Open `.md` from your disk
- [x] Render Markdown with GitHub flavor
- [x] Detect cloud storage and fetch automatically
- [ ] Your next feature request

### Math

Pythagoras: $a^2 + b^2 = c^2$

$$
\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
$$

### Blockquote

> MarkView is the fastest way I've found to review markdown without leaving
> the browser — and it handles every cloud I use.

### Links and lists

1. Install from the [Chrome Web Store](https://chrome.google.com/webstore)
2. Open any `.md` file — MarkView detects it automatically
3. Toggle theme, find-in-page, copy-as-HTML, open in the side panel

# Copy Request Brief (Single Page)

A single-page web interface for marketers to submit structured copy requests, with live preview and export.

## Quick start

- Open `index.html` in your browser
- Fill in the form on the left; the Markdown preview updates live on the right
- Use the buttons to:
  - Copy the brief to clipboard
  - Download as `.md` or `.json`
  - Create an email draft (mailto)
  - Print or save as PDF
- Your inputs auto-save to your browser (localStorage)

## Develop / serve locally

Any static server works. Examples:

```bash
# Python
python3 -m http.server 8080 -d /workspace

# Node (if installed)
npx serve -s /workspace -l 8080 --single --yes
```

Then open `http://localhost:8080`.

## Notes

- This app is 100% client-side; no backend required.
- Mail clients may truncate long mailto bodies; use download/copy for long briefs.
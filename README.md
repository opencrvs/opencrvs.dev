# opencrvs.dev

A folder of HTML pages with a generated front page that lists them.

## Adding a page

Drop a file into `posts/` and push to `main`:

- `posts/2026-10-05-my-report.html` for a single self-contained page, or
- `posts/my-report/index.html` when the page has its own images, scripts or data.

The front page lists pages newest first, using from each page:

| From the page | Used as |
| --- | --- |
| `<title>` | Title (falls back to the file name) |
| `<meta name="description" content="…">` | Summary line |
| `<meta name="author" content="…">` | Author (falls back to the git author) |
| `<meta name="date" content="YYYY-MM-DD">` or a `YYYY-MM-DD-` file name prefix | Date (falls back to the first commit date) |
| `<meta name="unlisted">` | Published, but left off the front page |

Pages are copied as-is, so anything works: hand-written HTML, exported Claude artifacts, notebook exports.

## OpenCRVS brand

`brand/` is published at `/brand/`: the official logo files and `opencrvs.css`, which sets the brand's colours, Poppins and Noto Sans, links, tables, cards and buttons. Link it from a new page:

```html
<link rel="stylesheet" href="/brand/opencrvs.css" />
```

Use `opencrvs-logo-primary.svg` on white and `opencrvs-logo-white.svg` on navy. The rules come from the OpenCRVS brand (github.com/opencrvs/opencrvs-brand); ask the design team before changing them.

## Local preview

```bash
npm run dev
```

## Deploy

`.github/workflows/deploy.yml` builds `_site/` and deploys it to GitHub Pages on every push to `main`. `CNAME` sets the custom domain.

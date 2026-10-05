#!/usr/bin/env node
// Builds _site/ from posts/: copies everything as-is and generates index.html,
// a listing of every HTML page found. No dependencies.
//
// A post is either posts/<name>.html or posts/<name>/index.html (use a folder
// when the page has its own images, scripts or data files).
//
// Metadata is read from the page itself:
//   <title>                          → title (falls back to the file name)
//   <meta name="description">        → summary
//   <meta name="author">             → author (falls back to the git author)
//   <meta name="date" content="YYYY-MM-DD"> or a YYYY-MM-DD- file name prefix
//                                    → date (falls back to first git commit, then mtime)
//   <meta name="unlisted">           → page is published but left out of the index

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.dirname(new URL(import.meta.url).pathname)
const POSTS = path.join(ROOT, 'posts')
const OUT = path.join(ROOT, '_site')
const SITE_TITLE = 'opencrvs.dev'
const SITE_DESCRIPTION = 'Notes, reports and experiments from the OpenCRVS core team.'

fs.rmSync(OUT, { recursive: true, force: true })
fs.cpSync(POSTS, OUT, { recursive: true })
for (const f of ['CNAME', 'favicon.svg']) {
  if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f))
}

function findPages() {
  const pages = []
  for (const entry of fs.readdirSync(POSTS, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue
    if (entry.isFile() && entry.name.endsWith('.html')) {
      pages.push({ file: path.join(POSTS, entry.name), href: entry.name, slug: entry.name.replace(/\.html$/, '') })
    } else if (entry.isDirectory() && fs.existsSync(path.join(POSTS, entry.name, 'index.html'))) {
      pages.push({ file: path.join(POSTS, entry.name, 'index.html'), href: `${entry.name}/`, slug: entry.name })
    }
  }
  return pages
}

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()

const escape = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function meta(html, name) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? []
  for (const tag of tags) {
    const n = tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase()
    if (n === name || n === `og:${name}`) {
      return decode(tag.match(/\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i)?.slice(1).find((v) => v != null) ?? '')
    }
  }
  return null
}

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

function describe(page) {
  const html = fs.readFileSync(page.file, 'utf8')
  const rel = path.relative(ROOT, page.file)
  const prefix = page.slug.match(/^(\d{4}-\d{2}-\d{2})-/)
  const firstCommit = git('log', '--diff-filter=A', '--follow', '--format=%aI|%an', '--', rel).split('\n').pop()
  const [commitDate, commitAuthor] = firstCommit ? firstCommit.split('|') : []

  const date =
    meta(html, 'date') ?? prefix?.[1] ?? commitDate?.slice(0, 10) ?? fs.statSync(page.file).mtime.toISOString().slice(0, 10)

  const fallbackTitle = page.slug.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/[-_]+/g, ' ')
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '') || fallbackTitle

  return {
    href: page.href,
    title,
    description: meta(html, 'description'),
    author: meta(html, 'author') ?? commitAuthor ?? null,
    date,
    unlisted: meta(html, 'unlisted') !== null
  }
}

const posts = findPages()
  .map(describe)
  .filter((p) => !p.unlisted)
  .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title))

const formatDate = (d) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

const items = posts
  .map(
    (p) => `      <li>
        <a href="${escape(p.href)}">
          <time datetime="${p.date}">${formatDate(p.date)}</time>
          <span class="title">${escape(p.title)}</span>
          ${p.description ? `<span class="desc">${escape(p.description)}</span>` : ''}
          ${p.author ? `<span class="author">${escape(p.author)}</span>` : ''}
        </a>
      </li>`
  )
  .join('\n')

const index = fs
  .readFileSync(path.join(ROOT, 'index.template.html'), 'utf8')
  .replaceAll('{{title}}', escape(SITE_TITLE))
  .replaceAll('{{description}}', escape(SITE_DESCRIPTION))
  .replace('{{posts}}', posts.length ? items : '      <li class="empty">Nothing here yet.</li>')
  .replace('{{count}}', `${posts.length} ${posts.length === 1 ? 'page' : 'pages'}`)

fs.writeFileSync(path.join(OUT, 'index.html'), index)
console.log(`Built ${posts.length} listed page(s) into _site/`)

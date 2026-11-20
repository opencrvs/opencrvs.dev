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
//   <meta name="category" content="job"> → listed on /jobs/ instead of the front page

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
fs.copyFileSync(path.join(ROOT, 'CNAME'), path.join(OUT, 'CNAME'))
// Shared OpenCRVS brand files (logos, stylesheet), served at /brand/
fs.cpSync(path.join(ROOT, 'brand'), path.join(OUT, 'brand'), { recursive: true })
// Favicons from the brand repo, at the paths browsers look for by default
for (const [from, to] of [
  ['opencrvs-favicon.svg', 'favicon.svg'],
  ['opencrvs-favicon.ico', 'favicon.ico'],
  ['opencrvs-app-icon.png', 'apple-touch-icon.png']
]) {
  fs.copyFileSync(path.join(ROOT, 'brand', from), path.join(OUT, to))
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
    unlisted: meta(html, 'unlisted') !== null,
    category: meta(html, 'category')?.toLowerCase() ?? 'post'
  }
}

const posts = findPages()
  .map(describe)
  .filter((p) => !p.unlisted)
  .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title))

const formatDate = (d) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

const item = (p) => `        <li>
          <a href="/${escape(p.href)}">
            <time datetime="${p.date}">${formatDate(p.date)}</time>
            <span class="title">${escape(p.title)}</span>
            ${p.description ? `<span class="desc">${escape(p.description)}</span>` : ''}
            ${p.author ? `<span class="author">${escape(p.author)}</span>` : ''}
          </a>
        </li>`

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

const jobs = posts
  .filter((p) => p.category === 'job')
  // The page heading already says these are open positions
  .map((p) => ({ ...p, title: p.title.replace(/^we['’]re hiring:\s*/i, ''), author: null }))
const notes = posts.filter((p) => p.category !== 'job')

const template = fs.readFileSync(path.join(ROOT, 'index.template.html'), 'utf8')

// Writes one listing page from index.template.html. `root` is the path back to the site root.
function listing(file, { title, eyebrow, heading, lede, nav, count, list, empty }) {
  const html = template
    .replaceAll('{{title}}', escape(title))
    .replaceAll('{{eyebrow}}', escape(eyebrow))
    .replaceAll('{{heading}}', escape(heading))
    .replaceAll('{{lede}}', lede)
    .replace('{{nav}}', nav)
    .replace('{{count}}', count)
    .replace('{{items}}', list.length ? list.map(item).join('\n') : `        <li class="empty">${empty}</li>`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, html)
}

// Front page: posts. Open positions get their own page at /jobs/, linked from the header.
if (fs.existsSync(path.join(POSTS, 'jobs'))) throw new Error('posts/jobs/ would clash with the generated /jobs/ page')

listing(path.join(OUT, 'index.html'), {
  title: SITE_TITLE,
  eyebrow: SITE_TITLE,
  heading: 'Notes from the core team',
  lede: escape(SITE_DESCRIPTION),
  nav: `<a class="back" href="/jobs/">Open positions${jobs.length ? ` (${jobs.length})` : ''}</a>`,
  count: plural(notes.length, 'post', 'posts'),
  list: notes,
  empty: 'Nothing here yet.'
})

listing(path.join(OUT, 'jobs', 'index.html'), {
  title: `Open positions – ${SITE_TITLE}`,
  eyebrow: 'Join the team',
  heading: 'Open positions',
  lede: 'Help governments give every person a legal identity from birth. All roles are remote, working with the OpenCRVS core team.',
  nav: '<a class="back" href="/">All posts</a>',
  count: plural(jobs.length, 'role', 'roles'),
  list: jobs,
  empty: 'No open positions right now.'
})

console.log(`Built ${notes.length} post(s) and ${jobs.length} open position(s) into _site/`)

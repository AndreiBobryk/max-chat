// Publishes the built app (dist) as a commit on the gh-pages branch, which GitHub Pages serves.
// Run it through `npm run deploy`, which builds first.
import { execFileSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'

const BRANCH = 'gh-pages'

function git(args, { env = {}, quiet = false } = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', quiet ? 'ignore' : 'inherit'],
  }).trim()
}

if (!existsSync('dist/index.html')) {
  throw new Error('dist/index.html is missing: build the app before publishing')
}

// The tree is assembled in a throwaway index, so the working tree and the real index stay as
// they are, and dist does not have to be committed to main.
const gitDir = git(['rev-parse', '--absolute-git-dir'])
const index = path.join(gitDir, 'pages-index')
rmSync(index, { force: true })
const env = { GIT_INDEX_FILE: index }
git(['--git-dir', gitDir, '--work-tree', 'dist', 'add', '--all', '--force'], { env, quiet: true })
const tree = git(['write-tree'], { env })
rmSync(index, { force: true })

// Each deployment continues the branch history, so the push never has to be forced.
let parent = []
try {
  git(['fetch', 'origin', BRANCH], { quiet: true })
  parent = ['-p', git(['rev-parse', 'FETCH_HEAD'])]
} catch {
  // The branch does not exist yet: this is the first deployment.
}

const source = git(['rev-parse', '--short', 'HEAD'])
const commit = git(['commit-tree', tree, ...parent, '-m', `Deploy ${source}`])
git(['push', 'origin', `${commit}:refs/heads/${BRANCH}`])
console.log(`Published ${source} to the ${BRANCH} branch`)

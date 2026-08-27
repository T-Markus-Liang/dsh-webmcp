# Publishing dsh-webmcp to the DSH plugin marketplace

This walkthrough takes `dsh-webmcp` from "runs locally" to "listed on the DSH plugin marketplace" (`awesome-dsh-plugin.com`).

## 1. Prerequisites

Make sure all of the following hold before you submit an entry:

- **Repository is public and pushed.** `dsh-webmcp` lives at `github.com/T-Markus-Liang/dsh-webmcp` and is publicly readable. The marketplace catalog reads metadata from public GitHub URLs, so the repo must be public and pushed to `main`.
- **Published to npm — or use a `github:` source.** Either publish the package to npm (`npm publish`), or rely on a `github:` install source. The `install` command in the entry below uses a `github:` source, so an npm release is not strictly required for the entry itself, but publishing to npm lets users run `dsh plugin add dsh-webmcp` without the repo prefix.

## 2. Where the catalog lives

The marketplace directory itself is maintained in the community repo:

```
github.com/awesome-dsh-plugin/awesome-dsh-plugin
```

That repository holds the canonical `plugins.json`. Its CI regenerates and publishes the rendered marketplace every day to:

```
awesome-dsh-plugin.com
```

So: **you submit a PR to `awesome-dsh-plugin` adding a `plugins.json` entry, and the site updates automatically.**

## 3. The plugins.json entry

Append the following object to the `"plugins"` array in `plugins.json` (or as the maintainer directs). Field values are exactly as they should ship:

```json
{
  "name": "dsh-webmcp",
  "owner": "T-Markus-Liang",
  "url": "https://github.com/T-Markus-Liang/dsh-webmcp",
  "page": "https://github.com/T-Markus-Liang/dsh-webmcp",
  "category": "browser",
  "description": "WebMCP bridge: let your DSH agent discover & call site tools exposed over the W3C WebMCP protocol via a built-in headless browser.",
  "install": "dsh plugin --profile web add github:T-Markus-Liang/dsh-webmcp"
}
```

Notes:
- `name` / `owner` / `url` / `page` map directly to the package `name`, repository `author`, and repo URL.
- `category` is `browser` (the plugin drives a built-in headless browser).
- `install` uses a `github:` source so it works without an npm publish.

## 4. Submitting the PR

### Option A — gh CLI

```bash
# 1. Authenticate
gh auth login

# 2. Clone the marketplace repo
gh repo clone awesome-dsh-plugin/awesome-dsh-plugin
cd awesome-dsh-plugin

# 3. Edit plugins.json and add your entry (from section 3)

# 4. Open the PR (from the fork / branch you are on)
gh pr create \
  --base main \
  --title "Add dsh-webmcp plugin to the marketplace" \
  --body "$(cat <<'EOF'
## What
Add `dsh-webmcp` to the DSH plugin marketplace.

## Why
A WebMCP bridge that lets a DSH agent discover and call site tools exposed over the W3C WebMCP protocol via a built-in headless browser.

## Entry
```json
{
  "name": "dsh-webmcp",
  "owner": "T-Markus-Liang",
  "url": "https://github.com/T-Markus-Liang/dsh-webmcp",
  "page": "https://github.com/T-Markus-Liang/dsh-webmcp",
  "category": "browser",
  "description": "WebMCP bridge: let your DSH agent discover & call site tools exposed over the W3C WebMCP protocol via a built-in headless browser.",
  "install": "dsh plugin --profile web add github:T-Markus-Liang/dsh-webmcp"
}
```
EOF
)"
```

> If you cloned `awesome-dsh-plugin/awesome-dsh-plugin` directly you'll need a fork: either fork the repo first and clone your fork, or let `gh pr create` handle it automatically (GitHub prompts to create a fork when you open a PR from a branch you can't push to).

### Option B — manual fork + PR

1. Fork `github.com/awesome-dsh-plugin/awesome-dsh-plugin` on GitHub.
2. Clone your fork:
   ```bash
   git clone https://github.com/<your-user>/awesome-dsh-plugin.git
   cd awesome-dsh-plugin
   git checkout -b add-dsh-webmcp
   ```
3. Edit `plugins.json` to add your entry (from section 3).
4. Commit and push:
   ```bash
   git add plugins.json
   git commit -m "Add dsh-webmcp plugin to the marketplace"
   git push origin add-dsh-webmcp
   ```
5. Open a PR against `awesome-dsh-plugin:main` on GitHub, using the same title/description as in Option A.

## 5. Post-publish verification checklist

- [ ] **Search the marketplace.** Visit `awesome-dsh-plugin.com` and search `dsh-webmcp`. The plugin appears with its name, owner, category, and description.
- [ ] **Dry-run the install command.** In a scratch harness profile, verify resolution without actually committing anything:
  ```bash
  dsh plugin --profile web add github:T-Markus-Liang/dsh-webmcp --dry-run
  ```
  (If your DSH version has no `--dry-run` flag, confirm that the command resolves the repo and that the bundled `cordis.patch.yml` config is valid, then add and remove it.)
- [ ] **Check the rendered `page` link** points to the public repo and that the repo's README is present.
- [ ] **Confirm the marketplace CI** regenerated the site after the merge (the catalog updates daily).

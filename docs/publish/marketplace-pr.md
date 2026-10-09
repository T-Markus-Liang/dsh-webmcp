# Publishing dsh-webmcp to the DSH plugin marketplace

This walkthrough takes `dsh-webmcp` from "runs locally" to "listed on the DSH plugin marketplace" (`awesome-dsh-plugin.com`).

> Status: `dsh-webmcp` is already listed. This was merged as PR
> **#3481 "Add dsh-webmcp (browser)"** into `awesome-dsh-plugin/awesome-dsh-plugin`,
> which added `data/plugins/T-Markus-Liang__dsh-webmcp.yml`. The steps below are
> the current procedure — use them for future updates or new plugins.

## 1. Prerequisites

Make sure all of the following hold before you submit an entry:

- **Repository is public and pushed.** `dsh-webmcp` lives at `github.com/T-Markus-Liang/dsh-webmcp` and is publicly readable. The marketplace catalog reads metadata from public GitHub URLs, so the repo must be public and pushed to `main`.
- **`package.json` declares `dsh.bundle`.** The repo must be installable via `dsh plugin add`, which is what earns it a slot. Declaring only `dsh.client` is rejected. `dsh-webmcp` ships a `dsh.bundle` → `cordis.patch.yml`.
- **npm is optional.** You can install from a `github:` source, so an npm release is not required to be listed. Publishing to npm only improves the install experience (prebuilt install skips the `allowBuilds` approval step).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to the repo.

## 2. Where the catalog lives

The marketplace directory lives in the community repo:

```
github.com/awesome-dsh-plugin/awesome-dsh-plugin
```

The list is **one YAML file per plugin** under `data/plugins/`, named `<owner>__<repo>.yml`:

```
data/plugins/T-Markus-Liang__dsh-webmcp.yml
```

Its CI regenerates the READMEs and publishes the rendered marketplace every day to:

```
awesome-dsh-plugin.com
```

So: **you submit a PR to `awesome-dsh-plugin` that adds one file, `data/plugins/<owner>__<repo>.yml`, and the site updates automatically.** The READMEs are generated — never edit them by hand; edit your YAML.

## 3. The plugin entry file

Create `data/plugins/T-Markus-Liang__dsh-webmcp.yml` with exactly this shape (the live entry after #3481):

```yaml
url: https://github.com/T-Markus-Liang/dsh-webmcp
name: T-Markus-Liang/dsh-webmcp
category: browser
description:
  en: 'WebMCP bridge: your agent discovers & calls site tools exposed over the W3C WebMCP protocol via a built-in headless Chromium.'
  zh: 'WebMCP 桥接器：让 agent 通过内置无头 Chromium，发现并调用网站按 W3C WebMCP 协议暴露的站点工具。'
```

Notes:
- `url` must match the repo exactly; `name` is the link text shown in the list (use the `owner/repo` form).
- `category` is `browser` for plugins that drive a headless browser. A full category list is defined in `contributing.md`.
- Only `description.en` is required; `zh` is optional (a maintainer will add missing translations).
- Optional fields for special cases (see `contributing.md`): `tarball:` (prebuilt tarball from a GitHub Release when source install is impossible); monorepo subpackages use `owner/repo#subname` as `name` and a `--`-separated filename.
- There is no `install` field — the storefront derives the install command automatically. A hand-written `npm:` key is rejected.

## 4. Submitting the PR

### Option A — gh CLI

```bash
# 1. Authenticate
gh auth login

# 2. Clone the marketplace repo
gh repo clone awesome-dsh-plugin/awesome-dsh-plugin
cd awesome-dsh-plugin
# (create a fork first, or amend this to your fork/branch — see the note below)

# 3. Add the entry file (section 3)
#    data/plugins/T-Markus-Liang__dsh-webmcp.yml

# 4. Open the PR (from the fork / branch you are on)
gh pr create \
  --base main \
  --title "Add dsh-webmcp (browser)" \
  --body "$(cat <<'EOF'
## What
Add `dsh-webmcp` to the DSH plugin marketplace.

## Why
A WebMCP bridge that lets a DSH agent discover and call site tools exposed over the W3C WebMCP protocol via a built-in headless browser.

## Entry
```yaml
url: https://github.com/T-Markus-Liang/dsh-webmcp
name: T-Markus-Liang/dsh-webmcp
category: browser
description:
  en: 'WebMCP bridge: your agent discovers & calls site tools exposed over the W3C WebMCP protocol via a built-in headless Chromium.'
  zh: 'WebMCP 桥接器：让 agent 通过内置无头 Chromium，发现并调用网站按 W3C WebMCP 协议暴露的站点工具。'
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
3. Add the file `data/plugins/T-Markus-Liang__dsh-webmcp.yml` (content from section 3). Keep the PR to **one entry** (max 3 per PR, and only for separate installable subpackages).
4. Commit and push:
   ```bash
   git add data/plugins/T-Markus-Liang__dsh-webmcp.yml
   git commit -m "Add dsh-webmcp (browser)"
   git push origin add-dsh-webmcp
   ```
5. Open a PR against `awesome-dsh-plugin:main` on GitHub, using the same title/description as in Option A.

## 5. Post-publish verification checklist

- [ ] **Search the marketplace.** Visit `awesome-dsh-plugin.com` and search `dsh-webmcp`. The plugin appears with its name, owner, category, and description.
- [ ] **Confirm the live YAML is on `main`.** `curl -s https://raw.githubusercontent.com/awesome-dsh-plugin/awesome-dsh-plugin/main/data/plugins/T-Markus-Liang__dsh-webmcp.yml` returns the entry.
- [ ] **Dry-run the install command.** In a scratch harness profile, verify resolution without actually committing anything:
  ```bash
  dsh plugin --profile web add github:T-Markus-Liang/dsh-webmcp --dry-run
  ```
  (If your DSH version has no `--dry-run` flag, confirm that the command resolves the repo and that the bundled `cordis.patch.yml` config is valid, then add and remove it.)
- [ ] **Check the rendered `page` link** points to the public repo and that the repo's README is present.
- [ ] **Confirm the marketplace CI** regenerated the site after the merge (the catalog updates daily).

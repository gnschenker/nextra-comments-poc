# Security and install-script notes

`npm audit` on this tree reports **0** vulnerabilities (was 17: 2 critical, 2 high, 7 moderate, 6 low). CI fails `npm audit --audit-level=high`.

## What we changed

| Finding | Severity | Fix |
| --- | --- | --- |
| [tinypool](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) / [tinypool RCE](https://github.com/advisories/GHSA-85c8-ppgw-ccpr) | critical | Dropped with **vitest 4.1.12** (vitest 3 pulled `tinypool@1.1.1`; vitest 4 does not depend on tinypool). |
| [vitest UI path traversal](https://github.com/advisories/GHSA-5xrq-8626-4rwp) | critical | **vitest 4.1.12** (`>=3.2.6`). |
| [postcss source map / XSS](https://github.com/advisories/GHSA-6g55-p6wh-862q) (and related GHSA-qx2v-qp2m-jg93, GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849) | high | `overrides.postcss` **8.5.32**. Next 15.5.29 still pins `postcss@8.4.31`; there is no newer 15.x. Did not bump Next to 16. |
| [sharp / libvips / libheif / librsvg](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) | high | `overrides.sharp` **0.35.5**. Optional Next image pipeline only. |
| [@vitest/mocker](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) | moderate | vitest 4.1.12. |
| [katex](https://github.com/advisories/GHSA-238p-pmpm-9mq7) (and mermaid / remark-math / rehype-katex via katex) | low | `overrides.katex` **0.18.2**. This handbook does not use LaTeX. |
| [minimatch DoS](https://github.com/advisories/GHSA-g3hv-75wg-m249) (via nextra → ts-morph) | moderate | `overrides.minimatch` **11.0.7**. |

Next stays at **15.5.29**. `npm audit fix --force` was not used (it wanted Next 16 and Nextra 2).

## Install scripts (npm 11 `allowScripts`)

`package.json` `allowScripts` was written with `npm install-scripts approve` and pins:

- `@prisma/engines@7.10.1` (Prisma engine download)
- `better-sqlite3@12.11.1` (native SQLite addon)
- `prisma@7.10.1` (CLI preinstall)

Those are the packages this app needs to run scripts. After the vitest 4 upgrade, **esbuild is no longer in the tree**, so it is not on the allowlist. `sharp@0.35.5` has no `install`/`postinstall` script.

`npm ci` on npm 11 prints no `install-scripts` warning. npm 10 (Node 22) ignores `allowScripts` and still runs lifecycle scripts as usual.

## Deprecations that remain (not CVEs)

### `mathjax-full@3.2.2`

Comes from **nextra → better-react-mathjax**. Nextra 4.6.1 still depends on `better-react-mathjax`. `latex` in `nextra({})` is optional and off in this app, but Nextra always ships the MathJax components from `nextra/components`, so the package is still installed. Removing it would mean forking Nextra or waiting for a Nextra release that depends on `@mathjax/src`. This site has no `$…$` math.

### `prebuild-install@7.1.3`

Comes from **better-sqlite3@12.11.1**. Version 13 dropped `prebuild-install`, but `@prisma/adapter-better-sqlite3@7.10.1` peers `better-sqlite3@^12.6.0`, which does not include 13. Stay on 12.11.1 until the Prisma adapter allows 13.

## Nothing left in `npm audit`

There are no remaining low/moderate/high/critical advisories to waive.

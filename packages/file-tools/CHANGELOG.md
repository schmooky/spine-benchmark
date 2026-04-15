# @spine-benchmark/file-tools

## 0.1.1

### Patch Changes

- [`21f0646`](https://github.com/schmooky/spine-benchmark/commit/21f064654363ad3e5ae3492bb6ad096f93fd428a) Thanks [@schmooky](https://github.com/schmooky)! - Switch internal workspace dependencies from `file:..` paths to semver ranges. No runtime change for consumers; required so that the new changesets-driven release pipeline can cascade dependency bumps automatically (a release of `@spine-benchmark/metrics-impact-formula` now forces a matching patch release of every package that depends on it, so the npm registry never has a published `pixi-crawler` referencing a stale leaf package).

- Updated dependencies [[`21f0646`](https://github.com/schmooky/spine-benchmark/commit/21f064654363ad3e5ae3492bb6ad096f93fd428a), [`b032a64`](https://github.com/schmooky/spine-benchmark/commit/b032a64cbd3c8b70030746555583f4fda75bf5ba), [`351a74e`](https://github.com/schmooky/spine-benchmark/commit/351a74e0742c631cdfa8c3ea88c010c01ed82bdc), [`aa36b8f`](https://github.com/schmooky/spine-benchmark/commit/aa36b8fb827875c7240934c997ff14adabac7729)]:
  - @spine-benchmark/asset-store@0.1.1
  - @spine-benchmark/spine-loader@0.1.1

# @spine-benchmark/metrics-analyzers

## 0.2.0

### Minor Changes

- **Breaking:** the package is now the device cost-model toolkit - `deviceFit` (`gpuFamily`, `fitDevices`, `toCoefficientTable`, `predictForFamily`), `deviceClass` (`deviceClass`, `deviceFamily`, `groupPortableByFamily`) and `deviceCalibration` (`predictDeviceMs` and helpers). The per-attachment RI/CI analyzers of 0.1.x (`blendModeAnalyzer`, `clippingAnalyzer`, `meshAnalyzer`, `physicsAnalyzer`, `skeletonAnalyzer`) are gone; scoring lives in `@spine-benchmark/metrics-impact-formula`.
- Fix: removed the `development` export conditions of `./deviceClass` and `./deviceFit`. They pointed at `src/`, which is not published, so dev-mode resolution (Vite) failed for consumers.

### Patch Changes

- Updated dependencies:
  - @spine-benchmark/metrics-impact-formula@0.2.0
  - @spine-benchmark/metrics-model@0.1.0

## 0.1.1

### Patch Changes

- [`21f0646`](https://github.com/schmooky/spine-benchmark/commit/21f064654363ad3e5ae3492bb6ad096f93fd428a) Thanks [@schmooky](https://github.com/schmooky)! - Switch internal workspace dependencies from `file:..` paths to semver ranges. No runtime change for consumers; required so that the new changesets-driven release pipeline can cascade dependency bumps automatically (a release of `@spine-benchmark/metrics-impact-formula` now forces a matching patch release of every package that depends on it, so the npm registry never has a published `pixi-crawler` referencing a stale leaf package).

- Updated dependencies [[`21f0646`](https://github.com/schmooky/spine-benchmark/commit/21f064654363ad3e5ae3492bb6ad096f93fd428a), [`3f95e6e`](https://github.com/schmooky/spine-benchmark/commit/3f95e6e18b638ab468be4ea5838a34a3731fb529), [`21f0646`](https://github.com/schmooky/spine-benchmark/commit/21f064654363ad3e5ae3492bb6ad096f93fd428a)]:
  - @spine-benchmark/metrics-factors@0.1.1
  - @spine-benchmark/metrics-sampling@0.1.1
  - @spine-benchmark/metrics-scoring@0.1.1

# @spine-benchmark/metrics-model

## 0.1.0

### Minor Changes

- First release: ridge-regression fit of the feature -> milliseconds cost model, overall and per GPU family (two-stage fit with sweep-pinned weights, cross-validated quality), plus per-run capacity analysis (`analyzeRunCapacity`). Its `LinearCostModel` output plugs into `predictCostMs()` of `@spine-benchmark/metrics-impact-formula`.

### Patch Changes

- Updated dependencies:
  - @spine-benchmark/metrics-impact-formula@0.2.0

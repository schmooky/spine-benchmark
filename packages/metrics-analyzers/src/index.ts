// @spine-benchmark/metrics-analyzers is the device cost-model toolkit: it
// turns uploaded runs into a per-GPU-family fitted ms model (deviceFit) and
// classifies devices into portable families (deviceClass). The old RI/CI
// per-attachment analyzers that used to live here were removed when the
// project moved from unitless RI/CI scores to the fitted-ms cost model - the
// canonical scoring math now lives entirely in
// @spine-benchmark/metrics-impact-formula (see ADR 0001).
export * from './deviceFit.js';
export * from './deviceClass.js';

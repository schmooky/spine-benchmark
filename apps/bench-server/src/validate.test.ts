import { describe, expect, it } from "vitest";

import { renderFleet, type FleetSummary, type FleetValidation } from "./fleet.js";

/** renderFleet must fold in a validation snapshot without throwing and surface
 * the MAPE + a scatter SVG - the "can I trust it" evidence on /fleet. */
const EMPTY_FLEET: FleetSummary = {
  generatedAt: "2026-07-03T00:00:00.000Z",
  totalRuns: 3,
  portableRuns: 3,
  excludedDesktopRuns: 0,
  unknownRuns: 0,
  families: [],
  gpuCoverage: [],
};

describe("renderFleet with validation", () => {
  it("renders the prediction-accuracy section with MAPE and a scatter", () => {
    const validation: FleetValidation = {
      generatedAt: "2026-07-03T00:01:00.000Z",
      families: [
        {
          family: "Apple GPU",
          testRuns: 2,
          testRows: 40,
          cpuMape: 0.12,
          gpuMape: 0.22,
          scatter: [
            { predicted: 1, measured: 1.1 },
            { predicted: 2, measured: 1.9 },
          ],
        },
      ],
    };
    const html = renderFleet(EMPTY_FLEET, validation);
    expect(html).toContain("Prediction accuracy");
    expect(html).toContain("Apple GPU");
    expect(html).toContain("12%"); // cpu MAPE
    expect(html).toContain("<svg"); // scatter rendered
    expect(html).toContain("2 runs"); // holdout size
  });

  it("omits the section entirely when no validation is available", () => {
    const html = renderFleet(EMPTY_FLEET);
    expect(html).not.toContain("Prediction accuracy");
  });

  it("shows 'no timer' for families without a GPU MAPE", () => {
    const validation: FleetValidation = {
      generatedAt: "2026-07-03T00:01:00.000Z",
      families: [
        { family: "PowerVR", testRuns: 1, testRows: 10, cpuMape: 0.3, gpuMape: null, scatter: [] },
      ],
    };
    const html = renderFleet(EMPTY_FLEET, validation);
    expect(html).toContain("no timer");
  });
});

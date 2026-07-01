/**
 * Tiny dependency-free ridge (L2) least-squares solver. Feature counts here are
 * small (~14 incl. intercept), so plain normal equations with Gauss-Jordan
 * inversion are fine and keep the package zero-dependency.
 *
 *   beta = (XᵀX + λI)⁻¹ Xᵀy
 */

/** Solve ridge regression. `X` rows are feature vectors (WITHOUT intercept -
 * a bias column is added internally). Returns [intercept, ...coefficients]. */
export function solveRidge(X: number[][], y: number[], lambda = 1e-3): number[] {
  const n = X.length;
  if (n === 0) return [];
  const m = X[0].length;
  // design matrix with bias column at index 0
  const A: number[][] = X.map((row) => [1, ...row]);
  const p = m + 1;

  // XᵀX (+ λ on non-bias diagonal) and Xᵀy
  const XtX: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty: number[] = new Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    const row = A[i];
    for (let a = 0; a < p; a++) {
      Xty[a] += row[a] * y[i];
      for (let b = 0; b < p; b++) XtX[a][b] += row[a] * row[b];
    }
  }
  for (let a = 1; a < p; a++) XtX[a][a] += lambda; // don't regularize the bias

  return solveLinear(XtX, Xty);
}

/** Solve A x = b via Gauss-Jordan with partial pivoting. */
export function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    if (Math.abs(M[piv][col]) < 1e-12) continue; // singular column -> leave 0
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

/** R² and mean-absolute-error of predictions vs actuals. */
export function fitQuality(pred: number[], actual: number[]): { r2: number; mae: number } {
  const n = actual.length;
  if (n === 0) return { r2: 0, mae: 0 };
  const mean = actual.reduce((a, b) => a + b, 0) / n;
  let ssRes = 0;
  let ssTot = 0;
  let ae = 0;
  for (let i = 0; i < n; i++) {
    ssRes += (actual[i] - pred[i]) ** 2;
    ssTot += (actual[i] - mean) ** 2;
    ae += Math.abs(actual[i] - pred[i]);
  }
  return { r2: ssTot > 0 ? 1 - ssRes / ssTot : 0, mae: ae / n };
}

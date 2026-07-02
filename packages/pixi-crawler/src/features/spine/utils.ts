export const NO_OP: () => void = () => {};

export function wrapInstance<T extends object, K extends keyof T>(
  target: T,
  key: K,
  factory: (original: T[K]) => T[K]
): () => void {
  const hadOwn = Object.prototype.hasOwnProperty.call(target, key);
  const original = target[key];
  target[key] = factory(original);
  return () => {
    if (hadOwn) {
      target[key] = original;
    } else {
      delete target[key];
    }
  };
}

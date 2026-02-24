type IndexedValue = string | number | null | undefined;

export function formatIndexedMessage(template: string, values: IndexedValue[]): string {
  let result = template;
  values.forEach((value, index) => {
    const token = new RegExp(`\\{${index}\\}`, 'g');
    result = result.replace(token, value == null ? '' : String(value));
  });
  return result;
}

export function tIndexed(
  t: (key: string, options?: Record<string, unknown>) => string,
  key: string,
  values: IndexedValue[],
): string {
  return formatIndexedMessage(t(key), values);
}

export function mergeMaps(propNames: string[], ...maps: Map<string, any>[]) {
  const mergedMap = new Map<string, Record<string, any>>();

  // Ensure we have enough property names for all maps
  if (propNames.length < maps.length) {
    throw new Error("Not enough property names provided for all maps");
  }

  // Get all unique keys from all maps
  const allKeys = new Set(maps.flatMap((map) => [...map.keys()]));

  allKeys.forEach((key) => {
    const mergedValue: Record<string, any> = {};

    maps.forEach((map, index) => {
      const propName = propNames[index];
      mergedValue[propName] = map.get(key) ?? "";
    });

    mergedMap.set(key, mergedValue);
  });

  return mergedMap;
}

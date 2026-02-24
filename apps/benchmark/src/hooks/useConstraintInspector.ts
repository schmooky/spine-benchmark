import { useEffect, useRef, useState } from 'react';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { ConstraintInfo, collectConstraints } from '../core/constraintBaker';

export function useConstraintInspector(spineInstance: Spine | null): ConstraintInfo[] {
  const [constraints, setConstraints] = useState<ConstraintInfo[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!spineInstance) {
      setConstraints([]);
      return;
    }

    // Initial collection
    setConstraints(collectConstraints(spineInstance));

    // Throttled periodic refresh
    timerRef.current = setInterval(() => {
      setConstraints(collectConstraints(spineInstance));
    }, 500);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [spineInstance]);

  return constraints;
}

import { useState, useEffect, Dispatch, SetStateAction } from 'react';

export function useSafeLocalStorage<T>(
  key: string, 
  initialValue: T
): [T, Dispatch<SetStateAction<T>>] {
  const [storedValue, setStoredValue] = useState<T>(initialValue);

  const isLocalStorageAvailable = (): boolean => {
    try {
      const testKey = '__test__';
      localStorage.setItem(testKey, testKey);
      localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  };

  useEffect(() => {
    try {
      if (!isLocalStorageAvailable()) return;
      
      const item = localStorage.getItem(key);
      if (item !== null) {
        setStoredValue(JSON.parse(item));
      }
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
    }
  }, [key]);

  const setValue: Dispatch<SetStateAction<T>> = (value) => {
    try {
      const valueToStore =
        value instanceof Function ? value(storedValue) : value;
      
      setStoredValue(valueToStore);
      
      if (isLocalStorageAvailable()) {
        localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue];
}
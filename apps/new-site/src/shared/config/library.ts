/** Spine library catalog. Empty by default - the workbench loads skeletons via
 *  drag-and-drop. Populate this (and serve the files, e.g. from /public/library
 *  or an API) to surface ready-to-load bundles in the Library drawer. */
export interface LibraryItem {
  id: string;
  name: string;
  note: string;
  /** files that make up the bundle, resolved against LIBRARY_BASE */
  files: string[];
}

export const LIBRARY_BASE = "/library/";

export const LIBRARY: LibraryItem[] = [];

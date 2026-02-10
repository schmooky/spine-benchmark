import React from 'react';
import { MeshOptimizerPanel } from '../components/MeshOptimizerPanel';
import { useWorkbench } from '../workbench/WorkbenchContext';

export function MeshOptimizerRouteView() {
  const { selectedAsset, onLoadOptimizedFiles } = useWorkbench();
  return <MeshOptimizerPanel asset={selectedAsset} onLoadOptimized={onLoadOptimizedFiles} />;
}

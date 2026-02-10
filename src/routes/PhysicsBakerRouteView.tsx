import React from 'react';
import { PhysicsBakerPanel } from '../components/PhysicsBakerPanel';
import { useWorkbench } from '../workbench/WorkbenchContext';

export function PhysicsBakerRouteView() {
  const { selectedAsset } = useWorkbench();
  return <PhysicsBakerPanel asset={selectedAsset} />;
}

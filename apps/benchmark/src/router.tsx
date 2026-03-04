import React from 'react';
import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import App from './App';
import { BenchmarkRouteView } from './routes/BenchmarkRouteView';
import { MeshOptimizerRouteView } from './routes/MeshOptimizerRouteView';
import { PhysicsBakerRouteView } from './routes/PhysicsBakerRouteView';
import { AssetsRouteView } from './routes/AssetsRouteView';
import { DocumentationRouteView } from './routes/DocumentationRouteView';
import { PartnersRouteView } from './routes/PartnersRouteView';
import { DrawCallInspectorRouteView } from './routes/DrawCallInspectorRouteView';
import { AtlasRepackRouteView } from './routes/AtlasRepackRouteView';
import { ComparisonRouteView } from './routes/ComparisonRouteView';
import { AnimationHeatmapRouteView } from './routes/AnimationHeatmapRouteView';
import { OptionsRouteView } from './routes/OptionsRouteView';

const rootRoute = createRootRoute({
  component: () => <App />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/tools/benchmark' });
  },
});

const toolsLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tools',
  beforeLoad: ({ location }) => {
    if (location.pathname === '/tools') {
      throw redirect({ to: '/tools/benchmark' });
    }
  },
  component: () => <Outlet />,
});

const benchmarkRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: '/benchmark',
  component: BenchmarkRouteView,
});

const meshOptimizerRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: '/mesh-optimizer',
  component: MeshOptimizerRouteView,
});

const physicsBakerRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: '/physics-baker',
  component: PhysicsBakerRouteView,
});

const drawCallInspectorRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: '/draw-call-inspector',
  component: DrawCallInspectorRouteView,
});

const atlasRepackRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: '/atlas-repack',
  component: AtlasRepackRouteView,
});

const comparisonRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: '/comparison',
  component: ComparisonRouteView,
});

const animationHeatmapRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: '/animation-heatmap',
  component: AnimationHeatmapRouteView,
});

const assetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/assets',
  component: AssetsRouteView,
});

const documentationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/documentation',
  component: DocumentationRouteView,
});

const partnersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/partners',
  component: PartnersRouteView,
});

const optionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/options',
  component: OptionsRouteView,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  toolsLayoutRoute.addChildren([
    benchmarkRoute,
    meshOptimizerRoute,
    physicsBakerRoute,
    drawCallInspectorRoute,
    atlasRepackRoute,
    comparisonRoute,
    animationHeatmapRoute,
  ]),
  assetsRoute,
  documentationRoute,
  partnersRoute,
  optionsRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

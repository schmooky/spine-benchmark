/**
 * End-to-End Performance Impact Tests
 * 
 * Tests the cumulative performance impact calculation system using
 * Gambit Olympus symbol examples with multiple instances on screen.
 * 
 * Test scenarios:
 * - 15 low_1 symbols on the scene
 * - 15 high_1 symbols on the scene  
 * - 15 scatter symbols on the scene
 */

import { Application } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { SpinePerformanceAnalyzer } from '../../src/core/SpinePerformanceAnalyzer';
import { calculateComputationImpact, calculateRenderingImpact, calculatePerformanceScore } from '../../src/core/utils/performanceCalculator';
import { PERFORMANCE_WEIGHTS } from '../../src/core/constants/performanceWeights';

interface TestScenario {
  name: string;
  symbolType: 'low_1' | 'high_1' | 'scatter';
  instanceCount: number;
  expectedMinCI: number;
  expectedMinRI: number;
  expectedMaxScore: number;
}

interface CumulativeMetrics {
  totalComputationImpact: number;
  totalRenderingImpact: number;
  totalImpact: number;
  performanceScore: number;
  instanceMetrics: Array<{
    instanceId: number;
    computationImpact: number;
    renderingImpact: number;
    totalImpact: number;
    performanceScore: number;
  }>;
}

/**
 * Load a Spine skeleton from the examples folder
 */
async function loadSpineSkeleton(
  app: Application,
  symbolType: 'low_1' | 'high_1' | 'scatter'
): Promise<Spine> {
  const basePath = './examples/gambit/olympus';
  
  // Map symbol types to their file names
  const fileMap = {
    low_1: 'low_1',
    high_1: 'high_1',
    scatter: 'scatter'
  };
  
  const fileName = fileMap[symbolType];
  
  // Load skeleton data
  const skeletonResponse = await fetch(`${basePath}/${fileName}.json`);
  const skeletonData = await skeletonResponse.json();
  
  // Load atlas data
  const atlasPath = symbolType === 'scatter' 
    ? `${basePath}/Symbols_high_fix.atlas`
    : `${basePath}/low_symbols_fix.atlas`;
    
  const atlasResponse = await fetch(atlasPath);
  const atlasText = await atlasResponse.text();
  
  // Create Spine instance
  const spine = Spine.from({
    skeleton: skeletonData,
    atlas: atlasText
  });
  
  return spine;
}

/**
 * Calculate cumulative performance impact for multiple instances
 */
function calculateCumulativeImpact(
  instances: Spine[],
  animationName: string = 'idle'
): CumulativeMetrics {
  const instanceMetrics: CumulativeMetrics['instanceMetrics'] = [];
  
  let totalCI = 0;
  let totalRI = 0;
  
  instances.forEach((spine, index) => {
    // Analyze each instance
    const analysis = SpinePerformanceAnalyzer.analyze(spine);
    
    // Find the specified animation or use global metrics
    const animationAnalysis = analysis.animations.find(a => a.name === animationName);
    const metrics = animationAnalysis?.metrics || analysis.globalMetrics;
    
    totalCI += metrics.computationImpact;
    totalRI += metrics.renderingImpact;
    
    instanceMetrics.push({
      instanceId: index + 1,
      computationImpact: metrics.computationImpact,
      renderingImpact: metrics.renderingImpact,
      totalImpact: metrics.totalImpact,
      performanceScore: metrics.performanceScore
    });
  });
  
  const totalImpact = totalCI + totalRI;
  const performanceScore = calculatePerformanceScore(totalImpact);
  
  return {
    totalComputationImpact: totalCI,
    totalRenderingImpact: totalRI,
    totalImpact,
    performanceScore,
    instanceMetrics
  };
}

/**
 * Create detailed performance report
 */
function generatePerformanceReport(
  scenario: TestScenario,
  metrics: CumulativeMetrics
): string {
  const lines: string[] = [];
  
  lines.push('='.repeat(80));
  lines.push(`Performance Impact Report: ${scenario.name}`);
  lines.push('='.repeat(80));
  lines.push('');
  
  lines.push(`Symbol Type: ${scenario.symbolType}`);
  lines.push(`Instance Count: ${scenario.instanceCount}`);
  lines.push('');
  
  lines.push('CUMULATIVE METRICS:');
  lines.push('-'.repeat(80));
  lines.push(`Total Computation Impact (CI): ${metrics.totalComputationImpact.toFixed(2)}`);
  lines.push(`Total Rendering Impact (RI): ${metrics.totalRenderingImpact.toFixed(2)}`);
  lines.push(`Total Impact: ${metrics.totalImpact.toFixed(2)}`);
  lines.push(`Performance Score: ${metrics.performanceScore.toFixed(2)}/100`);
  lines.push('');
  
  lines.push('PER-INSTANCE BREAKDOWN:');
  lines.push('-'.repeat(80));
  lines.push('ID | CI      | RI      | Total   | Score');
  lines.push('-'.repeat(80));
  
  metrics.instanceMetrics.forEach(instance => {
    lines.push(
      `${String(instance.instanceId).padStart(2)} | ` +
      `${instance.computationImpact.toFixed(2).padStart(7)} | ` +
      `${instance.renderingImpact.toFixed(2).padStart(7)} | ` +
      `${instance.totalImpact.toFixed(2).padStart(7)} | ` +
      `${instance.performanceScore.toFixed(2).padStart(5)}`
    );
  });
  
  lines.push('');
  lines.push('PERFORMANCE WEIGHTS USED:');
  lines.push('-'.repeat(80));
  lines.push(`Bone Weight (wb): ${PERFORMANCE_WEIGHTS.wb}`);
  lines.push(`IK Constraint (wIK): ${PERFORMANCE_WEIGHTS.wIK}`);
  lines.push(`Transform Constraint (wTC): ${PERFORMANCE_WEIGHTS.wTC}`);
  lines.push(`Path Constraint (wPC): ${PERFORMANCE_WEIGHTS.wPC}`);
  lines.push(`Physics Constraint (wPH): ${PERFORMANCE_WEIGHTS.wPH}`);
  lines.push(`Mesh Vertex (wmesh): ${PERFORMANCE_WEIGHTS.wmesh}`);
  lines.push(`Skinned Mesh (wskin): ${PERFORMANCE_WEIGHTS.wskin}`);
  lines.push(`Deform Timeline (wdef): ${PERFORMANCE_WEIGHTS.wdef}`);
  lines.push(`Clipping (wclip): ${PERFORMANCE_WEIGHTS.wclip}`);
  lines.push(`Animation Mixing (wmix): ${PERFORMANCE_WEIGHTS.wmix}`);
  lines.push(`Draw Call (wdc): ${PERFORMANCE_WEIGHTS.wdc}`);
  lines.push(`Triangle (wtri): ${PERFORMANCE_WEIGHTS.wtri}`);
  lines.push(`Blend Mode (wblend): ${PERFORMANCE_WEIGHTS.wblend}`);
  lines.push(`Normalization Scalar (S): ${PERFORMANCE_WEIGHTS.S}`);
  lines.push(`Decay Factor (k): ${PERFORMANCE_WEIGHTS.k}`);
  lines.push('');
  lines.push('='.repeat(80));
  
  return lines.join('\n');
}

/**
 * Main test suite
 */
describe('Performance Impact E2E Tests', () => {
  let app: Application;
  
  beforeAll(async () => {
    // Create PixiJS application
    app = new Application();
    await app.init({
      width: 1920,
      height: 1080,
      backgroundColor: 0x1a1a1a
    });
  });
  
  afterAll(() => {
    app.destroy();
  });
  
  const scenarios: TestScenario[] = [
    {
      name: '15 Low_1 Symbols',
      symbolType: 'low_1',
      instanceCount: 15,
      expectedMinCI: 100,
      expectedMinRI: 20,
      expectedMaxScore: 85
    },
    {
      name: '15 High_1 Symbols',
      symbolType: 'high_1',
      instanceCount: 15,
      expectedMinCI: 150,
      expectedMinRI: 30,
      expectedMaxScore: 75
    },
    {
      name: '15 Scatter Symbols',
      symbolType: 'scatter',
      instanceCount: 15,
      expectedMinCI: 120,
      expectedMinRI: 25,
      expectedMaxScore: 80
    }
  ];
  
  scenarios.forEach(scenario => {
    describe(scenario.name, () => {
      let instances: Spine[] = [];
      let metrics: CumulativeMetrics;
      
      beforeAll(async () => {
        // Load multiple instances
        for (let i = 0; i < scenario.instanceCount; i++) {
          const spine = await loadSpineSkeleton(app, scenario.symbolType);
          
          // Position instances in a grid
          const cols = 5;
          const spacing = 200;
          const row = Math.floor(i / cols);
          const col = i % cols;
          
          spine.x = col * spacing + 100;
          spine.y = row * spacing + 100;
          spine.scale.set(0.5);
          
          // Set to idle animation
          if (spine.state.hasAnimation('idle')) {
            spine.state.setAnimation(0, 'idle', true);
          }
          
          app.stage.addChild(spine);
          instances.push(spine);
        }
        
        // Calculate cumulative metrics
        metrics = calculateCumulativeImpact(instances, 'idle');
        
        // Generate and log report
        const report = generatePerformanceReport(scenario, metrics);
        console.log('\n' + report);
      });
      
      afterAll(() => {
        // Clean up instances
        instances.forEach(spine => {
          app.stage.removeChild(spine);
          spine.destroy();
        });
        instances = [];
      });
      
      test('should load all instances successfully', () => {
        expect(instances).toHaveLength(scenario.instanceCount);
        instances.forEach(spine => {
          expect(spine).toBeDefined();
          expect(spine.skeleton).toBeDefined();
        });
      });
      
      test('should calculate computation impact correctly', () => {
        expect(metrics.totalComputationImpact).toBeGreaterThan(0);
        expect(metrics.totalComputationImpact).toBeGreaterThanOrEqual(scenario.expectedMinCI);
        
        // Each instance should contribute to total CI
        const sumCI = metrics.instanceMetrics.reduce(
          (sum, m) => sum + m.computationImpact, 
          0
        );
        expect(Math.abs(sumCI - metrics.totalComputationImpact)).toBeLessThan(0.01);
      });
      
      test('should calculate rendering impact correctly', () => {
        expect(metrics.totalRenderingImpact).toBeGreaterThan(0);
        expect(metrics.totalRenderingImpact).toBeGreaterThanOrEqual(scenario.expectedMinRI);
        
        // Each instance should contribute to total RI
        const sumRI = metrics.instanceMetrics.reduce(
          (sum, m) => sum + m.renderingImpact,
          0
        );
        expect(Math.abs(sumRI - metrics.totalRenderingImpact)).toBeLessThan(0.01);
      });
      
      test('should calculate total impact as CI + RI', () => {
        const expectedTotal = metrics.totalComputationImpact + metrics.totalRenderingImpact;
        expect(Math.abs(metrics.totalImpact - expectedTotal)).toBeLessThan(0.01);
      });
      
      test('should calculate performance score in valid range', () => {
        expect(metrics.performanceScore).toBeGreaterThanOrEqual(0);
        expect(metrics.performanceScore).toBeLessThanOrEqual(100);
      });
      
      test('should show performance degradation with multiple instances', () => {
        // More instances should result in lower performance score
        expect(metrics.performanceScore).toBeLessThanOrEqual(scenario.expectedMaxScore);
        
        // Score should decrease exponentially with total impact
        const normalizedImpact = metrics.totalImpact / PERFORMANCE_WEIGHTS.S;
        const expectedScore = 100 * Math.exp(-PERFORMANCE_WEIGHTS.k * normalizedImpact);
        expect(Math.abs(metrics.performanceScore - expectedScore)).toBeLessThan(0.01);
      });
      
      test('should have consistent metrics across instances', () => {
        // All instances of the same type should have similar metrics
        const firstInstance = metrics.instanceMetrics[0];
        
        metrics.instanceMetrics.forEach(instance => {
          // Allow for small variations due to animation state
          const ciDiff = Math.abs(instance.computationImpact - firstInstance.computationImpact);
          const riDiff = Math.abs(instance.renderingImpact - firstInstance.renderingImpact);
          
          expect(ciDiff).toBeLessThan(firstInstance.computationImpact * 0.1); // 10% tolerance
          expect(riDiff).toBeLessThan(firstInstance.renderingImpact * 0.1);
        });
      });
      
      test('should properly account for bone hierarchy depth', () => {
        // Analyze first instance for bone depth impact
        const analysis = SpinePerformanceAnalyzer.analyze(instances[0]);
        const animation = analysis.animations.find(a => a.name === 'idle');
        
        if (animation) {
          const depths = animation.frameMetrics.bones.depths;
          const boneCount = animation.frameMetrics.bones.count;
          
          expect(depths).toHaveLength(boneCount);
          expect(Math.max(...depths)).toBeGreaterThan(0);
        }
      });
      
      test('should account for mesh complexity', () => {
        const analysis = SpinePerformanceAnalyzer.analyze(instances[0]);
        const animation = analysis.animations.find(a => a.name === 'idle');
        
        if (animation) {
          const meshMetrics = animation.frameMetrics.meshes;
          
          // Should have vertex data
          expect(meshMetrics.vertexCount).toBeGreaterThan(0);
          
          // Mesh impact should be reflected in CI
          const meshImpact = 
            PERFORMANCE_WEIGHTS.wmesh * meshMetrics.vertexCount +
            PERFORMANCE_WEIGHTS.wskin * meshMetrics.skinnedWeights +
            PERFORMANCE_WEIGHTS.wdef * meshMetrics.deformTimelines;
          
          expect(meshImpact).toBeGreaterThan(0);
        }
      });
      
      test('should account for rendering complexity', () => {
        const analysis = SpinePerformanceAnalyzer.analyze(instances[0]);
        const animation = analysis.animations.find(a => a.name === 'idle');
        
        if (animation) {
          const renderMetrics = animation.frameMetrics.rendering;
          
          // Should have draw calls and triangles
          expect(renderMetrics.estimatedDrawCalls).toBeGreaterThan(0);
          expect(renderMetrics.renderedTriangles).toBeGreaterThan(0);
          
          // Rendering impact should match formula
          const expectedRI = 
            PERFORMANCE_WEIGHTS.wdc * renderMetrics.estimatedDrawCalls +
            PERFORMANCE_WEIGHTS.wtri * renderMetrics.renderedTriangles +
            PERFORMANCE_WEIGHTS.wblend * renderMetrics.nonNormalBlendSlots;
          
          expect(Math.abs(animation.metrics.renderingImpact - expectedRI)).toBeLessThan(0.01);
        }
      });
    });
  });
  
  describe('Comparative Analysis', () => {
    test('should show different impact levels for different symbol types', async () => {
      const results: Record<string, CumulativeMetrics> = {};
      
      // Load and analyze each symbol type
      for (const symbolType of ['low_1', 'high_1', 'scatter'] as const) {
        const instances: Spine[] = [];
        
        for (let i = 0; i < 15; i++) {
          const spine = await loadSpineSkeleton(app, symbolType);
          instances.push(spine);
        }
        
        results[symbolType] = calculateCumulativeImpact(instances, 'idle');
        
        // Clean up
        instances.forEach(spine => spine.destroy());
      }
      
      // Compare results
      console.log('\n' + '='.repeat(80));
      console.log('COMPARATIVE ANALYSIS');
      console.log('='.repeat(80));
      console.log('Symbol Type | Total CI | Total RI | Total Impact | Score');
      console.log('-'.repeat(80));
      
      Object.entries(results).forEach(([type, metrics]) => {
        console.log(
          `${type.padEnd(11)} | ` +
          `${metrics.totalComputationImpact.toFixed(2).padStart(8)} | ` +
          `${metrics.totalRenderingImpact.toFixed(2).padStart(8)} | ` +
          `${metrics.totalImpact.toFixed(2).padStart(12)} | ` +
          `${metrics.performanceScore.toFixed(2).padStart(5)}`
        );
      });
      console.log('='.repeat(80) + '\n');
      
      // Verify that different symbol types have different impacts
      const impacts = Object.values(results).map(r => r.totalImpact);
      const uniqueImpacts = new Set(impacts.map(i => Math.round(i)));
      
      expect(uniqueImpacts.size).toBeGreaterThan(1);
    });
  });
});
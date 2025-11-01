/**
 * Game State Performance E2E Tests
 * 
 * This test suite allows you to define game states with specific spine configurations
 * and validate that CI, RI, and TI metrics stay within acceptable thresholds.
 * 
 * Usage:
 * 1. Create a folder in tests/e2e/game-states/
 * 2. Add a config.json file defining the game state
 * 3. Run tests to validate performance metrics
 * 
 * This prevents performance regressions when tweaking parameters.
 */

import { Application } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { SpinePerformanceAnalyzer } from '../../src/core/SpinePerformanceAnalyzer';
import { calculatePerformanceScore } from '../../src/core/utils/performanceCalculator';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Configuration for a single spine instance in the game state
 */
interface SpineInstanceConfig {
  /** Path to the spine skeleton JSON file (relative to project root) */
  skeletonPath: string;
  /** Path to the atlas file (relative to project root) */
  atlasPath: string;
  /** Number of instances of this spine to create */
  count: number;
  /** Animation to play (default: 'idle') */
  animation?: string;
  /** Optional label for this spine type */
  label?: string;
}

/**
 * Performance thresholds for validation
 */
interface PerformanceThresholds {
  /** Maximum allowed Computation Impact */
  maxCI: number;
  /** Maximum allowed Rendering Impact */
  maxRI: number;
  /** Maximum allowed Total Impact */
  maxTI: number;
  /** Minimum required Performance Score (0-100) */
  minScore?: number;
  /** Tolerance percentage for threshold checks (default: 5%) */
  tolerance?: number;
}

/**
 * Complete game state configuration
 */
interface GameStateConfig {
  /** Name of the game state */
  name: string;
  /** Description of what this state represents */
  description?: string;
  /** List of spine instances in this state */
  spines: SpineInstanceConfig[];
  /** Performance thresholds to validate against */
  thresholds: PerformanceThresholds;
}

/**
 * Metrics for a single spine instance
 */
interface InstanceMetrics {
  label: string;
  instanceNumber: number;
  computationImpact: number;
  renderingImpact: number;
  totalImpact: number;
  performanceScore: number;
}

/**
 * Aggregated metrics for the entire game state
 */
interface GameStateMetrics {
  totalComputationImpact: number;
  totalRenderingImpact: number;
  totalImpact: number;
  performanceScore: number;
  instanceMetrics: InstanceMetrics[];
  breakdown: {
    [label: string]: {
      count: number;
      totalCI: number;
      totalRI: number;
      totalTI: number;
      avgCI: number;
      avgRI: number;
      avgTI: number;
    };
  };
}

/**
 * Load a Spine skeleton from file paths
 */
async function loadSpineSkeleton(
  skeletonPath: string,
  atlasPath: string
): Promise<Spine> {
  // Load skeleton data
  const skeletonData = JSON.parse(
    fs.readFileSync(skeletonPath, 'utf-8')
  );
  
  // Load atlas data
  const atlasText = fs.readFileSync(atlasPath, 'utf-8');
  
  // Create Spine instance
  const spine = Spine.from({
    skeleton: skeletonData,
    atlas: atlasText
  });
  
  return spine;
}

/**
 * Calculate cumulative performance metrics for a game state
 */
function calculateGameStateMetrics(
  instances: Array<{ spine: Spine; label: string; animation: string }>
): GameStateMetrics {
  const instanceMetrics: InstanceMetrics[] = [];
  const breakdown: GameStateMetrics['breakdown'] = {};
  
  let totalCI = 0;
  let totalRI = 0;
  
  instances.forEach(({ spine, label, animation }, index) => {
    // Analyze the spine instance
    const analysis = SpinePerformanceAnalyzer.analyze(spine);
    
    // Find the specified animation or use global metrics
    const animationAnalysis = analysis.animations.find(a => a.name === animation);
    const metrics = animationAnalysis?.metrics || analysis.globalMetrics;
    
    totalCI += metrics.computationImpact;
    totalRI += metrics.renderingImpact;
    
    // Track instance metrics
    instanceMetrics.push({
      label,
      instanceNumber: index + 1,
      computationImpact: metrics.computationImpact,
      renderingImpact: metrics.renderingImpact,
      totalImpact: metrics.totalImpact,
      performanceScore: metrics.performanceScore
    });
    
    // Update breakdown by label
    if (!breakdown[label]) {
      breakdown[label] = {
        count: 0,
        totalCI: 0,
        totalRI: 0,
        totalTI: 0,
        avgCI: 0,
        avgRI: 0,
        avgTI: 0
      };
    }
    
    breakdown[label].count++;
    breakdown[label].totalCI += metrics.computationImpact;
    breakdown[label].totalRI += metrics.renderingImpact;
    breakdown[label].totalTI += metrics.totalImpact;
  });
  
  // Calculate averages for breakdown
  Object.values(breakdown).forEach(b => {
    b.avgCI = b.totalCI / b.count;
    b.avgRI = b.totalRI / b.count;
    b.avgTI = b.totalTI / b.count;
  });
  
  const totalImpact = totalCI + totalRI;
  const performanceScore = calculatePerformanceScore(totalImpact);
  
  return {
    totalComputationImpact: totalCI,
    totalRenderingImpact: totalRI,
    totalImpact,
    performanceScore,
    instanceMetrics,
    breakdown
  };
}

/**
 * Generate a detailed performance report
 */
function generateReport(
  config: GameStateConfig,
  metrics: GameStateMetrics
): string {
  const lines: string[] = [];
  
  lines.push('='.repeat(80));
  lines.push(`Game State Performance Report: ${config.name}`);
  lines.push('='.repeat(80));
  
  if (config.description) {
    lines.push('');
    lines.push(`Description: ${config.description}`);
  }
  
  lines.push('');
  lines.push('CUMULATIVE METRICS:');
  lines.push('-'.repeat(80));
  lines.push(`Total Computation Impact (CI): ${metrics.totalComputationImpact.toFixed(2)}`);
  lines.push(`Total Rendering Impact (RI):   ${metrics.totalRenderingImpact.toFixed(2)}`);
  lines.push(`Total Impact (TI):              ${metrics.totalImpact.toFixed(2)}`);
  lines.push(`Performance Score:              ${metrics.performanceScore.toFixed(2)}/100`);
  
  lines.push('');
  lines.push('BREAKDOWN BY SPINE TYPE:');
  lines.push('-'.repeat(80));
  lines.push('Label                | Count | Total CI | Total RI | Total TI | Avg CI | Avg RI | Avg TI');
  lines.push('-'.repeat(80));
  
  Object.entries(metrics.breakdown).forEach(([label, data]) => {
    lines.push(
      `${label.padEnd(20)} | ` +
      `${String(data.count).padStart(5)} | ` +
      `${data.totalCI.toFixed(2).padStart(8)} | ` +
      `${data.totalRI.toFixed(2).padStart(8)} | ` +
      `${data.totalTI.toFixed(2).padStart(8)} | ` +
      `${data.avgCI.toFixed(2).padStart(6)} | ` +
      `${data.avgRI.toFixed(2).padStart(6)} | ` +
      `${data.avgTI.toFixed(2).padStart(6)}`
    );
  });
  
  lines.push('');
  lines.push('THRESHOLD VALIDATION:');
  lines.push('-'.repeat(80));
  
  const tolerance = config.thresholds.tolerance || 5;
  const maxCIWithTolerance = config.thresholds.maxCI * (1 + tolerance / 100);
  const maxRIWithTolerance = config.thresholds.maxRI * (1 + tolerance / 100);
  const maxTIWithTolerance = config.thresholds.maxTI * (1 + tolerance / 100);
  
  const ciPass = metrics.totalComputationImpact <= maxCIWithTolerance;
  const riPass = metrics.totalRenderingImpact <= maxRIWithTolerance;
  const tiPass = metrics.totalImpact <= maxTIWithTolerance;
  const scorePass = !config.thresholds.minScore || metrics.performanceScore >= config.thresholds.minScore;
  
  lines.push(`CI: ${metrics.totalComputationImpact.toFixed(2)} / ${config.thresholds.maxCI} (±${tolerance}%) ${ciPass ? '✓ PASS' : '✗ FAIL'}`);
  lines.push(`RI: ${metrics.totalRenderingImpact.toFixed(2)} / ${config.thresholds.maxRI} (±${tolerance}%) ${riPass ? '✓ PASS' : '✗ FAIL'}`);
  lines.push(`TI: ${metrics.totalImpact.toFixed(2)} / ${config.thresholds.maxTI} (±${tolerance}%) ${tiPass ? '✓ PASS' : '✗ FAIL'}`);
  
  if (config.thresholds.minScore) {
    lines.push(`Score: ${metrics.performanceScore.toFixed(2)} >= ${config.thresholds.minScore} ${scorePass ? '✓ PASS' : '✗ FAIL'}`);
  }
  
  lines.push('');
  lines.push('='.repeat(80));
  
  return lines.join('\n');
}

/**
 * Load game state configuration from a directory
 */
function loadGameStateConfig(configPath: string): GameStateConfig {
  const configData = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(configData);
}

/**
 * Find all game state configurations in the game-states directory
 */
function findGameStateConfigs(): string[] {
  const gameStatesDir = path.join(__dirname, 'game-states');
  
  if (!fs.existsSync(gameStatesDir)) {
    return [];
  }
  
  const configs: string[] = [];
  const entries = fs.readdirSync(gameStatesDir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const configPath = path.join(gameStatesDir, entry.name, 'config.json');
      if (fs.existsSync(configPath)) {
        configs.push(configPath);
      }
    }
  }
  
  return configs;
}

/**
 * Main test suite
 */
describe('Game State Performance Tests', () => {
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
  
  // Find all game state configurations
  const configPaths = findGameStateConfigs();
  
  if (configPaths.length === 0) {
    test('should have at least one game state configuration', () => {
      console.warn('\n⚠️  No game state configurations found in tests/e2e/game-states/');
      console.warn('Create a folder with a config.json file to define a game state.\n');
      expect(configPaths.length).toBeGreaterThan(0);
    });
  }
  
  // Create a test suite for each game state configuration
  configPaths.forEach(configPath => {
    const config = loadGameStateConfig(configPath);
    
    describe(config.name, () => {
      let instances: Array<{ spine: Spine; label: string; animation: string }> = [];
      let metrics: GameStateMetrics;
      
      beforeAll(async () => {
        // Load all spine instances defined in the configuration
        for (const spineConfig of config.spines) {
          const label = spineConfig.label || path.basename(spineConfig.skeletonPath, '.json');
          const animation = spineConfig.animation || 'idle';
          
          for (let i = 0; i < spineConfig.count; i++) {
            const spine = await loadSpineSkeleton(
              spineConfig.skeletonPath,
              spineConfig.atlasPath
            );
            
            // Set animation - try to set it, will fail silently if it doesn't exist
            try {
              spine.state.setAnimation(0, animation, true);
            } catch (e) {
              // Animation doesn't exist, continue without it
            }
            
            app.stage.addChild(spine);
            instances.push({ spine, label, animation });
          }
        }
        
        // Calculate metrics
        metrics = calculateGameStateMetrics(instances);
        
        // Generate and log report
        const report = generateReport(config, metrics);
        console.log('\n' + report);
      });
      
      afterAll(() => {
        // Clean up all instances
        instances.forEach(({ spine }) => {
          app.stage.removeChild(spine);
          spine.destroy();
        });
        instances = [];
      });
      
      test('should load all spine instances successfully', () => {
        const expectedCount = config.spines.reduce((sum, s) => sum + s.count, 0);
        expect(instances).toHaveLength(expectedCount);
        
        instances.forEach(({ spine }) => {
          expect(spine).toBeDefined();
          expect(spine.skeleton).toBeDefined();
        });
      });
      
      test('should meet Computation Impact (CI) threshold', () => {
        const tolerance = config.thresholds.tolerance || 5;
        const maxAllowed = config.thresholds.maxCI * (1 + tolerance / 100);
        
        expect(metrics.totalComputationImpact).toBeLessThanOrEqual(maxAllowed);
      });
      
      test('should meet Rendering Impact (RI) threshold', () => {
        const tolerance = config.thresholds.tolerance || 5;
        const maxAllowed = config.thresholds.maxRI * (1 + tolerance / 100);
        
        expect(metrics.totalRenderingImpact).toBeLessThanOrEqual(maxAllowed);
      });
      
      test('should meet Total Impact (TI) threshold', () => {
        const tolerance = config.thresholds.tolerance || 5;
        const maxAllowed = config.thresholds.maxTI * (1 + tolerance / 100);
        
        expect(metrics.totalImpact).toBeLessThanOrEqual(maxAllowed);
      });
      
      if (config.thresholds.minScore !== undefined) {
        test('should meet minimum Performance Score threshold', () => {
          expect(metrics.performanceScore).toBeGreaterThanOrEqual(config.thresholds.minScore!);
        });
      }
      
      test('should calculate total impact as CI + RI', () => {
        const expectedTotal = metrics.totalComputationImpact + metrics.totalRenderingImpact;
        expect(Math.abs(metrics.totalImpact - expectedTotal)).toBeLessThan(0.01);
      });
      
      test('should have valid performance score range', () => {
        expect(metrics.performanceScore).toBeGreaterThanOrEqual(0);
        expect(metrics.performanceScore).toBeLessThanOrEqual(100);
      });
      
      test('should have consistent metrics for same spine types', () => {
        // Group instances by label
        const instancesByLabel: { [label: string]: InstanceMetrics[] } = {};
        
        metrics.instanceMetrics.forEach(instance => {
          if (!instancesByLabel[instance.label]) {
            instancesByLabel[instance.label] = [];
          }
          instancesByLabel[instance.label].push(instance);
        });
        
        // Check consistency within each label group
        Object.entries(instancesByLabel).forEach(([label, instances]) => {
          if (instances.length > 1) {
            const first = instances[0];
            
            instances.forEach(instance => {
              // Allow 10% tolerance for animation state variations
              const ciDiff = Math.abs(instance.computationImpact - first.computationImpact);
              const riDiff = Math.abs(instance.renderingImpact - first.renderingImpact);
              
              expect(ciDiff).toBeLessThan(first.computationImpact * 0.1);
              expect(riDiff).toBeLessThan(first.renderingImpact * 0.1);
            });
          }
        });
      });
    });
  });
});
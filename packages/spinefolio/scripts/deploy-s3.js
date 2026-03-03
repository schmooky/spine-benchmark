#!/usr/bin/env node
/**
 * Deploy Spinefolio WebGL to S3 CDN
 * 
 * Environment variables:
 * - AWS_ACCESS_KEY_ID: AWS access key
 * - AWS_SECRET_ACCESS_KEY: AWS secret key
 * - AWS_REGION: AWS region (default: us-east-1)
 * - S3_BUCKET: S3 bucket name
 * - S3_PREFIX: Optional prefix/folder in bucket (default: spinefolio-webgl)
 * - CLOUDFRONT_DISTRIBUTION_ID: Optional CloudFront distribution to invalidate
 */

import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { readFile, stat } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { lookup } from 'mime-types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const distDir = join(rootDir, 'dist');

// Configuration
const config = {
  region: process.env.AWS_REGION || 'us-east-1',
  bucket: process.env.S3_BUCKET,
  prefix: process.env.S3_PREFIX || 'spinefolio-webgl',
  cloudfrontDistributionId: process.env.CLOUDFRONT_DISTRIBUTION_ID,
};

// Validate configuration
if (!config.bucket) {
  console.error('❌ Error: S3_BUCKET environment variable is required');
  console.log('\nRequired environment variables:');
  console.log('  AWS_ACCESS_KEY_ID       - AWS access key');
  console.log('  AWS_SECRET_ACCESS_KEY   - AWS secret key');
  console.log('  S3_BUCKET               - S3 bucket name');
  console.log('\nOptional environment variables:');
  console.log('  AWS_REGION              - AWS region (default: us-east-1)');
  console.log('  S3_PREFIX               - Folder in bucket (default: spinefolio-webgl)');
  console.log('  CLOUDFRONT_DISTRIBUTION_ID - CloudFront distribution to invalidate');
  process.exit(1);
}

// Create S3 client
const s3Client = new S3Client({ region: config.region });

// Get content type and cache control
function getContentMeta(filename) {
  const ext = filename.split('.').pop();
  let contentType = lookup(filename) || 'application/octet-stream';
  
  // Override for specific types
  if (ext === 'mjs') {
    contentType = 'application/javascript';
  }
  
  // Cache control - 1 year for versioned files, 1 hour for latest
  let cacheControl = 'public, max-age=3600'; // 1 hour default
  
  // If filename contains version number, cache for longer
  if (/\d+\.\d+\.\d+/.test(filename)) {
    cacheControl = 'public, max-age=31536000, immutable'; // 1 year
  }
  
  return { contentType, cacheControl };
}

// Upload a single file
async function uploadFile(filePath, key) {
  const content = await readFile(filePath);
  const { contentType, cacheControl } = getContentMeta(basename(filePath));
  
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: content,
    ContentType: contentType,
    CacheControl: cacheControl,
  });
  
  await s3Client.send(command);
  return { key, size: content.length, contentType };
}

// Get package version
async function getVersion() {
  const pkg = JSON.parse(await readFile(join(rootDir, 'package.json'), 'utf-8'));
  return pkg.version;
}

// Deploy to S3
async function deploy() {
  console.log('🚀 Deploying Spinefolio WebGL to S3...\n');
  console.log(`   Bucket: ${config.bucket}`);
  console.log(`   Prefix: ${config.prefix}`);
  console.log(`   Region: ${config.region}`);
  console.log('');

  try {
    const version = await getVersion();
    const { glob } = await import('glob');
    const files = await glob(join(distDir, '*'));
    
    if (files.length === 0) {
      console.error('❌ No files found in dist/. Run `npm run build:all` first.');
      process.exit(1);
    }

    console.log(`📦 Uploading ${files.length} files (v${version})...\n`);

    const uploads = [];

    for (const filePath of files) {
      const filename = basename(filePath);
      
      // Upload to versioned path
      const versionedKey = `${config.prefix}/${version}/${filename}`;
      const versionedResult = await uploadFile(filePath, versionedKey);
      uploads.push(versionedResult);
      console.log(`   ✓ ${versionedKey} (${formatSize(versionedResult.size)})`);
      
      // Also upload to latest path
      const latestKey = `${config.prefix}/latest/${filename}`;
      const latestResult = await uploadFile(filePath, latestKey);
      uploads.push(latestResult);
      console.log(`   ✓ ${latestKey} (${formatSize(latestResult.size)})`);
    }

    console.log('');
    console.log(`✅ Deployed ${uploads.length / 2} files to S3\n`);

    // Print CDN URLs
    const cdnBase = `https://${config.bucket}.s3.${config.region}.amazonaws.com`;
    console.log('📡 CDN URLs:');
    console.log('');
    console.log('   Latest (recommended for development):');
    console.log(`   ${cdnBase}/${config.prefix}/latest/spinefolio-webgl.js`);
    console.log(`   ${cdnBase}/${config.prefix}/latest/spinefolio-core.css`);
    console.log('');
    console.log(`   Versioned (recommended for production - v${version}):`);
    console.log(`   ${cdnBase}/${config.prefix}/${version}/spinefolio-webgl.js`);
    console.log(`   ${cdnBase}/${config.prefix}/${version}/spinefolio-core.css`);
    console.log('');

    // Invalidate CloudFront if configured
    if (config.cloudfrontDistributionId) {
      console.log('☁️  Invalidating CloudFront cache...');
      await invalidateCloudFront();
      console.log('   ✓ Invalidation created');
      console.log('');
    }

    // Print usage example
    console.log('📝 Usage example:');
    console.log('');
    console.log('   <link rel="stylesheet" href="' + cdnBase + '/' + config.prefix + '/latest/spinefolio-core.css">');
    console.log('   <link rel="stylesheet" href="' + cdnBase + '/' + config.prefix + '/latest/spinefolio-theme-neon.css">');
    console.log('   <script src="' + cdnBase + '/' + config.prefix + '/latest/spinefolio-webgl.js"></script>');
    console.log('');

  } catch (error) {
    console.error('❌ Deploy failed:', error.message);
    if (error.Code === 'NoSuchBucket') {
      console.log(`\nBucket "${config.bucket}" does not exist. Create it first.`);
    }
    process.exit(1);
  }
}

// Invalidate CloudFront cache
async function invalidateCloudFront() {
  const { CloudFrontClient, CreateInvalidationCommand } = await import('@aws-sdk/client-cloudfront');
  
  const cfClient = new CloudFrontClient({ region: config.region });
  
  const command = new CreateInvalidationCommand({
    DistributionId: config.cloudfrontDistributionId,
    InvalidationBatch: {
      CallerReference: `spinefolio-${Date.now()}`,
      Paths: {
        Quantity: 1,
        Items: [`/${config.prefix}/latest/*`],
      },
    },
  });
  
  await cfClient.send(command);
}

// Format file size
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

deploy();

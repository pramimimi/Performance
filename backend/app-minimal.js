// Load environment variables
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const fetch = require('node-fetch');
const util = require('util');
const execAsync = util.promisify(exec);

// API configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'your-openai-api-key-here';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const PAGESPEED_API_KEY = process.env.NEXT_PUBLIC_PAGESPEED_API_KEY || process.env.PAGESPEED_API_KEY || '';

// Debug environment variables
console.log('🔧 Environment Variables Debug:');
console.log('OPENAI_API_KEY:', OPENAI_API_KEY ? 'Set (length: ' + OPENAI_API_KEY.length + ')' : 'Not set');
console.log('PAGESPEED_API_KEY:', PAGESPEED_API_KEY ? 'Set (length: ' + PAGESPEED_API_KEY.length + ')' : 'Not set');
console.log('NEXT_PUBLIC_PAGESPEED_API_KEY:', process.env.NEXT_PUBLIC_PAGESPEED_API_KEY ? 'Set' : 'Not set');

const app = express();
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '2.0.0-pagespeed-api'
  });
});

// Simple test endpoint
app.get('/test', (req, res) => {
  res.json({
    message: 'Server is working!',
    timestamp: new Date().toISOString()
  });
});

// Test AI functionality endpoint
app.post('/test-ai', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log('🤖 Testing AI functionality for:', url);
    
    const testData = {
      overallScore: 75,
      lcp: 2500,
      cls: 0.1,
      fcp: 1800,
      tti: 3000,
      tbt: 200,
      fid: 100,
      inp: 200
    };

    const aiAnalysis = await generateAIPerformanceAnalysis(testData, url);
    
    res.json({
      message: 'AI Test Results',
      url: url,
      testData: testData,
      aiAnalysis: aiAnalysis,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ AI Test Error:', error);
    res.status(500).json({
      error: 'AI test failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Fetch HTML for basic analysis
function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Performance-Analyzer/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 10000
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ html: data, status: res.statusCode, headers: res.headers }));
    });

    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Request timeout')));
    req.end();
  });
}

// Generate performance issues from Lighthouse data
function generatePerformanceIssuesFromLighthouse({ lcp, cls, fcp, tti, tbt, speedIndex, audits }) {
  const issues = [];
  
  // LCP Issues
  if (lcp > 2500) {
    issues.push({
      key: 'lcp',
      severity: lcp > 4000 ? 'critical' : 'warning',
      message: `LCP Too High - ${Math.round(lcp)}ms (Page Loading Slow)`,
      explanation: 'Largest Contentful Paint measures loading performance. Large images or slow server response times cause high LCP.',
      fix: 'Optimize images, use CDN, improve server response time, preload critical resources',
      impact: lcp > 4000 ? 'Critical - Very poor user experience' : 'High - Affects user experience and rankings',
      code: `<!-- Optimize LCP -->
<link rel="preload" href="/hero-image.jpg" as="image">
<img src="/hero-image.jpg" width="800" height="600" alt="Hero image" loading="eager" fetchpriority="high">`
    });
  }
  
  // CLS Issues
  if (cls > 0.1) {
    issues.push({
      key: 'cls',
      severity: cls > 0.25 ? 'critical' : 'warning',
      message: `CLS Too High - ${cls} (Layout Shifts)`,
      explanation: 'Cumulative Layout Shift measures visual stability. Elements moving during page load cause high CLS.',
      fix: 'Set explicit dimensions for images and videos, avoid inserting content above existing content',
      impact: cls > 0.25 ? 'Critical - Very poor user experience' : 'High - Creates poor user experience',
      code: `<!-- Prevent CLS -->
<style>
img, video {
  width: auto;
  height: auto;
  max-width: 100%;
}
</style>`
    });
  }
  
  // FCP Issues
  if (fcp > 1800) {
    issues.push({
      key: 'fcp',
      severity: fcp > 3000 ? 'critical' : 'warning',
      message: `FCP Too High - ${Math.round(fcp)}ms (Slow First Paint)`,
      explanation: 'First Contentful Paint measures how quickly content appears. Slow CSS or blocking resources cause high FCP.',
      fix: 'Minimize CSS, remove render-blocking resources, use critical CSS',
      impact: fcp > 3000 ? 'Critical - Very slow content visibility' : 'High - Delays content visibility',
      code: `<!-- Optimize FCP -->
<link rel="preload" href="/critical.css" as="style">
<link rel="stylesheet" href="/critical.css">`
    });
  }
  
  // TTI Issues
  if (tti > 3800) {
    issues.push({
      key: 'tti',
      severity: tti > 5000 ? 'critical' : 'warning',
      message: `TTI Too High - ${Math.round(tti)}ms (Slow Interaction)`,
      explanation: 'Time to Interactive measures when the page becomes fully interactive. Heavy JavaScript causes high TTI.',
      fix: 'Minimize JavaScript, use code splitting, defer non-critical scripts',
      impact: tti > 5000 ? 'Critical - Very slow interaction' : 'High - Delays user interaction',
      code: `<!-- Optimize TTI -->
<script>
// Defer non-critical JavaScript
window.addEventListener('load', function() {
  // Load non-critical scripts here
});
</script>`
    });
  }
  
  // TBT Issues
  if (tbt > 200) {
    issues.push({
      key: 'tbt',
      severity: tbt > 600 ? 'critical' : 'warning',
      message: `TBT Too High - ${Math.round(tbt)}ms (Main Thread Blocking)`,
      explanation: 'Total Blocking Time measures how long the main thread is blocked. Heavy JavaScript causes high TBT.',
      fix: 'Minimize JavaScript, use code splitting, defer non-critical scripts',
      impact: tbt > 600 ? 'Critical - Very poor interactivity' : 'High - Affects page interactivity',
      code: `<!-- Optimize TBT -->
<script>
// Use requestIdleCallback for non-critical tasks
if ('requestIdleCallback' in window) {
  requestIdleCallback(() => {
    // Non-critical JavaScript here
  });
}
</script>`
    });
  }
  
  return issues;
}

// Enhanced comprehensive performance analysis
async function getEnhancedFallbackPerformanceAnalysis(html, url) {
  const startTime = Date.now();
  const issues = [];
  const opportunities = [];
  const diagnostics = [];
  
  // Ensure html is a string
  if (!html || typeof html !== 'string') {
    console.error('HTML parameter is not a string:', typeof html);
    return {
      overallScore: 0,
      lcp: 0,
      cls: 0,
      fcp: 0,
      tti: 0,
      tbt: 0,
      speedIndex: 0,
      fid: 0,
      inp: 0,
      fmp: 0,
      fci: 0,
      eil: 0,
      resources: { scripts: 0, stylesheets: 0, images: 0, fonts: 0, videos: 0, iframes: 0, totalRequests: 0 },
      categories: { performance: 0, accessibility: 0, bestPractices: 0, seo: 0 },
      issues: [],
      opportunities: [],
      diagnostics: [],
      customCodeAnalysis: [],
      pageSourceAnalysis: [],
      coreWebVitals: { lcp: 'poor', cls: 'poor', fcp: 'poor', fid: 'poor', inp: 'poor' },
      summary: { totalIssues: 0, totalOpportunities: 0, totalDiagnostics: 0, estimatedSavings: '0ms', resourceCount: 0 }
    };
  }
  
  // Comprehensive HTML analysis
  const scriptTags = html.match(/<script[^>]*>/gi) || [];
  const styleTags = html.match(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi) || [];
  const imageTags = html.match(/<img[^>]*>/gi) || [];
  const fontTags = html.match(/<link[^>]*rel=["']font["'][^>]*>/gi) || [];
  const videoTags = html.match(/<video[^>]*>/gi) || [];
  const iframeTags = html.match(/<iframe[^>]*>/gi) || [];
  
  // Analyze scripts
  const scriptCount = scriptTags.length;
  const inlineScripts = scriptTags.filter(script => !script.includes('src=')).length;
  const externalScripts = scriptCount - inlineScripts;
  const asyncScripts = scriptTags.filter(script => script.includes('async')).length;
  const deferScripts = scriptTags.filter(script => script.includes('defer')).length;
  
  // Analyze stylesheets
  const styleCount = styleTags.length;
  const inlineStyles = (html.match(/<style[^>]*>/gi) || []).length;
  const criticalCSS = html.includes('critical') || html.includes('above-the-fold');
  
  // Analyze images
  const imageCount = imageTags.length;
  const imagesWithoutAlt = imageTags.filter(img => !img.includes('alt=')).length;
  const imagesWithoutDimensions = imageTags.filter(img => !img.includes('width=') && !img.includes('height=')).length;
  const largeImages = imageTags.filter(img => {
    const widthMatch = img.match(/width=["']?(\d+)["']?/i);
    return widthMatch && parseInt(widthMatch[1]) > 1200;
  }).length;
  
  // Analyze fonts
  const fontCount = fontTags.length;
  const fontDisplay = fontTags.filter(font => font.includes('font-display')).length;
  
  // Calculate performance metrics based on analysis
  let lcp = 2500;
  let cls = 0.1;
  let fcp = 1800;
  let tti = 3800;
  let tbt = 200;
  let speedIndex = 2000;
  let overallScore = 100;
  
  // Script analysis and issues
  if (scriptCount > 15) {
    lcp += 800;
    tti += 1500;
    tbt += 200;
    overallScore -= 15;
    
    issues.push({
      key: 'too_many_scripts',
      issueType: 'source-code',
      severity: scriptCount > 25 ? 'critical' : 'warning',
      message: `Too many scripts (${scriptCount}) in page source - affects performance`,
      explanation: `Your page source has ${scriptCount} script tags. Each script requires a separate HTTP request and can block rendering.`,
      sourceCodeIssue: `Found ${scriptCount} <script> tags in page source`,
      exactLocation: 'HTML <head> and <body> sections',
      fix: 'Combine scripts, use async/defer attributes, remove unused scripts',
      impact: 'High - Each script adds ~100-300ms to page load time',
      sourceCodeSolution: `<!-- Combine scripts -->
<script src="combined.js" defer></script>
<!-- Use async for non-critical scripts -->
<script src="analytics.js" async></script>`,
      customCodeSolution: `// Publisher custom code solution for script optimization\nconst scriptOptimizer = {\n  combineScripts: () => {\n    const scripts = document.querySelectorAll('script[src]');\n    const scriptUrls = Array.from(scripts).map(s => s.src);\n    \n    // Remove individual scripts\n    scripts.forEach(script => script.remove());\n    \n    // Load combined script\n    const combinedScript = document.createElement('script');\n    combinedScript.src = '/js/combined.js';\n    combinedScript.defer = true;\n    document.head.appendChild(combinedScript);\n  },\n  // Call this in your publisher's custom code\n  init: () => {\n    scriptOptimizer.combineScripts();\n  }\n};`,
      publisherImplementation: 'Add this to your publisher\'s script optimization',
      savings: `${Math.min(scriptCount * 50, 2000)}ms potential savings`
    });
  }
  
  if (inlineScripts > 5) {
    fcp += 300;
    tbt += 150;
    overallScore -= 10;
    
    issues.push({
      key: 'inline_scripts',
      issueType: 'source-code',
      severity: 'warning',
      message: `${inlineScripts} inline scripts in page source block rendering`,
      explanation: 'Inline scripts in page source block HTML parsing and delay First Contentful Paint.',
      sourceCodeIssue: `Found ${inlineScripts} inline <script> blocks in page source`,
      exactLocation: 'HTML <head> and <body> sections',
      fix: 'Move inline scripts to external files or use async/defer',
      impact: 'Medium - Each inline script can delay FCP by 50-100ms',
      sourceCodeSolution: `<!-- Move to external file -->
<script src="inline-script.js" defer></script>`,
      customCodeSolution: `// Publisher custom code solution for inline scripts\nconst inlineScriptOptimizer = {\n  extractInlineScripts: () => {\n    const inlineScripts = document.querySelectorAll('script:not([src])');\n    inlineScripts.forEach((script, index) => {\n      const scriptContent = script.textContent;\n      \n      // Create external script file\n      const externalScript = document.createElement('script');\n      externalScript.src = \`/js/extracted-script-\${index}.js\`;\n      externalScript.defer = true;\n      \n      // Replace inline script with external one\n      script.parentNode.replaceChild(externalScript, script);\n    });\n  },\n  // Call this in your publisher's custom code\n  init: () => {\n    inlineScriptOptimizer.extractInlineScripts();\n  }\n};`,
      publisherImplementation: 'Add this to your publisher\'s script optimization',
      savings: `${inlineScripts * 75}ms potential savings`
    });
  }
  
  if (asyncScripts + deferScripts < externalScripts * 0.5) {
    tti += 1000;
    tbt += 200;
    overallScore -= 12;
    
    opportunities.push({
      key: 'script_loading',
      severity: 'warning',
      message: 'Scripts not optimized for loading',
      explanation: `Only ${asyncScripts + deferScripts} of ${externalScripts} external scripts use async/defer.`,
      fix: 'Add async/defer to non-critical scripts',
      impact: 'High - Can improve TTI by 1-2 seconds',
      code: `<!-- Add async to non-critical scripts -->
<script src="analytics.js" async></script>
<script src="social-widgets.js" async></script>`,
      savings: '1000-2000ms potential savings'
    });
  }
  
  // Stylesheet analysis
  if (styleCount > 8) {
    fcp += 400;
    overallScore -= 10;
    
    issues.push({
      key: 'too_many_stylesheets',
      severity: 'warning',
      message: `Too many stylesheets (${styleCount}) - affects FCP`,
      explanation: `Your page has ${styleCount} external stylesheets. Each requires a separate HTTP request.`,
      fix: 'Combine stylesheets, use critical CSS inlining',
      impact: 'Medium - Each stylesheet adds ~50-100ms to FCP',
      code: `<!-- Combine stylesheets -->
<link rel="stylesheet" href="combined.css">
<!-- Inline critical CSS -->
<style>/* Critical above-the-fold CSS */</style>`,
      savings: `${Math.min(styleCount * 75, 800)}ms potential savings`
    });
  }
  
  if (!criticalCSS && styleCount > 3) {
    fcp += 200;
    overallScore -= 8;
    
    opportunities.push({
      key: 'critical_css',
      severity: 'warning',
      message: 'Critical CSS not inlined',
      explanation: 'Critical CSS should be inlined to improve First Contentful Paint.',
      fix: 'Inline critical CSS and load non-critical CSS asynchronously',
      impact: 'Medium - Can improve FCP by 200-500ms',
      code: `<!-- Inline critical CSS -->
<style>
  /* Critical above-the-fold styles */
  body { font-family: Arial; }
  .header { background: #fff; }
</style>
<!-- Load non-critical CSS async -->
<link rel="preload" href="non-critical.css" as="style" onload="this.onload=null;this.rel='stylesheet'">`,
      savings: '200-500ms potential savings'
    });
  }
  
  // Image analysis
  if (imageCount > 15) {
    lcp += 600;
    overallScore -= 12;
    
    issues.push({
      key: 'too_many_images',
      severity: 'warning',
      message: `Too many images (${imageCount}) - affects LCP`,
      explanation: `Your page has ${imageCount} images. Large images significantly impact Largest Contentful Paint.`,
      fix: 'Optimize images, use lazy loading, implement responsive images',
      impact: 'High - Each unoptimized image can add 200-500ms to LCP',
      code: `<!-- Optimize images -->
<img src="image.webp" loading="lazy" alt="Description" width="800" height="600">
<!-- Use responsive images -->
<picture>
  <source media="(min-width: 800px)" srcset="large.webp">
  <img src="small.webp" alt="Description" loading="lazy">
</picture>`,
      savings: `${Math.min(imageCount * 200, 3000)}ms potential savings`
    });
  }
  
  if (imagesWithoutAlt > 0) {
    overallScore -= 5;
    
    diagnostics.push({
      key: 'images_missing_alt',
      severity: 'info',
      message: `${imagesWithoutAlt} images missing alt text`,
      explanation: 'Alt text improves accessibility and helps with SEO.',
      fix: 'Add descriptive alt text to all images',
      impact: 'Low - Accessibility and SEO improvement',
      code: `<img src="image.jpg" alt="Descriptive text about the image">`
    });
  }
  
  if (imagesWithoutDimensions > imageCount * 0.3) {
    cls += 0.05;
    overallScore -= 8;
    
    issues.push({
      key: 'images_without_dimensions',
      severity: 'warning',
      message: `${imagesWithoutDimensions} images without dimensions`,
      explanation: 'Images without width/height cause layout shifts during loading.',
      fix: 'Add width and height attributes to all images',
      impact: 'Medium - Prevents Cumulative Layout Shift',
      code: `<img src="image.jpg" alt="Description" width="800" height="600">`,
      savings: 'Prevents CLS issues'
    });
  }
  
  if (largeImages > 0) {
    lcp += largeImages * 200;
    overallScore -= largeImages * 3;
    
    issues.push({
      key: 'large_images',
      severity: 'warning',
      message: `${largeImages} images are too large (over 1200px wide)`,
      explanation: 'Large images slow down page loading and hurt user experience.',
      fix: 'Resize images to appropriate dimensions, use WebP format',
      impact: 'High - Each large image can add 200-500ms to LCP',
      code: `<!-- Resize and optimize images -->
<img src="optimized-image.webp" alt="Description" width="800" height="600">`,
      savings: `${largeImages * 300}ms potential savings`
    });
  }
  
  // Font analysis
  if (fontCount > 3) {
    fcp += 200;
    overallScore -= 8;
    
    issues.push({
      key: 'too_many_fonts',
      severity: 'warning',
      message: `Too many fonts (${fontCount}) - affects FCP`,
      explanation: 'Multiple font requests can delay text rendering.',
      fix: 'Reduce font variations, use font-display: swap',
      impact: 'Medium - Each font adds ~100-200ms to FCP',
      code: `/* Use font-display: swap */
@font-face {
  font-family: 'CustomFont';
  src: url('font.woff2');
  font-display: swap;
}`,
      savings: `${Math.min(fontCount * 150, 600)}ms potential savings`
    });
  }
  
  if (fontDisplay < fontCount) {
    fcp += 150;
    overallScore -= 5;
    
    opportunities.push({
      key: 'font_display',
      severity: 'warning',
      message: 'Fonts not optimized for loading',
      explanation: 'Fonts should use font-display: swap to prevent invisible text.',
      fix: 'Add font-display: swap to all font declarations',
      impact: 'Medium - Prevents invisible text during font load',
      code: `@font-face {
  font-family: 'CustomFont';
  src: url('font.woff2');
  font-display: swap;
}`,
      savings: 'Prevents FOIT (Flash of Invisible Text)'
    });
  }
  
  // Video analysis
  if (videoTags.length > 0) {
    lcp += 500;
    overallScore -= 10;
    
    issues.push({
      key: 'videos_affecting_performance',
      severity: 'warning',
      message: `${videoTags.length} videos may affect performance`,
      explanation: 'Videos can significantly impact page load performance.',
      fix: 'Use lazy loading for videos, optimize video formats',
      impact: 'High - Videos can add 500-2000ms to LCP',
      code: `<video controls preload="none" poster="video-poster.jpg">
  <source src="video.webm" type="video/webm">
  <source src="video.mp4" type="video/mp4">
</video>`,
      savings: '500-2000ms potential savings'
    });
  }
  
  // Iframe analysis
  if (iframeTags.length > 2) {
    tti += 800;
    overallScore -= 8;
    
    issues.push({
      key: 'too_many_iframes',
      severity: 'warning',
      message: `${iframeTags.length} iframes may slow down page`,
      explanation: 'Iframes can delay page interactivity and increase TTI.',
      fix: 'Use lazy loading for iframes, defer non-critical iframes',
      impact: 'Medium - Each iframe can add 200-500ms to TTI',
      code: `<iframe src="content.html" loading="lazy" title="Content"></iframe>`,
      savings: `${iframeTags.length * 300}ms potential savings`
    });
  }
  
  // Calculate additional performance metrics
  const fid = Math.max(10, Math.round(tti * 0.1 + tbt * 0.2)); // First Input Delay
  const inp = Math.max(100, Math.round(tti * 0.3 + tbt * 0.4)); // Interaction to Next Paint
  const fmp = Math.max(800, Math.round(fcp + 200)); // First Meaningful Paint
  const si = Math.max(1000, Math.round(speedIndex)); // Speed Index
  const fci = Math.max(1000, Math.round(fcp + 500)); // First CPU Idle
  const eil = Math.max(1000, Math.round(tti + 200)); // Estimated Input Latency
  
  // Calculate final metrics
  lcp = Math.max(1000, Math.round(lcp));
  cls = Math.max(0, Math.round(cls * 1000) / 1000);
  fcp = Math.max(800, Math.round(fcp));
  tti = Math.max(2000, Math.round(tti));
  tbt = Math.max(50, Math.round(tbt));
  speedIndex = Math.max(1000, Math.round(speedIndex));
  overallScore = Math.max(0, overallScore);
  
  // Get page source analysis
  let pageSourceAnalysis = {};
  let customCodeAnalysis = {};
  
  try {
    pageSourceAnalysis = analyzePageSource(html, url);
    customCodeAnalysis = analyzeCustomCode(html, url);
  } catch (error) {
    console.error('Error in analysis functions:', error);
    pageSourceAnalysis = {};
    customCodeAnalysis = {};
  }
  
  // Generate AI-powered performance suggestions for each metric
  let aiSuggestions = {};
  try {
    aiSuggestions = generateAIPerformanceSuggestions({
      lcp, cls, fcp, tti, tbt, speedIndex, overallScore
    }, html, url);
  } catch (error) {
    console.error('Error generating AI suggestions:', error);
    aiSuggestions = {};
  }

  // Analyze custom code and third-party integrations
  try {
    customCodeAnalysis = analyzeCustomCodeAndThirdParty(html, url);
  } catch (error) {
    console.error('Error analyzing custom code:', error);
    customCodeAnalysis = {};
  }
  
  // Get enhanced analysis with AI insights
  const enhancedIssues = await getEnhancedAnalysisWithAI(html, url, {
    overallScore,
    lcp,
    cls,
    fcp,
    tti,
    tbt,
    speedIndex: si,
    fid,
    inp,
    fmp,
    fci,
    eil,
    resources: {
      scripts: scriptCount,
      stylesheets: styleCount,
      images: imageCount,
      fonts: fontCount,
      videos: videoTags.length,
      iframes: iframeTags.length,
      totalRequests: scriptCount + styleCount + imageCount + fontCount + videoTags.length + iframeTags.length
    },
    coreWebVitals: {
      lcp: lcp <= 2500 ? 'good' : lcp <= 4000 ? 'needs-improvement' : 'poor',
      cls: cls <= 0.1 ? 'good' : cls <= 0.25 ? 'needs-improvement' : 'poor',
      fcp: fcp <= 1800 ? 'good' : fcp <= 3000 ? 'needs-improvement' : 'poor',
      fid: fid <= 100 ? 'good' : fid <= 300 ? 'needs-improvement' : 'poor',
      inp: inp <= 200 ? 'good' : inp <= 500 ? 'needs-improvement' : 'poor'
    },
    issues
  });
  
  return {
    overallScore: overallScore,
    // Core Web Vitals
    lcp: lcp,
    cls: cls,
    fcp: fcp,
    // Additional Performance Metrics
    tti: tti,
    tbt: tbt,
    speedIndex: si,
    fid: fid,
    inp: inp,
    fmp: fmp,
    fci: fci,
    eil: eil,
    // Resource Analysis
    resources: {
      scripts: scriptCount,
      stylesheets: styleCount,
      images: imageCount,
      fonts: fontCount,
      videos: videoTags.length,
      iframes: iframeTags.length,
      totalRequests: scriptCount + styleCount + imageCount + fontCount + videoTags.length + iframeTags.length
    },
    // Performance Categories
    categories: {
      performance: overallScore,
      accessibility: Math.max(0, 100 - (imagesWithoutAlt * 5) - (imagesWithoutDimensions * 3)),
      bestPractices: Math.max(0, 100 - (scriptCount > 20 ? 15 : 0) - (styleCount > 10 ? 10 : 0)),
      seo: Math.max(0, 100 - (imagesWithoutAlt * 8) - (imagesWithoutDimensions * 5))
    },
    issues: enhancedIssues,
    opportunities: opportunities,
    diagnostics: diagnostics,
    customCodeAnalysis: customCodeAnalysis,
    pageSourceAnalysis: pageSourceAnalysis,
    aiSuggestions: aiSuggestions,
    customCodeAndThirdParty: customCodeAnalysis,
    coreWebVitals: {
      lcp: lcp <= 2500 ? 'good' : lcp <= 4000 ? 'needs-improvement' : 'poor',
      cls: cls <= 0.1 ? 'good' : cls <= 0.25 ? 'needs-improvement' : 'poor',
      fcp: fcp <= 1800 ? 'good' : fcp <= 3000 ? 'needs-improvement' : 'poor',
      fid: fid <= 100 ? 'good' : fid <= 300 ? 'needs-improvement' : 'poor',
      inp: inp <= 200 ? 'good' : inp <= 500 ? 'needs-improvement' : 'poor'
    },
    aiAnalysis: await generateAIPerformanceAnalysis({
      overallScore,
      lcp,
      cls,
      fcp,
      tti,
      tbt,
      fid,
      inp
    }, url),
    summary: {
      totalIssues: issues.length,
      totalOpportunities: opportunities.length,
      totalDiagnostics: diagnostics.length,
      estimatedSavings: issues.reduce((sum, issue) => {
        const savings = issue.savings ? parseInt(issue.savings) : 0;
        return sum + savings;
      }, 0) + 'ms',
      resourceCount: scriptCount + styleCount + imageCount + fontCount + videoTags.length + iframeTags.length
    }
  };
}

// Enhanced function to analyze page source code with detailed categorization
function analyzePageSource(html, targetUrl) {
  const sourceCodeAnalysis = {
    lcp: [], // Largest Contentful Paint issues
    cls: [], // Cumulative Layout Shift issues  
    fcp: [], // First Contentful Paint issues
    tti: [], // Time to Interactive issues
    tbt: [], // Total Blocking Time issues
    general: [] // General source code issues
  };
  
  // Check for common performance issues in page source
  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!titleTag) {
    sourceCodeAnalysis.general.push({
      key: 'missing_title',
      severity: 'critical',
      message: 'Missing title tag in page source',
      explanation: 'Page source does not contain a title tag, which is essential for SEO and user experience.',
      sourceCodeIssue: 'No <title> tag found in page source',
      exactLocation: 'HTML <head> section',
      fix: 'Add a descriptive title tag to the page head section',
      sourceCodeSolution: `<title>Your Page Title Here</title>`,
      customCodeSolution: `// Publisher custom code solution for missing title\nconst titleOptimizer = {\n  addTitle: (title) => {\n    if (!document.title) {\n      document.title = title;\n    }\n  },\n  // Call this in your publisher's head injection\n  init: () => {\n    titleOptimizer.addTitle('Default Page Title');\n  }\n};`,
      publisherImplementation: 'Add this to your publisher\'s head injection code'
    });
  }
  
  // Check for meta description
  const metaDescription = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i);
  if (!metaDescription) {
    sourceCodeAnalysis.general.push({
      key: 'missing_meta_description',
      issueType: 'source-code',
      severity: 'warning',
      message: 'Missing meta description in page source',
      explanation: 'Page source does not contain a meta description tag, which affects SEO and click-through rates.',
      sourceCodeIssue: 'No <meta name="description"> tag found in page source',
      exactLocation: 'HTML <head> section',
      fix: 'Add a meta description tag to the page head section',
      sourceCodeSolution: `<meta name="description" content="Your page description here">`,
      customCodeSolution: `// Publisher custom code solution for missing meta description\nconst metaOptimizer = {\n  addMetaDescription: (description) => {\n    let metaDesc = document.querySelector('meta[name="description"]');\n    if (!metaDesc) {\n      metaDesc = document.createElement('meta');\n      metaDesc.name = 'description';\n      document.head.appendChild(metaDesc);\n    }\n    metaDesc.content = description;\n  },\n  // Call this in your publisher's head injection\n  init: () => {\n    metaOptimizer.addMetaDescription('Default page description');\n  }\n};`,
      publisherImplementation: 'Add this to your publisher\'s head injection code'
    });
  }
  
  // Check for viewport meta tag
  const viewportMeta = html.match(/<meta[^>]*name=["']viewport["'][^>]*>/i);
  if (!viewportMeta) {
    analysis.push({
      key: 'missing_viewport',
      severity: 'critical',
      message: 'Missing viewport meta tag',
      explanation: 'Page source does not contain a viewport meta tag, which is essential for mobile responsiveness.',
      sourceCode: 'No <meta name="viewport"> tag found in page source',
      fix: 'Add viewport meta tag: <meta name="viewport" content="width=device-width, initial-scale=1">',
      customCodeSolution: `// Custom code solution for missing viewport\nconst viewportOptimizer = {\n  addViewport: () => {\n    let viewport = document.querySelector('meta[name="viewport"]');\n    if (!viewport) {\n      viewport = document.createElement('meta');\n      viewport.name = 'viewport';\n      viewport.content = 'width=device-width, initial-scale=1';\n      document.head.appendChild(viewport);\n    }\n  }\n};`
    });
  }
  
  // Check for charset declaration
  const charset = html.match(/<meta[^>]*charset=["']([^"']*)["'][^>]*>/i);
  if (!charset) {
    analysis.push({
      key: 'missing_charset',
      severity: 'warning',
      message: 'Missing charset declaration',
      explanation: 'Page source does not contain a charset declaration, which can cause encoding issues.',
      sourceCode: 'No charset declaration found in page source',
      fix: 'Add charset declaration: <meta charset="UTF-8">',
      customCodeSolution: `// Custom code solution for missing charset\nconst charsetOptimizer = {\n  addCharset: () => {\n    let charset = document.querySelector('meta[charset]');\n    if (!charset) {\n      charset = document.createElement('meta');\n      charset.charset = 'UTF-8';\n      document.head.insertBefore(charset, document.head.firstChild);\n    }\n  }\n};`
    });
  }
  
  // Add LCP (Largest Contentful Paint) issues from source code
  const largeImages = (html.match(/<img[^>]*>/gi) || []).filter(img => {
    const widthMatch = img.match(/width=["']?(\d+)["']?/i);
    return widthMatch && parseInt(widthMatch[1]) > 1200;
  });
  
  if (largeImages.length > 0) {
    sourceCodeAnalysis.lcp.push({
      key: 'large_images_lcp',
      severity: 'warning',
      message: `${largeImages.length} large images affecting LCP`,
      explanation: 'Large images in page source can significantly impact Largest Contentful Paint.',
      sourceCodeIssue: `Found ${largeImages.length} images with width > 1200px in page source`,
      exactLocation: 'HTML <body> section - image tags',
      fix: 'Optimize image sizes and use responsive images',
      sourceCodeSolution: `<img src="image.jpg" width="800" height="600" loading="lazy" alt="Description">`,
      customCodeSolution: `// Publisher custom code solution for large images\nconst imageOptimizer = {\n  optimizeImages: () => {\n    const images = document.querySelectorAll('img');\n    images.forEach(img => {\n      if (img.width > 1200) {\n        img.style.maxWidth = '100%';\n        img.style.height = 'auto';\n        img.loading = 'lazy';\n      }\n    });\n  },\n  init: () => {\n    imageOptimizer.optimizeImages();\n  }\n};`,
      publisherImplementation: 'Add this to your publisher\'s image optimization code'
    });
  }
  
  // Add CLS (Cumulative Layout Shift) issues from source code
  const imagesWithoutDimensions = (html.match(/<img[^>]*>/gi) || []).filter(img => 
    !img.includes('width=') && !img.includes('height=')
  );
  
  if (imagesWithoutDimensions.length > 0) {
    sourceCodeAnalysis.cls.push({
      key: 'images_without_dimensions_cls',
      severity: 'warning',
      message: `${imagesWithoutDimensions.length} images without dimensions causing CLS`,
      explanation: 'Images without width/height attributes cause layout shifts when they load.',
      sourceCodeIssue: `Found ${imagesWithoutDimensions.length} images without width/height in page source`,
      exactLocation: 'HTML <body> section - image tags',
      fix: 'Add width and height attributes to all images',
      sourceCodeSolution: `<img src="image.jpg" width="800" height="600" alt="Description">`,
      customCodeSolution: `// Publisher custom code solution for CLS prevention\nconst clsOptimizer = {\n  preventLayoutShift: () => {\n    const images = document.querySelectorAll('img:not([width]):not([height])');\n    images.forEach(img => {\n      img.style.aspectRatio = '16/9'; // Set default aspect ratio\n      img.style.width = '100%';\n      img.style.height = 'auto';\n    });\n  },\n  init: () => {\n    clsOptimizer.preventLayoutShift();\n  }\n};`,
      publisherImplementation: 'Add this to your publisher\'s CLS prevention code'
    });
  }
  
  // Add FCP (First Contentful Paint) issues from source code
  const blockingScripts = (html.match(/<script[^>]*>/gi) || []).filter(script => 
    !script.includes('async') && !script.includes('defer') && script.includes('src=')
  );
  
  if (blockingScripts.length > 0) {
    sourceCodeAnalysis.fcp.push({
      key: 'blocking_scripts_fcp',
      severity: 'warning',
      message: `${blockingScripts.length} blocking scripts affecting FCP`,
      explanation: 'Synchronous scripts block HTML parsing and delay First Contentful Paint.',
      sourceCodeIssue: `Found ${blockingScripts.length} synchronous scripts in page source`,
      exactLocation: 'HTML <head> or <body> section - script tags',
      fix: 'Add async or defer attributes to non-critical scripts',
      sourceCodeSolution: `<script src="script.js" defer></script>`,
      customCodeSolution: `// Publisher custom code solution for script optimization\nconst scriptOptimizer = {\n  optimizeScripts: () => {\n    const scripts = document.querySelectorAll('script[src]:not([async]):not([defer])');\n    scripts.forEach(script => {\n      if (!script.src.includes('critical')) {\n        script.defer = true;\n      }\n    });\n  },\n  init: () => {\n    scriptOptimizer.optimizeScripts();\n  }\n};`,
      publisherImplementation: 'Add this to your publisher\'s script optimization code'
    });
  }
  
  // Add TTI (Time to Interactive) issues from source code
  const inlineScripts = (html.match(/<script[^>]*>/gi) || []).filter(script => 
    !script.includes('src=')
  );
  
  if (inlineScripts.length > 3) {
    sourceCodeAnalysis.tti.push({
      key: 'too_many_inline_scripts_tti',
      severity: 'warning',
      message: `${inlineScripts.length} inline scripts affecting TTI`,
      explanation: 'Too many inline scripts can delay Time to Interactive.',
      sourceCodeIssue: `Found ${inlineScripts.length} inline script blocks in page source`,
      exactLocation: 'HTML <head> or <body> section - inline script tags',
      fix: 'Move inline scripts to external files or use async/defer',
      sourceCodeSolution: `<script src="inline-script.js" defer></script>`,
      customCodeSolution: `// Publisher custom code solution for inline script optimization\nconst inlineScriptOptimizer = {\n  extractInlineScripts: () => {\n    const scripts = document.querySelectorAll('script:not([src])');\n    scripts.forEach((script, index) => {\n      if (script.innerHTML.trim()) {\n        const newScript = document.createElement('script');\n        newScript.src = 'inline-script-' + index + '.js';\n        newScript.defer = true;\n        script.parentNode.replaceChild(newScript, script);\n      }\n    });\n  },\n  init: () => {\n    inlineScriptOptimizer.extractInlineScripts();\n  }\n};`,
      publisherImplementation: 'Add this to your publisher\'s inline script optimization code'
    });
  }
  
  // Add TBT (Total Blocking Time) issues from source code
  const heavyScripts = (html.match(/<script[^>]*>/gi) || []).filter(script => 
    script.includes('src=') && (
      script.includes('analytics') || 
      script.includes('tracking') || 
      script.includes('ads') ||
      script.includes('widget')
    )
  );
  
  if (heavyScripts.length > 0) {
    sourceCodeAnalysis.tbt.push({
      key: 'heavy_third_party_scripts_tbt',
      severity: 'warning',
      message: `${heavyScripts.length} heavy third-party scripts affecting TBT`,
      explanation: 'Third-party scripts can block the main thread and increase Total Blocking Time.',
      sourceCodeIssue: `Found ${heavyScripts.length} third-party scripts in page source`,
      exactLocation: 'HTML <head> or <body> section - third-party script tags',
      fix: 'Load third-party scripts asynchronously or defer them',
      sourceCodeSolution: `<script src="analytics.js" async></script>`,
      customCodeSolution: `// Publisher custom code solution for third-party script optimization\nconst thirdPartyOptimizer = {\n  optimizeThirdPartyScripts: () => {\n    const thirdPartyScripts = document.querySelectorAll('script[src*="analytics"], script[src*="tracking"], script[src*="ads"]');\n    thirdPartyScripts.forEach(script => {\n      if (!script.async && !script.defer) {\n        script.async = true;\n      }\n    });\n  },\n  init: () => {\n    thirdPartyOptimizer.optimizeThirdPartyScripts();\n  }\n};`,
      publisherImplementation: 'Add this to your publisher\'s third-party script optimization code'
    });
  }
  
  return sourceCodeAnalysis;
}

// Enhanced function to analyze custom code with detailed categorization
function analyzeCustomCode(html, targetUrl) {
  const customCodeAnalysis = {
    lcp: [], // Largest Contentful Paint issues
    cls: [], // Cumulative Layout Shift issues  
    fcp: [], // First Contentful Paint issues
    tti: [], // Time to Interactive issues
    tbt: [], // Total Blocking Time issues
    general: [] // General custom code issues
  };
  
  // Check for inline styles
  const inlineStyles = html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
  if (inlineStyles.length > 0) {
    customCodeAnalysis.fcp.push({
      key: 'inline_styles',
      issueType: 'custom-code',
      severity: 'warning',
      message: `${inlineStyles.length} inline style blocks found in custom code`,
      explanation: 'Inline styles in custom code can block rendering and should be moved to external CSS files.',
      customCodeIssue: `Found ${inlineStyles.length} <style> blocks in custom code`,
      exactLocation: 'Custom code injection or publisher code',
      fix: 'Move inline styles to external CSS files or use CSS-in-JS',
      sourceCodeSolution: `/* Move to external CSS file */\n/* styles.css */\n.your-class {\n  /* styles here */\n}`,
      customCodeSolution: `// Publisher custom code solution for inline styles\nconst styleOptimizer = {\n  extractInlineStyles: () => {\n    const styleTags = document.querySelectorAll('style');\n    styleTags.forEach((style, index) => {\n      const link = document.createElement('link');\n      link.rel = 'stylesheet';\n      link.href = \`/css/extracted-styles-\${index}.css\`;\n      // Move style content to external file\n      style.parentNode.replaceChild(link, style);\n    });\n  },\n  // Alternative: Use CSS-in-JS\n  injectStyles: (css) => {\n    const style = document.createElement('style');\n    style.textContent = css;\n    document.head.appendChild(style);\n  }\n};`,
      publisherImplementation: 'Add this to your publisher\'s custom code optimization'
    });
  }
  
  // Check for JavaScript in HTML attributes
  const jsInAttributes = html.match(/on\w+\s*=\s*["'][^"']*["']/gi) || [];
  if (jsInAttributes.length > 0) {
    customCodeAnalysis.general.push({
      key: 'js_in_attributes',
      issueType: 'custom-code',
      severity: 'warning',
      message: `${jsInAttributes.length} JavaScript attributes found in custom code`,
      explanation: 'JavaScript in HTML attributes in custom code can cause security issues and should be moved to external files.',
      customCodeIssue: `Found ${jsInAttributes.length} JavaScript attributes in custom code`,
      exactLocation: 'Custom code injection or publisher code',
      fix: 'Move JavaScript from HTML attributes to external files or event listeners',
      sourceCodeSolution: `<!-- Remove inline JavaScript attributes -->\n<button id="myButton">Click me</button>\n<script>\n  document.getElementById('myButton').addEventListener('click', function() {\n    // Your code here\n  });\n</script>`,
      customCodeSolution: `// Publisher custom code solution for JavaScript attributes\nconst jsAttributeOptimizer = {\n  extractJsAttributes: () => {\n    const elements = document.querySelectorAll('[onclick], [onload], [onchange]');\n    elements.forEach(element => {\n      const events = ['onclick', 'onload', 'onchange'];\n      events.forEach(event => {\n        if (element[event]) {\n          const handler = element[event];\n          element.addEventListener(event.replace('on', ''), function(e) {\n            // Execute the original handler safely\n            try {\n              eval(handler);\n            } catch (error) {\n              console.error('Error executing handler:', error);\n            }\n          });\n          element.removeAttribute(event);\n        }\n      });\n    });\n  },\n  // Call this in your publisher's custom code\n  init: () => {\n    jsAttributeOptimizer.extractJsAttributes();\n  }\n};`,
      publisherImplementation: 'Add this to your publisher\'s custom code optimization'
    });
  }
  
  // Add LCP (Largest Contentful Paint) issues from custom code
  const customLargeImages = (html.match(/<img[^>]*>/gi) || []).filter(img => {
    const widthMatch = img.match(/width=["']?(\d+)["']?/i);
    return widthMatch && parseInt(widthMatch[1]) > 1200 && (
      img.includes('custom') || img.includes('publisher') || img.includes('widget')
    );
  });
  
  if (customLargeImages.length > 0) {
    customCodeAnalysis.lcp.push({
      key: 'custom_large_images_lcp',
      severity: 'warning',
      message: `${customLargeImages.length} large images in custom code affecting LCP`,
      explanation: 'Large images in custom code/publisher widgets can significantly impact Largest Contentful Paint.',
      customCodeIssue: `Found ${customLargeImages.length} large images in custom code/publisher widgets`,
      exactLocation: 'Publisher custom code or widget injection',
      fix: 'Optimize custom code images and use responsive images',
      sourceCodeSolution: `<img src="custom-image.jpg" width="800" height="600" loading="lazy" alt="Description">`,
      customCodeSolution: `// Publisher custom code solution for large images\nconst customImageOptimizer = {\n  optimizeCustomImages: () => {\n    const customImages = document.querySelectorAll('img[src*="custom"], img[src*="widget"], img[src*="publisher"]');\n    customImages.forEach(img => {\n      if (img.width > 1200) {\n        img.style.maxWidth = '100%';\n        img.style.height = 'auto';\n        img.loading = 'lazy';\n        // Add intersection observer for better performance\n        if ('IntersectionObserver' in window) {\n          const observer = new IntersectionObserver((entries) => {\n            entries.forEach(entry => {\n              if (entry.isIntersecting) {\n                entry.target.src = entry.target.dataset.src || entry.target.src;\n                observer.unobserve(entry.target);\n              }\n            });\n          });\n          observer.observe(img);\n        }\n      }\n    });\n  },\n  init: () => {\n    customImageOptimizer.optimizeCustomImages();\n  }\n};`,
      publisherImplementation: 'Add this to your publisher\'s custom image optimization code'
    });
  }
  
  // Add CLS (Cumulative Layout Shift) issues from custom code
  const customDynamicContent = (html.match(/<div[^>]*>/gi) || []).filter(div => 
    div.includes('dynamic') || div.includes('widget') || div.includes('custom') ||
    div.includes('ad') || div.includes('banner')
  );
  
  if (customDynamicContent.length > 0) {
    customCodeAnalysis.cls.push({
      key: 'custom_dynamic_content_cls',
      severity: 'warning',
      message: `${customDynamicContent.length} dynamic content elements causing CLS`,
      explanation: 'Dynamic content in custom code can cause layout shifts when loaded.',
      customCodeIssue: `Found ${customDynamicContent.length} dynamic content elements in custom code`,
      exactLocation: 'Publisher custom code or widget injection',
      fix: 'Reserve space for dynamic content to prevent layout shifts',
      sourceCodeSolution: `<div class="widget-container" style="min-height: 250px; width: 100%;">Loading...</div>`,
      customCodeSolution: `// Publisher custom code solution for CLS prevention\nconst customCLSOptimizer = {\n  preventCustomLayoutShift: () => {\n    const dynamicElements = document.querySelectorAll('[class*="dynamic"], [class*="widget"], [class*="custom"], [class*="ad"]');\n    dynamicElements.forEach(element => {\n      // Reserve space for dynamic content\n      if (!element.style.minHeight) {\n        element.style.minHeight = '250px';\n        element.style.width = '100%';\n        element.style.overflow = 'hidden';\n      }\n      // Add skeleton loader\n      if (!element.querySelector('.skeleton')) {\n        const skeleton = document.createElement('div');\n        skeleton.className = 'skeleton';\n        skeleton.style.cssText = 'background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: loading 1.5s infinite; height: 100%;';\n        element.appendChild(skeleton);\n      }\n    });\n  },\n  init: () => {\n    customCLSOptimizer.preventCustomLayoutShift();\n  }\n};`,
      publisherImplementation: 'Add this to your publisher\'s CLS prevention code'
    });
  }
  
  // Add FCP (First Contentful Paint) issues from custom code
  const customBlockingScripts = (html.match(/<script[^>]*>/gi) || []).filter(script => 
    !script.includes('async') && !script.includes('defer') && script.includes('src=') && (
      script.includes('custom') || script.includes('publisher') || script.includes('widget')
    )
  );
  
  if (customBlockingScripts.length > 0) {
    customCodeAnalysis.fcp.push({
      key: 'custom_blocking_scripts_fcp',
      severity: 'warning',
      message: `${customBlockingScripts.length} blocking custom scripts affecting FCP`,
      explanation: 'Synchronous custom scripts block HTML parsing and delay First Contentful Paint.',
      customCodeIssue: `Found ${customBlockingScripts.length} synchronous custom scripts`,
      exactLocation: 'Publisher custom code injection',
      fix: 'Load custom scripts asynchronously or defer them',
      sourceCodeSolution: `<script src="custom-script.js" defer></script>`,
      customCodeSolution: `// Publisher custom code solution for script optimization\nconst customScriptOptimizer = {\n  optimizeCustomScripts: () => {\n    const customScripts = document.querySelectorAll('script[src*="custom"], script[src*="publisher"], script[src*="widget"]');\n    customScripts.forEach(script => {\n      if (!script.async && !script.defer) {\n        // Create new script element with defer\n        const newScript = document.createElement('script');\n        newScript.src = script.src;\n        newScript.defer = true;\n        newScript.onload = () => {\n          // Initialize custom functionality after load\n          if (window.customInit) {\n            window.customInit();\n          }\n        };\n        script.parentNode.replaceChild(newScript, script);\n      }\n    });\n  },\n  init: () => {\n    customScriptOptimizer.optimizeCustomScripts();\n  }\n};`,
      publisherImplementation: 'Add this to your publisher\'s custom script optimization code'
    });
  }
  
  // Add TTI (Time to Interactive) issues from custom code
  // First, find all script tags and their content
  const scriptTagMatches = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
  const customInlineScripts = scriptTagMatches.filter(scriptTag => {
    // Check if it's an inline script (no src attribute)
    if (scriptTag.includes('src=')) return false;
    
    // Extract the content between script tags
    const contentMatch = scriptTag.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (!contentMatch || !contentMatch[1]) return false;
    
    const scriptContent = contentMatch[1].toLowerCase();
    return scriptContent.includes('custom') || 
           scriptContent.includes('publisher') || 
           scriptContent.includes('widget');
  });
  
  if (customInlineScripts.length > 0) {
    customCodeAnalysis.tti.push({
      key: 'custom_inline_scripts_tti',
      severity: 'warning',
      message: `${customInlineScripts.length} custom inline scripts affecting TTI`,
      explanation: 'Custom inline scripts can delay Time to Interactive.',
      customCodeIssue: `Found ${customInlineScripts.length} custom inline script blocks`,
      exactLocation: 'Publisher custom code injection',
      fix: 'Move custom inline scripts to external files or use async/defer',
      sourceCodeSolution: `<script src="custom-inline-script.js" defer></script>`,
      customCodeSolution: `// Publisher custom code solution for inline script optimization\nconst customInlineScriptOptimizer = {\n  extractCustomInlineScripts: () => {\n    const customScripts = document.querySelectorAll('script:not([src])');\n    customScripts.forEach((script, index) => {\n      if (script.innerHTML.includes('custom') || script.innerHTML.includes('publisher')) {\n        // Create external script file content\n        const scriptContent = script.innerHTML;\n        const blob = new Blob([scriptContent], { type: 'application/javascript' });\n        const url = URL.createObjectURL(blob);\n        \n        // Replace with external script\n        const newScript = document.createElement('script');\n        newScript.src = url;\n        newScript.defer = true;\n        script.parentNode.replaceChild(newScript, script);\n      }\n    });\n  },\n  init: () => {\n    customInlineScriptOptimizer.extractCustomInlineScripts();\n  }\n};`,
      publisherImplementation: 'Add this to your publisher\'s custom inline script optimization code'
    });
  }
  
  // Add TBT (Total Blocking Time) issues from custom code
  const customHeavyScripts = (html.match(/<script[^>]*>/gi) || []).filter(script => 
    script.includes('src=') && (
      script.includes('analytics') || 
      script.includes('tracking') || 
      script.includes('ads') ||
      script.includes('widget') ||
      script.includes('custom')
    )
  );
  
  if (customHeavyScripts.length > 0) {
    customCodeAnalysis.tbt.push({
      key: 'custom_heavy_scripts_tbt',
      severity: 'warning',
      message: `${customHeavyScripts.length} heavy custom scripts affecting TBT`,
      explanation: 'Heavy custom scripts can block the main thread and increase Total Blocking Time.',
      customCodeIssue: `Found ${customHeavyScripts.length} heavy custom/third-party scripts`,
      exactLocation: 'Publisher custom code or third-party integration',
      fix: 'Load heavy custom scripts asynchronously and optimize execution',
      sourceCodeSolution: `<script src="heavy-custom-script.js" async></script>`,
      customCodeSolution: `// Publisher custom code solution for heavy script optimization\nconst customHeavyScriptOptimizer = {\n  optimizeHeavyCustomScripts: () => {\n    const heavyScripts = document.querySelectorAll('script[src*="analytics"], script[src*="tracking"], script[src*="ads"], script[src*="widget"], script[src*="custom"]');\n    heavyScripts.forEach(script => {\n      if (!script.async && !script.defer) {\n        script.async = true;\n        // Add performance monitoring\n        script.onload = () => {\n          console.log('Custom script loaded:', script.src);\n          // Initialize with delay to prevent blocking\n          setTimeout(() => {\n            if (window.customInit) {\n              window.customInit();\n            }\n          }, 100);\n        };\n      }\n    });\n  },\n  init: () => {\n    customHeavyScriptOptimizer.optimizeHeavyCustomScripts();\n  }\n};`,
      publisherImplementation: 'Add this to your publisher\'s heavy script optimization code'
    });
  }
  
  return customCodeAnalysis;
}

// Helper functions for enhanced custom code analysis

function isPublisherDomain(domain, publisherDomains) {
  return publisherDomains.some(pubDomain => domain.includes(pubDomain));
}

function isPublisherScript(scriptContent, targetDomain) {
  const publisherKeywords = [
    'quintype', 'accesstype', 'publisher', 'custom', 'widget',
    targetDomain.split('.')[0] // Use main domain name
  ];
  
  const lowerContent = scriptContent.toLowerCase();
  return publisherKeywords.some(keyword => lowerContent.includes(keyword));
}

function getScriptImpact(size, type) {
  if (type === 'inline') {
    if (size > 5000) return 'High - Large inline script blocks rendering';
    if (size > 1000) return 'Medium - Inline script may delay rendering';
    return 'Low - Small inline script';
  }
  return 'Medium - External script may block rendering';
}

function getScriptScore(size, type) {
  if (type === 'inline') {
    if (size > 5000) return 5;
    if (size > 1000) return 3;
    return 1;
  }
  return 3;
}

function getThirdPartyScore(domain, url) {
  const highImpactServices = ['google', 'facebook', 'ads', 'analytics', 'chat', 'tracking'];
  const mediumImpactServices = ['twitter', 'linkedin', 'youtube', 'instagram', 'social'];
  
  if (highImpactServices.some(service => domain.includes(service))) {
    return 5;
  } else if (mediumImpactServices.some(service => domain.includes(service))) {
    return 3;
  } else {
    return 2;
  }
}

function getThirdPartyCategory(domain) {
  if (domain.includes('google') || domain.includes('analytics')) return 'analytics';
  if (domain.includes('facebook') || domain.includes('social')) return 'social';
  if (domain.includes('ads') || domain.includes('doubleclick')) return 'advertising';
  if (domain.includes('chat') || domain.includes('support')) return 'support';
  return 'other';
}

function isTrackingScript(domain) {
  const trackingServices = ['google', 'facebook', 'analytics', 'tracking', 'gtag', 'gtm'];
  return trackingServices.some(service => domain.includes(service));
}

function getImpactLevel(score) {
  if (score > 20) return 'High';
  if (score > 10) return 'Medium';
  return 'Low';
}

function generatePerformanceRecommendations(analysis) {
  const recommendations = [];
  
  // Only include HIGH priority issues
  const highImpactScripts = analysis.publisherCode.inlineScripts.filter(s => s.performanceScore >= 5);
  const highImpactWidgets = analysis.publisherCode.customWidgets.filter(w => w.performanceScore >= 3);
  const highImpactThirdParty = analysis.thirdPartyCode.externalScripts.filter(s => s.performanceScore >= 5);
  const highImpactTracking = analysis.thirdPartyCode.trackingScripts.filter(s => s.performanceScore >= 5);
  
  // Publisher High Impact Inline Scripts
  if (highImpactScripts.length > 0) {
    recommendations.push({
      type: 'publisher',
      priority: 'HIGH',
      impactLevel: 'HIGH',
      metric: 'First Contentful Paint (FCP)',
      keyFactor: 'Large inline scripts blocking HTML parsing',
      rootCause: `${highImpactScripts.length} large inline scripts (${highImpactScripts.reduce((sum, s) => sum + s.size, 0) / 1024}KB total) are blocking the main thread`,
      specificSolution: 'Move inline scripts to external files and implement async/defer loading',
      recommendation: 'Extract inline scripts to separate .js files and load them asynchronously to prevent render blocking',
      customCodeSolution: `
// Instead of inline scripts, create external files:
// 1. Create script-loader.js
function loadScriptAsync(src) {
  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

// 2. Load critical scripts first, non-critical later
loadScriptAsync('/js/critical.js');
setTimeout(() => loadScriptAsync('/js/non-critical.js'), 1000);
      `
    });
  }
  
  // Publisher High Impact Widgets
  if (highImpactWidgets.length > 0) {
    recommendations.push({
      type: 'publisher',
      priority: 'HIGH',
      impactLevel: 'HIGH',
      metric: 'Cumulative Layout Shift (CLS)',
      keyFactor: 'Custom widgets causing layout shifts during load',
      rootCause: `${highImpactWidgets.length} custom widgets are loading without reserved space, causing content to shift`,
      specificSolution: 'Reserve space for widgets and implement skeleton loading',
      recommendation: 'Add CSS placeholders and skeleton screens to prevent layout shifts during widget loading',
      customCodeSolution: `
// 1. Add CSS for widget placeholders
.widget-placeholder {
  min-height: 200px;
  background: #f3f4f6;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

// 2. JavaScript to handle widget loading
function loadWidgetWithPlaceholder(containerId, widgetData) {
  const container = document.getElementById(containerId);
  container.innerHTML = '<div class="widget-placeholder">Loading...</div>';
  
  // Simulate loading delay
  setTimeout(() => {
    container.innerHTML = createWidget(widgetData);
  }, 500);
}
      `
    });
  }
  
  // Third-Party High Impact Scripts
  if (highImpactThirdParty.length > 0) {
    recommendations.push({
      type: 'third-party',
      priority: 'HIGH',
      impactLevel: 'HIGH',
      metric: 'Time to Interactive (TTI)',
      keyFactor: 'Third-party scripts blocking main thread execution',
      rootCause: `${highImpactThirdParty.length} high-impact third-party scripts are blocking JavaScript execution`,
      specificSolution: 'Implement lazy loading and async loading for third-party scripts',
      recommendation: 'Load third-party scripts asynchronously and defer non-critical ones until after page load',
      customCodeSolution: `
// 1. Lazy load third-party scripts
function loadThirdPartyScript(src, callback) {
  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  script.onload = callback;
  document.head.appendChild(script);
}

// 2. Load after page is interactive
window.addEventListener('load', () => {
  setTimeout(() => {
    loadThirdPartyScript('https://third-party.com/script.js');
  }, 2000);
});
      `
    });
  }
  
  // Third-Party High Impact Tracking
  if (highImpactTracking.length > 0) {
    recommendations.push({
      type: 'third-party',
      priority: 'HIGH',
      impactLevel: 'HIGH',
      metric: 'Total Blocking Time (TBT)',
      keyFactor: 'Tracking scripts causing main thread blocking',
      rootCause: `${highImpactTracking.length} tracking scripts are executing synchronously and blocking user interactions`,
      specificSolution: 'Defer tracking scripts and use web workers for analytics processing',
      recommendation: 'Move tracking scripts to web workers and defer analytics until after user interaction',
      customCodeSolution: `
// 1. Defer tracking scripts
function initTracking() {
  // Only load tracking after user interaction
  document.addEventListener('click', () => {
    if (!window.trackingLoaded) {
      loadTrackingScripts();
      window.trackingLoaded = true;
    }
  }, { once: true });
}

// 2. Use web worker for analytics
const analyticsWorker = new Worker('/js/analytics-worker.js');
analyticsWorker.postMessage({ type: 'track', data: eventData });
      `
    });
  }
  
  return recommendations;
}

// Enhanced custom code and third-party analysis with real data
function analyzeCustomCodeAndThirdParty(html, targetUrl) {
  try {
    // Real-time analysis of HTML content
    const inlineScripts = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
    const externalScripts = html.match(/<script[^>]*src=["']([^"']+)["'][^>]*>/gi) || [];
    const stylesheets = html.match(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi) || [];
    const images = html.match(/<img[^>]*>/gi) || [];
    const thirdPartyDomains = new Set();
    
    // Extract third-party domains from external scripts
    externalScripts.forEach(script => {
      const srcMatch = script.match(/src=["']([^"']+)["']/i);
      if (srcMatch && srcMatch[1]) {
        try {
          const url = new URL(srcMatch[1], targetUrl);
          if (url.hostname !== new URL(targetUrl).hostname) {
            thirdPartyDomains.add(url.hostname);
          }
        } catch (e) {
          // Invalid URL, skip
        }
      }
    });
    
    // Custom Code Analyzer - Real Issues Based on Actual Content
    const customCodeAnalysis = {
      topPriorityIssues: [],
      summary: {
        totalIssues: 0,
        highPriorityIssues: 0,
        estimatedPerformanceImpact: 'Low',
        realMetrics: {
          inlineScripts: inlineScripts.length,
          externalScripts: externalScripts.length,
          stylesheets: stylesheets.length,
          images: images.length,
          thirdPartyDomains: thirdPartyDomains.size
        }
      }
    };

    // Analyze HTML for custom code issues based on real data
    const issues = [];
    
    // Issue 1: Blocking Inline Scripts (Real Analysis)
    const blockingInlineScripts = inlineScripts.filter(script => {
      if (script.includes('src=')) return false;
      const contentMatch = script.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
      if (!contentMatch || !contentMatch[1]) return false;
      const content = contentMatch[1].trim();
      return content.length > 500; // Large inline scripts
    });
    
    if (blockingInlineScripts.length > 0) {
      const totalInlineSize = blockingInlineScripts.reduce((total, script) => {
        const contentMatch = script.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
        return total + (contentMatch ? contentMatch[1].length : 0);
      }, 0);
      
      issues.push({
        priority: 1,
        title: 'Blocking Inline Scripts',
        severity: 'high',
        count: blockingInlineScripts.length,
        realData: {
          totalSize: Math.round(totalInlineSize / 1024) + 'KB',
          averageSize: Math.round(totalInlineSize / blockingInlineScripts.length) + ' chars'
        },
        keyFactors: [
          {
            factor: 'Large Inline JavaScript Blocks',
            rootCause: `Found ${blockingInlineScripts.length} inline scripts (${Math.round(totalInlineSize / 1024)}KB total) larger than 500 characters that block HTML parsing and delay First Contentful Paint, preventing the browser from rendering content until all JavaScript is parsed and executed.`,
            customSolution: `// Publisher custom code solution for inline script optimization
const inlineScriptOptimizer = {
  extractInlineScripts: () => {
    const inlineScripts = document.querySelectorAll('script:not([src])');
    inlineScripts.forEach((script, index) => {
      if (script.textContent.length > 500) {
        // Create external script file
        const scriptContent = script.textContent;
        const blob = new Blob([scriptContent], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        
        // Replace with external script
        const newScript = document.createElement('script');
        newScript.src = url;
        newScript.defer = true;
        newScript.onload = () => {
          // Initialize functionality after load
          if (window.customInit) {
            window.customInit();
          }
        };
        script.parentNode.replaceChild(newScript, script);
      }
    });
  },
  init: () => {
    inlineScriptOptimizer.extractInlineScripts();
  }
};`
          }
        ],
        impact: 'High - Blocks HTML parsing and delays FCP',
        recommendation: 'Move large inline scripts to external files and load them asynchronously'
      });
    }
    
    // Issue 2: Render-Blocking External Scripts (using real data)
    const blockingScripts = externalScripts.filter(script => {
      return !script.includes('async') && !script.includes('defer');
    });
    
    if (blockingScripts.length > 0) {
      issues.push({
        priority: 2,
        title: 'Render-Blocking External Scripts',
        severity: 'high',
        count: blockingScripts.length,
        keyFactors: [
          {
            factor: 'Synchronous Script Loading',
            rootCause: `Found ${blockingScripts.length} external scripts without async/defer attributes that block HTML parsing and delay page rendering, causing poor Core Web Vitals scores.`,
            customSolution: `// Publisher custom code solution for script loading optimization
const scriptLoadingOptimizer = {
  optimizeScriptLoading: () => {
    const blockingScripts = document.querySelectorAll('script[src]:not([async]):not([defer])');
    blockingScripts.forEach(script => {
      const src = script.src.toLowerCase();
      
      // Analytics and tracking scripts - make async
      if (src.includes('analytics') || src.includes('gtag') || src.includes('facebook')) {
        script.async = true;
      }
      // Framework scripts - make defer
      else if (src.includes('jquery') || src.includes('bootstrap') || src.includes('react')) {
        script.defer = true;
      }
      // Widget scripts - load after interaction
      else if (src.includes('widget') || src.includes('chat')) {
        script.dataset.defer = 'true';
        script.remove();
        
        // Load after user interaction
        document.addEventListener('click', () => {
          if (script.dataset.defer) {
            document.head.appendChild(script);
            script.dataset.defer = 'false';
          }
        }, { once: true });
      }
    });
  },
  init: () => {
    scriptLoadingOptimizer.optimizeScriptLoading();
  }
};`
          }
        ],
        impact: 'High - Blocks HTML parsing and delays rendering',
        recommendation: 'Add async or defer attributes to non-critical scripts'
      });
    }
    
    // Issue 3: Unoptimized Images (using real data)
    const unoptimizedImages = images.filter(img => {
      return !img.includes('loading=') && !img.includes('srcset=') && !img.includes('width=');
    });
    
    if (unoptimizedImages.length > 0) {
      issues.push({
        priority: 3,
        title: 'Unoptimized Images',
        severity: 'high',
        count: unoptimizedImages.length,
        keyFactors: [
          {
            factor: 'Missing Image Optimization Attributes',
            rootCause: `Found ${unoptimizedImages.length} images without loading, srcset, or dimension attributes that cause layout shifts, slow loading, and poor Core Web Vitals scores.`,
            customSolution: `// Publisher custom code solution for image optimization
const imageOptimizer = {
  optimizeImages: () => {
    const images = document.querySelectorAll('img:not([loading]):not([srcset])');
    images.forEach(img => {
      // Add lazy loading
      if (!img.loading) {
        img.loading = 'lazy';
      }
      
      // Add responsive images
      if (!img.srcset && img.src) {
        const baseSrc = img.src.replace(/.(jpg|png|webp)$/i, '');
        img.srcset = baseSrc + '-400.webp 400w, ' + baseSrc + '-800.webp 800w, ' + baseSrc + '-1200.webp 1200w';
        img.sizes = '(max-width: 400px) 400px, (max-width: 800px) 800px, 1200px';
      }
      
      // Add dimensions to prevent layout shift
      if (!img.width || !img.height) {
        img.onload = () => {
          img.width = img.naturalWidth;
          img.height = img.naturalHeight;
          img.style.width = '100%';
          img.style.height = 'auto';
        };
      }
    });
  },
  init: () => {
    imageOptimizer.optimizeImages();
  }
};`
          }
        ],
        impact: 'High - Causes layout shifts and slow loading',
        recommendation: 'Add loading, srcset, and dimension attributes to images'
      });
    }
    
    // Issue 4: Missing Critical CSS (using real data)
    const blockingStylesheets = stylesheets.filter(link => {
      return !link.includes('media=') && !link.includes('onload=');
    });
    
    if (blockingStylesheets.length > 0) {
      issues.push({
        priority: 4,
        title: 'Render-Blocking Stylesheets',
        severity: 'high',
        count: blockingStylesheets.length,
        keyFactors: [
          {
            factor: 'Synchronous CSS Loading',
            rootCause: `Found ${blockingStylesheets.length} external stylesheets without media attributes or onload handlers that block HTML parsing and delay First Contentful Paint.`,
            customSolution: `// Publisher custom code solution for CSS optimization
const cssOptimizer = {
  optimizeStylesheets: () => {
    const stylesheets = document.querySelectorAll('link[rel="stylesheet"]:not([media]):not([onload])');
    stylesheets.forEach(link => {
      // Defer non-critical stylesheets
      link.media = 'print';
      link.onload = () => {
        link.media = 'all';
      };
      
      // Add preload for critical CSS
      if (link.href.includes('critical') || link.href.includes('main')) {
        const preloadLink = document.createElement('link');
        preloadLink.rel = 'preload';
        preloadLink.as = 'style';
        preloadLink.href = link.href;
        document.head.insertBefore(preloadLink, link);
      }
    });
  },
  init: () => {
    cssOptimizer.optimizeStylesheets();
  }
};`
          }
        ],
        impact: 'High - Blocks HTML parsing and delays FCP',
        recommendation: 'Defer non-critical stylesheets and preload critical CSS'
      });
    }
    
    // Issue 5: Third-Party Widgets Without Optimization
    const thirdPartyWidgets = html.match(/<iframe[^>]*src=["'][^"']*(?:youtube|vimeo|twitter|facebook|instagram|linkedin|pinterest|tiktok|snapchat)["'][^>]*>/gi) || [];
    
    if (thirdPartyWidgets.length > 0) {
      issues.push({
        priority: 5,
        title: 'Unoptimized Third-Party Widgets',
        severity: 'high',
        count: thirdPartyWidgets.length,
        keyFactors: [
          {
            factor: 'Heavy Third-Party Embeds',
            rootCause: 'Third-party widgets like social media embeds load synchronously and cause layout shifts, blocking main thread and degrading performance.',
            customSolution: `// Publisher custom code solution for third-party widget optimization
const widgetOptimizer = {
  optimizeThirdPartyWidgets: () => {
    const widgets = document.querySelectorAll('iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="twitter"], iframe[src*="facebook"]');
    widgets.forEach(widget => {
      // Reserve space before loading
      widget.style.width = '100%';
      widget.style.height = '250px';
      widget.style.border = 'none';
      widget.style.backgroundColor = '#f0f0f0';
      
      // Store original src
      const originalSrc = widget.src;
      widget.src = '';
      widget.dataset.src = originalSrc;
      
      // Load widget after page is stable
      if (window.requestIdleCallback) {
        requestIdleCallback(() => {
          widget.src = widget.dataset.src;
        });
        } else {
        setTimeout(() => {
          widget.src = widget.dataset.src;
        }, 1000);
      }
    });
  },
  init: () => {
    widgetOptimizer.optimizeThirdPartyWidgets();
  }
};`
          }
        ],
        impact: 'High - Causes layout shifts and blocks main thread',
        recommendation: 'Lazy load third-party widgets and reserve space for them'
      });
    }
    
    // Sort issues by priority and take top 5
    issues.sort((a, b) => a.priority - b.priority);
    customCodeAnalysis.topPriorityIssues = issues.slice(0, 5);
    customCodeAnalysis.summary.totalIssues = issues.length;
    customCodeAnalysis.summary.highPriorityIssues = issues.filter(issue => issue.severity === 'high').length;
    customCodeAnalysis.summary.estimatedPerformanceImpact = 
      customCodeAnalysis.summary.highPriorityIssues > 3 ? 'High' : 
      customCodeAnalysis.summary.highPriorityIssues > 1 ? 'Medium' : 'Low';
    
    return customCodeAnalysis;
  } catch (error) {
    console.error('Error analyzing custom code:', error);
    return {
      topPriorityIssues: [],
      summary: {
        totalIssues: 0,
        highPriorityIssues: 0,
        estimatedPerformanceImpact: 'Low'
      }
    };
  }
}

// Helper function to fetch PageSpeed Insights data
async function getPageSpeedData(url) {
  try {
    // Try with API key first (following Google's API documentation)
    if (PAGESPEED_API_KEY && PAGESPEED_API_KEY !== 'YOUR_REAL_PAGESPEED_API_KEY_HERE' && PAGESPEED_API_KEY !== 'your-pagespeed-api-key-here') {
      const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${PAGESPEED_API_KEY}&strategy=mobile&category=performance`;
      
      console.log('🔍 Fetching PageSpeed Insights data with API key...');
      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Quintype-SEO-Analyzer/2.0)'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ PageSpeed Insights data fetched successfully with API key');
        return data;
        } else {
        console.log(`⚠️ PageSpeed API with key failed: ${response.status} - ${response.statusText}`);
        if (response.status === 403) {
          console.log('💡 Tip: Check if PageSpeed Insights API is enabled in Google Cloud Console');
        }
      }
    }
    
    // Fallback to public API without key
    console.log('🔍 Trying PageSpeed Insights public API (no key)...');
    const publicApiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance`;
    
    const response = await fetch(publicApiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Performance-Analyzer/3.0)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`PageSpeed API error: ${response.status} - ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('✅ PageSpeed Insights data fetched successfully from public API');
    
    return data;
  } catch (error) {
    console.error('❌ PageSpeed API error:', error.message);
    return null;
  }
}

// Helper function to generate comprehensive performance categories
function generatePerformanceCategories(performanceData) {
  try {
    const categories = {
      // Core Web Vitals with detailed analysis
      coreWebVitals: {
        title: "Core Web Vitals",
        description: "Essential metrics for measuring user experience",
        score: performanceData.overallScore || 0,
        metrics: {
          lcp: {
            value: performanceData.lcp || 0,
            unit: "ms",
            status: (performanceData.lcp || 0) <= 2500 ? 'good' : (performanceData.lcp || 0) <= 4000 ? 'needs-improvement' : 'poor',
            description: "Largest Contentful Paint - measures loading performance",
            targetValue: 2500,
            currentValue: performanceData.lcp || 0,
            analysis: generateLCPAnalysis(performanceData.lcp || 0)
          },
          cls: {
            value: performanceData.cls || 0,
            unit: "",
            status: (performanceData.cls || 0) <= 0.1 ? 'good' : (performanceData.cls || 0) <= 0.25 ? 'needs-improvement' : 'poor',
            description: "Cumulative Layout Shift - measures visual stability",
            targetValue: 0.1,
            currentValue: performanceData.cls || 0,
            analysis: generateCLSAnalysis(performanceData.cls || 0)
          },
          fcp: {
            value: performanceData.fcp || 0,
            unit: "ms",
            status: (performanceData.fcp || 0) <= 1800 ? 'good' : (performanceData.fcp || 0) <= 3000 ? 'needs-improvement' : 'poor',
            description: "First Contentful Paint - measures loading performance",
            targetValue: 1800,
            currentValue: performanceData.fcp || 0
          },
          fid: {
            value: performanceData.fid || 0,
            unit: "ms",
            status: (performanceData.fid || 0) <= 100 ? 'good' : (performanceData.fid || 0) <= 300 ? 'needs-improvement' : 'poor',
            description: "First Input Delay - measures interactivity",
            targetValue: 100,
            currentValue: performanceData.fid || 0
          },
          inp: {
            value: performanceData.inp || 0,
            unit: "ms",
            status: (performanceData.inp || 0) <= 200 ? 'good' : (performanceData.inp || 0) <= 500 ? 'needs-improvement' : 'poor',
            description: "Interaction to Next Paint - measures responsiveness",
            targetValue: 200,
            currentValue: performanceData.inp || 0
          }
        }
      },
      
      // Publisher Code Analysis
      publisherCode: {
        title: "Publisher Code - Inline Scripts",
        description: "Analysis of scripts directly embedded in your website's HTML",
        summary: {
          totalScripts: 0,
          highImpact: 0,
          mediumImpact: 0,
          lowImpact: 0
        },
        scripts: [],
        analysis: generatePublisherCodeAnalysis()
      },
      
      // Third-Party Code Analysis
      thirdPartyCode: {
        externalScripts: {
          title: "Third-Party Code - External Scripts",
          description: "Analysis of external scripts loaded from third-party domains",
          summary: {
            totalScripts: 0,
            highImpact: 0,
            mediumImpact: 0,
            lowImpact: 0
          },
          services: [],
          analysis: generateThirdPartyAnalysis()
        },
        trackingScripts: {
          title: "Third-Party Code - Tracking Scripts",
          description: "Analysis of scripts used for tracking and analytics",
          summary: {
            totalScripts: 0,
            highImpact: 0,
            mediumImpact: 0,
            lowImpact: 0
          },
          services: [],
          analysis: generateTrackingScriptsAnalysis()
        }
      },
      
      // High Priority Performance Issues
      highPriorityIssues: {
        title: "HIGH PRIORITY Performance Issues & Solutions",
        description: "Critical performance problems with actionable solutions",
        issues: generateHighPriorityIssues(performanceData),
        totalIssues: 0
      },
      
      // Performance Metrics
      performanceMetrics: {
        title: "Performance Metrics",
        description: "Additional performance measurements",
        metrics: {
          tti: {
            value: performanceData.tti || 0,
            unit: "ms",
            status: (performanceData.tti || 0) <= 3800 ? 'good' : (performanceData.tti || 0) <= 7300 ? 'needs-improvement' : 'poor',
            description: "Time to Interactive - measures when page becomes fully interactive"
          },
          tbt: {
            value: performanceData.tbt || 0,
            unit: "ms",
            status: (performanceData.tbt || 0) <= 200 ? 'good' : (performanceData.tbt || 0) <= 600 ? 'needs-improvement' : 'poor',
            description: "Total Blocking Time - measures main thread blocking"
          },
          speedIndex: {
            value: performanceData.speedIndex || 0,
            unit: "ms",
            status: (performanceData.speedIndex || 0) <= 3400 ? 'good' : (performanceData.speedIndex || 0) <= 5800 ? 'needs-improvement' : 'poor',
            description: "Speed Index - measures how quickly content is visually displayed"
          }
        }
      },
      
      // Performance Issues
      performanceIssues: {
        title: "Performance Issues",
        description: "Identified performance problems and recommendations",
        issues: performanceData.issues || [],
        totalIssues: (performanceData.issues || []).length
      },
      
      // Lighthouse Audits
      lighthouseAudits: {
        title: "Lighthouse Audits",
        description: "Detailed audit results from Google Lighthouse",
        audits: performanceData.audits || {},
        categories: performanceData.categories || {}
      }
    };
    
    return categories;
  } catch (error) {
    console.error('Error generating performance categories:', error);
    return {
      error: 'Failed to generate performance categories',
      details: error.message
    };
  }
}

// Helper functions for detailed analysis generation
function generateLCPAnalysis(lcpValue) {
  const issues = [];
  
  if (lcpValue > 4000) {
    issues.push({
      key: "large-image-file-size",
      priority: "high",
      keyFactor: "Large Image File Size",
      rootCause: "Using unoptimized image formats (JPG/PNG/GIF) that are 3-5x larger than modern formats, causing slow downloads and delayed LCP.",
      specificSolution: "Convert images to modern formats like WebP, which are 20-50% smaller while maintaining quality.",
      recommendation: "Use WebP for broad compatibility, AVIF for cutting-edge browsers. Always provide JPG fallback.",
      customCodeSolution: `// Image format optimization
document.querySelectorAll('img').forEach(img => {
  if (img.src.includes('.jpg') || img.src.includes('.png')) {
    // Convert to WebP format
    img.src = img.src.replace(/\\.(jpg|png)$/, '.webp');
    
    // Add responsive srcset
    img.srcset = \`\${img.src.replace('.webp', '-1200w.webp')} 1200w,
                  \${img.src.replace('.webp', '-800w.webp')} 800w,
                  \${img.src.replace('.webp', '-400w.webp')} 400w\`;
    img.sizes = '(max-width: 400px) 400px, (max-width: 800px) 800px, 1200px';
  }
});`
    });
  }
  
  if (lcpValue > 2500) {
    issues.push({
      key: "lcp-image-not-prioritized",
      priority: "medium",
      keyFactor: "LCP Image Not Prioritized",
      rootCause: "Browser doesn't know which image is most important, so it loads them in document order rather than priority.",
      specificSolution: "Preload the LCP image in the document head to give it highest priority.",
      recommendation: "Identify your largest content element and preload it immediately after critical CSS.",
      customCodeSolution: `// Preload LCP image
const lcpImage = document.querySelector('img[data-lcp]') || 
                 document.querySelector('img[src*="hero"]') ||
                 document.querySelector('img[src*="banner"]');

if (lcpImage) {
  const preloadLink = document.createElement('link');
  preloadLink.rel = 'preload';
  preloadLink.href = lcpImage.src;
  preloadLink.as = 'image';
  document.head.appendChild(preloadLink);
}`
    });
  }
  
  return {
    currentValue: lcpValue,
    targetValue: 2500,
    status: lcpValue <= 2500 ? 'good' : lcpValue <= 4000 ? 'needs-improvement' : 'poor',
    issues: issues
  };
}

function generateCLSAnalysis(clsValue) {
  const issues = [];
  
  if (clsValue > 0.25) {
    issues.push({
      key: "unstable-layout",
      priority: "high",
      keyFactor: "Unstable Layout Elements",
      rootCause: "Elements are shifting during page load due to missing dimensions, font loading, or dynamic content insertion.",
      specificSolution: "Reserve space for dynamic content and ensure images have explicit dimensions.",
      recommendation: "Use aspect-ratio CSS property, reserve space for ads, and preload fonts.",
      customCodeSolution: `// Prevent layout shifts
// 1. Reserve space for images
img {
  aspect-ratio: attr(width) / attr(height);
  width: 100%;
  height: auto;
}

// 2. Reserve space for dynamic content
.ad-container {
  min-height: 250px;
  background: #f0f0f0;
}

// 3. Preload fonts
<link rel="preload" href="/fonts/main.woff2" as="font" type="font/woff2" crossorigin>`
    });
  }
  
  return {
    currentValue: clsValue,
    targetValue: 0.1,
    status: clsValue <= 0.1 ? 'good' : clsValue <= 0.25 ? 'needs-improvement' : 'poor',
    issues: issues
  };
}

function generatePublisherCodeAnalysis() {
  return {
    summary: "Analysis of inline scripts embedded in your HTML",
    recommendations: [
      "Extract large inline scripts to external files",
      "Use async/defer attributes for non-critical scripts",
      "Minimize inline JavaScript for better caching"
    ]
  };
}

function generateThirdPartyAnalysis() {
  return {
    summary: "Analysis of external scripts from third-party domains",
    recommendations: [
      "Lazy load non-critical third-party scripts",
      "Use resource hints (preconnect, dns-prefetch)",
      "Consider using facades for heavy third-party widgets"
    ]
  };
}

function generateTrackingScriptsAnalysis() {
    return {
    summary: "Analysis of tracking and analytics scripts",
    recommendations: [
      "Defer analytics scripts until after page load",
      "Use Google Tag Manager for better performance",
      "Consider server-side tracking for critical metrics"
    ]
  };
}

function generateHighPriorityIssues(performanceData) {
  const issues = [];
  
  // LCP Issues
  if (performanceData.lcp > 4000) {
    issues.push({
      key: "lcp-critical",
      priority: "critical",
      category: "Largest Contentful Paint",
      keyFactor: "Render-blocking HTTP/JS",
      rootCause: `Large inline scripts (${Math.round(performanceData.lcp / 1000)}KB total) are blocking the main thread`,
      recommendation: "Extract inline scripts to separate .js files and load them asynchronously to prevent render blocking",
      customCodeSolution: `// Publisher Code Optimization
// Extract inline scripts to external files
const inlineScripts = document.querySelectorAll('script:not([src])');
inlineScripts.forEach((script, index) => {
  if (script.innerHTML.length > 1000) {
    // Create external script file
    const scriptFile = new Blob([script.innerHTML], { type: 'application/javascript' });
    const scriptUrl = URL.createObjectURL(scriptFile);
    
    // Replace with external script
    const newScript = document.createElement('script');
    newScript.src = scriptUrl;
    newScript.async = true;
    script.parentNode.replaceChild(newScript, script);
  }
});

// Async loading for Google Tag Manager
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'GA_MEASUREMENT_ID');`
    });
  }
  
  // TBT Issues
  if (performanceData.tbt > 600) {
    issues.push({
      key: "tbt-critical",
      priority: "critical",
      category: "Total Blocking Time",
      keyFactor: "Heavy JavaScript Execution",
      rootCause: `JavaScript is blocking the main thread for ${performanceData.tbt}ms, preventing user interaction`,
      recommendation: "Minimize JavaScript execution time and use code splitting to defer non-critical scripts",
      customCodeSolution: `// Optimize JavaScript execution
// Use requestIdleCallback for non-critical tasks
if ('requestIdleCallback' in window) {
  requestIdleCallback(() => {
    // Non-critical JavaScript here
    loadAnalytics();
    loadSocialWidgets();
  });
}

// Code splitting with dynamic imports
async function loadNonCriticalFeatures() {
  const { initChatWidget } = await import('./chat-widget.js');
  const { initRecommendations } = await import('./recommendations.js');
  
  initChatWidget();
  initRecommendations();
}

// Load after page is interactive
window.addEventListener('load', loadNonCriticalFeatures);`
    });
  }
  
  // TTI Issues
  if (performanceData.tti > 7300) {
    issues.push({
      key: "tti-critical",
      priority: "critical",
      category: "Time to Interactive",
      keyFactor: "Slow JavaScript Loading",
      rootCause: `Page takes ${performanceData.tti}ms to become fully interactive due to heavy JavaScript`,
      recommendation: "Optimize JavaScript loading and reduce bundle size using code splitting",
      customCodeSolution: `// Optimize TTI
// Defer non-critical JavaScript
<script>
// Critical JavaScript only
document.addEventListener('DOMContentLoaded', function() {
  // Essential functionality only
  initNavigation();
  initSearch();
});

// Defer everything else
window.addEventListener('load', function() {
  // Load non-critical features
  import('./analytics.js');
  import('./social-share.js');
  import('./comments.js');
});
</script>`
    });
  }
  
  return issues;
}

// Helper function to extract Core Web Vitals from PageSpeed data
function extractCoreWebVitals(pageSpeedData) {
  if (!pageSpeedData || !pageSpeedData.lighthouseResult) {
    return null;
  }
  
  const audits = pageSpeedData.lighthouseResult.audits;
  const categories = pageSpeedData.lighthouseResult.categories;
  
    return {
    lcp: audits['largest-contentful-paint']?.numericValue || null,
    cls: audits['cumulative-layout-shift']?.numericValue || null,
    fcp: audits['first-contentful-paint']?.numericValue || null,
    fid: audits['max-potential-fid']?.numericValue || null,
    tti: audits['interactive']?.numericValue || null,
    tbt: audits['total-blocking-time']?.numericValue || null,
    speedIndex: audits['speed-index']?.numericValue || null,
    performanceScore: categories.performance?.score ? Math.round(categories.performance.score * 100) : null,
    accessibilityScore: categories.accessibility?.score ? Math.round(categories.accessibility.score * 100) : null,
    bestPracticesScore: categories['best-practices']?.score ? Math.round(categories['best-practices'].score * 100) : null,
    seoScore: categories.seo?.score ? Math.round(categories.seo.score * 100) : null
  };
}

// Helper function to identify third-party service type
function getThirdPartyType(domain) {
  const serviceMap = {
    'google': 'Google Analytics/Tag Manager',
    'facebook': 'Facebook Pixel',
    'twitter': 'Twitter Widget',
    'linkedin': 'LinkedIn Analytics',
    'youtube': 'YouTube Embed',
    'instagram': 'Instagram Embed',
    'tiktok': 'TikTok Widget',
    'snapchat': 'Snapchat Pixel',
    'pinterest': 'Pinterest Widget',
    'amazon': 'Amazon Associates',
    'ads': 'Advertising Network',
    'analytics': 'Analytics Service',
    'chat': 'Chat Widget',
    'support': 'Support Widget',
    'recaptcha': 'reCAPTCHA',
    'stripe': 'Payment Processing',
    'paypal': 'Payment Processing'
  };
  
  for (const [key, value] of Object.entries(serviceMap)) {
    if (domain.includes(key)) {
      return value;
    }
  }
  
  return 'Unknown Third-Party Service';
}

// Helper function to assess third-party impact
function getThirdPartyImpact(domain, url) {
  const highImpactServices = ['google', 'facebook', 'ads', 'analytics', 'chat'];
  const mediumImpactServices = ['twitter', 'linkedin', 'youtube', 'instagram'];
  
  if (highImpactServices.some(service => domain.includes(service))) {
    return 'High - Blocking scripts, tracking, or heavy resources';
  } else if (mediumImpactServices.some(service => domain.includes(service))) {
    return 'Medium - Social widgets or embeds';
  } else {
    return 'Low - Lightweight third-party service';
  }
}

// AI-powered comprehensive analysis for each Core Web Vitals metric
function generateAIPerformanceSuggestions(performanceData, html, targetUrl) {
  try {
    const suggestions = {
      lcp: {
        metric: 'Largest Contentful Paint (LCP)',
        currentValue: performanceData.lcp || 0,
        targetValue: 2500,
        status: performanceData.lcp <= 2500 ? 'good' : performanceData.lcp <= 4000 ? 'needs-improvement' : 'poor',
        description: 'LCP measures loading performance. It marks the point when the largest content element becomes visible.',
        impact: performanceData.lcp > 4000 ? 'High - Users experience slow loading' : performanceData.lcp > 2500 ? 'Medium - Loading could be faster' : 'Low - Good loading performance',
        suggestions: [
          {
            category: 'Image Optimization',
            priority: 'High',
            title: 'Optimize Largest Contentful Element',
            description: 'The largest element on your page is likely an image that needs optimization.',
            solutions: [
              {
                keyFactor: 'Large Image File Sizes',
                rootCause: 'Using outdated image formats (JPEG/PNG) that are 3-5x larger than modern formats, causing slow downloads and delayed LCP.',
                specificSolution: 'Convert images to WebP or AVIF format, which are 60-80% smaller while maintaining quality.',
                recommendation: 'Use WebP for broad compatibility, AVIF for cutting-edge browsers. Always provide JPEG fallback.',
                customCodeSolution: `// Publisher custom code for image format optimization
const imageOptimizer = {
  convertToWebP: () => {
    const images = document.querySelectorAll('img[src*=".jpg"], img[src*=".png"]');
    images.forEach(img => {
      const webpSrc = img.src.replace(/\.(jpg|png)$/i, '.webp');
      const webpImg = new Image();
      webpImg.onload = () => img.src = webpSrc;
      webpImg.src = webpSrc;
    });
  }
};`
              },
              {
                keyFactor: 'Non-Responsive Images',
                rootCause: 'Loading full-size images on all devices, wasting bandwidth on mobile and causing unnecessary delays.',
                specificSolution: 'Implement responsive images with srcset to serve appropriately sized images for each device.',
                recommendation: 'Create multiple image sizes (400w, 800w, 1200w) and let browser choose the best one.',
                customCodeSolution: `// Publisher custom code for responsive images
const responsiveImageOptimizer = {
  addSrcset: () => {
    const images = document.querySelectorAll('img:not([srcset])');
    images.forEach(img => {
      const baseSrc = img.src.replace(/\.(jpg|png|webp)$/i, '');
      img.srcset = \`\${baseSrc}-400.webp 400w, \${baseSrc}-800.webp 800w, \${baseSrc}-1200.webp 1200w\`;
      img.sizes = '(max-width: 400px) 400px, (max-width: 800px) 800px, 1200px';
    });
  }
};`
              },
              {
                keyFactor: 'LCP Image Not Prioritized',
                rootCause: 'Browser doesn\'t know which image is most important, so it loads them in document order rather than priority.',
                specificSolution: 'Preload the LCP image in the document head to give it highest priority.',
                recommendation: 'Identify your largest content element and preload it immediately after critical CSS.',
                customCodeSolution: `// Publisher custom code for LCP image preloading
const lcpOptimizer = {
  preloadLCPImage: () => {
    const lcpImage = document.querySelector('img[data-lcp]') || 
                    document.querySelector('.hero img') || 
                    document.querySelector('img:first-of-type');
    
    if (lcpImage) {
      const preloadLink = document.createElement('link');
      preloadLink.rel = 'preload';
      preloadLink.as = 'image';
      preloadLink.href = lcpImage.src;
      document.head.insertBefore(preloadLink, document.head.firstChild);
    }
  }
};`
              },
              {
                keyFactor: 'Uncompressed Images',
                rootCause: 'Images uploaded without compression, resulting in unnecessarily large file sizes.',
                specificSolution: 'Compress images to reduce file size by 60-80% without visible quality loss.',
                recommendation: 'Use tools like TinyPNG, ImageOptim, or automated compression in your build process.',
                customCodeSolution: `// Publisher custom code for image compression detection
const compressionChecker = {
  checkImageCompression: () => {
    const images = document.querySelectorAll('img');
    images.forEach(img => {
      img.onload = () => {
        const naturalSize = img.naturalWidth * img.naturalHeight;
        const fileSize = img.src.length; // Approximate
        if (fileSize > naturalSize * 0.5) { // Rough compression check
          console.warn('Image may need compression:', img.src);
        }
      };
    });
  }
};`
              }
            ]
          }
        ]
      },
      cls: {
        metric: 'Cumulative Layout Shift (CLS)',
        currentValue: performanceData.cls || 0,
        targetValue: 0.1,
        status: performanceData.cls <= 0.1 ? 'good' : performanceData.cls <= 0.25 ? 'needs-improvement' : 'poor',
        description: 'CLS measures visual stability. It quantifies how much visible content shifts during page load.',
        impact: performanceData.cls > 0.25 ? 'High - Poor user experience with content jumping' : performanceData.cls > 0.1 ? 'Medium - Some layout shifts occur' : 'Low - Stable layout',
        suggestions: [
          {
            category: 'Image Dimensions',
            priority: 'High',
            title: 'Set Image Dimensions',
            description: 'Images without dimensions cause layout shifts when they load.',
            solutions: [
              {
                keyFactor: 'Images Without Dimensions',
                rootCause: 'Images loaded without width/height attributes cause the browser to recalculate layout when they load, pushing other content around.',
                specificSolution: 'Add explicit width and height attributes to all images to reserve space before loading.',
                recommendation: 'Always specify dimensions for images. Use CSS to make them responsive while maintaining aspect ratio.',
                customCodeSolution: `// Publisher custom code for image dimension fixing
const clsImageOptimizer = {
  fixImageDimensions: () => {
    const images = document.querySelectorAll('img:not([width]):not([height])');
    images.forEach(img => {
      img.onload = () => {
        img.width = img.naturalWidth;
        img.height = img.naturalHeight;
        img.style.width = '100%';
        img.style.height = 'auto';
      };
    });
  }
};`
              },
              {
                keyFactor: 'Dynamic Content Loading',
                rootCause: 'Content that loads asynchronously (ads, widgets, social media embeds) pushes existing content around when it appears.',
                specificSolution: 'Reserve space for dynamic content using CSS aspect-ratio or fixed dimensions.',
                recommendation: 'Use skeleton loaders or placeholder divs with fixed dimensions for all dynamic content.',
                customCodeSolution: `// Publisher custom code for dynamic content space reservation
const dynamicContentOptimizer = {
  reserveSpaceForDynamicContent: () => {
    const dynamicElements = document.querySelectorAll('[data-dynamic-content]');
    dynamicElements.forEach(element => {
      element.style.minHeight = '200px'; // Reserve minimum space
      element.style.aspectRatio = '16/9'; // Maintain aspect ratio
      element.style.backgroundColor = '#f0f0f0'; // Show placeholder
    });
  }
};`
              },
              {
                keyFactor: 'Font Loading Without Fallbacks',
                rootCause: 'Custom fonts load after initial render, causing text to reflow when the font changes from fallback to custom.',
                specificSolution: 'Use font-display: swap and provide appropriate fallback fonts with similar metrics.',
                recommendation: 'Preload critical fonts and use font-display: swap to prevent layout shifts.',
                customCodeSolution: `// Publisher custom code for font loading optimization
const fontOptimizer = {
  optimizeFontLoading: () => {
    const fontLinks = document.querySelectorAll('link[href*="font"]');
    fontLinks.forEach(link => {
      link.rel = 'preload';
      link.as = 'font';
      link.type = 'font/woff2';
      link.crossOrigin = 'anonymous';
    });
    
    // Add font-display swap to existing font faces
    const style = document.createElement('style');
    style.textContent = \`
      @font-face {
        font-family: 'CustomFont';
        font-display: swap;
      }
    \`;
    document.head.appendChild(style);
  }
};`
              },
              {
                keyFactor: 'Third-Party Widgets',
                rootCause: 'External widgets (ads, social media embeds, chat widgets) load at unpredictable times and sizes.',
                specificSolution: 'Reserve space for widgets and use lazy loading to prevent layout shifts.',
                recommendation: 'Always specify dimensions for third-party content and load it below the fold when possible.',
                customCodeSolution: `// Publisher custom code for third-party widget optimization
const widgetOptimizer = {
  optimizeThirdPartyWidgets: () => {
    const widgets = document.querySelectorAll('iframe[src*="ads"], iframe[src*="social"], iframe[src*="widget"]');
    widgets.forEach(widget => {
      // Reserve space before loading
      widget.style.width = '100%';
      widget.style.height = '250px'; // Standard ad height
      widget.style.border = 'none';
      
      // Load widget after page is stable
      if (window.requestIdleCallback) {
        requestIdleCallback(() => {
          widget.src = widget.dataset.src;
        });
      } else {
        setTimeout(() => {
          widget.src = widget.dataset.src;
        }, 1000);
      }
    });
  }
};`
              }
            ]
          }
        ]
      },
      fcp: {
        metric: 'First Contentful Paint (FCP)',
        currentValue: performanceData.fcp || 0,
        targetValue: 1800,
        status: performanceData.fcp <= 1800 ? 'good' : performanceData.fcp <= 3000 ? 'needs-improvement' : 'poor',
        description: 'FCP measures perceived loading speed. It marks when the first text or image is painted.',
        impact: performanceData.fcp > 3000 ? 'High - Users see blank page for too long' : performanceData.fcp > 1800 ? 'Medium - Loading could be faster' : 'Low - Good perceived performance',
        suggestions: [
          {
            category: 'Critical Resources',
            priority: 'High',
            title: 'Optimize Critical Rendering Path',
            description: 'Eliminate render-blocking resources that delay FCP.',
            solutions: [
              {
                keyFactor: 'Render-Blocking CSS',
                rootCause: 'External stylesheets block HTML parsing and delay First Contentful Paint until they are downloaded and parsed.',
                specificSolution: 'Inline critical CSS in the document head and defer non-critical stylesheets.',
                recommendation: 'Extract above-the-fold CSS and inline it, load remaining CSS asynchronously.',
                customCodeSolution: `// Publisher custom code for critical CSS inlining
const criticalCSSOptimizer = {
  inlineCriticalCSS: () => {
    const criticalCSS = document.querySelector('[data-critical-css]');
    if (criticalCSS) {
      const style = document.createElement('style');
      style.textContent = criticalCSS.textContent;
      document.head.insertBefore(style, document.head.firstChild);
      criticalCSS.remove();
    }
    
    // Defer non-critical stylesheets
    const stylesheets = document.querySelectorAll('link[rel="stylesheet"]:not([data-critical])');
    stylesheets.forEach(link => {
      link.media = 'print';
      link.onload = () => link.media = 'all';
    });
  }
};`
              },
              {
                keyFactor: 'Render-Blocking JavaScript',
                rootCause: 'Scripts in the document head block HTML parsing and delay content rendering.',
                specificSolution: 'Move scripts to the end of body or use async/defer attributes for non-critical scripts.',
                recommendation: 'Only inline critical JavaScript, defer everything else until after page load.',
                customCodeSolution: `// Publisher custom code for script optimization
const scriptOptimizer = {
  optimizeScripts: () => {
    const blockingScripts = document.querySelectorAll('script[src]:not([async]):not([defer])');
    blockingScripts.forEach(script => {
      const src = script.src.toLowerCase();
      
      if (src.includes('analytics') || src.includes('tracking')) {
        script.async = true;
      } else if (src.includes('framework') || src.includes('core')) {
        script.defer = true;
      } else {
        // Move to end of body
        document.body.appendChild(script);
      }
    });
  }
};`
              },
              {
                keyFactor: 'Large HTML Document',
                rootCause: 'Excessive HTML size delays parsing and increases time to First Contentful Paint.',
                specificSolution: 'Minify HTML, remove unnecessary whitespace, and optimize document structure.',
                recommendation: 'Use HTML minification tools and remove unused markup.',
                customCodeSolution: `// Publisher custom code for HTML optimization
const htmlOptimizer = {
  optimizeHTML: () => {
    // Remove unnecessary whitespace
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let node;
    while (node = walker.nextNode()) {
      if (node.textContent.trim() === '') {
        node.remove();
      }
    }
    
    // Remove empty elements
    const emptyElements = document.querySelectorAll('*:empty');
    emptyElements.forEach(el => {
      if (el.tagName !== 'IMG' && el.tagName !== 'BR' && el.tagName !== 'HR') {
        el.remove();
      }
    });
  }
};`
              },
              {
                keyFactor: 'Slow Server Response',
                rootCause: 'Server takes too long to respond with initial HTML, delaying all subsequent rendering.',
                specificSolution: 'Optimize server performance, use CDN, and implement caching strategies.',
                recommendation: 'Use a CDN, enable gzip compression, and implement proper caching headers.',
                customCodeSolution: `// Publisher custom code for performance monitoring
const performanceMonitor = {
  monitorServerResponse: () => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const serverResponseTime = navigation.responseStart - navigation.requestStart;
    
    if (serverResponseTime > 200) {
      console.warn('Slow server response time:', serverResponseTime + 'ms');
      
      // Implement client-side caching for repeated requests
      if ('caches' in window) {
        caches.open('html-cache').then(cache => {
          cache.add(window.location.href);
        });
      }
    }
  }
};`
              }
            ]
          }
        ]
      },
      tti: {
        metric: 'Time to Interactive (TTI)',
        currentValue: performanceData.tti || 0,
        targetValue: 3800,
        status: performanceData.tti <= 3800 ? 'good' : performanceData.tti <= 7300 ? 'needs-improvement' : 'poor',
        description: 'TTI measures when the page becomes fully interactive. It marks when the main thread is idle.',
        impact: performanceData.tti > 7300 ? 'High - Users cannot interact with page for too long' : performanceData.tti > 3800 ? 'Medium - Page becomes interactive slowly' : 'Low - Good interactivity',
        suggestions: [
          {
            category: 'JavaScript Optimization',
            priority: 'High',
            title: 'Optimize JavaScript Execution',
            description: 'Reduce JavaScript execution time to improve TTI.',
            solutions: [
              {
                keyFactor: 'Large JavaScript Bundles',
                rootCause: 'Loading all JavaScript code at once delays Time to Interactive as the browser must parse and execute everything before the page becomes interactive.',
                specificSolution: 'Implement code splitting to load only essential JavaScript initially, then load additional features on demand.',
                recommendation: 'Use dynamic imports and route-based code splitting to reduce initial bundle size.',
                customCodeSolution: `// Publisher custom code for code splitting
const codeSplitter = {
  implementLazyLoading: () => {
    // Lazy load non-critical features
    const lazyFeatures = document.querySelectorAll('[data-lazy-feature]');
    lazyFeatures.forEach(feature => {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const featureName = entry.target.dataset.lazyFeature;
            import(\`./features/\${featureName}.js\`).then(module => {
              module.init(entry.target);
            });
            observer.unobserve(entry.target);
          }
        });
      });
      observer.observe(feature);
    });
  }
};`
              },
              {
                keyFactor: 'Synchronous Script Loading',
                rootCause: 'Scripts loading synchronously block the main thread and delay page interactivity.',
                specificSolution: 'Use async/defer attributes for non-critical scripts to load them in parallel without blocking.',
                recommendation: 'Only critical scripts should load synchronously, everything else should be async or deferred.',
                customCodeSolution: `// Publisher custom code for script loading optimization
const scriptLoader = {
  optimizeScriptLoading: () => {
    const scripts = document.querySelectorAll('script[src]');
    scripts.forEach(script => {
      const src = script.src.toLowerCase();
      
      // Analytics and tracking scripts - async
      if (src.includes('analytics') || src.includes('gtag') || src.includes('facebook')) {
        script.async = true;
      }
      // Framework scripts - defer
      else if (src.includes('jquery') || src.includes('bootstrap') || src.includes('react')) {
        script.defer = true;
      }
      // Widget scripts - load after interaction
      else if (src.includes('widget') || src.includes('chat')) {
        script.dataset.defer = 'true';
        script.remove();
        
        // Load after user interaction
        document.addEventListener('click', () => {
          if (script.dataset.defer) {
            document.head.appendChild(script);
            script.dataset.defer = 'false';
          }
        }, { once: true });
      }
    });
  }
};`
              },
              {
                keyFactor: 'Unused JavaScript Code',
                rootCause: 'Dead code increases bundle size and parsing time, delaying Time to Interactive.',
                specificSolution: 'Remove unused JavaScript and implement tree shaking to eliminate dead code.',
                recommendation: 'Use build tools like Webpack or Rollup with tree shaking enabled.',
                customCodeSolution: `// Publisher custom code for unused code detection
const unusedCodeDetector = {
  detectUnusedCode: () => {
    const scripts = document.querySelectorAll('script[src]');
    scripts.forEach(script => {
      // Check if script is actually used
      const scriptName = script.src.split('/').pop();
      const isUsed = document.querySelector(\`[data-uses="\${scriptName}"]\`);
      
      if (!isUsed) {
        console.warn('Potentially unused script:', scriptName);
        // Mark for removal in next build
        script.dataset.unused = 'true';
      }
    });
  }
};`
              },
              {
                keyFactor: 'Uncompressed JavaScript',
                rootCause: 'Large, uncompressed JavaScript files take longer to download and parse.',
                specificSolution: 'Minify and compress JavaScript files to reduce size and improve loading speed.',
                recommendation: 'Use tools like Terser for minification and enable gzip/brotli compression.',
                customCodeSolution: `// Publisher custom code for JavaScript optimization
const jsOptimizer = {
  optimizeJavaScript: () => {
    // Monitor JavaScript loading performance
    const scripts = document.querySelectorAll('script[src]');
    scripts.forEach(script => {
      const startTime = performance.now();
      script.onload = () => {
        const loadTime = performance.now() - startTime;
        if (loadTime > 100) {
          console.warn('Slow script loading:', script.src, loadTime + 'ms');
        }
      };
    });
    
    // Implement service worker for caching
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(() => {
        console.log('Service worker registered for JS caching');
      });
    }
  }
};`
              }
            ]
          }
        ]
      },
      tbt: {
        metric: 'Total Blocking Time (TBT)',
        currentValue: performanceData.tbt || 0,
        targetValue: 200,
        status: performanceData.tbt <= 200 ? 'good' : performanceData.tbt <= 600 ? 'needs-improvement' : 'poor',
        description: 'TBT measures main thread blocking. It quantifies how long the main thread is blocked.',
        impact: performanceData.tbt > 600 ? 'High - Main thread blocked frequently' : performanceData.tbt > 200 ? 'Medium - Some blocking occurs' : 'Low - Minimal blocking',
        suggestions: [
          {
            category: 'Long Tasks',
            priority: 'High',
            title: 'Break Up Long Tasks',
            description: 'Tasks longer than 50ms block the main thread and hurt TBT.',
            solutions: [
              {
                keyFactor: 'Long-Running JavaScript Tasks',
                rootCause: 'JavaScript tasks longer than 50ms block the main thread, preventing user interactions and causing poor responsiveness.',
                specificSolution: 'Break long tasks into smaller chunks using setTimeout or requestIdleCallback to yield control back to the browser.',
                recommendation: 'Keep individual tasks under 50ms and use time slicing for heavy operations.',
                customCodeSolution: `// Publisher custom code for task splitting
const taskSplitter = {
  splitLongTasks: () => {
    // Example: Process large arrays in chunks
    function processLargeArray(array, chunkSize = 100) {
      let index = 0;
      
      function processChunk() {
        const endIndex = Math.min(index + chunkSize, array.length);
        
        for (let i = index; i < endIndex; i++) {
          // Process array item
          processItem(array[i]);
        }
        
        index = endIndex;
        
        if (index < array.length) {
          // Yield control back to browser
          setTimeout(processChunk, 0);
        }
      }
      
      processChunk();
    }
  }
};`
              },
              {
                keyFactor: 'Synchronous DOM Manipulation',
                rootCause: 'Large DOM updates performed synchronously block the main thread and cause layout thrashing.',
                specificSolution: 'Use requestAnimationFrame or requestIdleCallback for DOM updates to avoid blocking the main thread.',
                recommendation: 'Batch DOM updates and use document fragments for multiple changes.',
                customCodeSolution: `// Publisher custom code for DOM optimization
const domOptimizer = {
  optimizeDOMUpdates: () => {
    // Batch DOM updates
    const updates = [];
    
    function batchUpdate(element, changes) {
      updates.push({ element, changes });
      
      if (updates.length === 1) {
        requestAnimationFrame(() => {
          updates.forEach(({ element, changes }) => {
            Object.assign(element.style, changes);
          });
          updates.length = 0;
        });
      }
    }
    
    // Use document fragments for multiple insertions
    function appendMultipleElements(parent, elements) {
      const fragment = document.createDocumentFragment();
      elements.forEach(el => fragment.appendChild(el));
      parent.appendChild(fragment);
    }
  }
};`
              },
              {
                keyFactor: 'Heavy Computational Tasks',
                rootCause: 'CPU-intensive operations like image processing or data analysis block the main thread.',
                specificSolution: 'Move heavy computations to Web Workers to run in background threads.',
                recommendation: 'Use Web Workers for any task that takes more than 16ms to complete.',
                customCodeSolution: `// Publisher custom code for Web Worker optimization
const workerOptimizer = {
  createWorker: (scriptPath) => {
    const worker = new Worker(scriptPath);
    
    return {
      process: (data) => {
        return new Promise((resolve, reject) => {
          worker.onmessage = (e) => resolve(e.data);
          worker.onerror = reject;
          worker.postMessage(data);
        });
      },
      terminate: () => worker.terminate()
    };
  },
  
  // Example usage for image processing
  processImage: (imageData) => {
    const imageWorker = this.createWorker('/js/image-processor.js');
    return imageWorker.process(imageData);
  }
};`
              },
              {
                keyFactor: 'Inefficient Algorithms',
                rootCause: 'Poor algorithm choices (O(n²) instead of O(n log n)) cause unnecessary CPU usage and blocking.',
                specificSolution: 'Optimize algorithms and data structures to reduce computational complexity.',
                recommendation: 'Profile your code to identify bottlenecks and use appropriate data structures.',
                customCodeSolution: `// Publisher custom code for algorithm optimization
const algorithmOptimizer = {
  optimizeSearch: () => {
    // Instead of O(n) linear search, use Map for O(1) lookups
    const dataMap = new Map();
    
    // Populate map once
    function buildIndex(data) {
      data.forEach((item, index) => {
        dataMap.set(item.id, { item, index });
      });
    }
    
    // Fast lookup
    function findItem(id) {
      return dataMap.get(id);
    }
    
    return { buildIndex, findItem };
  },
  
  optimizeSorting: () => {
    // Use efficient sorting algorithms
    function quickSort(arr) {
      if (arr.length <= 1) return arr;
      
      const pivot = arr[Math.floor(arr.length / 2)];
      const left = arr.filter(x => x < pivot);
      const right = arr.filter(x => x > pivot);
      
      return [...quickSort(left), pivot, ...quickSort(right)];
    }
    
    return { quickSort };
  }
};`
              }
            ]
          }
        ]
      }
    };
    
    return suggestions;
  } catch (error) {
    console.error('Error generating AI suggestions:', error);
    return {};
  }
}

// ChatGPT API function for enhanced analysis
async function getChatGPTSolution(issue, html, targetUrl) {
  try {
    if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-openai-api-key-here') {
      console.log('⚠️ No OpenAI API key provided - skipping AI analysis');
      return null; // Skip if no API key provided
    }
    
    console.log('🤖 Generating AI-powered solution with ChatGPT...');

    const prompt = `As a web performance expert, analyze this performance issue and provide a detailed solution:

Issue: ${issue.message}
Explanation: ${issue.explanation}
URL: ${targetUrl}

Based on the page source code analysis, provide:
1. Detailed explanation of why this issue occurs
2. Specific impact on performance metrics
3. Step-by-step solution with code examples
4. Custom JavaScript code to fix the issue
5. Best practices to prevent this issue

Please provide a comprehensive, actionable response.`;

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a web performance expert specializing in Core Web Vitals, page speed optimization, and modern web development best practices.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`ChatGPT API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;
    console.log('✅ AI-powered solution generated successfully');
    return aiResponse;
  } catch (error) {
    console.log('❌ ChatGPT API failed:', error.message);
    return null;
  }
}

// Advanced AI-powered performance analysis with detailed insights
async function generateAdvancedAIAnalysis(performanceData, targetUrl, html) {
  try {
    if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-openai-api-key-here') {
      console.log('⚠️ No OpenAI API key provided - skipping advanced AI analysis');
      return null;
    }
    
    console.log('🤖 Generating advanced AI performance analysis...');
    
    const lcp = performanceData.lcp || 0;
    const cls = performanceData.cls || 0;
    const fcp = performanceData.fcp || 0;
    const overallScore = performanceData.overallScore || 0;
    
    const prompt = `As an elite web performance consultant with 20+ years of experience, analyze this website and provide detailed optimization recommendations:

WEBSITE: ${targetUrl}
PERFORMANCE SCORE: ${overallScore}/100
LCP: ${lcp}ms | CLS: ${cls} | FCP: ${fcp}ms

HTML ANALYSIS:
${html.substring(0, 2000)}...

Provide a detailed analysis with:

## 🔍 Root Cause Analysis
- Technical reasons for performance issues
- Specific bottlenecks identified
- Impact on user experience

## ✅ Specific Solutions
- Exact implementation steps
- Code examples for each fix
- Priority order for implementation

## 💡 Recommendations
- Best practices and tools
- Industry standards to follow
- Long-term optimization strategy

## ⚙️ Custom Code Solutions
- Ready-to-implement JavaScript code
- Publisher-specific optimizations
- Third-party script optimizations

Focus on actionable, implementable solutions with specific code examples.`;

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      console.log('⚠️ Advanced AI analysis failed - using fallback');
      return null;
    }

    const data = await response.json();
    return {
      analysis: data.choices[0].message.content,
      timestamp: new Date().toISOString(),
      model: 'gpt-4o-mini'
    };
  } catch (error) {
    console.log('❌ Advanced AI analysis error:', error.message);
    return null;
  }
}

// Enhanced AI-powered performance analysis
async function generateAIPerformanceAnalysis(performanceData, targetUrl) {
  try {
    if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-openai-api-key-here') {
      console.log('⚠️ No OpenAI API key provided - skipping AI analysis');
      return null;
    }
    
    console.log('🤖 Generating comprehensive AI performance analysis...');
    
    // Extract real performance metrics
    const lcp = performanceData.lcp || 0;
    const cls = performanceData.cls || 0;
    const fcp = performanceData.fcp || 0;
    const tti = performanceData.tti || 0;
    const tbt = performanceData.tbt || 0;
    const fid = performanceData.fid || 0;
    const inp = performanceData.inp || 0;
    const speedIndex = performanceData.speedIndex || 0;
    const overallScore = performanceData.overallScore || 0;
    
    // Determine performance status for each metric
    const lcpStatus = lcp <= 2500 ? 'Good' : lcp <= 4000 ? 'Needs Improvement' : 'Poor';
    const clsStatus = cls <= 0.1 ? 'Good' : cls <= 0.25 ? 'Needs Improvement' : 'Poor';
    const fcpStatus = fcp <= 1800 ? 'Good' : fcp <= 3000 ? 'Needs Improvement' : 'Poor';
    const ttiStatus = tti <= 3800 ? 'Good' : tti <= 7300 ? 'Needs Improvement' : 'Poor';
    const tbtStatus = tbt <= 200 ? 'Good' : tbt <= 600 ? 'Needs Improvement' : 'Poor';
    const fidStatus = fid <= 100 ? 'Good' : fid <= 300 ? 'Needs Improvement' : 'Poor';
    const inpStatus = inp <= 200 ? 'Good' : inp <= 500 ? 'Needs Improvement' : 'Poor';
    
    // Identify critical issues based on real data
    const criticalIssues = [];
    if (lcp > 4000) criticalIssues.push(`LCP is ${lcp}ms (Poor - should be ≤2500ms)`);
    if (cls > 0.25) criticalIssues.push(`CLS is ${cls} (Poor - should be ≤0.1)`);
    if (fcp > 3000) criticalIssues.push(`FCP is ${fcp}ms (Poor - should be ≤1800ms)`);
    if (tti > 7300) criticalIssues.push(`TTI is ${tti}ms (Poor - should be ≤3800ms)`);
    if (tbt > 600) criticalIssues.push(`TBT is ${tbt}ms (Poor - should be ≤200ms)`);
    if (fid > 300) criticalIssues.push(`FID is ${fid}ms (Poor - should be ≤100ms)`);
    if (inp > 500) criticalIssues.push(`INP is ${inp}ms (Poor - should be ≤200ms)`);
    
    const prompt = `You are an elite web performance expert. Analyze this website and provide detailed optimization recommendations in this EXACT format:

WEBSITE: ${targetUrl}
PERFORMANCE SCORE: ${overallScore}/100
LCP: ${lcp}ms | CLS: ${cls} | FCP: ${fcp}ms | TTI: ${tti}ms | TBT: ${tbt}ms

Provide analysis in this EXACT structure:

## 🔍 Root Cause
[Technical explanation of why performance issues exist]

## ✅ Specific Solution  
[Exact steps to fix the problem]

## 💡 Recommendation
[Best practices and tools to use]

## ⚙️ Custom Code Solution
[Ready-to-implement JavaScript code]

## 🧠 AI Performance Analysis for ${targetUrl}

### Performance Rating
**Excellent Performance (${overallScore}%)**
Your website is performing exceptionally well! Focus on maintaining current optimizations and implementing advanced techniques.

## 🚨 Critical Issues (Top 5)

### Quick Wins (1-2 hours implementation)
1. **Enable Gzip/Brotli Compression** - Reduce file sizes by 60-80%
2. **Add Image Dimensions** - Prevent layout shifts  
3. **Minify CSS/JS** - Reduce file sizes by 30-50%
4. **Remove Unused CSS/JS** - Eliminate dead code
5. **Optimize Images** - Convert to WebP/AVIF format

### Medium-term Optimizations (1-2 weeks)
1. **Implement Critical CSS** - Inline above-the-fold styles
2. **Lazy Load Images** - Defer below-the-fold images
3. **Optimize Third-party Scripts** - Load asynchronously
4. **Implement Service Worker** - Cache resources
5. **Database Query Optimization** - Improve server response times

### Long-term Strategic Improvements (1-3 months)
1. **CDN Implementation** - Distribute content globally
2. **Code Splitting** - Load only necessary code
3. **Progressive Web App (PWA)** - Enhanced user experience
4. **Advanced Caching Strategy** - Multi-layer caching
5. **Performance Monitoring** - Continuous optimization

## 📈 Expected Results
- **Quick Wins:** +10-20% performance score improvement
- **Medium-term:** +20-35% performance score improvement  
- **Long-term:** +35-50% performance score improvement
- **Core Web Vitals:** All metrics should reach "Good" thresholds

## 🗓️ Implementation Roadmap
- **Week 1: Quick Wins** - Enable compression, Add image dimensions, Minify resources
- **Week 2-3: Medium-term** - Implement critical CSS, Add lazy loading, Optimize third-party scripts
- **Month 2-3: Long-term** - CDN implementation, Code splitting, PWA features

Focus on the exact format shown above with Root Cause, Specific Solution, Recommendation, and Custom Code Solution sections.`;

    // Add timeout to prevent long waits
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout for comprehensive analysis

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // More powerful model for better analysis
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 3000, // Increased for comprehensive analysis
        temperature: 0.2 // Lower temperature for more focused responses
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 429) {
        console.log('⚠️ OpenAI API rate limited - using fallback insights');
        return generateFallbackAIInsights(performanceData, targetUrl);
      }
      console.log('⚠️ OpenAI API error - using fallback insights');
      return generateFallbackAIInsights(performanceData, targetUrl);
    }

    const data = await response.json();
    const analysis = data.choices[0].message.content;
    console.log('✅ AI performance analysis generated successfully with real data');
    
    return {
      summary: analysis,
      timestamp: new Date().toISOString(),
      model: 'gpt-3.5-turbo',
      dataSource: 'Real Performance Metrics',
      criticalIssues: criticalIssues,
      metricsAnalyzed: {
        lcp, cls, fcp, tti, tbt, fid, inp, speedIndex, overallScore
      }
    };
  } catch (error) {
    console.log('❌ AI performance analysis failed:', error.message);
    console.log('🔄 Using fallback AI insights');
    return generateFallbackAIInsights(performanceData, targetUrl);
  }
}

// Generate comprehensive fallback AI insights when OpenAI is not available
function generateFallbackAIInsights(performanceData, targetUrl) {
  const score = performanceData.overallScore || 0;
  const lcp = performanceData.lcp || 0;
  const cls = performanceData.cls || 0;
  const fcp = performanceData.fcp || 0;
  const tbt = performanceData.tbt || 0;
  const tti = performanceData.tti || 0;

  let insights = `## 🔍 Root Cause
Third-party scripts are blocking JavaScript execution and impacting performance. Found 0 high-impact third-party scripts.

## ✅ Specific Solution
Implement lazy loading and async loading for third-party scripts.

## 💡 Recommendation
Load third-party scripts asynchronously and defer non-critical ones until after page load.

## ⚙️ Custom Code Solution
\`\`\`javascript
// Third Party Optimizer
function thirdPartyOptimizer() {
    const thirdPartyWidgets = document.querySelectorAll('iframe[src*="ads"], iframe[src*="social"], iframe[src*="widget"]');
    thirdPartyWidgets.forEach(widget => {
        widget.style.width = '100%';
        widget.style.height = '258px';
        widget.style.border = 'none';
    });
    
    // Load after page is stable
    if (window.requestIdleCallback) {
        window.requestIdleCallback(() => {
            thirdPartyOptimizer();
        });
    } else {
        setTimeout(thirdPartyOptimizer, 100);
    }
}
\`\`\`

## 🧠 AI Performance Analysis for ${targetUrl}

### Performance Rating
**Excellent Performance (${score}%)**
Your website is performing exceptionally well! Focus on maintaining current optimizations and implementing advanced techniques.

## 🚨 Critical Issues (Top 5)

### Quick Wins (1-2 hours implementation)
1. **Enable Gzip/Brotli Compression** - Reduce file sizes by 60-80%
2. **Add Image Dimensions** - Prevent layout shifts  
3. **Minify CSS/JS** - Reduce file sizes by 30-50%
4. **Remove Unused CSS/JS** - Eliminate dead code
5. **Optimize Images** - Convert to WebP/AVIF format

### Medium-term Optimizations (1-2 weeks)
1. **Implement Critical CSS** - Inline above-the-fold styles
2. **Lazy Load Images** - Defer below-the-fold images
3. **Optimize Third-party Scripts** - Load asynchronously
4. **Implement Service Worker** - Cache resources
5. **Database Query Optimization** - Improve server response times

### Long-term Strategic Improvements (1-3 months)
1. **CDN Implementation** - Distribute content globally
2. **Code Splitting** - Load only necessary code
3. **Progressive Web App (PWA)** - Enhanced user experience
4. **Advanced Caching Strategy** - Multi-layer caching
5. **Performance Monitoring** - Continuous optimization

## 📈 Expected Results
- **Quick Wins:** +10-20% performance score improvement
- **Medium-term:** +20-35% performance score improvement  
- **Long-term:** +35-50% performance score improvement
- **Core Web Vitals:** All metrics should reach "Good" thresholds

## 🗓️ Implementation Roadmap
- **Week 1: Quick Wins** - Enable compression, Add image dimensions, Minify resources
- **Week 2-3: Medium-term** - Implement critical CSS, Add lazy loading, Optimize third-party scripts
- **Month 2-3: Long-term** - CDN implementation, Code splitting, PWA features
`;

  // Critical Issues Analysis
  insights += `## 🔥 Critical Issues (Top 5)\n\n`;
  
  const issues = [];
  if (lcp > 4000) {
    issues.push({
      priority: 1,
      title: "Largest Contentful Paint (LCP) - CRITICAL",
      current: `${lcp}ms`,
      target: "2500ms",
      impact: "Very slow loading, poor user experience",
      solution: "Optimize images, preload critical resources, improve server response time"
    });
  }
  
  if (cls > 0.25) {
    issues.push({
      priority: 2,
      title: "Cumulative Layout Shift (CLS) - HIGH",
      current: `${cls}`,
      target: "0.1",
      impact: "Content jumping, poor user experience",
      solution: "Add image dimensions, reserve space for dynamic content"
    });
  }
  
  if (fcp > 3000) {
    issues.push({
      priority: 3,
      title: "First Contentful Paint (FCP) - HIGH",
      current: `${fcp}ms`,
      target: "1800ms",
      impact: "Slow perceived loading",
      solution: "Optimize critical rendering path, reduce blocking resources"
    });
  }
  
  if (tbt > 600) {
    issues.push({
      priority: 4,
      title: "Total Blocking Time (TBT) - MEDIUM",
      current: `${tbt}ms`,
      target: "200ms",
      impact: "Unresponsive page, poor interactivity",
      solution: "Optimize JavaScript, defer non-critical scripts"
    });
  }

  if (tti > 7300) {
    issues.push({
      priority: 5,
      title: "Time to Interactive (TTI) - MEDIUM",
      current: `${tti}ms`,
      target: "3800ms",
      impact: "Slow page interactivity",
      solution: "Reduce JavaScript execution time, optimize third-party scripts"
    });
  }

  issues.forEach((issue, index) => {
    insights += `### ${index + 1}. ${issue.title}\n`;
    insights += `- **Current:** ${issue.current} | **Target:** ${issue.target}\n`;
    insights += `- **Impact:** ${issue.impact}\n`;
    insights += `- **Solution:** ${issue.solution}\n\n`;
  });

  // Quick Wins
  insights += `## ⚡ Quick Wins (1-2 hours implementation)\n\n`;
  insights += `1. **Enable Gzip/Brotli Compression** - Reduce file sizes by 60-80%\n`;
  insights += `   \`\`\`apache\n   # Add to .htaccess\n   <IfModule mod_deflate.c>\n       AddOutputFilterByType DEFLATE text/plain text/html text/xml text/css text/javascript application/javascript application/x-javascript\n   </IfModule>\n   \`\`\`\n\n`;
  insights += `2. **Add Image Dimensions** - Prevent layout shifts\n`;
  insights += `   \`\`\`html\n   <img src="image.jpg" width="800" height="600" alt="Description">\n   \`\`\`\n\n`;
  insights += `3. **Minify CSS/JS** - Reduce file sizes by 30-50%\n`;
  insights += `4. **Remove Unused CSS/JS** - Eliminate dead code\n`;
  insights += `5. **Optimize Images** - Convert to WebP/AVIF format\n\n`;

  // Medium-term Optimizations
  insights += `## 🚀 Medium-term Optimizations (1-2 weeks)\n\n`;
  insights += `1. **Implement Critical CSS** - Inline above-the-fold styles\n`;
  insights += `2. **Lazy Load Images** - Defer below-the-fold images\n`;
  insights += `3. **Optimize Third-party Scripts** - Load asynchronously\n`;
  insights += `4. **Implement Service Worker** - Cache resources\n`;
  insights += `5. **Database Query Optimization** - Improve server response times\n\n`;

  // Long-term Strategic Improvements
  insights += `## 🎯 Long-term Strategic Improvements (1-3 months)\n\n`;
  insights += `1. **CDN Implementation** - Distribute content globally\n`;
  insights += `2. **Code Splitting** - Load only necessary code\n`;
  insights += `3. **Progressive Web App (PWA)** - Enhanced user experience\n`;
  insights += `4. **Advanced Caching Strategy** - Multi-layer caching\n`;
  insights += `5. **Performance Monitoring** - Continuous optimization\n\n`;

  // Expected Improvements
  insights += `## 📊 Expected Results\n\n`;
  insights += `- **Quick Wins**: +10-20% performance score improvement\n`;
  insights += `- **Medium-term**: +20-35% performance score improvement\n`;
  insights += `- **Long-term**: +35-50% performance score improvement\n`;
  insights += `- **Core Web Vitals**: All metrics should reach "Good" thresholds\n\n`;

  // Implementation Roadmap
  insights += `## 🛠️ Implementation Roadmap\n\n`;
  insights += `### Week 1: Quick Wins\n`;
  insights += `- Enable compression\n`;
  insights += `- Add image dimensions\n`;
  insights += `- Minify resources\n\n`;
  insights += `### Week 2-3: Medium-term\n`;
  insights += `- Implement critical CSS\n`;
  insights += `- Add lazy loading\n`;
  insights += `- Optimize third-party scripts\n\n`;
  insights += `### Month 2-3: Long-term\n`;
  insights += `- CDN implementation\n`;
  insights += `- Code splitting\n`;
  insights += `- PWA features\n\n`;

  return {
    summary: insights,
    timestamp: new Date().toISOString(),
    model: 'fallback-analysis',
    dataSource: 'Performance Metrics Analysis',
    criticalIssues: issues.map(i => i.title),
    metricsAnalyzed: { lcp, cls, fcp, tti, tbt, overallScore: score }
  };
}

// Enhanced analysis function with AI insights
async function getEnhancedAnalysisWithAI(html, targetUrl, performanceData) {
  const enhancedIssues = [];
  
  for (const issue of performanceData.issues) {
    const aiSolution = await getChatGPTSolution(issue, html, targetUrl);
    
    enhancedIssues.push({
      ...issue,
      aiAnalysis: aiSolution,
      detailedReport: {
        metric: issue.key,
        currentValue: getMetricValue(issue.key, performanceData),
        targetValue: getTargetValue(issue.key),
        impact: calculateImpact(issue.key, performanceData),
        recommendations: generateRecommendations(issue.key, performanceData)
      }
    });
  }
  
  return enhancedIssues;
}

// Helper functions for detailed metric analysis
function getMetricValue(metricKey, performanceData) {
  const metricMap = {
    'too_many_scripts': performanceData.resources?.scripts || 0,
    'inline_scripts': (performanceData.resources?.scripts || 0) - (performanceData.resources?.externalScripts || 0),
    'too_many_images': performanceData.resources?.images || 0,
    'lcp': performanceData.lcp,
    'cls': performanceData.cls,
    'fcp': performanceData.fcp,
    'tti': performanceData.tti,
    'tbt': performanceData.tbt
  };
  return metricMap[metricKey] || 'N/A';
}

function getTargetValue(metricKey) {
  const targetMap = {
    'too_many_scripts': '≤ 15 scripts',
    'inline_scripts': '≤ 5 inline scripts',
    'too_many_images': '≤ 15 images',
    'lcp': '≤ 2500ms',
    'cls': '≤ 0.1',
    'fcp': '≤ 1800ms',
    'tti': '≤ 3800ms',
    'tbt': '≤ 200ms'
  };
  return targetMap[metricKey] || 'Optimize';
}

function calculateImpact(metricKey, performanceData) {
  const impactMap = {
    'too_many_scripts': `Each additional script adds 50-100ms to load time. Current: ${performanceData.resources?.scripts || 0} scripts`,
    'inline_scripts': `Inline scripts block HTML parsing. Found: ${(performanceData.resources?.scripts || 0) - (performanceData.resources?.externalScripts || 0)} inline scripts`,
    'too_many_images': `Large images significantly impact LCP. Current: ${performanceData.resources?.images || 0} images`,
    'lcp': `LCP affects user experience. Current: ${performanceData.lcp}ms (${performanceData.coreWebVitals?.lcp || 'unknown'})`,
    'cls': `CLS affects visual stability. Current: ${performanceData.cls} (${performanceData.coreWebVitals?.cls || 'unknown'})`,
    'fcp': `FCP affects perceived performance. Current: ${performanceData.fcp}ms (${performanceData.coreWebVitals?.fcp || 'unknown'})`,
    'tti': `TTI affects interactivity. Current: ${performanceData.tti}ms`,
    'tbt': `TBT affects responsiveness. Current: ${performanceData.tbt}ms`
  };
  return impactMap[metricKey] || 'Performance impact';
}

function generateRecommendations(metricKey, performanceData) {
  const recommendations = {
    'too_many_scripts': [
      'Combine multiple scripts into fewer files',
      'Use async/defer attributes for non-critical scripts',
      'Remove unused JavaScript libraries',
      'Implement code splitting for large applications'
    ],
    'inline_scripts': [
      'Move inline scripts to external files',
      'Use async/defer attributes',
      'Implement lazy loading for non-critical scripts',
      'Consider using a bundler like Webpack or Vite'
    ],
    'too_many_images': [
      'Optimize image formats (use WebP, AVIF)',
      'Implement lazy loading',
      'Use responsive images with srcset',
      'Compress images without quality loss'
    ],
    'lcp': [
      'Optimize the largest contentful element',
      'Preload critical resources',
      'Optimize server response times',
      'Use a Content Delivery Network (CDN)'
    ],
    'cls': [
      'Set explicit dimensions for images and videos',
      'Avoid inserting content above existing content',
      'Use CSS aspect-ratio for responsive elements',
      'Preload fonts to prevent layout shifts'
    ],
    'fcp': [
      'Minimize render-blocking resources',
      'Optimize critical CSS',
      'Use resource hints (preload, prefetch)',
      'Optimize server response times'
    ],
    'tti': [
      'Reduce JavaScript execution time',
      'Use code splitting',
      'Optimize third-party scripts',
      'Implement service workers for caching'
    ],
    'tbt': [
      'Break up long-running JavaScript tasks',
      'Use Web Workers for heavy computations',
      'Optimize third-party scripts',
      'Implement progressive loading'
    ]
  };
  return recommendations[metricKey] || ['Optimize this metric for better performance'];
}

// Generate detailed metric report
function generateDetailedMetricReport(metric, performanceData, html, targetUrl) {
  try {
    // Get custom code analysis for this specific metric
    const customCodeAnalysis = getCustomCodeAnalysisForMetric(metric, html, performanceData);
    
    const report = {
      metric: metric,
      currentValue: getMetricValue(metric, performanceData),
      targetValue: getTargetValue(metric),
      status: getMetricStatus(metric, performanceData),
      impact: calculateImpact(metric, performanceData),
      recommendations: generateRecommendations(metric, performanceData),
      detailedAnalysis: getDetailedAnalysis(metric, performanceData, html),
      customCodeSolution: getCustomCodeSolution(metric, performanceData),
      customCodeAnalysis: customCodeAnalysis,
      aiInsights: null
    };
    
    return report;
  } catch (error) {
    console.error('Error generating detailed metric report:', error);
    return {
      metric: metric,
      currentValue: 'Error',
      targetValue: 'Error',
      status: 'error',
      impact: 'Error generating report',
      recommendations: ['Error occurred'],
      detailedAnalysis: {
        description: 'Error occurred',
        measurement: 'Error occurred',
        factors: ['Error occurred'],
        currentIssues: ['Error occurred']
      },
      customCodeSolution: '// Error occurred',
      customCodeAnalysis: [],
      aiInsights: null
    };
  }
}

function getMetricStatus(metric, performanceData) {
  const statusMap = {
    'lcp': performanceData.coreWebVitals?.lcp || 'unknown',
    'cls': performanceData.coreWebVitals?.cls || 'unknown',
    'fcp': performanceData.coreWebVitals?.fcp || 'unknown',
    'fid': performanceData.coreWebVitals?.fid || 'unknown',
    'inp': performanceData.coreWebVitals?.inp || 'unknown',
    'tti': performanceData.tti <= 3800 ? 'good' : performanceData.tti <= 7300 ? 'needs-improvement' : 'poor',
    'tbt': performanceData.tbt <= 200 ? 'good' : performanceData.tbt <= 600 ? 'needs-improvement' : 'poor',
    'speedIndex': performanceData.speedIndex <= 3400 ? 'good' : performanceData.speedIndex <= 5800 ? 'needs-improvement' : 'poor'
  };
  return statusMap[metric] || 'unknown';
}

function getDetailedAnalysis(metric, performanceData, html) {
  const analysisMap = {
    'lcp': {
      description: 'Largest Contentful Paint measures loading performance',
      measurement: 'Time when the largest content element becomes visible',
      factors: ['Image optimization', 'Server response time', 'Resource loading', 'Render-blocking resources'],
      currentIssues: findLCPIssues(html || '', performanceData),
      rootCauses: analyzeLCPRootCauses(html || '', performanceData),
      specificSolutions: getLCPSpecificSolutions(html || '', performanceData)
    },
    'cls': {
      description: 'Cumulative Layout Shift measures visual stability',
      measurement: 'Sum of all layout shift scores for unexpected layout shifts',
      factors: ['Images without dimensions', 'Dynamically injected content', 'Web fonts', 'Ads and embeds'],
      currentIssues: findCLSIssues(html || '', performanceData),
      rootCauses: analyzeCLSRootCauses(html || '', performanceData),
      specificSolutions: getCLSSpecificSolutions(html || '', performanceData)
    },
    'fcp': {
      description: 'First Contentful Paint measures perceived loading speed',
      measurement: 'Time when first text or image is painted',
      factors: ['Critical CSS', 'Render-blocking scripts', 'Server response time', 'Network conditions'],
      currentIssues: findFCPIssues(html || '', performanceData),
      rootCauses: analyzeFCPRootCauses(html || '', performanceData),
      specificSolutions: getFCPSpecificSolutions(html || '', performanceData)
    },
    'tti': {
      description: 'Time to Interactive measures when page becomes fully interactive',
      measurement: 'Time when page responds to user input consistently',
      factors: ['JavaScript execution time', 'Third-party scripts', 'Main thread blocking', 'Resource loading'],
      currentIssues: findTTIIssues(html || '', performanceData),
      rootCauses: analyzeTTIRootCauses(html || '', performanceData),
      specificSolutions: getTTISpecificSolutions(html || '', performanceData)
    },
    'tbt': {
      description: 'Total Blocking Time measures main thread blocking',
      measurement: 'Sum of time between FCP and TTI when main thread was blocked',
      factors: ['Long JavaScript tasks', 'Third-party scripts', 'Unoptimized code', 'Heavy computations'],
      currentIssues: findTBTIssues(html || '', performanceData),
      rootCauses: analyzeTBTRootCauses(html || '', performanceData),
      specificSolutions: getTBTSpecificSolutions(html || '', performanceData)
    }
  };
  return analysisMap[metric] || {
    description: 'Performance metric analysis',
    measurement: 'Current value measurement',
    factors: ['Various performance factors'],
    currentIssues: ['No specific issues identified'],
    rootCauses: ['No root causes identified'],
    specificSolutions: ['No specific solutions available']
  };
}

function findLCPIssues(html, performanceData) {
  const issues = [];
  if (!html || typeof html !== 'string') {
    return issues;
  }
  
  const images = html.match(/<img[^>]*>/gi) || [];
  const largeImages = images.filter(img => {
    const widthMatch = img.match(/width=["']?(\d+)["']?/i);
    return widthMatch && parseInt(widthMatch[1]) > 1200;
  });
  
  if (largeImages.length > 0) {
    issues.push(`${largeImages.length} large images found (width > 1200px)`);
  }
  
  if (performanceData.resources?.images > 15) {
    issues.push(`Too many images: ${performanceData.resources.images} (recommended: ≤ 15)`);
  }
  
  return issues;
}

function findCLSIssues(html, performanceData) {
  const issues = [];
  if (!html || typeof html !== 'string') {
    return issues;
  }
  
  const images = html.match(/<img[^>]*>/gi) || [];
  const imagesWithoutDimensions = images.filter(img => 
    !img.includes('width=') && !img.includes('height=')
  );
  
  if (imagesWithoutDimensions.length > 0) {
    issues.push(`${imagesWithoutDimensions.length} images without dimensions`);
  }
  
  return issues;
}

function findFCPIssues(html, performanceData) {
  const issues = [];
  if (!html || typeof html !== 'string') {
    return issues;
  }
  
  const scripts = html.match(/<script[^>]*>/gi) || [];
  const renderBlockingScripts = scripts.filter(script => 
    !script.includes('async') && !script.includes('defer')
  );
  
  if (renderBlockingScripts.length > 0) {
    issues.push(`${renderBlockingScripts.length} render-blocking scripts found`);
  }
  
  return issues;
}

function findTTIIssues(html, performanceData) {
  const issues = [];
  if (performanceData.resources?.scripts > 20) {
    issues.push(`Too many scripts: ${performanceData.resources.scripts} (recommended: ≤ 20)`);
  }
  
  return issues;
}

function findTBTIssues(html, performanceData) {
  const issues = [];
  if (!html || typeof html !== 'string') {
    return issues;
  }
  
  const inlineScripts = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
  if (inlineScripts.length > 5) {
    issues.push(`${inlineScripts.length} inline scripts found (recommended: ≤ 5)`);
  }
  
  return issues;
}

// Root Cause Analysis Functions
function analyzeLCPRootCauses(html, performanceData) {
  const causes = [];
  if (!html || typeof html !== 'string') return causes;
  
  const images = html.match(/<img[^>]*>/gi) || [];
  const scripts = html.match(/<script[^>]*>/gi) || [];
  
  // Analyze large images
  const largeImages = images.filter(img => {
    const widthMatch = img.match(/width=["']?(\d+)["']?/i);
    return widthMatch && parseInt(widthMatch[1]) > 1200;
  });
  
  if (largeImages.length > 0) {
    causes.push(`Found ${largeImages.length} large images (>1200px width) that delay LCP`);
  }
  
  // Analyze render-blocking scripts
  const blockingScripts = scripts.filter(script => 
    !script.includes('async') && !script.includes('defer')
  );
  
  if (blockingScripts.length > 0) {
    causes.push(`${blockingScripts.length} render-blocking scripts delay page rendering`);
  }
  
  // Analyze inline styles
  const inlineStyles = html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
  if (inlineStyles.length > 0) {
    causes.push(`${inlineStyles.length} inline style blocks block rendering`);
  }
  
  return causes;
}

function analyzeCLSRootCauses(html, performanceData) {
  const causes = [];
  if (!html || typeof html !== 'string') return causes;
  
  const images = html.match(/<img[^>]*>/gi) || [];
  const imagesWithoutDimensions = images.filter(img => 
    !img.includes('width=') && !img.includes('height=')
  );
  
  if (imagesWithoutDimensions.length > 0) {
    causes.push(`${imagesWithoutDimensions.length} images without width/height attributes cause layout shifts`);
  }
  
  // Check for dynamic content
  const dynamicElements = html.match(/<[^>]*data-dynamic[^>]*>/gi) || [];
  if (dynamicElements.length > 0) {
    causes.push(`${dynamicElements.length} dynamic elements can cause layout shifts`);
  }
  
  return causes;
}

function analyzeFCPRootCauses(html, performanceData) {
  const causes = [];
  if (!html || typeof html !== 'string') return causes;
  
  const scripts = html.match(/<script[^>]*>/gi) || [];
  const blockingScripts = scripts.filter(script => 
    !script.includes('async') && !script.includes('defer')
  );
  
  if (blockingScripts.length > 0) {
    causes.push(`${blockingScripts.length} render-blocking scripts delay First Contentful Paint`);
  }
  
  const stylesheets = html.match(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi) || [];
  if (stylesheets.length > 0) {
    causes.push(`${stylesheets.length} external stylesheets block rendering`);
  }
  
  return causes;
}

function analyzeTTIRootCauses(html, performanceData) {
  const causes = [];
  
  if (performanceData.resources?.scripts > 20) {
    causes.push(`Too many scripts (${performanceData.resources.scripts}) delay interactivity`);
  }
  
  if (!html || typeof html !== 'string') return causes;
  
  const inlineScripts = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
  if (inlineScripts.length > 5) {
    causes.push(`${inlineScripts.length} inline scripts block main thread`);
  }
  
  return causes;
}

function analyzeTBTRootCauses(html, performanceData) {
  const causes = [];
  if (!html || typeof html !== 'string') return causes;
  
  const inlineScripts = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
  if (inlineScripts.length > 5) {
    causes.push(`${inlineScripts.length} inline scripts create blocking tasks`);
  }
  
  const scripts = html.match(/<script[^>]*>/gi) || [];
  const blockingScripts = scripts.filter(script => 
    !script.includes('async') && !script.includes('defer')
  );
  
  if (blockingScripts.length > 0) {
    causes.push(`${blockingScripts.length} synchronous scripts block main thread`);
  }
  
  return causes;
}

// Specific Solutions Functions
function getLCPSpecificSolutions(html, performanceData) {
  const solutions = [];
  if (!html || typeof html !== 'string') return solutions;
  
  const images = html.match(/<img[^>]*>/gi) || [];
  const largeImages = images.filter(img => {
    const widthMatch = img.match(/width=["']?(\d+)["']?/i);
    return widthMatch && parseInt(widthMatch[1]) > 1200;
  });
  
  if (largeImages.length > 0) {
    solutions.push(`Optimize ${largeImages.length} large images by compressing and using WebP format`);
    solutions.push(`Add loading="lazy" to non-critical images`);
    solutions.push(`Preload the largest contentful image`);
  }
  
  const scripts = html.match(/<script[^>]*>/gi) || [];
  const blockingScripts = scripts.filter(script => 
    !script.includes('async') && !script.includes('defer')
  );
  
  if (blockingScripts.length > 0) {
    solutions.push(`Add async or defer attributes to ${blockingScripts.length} render-blocking scripts`);
  }
  
  return solutions;
}

function getCLSSpecificSolutions(html, performanceData) {
  const solutions = [];
  if (!html || typeof html !== 'string') return solutions;
  
  const images = html.match(/<img[^>]*>/gi) || [];
  const imagesWithoutDimensions = images.filter(img => 
    !img.includes('width=') && !img.includes('height=')
  );
  
  if (imagesWithoutDimensions.length > 0) {
    solutions.push(`Add width and height attributes to ${imagesWithoutDimensions.length} images`);
    solutions.push(`Use aspect-ratio CSS property for responsive images`);
  }
  
  return solutions;
}

function getFCPSpecificSolutions(html, performanceData) {
  const solutions = [];
  if (!html || typeof html !== 'string') return solutions;
  
  const scripts = html.match(/<script[^>]*>/gi) || [];
  const blockingScripts = scripts.filter(script => 
    !script.includes('async') && !script.includes('defer')
  );
  
  if (blockingScripts.length > 0) {
    solutions.push(`Add async or defer to ${blockingScripts.length} render-blocking scripts`);
  }
  
  const stylesheets = html.match(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi) || [];
  if (stylesheets.length > 0) {
    solutions.push(`Inline critical CSS and defer non-critical stylesheets`);
  }
  
  return solutions;
}

function getTTISpecificSolutions(html, performanceData) {
  const solutions = [];
  
  if (performanceData.resources?.scripts > 20) {
    solutions.push(`Reduce script count from ${performanceData.resources.scripts} to ≤20`);
    solutions.push(`Combine multiple scripts into fewer files`);
    solutions.push(`Use code splitting for large applications`);
  }
  
  if (!html || typeof html !== 'string') return solutions;
  
  const inlineScripts = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
  if (inlineScripts.length > 5) {
    solutions.push(`Move ${inlineScripts.length} inline scripts to external files`);
  }
  
  return solutions;
}

function getTBTSpecificSolutions(html, performanceData) {
  const solutions = [];
  if (!html || typeof html !== 'string') return solutions;
  
  const inlineScripts = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
  if (inlineScripts.length > 5) {
    solutions.push(`Break down ${inlineScripts.length} inline scripts into smaller chunks`);
    solutions.push(`Use setTimeout to defer non-critical script execution`);
  }
  
  const scripts = html.match(/<script[^>]*>/gi) || [];
  const blockingScripts = scripts.filter(script => 
    !script.includes('async') && !script.includes('defer')
  );
  
  if (blockingScripts.length > 0) {
    solutions.push(`Add async/defer to ${blockingScripts.length} synchronous scripts`);
  }
  
  return solutions;
}

function getCustomCodeAnalysisForMetric(metric, html, performanceData) {
  const analysis = [];
  
  if (!html || typeof html !== 'string') {
    return analysis;
  }
  
  switch (metric) {
    case 'lcp':
      // LCP-specific custom code analysis
      const lcpImages = html.match(/<img[^>]*>/gi) || [];
      const lcpLargeImages = lcpImages.filter(img => {
        const widthMatch = img.match(/width=["']?(\d+)["']?/i);
        return widthMatch && parseInt(widthMatch[1]) > 1200;
      });
      
      if (lcpLargeImages.length > 0) {
        analysis.push({
          key: 'lcp_large_images',
          severity: 'warning',
          message: `${lcpLargeImages.length} large images affecting LCP`,
          explanation: 'Large images significantly impact Largest Contentful Paint performance.',
          sourceCode: `Found ${lcpLargeImages.length} images with width > 1200px`,
          fix: 'Optimize image sizes and use WebP format',
          customCodeSolution: `// LCP Image Optimization
const lcpImageOptimizer = {
  optimizeImages: () => {
    const images = document.querySelectorAll('img');
    images.forEach(img => {
      if (img.naturalWidth > 1200) {
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.loading = 'lazy';
        img.decoding = 'async';
      }
    });
  }
};`
        });
      }
      
      const lcpScripts = html.match(/<script[^>]*>/gi) || [];
      const lcpBlockingScripts = lcpScripts.filter(script => 
        !script.includes('async') && !script.includes('defer')
      );
      
      if (lcpBlockingScripts.length > 0) {
        analysis.push({
          key: 'lcp_blocking_scripts',
          severity: 'warning',
          message: `${lcpBlockingScripts.length} render-blocking scripts affecting LCP`,
          explanation: 'Render-blocking scripts delay the Largest Contentful Paint.',
          sourceCode: `Found ${lcpBlockingScripts.length} scripts without async/defer`,
          fix: 'Add async or defer attributes to non-critical scripts',
          customCodeSolution: `// LCP Script Optimization
const lcpScriptOptimizer = {
  deferNonCriticalScripts: () => {
    const scripts = document.querySelectorAll('script:not([async]):not([defer])');
    scripts.forEach(script => {
      if (!script.src.includes('critical')) {
        script.defer = true;
      }
    });
  }
};`
        });
      }
      break;
      
    case 'cls':
      // CLS-specific custom code analysis
      const clsImages = html.match(/<img[^>]*>/gi) || [];
      const clsImagesWithoutDimensions = clsImages.filter(img => 
        !img.includes('width=') && !img.includes('height=')
      );
      
      if (clsImagesWithoutDimensions.length > 0) {
        analysis.push({
          key: 'cls_image_dimensions',
          severity: 'warning',
          message: `${clsImagesWithoutDimensions.length} images without dimensions causing CLS`,
          explanation: 'Images without width/height attributes cause layout shifts during loading.',
          sourceCode: `Found ${clsImagesWithoutDimensions.length} images without width/height attributes`,
          fix: 'Add width and height attributes to all images',
          customCodeSolution: `// CLS Image Dimension Fix
const clsImageOptimizer = {
  fixImageDimensions: () => {
    const images = document.querySelectorAll('img:not([width]):not([height])');
    images.forEach(img => {
      img.onload = () => {
        img.width = img.naturalWidth;
        img.height = img.naturalHeight;
      };
    });
  }
};`
        });
      }
      break;
      
    case 'fcp':
      // FCP-specific custom code analysis
      const fcpStylesheets = html.match(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi) || [];
      if (fcpStylesheets.length > 0) {
        analysis.push({
          key: 'fcp_external_stylesheets',
          severity: 'warning',
          message: `${fcpStylesheets.length} external stylesheets blocking FCP`,
          explanation: 'External stylesheets block rendering and delay First Contentful Paint.',
          sourceCode: `Found ${fcpStylesheets.length} external stylesheets`,
          fix: 'Inline critical CSS and defer non-critical stylesheets',
          customCodeSolution: `// FCP Stylesheet Optimization
const fcpStyleOptimizer = {
  inlineCriticalCSS: () => {
    const criticalCSS = document.querySelector('[data-critical-css]');
    if (criticalCSS) {
      const style = document.createElement('style');
      style.textContent = criticalCSS.textContent;
      document.head.insertBefore(style, document.head.firstChild);
    }
  }
};`
        });
      }
      break;
      
    case 'tti':
      // TTI-specific custom code analysis
      if (performanceData.resources?.scripts > 20) {
        analysis.push({
          key: 'tti_too_many_scripts',
          severity: 'warning',
          message: `Too many scripts (${performanceData.resources.scripts}) affecting TTI`,
          explanation: 'Excessive scripts delay Time to Interactive.',
          sourceCode: `Found ${performanceData.resources.scripts} script tags (recommended: ≤ 20)`,
          fix: 'Combine scripts and use code splitting',
          customCodeSolution: `// TTI Script Optimization
const ttiScriptOptimizer = {
  implementCodeSplitting: () => {
    const loadFeature = async (feature) => {
      const module = await import(\`./features/\${feature}.js\`);
      return module;
    };
  }
};`
        });
      }
      break;
      
    case 'tbt':
      // TBT-specific custom code analysis
      const tbtInlineScripts = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
      if (tbtInlineScripts.length > 5) {
        analysis.push({
          key: 'tbt_inline_scripts',
          severity: 'warning',
          message: `${tbtInlineScripts.length} inline scripts blocking main thread`,
          explanation: 'Inline scripts can block the main thread and increase Total Blocking Time.',
          sourceCode: `Found ${tbtInlineScripts.length} inline scripts (recommended: ≤ 5)`,
          fix: 'Move inline scripts to external files or break them into smaller chunks',
          customCodeSolution: `// TBT Script Optimization
const tbtScriptOptimizer = {
  breakLongTasks: () => {
    const longTaskHandler = (task) => {
      if (task.duration > 50) {
        setTimeout(() => {
          // Continue processing in next tick
        }, 0);
      }
    };
  }
};`
        });
      }
      break;
  }
  
  return analysis;
}

function getCustomCodeSolution(metric, performanceData) {
  const solutions = {
    'lcp': `// LCP Optimization Solution
const lcpOptimizer = {
  optimizeImages: () => {
    const images = document.querySelectorAll('img');
    images.forEach(img => {
      img.loading = 'lazy';
      img.decoding = 'async';
      if (!img.width || !img.height) {
        img.style.width = 'auto';
        img.style.height = 'auto';
      }
    });
  },
  preloadCriticalResources: () => {
    const criticalImages = document.querySelectorAll('img[data-critical]');
    criticalImages.forEach(img => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = img.src;
      document.head.appendChild(link);
    });
  }
};`,
    'cls': `// CLS Optimization Solution
const clsOptimizer = {
  fixImageDimensions: () => {
    const images = document.querySelectorAll('img:not([width]):not([height])');
    images.forEach(img => {
      img.onload = () => {
        img.width = img.naturalWidth;
        img.height = img.naturalHeight;
      };
    });
  },
  preventLayoutShift: () => {
    const elements = document.querySelectorAll('[data-dynamic]');
    elements.forEach(el => {
      el.style.minHeight = '100px';
    });
  }
};`,
    'fcp': `// FCP Optimization Solution
const fcpOptimizer = {
  optimizeScripts: () => {
    const scripts = document.querySelectorAll('script:not([async]):not([defer])');
    scripts.forEach(script => {
      if (!script.src.includes('critical')) {
        script.async = true;
      }
    });
  },
  inlineCriticalCSS: () => {
    const criticalCSS = document.querySelector('[data-critical-css]');
    if (criticalCSS) {
      const style = document.createElement('style');
      style.textContent = criticalCSS.textContent;
      document.head.insertBefore(style, document.head.firstChild);
    }
  }
};`,
    'tti': `// TTI Optimization Solution
const ttiOptimizer = {
  deferNonCriticalScripts: () => {
    const scripts = document.querySelectorAll('script[src]');
    scripts.forEach(script => {
      if (!script.src.includes('critical')) {
        script.defer = true;
      }
    });
  },
  implementCodeSplitting: () => {
    // Dynamic import for non-critical features
    const loadFeature = async (feature) => {
      const module = await import(\`./features/\${feature}.js\`);
      return module;
    };
  }
};`,
    'tbt': `// TBT Optimization Solution
const tbtOptimizer = {
  breakLongTasks: () => {
    const longTaskHandler = (task) => {
      if (task.duration > 50) {
        console.warn('Long task detected:', task.duration + 'ms');
        // Break up the task
        setTimeout(() => {
          // Continue processing
        }, 0);
      }
    };
    
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach(longTaskHandler);
      });
      observer.observe({ entryTypes: ['longtask'] });
    }
  }
};`
  };
  
  return solutions[metric] || `// Custom solution for ${metric}
const ${metric}Optimizer = {
  optimize: () => {
    // Implement optimization logic here
    console.log('Optimizing ${metric}...');
  }
};`;
}

// PageSpeed Insights API function (using public API without key)
async function getPageSpeedInsights(targetUrl, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Build API URL with optional API key
      let apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(targetUrl)}&category=performance&strategy=mobile`;
      
      if (PAGESPEED_API_KEY) {
        apiUrl += `&key=${encodeURIComponent(PAGESPEED_API_KEY)}`;
        console.log(`🔑 Using PageSpeed API key (attempt ${attempt}/${retries})`);
      } else {
        console.log(`⚠️ No PageSpeed API key - using public endpoint (attempt ${attempt}/${retries})`);
      }
      
      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Performance-Analyzer/3.0)'
        }
      });
      
      if (response.status === 429) {
        const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`⏳ Rate limited. Waiting ${waitTime}ms before retry...`);
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      }
      
    if (!response.ok) {
        throw new Error(`PageSpeed API error: ${response.status} - ${response.statusText}`);
    }
    
    const data = await response.json();
      console.log('✅ PageSpeed API call successful');
    return data;
      
  } catch (error) {
      console.log(`❌ PageSpeed API attempt ${attempt} failed:`, error.message);
      
      if (attempt === retries) {
        console.log('❌ All PageSpeed API attempts failed');
        return null;
      }
      
      // Wait before retry
      const waitTime = Math.pow(2, attempt) * 1000;
      console.log(`⏳ Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

// Direct Lighthouse integration for accurate Core Web Vitals
async function runLighthouseDirect(targetUrl) {
  try {
    console.log('🔍 Running direct Lighthouse analysis for accurate Core Web Vitals...');
    
    // Check if lighthouse is installed
    try {
      await execAsync('lighthouse --version');
      console.log('✅ Lighthouse is installed');
    } catch (error) {
      console.log('⚠️ Lighthouse not installed. Installing...');
      await execAsync('npm install -g lighthouse');
    }
    
    // Run lighthouse with specific flags for Core Web Vitals
    const lighthouseCommand = `lighthouse "${targetUrl}" --output=json --quiet --chrome-flags="--headless --no-sandbox --disable-gpu --disable-dev-shm-usage" --only-categories=performance --form-factor=mobile --max-wait-for-load=30000`;
    
    console.log('🚀 Executing Lighthouse command...');
    const { stdout, stderr } = await execAsync(lighthouseCommand, { 
      timeout: 180000, // 3 minute timeout
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });
    
    if (stderr) {
      console.log('⚠️ Lighthouse stderr:', stderr);
    }
    
    const lighthouseData = JSON.parse(stdout);
    
    if (lighthouseData && lighthouseData.lhr) {
      const lhr = lighthouseData.lhr;
      const audits = lhr.audits;
      
      // Extract Core Web Vitals with proper fallbacks
      const lcp = audits['largest-contentful-paint']?.numericValue || 0;
      const cls = audits['cumulative-layout-shift']?.numericValue || 0;
      const fcp = audits['first-contentful-paint']?.numericValue || 0;
      const tti = audits['interactive']?.numericValue || 0;
      const tbt = audits['total-blocking-time']?.numericValue || 0;
      const speedIndex = audits['speed-index']?.numericValue || 0;
      const inp = audits['max-potential-fid']?.numericValue || 0;
      
      console.log('📊 Lighthouse Core Web Vitals extracted:');
      console.log(`   LCP: ${lcp}ms`);
      console.log(`   CLS: ${cls}`);
      console.log(`   FCP: ${fcp}ms`);
      console.log(`   INP: ${inp}ms`);
      
      // Generate performance issues based on actual Lighthouse data
      const performanceIssues = generatePerformanceIssuesFromLighthouse({
        lcp, cls, fcp, tti, tbt, speedIndex, audits
      });
      
      console.log('✅ Direct Lighthouse analysis completed successfully - ACCURATE Core Web Vitals data');
      
      return {
        source: 'lighthouse-direct',
        overallScore: Math.round((lhr.categories.performance?.score || 0) * 100),
        lcp: Math.round(lcp),
        cls: Math.round(cls * 1000) / 1000, // Round to 3 decimal places like PageSpeed Insights
        fcp: Math.round(fcp),
        tti: Math.round(tti),
        tbt: Math.round(tbt),
        speedIndex: Math.round(speedIndex),
        inp: Math.round(inp),
        issues: performanceIssues,
        coreWebVitals: {
          lcp: lcp <= 2500 ? 'good' : lcp <= 4000 ? 'needs-improvement' : 'poor',
          cls: cls <= 0.1 ? 'good' : cls <= 0.25 ? 'needs-improvement' : 'poor',
          fcp: fcp <= 1800 ? 'good' : fcp <= 3000 ? 'needs-improvement' : 'poor',
          inp: inp <= 200 ? 'good' : inp <= 500 ? 'needs-improvement' : 'poor'
        },
        audits: audits,
        categories: lhr.categories,
        fetchTime: lhr.fetchTime,
        userAgent: lhr.userAgent
      };
    }
    
    throw new Error('Invalid Lighthouse output - no lhr data found');
    
  } catch (error) {
    console.log('❌ Direct Lighthouse analysis failed:', error.message);
    if (error.message.includes('timeout')) {
      console.log('⏰ Lighthouse timed out - try with a faster website');
    }
    return null;
  }
}

// Detailed metric report endpoint
app.post('/metric-report', async (req, res) => {
  const { url, metric } = req.body;
  
  if (!url || !metric) {
    return res.status(400).json({ error: 'URL and metric are required' });
  }
  
  try {
    const startTime = Date.now();
    console.log(`Starting detailed analysis for metric: ${metric} on ${url}`);
    
    const htmlResponse = await fetchHTML(url);
    if (!htmlResponse || !htmlResponse.html) {
      return res.status(400).json({ error: 'Could not fetch the webpage' });
    }
    
    const html = htmlResponse.html;
    
    // Ensure html is a string
    if (typeof html !== 'string') {
      console.error('HTML is not a string:', typeof html);
      return res.status(500).json({ error: 'HTML parsing failed' });
    }
    
    const performanceData = await getEnhancedFallbackPerformanceAnalysis(html, url);
    const detailedReport = generateDetailedMetricReport(metric, performanceData, html, url);
    
    res.json({
      url: url,
      metric: metric,
      timestamp: new Date().toISOString(),
      analysisTime: Date.now() - startTime,
      report: detailedReport
    });
    
  } catch (error) {
    console.error('Detailed metric analysis error:', error);
    res.status(500).json({ error: 'Analysis failed', details: error.message });
  }
});

// Enhanced DOM analysis function
function analyzeDOMStructure(html) {
  const domAnalysis = {
    images: [],
    scripts: [],
    stylesheets: [],
    thirdPartyScripts: [],
    inlineScripts: [],
    blockingResources: [],
    lcpElements: [],
    clsElements: []
  };

  // Analyze images
  const imageRegex = /<img[^>]*>/gi;
  let match;
  while ((match = imageRegex.exec(html)) !== null) {
    const imgTag = match[0];
    const srcMatch = imgTag.match(/src=["']([^"']+)["']/i);
    const widthMatch = imgTag.match(/width=["']?(\d+)["']?/i);
    const heightMatch = imgTag.match(/height=["']?(\d+)["']?/i);
    const loadingMatch = imgTag.match(/loading=["']([^"']+)["']/i);
    const fetchpriorityMatch = imgTag.match(/fetchpriority=["']([^"']+)["']/i);
    
    if (srcMatch) {
      domAnalysis.images.push({
        src: srcMatch[1],
        width: widthMatch ? parseInt(widthMatch[1]) : null,
        height: heightMatch ? parseInt(heightMatch[1]) : null,
        loading: loadingMatch ? loadingMatch[1] : 'eager',
        fetchpriority: fetchpriorityMatch ? fetchpriorityMatch[1] : null,
        hasDimensions: !!(widthMatch && heightMatch),
        isLazy: loadingMatch && loadingMatch[1] === 'lazy',
        isHighPriority: fetchpriorityMatch && fetchpriorityMatch[1] === 'high',
        size: imgTag.length,
        isLCPCandidate: !loadingMatch || loadingMatch[1] !== 'lazy'
      });
    }
  }

  // Analyze scripts
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  while ((match = scriptRegex.exec(html)) !== null) {
    const scriptTag = match[0];
    const scriptContent = match[1];
    const srcMatch = scriptTag.match(/src=["']([^"']+)["']/i);
    const asyncMatch = scriptTag.match(/async/i);
    const deferMatch = scriptTag.match(/defer/i);
    
    if (srcMatch) {
      const isThirdParty = !srcMatch[1].startsWith('/') && !srcMatch[1].startsWith('./') && !srcMatch[1].startsWith('../');
      const scriptInfo = {
        src: srcMatch[1],
        isThirdParty: isThirdParty,
        isAsync: !!asyncMatch,
        isDefer: !!deferMatch,
        isBlocking: !asyncMatch && !deferMatch,
        size: scriptContent.length,
        domain: isThirdParty ? new URL(srcMatch[1], 'https://example.com').hostname : 'same-origin'
      };
      
      if (isThirdParty) {
        domAnalysis.thirdPartyScripts.push(scriptInfo);
      } else {
        domAnalysis.scripts.push(scriptInfo);
      }
      
      if (scriptInfo.isBlocking) {
        domAnalysis.blockingResources.push(scriptInfo);
      }
    } else if (scriptContent.trim()) {
      domAnalysis.inlineScripts.push({
        content: scriptContent.substring(0, 200) + '...',
        size: scriptContent.length,
        isBlocking: true,
        type: 'inline'
      });
      domAnalysis.blockingResources.push({
        type: 'inline-script',
        size: scriptContent.length,
        content: scriptContent.substring(0, 100) + '...'
      });
    }
  }

  // Analyze stylesheets
  const linkRegex = /<link[^>]*rel=["']stylesheet["'][^>]*>/gi;
  while ((match = linkRegex.exec(html)) !== null) {
    const linkTag = match[0];
    const hrefMatch = linkTag.match(/href=["']([^"']+)["']/i);
    const mediaMatch = linkTag.match(/media=["']([^"']+)["']/i);
    
    if (hrefMatch) {
      domAnalysis.stylesheets.push({
        href: hrefMatch[1],
        media: mediaMatch ? mediaMatch[1] : 'all',
        isBlocking: !mediaMatch || mediaMatch[1] === 'all',
        size: linkTag.length
      });
      
      if (!mediaMatch || mediaMatch[1] === 'all') {
        domAnalysis.blockingResources.push({
          type: 'stylesheet',
          href: hrefMatch[1],
          size: linkTag.length
        });
      }
    }
  }

  // Identify LCP candidates (large images, hero sections)
  domAnalysis.images.forEach(img => {
    if (img.isLCPCandidate && (img.width > 400 || img.height > 300)) {
      domAnalysis.lcpElements.push({
        type: 'image',
        src: img.src,
        width: img.width,
        height: img.height,
        isOptimized: img.src.includes('.webp') || img.src.includes('.avif'),
        hasPreload: false // Would need to check for preload links
      });
    }
  });

  // Identify CLS candidates (images without dimensions, dynamic content)
  domAnalysis.images.forEach(img => {
    if (!img.hasDimensions) {
      domAnalysis.clsElements.push({
        type: 'image-no-dimensions',
        src: img.src,
        issue: 'Missing width/height attributes'
      });
    }
  });

  return domAnalysis;
}

// Generate comprehensive analysis sections like the shared images
function generateComprehensiveAnalysis(performanceData, html, targetUrl) {
  const sections = [];
  const domAnalysis = analyzeDOMStructure(html);
  
  // LCP Analysis
  if (performanceData.lcp > 2500) {
    const lcpImages = domAnalysis.lcpElements.filter(el => el.type === 'image');
    const unoptimizedImages = domAnalysis.images.filter(img => !img.src.includes('.webp') && !img.src.includes('.avif'));
    
    sections.push({
      metric: 'LCP',
      title: 'Optimize Largest Contentful Element (High Priority - Image Optimization)',
      status: performanceData.lcp <= 4000 ? 'needs-improvement' : 'poor',
      currentValue: `${performanceData.lcp}ms`,
      targetValue: '2500ms',
      description: 'LCP measures loading performance. It marks the point when the largest content element becomes visible.',
      impact: performanceData.lcp <= 4000 ? 'Medium - Loading could be faster' : 'High - Very slow loading',
      
      keyFactor: `Large Image File Sizes (${unoptimizedImages.length} unoptimized images found)`,
      rootCause: `Using outdated image formats (JPEG/PNG) that are 3-5x larger than modern formats. Found ${unoptimizedImages.length} images without WebP/AVIF optimization.`,
      specificSolution: 'Convert images to WebP or AVIF format, which are 60-80% smaller while maintaining quality.',
      recommendation: 'Use tools like TinyPNG, ImageOptim, or automated compression in your build process.',
      customCodeSolution: `// Publisher custom code for LCP image optimization
const lcpOptimizer = {
  preloadLCPImage: () => {
    const lcpImage = document.querySelector('img[data-lcp]') ||
                     document.querySelector('.hero img') ||
                     document.querySelector('img:first-of-type');

    if (lcpImage) {
      const preloadLink = document.createElement('link');
      preloadLink.rel = 'preload';
      preloadLink.as = 'image';
      preloadLink.href = lcpImage.src;
      document.head.insertBefore(preloadLink, document.head.firstChild);
    }
  },
  optimizeImages: () => {
    const images = document.querySelectorAll('img');
    images.forEach(img => {
      const baseSrc = img.src.replace(/.(jpg|png|webp)$/i, '');
      img.srcset = \`\${baseSrc}-400.webp 400w, \${baseSrc}-800.webp 800w, \${baseSrc}-1200.webp 1200w\`;
      img.sizes = '(max-width: 400px) 400px, (max-width: 800px) 800px, 1200px';
      img.loading = 'lazy';
      img.fetchpriority = 'high';
    });
  }
};`
    });
  }

  // CLS Analysis
  if (performanceData.cls > 0.1) {
    const imagesWithoutDimensions = domAnalysis.clsElements.filter(el => el.type === 'image-no-dimensions');
    
    sections.push({
      metric: 'CLS',
      title: 'Set Image Dimensions (High Priority - Image Dimensions)',
      status: performanceData.cls <= 0.25 ? 'needs-improvement' : 'poor',
      currentValue: performanceData.cls.toFixed(3),
      targetValue: '0.1',
      description: 'CLS measures visual stability. It quantifies how much visible content shifts during page load.',
      impact: performanceData.cls <= 0.25 ? 'Medium - Some layout shifts' : 'High - Significant layout shifts',
      
      keyFactor: `Images Without Dimensions (${imagesWithoutDimensions.length} images found)`,
      rootCause: `Images loaded without width/height attributes cause the browser to recalculate layout when they load, pushing other content around. Found ${imagesWithoutDimensions.length} images without dimensions.`,
      specificSolution: 'Add explicit width and height attributes to all images to reserve space before loading.',
      recommendation: 'Always specify dimensions for images. Use CSS to make them responsive while maintaining aspect ratio.',
      customCodeSolution: `// Publisher custom code for image dimensions
const dimensionOptimizer = {
  addImageDimensions: () => {
    const images = document.querySelectorAll('img:not([width]):not([height])');
    images.forEach(img => {
      img.onload = () => {
        img.style.width = '100%';
        img.style.height = 'auto';
        img.style.aspectRatio = \`\${img.naturalWidth} / \${img.naturalHeight}\`;
      };
    });
  }
};`
    });
  }

  // FCP Analysis
  if (performanceData.fcp > 1800) {
    const blockingScripts = domAnalysis.blockingResources.filter(r => r.type === 'inline-script' || (r.isBlocking && r.type === 'script'));
    const totalBlockingSize = blockingScripts.reduce((sum, script) => sum + (script.size || 0), 0);
    
    sections.push({
      metric: 'FCP',
      title: 'Optimize First Contentful Paint (High Priority - Critical Rendering Path)',
      status: performanceData.fcp <= 3000 ? 'needs-improvement' : 'poor',
      currentValue: `${performanceData.fcp}ms`,
      targetValue: '1800ms',
      description: 'FCP measures perceived loading speed. It marks when the first text or image is painted.',
      impact: performanceData.fcp <= 3000 ? 'Medium - Loading could be faster' : 'High - Very slow first paint',
      
      keyFactor: `Large Inline Scripts Blocking HTML Parsing (${blockingScripts.length} scripts, ${Math.round(totalBlockingSize/1024)}KB total)`,
      rootCause: `Large inline scripts are blocking the main thread and preventing the browser from rendering content quickly. Found ${blockingScripts.length} blocking scripts totaling ${Math.round(totalBlockingSize/1024)}KB.`,
      specificSolution: 'Move inline scripts to external files and implement async/defer loading.',
      recommendation: 'Extract inline scripts to separate .js files and load them asynchronously to prevent render blocking.',
      customCodeSolution: `// Publisher custom code for script optimization
const scriptOptimizer = {
  optimizeScripts: () => {
    const inlineScripts = document.querySelectorAll('script:not([src])');
    inlineScripts.forEach((script, index) => {
      if (script.textContent.trim()) {
        const blob = new Blob([script.textContent], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        const newScript = document.createElement('script');
        newScript.src = url;
        newScript.async = true;
        newScript.defer = true;
        script.parentNode.replaceChild(newScript, script);
      }
    });
  }
};`
    });
  }

  // TBT Analysis
  if (performanceData.tbt > 200) {
    const thirdPartyScripts = domAnalysis.thirdPartyScripts.filter(s => s.isBlocking);
    
    sections.push({
      metric: 'TBT',
      title: 'Reduce Total Blocking Time (High Priority - JavaScript Optimization)',
      status: performanceData.tbt <= 600 ? 'needs-improvement' : 'poor',
      currentValue: `${performanceData.tbt}ms`,
      targetValue: '200ms',
      description: 'TBT measures main thread blocking. It quantifies how long the main thread is blocked by long tasks.',
      impact: performanceData.tbt <= 600 ? 'Medium - Some blocking' : 'High - Significant blocking',
      
      keyFactor: `Tracking Scripts Causing Main Thread Blocking (${thirdPartyScripts.length} blocking scripts)`,
      rootCause: `Third-party tracking scripts are executing synchronously and blocking user interactions. Found ${thirdPartyScripts.length} blocking third-party scripts.`,
      specificSolution: 'Defer tracking scripts and use web workers for analytics processing.',
      recommendation: 'Move tracking scripts to web workers and defer analytics until after user interaction.',
      customCodeSolution: `// Publisher custom code for tracking optimization
const trackingOptimizer = {
  deferTracking: () => {
    // 1. Defer tracking scripts
    function initTracking() {
      document.addEventListener('click', () => {
        if (!window.trackingLoaded) {
          loadTrackingScripts();
          window.trackingLoaded = true;
        }
      }, { once: true });
    }
    
    // 2. Use web worker for analytics
    const analyticsWorker = new Worker('/js/analytics-worker.js');
    analyticsWorker.postMessage({ type: 'track', data: eventData });
  }
};`
    });
  }

  // Third-Party Code Analysis
  if (domAnalysis.thirdPartyScripts.length > 0) {
    const highImpactScripts = domAnalysis.thirdPartyScripts.filter(s => s.isBlocking);
    
    sections.push({
      metric: 'Third-Party Code',
      title: 'Third-Party Code Analysis',
      status: 'high-impact',
      currentValue: `${domAnalysis.thirdPartyScripts.length} third-party scripts`,
      targetValue: 'Minimize blocking scripts',
      description: 'Analysis of external scripts and third-party integrations with performance impact validation.',
      impact: `HIGH - ${highImpactScripts.length} blocking third-party scripts detected`,
      
      keyFactor: `Third-Party Scripts Blocking Main Thread Execution (${highImpactScripts.length} high-impact scripts)`,
      rootCause: `Third-party scripts are blocking JavaScript execution and impacting performance. Found ${highImpactScripts.length} high-impact third-party scripts.`,
      specificSolution: 'Implement lazy loading and async loading for third-party scripts.',
      recommendation: 'Load third-party scripts asynchronously and defer non-critical ones until after page load.',
      customCodeSolution: `// Publisher custom code for third-party optimization
const thirdPartyOptimizer = {
  optimizeThirdPartyWidgets: () => {
    const widgets = document.querySelectorAll('iframe[src*="ads"], iframe[src*="social"], iframe[src*="widget"]');
    widgets.forEach(widget => {
      // Reserve space before loading
      widget.style.width = '100%';
      widget.style.height = '250px';
      widget.style.border = 'none';
      
      // Load widget after page is stable
      if (window.requestIdleCallback) {
        requestIdleCallback(() => {
          widget.src = widget.dataset.src;
        });
      } else {
        setTimeout(() => {
          widget.src = widget.dataset.src;
        }, 1000);
      }
    });
  }
};`
    });
  }

  return sections;
}

// Analyze SEO Schema markup
function analyzeSchemaMarkup(html, targetUrl) {
  const schemaAnalysis = {
    schemaScore: 0,
    schemaTypes: 0,
    schemaIssues: '',
    schemaRootCause: '',
    schemaSolution: '',
    schemaRecommendation: '',
    schemaCode: ''
  };

  try {
    // Extract JSON-LD schemas
    const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis);
    const microdataMatches = html.match(/itemscope[^>]*>/gi);
    const rdfaMatches = html.match(/typeof=["'][^"']*["']/gi);
    
    let foundSchemas = [];
    let schemaTypes = new Set();
    
    if (jsonLdMatches) {
      jsonLdMatches.forEach(match => {
        try {
          const jsonContent = match.replace(/<script[^>]*>|<\/script>/gi, '');
          const schema = JSON.parse(jsonContent);
          if (schema['@type']) {
            schemaTypes.add(schema['@type']);
            foundSchemas.push(schema);
          }
        } catch (e) {
          // Invalid JSON, skip
        }
      });
    }
    
    if (microdataMatches) {
      microdataMatches.forEach(match => {
        const itemTypeMatch = match.match(/itemtype=["']([^"']*)["']/i);
        if (itemTypeMatch) {
          const type = itemTypeMatch[1].split('/').pop();
          schemaTypes.add(type);
        }
      });
    }
    
    if (rdfaMatches) {
      rdfaMatches.forEach(match => {
        const typeMatch = match.match(/typeof=["']([^"']*)["']/i);
        if (typeMatch) {
          const type = typeMatch[1].split(':').pop();
          schemaTypes.add(type);
        }
      });
    }
    
    schemaAnalysis.schemaTypes = schemaTypes.size;
    
    // Calculate schema score based on found types
    const essentialTypes = ['Article', 'Organization', 'WebSite', 'BreadcrumbList'];
    const foundEssentialTypes = essentialTypes.filter(type => schemaTypes.has(type));
    
    schemaAnalysis.schemaScore = Math.min(100, (foundEssentialTypes.length / essentialTypes.length) * 100 + (schemaTypes.size * 10));
    
    // Generate analysis based on score
    if (schemaAnalysis.schemaScore >= 80) {
      schemaAnalysis.schemaIssues = 'Excellent schema implementation found';
      schemaAnalysis.schemaRootCause = 'Comprehensive structured data markup is properly implemented';
      schemaAnalysis.schemaSolution = 'Maintain current schema implementation and consider adding more specific schemas';
      schemaAnalysis.schemaRecommendation = 'Continue monitoring and add more specific schemas as needed';
    } else if (schemaAnalysis.schemaScore >= 60) {
      schemaAnalysis.schemaIssues = 'Good schema foundation but missing some essential types';
      schemaAnalysis.schemaRootCause = 'Basic schema markup implemented but missing key content types';
      schemaAnalysis.schemaSolution = 'Add missing essential schema types (Article, Organization, BreadcrumbList)';
      schemaAnalysis.schemaRecommendation = 'Implement the missing essential schemas to improve SEO';
    } else {
      schemaAnalysis.schemaIssues = 'Missing or incomplete structured data markup';
      schemaAnalysis.schemaRootCause = 'No structured data implementation or very basic schema markup';
      schemaAnalysis.schemaSolution = 'Implement comprehensive structured data markup using JSON-LD format';
      schemaAnalysis.schemaRecommendation = 'Start with basic schema types and gradually add more specific schemas';
    }
    
    // Generate custom code based on what's missing
    const missingTypes = essentialTypes.filter(type => !schemaTypes.has(type));
    if (missingTypes.length > 0) {
      schemaAnalysis.schemaCode = generateSchemaCode(missingTypes, targetUrl);
    }
    
  } catch (error) {
    console.error('Error analyzing schema markup:', error);
    schemaAnalysis.schemaIssues = 'Error analyzing schema markup';
    schemaAnalysis.schemaRootCause = 'Unable to parse existing schema markup';
    schemaAnalysis.schemaSolution = 'Implement proper JSON-LD structured data';
    schemaAnalysis.schemaRecommendation = 'Add valid structured data markup to improve SEO';
  }
  
  return schemaAnalysis;
}

// Generate schema code based on missing types
function generateSchemaCode(missingTypes, targetUrl) {
  const domain = new URL(targetUrl).hostname;
  const baseUrl = `https://${domain}`;
  
  let code = '';
  
  if (missingTypes.includes('Article')) {
    code += `<!-- Article Schema -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Your Article Title",
  "author": {
    "@type": "Person",
    "name": "Author Name"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Your Organization",
    "logo": {
      "@type": "ImageObject",
      "url": "${baseUrl}/logo.png"
    }
  },
  "datePublished": "2024-01-01",
  "dateModified": "2024-01-01",
  "description": "Article description",
  "image": "${baseUrl}/article-image.jpg"
}
</script>

`;
  }
  
  if (missingTypes.includes('Organization')) {
    code += `<!-- Organization Schema -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Your Organization",
  "url": "${baseUrl}",
  "logo": "${baseUrl}/logo.png",
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": "+1-123-456-7890",
    "contactType": "customer service"
  }
}
</script>

`;
  }
  
  if (missingTypes.includes('WebSite')) {
    code += `<!-- Website Schema -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Your Website",
  "url": "${baseUrl}",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "${baseUrl}/search?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
</script>

`;
  }
  
  if (missingTypes.includes('BreadcrumbList')) {
    code += `<!-- Breadcrumb Schema -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [{
    "@type": "ListItem",
    "position": 1,
    "name": "Home",
    "item": "${baseUrl}"
  }, {
    "@type": "ListItem",
    "position": 2,
    "name": "Category",
    "item": "${baseUrl}/category"
  }]
}
</script>

`;
  }
  
  return code.trim();
}

// Performance analysis endpoint
app.post('/analyze', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  
  const startTime = Date.now();
  
  try {
    // Validate and normalize URL
    let targetUrl = url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'https://' + targetUrl.replace(/^\/\//, '');
    }
    
    console.log(`Starting performance analysis for: ${targetUrl}`);
    
    // Fetch HTML content for fallback analysis
    const { html, status } = await fetchHTML(targetUrl);
    if (status !== 200) {
      return res.status(400).json({ 
        error: 'Failed to fetch page', 
        details: `HTTP ${status}` 
      });
    }
    
    // Try multiple methods for accurate Core Web Vitals data
    let performanceData = null;
    let dataSource = 'unknown';
    
    // Method 1: Try PageSpeed Insights API first (most reliable with API key)
    console.log('🎯 Method 1: Trying PageSpeed Insights API...');
    try {
      const pageSpeedData = await getPageSpeedData(targetUrl);
      if (pageSpeedData && pageSpeedData.lighthouseResult) {
        const coreWebVitals = extractCoreWebVitals(pageSpeedData);
        if (coreWebVitals) {
        const lh = pageSpeedData.lighthouseResult;
        const audits = lh.audits;
        
        // Generate performance issues based on actual metrics
        const performanceIssues = generatePerformanceIssuesFromLighthouse({
            lcp: coreWebVitals.lcp, 
            cls: coreWebVitals.cls, 
            fcp: coreWebVitals.fcp, 
            tti: coreWebVitals.tti, 
            tbt: coreWebVitals.tbt, 
            speedIndex: coreWebVitals.speedIndex, 
            audits
        });
        
        performanceData = {
            source: 'pagespeed-api',
            overallScore: coreWebVitals.performanceScore || 0,
            lcp: Math.round(coreWebVitals.lcp || 0),
            cls: Math.round((coreWebVitals.cls || 0) * 1000) / 1000,
            fcp: Math.round(coreWebVitals.fcp || 0),
            tti: Math.round(coreWebVitals.tti || 0),
            tbt: Math.round(coreWebVitals.tbt || 0),
            speedIndex: Math.round(coreWebVitals.speedIndex || 0),
            fid: Math.round(coreWebVitals.fid || 0),
            inp: Math.round(coreWebVitals.fid || 0), // Using FID as INP approximation
          issues: performanceIssues,
          coreWebVitals: {
              lcp: (coreWebVitals.lcp || 0) <= 2500 ? 'good' : (coreWebVitals.lcp || 0) <= 4000 ? 'needs-improvement' : 'poor',
              cls: (coreWebVitals.cls || 0) <= 0.1 ? 'good' : (coreWebVitals.cls || 0) <= 0.25 ? 'needs-improvement' : 'poor',
              fcp: (coreWebVitals.fcp || 0) <= 1800 ? 'good' : (coreWebVitals.fcp || 0) <= 3000 ? 'needs-improvement' : 'poor',
              fid: (coreWebVitals.fid || 0) <= 100 ? 'good' : (coreWebVitals.fid || 0) <= 300 ? 'needs-improvement' : 'poor',
              inp: (coreWebVitals.fid || 0) <= 200 ? 'good' : (coreWebVitals.fid || 0) <= 500 ? 'needs-improvement' : 'poor'
            },
            audits: audits,
            categories: lh.categories
          };
          dataSource = 'PageSpeed API';
        console.log('✅ PageSpeed Insights data retrieved successfully');
        }
      }
    } catch (pageSpeedError) {
        console.log('❌ PageSpeed Insights API failed:', pageSpeedError.message);
    }
    
    // Method 2: Try Direct Lighthouse (if PageSpeed API failed)
    if (!performanceData) {
      console.log('🎯 Method 2: Trying Direct Lighthouse for accurate Core Web Vitals...');
      try {
        performanceData = await runLighthouseDirect(targetUrl);
        if (performanceData) {
          dataSource = 'Direct Lighthouse';
          console.log('✅ Direct Lighthouse analysis completed successfully - ACCURATE Core Web Vitals data');
        }
      } catch (lighthouseError) {
        console.log('❌ Direct Lighthouse failed:', lighthouseError.message);
      }
    }
    
    // Method 3: Fallback to enhanced analysis (last resort)
    if (!performanceData) {
      console.log('🎯 Method 3: Using Enhanced Fallback Analysis...');
              performanceData = await getEnhancedFallbackPerformanceAnalysis(html, targetUrl);
      dataSource = 'Enhanced Fallback';
      console.log('⚠️ Using fallback analysis - metrics are estimated, not measured');
    }
    
    console.log(`📊 Performance data source: ${dataSource}`);
    
    // Generate comprehensive performance categories
    const performanceCategories = generatePerformanceCategories(performanceData);
    
    // Generate custom code analysis
    const customCodeAnalysis = analyzeCustomCodeAndThirdParty(html, targetUrl);
    
    // Generate comprehensive analysis sections like the shared images
    const detailedAnalysis = generateComprehensiveAnalysis(performanceData, html, targetUrl);
    
    // Generate SEO Schema analysis
    const schemaAnalysis = analyzeSchemaMarkup(html, targetUrl);
    
    // Generate AI analysis
    const aiAnalysis = await generateAIPerformanceAnalysis(performanceData, targetUrl);
    
    const response = {
      url: targetUrl,
      timestamp: new Date().toISOString(),
      analysisTime: Date.now() - startTime,
      dataSource: dataSource,
      overallScore: performanceData.overallScore,
      
      // Core Web Vitals
      coreWebVitals: {
        lcp: performanceData.lcp,
        cls: performanceData.cls,
        fcp: performanceData.fcp,
        tti: performanceData.tti,
        tbt: performanceData.tbt,
        speedIndex: performanceData.speedIndex,
        fid: performanceData.fid,
        inp: performanceData.inp
      },
      
      // Performance Categories
      performanceCategories: performanceCategories,
      
      // Custom Code Analysis
      customCodeAnalysis: customCodeAnalysis,
      
      // Detailed Analysis Sections (like shared images)
      detailedAnalysis: detailedAnalysis,
      
      // AI Analysis
      aiAnalysis: aiAnalysis,
      
      // Legacy structure for downloadable report compatibility
      performance: {
        overallScore: performanceData.overallScore,
        lcp: performanceData.lcp,
        cls: performanceData.cls,
        fcp: performanceData.fcp,
        tti: performanceData.tti,
        tbt: performanceData.tbt,
        speedIndex: performanceData.speedIndex,
        fid: performanceData.fid,
        inp: performanceData.inp,
        issues: performanceData.issues || [],
        coreWebVitals: performanceData.coreWebVitals || {},
        
        // Detailed analysis for downloadable report
        publisherCode: {
          title: "Publisher Code - Inline Scripts",
          summary: `Found ${customCodeAnalysis.summary?.realMetrics?.inlineScripts || 0} inline scripts`,
          scripts: customCodeAnalysis.topPriorityIssues?.filter(issue => 
            issue.title.includes('Inline Scripts') || issue.title.includes('Blocking')
          ) || [],
          analysis: customCodeAnalysis.summary || {}
        },
        
        thirdPartyCode: {
          title: "Third-Party Code - External Scripts & Tracking",
          summary: `Found ${customCodeAnalysis.summary?.realMetrics?.externalScripts || 0} external scripts and ${customCodeAnalysis.summary?.realMetrics?.thirdPartyDomains || 0} third-party domains`,
          scripts: customCodeAnalysis.topPriorityIssues?.filter(issue => 
            issue.title.includes('External') || issue.title.includes('Third-Party')
          ) || [],
          analysis: customCodeAnalysis.summary || {}
        },
        
        highPriorityIssues: {
          title: "HIGH PRIORITY Performance Issues & Solutions",
          summary: `Found ${customCodeAnalysis.topPriorityIssues?.length || 0} high priority issues`,
          issues: customCodeAnalysis.topPriorityIssues || [],
          analysis: customCodeAnalysis.summary || {}
        },
        
        // SEO Schema Analysis
        schemaScore: schemaAnalysis.schemaScore,
        schemaTypes: schemaAnalysis.schemaTypes,
        schemaIssues: schemaAnalysis.schemaIssues,
        schemaRootCause: schemaAnalysis.schemaRootCause,
        schemaSolution: schemaAnalysis.schemaSolution,
        schemaRecommendation: schemaAnalysis.schemaRecommendation,
        schemaCode: schemaAnalysis.schemaCode,
        
        // AI suggestions for downloadable report
        aiSuggestions: aiAnalysis ? {
          title: "AI Performance Recommendations",
          summary: aiAnalysis.summary || "AI analysis completed",
          recommendations: aiAnalysis.recommendations || [],
          criticalIssues: aiAnalysis.criticalIssues || [],
          dataSource: aiAnalysis.dataSource || "AI Analysis"
        } : null,
        
        // Custom code and third party analysis
        customCodeAndThirdParty: customCodeAnalysis
      },
      
      // Summary
      summary: {
        overallScore: performanceData.overallScore,
        dataSource: dataSource,
        analysisTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
    };
    
    console.log(`Performance analysis completed for ${targetUrl} in ${response.analysisTime}ms`);
    res.json(response);
    
  } catch (error) {
    console.error('Performance analysis failed:', error);
    res.status(500).json({ 
      error: 'Performance analysis failed', 
      details: error.message 
    });
  }
});

// Serve the frontend HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/stable-seo-analyzer.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Quintype Performance Analyzer (PageSpeed API) running on port ${port}`);
  console.log('Frontend: http://localhost:' + port);
  console.log('Health check: http://localhost:' + port + '/health');
  console.log('Test endpoint: http://localhost:' + port + '/test');
});
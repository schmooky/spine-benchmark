/**
 * Comprehensive report viewer HTML.
 * Matches the benchmark site's dark theme and provides per-animation
 * detail panels with GIF previews, advisor explanations, and hotspot
 * visualizations.
 */

export function buildReportHtml(id: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Spine Benchmark Report</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0a0a12;
      --bg-card: #111118;
      --bg-hover: #161620;
      --border: #1a1a2e;
      --text: #d0d0d8;
      --text-dim: #666;
      --text-faint: #444;
      --accent: #4fc3f7;
      --green: #34D399;
      --lime: #A3E635;
      --yellow: #FBBF24;
      --orange: #FB923C;
      --red: #F87171;
      --mono: 'JetBrains Mono', monospace;
      --sans: 'Inter', system-ui, sans-serif;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: var(--sans); background: var(--bg); color: var(--text); line-height: 1.6; }
    .page { max-width: 960px; margin: 0 auto; padding: 32px 24px 80px; }

    /* Header */
    .header { display: flex; align-items: center; gap: 16px; padding-bottom: 24px; border-bottom: 1px solid var(--border); margin-bottom: 32px; }
    .logo { width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, var(--accent) 0%, #7c4dff 100%); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px; color: white; flex-shrink: 0; }
    .header-text h1 { font-size: 1.4rem; color: var(--accent); font-weight: 700; line-height: 1.2; }
    .header-text .sub { color: var(--text-dim); font-size: 0.8rem; display: flex; gap: 12px; flex-wrap: wrap; margin-top: 4px; }
    .header-text .sub span::before { content: ''; display: inline-block; width: 4px; height: 4px; border-radius: 50%; background: var(--border); margin-right: 6px; vertical-align: middle; }

    /* Badge */
    .badge { display: inline-block; padding: 2px 10px; border-radius: 6px; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    .badge-minimal { background: #0d2818; color: var(--green); }
    .badge-low { background: #1a2e0a; color: var(--lime); }
    .badge-moderate { background: #2e1f06; color: var(--yellow); }
    .badge-high { background: #2e1007; color: var(--orange); border: 1px solid rgba(251,146,60,.2); }
    .badge-veryHigh { background: #2e0a0a; color: var(--red); border: 1px solid rgba(248,113,113,.2); }
    .badge-danger { background: #2e0a0a; color: var(--red); border: 1px solid rgba(248,113,113,.2); }
    .badge-warning { background: #2e1f06; color: var(--yellow); border: 1px solid rgba(251,191,36,.2); }
    .badge-neutral { background: var(--bg-card); color: var(--text-dim); }

    /* Hero screenshot */
    .hero-img { width: 100%; border-radius: 12px; border: 1px solid var(--border); margin-bottom: 32px; }

    /* Impact cards */
    .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 32px; }
    .card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
    .card-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-dim); margin-bottom: 8px; }
    .card-value { font-size: 2.2rem; font-weight: 700; font-family: var(--mono); }
    .v-minimal, .v-low { color: var(--green); }
    .v-moderate { color: var(--yellow); }
    .v-high { color: var(--orange); }
    .v-veryHigh { color: var(--red); }

    /* Section headings */
    h2 { font-size: 1.1rem; color: #b0b8c4; font-weight: 600; margin: 40px 0 16px; display: flex; align-items: center; gap: 8px; }
    h2 .icon { width: 20px; height: 20px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 11px; }

    /* Hotspots grid */
    .hotspots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 8px; }
    .hotspot { background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 16px; text-align: center; }
    .hotspot-val { font-size: 1.6rem; font-weight: 700; font-family: var(--mono); color: var(--text); }
    .hotspot-label { font-size: 0.68rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.04em; margin-top: 4px; }

    /* Advisor cards */
    .advisor-item { background: var(--bg-card); border-radius: 10px; padding: 16px 20px; margin-bottom: 12px; border-left: 4px solid var(--text-faint); display: flex; gap: 12px; }
    .advisor-item.sev-warning { border-left-color: var(--yellow); }
    .advisor-item.sev-critical { border-left-color: var(--red); }
    .advisor-item.sev-info { border-left-color: var(--accent); }
    .advisor-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
    .advisor-icon.sev-warning { background: #2e1f0622; color: var(--yellow); }
    .advisor-icon.sev-critical { background: #2e0a0a22; color: var(--red); }
    .advisor-icon.sev-info { background: #0a1a2e22; color: var(--accent); }
    .advisor-body { flex: 1; }
    .advisor-title { font-weight: 600; font-size: 0.88rem; margin-bottom: 4px; }
    .advisor-desc { font-size: 0.8rem; color: var(--text-dim); }
    .advisor-anims { margin-top: 6px; display: flex; gap: 6px; flex-wrap: wrap; }
    .advisor-anims span { font-size: 0.7rem; background: var(--border); padding: 2px 8px; border-radius: 4px; color: var(--text-dim); }

    /* Per-animation details */
    .anim-grid { display: flex; flex-direction: column; gap: 16px; }
    .anim-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
    .anim-card-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); }
    .anim-card-header h3 { font-size: 0.95rem; font-weight: 600; }
    .anim-card-header .dur { font-family: var(--mono); font-size: 0.75rem; color: var(--text-dim); }
    .anim-card-body { display: grid; grid-template-columns: auto 1fr; gap: 0; }
    .anim-gif { width: 200px; height: 150px; object-fit: contain; background: #000; border-right: 1px solid var(--border); }
    .anim-gif-placeholder { width: 200px; height: 150px; display: flex; align-items: center; justify-content: center; color: var(--text-faint); font-size: 0.75rem; background: #08080f; border-right: 1px solid var(--border); }
    .anim-metrics { padding: 16px 20px; }
    .anim-metrics-row { display: flex; gap: 24px; margin-bottom: 8px; }
    .anim-metric { flex: 1; }
    .anim-metric-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim); }
    .anim-metric-value { font-family: var(--mono); font-size: 1.1rem; font-weight: 600; }
    .anim-features { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
    .feature-tag { font-size: 0.65rem; padding: 2px 8px; border-radius: 4px; background: var(--border); color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.04em; }
    .feature-tag.active { background: #1a2e3e; color: var(--accent); }

    /* Summary table */
    table { width: 100%; border-collapse: collapse; }
    thead th { color: var(--text-dim); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 500; padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--border); }
    tbody td { padding: 10px 12px; font-size: 0.82rem; border-bottom: 1px solid var(--bg-card); }
    tbody tr:hover { background: var(--bg-hover); }
    .num { font-family: var(--mono); font-size: 0.78rem; text-align: right; }
    .row-danger { background: #1a0a0a; }
    .row-warning { background: #1a150a; }

    /* File hashes */
    .hashes { background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 16px 20px; font-family: var(--mono); font-size: 0.7rem; }
    .hashes dt { color: var(--accent); margin-top: 10px; }
    .hashes dt:first-child { margin-top: 0; }
    .hashes dd { color: var(--text-faint); word-break: break-all; }

    /* Footer */
    .footer { text-align: center; color: var(--text-faint); font-size: 0.7rem; margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--bg-card); }
    .footer a { color: var(--accent); text-decoration: none; }

    .expired { text-align: center; padding: 120px 20px; color: var(--text-faint); font-size: 1.1rem; }
    .loading { text-align: center; padding: 120px 20px; color: var(--text-dim); }

    @media (max-width: 700px) {
      .cards { grid-template-columns: 1fr; }
      .hotspots { grid-template-columns: repeat(2, 1fr); }
      .anim-card-body { grid-template-columns: 1fr; }
      .anim-gif, .anim-gif-placeholder { width: 100%; height: 120px; border-right: none; border-bottom: 1px solid var(--border); }
    }
  </style>
</head>
<body>
<div class="page">
  <div id="root"><div class="loading">Loading report...</div></div>
</div>
<script>
(async () => {
  const $ = document.getElementById('root');
  const B = (l) => '<span class="badge badge-' + l + '">' + l + '</span>';
  const V = (l) => 'v-' + l;
  const N = (v, d) => typeof v === 'number' ? v.toFixed(d ?? 1) : '-';

  // Advisor human-readable titles/descriptions
  const ADV = {
    'page-break-pressure': {
      title: 'Atlas Page Break Pressure',
      desc: 'Multiple atlas pages force texture rebinds during rendering. Each page switch flushes the GPU batch and starts a new draw call. Pack all attachments onto fewer atlas pages, or reorder slots so same-page regions are adjacent.',
      icon: '📄'
    },
    'blend-switch-pressure': {
      title: 'Blend Mode Switching',
      desc: 'Non-normal blend modes (additive, multiply, screen) force batch breaks. Each switch changes the GPU blend state and flushes pending geometry. Group same-blend-mode slots together in the draw order.',
      icon: '🎨'
    },
    'mesh-density-pressure': {
      title: 'High Mesh Vertex Density',
      desc: 'Large mesh vertex counts increase both GPU fill cost and CPU skinning time. Consider reducing mesh resolution, using fewer control points, or converting complex meshes to simpler region attachments where deformation is not needed.',
      icon: '🔺'
    },
    'constraint-pressure': {
      title: 'Constraint Processing Load',
      desc: 'Physics, IK, path, and transform constraints run every frame on the CPU. Physics constraints are the heaviest. Consider disabling constraints that are not visually important, or reducing the number of constrained bones.',
      icon: '⚙️'
    },
    'stable-profile': {
      title: 'Stable Performance Profile',
      desc: 'No significant performance hotspots detected. The skeleton is well-optimized for real-time rendering.',
      icon: '✅'
    }
  };

  try {
    const res = await fetch('/api/reports/${id}');
    if (!res.ok) { $.innerHTML = '<div class="expired">This report has expired or does not exist.</div>'; return; }
    const { meta, analysisUrl, screenshotUrls } = await res.json();
    const ar = await fetch(analysisUrl);
    const a = await ar.json();

    // Separate main screenshot from animation GIFs
    const mainScreenshot = screenshotUrls.find(u => u.includes('screenshot/0')) || screenshotUrls[0];
    const animGifs = {};
    screenshotUrls.forEach((url, i) => {
      // Animation GIFs are stored after the main screenshot
      // Match them by index to animation names from meta
      if (i > 0 && meta.animationNames && meta.animationNames[i - 1]) {
        // Not reliable by index. Use the original filename pattern instead.
      }
    });
    // Build GIF map from screenshotUrls: index 0 = main, index 1+ = animations in order
    const gifByAnim = {};
    if (meta.animationNames) {
      meta.animationNames.forEach((name, i) => {
        const gifIdx = i + 1; // +1 because index 0 is the main screenshot
        if (gifIdx < screenshotUrls.length) {
          gifByAnim[name] = screenshotUrls[gifIdx];
        }
      });
    }

    let h = '';

    // Header
    h += '<div class="header">';
    h += '<div class="logo">SB</div>';
    h += '<div class="header-text">';
    h += '<h1>' + (meta.skeletonName || 'Spine Report') + '</h1>';
    h += '<div class="sub">';
    h += '<span>Spine ' + meta.spineVersion + '</span>';
    h += '<span>' + meta.totalAnimations + ' animations</span>';
    h += '<span>' + (a.skeleton?.totalBones || '-') + ' bones</span>';
    h += '<span>' + (a.overview?.totalAnimations || '-') + ' skins</span>';
    const created = new Date(meta.createdAt).toLocaleDateString('en', {year:'numeric',month:'short',day:'numeric'});
    const expires = new Date(meta.expiresAt).toLocaleDateString('en', {year:'numeric',month:'short',day:'numeric'});
    h += '<span>Expires ' + expires + '</span>';
    h += '</div></div></div>';

    // Hero screenshot
    if (mainScreenshot) {
      h += '<img class="hero-img" src="' + mainScreenshot + '" loading="lazy" />';
    }

    // Impact cards
    const riW = a.summary?.rendering?.worst || {cost:0,level:'minimal'};
    const ciW = a.summary?.computational?.worst || {cost:0,level:'minimal'};
    h += '<div class="cards">';
    h += '<div class="card"><div class="card-label">Worst Rendering Impact (GPU)</div>';
    h += '<div class="card-value ' + V(riW.level) + '">' + N(riW.cost) + '</div>';
    h += '<div style="margin-top:4px">' + B(riW.level) + '</div></div>';
    h += '<div class="card"><div class="card-label">Worst Computational Impact (CPU)</div>';
    h += '<div class="card-value ' + V(ciW.level) + '">' + N(ciW.cost) + '</div>';
    h += '<div style="margin-top:4px">' + B(ciW.level) + '</div></div>';
    h += '</div>';

    // Hotspots
    if (a.hotspots) {
      const hs = a.hotspots;
      h += '<h2>Performance Hotspots</h2>';
      h += '<div class="hotspots">';
      const spots = [
        ['Page Breaks', hs.peakPageBreaks, hs.peakPageBreaks > 3 ? 'v-orange' : ''],
        ['Blend Switches', hs.peakBlendSwitches, hs.peakBlendSwitches > 2 ? 'v-yellow' : ''],
        ['Peak Vertices', hs.peakMeshDensity, hs.peakMeshDensity > 500 ? 'v-orange' : ''],
        ['Constraints', hs.peakConstraintLoad, hs.peakConstraintLoad > 5 ? 'v-yellow' : ''],
        ['Physics', hs.peakPhysicsConstraints, hs.peakPhysicsConstraints > 2 ? 'v-orange' : ''],
        ['IK Chains', hs.peakIkConstraints, ''],
      ];
      for (const [label, val, cls] of spots) {
        h += '<div class="hotspot"><div class="hotspot-val ' + cls + '">' + (val || 0) + '</div><div class="hotspot-label">' + label + '</div></div>';
      }
      h += '</div>';
    }

    // Advisor
    if (a.advisor && a.advisor.length > 0) {
      h += '<h2>Optimization Advisor</h2>';
      for (const item of a.advisor) {
        const info = ADV[item.id] || { title: item.id, desc: item.bodyKey || '', icon: 'i' };
        h += '<div class="advisor-item sev-' + item.severity + '">';
        h += '<div class="advisor-icon sev-' + item.severity + '">' + info.icon + '</div>';
        h += '<div class="advisor-body">';
        h += '<div class="advisor-title">' + info.title + '</div>';
        h += '<div class="advisor-desc">' + info.desc + '</div>';
        if (item.affectedAnimations && item.affectedAnimations.length > 0) {
          h += '<div class="advisor-anims">';
          for (const an of item.affectedAnimations) h += '<span>' + an + '</span>';
          h += '</div>';
        }
        h += '</div></div>';
      }
    }

    // Per-animation detail cards
    if (a.animations && a.animations.length > 0) {
      h += '<h2>Animation Details</h2>';
      h += '<div class="anim-grid">';
      for (const anim of a.animations) {
        const ri = anim.rendering?.cost ?? 0;
        const ci = anim.computational?.cost ?? 0;
        const total = anim.totalCost ?? (ri + ci);
        const level = anim.rowTone === 'danger' ? 'veryHigh' : anim.rowTone === 'warning' ? 'high' : (anim.rendering?.level || 'minimal');
        const dur = typeof anim.durationSec === 'number' ? anim.durationSec.toFixed(2) + 's' : '-';
        const gifUrl = gifByAnim[anim.name];

        h += '<div class="anim-card">';
        h += '<div class="anim-card-header"><h3>' + anim.name + '</h3><span class="dur">' + dur + ' ' + B(level) + '</span></div>';
        h += '<div class="anim-card-body">';

        // GIF preview or placeholder
        if (gifUrl) {
          h += '<img class="anim-gif" src="' + gifUrl + '" loading="lazy" />';
        } else {
          h += '<div class="anim-gif-placeholder">No preview</div>';
        }

        // Metrics
        h += '<div class="anim-metrics">';
        h += '<div class="anim-metrics-row">';
        h += '<div class="anim-metric"><div class="anim-metric-label">Rendering Impact</div><div class="anim-metric-value ' + V(anim.rendering?.level || 'minimal') + '">' + N(ri) + '</div></div>';
        h += '<div class="anim-metric"><div class="anim-metric-label">Computational Impact</div><div class="anim-metric-value ' + V(anim.computational?.level || 'minimal') + '">' + N(ci) + '</div></div>';
        h += '<div class="anim-metric"><div class="anim-metric-label">Total Cost</div><div class="anim-metric-value">' + N(total) + '</div></div>';
        h += '</div>';

        // Hotspot breakdown
        if (anim.hotspots) {
          h += '<div class="anim-metrics-row">';
          h += '<div class="anim-metric"><div class="anim-metric-label">Page Breaks</div><div class="anim-metric-value">' + (anim.hotspots.pageBreaks || 0) + '</div></div>';
          h += '<div class="anim-metric"><div class="anim-metric-label">Blend Switches</div><div class="anim-metric-value">' + (anim.hotspots.blendSwitches || 0) + '</div></div>';
          h += '<div class="anim-metric"><div class="anim-metric-label">Mesh Vertices</div><div class="anim-metric-value">' + (anim.hotspots.meshDensity || 0) + '</div></div>';
          h += '<div class="anim-metric"><div class="anim-metric-label">Constraints</div><div class="anim-metric-value">' + (anim.hotspots.constraints || 0) + '</div></div>';
          h += '</div>';
        }

        // Active features
        if (anim.activeFeatures && anim.activeFeatures.length > 0) {
          h += '<div class="anim-features">';
          const allFeatures = ['physics', 'ik', 'clipping', 'blend'];
          for (const f of allFeatures) {
            const active = anim.activeFeatures.includes(f);
            h += '<span class="feature-tag' + (active ? ' active' : '') + '">' + f + '</span>';
          }
          h += '</div>';
        }

        h += '</div>'; // anim-metrics
        h += '</div>'; // anim-card-body
        h += '</div>'; // anim-card
      }
      h += '</div>';
    }

    // Compact summary table
    if (a.animations && a.animations.length > 1) {
      h += '<h2>Quick Comparison</h2>';
      h += '<table><thead><tr><th>Animation</th><th>Duration</th><th class="num">RI</th><th class="num">CI</th><th class="num">Total</th><th>Level</th></tr></thead><tbody>';
      for (const anim of a.animations) {
        const ri = anim.rendering?.cost ?? 0;
        const ci = anim.computational?.cost ?? 0;
        const total = anim.totalCost ?? (ri + ci);
        const level = anim.rowTone === 'danger' ? 'veryHigh' : anim.rowTone === 'warning' ? 'high' : 'minimal';
        const rc = anim.rowTone === 'danger' ? 'row-danger' : anim.rowTone === 'warning' ? 'row-warning' : '';
        const dur = typeof anim.durationSec === 'number' ? anim.durationSec.toFixed(2) + 's' : '-';
        h += '<tr class="' + rc + '"><td>' + anim.name + '</td><td class="num">' + dur + '</td>';
        h += '<td class="num">' + N(ri) + '</td><td class="num">' + N(ci) + '</td>';
        h += '<td class="num" style="font-weight:600">' + N(total) + '</td>';
        h += '<td>' + B(level) + '</td></tr>';
      }
      h += '</tbody></table>';
    }

    // File hashes
    if (meta.fileHashes && meta.fileHashes.length > 0) {
      h += '<h2>Source Files</h2>';
      h += '<dl class="hashes">';
      for (const f of meta.fileHashes) {
        h += '<dt>' + f.name + ' (' + (f.size / 1024).toFixed(1) + ' KB)</dt>';
        h += '<dd>SHA-256: ' + f.sha256 + '</dd>';
      }
      h += '</dl>';
    }

    // Footer
    h += '<div class="footer">';
    h += 'Generated by <a href="https://github.com/schmooky/spine-benchmark" target="_blank">Spine Benchmark</a>';
    h += ' | Report ' + meta.id + ' | Created ' + created;
    h += '</div>';

    $.innerHTML = h;
  } catch (err) {
    $.innerHTML = '<div class="expired">Failed to load report: ' + err.message + '</div>';
  }
})();
</script>
</body>
</html>`;
}

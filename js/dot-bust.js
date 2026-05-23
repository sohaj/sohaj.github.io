/* =====================================================================
 *  dot-bust.js
 *  ---------------------------------------------------------------------
 *  A "shatter on hover" portrait. At rest it's just the photograph —
 *  no canvas, no dots, no animation. As soon as the cursor enters the
 *  stage a circular hole carves into the photo at the pointer and the
 *  pixels inside that hole disintegrate into a ring of dots flying
 *  outward. Move the cursor and the hole follows; leave and the photo
 *  reseals.
 *
 *  Mechanics:
 *
 *    • The photo is a plain <img> inside the stage. A CSS radial-
 *      gradient mask driven by --mx / --my CSS variables creates a
 *      transparent disk centered on the cursor.
 *
 *    • A WebGL canvas overlays the photo and renders ~90k particles
 *      sampled from the photo's silhouette + color. Each particle is
 *      invisible by default — only inside the cursor's radius does its
 *      alpha rise and its position get pushed outward, so the "spray"
 *      of dots appears to spill out of the hole the cursor cut.
 *
 *    • Optional: drop a real .glb at models/sohaj.glb and the script
 *      auto-switches to a kodee.no-style rotating particle bust with
 *      the assemble-on-load intro animation. The photo overlay is
 *      hidden in mesh mode because the model itself is the portrait.
 * =================================================================== */

(function () {
  'use strict';

  /* ----------------------------------------------------------------- *
   *  Config                                                          *
   * ----------------------------------------------------------------- */
  // Drop a .glb of yourself here to upgrade from depth-cloud → true 3D
  // bust. The file must be CORS-readable from the same origin.
  // Recommended pipeline: photo → image-to-3D service (Meshy / Tripo /
  // TripoSR / Hyper3D) → export as .glb. Latest model is sourced from
  // Meshy AI and lives alongside the photo in img/ for convenience.
  const MODEL_URL  = 'img/Meshy_AI_Sohaj.glb';     // try mesh mode first
  // Source for the depth-mode halftone. We deliberately use ONLY the color
  // photo: its alpha channel (or white background) gives a sharp silhouette,
  // its luminance acts as faux-depth, and its RGB drives per-dot color.
  // Mixing in Sohaj_depthmap.png misaligns badly because the two PNGs are
  // framed differently (depth has a pedestal, color is shoulders-up).
  const COLOR_SRC  = 'img/cover_sohaj_simple.png';

  /* ---- particle field --------------------------------------------- */
  const TARGET_COUNT  = 50000;  // bust dot count — looser than 90k so the
                                // photo reads through and the silhouette
                                // feels sketched rather than airbrushed.

  /* ---- background dust ------------------------------------------- *
   * A second, much sparser point cloud drifting in the empty space
   * around the bust. Lives directly on the scene root (NOT the bust
   * group) so it stays stable in screen space when the bust rotates.
   * Additive blending → it reads as atmospheric haze on the black
   * background without ever competing with the portrait itself.    */
  const BG_COUNT       = 6000;  // denser dust field for the portrait stage
  const BG_SPREAD_X    = 5.6;   // half-extent of the dust box in world X
  const BG_SPREAD_Y    = 4.4;   // half-extent in world Y
  const BG_Z_NEAR      = -1.0;  // closest dust z (just behind bust skin)
  const BG_Z_FAR       = -4.5;  // farthest dust z (deep background)
  const BG_POINT_SIZE  = 0.030; // slightly smaller for the denser/wider spread
  const BG_OPACITY     = 0.50;
  const BG_TINT        = [0.96, 0.94, 0.88];

  /* ---- look ------------------------------------------------------- */
  const POINT_SIZE       = 0.060; // base size factor for each dot sprite
  const BUST_SCALE       = 6.4;   // world-space width of the bust plane
  const COLOR_BOOST      = 1.20;  // mild boost; we no longer fight a dark BG
  // Tints by mode. Depth mode is the photo-shatter UX → keep photo colors
  // honest. Mesh mode is the rotating bust with per-particle texture
  // samples → very mild warm wash, mostly preserving the surface colors.
  const TINT_DEPTH       = [1.0, 1.0, 1.0];
  const TINT_MESH        = [1.0, 0.97, 0.92];

  /* ---- mesh mode (used only if models/sohaj.glb exists) ----------- */
  // Shortened from 2600ms → 1600ms. The previous value made the intro
  // feel sluggish because dispatchAssembled fires at 75% of this
  // window — i.e. the rest of the page sat blurred for nearly 2s
  // AFTER the dots were obviously resolving. 1600ms still reads as a
  // deliberate assemble (no jump-cut) and gets the page revealed
  // about 800ms sooner.
  const ASSEMBLE_MS      = 4200;
  // Locked at 0 — Meshy reconstructs the model from the input photo's
  // viewpoint, so the GLB's natural orientation IS the photo angle. Any
  // auto-rotation would drift the bust away from that match. Set to a
  // small non-zero value (e.g. 0.04) if you ever want a slow turn back.
  const FULL_AUTO_ROTATE = 0.0;
  // Bust yaw, in radians. The new Meshy AI model is reconstructed from
  // the input photo's viewpoint, so its natural orientation already
  // matches the photo angle — no manual rotation needed. Adjust this
  // only if the bust looks turned relative to the photo. Live-tune in
  // the browser with Shift + ◀ / ▶ once the bust section is in view;
  // the console logs each new value so you can bake it in here later.
  // Negative values turn the head toward viewer's left, positive right.
  const BUST_ROTATION_Y  = 0.0;
  // Horizontal bias applied AFTER the auto-fit head alignment, in NDC
  // units (range −1..+1 across the stage width). The stage lives in the
  // right column (.hero-image) so no bias is needed — the portrait is
  // already centred within its column.
  const BUST_X_BIAS_NDC  = 0.0;

  /* ---- shatter-on-hover field (depth mode) ------------------------ */
  // Photo carve — the radial-gradient mask cut into the <img>. All sizes
  // are in CSS pixels relative to the stage element.
  const HOLE_RADIUS_PX   = 110;  // fully transparent disk radius at cursor
  const HOLE_FADE_PX     = 70;   // soft edge from transparent → opaque
  // Particle spray — world-space sphere of influence.
  const CURSOR_RADIUS    = 1.6;  // world-space radius of influence
  const CURSOR_STRENGTH  = 0.85; // peak outward displacement at cursor center
  const CURSOR_EASE      = 0.18; // 0..1 — lower = laggier, springier follow
  const MASK_EASE        = 0.28; // CSS mask ease; faster than dots so the hole leads

  /* ---- ripple / photo-reveal field (mesh mode) -------------------- */
  // Disturbance model: every ~RIPPLE_INTERVAL_MS while the cursor is over
  // the stage we spawn a ripple (a fading impulse) at the cursor position.
  // Each ripple's life follows a smooth fade-in → linear decay envelope
  // (RIPPLE_RISE_FRAC of lifetime ramps 0→1, then linear 1→0 to expiry),
  // so spawning doesn't cause a sudden step in displacement. Up to
  // MAX_RIPPLES live at once; the shader sums their contributions and
  // weights by life² for a soft decay tail.
  // Sized so MAX_RIPPLES × INTERVAL > LIFE_MS — that way the oldest ripple
  // always reaches life ≈ 0 naturally before it gets dropped from the
  // buffer. Otherwise dropping a still-significant ripple would cause a
  // visible jump in the displacement field.
  const MAX_RIPPLES        = 32;
  const RIPPLE_LIFE_MS     = 2200;
  const RIPPLE_INTERVAL_MS = 70;   // ~4 frames at 60fps
  const RIPPLE_RISE_FRAC   = 0.10; // first 10% of lifetime fades in
  const RIPPLE_RADIUS      = 1.7;  // world-space radius of one ripple
  // Per-ripple displacement contribution. We SUM across all active ripples
  // in the shader, so this needs to be modest — at steady state the sum
  // of life² over 32 stacked ripples is ≈ 9–10. Strength 0.10 gives a
  // peak displacement of ≈ 1 world unit, visible without blasting dots.
  const RIPPLE_STRENGTH    = 0.10;
  // Photo reveal — radial-gradient mask shows the photo only near the
  // cursor (inverse of depth mode's "carve a hole" mask).
  const REVEAL_RADIUS_PX  = 130;
  const REVEAL_FADE_PX    = 60;

  /* ----------------------------------------------------------------- *
   *  Bail-outs                                                       *
   * ----------------------------------------------------------------- */
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    console.info('[dot-bust] reduced motion — skipping');
    return;
  }
  if (!hasWebGL()) {
    console.warn('[dot-bust] WebGL not available — skipping');
    return;
  }

  /* ----------------------------------------------------------------- *
   *  Bootstrap                                                       *
   * ----------------------------------------------------------------- */
  // Ambient dust canvas that spans the entire hero section, independently
  // of the Three.js portrait stage which stays inside its right column.
  initAmbientDust();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadThree);
  } else {
    loadThree();
  }

  function loadThree() {
    if (window.THREE) return main(window.THREE);
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/three@0.158.0/build/three.min.js';
    s.onload  = () => main(window.THREE);
    s.onerror = () => console.warn('[dot-bust] failed to load three.js');
    document.head.appendChild(s);
  }

  /* ================================================================= *
   *  Main                                                             *
   * ================================================================= */
  function main(THREE) {
    // Prefer the cover/hero stage (`#hero-dot-stage`, where the dot
    // bust now lives, overlaid on the cover portrait). Fall back to
    // the legacy standalone section selector `#particle-bust-stage`
    // for any page that still uses it.
    const container = document.querySelector('#hero-dot-stage, #particle-bust-stage');
    if (!container) {
      console.info('[dot-bust] no dot stage on page — skipping');
      return;
    }

    // Lock STAGE_ASPECT to the actual rendered container aspect so the
    // photo-back-projection math in tryMeshMode produces dots that land
    // exactly where the photograph sits inside this stage. Without this
    // a stage with aspect ≠ 4/5 (e.g. the hero stage, sized to the
    // photo's native 1780/2054) would render dots horizontally squeezed
    // relative to the photo overlay.
    {
      const r = container.getBoundingClientRect();
      if (r.width > 1 && r.height > 1) {
        STAGE_ASPECT = r.width / r.height;
      }
    }

    /* canvas ----------------------------------------------------------- */
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'block',
      // No cursor / no pointer-events: the stage is now a non-interactive
      // background spanning the whole hero. The navbar floats above it
      // and needs to receive clicks. Pointer tracking for the hover
      // reveal happens on `window` (see onPointerMove below), so the
      // effect still works fine with the canvas itself inert.
      pointerEvents: 'none',
    });
    container.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0, 11);

    const group = new THREE.Group();
    scene.add(group);

    /* try mesh mode first, otherwise fall back to depth mode ---------- */
    tryMeshMode(THREE, MODEL_URL).then((result) => {
      console.info('[dot-bust] mesh mode — particles:', result.samples.length);
      buildAndRun(THREE, {
        renderer, scene, camera, group, container, canvas,
        samples:   result.samples,
        recenterX: result.recenterX,
        recenterY: result.recenterY,
        fitScale:  result.fitScale,
        mode:      'mesh',
      });
    }).catch((meshErr) => {
      if (meshErr && meshErr.code !== 'NO_MODEL') {
        console.info('[dot-bust] mesh mode unavailable, falling back to depth mode:', meshErr.message || meshErr);
      }
      depthModeSamples(THREE).then((samples) => {
        console.info('[dot-bust] depth mode — particles:', samples.length);
        buildAndRun(THREE, {
          renderer, scene, camera, group, container, canvas,
          samples,
          recenterX: 0,    // depth mode is already photo-aligned
          recenterY: 0,
          fitScale:  1,
          mode: 'depth',
        });
      }).catch((err) => {
        console.warn('[dot-bust] depth mode failed too — giving up.', err);
        canvas.remove();
      });
    });
  }

  /* ================================================================= *
   *  Mesh mode — surface-sample a GLB                                 *
   * ================================================================= *
   *
   *  Color strategy: the GLB's baked texture from Meshy is fairly flat
   *  (smooth skin tone, soft lighting). Sampling it directly gives a
   *  uniform-looking dot field where facial features don't pop. So we
   *  instead PROJECT each surface dot back into the photograph and
   *  sample THAT — the photo has all the tonal richness (dark eyes,
   *  beard, hair, bright cheekbones) needed for the halftone "sculpted
   *  by light" look. The GLB texture is kept only as a fallback for
   *  dots that project outside the photo's silhouette (e.g. the back
   *  of the head after rotation).
   *
   *  Alignment math: we project the rotated 3D positions to NDC using
   *  the same camera the renderer uses, then map the NDC bounding box
   *  of the bust to the foreground bounding box of the photo. That
   *  makes the bust dots line up with the photo's subject regardless
   *  of differing framing or scale between the two.
   * ================================================================= */
  // Camera / stage constants used for the photo back-projection. The
  // legacy section below used a hard `aspect-ratio: 4/5` phone-frame
  // stage. The new in-cover hero stage (`#hero-dot-stage`) is sized to
  // the source photo's native aspect (1780/2054 ≈ 0.866) so the dot
  // portrait overlays the original photograph 1:1. STAGE_ASPECT is set
  // from the actual container dimensions at startup (see main()) so the
  // NDC↔world projection math below matches whichever stage we're in.
  let STAGE_ASPECT = 4 / 5;
  const CAMERA_FOV   = 34;       // degrees, vertical
  const CAMERA_Z     = 11;

  async function tryMeshMode(THREE, url) {
    if (!url) throw { code: 'NO_MODEL' };
    // Cheap probe — saves importing GLTFLoader for users who don't have a model yet.
    let probeOk = false;
    try {
      const res = await fetch(url, { method: 'HEAD' });
      probeOk = res.ok;
    } catch (_) { /* CORS / file:// — fall through and try the loader anyway */ }
    if (!probeOk) {
      // file:// or HEAD blocked — give it one real shot via GET, then bail cleanly.
      try {
        const res = await fetch(url);
        if (!res.ok) throw { code: 'NO_MODEL' };
      } catch (_) { throw { code: 'NO_MODEL' }; }
    }

    // GLTFLoader lives in the examples ESM bundle; pull it on demand.
    const mod = await import('https://unpkg.com/three@0.158.0/examples/jsm/loaders/GLTFLoader.js').catch(async () => {
      // Fallback CDN in case unpkg ESM is unreachable.
      return await import('https://esm.sh/three@0.158.0/examples/jsm/loaders/GLTFLoader.js');
    });
    const GLTFLoader = mod.GLTFLoader;

    const loader = new GLTFLoader();
    const gltf = await new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));

    // Gather every triangle with world-space position + normal + uv, plus
    // a per-triangle material index so each particle knows which texture
    // to sample its color from. (Meshy exports typically have a single
    // PBR atlas, but we handle multi-material meshes too.)
    const positions = [];
    const normals   = [];
    const uvs       = [];
    const triMatIdx = [];                          // material index per triangle
    const samplers  = [];                          // (u,v) → [r,g,b], indexed
    const matToIdx  = new Map();                   // material → samplers index

    function getMaterialSampler(material) {
      if (!material) return solidSampler([1, 1, 1]);
      const tex = material.map;                    // PBR baseColor texture
      if (tex && tex.image && isDrawable(tex.image)) {
        return makeTextureSampler(tex.image);
      }
      if (material.color) {                        // solid material color
        return solidSampler([material.color.r, material.color.g, material.color.b]);
      }
      return solidSampler([1, 1, 1]);
    }

    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((node) => {
      if (!node.isMesh) return;
      const g = node.geometry.clone().toNonIndexed();
      g.applyMatrix4(node.matrixWorld);
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      const pos = g.getAttribute('position');
      const nrm = g.getAttribute('normal');
      const uv  = g.getAttribute('uv');

      // Resolve this mesh's material once into a sampler index.
      const mat = Array.isArray(node.material) ? node.material[0] : node.material;
      let matIdx = matToIdx.get(mat);
      if (matIdx === undefined) {
        matIdx = samplers.length;
        matToIdx.set(mat, matIdx);
        samplers.push(getMaterialSampler(mat));
      }

      for (let i = 0; i < pos.count; i++) {
        positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        normals  .push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
        uvs      .push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      }
      const meshTriCount = Math.floor(pos.count / 3);
      for (let t = 0; t < meshTriCount; t++) triMatIdx.push(matIdx);

      g.dispose();
    });
    const triCount = Math.floor(positions.length / 9);
    if (triCount === 0) throw new Error('GLB had no mesh geometry');
    console.info('[dot-bust] gltf parsed — meshes/materials:', samplers.length, 'triangles:', triCount);

    // Cumulative-area distribution, so sampling is uniform per-area
    // (not per-triangle — large triangles get proportionally more dots).
    const cdf = new Float32Array(triCount);
    let total = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3();
    for (let t = 0; t < triCount; t++) {
      const o = t * 9;
      a.set(positions[o    ], positions[o + 1], positions[o + 2]);
      b.set(positions[o + 3], positions[o + 4], positions[o + 5]);
      c.set(positions[o + 6], positions[o + 7], positions[o + 8]);
      ab.subVectors(b, a); ac.subVectors(c, a);
      total += ab.cross(ac).length() * 0.5;
      cdf[t] = total;
    }
    for (let t = 0; t < triCount; t++) cdf[t] /= total;

    // Center + scale the bounding box so the bust fits BUST_SCALE.
    const box = new THREE.Box3();
    const tmp = new THREE.Vector3();
    for (let i = 0; i < positions.length; i += 3) {
      tmp.set(positions[i], positions[i + 1], positions[i + 2]);
      box.expandByPoint(tmp);
    }
    const size = new THREE.Vector3(); box.getSize(size);
    const cen  = new THREE.Vector3(); box.getCenter(cen);
    const fit  = BUST_SCALE / Math.max(size.x, size.y, size.z);

    // Try to build a photo sampler — provides per-dot color from the
    // photograph instead of from the GLB's flatter texture. Optional;
    // if it fails (CORS, missing file) we fall back to the GLB color.
    let photoFg = null;
    try {
      photoFg = await buildPhotoSampler(COLOR_SRC);
      console.info('[dot-bust] photo color sampling enabled — fg box uv:',
        photoFg.u0.toFixed(2), photoFg.v0.toFixed(2),
        photoFg.u1.toFixed(2), photoFg.v1.toFixed(2));
    } catch (e) {
      console.warn('[dot-bust] photo color unavailable, using GLB texture only', e);
    }

    /* --- Pass 1: surface sample + Option C (back-face cull) ---------
     *  We oversample (~2.6× TARGET_COUNT) because two subsequent filters
     *  drop samples:
     *    • Option C — back-face cull. After applying BUST_ROTATION_Y,
     *      any sample whose surface normal points away from the camera
     *      (rotated Nz ≤ 0) is the "back of the head" / rear of jacket
     *      and would never be visible — drop it at sample time so it
     *      never makes it into the buffer. This snaps the bust's
     *      silhouette to the FRONT of the model, which lines up far
     *      better with the photo's silhouette than the full bbox did.
     *    • Option D — photo-silhouette filter (pass 3 below).
     *  Together these retain ~40% of attempts → 2.6× oversample lands
     *  close to TARGET_COUNT survivors. We cap at TARGET_COUNT in pass 3
     *  so the buffers stay bounded.
     * ----------------------------------------------------------------- */
    const tanHalfFov = Math.tan(CAMERA_FOV * Math.PI / 360);
    const cosR = Math.cos(BUST_ROTATION_Y);
    const sinR = Math.sin(BUST_ROTATION_Y);

    // Back-face cull threshold (Option C). Scales with the rotation so
    // the side silhouette stays visible — at BUST_ROTATION_Y = 0 the
    // model's side normals have rNz = 0 and we want them in, so a hair
    // below zero is enough. At larger rotations the visible side has
    // rNz ≈ -|sin(rot)|, so the threshold loosens to match.
    const CULL_THRESHOLD = -Math.abs(sinR) - 0.05;

    const OVERSAMPLE_FACTOR = 2.6;
    const overCount = Math.floor(TARGET_COUNT * OVERSAMPLE_FACTOR);

    const allSamples = [];
    const allFbSu = new Float32Array(overCount);
    const allFbSv = new Float32Array(overCount);
    const allFbMi = new Int32Array(overCount);
    let p1Attempts = 0;
    const p1MaxAttempts = overCount * 6;
    while (allSamples.length < overCount && p1Attempts < p1MaxAttempts) {
      p1Attempts++;
      // Binary-search a random uniform into the CDF.
      let lo = 0, hi = triCount - 1;
      const r = Math.random();
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (cdf[m] < r) lo = m + 1; else hi = m;
      }
      const o = lo * 9;
      // Barycentric coords with the sqrt-trick for uniform-on-triangle.
      const u1 = Math.sqrt(Math.random()), u2 = Math.random();
      const w0 = 1 - u1, w1 = u1 * (1 - u2), w2 = u1 * u2;

      let nx = normals[o    ] * w0 + normals[o + 3] * w1 + normals[o + 6] * w2;
      let ny = normals[o + 1] * w0 + normals[o + 4] * w1 + normals[o + 7] * w2;
      let nz = normals[o + 2] * w0 + normals[o + 5] * w1 + normals[o + 8] * w2;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;

      // Option C — back-face cull. Rotate the normal by BUST_ROTATION_Y
      // and reject anything whose Z component is past CULL_THRESHOLD.
      // The threshold is set just past where the visible silhouette
      // sits at this rotation, so the visible side stays in and only
      // the actual back of the model is dropped. See CULL_THRESHOLD
      // computation above for the rotation-aware math.
      const rNz = -nx * sinR + nz * cosR;
      if (rNz <= CULL_THRESHOLD) continue;

      const px = (positions[o    ] * w0 + positions[o + 3] * w1 + positions[o + 6] * w2 - cen.x) * fit;
      const py = (positions[o + 1] * w0 + positions[o + 4] * w1 + positions[o + 7] * w2 - cen.y) * fit;
      const pz = (positions[o + 2] * w0 + positions[o + 5] * w1 + positions[o + 8] * w2 - cen.z) * fit;

      const k = allSamples.length;
      const uo = lo * 6;
      // Kept only as a fallback color path when photoFg is unavailable.
      // When photoFg works (the normal case), pass 3 drops dots outside
      // the photo silhouette rather than coloring them from the GLB
      // texture (Option D), so these arrays go unused.
      allFbSu[k] = uvs[uo    ] * w0 + uvs[uo + 2] * w1 + uvs[uo + 4] * w2;
      allFbSv[k] = uvs[uo + 1] * w0 + uvs[uo + 3] * w1 + uvs[uo + 5] * w2;
      allFbMi[k] = triMatIdx[lo];

      allSamples.push({
        pos:    [px, py, pz],
        normal: [nx, ny, nz],
        // color + alpha filled in pass 3 below
        color:  [1, 1, 1],
        alpha:  1,
        seed:   Math.random(),
      });
    }
    console.info(
      '[dot-bust] front-face survivors:', allSamples.length,
      '/ oversample target:', overCount,
      '(attempts:', p1Attempts + ')'
    );

    /* --- Pass 2: project to NDC, find bust bounds ------------------- *
     *  Bounds are now computed from the FRONT-FACING dots only (Option
     *  C already culled the back of the head), so the bbox tightens
     *  around the visible silhouette of the model — the back-of-head
     *  overhang on the right that used to dominate the right edge is
     *  gone, and the bbox-to-photo-bbox mapping below becomes a much
     *  closer match.                                                  */
    const surviving = allSamples.length;
    const ndcCache = new Float32Array(surviving * 2);
    let bxMin = Infinity, bxMax = -Infinity;
    let byMin = Infinity, byMax = -Infinity;
    let bSumX = 0, bSumY = 0;
    for (let n = 0; n < surviving; n++) {
      const p = allSamples[n].pos;
      const rx =  p[0] * cosR + p[2] * sinR;
      const rz = -p[0] * sinR + p[2] * cosR;
      const vz =  rz - CAMERA_Z;
      const ndcX = rx / (-vz * tanHalfFov * STAGE_ASPECT);
      const ndcY = p[1] / (-vz * tanHalfFov);
      ndcCache[n * 2    ] = ndcX;
      ndcCache[n * 2 + 1] = ndcY;
      if (ndcX < bxMin) bxMin = ndcX;
      if (ndcX > bxMax) bxMax = ndcX;
      if (ndcY < byMin) byMin = ndcY;
      if (ndcY > byMax) byMax = ndcY;
      bSumX += ndcX; bSumY += ndcY;
    }
    const bxRange = Math.max(1e-6, bxMax - bxMin);
    const byRange = Math.max(1e-6, byMax - byMin);
    const bustCxNdc = bSumX / surviving;
    const bustCyNdc = bSumY / surviving;

    /* Bust HEAD region — top 38% of bust vertical extent in NDC.
     * Compute bbox + centroid + width over just those samples. The
     * auto-fit below scales so the bust head WIDTH matches the photo
     * head WIDTH and translates so the head centroids overlap. Body
     * proportions follow from there. This is the alignment that
     * matters: a face dot needs to land on the corresponding face
     * pixel, not just on the photo's overall foreground mass. */
    const HEAD_FRAC = 0.38;
    const bustHeadYCut = byMax - (byMax - byMin) * HEAD_FRAC;
    let bhMinX = Infinity, bhMaxX = -Infinity;
    let bhMinY = Infinity, bhMaxY = -Infinity;
    let bhSumX = 0, bhSumY = 0, bhCount = 0;
    for (let n = 0; n < surviving; n++) {
      const ny = ndcCache[n * 2 + 1];
      if (ny < bustHeadYCut) continue;        // skip body dots
      const nx = ndcCache[n * 2];
      if (nx < bhMinX) bhMinX = nx;
      if (nx > bhMaxX) bhMaxX = nx;
      if (ny < bhMinY) bhMinY = ny;
      if (ny > bhMaxY) bhMaxY = ny;
      bhSumX += nx; bhSumY += ny; bhCount++;
    }
    const bustHeadCxNdc = bhCount ? bhSumX / bhCount : bustCxNdc;
    const bustHeadCyNdc = bhCount ? bhSumY / bhCount : bustCyNdc;
    const bustHeadWNdc  = bhCount ? (bhMaxX - bhMinX) : bxRange;

    /* --- Auto-fit: overlay bust silhouette onto photo silhouette ----- *
     *  Now that we know the bust's natural projected NDC bbox (pass 2)
     *  AND the photo's foreground NDC bbox, we solve for a uniform
     *  scale + translation that maps the bust silhouette onto the
     *  photo silhouette. This is what makes the dot bust's face edges
     *  line up with the photo's face edges — instead of relying on
     *  BUST_SCALE being exactly right, we let the math fit the bust
     *  to the photo every load. The resulting fitScale & offset are
     *  applied to group.scale & group.position in buildAndRun, and
     *  re-applied analytically inside pass 3's color sampling so the
     *  photo lookups use each dot's POST-FIT stage position.
     *
     *  Photo COVER math — photo of aspect photoFg.aspect rendered
     *  with `object-fit: cover` inside a stage of aspect STAGE_ASPECT.
     *  In cover mode the photo fully fills the stage; one axis
     *  overflows beyond the stage edges (clipped by overflow:hidden).
     *
     *  photoAspect > STAGE_ASPECT → photo fills height, overflows
     *    width on both sides (bars are negative on U).
     *  photoAspect < STAGE_ASPECT → photo fills width, overflows
     *    height on both top + bottom (bars negative on V).
     *
     *  Convention preserved from the previous contain-mode math:
     *    stage_uv = barU + photo_uv * usableU    (and similarly V)
     *  Inverse:
     *    photo_uv = (stage_uv - barU) / usableU
     *  In cover mode `barU` and/or `barV` are NEGATIVE and the
     *  corresponding `usable*` is > 1 — the math falls out identically
     *  so all downstream code (pass 3 photo-UV lookup, photo subject
     *  bbox projection) stays unchanged. */
    const photoAspect = photoFg ? photoFg.aspect : STAGE_ASPECT;
    const coverOverflowsWidth = photoAspect > STAGE_ASPECT;
    // Stretch factor along each axis. The "long" axis (the one that
    // overflows) has ratio > 1; the "short" axis (which fills the
    // stage exactly) has ratio = 1.
    const usableU = coverOverflowsWidth ? (photoAspect / STAGE_ASPECT) : 1;
    const usableV = coverOverflowsWidth ? 1 : (STAGE_ASPECT / photoAspect);
    const barU = (1 - usableU) / 2;
    const barV = (1 - usableV) / 2;

    let fitScale = 1, offsetNdcX = 0, offsetNdcY = 0;
    if (photoFg) {
      // Photo foreground bbox in stage UV (accounting for the
      // object-fit:contain letterbox).
      const photoSU0 = photoFg.u0 * usableU + barU;
      const photoSU1 = photoFg.u1 * usableU + barU;
      const photoSV0 = photoFg.v0 * usableV + barV;
      const photoSV1 = photoFg.v1 * usableV + barV;
      // Stage UV → NDC (Y flips: stage v=0 → ndc y=+1; stage v=1 → -1).
      const photoNX0 = photoSU0 * 2 - 1;
      const photoNX1 = photoSU1 * 2 - 1;
      const photoNY0 = 1 - photoSV1 * 2;   // bottom-y
      const photoNY1 = 1 - photoSV0 * 2;   // top-y

      // Photo head bbox + centroid in stage UV → NDC.
      const photoHeadSU0 = photoFg.headU0 * usableU + barU;
      const photoHeadSU1 = photoFg.headU1 * usableU + barU;
      const photoHeadNX0 = photoHeadSU0 * 2 - 1;
      const photoHeadNX1 = photoHeadSU1 * 2 - 1;
      const photoHeadWNdc = photoHeadNX1 - photoHeadNX0;
      const photoHeadSCu = photoFg.headCu * usableU + barU;
      const photoHeadSCv = photoFg.headCv * usableV + barV;
      const photoHeadNCx = photoHeadSCu * 2 - 1;
      const photoHeadNCy = 1 - photoHeadSCv * 2;

      // SCALE by head width — this guarantees the face features (eyes,
      // nose, mouth) line up at the right photo pixels. Using the
      // overall bbox here was the bug: bust shoulders are wider/lower
      // than photo shoulders, which dragged the head out of register.
      fitScale = photoHeadWNdc / Math.max(1e-6, bustHeadWNdc);

      // TRANSLATE so the head centroids overlap after scaling. Bodies
      // will inherit their position from this — they may not match
      // pixel-perfect (proportions differ), but Option D crops the
      // overflow and what's left is faithfully aligned to the face.
      // NOTE: We do NOT add BUST_X_BIAS_NDC here. That bias is a
      // PURE VISUAL offset applied to group.position in buildAndRun
      // (and matched on the photo via CSS translateX). Folding it
      // into offsetNdcX would shift the dot's photo-UV lookup off
      // the photo's right edge, dropping all the head's dots in
      // pass 3's "is this UV inside the photo?" cull.
      offsetNdcX = photoHeadNCx - bustHeadCxNdc * fitScale;
      offsetNdcY = photoHeadNCy - bustHeadCyNdc * fitScale;
    }
    // Convert NDC offsets to world offsets for group.position.
    // (Inverse of the projection at z=0: world = ndc * CAMERA_Z * tanHalfFov.)
    const offsetWorldX = offsetNdcX * (CAMERA_Z * tanHalfFov * STAGE_ASPECT);
    const offsetWorldY = offsetNdcY * (CAMERA_Z * tanHalfFov);

    console.info(
      '[dot-bust] auto-fit (head-aligned) — scale:', fitScale.toFixed(3),
      'bust head NDC c:', bustHeadCxNdc.toFixed(3), bustHeadCyNdc.toFixed(3),
      'w:', bustHeadWNdc.toFixed(3),
      'world offset:', offsetWorldX.toFixed(2), offsetWorldY.toFixed(2)
    );

    /* --- Pass 3: photo color via DIRECT stage UV + Option D ---------- *
     *  Re-project each dot through the auto-fit transform so the
     *  sampled photo position matches where the dot will actually
     *  render. For each dot:
     *     post_fit_ndc = pre_fit_ndc * fitScale + offsetNdc
     *  Then ndc → stage UV → photo UV → sample. Option D drops anything
     *  that misses the photo silhouette.
     *
     *  Alpha curve: pow(lum, γ) * scale - floor, clamped. The old
     *  values (γ=1.0, scale=1.15, floor=0.08) were aggressively
     *  halftone — dark hair / beard / shadow side of face fell to
     *  alpha ≈ 0, which made one side of the head read as "cropped"
     *  even though dots existed there. We flatten the curve to
     *  (γ=0.5, scale=1.0, floor=0): every foreground dot stays
     *  meaningfully visible (alpha 0.3–1.0), the photo's own
     *  brightness still drives variation, but the silhouette of the
     *  head is unambiguous on both sides.
     * ----------------------------------------------------------------- */
    const ALPHA_GAMMA = 0.5;
    const ALPHA_SCALE = 1.0;
    const ALPHA_FLOOR = 0.0;

    const samples = [];
    let hitPhoto = 0;
    for (let n = 0; n < surviving; n++) {
      if (samples.length >= TARGET_COUNT) break;
      let cr = 1, cg = 1, cb = 1;
      let keepDot = false;

      if (photoFg) {
        // Full projection through the same transform Three.js will use
        // at render time: scale → rotation → translation → camera.
        // Doing this inline (rather than approximating with a linear
        // NDC scale) keeps the photo color sampling pixel-aligned with
        // where the dot actually lands on screen.
        const p = allSamples[n].pos;
        const sx = p[0] * fitScale;
        const sy = p[1] * fitScale;
        const sz = p[2] * fitScale;
        const rx =  sx * cosR + sz * sinR;
        const rz = -sx * sinR + sz * cosR;
        const wx = rx + offsetWorldX;
        const wy = sy + offsetWorldY;
        const wz = rz;
        const mvz = wz - CAMERA_Z;
        const ndcX = wx / (-mvz * tanHalfFov * STAGE_ASPECT);
        const ndcY = wy / (-mvz * tanHalfFov);
        const stageU = (ndcX + 1) * 0.5;
        const stageV = (1 - ndcY) * 0.5;
        const photoU = (stageU - barU) / usableU;
        const photoV = (stageV - barV) / usableV;
        if (photoU >= 0 && photoU <= 1 && photoV >= 0 && photoV <= 1) {
          const rgb = photoFg.sample(photoU, photoV);
          if (rgb) {
            cr = rgb[0]; cg = rgb[1]; cb = rgb[2];
            keepDot = true;
            hitPhoto++;
          }
        }
        // Option D — anything that didn't hit the photo foreground is
        // dropped (no GLB-texture fallback).
      } else {
        // No photo sampler available — degrade gracefully by coloring
        // every dot from the GLB texture (old behavior).
        const rgb = samplers[allFbMi[n]](allFbSu[n], allFbSv[n]);
        cr = rgb[0]; cg = rgb[1]; cb = rgb[2];
        keepDot = true;
      }
      if (!keepDot) continue;

      const lum = 0.299 * cr + 0.587 * cg + 0.114 * cb;
      const a   = Math.max(0, Math.min(1,
        Math.pow(lum, ALPHA_GAMMA) * ALPHA_SCALE - ALPHA_FLOOR
      ));

      const s = allSamples[n];
      s.color[0] = Math.min(1, cr * COLOR_BOOST);
      s.color[1] = Math.min(1, cg * COLOR_BOOST);
      s.color[2] = Math.min(1, cb * COLOR_BOOST);
      s.alpha    = a;
      samples.push(s);
    }
    console.info(
      '[dot-bust] silhouette survivors:', samples.length,
      '(photo hits:', hitPhoto + ',',
      'rejected:', (surviving - samples.length) + ')'
    );

    // We return the auto-fit transform to be applied in buildAndRun.
    // Field names kept as recenterX/recenterY for backwards-compat with
    // the caller signature; semantically these are now "world-space
    // offsets to apply via group.position", not "photo shift amounts".
    return {
      samples,
      recenterX: offsetWorldX,
      recenterY: offsetWorldY,
      fitScale,
      visualNdc: { x: 0, y: 0 },
    };
  }

  /* ----------------------------------------------------------------- *
   *  Photo sampler — RGB + foreground bbox                            *
   * ----------------------------------------------------------------- *
   *  Returns a sampler that reads the photo at uv ∈ [0,1]², returning
   *  [r,g,b] for foreground pixels and null for background. Also
   *  exposes (u0,v0,u1,v1) — the tightest axis-aligned bounding box of
   *  the foreground in normalized UV space — which lets the caller map
   *  bust-NDC space directly onto the photo subject.                  */
  async function buildPhotoSampler(src) {
    const img  = await loadImage(src);
    const rast = rasterize(img, 1024);
    if (!rast.data) throw new Error('photo not rasterizable (CORS?)');
    const { data, cw, ch } = rast;

    // Background detection: alpha if pre-keyed, else white-background.
    // An image is "alpha-keyed" when it has BOTH near-transparent pixels
    // (background) and opaque pixels (subject). The old check looked at
    // maxAlpha only, which was always 255 for any normal PNG with an
    // opaque subject — so alpha-keyed photos fell through to the
    // white-background path and the entire image was classified as
    // foreground, breaking the bbox mapping in pass 3.
    let minAlpha = 255, maxAlpha = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < minAlpha) minAlpha = a;
      if (a > maxAlpha) maxAlpha = a;
    }
    const usesAlpha = minAlpha < 32 && maxAlpha >= 200;
    function isFg(idx) {
      const a = data[idx + 3];
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      return usesAlpha ? (a >= 32) : !(r > 240 && g > 240 && b > 240);
    }

    // Two passes:
    //   1. Foreground bbox + overall centroid.
    //   2. HEAD-region bbox + centroid (top fraction of the bbox).
    // The head centroid is what the auto-fit aligns to — bodies have
    // asymmetric mass (one shoulder closer to camera, jacket wider on
    // one side) but the head is roughly centered above the torso, so
    // aligning HEAD ↔ HEAD keeps face features registered correctly
    // even when the photo is a 3/4 pose and the GLB is symmetric.
    let minX = cw, maxX = -1, minY = ch, maxY = -1;
    let sumX = 0, sumY = 0, fgCount = 0;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const idx = (y * cw + x) * 4;
        if (isFg(idx)) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          sumX += x; sumY += y; fgCount++;
        }
      }
    }
    if (maxX < minX || maxY < minY) throw new Error('photo has no foreground');
    const cxPx = sumX / fgCount;
    const cyPx = sumY / fgCount;

    // Head region: top 38% of the foreground's vertical extent. This
    // captures the head + a sliver of neck reliably across portraits
    // without leaking shoulders into the centroid.
    const HEAD_FRAC = 0.38;
    const headYCutPx = minY + (maxY - minY) * HEAD_FRAC;
    let hMinX = cw, hMaxX = -1, hMinY = ch, hMaxY = -1;
    let hSumX = 0, hSumY = 0, hCount = 0;
    for (let y = minY; y <= Math.min(maxY, headYCutPx); y++) {
      for (let x = minX; x <= maxX; x++) {
        const idx = (y * cw + x) * 4;
        if (isFg(idx)) {
          if (x < hMinX) hMinX = x;
          if (x > hMaxX) hMaxX = x;
          if (y < hMinY) hMinY = y;
          if (y > hMaxY) hMaxY = y;
          hSumX += x; hSumY += y; hCount++;
        }
      }
    }
    const headCxPx = hCount ? hSumX / hCount : cxPx;
    const headCyPx = hCount ? hSumY / hCount : cyPx;

    return {
      u0: minX / cw, v0: minY / ch,
      u1: maxX / cw, v1: maxY / ch,
      // Overall centroid (kept for diagnostics).
      cu: cxPx / cw, cv: cyPx / ch,
      // Head bbox + centroid in UV [0..1].
      headU0: hMinX / cw, headV0: hMinY / ch,
      headU1: hMaxX / cw, headV1: hMaxY / ch,
      headCu: headCxPx / cw, headCv: headCyPx / ch,
      // Native photo aspect — used by pass 3 to figure out the
      // object-fit:contain letterbox so direct stage→photo mapping
      // can subtract the bars.
      aspect: cw / ch,
      sample(u, v) {
        if (u < 0 || u > 1 || v < 0 || v > 1) return null;
        const x   = Math.min(cw - 1, Math.max(0, Math.floor(u * cw)));
        const y   = Math.min(ch - 1, Math.max(0, Math.floor(v * ch)));
        const idx = (y * cw + x) * 4;
        if (!isFg(idx)) return null;
        return [data[idx] / 255, data[idx + 1] / 255, data[idx + 2] / 255];
      },
    };
  }

  /* ================================================================= *
   *  Depth mode — sample the color photo into a halftone point cloud  *
   * =================================================================
   *
   *  Silhouette comes from the image's alpha channel (or a white-background
   *  detector if the PNG isn't pre-keyed). Per-dot color comes from the
   *  photo RGB. Per-dot brightness is baked into a separate attribute and
   *  used to modulate ALPHA in the shader — bright pixels → opaque cream
   *  dots that read clearly on the dark background, dark pixels → fainter
   *  dots so the silhouette stays *filled* without overpowering it.
   *
   *  Depth is faked from two ingredients: photo luminance (lit areas read
   *  as nearer) plus a smooth radial parabola from the figure's centroid
   *  (limbs bulge toward the camera). It's not real geometry — for that
   *  you need a .glb — but it gives the cloud enough Z structure to
   *  parallax convincingly under a small Y-axis rock.
   * ================================================================= */
  function depthModeSamples(THREE) {
    return loadImage(COLOR_SRC).then((colorImg) => {
      const raster = rasterize(colorImg, 768);
      if (!raster.data) {
        throw new Error('color image could not be rasterized (CORS?)');
      }
      const { data, cw, ch } = raster;
      const imgAspect = cw / ch;
      const planeW    = BUST_SCALE;
      const planeH    = planeW / imgAspect;

      // First pass: classify foreground pixels and compute the silhouette
      // centroid + radius so we can build the parabolic depth bias and
      // weight the rejection sampler later.
      const fg = new Uint8Array(cw * ch);   // 1 = foreground, 0 = background
      let sumX = 0, sumY = 0, fgCount = 0;
      // Same fix as buildPhotoSampler — an alpha-keyed PNG has BOTH
      // transparent corners and opaque subject pixels, so we have to
      // look at the alpha *range*, not just the max.
      let minAlpha = 255, maxAlpha = 0;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a < minAlpha) minAlpha = a;
        if (a > maxAlpha) maxAlpha = a;
      }
      const usesAlpha = minAlpha < 32 && maxAlpha >= 200;
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const idx = (y * cw + x) * 4;
          const a   = data[idx + 3];
          const r   = data[idx], g = data[idx + 1], b = data[idx + 2];
          const isBg = usesAlpha
            ? (a < 32)
            : (r > 240 && g > 240 && b > 240); // white-background detector
          if (!isBg) {
            fg[y * cw + x] = 1;
            sumX += x; sumY += y; fgCount++;
          }
        }
      }
      if (fgCount === 0) throw new Error('no foreground detected in color image');
      const cenU = (sumX / fgCount) / cw;
      const cenV = (sumY / fgCount) / ch;
      // Effective silhouette radius (in normalized image coords) — used to
      // scale the depth parabola so volume falls off at the figure's edge.
      const figRadius = Math.sqrt(fgCount / (Math.PI * cw * ch));

      // Rejection-sample TARGET_COUNT particles from foreground pixels.
      // This is cheaper than a fixed grid + per-pixel rejection because the
      // figure only covers ~30-40% of the canvas — most grid cells are bg.
      const samples = new Array(TARGET_COUNT);
      let placed = 0;
      let attempts = 0;
      const maxAttempts = TARGET_COUNT * 60;
      while (placed < TARGET_COUNT && attempts < maxAttempts) {
        attempts++;
        const u = Math.random();
        const v = Math.random();
        const px = Math.min(cw - 1, Math.max(0, Math.floor(u * cw)));
        const py = Math.min(ch - 1, Math.max(0, Math.floor(v * ch)));
        if (!fg[py * cw + px]) continue;

        const idx  = (py * cw + px) * 4;
        const r    = data[idx]     / 255;
        const g    = data[idx + 1] / 255;
        const b    = data[idx + 2] / 255;
        const lum  = 0.299 * r + 0.587 * g + 0.114 * b;

        // World-space position. Y inverts because image v=0 is top.
        const x =  (u    - 0.5) * planeW;
        const y =  (0.5 - v)    * planeH;

        // Faux depth: parabolic volume from centroid + luminance lift.
        // The parabola gives the bust a rounded "stomach" so it isn't a
        // flat plane; luminance nudges lit areas slightly nearer.
        const du = u - cenU, dv = v - cenV;
        const rNorm = Math.min(1, Math.hypot(du, dv) / (figRadius * 1.4));
        const volume = Math.sqrt(Math.max(0, 1 - rNorm * rNorm));
        const z = (volume * 0.70 + (lum - 0.5) * 0.35) * planeW * 0.30;

        // Outward direction for the assemble bloom — from the figure's
        // centroid in 3D, not from the image origin.
        const dx = x, dy = y, dz = z;
        const dl = Math.hypot(dx, dy, dz) || 1;

        // Per-dot brightness — bright areas of the photo become opaque
        // cream dots; dark areas (hair, beard, suit shadows) stay visible
        // but dimmer, so the silhouette fills in without overpowering.
        const brightness = ALPHA_LIFT + (1 - ALPHA_LIFT) * Math.pow(lum, 0.85);

        samples[placed++] = {
          pos:    [x, y, z],
          normal: [dx / dl, dy / dl, dz / dl],
          color:  [
            Math.min(1, r * COLOR_BOOST),
            Math.min(1, g * COLOR_BOOST),
            Math.min(1, b * COLOR_BOOST),
          ],
          alpha:  brightness,
          seed:   Math.random(),
        };
      }
      samples.length = placed;
      return samples;
    });
  }

  /* ================================================================= *
   *  Build + render                                                   *
   * ================================================================= */
  function buildAndRun(THREE, ctx) {
    const { renderer, scene, camera, group, container, canvas, samples, mode } = ctx;
    const recenterX = ctx.recenterX || 0;
    const recenterY = ctx.recenterY || 0;
    const fitScale  = (ctx.fitScale != null) ? ctx.fitScale : 1;
    const N = samples.length;

    // The portrait photo sits inside the stage in both modes — only the
    // CSS masking differs:
    //   • Depth mode: photo is VISIBLE at rest, the mask carves a hole at
    //     the cursor so dots can spill out of the hole.
    //   • Mesh mode:  photo is HIDDEN at rest, the mask reveals a disk at
    //     the cursor so the actual photograph emerges as the bust opens
    //     up. (The inverse of depth mode.)
    const photo = document.createElement('img');
    photo.src = COLOR_SRC;
    photo.alt = '';
    photo.draggable = false;
    photo.className = 'particle-bust-photo ' + (mode === 'mesh' ? 'mesh-mode' : 'depth-mode');
    // Match the photo's horizontal offset to the dot bust's. NDC
    // spans -1..+1 across the stage width (i.e. range 2), so an NDC
    // bias of X translates to (X / 2) × 100% of the stage width. The
    // photo lives at width:100% inset:0 inside the stage, so
    // translateX is a percentage of its own width (= stage width).
    // This keeps the on-hover photo reveal aligned with the dots.
    const photoBiasPct = (BUST_X_BIAS_NDC / 2) * 100;
    // `object-fit: cover` so the photograph fills the entire stage
    // in both axes regardless of any aspect-ratio mismatch between
    // the stage and the photo's native shape. The dot color sampling
    // (pass 3 in tryMeshMode) and the bust auto-fit math both use
    // cover-mode letterbox bars (negative on the overflow axis), so
    // the dot silhouette stays pixel-aligned to the photo subject
    // even as the photo overflows the stage by a few percent on one
    // side — the overflow is harmlessly clipped by the stage's
    // `overflow: hidden`. Net effect: the photo overlay (visible on
    // hover) and the dotted portrait occupy the same area — both
    // span the full 95vh stage.
    Object.assign(photo.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      pointerEvents: 'none',
      userSelect: 'none',
      willChange: 'mask-image, -webkit-mask-image, transform',
      transform: 'translateX(' + photoBiasPct.toFixed(2) + '%)',
    });
    container.insertBefore(photo, canvas);
    container.style.setProperty('--mx', '-9999px');
    container.style.setProperty('--my', '-9999px');
    if (mode === 'depth') {
      container.style.setProperty('--hole-in',  HOLE_RADIUS_PX + 'px');
      container.style.setProperty('--hole-out', (HOLE_RADIUS_PX + HOLE_FADE_PX) + 'px');
    } else {
      container.style.setProperty('--reveal-in',  REVEAL_RADIUS_PX + 'px');
      container.style.setProperty('--reveal-out', (REVEAL_RADIUS_PX + REVEAL_FADE_PX) + 'px');
    }

    // In mesh mode the photo is normally hidden at rest (mask centred
    // off-screen). For the intro we want the OPPOSITE — photo fully
    // visible up-front, then fading as the dots assemble from bottom
    // to top. `intro-visible` overrides the mask so the photo is
    // displayed without any cutout. We strip it once assembly finishes
    // so the hover-reveal behaviour takes over as normal.
    if (mode === 'mesh') photo.classList.add('intro-visible');

    const positions = new Float32Array(N * 3);
    const normals   = new Float32Array(N * 3);
    const colors    = new Float32Array(N * 3);
    const sizes     = new Float32Array(N);
    const alphas    = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const s = samples[i];
      positions[i * 3    ] = s.pos[0];
      positions[i * 3 + 1] = s.pos[1];
      positions[i * 3 + 2] = s.pos[2];
      normals  [i * 3    ] = s.normal[0];
      normals  [i * 3 + 1] = s.normal[1];
      normals  [i * 3 + 2] = s.normal[2];
      colors   [i * 3    ] = s.color[0];
      colors   [i * 3 + 1] = s.color[1];
      colors   [i * 3 + 2] = s.color[2];
      sizes    [i]         = s.seed;
      alphas   [i]         = (s.alpha !== undefined) ? s.alpha : 1.0;
    }

    // Compute normalised Y for each dot (0 = bottom of bust, 1 = top).
    // Used in the vertex shader to make the assemble wave travel
    // bottom-to-top: low Y dots have higher delay → settle first.
    let yMin = Infinity, yMax = -Infinity;
    for (let i = 0; i < N; i++) {
      const y = positions[i * 3 + 1];
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
    const yRange = (yMax - yMin) || 1;
    const yNorms = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      yNorms[i] = (positions[i * 3 + 1] - yMin) / yRange; // 0=bottom, 1=top
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('aNormal',  new THREE.BufferAttribute(normals, 3));
    geom.setAttribute('aColor',   new THREE.BufferAttribute(colors, 3));
    geom.setAttribute('aSize',    new THREE.BufferAttribute(sizes, 1));
    geom.setAttribute('aAlpha',   new THREE.BufferAttribute(alphas, 1));
    geom.setAttribute('aYNorm',   new THREE.BufferAttribute(yNorms, 1));

    // Ripple uniform buffer — one vec4 per ripple, (xyz = local-space
    // position, w = life ∈ [0,1]). Filled by the tick loop in mesh mode;
    // unused in depth mode (uses the single uCursor field instead).
    const ripplesBuf = new Array(MAX_RIPPLES).fill(0).map(() => new THREE.Vector4(0, 0, 0, 0));

    const uniforms = {
      uTime:           { value: 0 },
      uPushProgress:   { value: mode === 'mesh' ? 1 : 0 },              // assemble only in mesh mode
      uSize:           { value: POINT_SIZE },
      uResolutionY:    { value: window.innerHeight * renderer.getPixelRatio() },
      uTint:           { value: new THREE.Color(
        ...(mode === 'mesh' ? TINT_MESH : TINT_DEPTH)
      ) },
      uOpacity:        { value: 1.0 },
      // Depth-mode single-cursor field
      uCursor:         { value: new THREE.Vector3(9999, 9999, 9999) },
      uCursorActive:   { value: 0 },
      uCursorRadius:   { value: CURSOR_RADIUS },
      uCursorStrength: { value: CURSOR_STRENGTH },
      // Mesh-mode ripple field
      uRipples:        { value: ripplesBuf },
      uRippleCount:    { value: 0 },
      uRippleRadius:   { value: RIPPLE_RADIUS },
      uRippleStrength: { value: RIPPLE_STRENGTH },
      // 1 = depth mode (particles invisible at rest, ignite only in cursor field)
      // 0 = mesh mode (particles always visible, assemble + ripple field)
      uInteractiveOnly:{ value: mode === 'mesh' ? 0 : 1 },
    };

    /* ----------------------------------------------------------------- *
     *  Shader                                                           *
     * ----------------------------------------------------------------- */
    const vertex = /* glsl */`
      attribute vec3  aNormal;
      attribute vec3  aColor;
      attribute float aSize;
      attribute float aAlpha;
      attribute float aYNorm;   // 0 = bottom of bust, 1 = top

      uniform float uTime;
      uniform float uPushProgress;
      uniform float uSize;
      uniform float uResolutionY;
      // Depth-mode single-cursor field
      uniform vec3  uCursor;
      uniform float uCursorActive;
      uniform float uCursorRadius;
      uniform float uCursorStrength;
      // Mesh-mode ripple field (xyz = local pos, w = life ∈ [0,1])
      #define MAX_RIPPLES 32
      uniform vec4  uRipples[MAX_RIPPLES];
      uniform int   uRippleCount;
      uniform float uRippleRadius;
      uniform float uRippleStrength;
      uniform float uInteractiveOnly;   // 1 = depth, 0 = mesh

      varying vec3  vColor;
      varying float vAlpha;

      // 3D simplex noise (Stefan Gustavson) — used for the per-particle
      // jitter that makes the assemble effect feel like a dust cloud
      // instead of a uniform radial bloom.
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
      vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
      float snoise(vec3 v) {
        const vec2 C = vec2(1.0/6.0, 1.0/3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i  = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        vec3 g  = step(x0.yzx, x0.xyz);
        vec3 l  = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289(i);
        vec4 p = permute(permute(permute(
                  i.z + vec4(0.0, i1.z, i2.z, 1.0))
                + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                + i.x + vec4(0.0, i1.x, i2.x, 1.0));
        float n_ = 0.142857142857;
        vec3 ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);
        vec4 x = x_ * ns.x + ns.yyyy;
        vec4 y = y_ * ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
      }

      void main() {
        vec3 base = position;

        // --- mesh-mode assemble (zero contribution in depth mode) ---------
        // uPushProgress is held at 0 in depth mode, so this whole term
        // collapses to vec3(0).
        //
        // Bottom-to-top wave: dots at the bottom (aYNorm≈0) get a HIGH
        // delay so they settle first in the 1→0 countdown; dots at the
        // top (aYNorm≈1) get a LOW delay so they settle last. A small
        // aSize jitter prevents the wave from looking mechanical.
        float delay    = (1.0 - aYNorm) * 0.55 + aSize * 0.06;
        float duration = 0.28 + aSize * 0.14;
        float t = clamp((uPushProgress - delay) / duration, 0.0, 1.0);
        float eased = t * t * (3.0 - 2.0 * t);
        float n  = snoise(base * 0.45 + aSize * 12.56);
        float noiseDist = 1.6 + n * 1.4;
        vec3 assembleDisp = aNormal * eased * noiseDist;

        // --- depth-mode shatter spray (single cursor) ---------------------
        // Particles become visible AND get pushed outward only when they
        // fall inside the cursor's sphere of influence. Drives both the
        // alpha (depth-mode only) and the displacement.
        vec3 toC = base - uCursor;
        float cd = length(toC);
        float activation = uCursorActive * smoothstep(uCursorRadius, 0.0, cd);
        float scatter   = 0.6 + 0.6 * snoise(base * 1.1 + aSize * 6.28);
        vec3  cursorOut = normalize(toC + vec3(1e-5));
        vec3  cursorDisp = cursorOut * activation * uCursorStrength * scatter;

        // --- mesh-mode ripple field (many decaying cursor positions) ------
        // Each ripple contributes a fading impulse. Displacement direction
        // mixes "outward from the ripple" with "outward from the surface"
        // (aNormal), giving the natural "skin lifting" look instead of the
        // mechanical radial-fan look. life² weighting gives a smooth fade
        // so old ripples can't suddenly snap to zero.
        vec3 rippleDisp = vec3(0.0);
        for (int i = 0; i < MAX_RIPPLES; i++) {
          if (i >= uRippleCount) break;
          vec4 R = uRipples[i];
          vec3 toR = base - R.xyz;
          float dR = length(toR);
          float life = R.w;
          float reach = smoothstep(uRippleRadius, 0.0, dR);
          float weight = reach * life * life;
          if (weight <= 0.001) continue;
          vec3 outR = normalize(toR + vec3(1e-5));
          // 55% radial out from ripple + 35% surface-normal + 10% noise.
          // The noise term breaks up uniform fans so the scatter looks
          // organic instead of like an aerosol. CRITICAL: the noise key is
          // the ripple's WORLD POSITION (R.xyz) — not its array index —
          // so when the oldest ripple drops out of the buffer and indices
          // shift, the noise direction for every particle stays stable.
          vec3 noiseSeed = R.xyz * 1.7;
          vec3 noiseN = vec3(
            snoise(base * 0.4 + noiseSeed),
            snoise(base * 0.4 + noiseSeed + 31.0),
            snoise(base * 0.4 + noiseSeed + 71.0)
          );
          vec3 dir = normalize(outR * 0.55 + aNormal * 0.35 + noiseN * 0.10);
          rippleDisp += dir * weight * uRippleStrength;
        }

        vec3 pushed = base + assembleDisp + cursorDisp + rippleDisp;

        // --- gentle ambient drift (mesh mode only) ------------------------
        float meshMode = 1.0 - uInteractiveOnly;
        float br = 0.012 * meshMode;
        pushed += vec3(
          snoise(base * 0.8 + uTime * 0.20 + 0.0)  * br,
          snoise(base * 0.8 + uTime * 0.18 + 7.3)  * br,
          snoise(base * 0.8 + uTime * 0.16 + 13.7) * br
        );

        vec4 mv = modelViewMatrix * vec4(pushed, 1.0);

        // ---- Directional shading (mesh mode only) -----------------------
        // Photographic key-light + fresnel-rim setup that boosts the
        // per-dot COLOR INTENSITY only. NOTHING here changes a dot's
        // position, scale, orientation, alpha curve, or where it lives
        // in the bust — the figure's structure and the direction it's
        // looking are determined by the JS-side auto-fit + GLB
        // surface samples, untouched. This block just lights the
        // existing dots, the way a key light + rim light would light
        // a real portrait.
        //
        // meshMode is reused from the ambient-drift block above;
        // names below are scoped uniquely (suffixed Lit) to avoid
        // any clash with future additions. In depth mode litFactor
        // collapses to 1.0 so the photo-shatter UX renders exactly
        // as before — zero behavior change on that path.
        // (NB: NEVER use backticks in comments here — the whole shader
        // is a JS template literal, so a stray backtick would terminate
        // the string and silently break the dot-bust script.)
        // Key light from the LEFT side, angled slightly downward so
        // it hits both the face AND the body/shoulders below.
        vec3 keyDirLit  = normalize(vec3(-0.82, 0.15, 0.55));
        float NdotLLit  = dot(aNormal, keyDirLit);
        float keyLit    = pow(clamp((NdotLLit + 0.15) / 1.15, 0.0, 1.0), 0.70);
        // Fresnel rim — bright at silhouette edges (aNormal.z low).
        float rimLit    = pow(1.0 - clamp(aNormal.z, 0.0, 1.0), 2.0);
        float litFactor = 0.28 + keyLit * 1.40 + rimLit * 0.65;
        litFactor = mix(1.0, litFactor, meshMode);

        // Size — base is photo-luminance driven (bright areas = bigger
        // dots). A gentle litFactor nudge (capped at 1.25) makes the
        // lit side of the face show slightly more dots without smearing
        // features — keeps the shadow side detailed while the key-lit
        // cheek/brow pops forward. Cap prevents the extreme-highlight
        // blobs from the earlier pass.
        float meshLumFactor = 0.65 + aAlpha * 0.65;        // 0.65 .. 1.30
        float lumSize       = mix(meshLumFactor, 1.0, uInteractiveOnly);
        float sizeBoost     = lumSize * (0.55 + aSize * 0.65)
                            + activation * 0.30 * uInteractiveOnly;

        gl_PointSize = sizeBoost * uSize * uResolutionY * (1.0 / -mv.z);
        gl_PointSize = max(gl_PointSize, 1.0);
        gl_Position  = projectionMatrix * mv;

        // Photo color × directional lighting. With normal blending,
        // boosted RGB clamps at 1.0, so lit skin saturates toward
        // white (= bright highlight) while shadow skin stays at its
        // natural dim photo tone — the elegant high-contrast look
        // from hashgraphvc.com without changing the dot positions.
        vColor = aColor * litFactor;
        // Depth mode: alpha = activation × aAlpha (invisible at rest).
        // Mesh mode:  alpha = aAlpha            (always visible).
        vAlpha = mix(aAlpha, aAlpha * activation, uInteractiveOnly);
      }
    `;

    const fragment = /* glsl */`
      varying vec3  vColor;
      varying float vAlpha;
      uniform vec3  uTint;
      uniform float uOpacity;
      uniform float uInteractiveOnly;   // 1 = depth (sharp dots) / 0 = mesh (soft glow)

      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r = length(c);
        if (r > 0.5) discard;
        // Depth mode: clean disk edge, no halo — the shatter dots read as
        // discrete pixel-sized pieces of the photo.
        // Mesh mode: kodee-style soft glow, pow(1 - r*2, 3.2) falloff, so
        // overlapping particles build into bloom under additive blending.
        float aSharp = 1.0 - smoothstep(0.35, 0.50, r);
        float aGlow  = pow(1.0 - r * 2.0, 3.2);
        float a      = mix(aGlow, aSharp, uInteractiveOnly);
        gl_FragColor = vec4(vColor * uTint, a * vAlpha * uOpacity);
      }
    `;

    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      // Always normal alpha blending now: with per-particle texture colors
      // (skin tone, brown jacket, dark hair) additive would blow out all
      // bright pixels to white and erase the dark hair entirely. Normal
      // blending preserves the actual surface colors so the bust reads as
      // a colored stippling of the photo, not a generic glow cloud.
      blending: THREE.NormalBlending,
    });

    const points = new THREE.Points(geom, mat);
    group.add(points);

    /* ----------------------------------------------------------------- *
     *  Background dust                                                  *
     * ----------------------------------------------------------------- *
     *  A sparse, gently drifting cloud of small dots that fills the
     *  empty space around the bust. Lives on the SCENE (not the bust
     *  group) so it doesn't rotate with the bust — it stays steady in
     *  screen space like atmospheric haze.                              */
    const bgPos  = new Float32Array(BG_COUNT * 3);
    const bgSeed = new Float32Array(BG_COUNT);
    for (let i = 0; i < BG_COUNT; i++) {
      bgPos[i * 3    ] = (Math.random() * 2 - 1) * BG_SPREAD_X;
      bgPos[i * 3 + 1] = (Math.random() * 2 - 1) * BG_SPREAD_Y;
      bgPos[i * 3 + 2] = BG_Z_FAR + Math.random() * (BG_Z_NEAR - BG_Z_FAR);
      bgSeed[i]        = Math.random();
    }
    const bgGeom = new THREE.BufferGeometry();
    bgGeom.setAttribute('position', new THREE.BufferAttribute(bgPos, 3));
    bgGeom.setAttribute('aSeed',    new THREE.BufferAttribute(bgSeed, 1));

    const bgUniforms = {
      uTime:        uniforms.uTime,                          // share clock with bust
      uResolutionY: uniforms.uResolutionY,                   // share so resize() updates both
      uSize:        { value: BG_POINT_SIZE },
      uOpacity:     { value: BG_OPACITY },
      uTint:        { value: new THREE.Color(...BG_TINT) },
    };
    const bgMat = new THREE.ShaderMaterial({
      uniforms: bgUniforms,
      vertexShader: /* glsl */`
        attribute float aSeed;
        uniform float uTime;
        uniform float uSize;
        uniform float uResolutionY;
        varying float vSeed;
        void main() {
          // Two-layer drift: a slow large wave + a faster small flutter.
          // Different frequencies per axis and per particle (via aSeed)
          // so no two dots move in sync — the field feels like living fog.
          vec3 p = position;
          float s  = aSeed * 6.2831853;
          float s2 = aSeed * 9.4247780;

          // Primary drift — slow, wide arcs
          p.x += sin(uTime * 0.18 + s)        * 0.28;
          p.y += cos(uTime * 0.14 + s * 1.6)  * 0.34;
          p.z += sin(uTime * 0.11 + s * 0.8)  * 0.14;

          // Secondary flutter — faster, tighter jitter overlaid on primary
          p.x += cos(uTime * 0.52 + s2)       * 0.10;
          p.y += sin(uTime * 0.47 + s2 * 1.3) * 0.10;

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float sizeJitter = 0.45 + aSeed * 1.1;
          gl_PointSize = sizeJitter * uSize * uResolutionY * (1.0 / -mv.z);
          gl_PointSize = max(gl_PointSize, 1.0);
          gl_Position  = projectionMatrix * mv;
          vSeed = aSeed;
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3  uTint;
        uniform float uOpacity;
        uniform float uTime;
        varying float vSeed;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float r = length(c);
          if (r > 0.5) discard;
          float a = pow(1.0 - r * 2.0, 2.2);
          // Two-speed twinkle: a slow breath + a fast shimmer layered on top.
          float breathe = 0.60 + 0.40 * sin(uTime * 0.70 + vSeed * 12.566);
          float shimmer = 0.85 + 0.15 * sin(uTime * 2.80 + vSeed * 37.699);
          gl_FragColor = vec4(uTint, a * uOpacity * breathe * shimmer);
        }
      `,
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
    });

    const bgPoints = new THREE.Points(bgGeom, bgMat);
    scene.add(bgPoints);

    // (Evaporation particles removed.)

    // Lock the bust at its tuned orientation so it lines up with the photo
    // behind it. Auto-rotation is opt-in via FULL_AUTO_ROTATE.
    if (mode === 'mesh') {
      group.rotation.y = BUST_ROTATION_Y;

      // Auto-fit transform — scales the bust's projected silhouette so
      // it overlays the photo subject's silhouette in stage UV, and
      // translates so the silhouettes co-center. fitScale and recenter
      // values are computed in tryMeshMode against the photo's
      // foreground bbox; applying them here is what makes the dot
      // bust's face edges line up with the photo's face edges.
      group.scale.setScalar(fitScale);
      // Convert the visual-only BUST_X_BIAS_NDC into a world-space
      // offset using the same inverse-projection that tryMeshMode
      // uses for its own auto-fit offsets. The result is added to
      // recenterX so the rendered dots sit `bias` NDC units to the
      // right of their photo-aligned home position. tryMeshMode's
      // color sampling pass deliberately omits this bias so each
      // dot still samples the correct photo pixel.
      const tanHalfFovB = Math.tan((CAMERA_FOV * Math.PI / 180) / 2);
      const biasWorldX  = BUST_X_BIAS_NDC * (CAMERA_Z * tanHalfFovB * STAGE_ASPECT);
      group.position.set(recenterX + biasWorldX, recenterY, 0);

      // Live-tune helper — press Shift + ◀ / ▶ to nudge the bust's yaw by
      // 0.02 rad (≈ 1.15°). Logs the new value so you can copy it into
      // BUST_ROTATION_Y for a permanent fix. Only active when the section
      // is in view, so it doesn't hijack arrow-key scrolling.
      window.addEventListener('keydown', (e) => {
        if (!inView || !e.shiftKey) return;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          const delta = (e.key === 'ArrowLeft' ? -1 : 1) * 0.02;
          group.rotation.y += delta;
          const deg = (group.rotation.y * 180 / Math.PI).toFixed(2);
          console.info(`[dot-bust] BUST_ROTATION_Y = ${group.rotation.y.toFixed(3)} (${deg}°). ` +
            'Note: recenter is baked at load — reload to recompute.');
          e.preventDefault();
        }
      });
    }

    // The bust is biased right by BUST_X_BIAS_NDC (in NDC units) via
    // the auto-fit offset, and the photo overlay matches that with a
    // CSS translateX. The on-hover photo mask uses --mx/--my (set
    // from the cursor's stage-local CSS pixel position); but because
    // mask coordinates live in the PHOTO's local coordinate space —
    // which has been visually shifted by the same amount — we have to
    // subtract that shift before publishing --mx/--my, otherwise the
    // reveal disk lands at the wrong spot. photoShiftPxX is recomputed
    // every resize() because it scales with the container width.
    let photoShiftPxX = 0;
    let photoShiftPxY = 0;

    /* ----------------------------------------------------------------- *
     *  Sizing                                                          *
     * ----------------------------------------------------------------- */
    function resize() {
      const r = container.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      uniforms.uResolutionY.value = h * renderer.getPixelRatio();
      // NDC width spans 2 across the stage, so each NDC unit = w/2 CSS px.
      photoShiftPxX = (BUST_X_BIAS_NDC / 2) * w;
      photoShiftPxY = 0;
    }
    resize();
    window.addEventListener('resize', resize);

    /* ----------------------------------------------------------------- *
     *  Cursor — project pointer to bust's z-plane in world space        *
     * ----------------------------------------------------------------- */
    // Cursor state:
    //   • cursorWorld    — pointer projected onto the bust's z=0 plane,
    //                      in world space. Used to ignite the particle
    //                      activation field in the shader.
    //   • cssTargetX/Y   — pointer position in stage CSS-pixel space,
    //                      used to drive the radial-gradient mask hole
    //                      that carves into the photo overlay.
    const cursorWorld   = new THREE.Vector3(9999, 9999, 9999);
    const cursorTarget  = new THREE.Vector3(9999, 9999, 9999); // local-space, eased
    let   cursorActive  = false;
    let   cssTargetX    = -9999, cssTargetY = -9999;
    let   cssEasedX     = -9999, cssEasedY = -9999;
    const ndc           = new THREE.Vector3();

    // Parallax state — portrait floats gently toward the cursor.
    // Max displacement in CSS pixels; ease controls lag (lower = slower).
    const PARALLAX_MAX  = 22;   // px — subtle but clearly perceptible
    const PARALLAX_EASE = 0.04; // lerp factor per frame (~60fps)
    let   pxTarget = 0, pyTarget = 0; // desired offset
    let   pxCur    = 0, pyCur    = 0; // current smoothed offset
    // Track global mouse position for parallax (works even when the
    // cursor is over the text column, not just the stage).
    window.addEventListener('pointermove', function (e) {
      pxTarget = (e.clientX / window.innerWidth  - 0.5) * 2 * PARALLAX_MAX;
      pyTarget = (e.clientY / window.innerHeight - 0.5) * 2 * PARALLAX_MAX;
    }, { passive: true });
    // Gently return to centre when the pointer leaves the window.
    window.addEventListener('pointerleave', function () {
      pxTarget = 0; pyTarget = 0;
    }, { passive: true });

    function onPointerMove(e) {
      const r = container.getBoundingClientRect();
      const inside =
        e.clientX >= r.left && e.clientX <= r.right &&
        e.clientY >= r.top  && e.clientY <= r.bottom;
      if (!inside) {
        cursorActive = false;
        cssTargetX = -9999; cssTargetY = -9999;
        return;
      }
      const justEntered = cssTargetX < -1000; // was offscreen before
      // Stage-local CSS pixels for the photo mask.
      cssTargetX = e.clientX - r.left;
      cssTargetY = e.clientY - r.top;
      // Snap the eased mask to the cursor on entry so the hole appears
      // exactly where the pointer is, not sweeping in from offscreen.
      if (justEntered) {
        cssEasedX = cssTargetX;
        cssEasedY = cssTargetY;
      }

      // World-space hit on the bust plane for the particle activation.
      const xN = (cssTargetX / r.width)  * 2 - 1;
      const yN = (cssTargetY / r.height) * 2 - 1;
      ndc.set(xN, -yN, 0.5).unproject(camera);
      const dir = ndc.sub(camera.position).normalize();
      const tt  = (group.position.z - camera.position.z) / dir.z;
      cursorWorld.set(
        camera.position.x + dir.x * tt,
        camera.position.y + dir.y * tt,
        group.position.z
      );
      cursorActive = true;
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    container.addEventListener('pointerleave', () => {
      cursorActive = false;
      cssTargetX = -9999; cssTargetY = -9999;
    });

    /* ----------------------------------------------------------------- *
     *  Intersection observer — pause when offscreen, trigger assemble    *
     * ----------------------------------------------------------------- */
    let inView = false;
    let assembleStart = -1;
    let assembleDispatched = false;
    // The dot assemble is gated on TWO signals:
    //   1. `inView`                — the stage is on screen.
    //   2. `loaderDone`            — the "Sohaj" letter loader has
    //                                finished fading out (so the dots
    //                                aren't assembling invisibly
    //                                underneath the loader overlay).
    // Both must be true before we record `assembleStart`.
    //
    // Race-safety: animations.js's letter animation can finish BEFORE
    // buildAndRun runs (GLB parse + sampling takes a beat), in which
    // case the `loader:done` event would fire into the void. To cover
    // that, animations.js ALSO sets `window.__sohajLoaderDone = true`
    // when dispatching, and we check the flag here. If neither the
    // flag nor the event ever materializes (e.g. animations.js failed
    // to load), a 5s safety net flips `loaderDone` so the dots never
    // sit forever waiting.
    let loaderDone = !!window.__sohajLoaderDone;
    function maybeStartAssemble() {
      if (inView && loaderDone && assembleStart < 0) {
        assembleStart = performance.now();
      }
    }
    window.addEventListener('loader:done', function () {
      loaderDone = true;
      maybeStartAssemble();
    });
    setTimeout(function () {
      if (!loaderDone) {
        loaderDone = true;
        maybeStartAssemble();
      }
    }, 5000);

    // Notify the rest of the page that the dot portrait has assembled,
    // so index.html's inline intro-reveal script can swap from
    // `intro-loading` to `intro-revealed` and fade everything else in
    // from blurred → focused. Safe to call multiple times — the
    // listener self-guards.
    function dispatchAssembled() {
      if (assembleDispatched) return;
      assembleDispatched = true;
      try {
        window.dispatchEvent(new CustomEvent('dot-bust:assembled'));
      } catch (_) { /* IE fallback unused — modern browsers only */ }
    }
    // Depth-mode has no assemble animation (uPushProgress stays 0), so
    // fire as soon as the section is in view and the geometry has been
    // wired up — the photo + dots are already at their resting state.
    if (mode !== 'mesh') {
      setTimeout(dispatchAssembled, 200);
    }
    new IntersectionObserver((entries) => {
      const isIn = entries[0].isIntersecting;
      inView = isIn;
      maybeStartAssemble();
    }, { threshold: 0.15 }).observe(container);

    /* ----------------------------------------------------------------- *
     *  Ripple emitter (mesh mode)                                       *
     * ----------------------------------------------------------------- *
     *  Each pulse appends a {pos, born} entry to the active ring buffer.
     *  Every frame all ripples decay and we recompute their `life` field
     *  in the uniform array. Capped at MAX_RIPPLES — when full, the
     *  oldest entry is overwritten.                                     */
    const ripples       = [];                          // [{ pos: Vec3, born: ms }]
    const tmpLocalCur   = new THREE.Vector3();         // scratch
    let   lastRippleMs  = 0;

    /* ----------------------------------------------------------------- *
     *  Loop                                                            *
     * ----------------------------------------------------------------- */
    const clock = new THREE.Clock();
    function tick() {
      requestAnimationFrame(tick);
      if (!inView) return;

      // Clamp dt — if the section was offscreen for a while, the next
      // getDelta() can return many seconds, which would jolt the noise drift.
      const dt = Math.min(clock.getDelta(), 0.05);
      uniforms.uTime.value += dt;

      // Mesh-mode assemble: ease 1 → 0 over ASSEMBLE_MS once the section
      // enters view. In depth mode uPushProgress stays at its initial 0
      // (set in the uniforms above) — no assemble, the photo is the rest
      // state.
      if (mode === 'mesh' && assembleStart > 0) {
        const t = Math.min(1, (performance.now() - assembleStart) / ASSEMBLE_MS);
        uniforms.uPushProgress.value = Math.pow(1 - t, 2);

        // Fade the portrait photo out as the dots assemble.
        // Photo opacity follows a slightly faster curve than the dot
        // progress so the photo is mostly gone by the time the dots
        // are halfway settled — the crossfade looks like the dots are
        // "replacing" the photograph rather than revealing over it.
        if (photo.classList.contains('intro-visible')) {
          const photoOpacity = Math.max(0, 1 - t * 1.2).toFixed(3);
          photo.style.opacity = photoOpacity;
          if (t >= 1.0) {
            // Assembly complete — remove intro override so the normal
            // hover-reveal mask takes over for the rest of the session.
            photo.classList.remove('intro-visible');
            photo.style.opacity = '';
          }
        }

        // Fire the intro-reveal cue at 50% of the assemble — well
        // before the dots fully settle. The blur-to-focus on the rest
        // of the page then overlaps with the second half of the
        // assemble, so the two animations feel like one continuous
        // reveal rather than "dots finish → 800ms pause → page fades
        // in". Combined with the shorter ASSEMBLE_MS this cuts the
        // perceived wait between letter loader and usable page by
        // roughly a full second.
        if (t >= 0.5) dispatchAssembled();
      }

      // Mesh-mode auto-rotation, gated on FULL_AUTO_ROTATE. Locked at 0
      // by default so the bust stays at BUST_ROTATION_Y — matching the
      // angle of the underlying photo, since Meshy reconstructs models
      // from the input photo's viewpoint. If you re-enable rotation,
      // the bust will drift away from the photo angle and the on-hover
      // photo reveal will no longer line up.
      if (mode === 'mesh' && FULL_AUTO_ROTATE !== 0) {
        const restFrac = 1 - uniforms.uPushProgress.value;
        group.rotation.y += FULL_AUTO_ROTATE * dt * restFrac;
      }
      group.updateMatrixWorld();

      /* --------------------------------------------------------------- *
       *  Mesh-mode ripple emitter + decay                              *
       * --------------------------------------------------------------- */
      if (mode === 'mesh') {
        const now = performance.now();
        // Spawn a new ripple at the (local-space) cursor every
        // RIPPLE_INTERVAL_MS while the pointer is over the stage.
        if (cursorActive && now - lastRippleMs >= RIPPLE_INTERVAL_MS) {
          tmpLocalCur.copy(cursorWorld);
          group.worldToLocal(tmpLocalCur);
          if (ripples.length >= MAX_RIPPLES) ripples.shift();
          ripples.push({
            x: tmpLocalCur.x, y: tmpLocalCur.y, z: tmpLocalCur.z,
            born: now,
          });
          lastRippleMs = now;
        }
        // Decay + pack into uniform array. Each ripple follows a smooth
        // fade-in → linear-decay envelope so newly spawned ripples don't
        // step from 0 to full strength in one frame.
        let alive = 0;
        const lifeMs = RIPPLE_LIFE_MS;
        const riseMs = lifeMs * RIPPLE_RISE_FRAC;
        for (let i = 0; i < ripples.length; i++) {
          const age = now - ripples[i].born;
          if (age >= lifeMs) continue;
          let life;
          if (age < riseMs) {
            // smoothstep ease-in over the first RIPPLE_RISE_FRAC of life.
            const u = age / riseMs;
            life = u * u * (3 - 2 * u);
          } else {
            life = 1 - (age - riseMs) / (lifeMs - riseMs);
          }
          const slot = ripplesBuf[alive++];
          slot.set(ripples[i].x, ripples[i].y, ripples[i].z, life);
        }
        // Drop expired ripples from the JS-side array too.
        if (alive < ripples.length) {
          for (let i = ripples.length - 1; i >= 0; i--) {
            if (now - ripples[i].born >= RIPPLE_LIFE_MS) ripples.splice(i, 1);
          }
        }
        uniforms.uRippleCount.value = alive;

      }

      // Drive the photo's radial-gradient mask so a hole follows the
      // cursor. Eased separately from the particle cursor for crispness.
      if (cssTargetX > -1000) {
        cssEasedX += (cssTargetX - cssEasedX) * MASK_EASE;
        cssEasedY += (cssTargetY - cssEasedY) * MASK_EASE;
      } else {
        // Snap offscreen quickly when the pointer leaves the stage.
        cssEasedX += (-9999 - cssEasedX) * 0.35;
        cssEasedY += (-9999 - cssEasedY) * 0.35;
      }
      // Subtract the photo's CSS translation so the mask hole tracks
      // the cursor in stage-screen coords (the mask lives in the photo's
      // local coord space, which is shifted by photoShiftPxX/Y).
      container.style.setProperty('--mx', (cssEasedX - photoShiftPxX).toFixed(1) + 'px');
      container.style.setProperty('--my', (cssEasedY - photoShiftPxY).toFixed(1) + 'px');

      // Depth-mode single-cursor field — convert world cursor into local
      // each frame so the repel stays anchored to the screen. Mesh mode
      // uses the ripple system instead, so we hold uCursorActive at 0
      // there to keep the single-cursor displacement out of the picture.
      if (mode === 'depth') {
        if (cursorActive) {
          cursorTarget.copy(cursorWorld);
          group.worldToLocal(cursorTarget);
        }
        const cu = uniforms.uCursor.value;
        cu.x += (cursorTarget.x - cu.x) * CURSOR_EASE;
        cu.y += (cursorTarget.y - cu.y) * CURSOR_EASE;
        cu.z += (cursorTarget.z - cu.z) * CURSOR_EASE;
        const wantActive = cursorActive ? 1 : 0;
        uniforms.uCursorActive.value += (wantActive - uniforms.uCursorActive.value) * 0.08;
      }

      // Parallax — smoothly float the whole portrait (canvas + photo)
      // toward the cursor. Both children of the container are
      // position:absolute, so translating the container shifts them
      // together and preserves their 1:1 alignment.
      pxCur += (pxTarget - pxCur) * PARALLAX_EASE;
      pyCur += (pyTarget - pyCur) * PARALLAX_EASE;
      container.style.transform = `translate(${pxCur.toFixed(2)}px, ${pyCur.toFixed(2)}px)`;

      renderer.render(scene, camera);
    }
    tick();

    // Tag the mode on the container so CSS / debugging can read it.
    container.dataset.mode = mode;
  }

  /* ================================================================= *
   *  Helpers                                                         *
   * ================================================================= */
  function hasWebGL() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload  = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // Single-channel sampler (0..1). `mode='r'` reads red; `mode='lum'` reads luminance.
  function makeImageSampler(image, mode) {
    const { data, cw, ch } = rasterize(image);
    if (!data) return () => 0.5;
    return function (u, v) {
      const x = clampInt(u * cw, cw);
      const y = clampInt(v * ch, ch);
      const i = (y * cw + x) * 4;
      if (mode === 'lum') {
        return (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      }
      return data[i] / 255;
    };
  }

  // RGB sampler — returns [r, g, b] in 0..1 from the image at uv.
  function makeImageRGBSampler(image) {
    const { data, cw, ch } = rasterize(image);
    if (!data) return () => [1, 1, 1];
    return function (u, v) {
      const x = clampInt(u * cw, cw);
      const y = clampInt(v * ch, ch);
      const i = (y * cw + x) * 4;
      return [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
    };
  }

  // Returns a (u,v) → [r,g,b] sampler over a GLTF base-color texture.
  // U/V are wrapped to [0,1] (matches the default GLTF REPEAT wrap mode).
  // V is flipped because GLTF UV origin is bottom-left, canvas is top-left.
  function makeTextureSampler(image) {
    const w = image.width || image.naturalWidth;
    const h = image.height || image.naturalHeight;
    if (!w || !h) return solidSampler([1, 1, 1]);
    const maxSide = 1024;                // generous — Meshy atlases are dense
    const scale   = Math.min(1, maxSide / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const c  = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    let data;
    try {
      ctx.drawImage(image, 0, 0, cw, ch);
      data = ctx.getImageData(0, 0, cw, ch).data;
    } catch (e) {
      console.warn('[dot-bust] texture rasterize failed — using flat color', e);
      return solidSampler([0.85, 0.78, 0.66]);
    }
    return function sample(u, v) {
      u = u - Math.floor(u);             // wrap to [0,1)
      v = v - Math.floor(v);
      const x = Math.min(cw - 1, Math.max(0, Math.floor(u * cw)));
      const y = Math.min(ch - 1, Math.max(0, Math.floor((1 - v) * ch)));
      const i = (y * cw + x) * 4;
      return [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
    };
  }

  function solidSampler(rgb) {
    return function () { return rgb; };
  }

  function isDrawable(img) {
    return img && (
      (typeof HTMLImageElement  !== 'undefined' && img instanceof HTMLImageElement)  ||
      (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) ||
      (typeof ImageBitmap       !== 'undefined' && img instanceof ImageBitmap)       ||
      (typeof OffscreenCanvas   !== 'undefined' && img instanceof OffscreenCanvas)
    );
  }

  function rasterize(image, maxSide) {
    const w = image.naturalWidth  || image.width;
    const h = image.naturalHeight || image.height;
    maxSide = maxSide || 512;
    const scale   = Math.min(1, maxSide / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const c  = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, cw, ch);
    try {
      return { data: ctx.getImageData(0, 0, cw, ch).data, cw, ch };
    } catch (e) {
      console.warn('[dot-bust] image rasterize failed (CORS?) — using flat sampler', e);
      return { data: null, cw, ch };
    }
  }

  function clampInt(x, max) {
    const v = Math.floor(x);
    return v < 0 ? 0 : (v >= max ? max - 1 : v);
  }

  /* ----------------------------------------------------------------- *
   *  Ambient dust — canvas2D particle layer spanning the full hero     *
   *  section, completely independent of the Three.js portrait canvas.  *
   *  Particles use the same warm-cream tint as the WebGL background    *
   *  dust, with two-layer drift (slow arcs + fast flutter) matching    *
   *  the enhanced vertexShader in bgMat.                               *
   * ----------------------------------------------------------------- */
  function initAmbientDust() {
    var header = document.getElementById('headerImg');
    if (!header) return;

    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {
      position:      'absolute',
      top:           '0',
      left:          '0',
      width:         '100%',
      height:        '100%',
      pointerEvents: 'none',
      touchAction:   'none',
      zIndex:        '0',
      borderRadius:  '0',
      willChange:    'transform',
    });

    // Insert behind all header content.
    header.insertBefore(canvas, header.firstChild);

    var N = 700;
    var particles = [];
    for (var i = 0; i < N; i++) {
      particles.push({
        // Normalised resting position [0..1]
        x:    Math.random(),
        y:    Math.random(),
        // radius in CSS px
        r:    0.6 + Math.random() * 2.0,
        // base opacity
        op:   0.07 + Math.random() * 0.28,
        // per-particle phase and speed factors for wave drift
        ph:   Math.random() * Math.PI * 2,
        ph2:  Math.random() * Math.PI * 2,
        sp:   0.35 + Math.random() * 0.65,
      });
    }

    function sizeCanvas() {
      canvas.width  = header.offsetWidth  || window.innerWidth;
      canvas.height = header.offsetHeight || window.innerHeight;
    }
    sizeCanvas();
    window.addEventListener('resize', sizeCanvas, { passive: true });

    // Parallax — mirrors the portrait stage's mouse tracking (PARALLAX_MAX
    // 22px, PARALLAX_EASE 0.04) but at 40% intensity so the background
    // dust feels like it's sitting further back in the scene than the bust.
    var DUST_PARALLAX = 22 * 0.4;  // ≈ 8.8 px max shift
    var DUST_EASE     = 0.04;
    var dpxTarget = 0, dpyTarget = 0;
    var dpxCur    = 0, dpyCur    = 0;

    window.addEventListener('pointermove', function (e) {
      dpxTarget = (e.clientX / window.innerWidth  - 0.5) * 2 * DUST_PARALLAX;
      dpyTarget = (e.clientY / window.innerHeight - 0.5) * 2 * DUST_PARALLAX;
    }, { passive: true });

    window.addEventListener('pointerleave', function () {
      dpxTarget = 0; dpyTarget = 0;
    }, { passive: true });

    var t = 0;
    var ctx = canvas.getContext('2d');

    function tick() {
      requestAnimationFrame(tick);
      t += 0.004;

      // Lerp parallax toward target (same easing as portrait stage).
      dpxCur += (dpxTarget - dpxCur) * DUST_EASE;
      dpyCur += (dpyTarget - dpyCur) * DUST_EASE;
      canvas.style.transform = 'translate(' + dpxCur.toFixed(2) + 'px,' + dpyCur.toFixed(2) + 'px)';

      var w = canvas.width;
      var h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      for (var j = 0; j < N; j++) {
        var p = particles[j];
        var s  = p.ph;
        var s2 = p.ph2;

        // Two-layer drift matching the WebGL vertexShader
        var dx = Math.sin(t * 0.18 * p.sp + s)        * 0.028 * w
               + Math.cos(t * 0.52 * p.sp + s2)       * 0.010 * w;
        var dy = Math.cos(t * 0.14 * p.sp + s * 1.6)  * 0.030 * h
               + Math.sin(t * 0.47 * p.sp + s2 * 1.3) * 0.010 * h;

        var px = p.x * w + dx;
        var py = p.y * h + dy;

        // Two-speed twinkle
        var breathe = 0.60 + 0.40 * Math.sin(t * 0.70 * p.sp + s  * 4.0);
        var shimmer = 0.85 + 0.15 * Math.sin(t * 2.80 * p.sp + s2 * 12.0);
        var alpha   = p.op * breathe * shimmer;

        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(px, py, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgb(245,240,224)';
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    tick();
  }
})();

"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { OrbTheme } from "@/theme/presets";
import {
  coreFrag, coreVert, dustFrag, dustVert, floorFrag, ribbonFrag, ribbonVert, ringFrag, ringVert, shellFrag, shellVert,
} from "./shaders";

export type OrbState = "idle" | "listening" | "thinking" | "speaking" | "acting";
export const ORB_STATES: OrbState[] = ["idle", "listening", "thinking", "speaking", "acting"];

type StateParams = {
  disp: number; speed: number; amp: number; spin: number; twist: number;
  ring: number; wire: number; scale: number; audio: number; pulse: number;
};

// What each state looks like. All values are eased, so state changes flow.
const STATES: Record<OrbState, StateParams> = {
  idle:      { disp: 1.0, speed: 0.22, amp: 0.42, spin: 0.10, twist: 1.6, ring: 0.35, wire: 0, scale: 1.0,  audio: 0, pulse: 0 },
  listening: { disp: 1.1, speed: 0.35, amp: 0.30, spin: 0.14, twist: 1.6, ring: 0.9,  wire: 0, scale: 1.05, audio: 1, pulse: 0.25 },
  thinking:  { disp: 0.6, speed: 0.55, amp: 0.26, spin: 1.9,  twist: 3.6, ring: 0.6,  wire: 0, scale: 0.96, audio: 0, pulse: 0 },
  speaking:  { disp: 1.3, speed: 0.5,  amp: 0.5,  spin: 0.2,  twist: 1.9, ring: 0.8,  wire: 0, scale: 1.02, audio: 1, pulse: 0.1 },
  acting:    { disp: 0.35, speed: 0.45, amp: 0.3, spin: 0.55, twist: 2.2, ring: 0.45, wire: 1, scale: 1.0,  audio: 0, pulse: 0.15 },
};

function lineGrid(lines: number, points: number, closed: boolean, cross = 0) {
  const pos: number[] = [];
  for (let j = 0; j < lines; j++) {
    const v = lines === 1 ? 0.5 : j / (lines - 1);
    const n = closed ? points : points - 1;
    for (let i = 0; i < n; i++) {
      pos.push(i / (closed ? points : points - 1), v, 0, (i + 1) / (closed ? points : points - 1), v, 0);
    }
  }
  // cross strands turn the lines into a mesh (image 2)
  for (let c = 0; c < cross; c++) {
    const u = (c + 0.5) / cross;
    for (let j = 0; j < lines - 1; j++) pos.push(u, j / (lines - 1), 0, u, (j + 1) / (lines - 1), 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3);
  return g;
}

type Props = {
  state: OrbState;
  theme: OrbTheme;
  /** Current audio level 0..1 (Apollo's voice while speaking, the mic while listening). */
  getLevel?: () => number;
  /** Docked/small: render at low resolution. */
  small?: boolean;
  className?: string;
};

export function ApolloOrb({ state, theme, getLevel, small, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  const themeRef = useRef(theme);
  const levelRef = useRef(getLevel);
  const applyThemeRef = useRef<(t: OrbTheme) => void>(() => {});
  const smallRef = useRef(!!small);
  const resizeRef = useRef<() => void>(() => {});

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { levelRef.current = getLevel; }, [getLevel]);
  useEffect(() => { themeRef.current = theme; applyThemeRef.current(theme); }, [theme]);
  useEffect(() => { smallRef.current = !!small; resizeRef.current(); }, [small]);

  useEffect(() => {
    const host = hostRef.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    } catch {
      host.dataset.fallback = "true"; // CSS draws a static orb
      return;
    }
    renderer.toneMapping = THREE.NoToneMapping;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.z = 6.6;
    const orb = new THREE.Group();
    scene.add(orb);

    const C = (hex: string) => new THREE.Color(hex);
    const t0 = themeRef.current;
    const blend = (t: OrbTheme) => (t.blending === "additive" ? THREE.AdditiveBlending : THREE.NormalBlending);

    // core glow
    const coreMat = new THREE.ShaderMaterial({
      vertexShader: coreVert, fragmentShader: coreFrag, transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: C(t0.core.color) }, uIntensity: { value: t0.core.intensity }, uHalf: { value: 1.7 }, uPulse: { value: 0 } },
    });
    const core = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), coreMat);
    core.renderOrder = 0;
    scene.add(core);

    // inner ribbon
    const ribbonMat = new THREE.ShaderMaterial({
      vertexShader: ribbonVert, fragmentShader: ribbonFrag, transparent: true, depthWrite: false, depthTest: false,
      blending: blend(t0),
      uniforms: {
        uT: { value: 0 }, uAmp: { value: 0.4 }, uTwist: { value: 1.6 }, uLevel: { value: 0 },
        uA: { value: C(t0.ribbon.a) }, uB: { value: C(t0.ribbon.b) }, uOn: { value: t0.ribbon.on }, uAlpha: { value: 0.15 },
        uPt: { value: 1 },
      },
    });
    const ribbon = new THREE.LineSegments(lineGrid(48, 150, false, 56), ribbonMat);
    ribbon.renderOrder = 1;
    ribbon.rotation.z = -0.12;
    orb.add(ribbon);

    // second, dotted ribbon: quieter, counter-phase (the dotted under-mesh in image 2)
    const dotsMat = new THREE.ShaderMaterial({
      vertexShader: ribbonVert, fragmentShader: ribbonFrag, transparent: true, depthWrite: false, depthTest: false,
      blending: blend(t0),
      uniforms: {
        uT: { value: 0 }, uAmp: { value: 0.3 }, uTwist: { value: -1.2 }, uLevel: { value: 0 },
        uA: ribbonMat.uniforms.uB, uB: ribbonMat.uniforms.uA, uOn: ribbonMat.uniforms.uOn, uAlpha: { value: 0.5 },
        uPt: { value: 1.5 },
      },
    });
    const dotGeo = (() => {
      const pos: number[] = [];
      for (let j = 0; j < 22; j++) for (let i = 0; i < 84; i++) pos.push(i / 83, j / 21, 0);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3);
      return g;
    })();
    const dots = new THREE.Points(dotGeo, dotsMat);
    dots.renderOrder = 1;
    dots.rotation.z = 0.5;
    dots.scale.setScalar(0.9);
    orb.add(dots);

    // dust
    const dustMat = new THREE.ShaderMaterial({
      vertexShader: dustVert, fragmentShader: dustFrag, transparent: true, depthWrite: false, depthTest: false,
      blending: blend(t0),
      uniforms: {
        uT: { value: 0 }, uLevel: { value: 0 }, uSize: { value: 30 }, uOn: { value: 0 },
        uA: ribbonMat.uniforms.uA, uB: ribbonMat.uniforms.uB,
      },
    });
    const dustGeo = (() => {
      const n = 240, pos = new Float32Array(n * 3), seed = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const r = 0.25 + 0.6 * Math.cbrt(Math.random()), th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
        pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i * 3);
        seed[i] = Math.random();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
      return g;
    })();
    const dust = new THREE.Points(dustGeo, dustMat);
    dust.renderOrder = 1;
    orb.add(dust);

    // faint reflection under the orb
    const floorMat = new THREE.ShaderMaterial({
      vertexShader: coreVert, fragmentShader: floorFrag, transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: C(t0.shell.rimB) }, uIntensity: { value: 0 } },
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.42), floorMat);
    floor.position.y = -1.52;
    floor.renderOrder = 0;
    scene.add(floor);

    // wireframe overlay (acting state, Ember base look)
    const wireMat = new THREE.LineBasicMaterial({
      color: C(t0.wire.color), transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: blend(t0),
    });
    const wire = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(0.985, 2)), wireMat);
    wire.renderOrder = 2;
    orb.add(wire);
    const wire2 = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(0.5, 1)), wireMat);
    wire2.renderOrder = 2;
    orb.add(wire2);

    // shell
    const shellMat = new THREE.ShaderMaterial({
      vertexShader: shellVert, fragmentShader: shellFrag, transparent: true, depthWrite: false,
      uniforms: {
        uT: { value: 0 }, uDisp: { value: t0.shell.disp }, uFreq: { value: 1.0 }, uOct: { value: t0.shell.iri > 0.5 ? 0.12 : 0.3 },
        uBase: { value: C(t0.shell.base) }, uRimA: { value: C(t0.shell.rimA) }, uRimB: { value: C(t0.shell.rimB) },
        uIri: { value: t0.shell.iri }, uCoreAlpha: { value: t0.shell.coreAlpha }, uFilmMix: { value: t0.shell.filmMix },
        uFresPow: { value: t0.shell.fresPow }, uSpec: { value: t0.shell.spec }, uShade: { value: t0.shell.shade },
        uScan: { value: t0.shell.scan }, uScanPx: { value: 6 }, uPulse: { value: 0 },
      },
    });
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 28), shellMat);
    shell.renderOrder = 3;
    orb.add(shell);

    // outer ring
    const ringMat = new THREE.ShaderMaterial({
      vertexShader: ringVert, fragmentShader: ringFrag, transparent: true, depthWrite: false, depthTest: false,
      blending: blend(t0),
      uniforms: {
        uT: { value: 0 }, uLevel: { value: 0 }, uRadius: { value: 1.42 }, uEnergy: { value: 0.3 },
        uA: { value: C(t0.ring.a) }, uB: { value: C(t0.ring.b) }, uOn: { value: t0.ring.on }, uAlpha: { value: 0.22 },
      },
    });
    const ring = new THREE.LineSegments(lineGrid(26, 240, true), ringMat);
    ring.renderOrder = 4;
    scene.add(ring);

    // post
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), t0.bloom, 0.18, 0.2);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // theme: colours ease to their targets, structural bits switch at once
    const bg = C(t0.bg);
    const clearTmp = new THREE.Color();
    const target = {
      bg: C(t0.bg), base: C(t0.shell.base), rimA: C(t0.shell.rimA), rimB: C(t0.shell.rimB),
      ribA: C(t0.ribbon.a), ribB: C(t0.ribbon.b), ringA: C(t0.ring.a), ringB: C(t0.ring.b),
      wire: C(t0.wire.color), core: C(t0.core.color),
    };
    let th = t0;
    applyThemeRef.current = (t) => {
      th = t;
      target.bg.set(t.bg); target.base.set(t.shell.base); target.rimA.set(t.shell.rimA); target.rimB.set(t.shell.rimB);
      target.ribA.set(t.ribbon.a); target.ribB.set(t.ribbon.b); target.ringA.set(t.ring.a); target.ringB.set(t.ring.b);
      target.wire.set(t.wire.color); target.core.set(t.core.color);
      ribbonMat.blending = ringMat.blending = wireMat.blending = dotsMat.blending = dustMat.blending = blend(t);
      ribbonMat.needsUpdate = ringMat.needsUpdate = wireMat.needsUpdate = dotsMat.needsUpdate = dustMat.needsUpdate = true;
    };

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cur: StateParams = { ...STATES[stateRef.current] };
    let level = 0, tSurf = 0, tRib = 0, tRing = 0, spin = 0, bloomNow = t0.bloom;
    let w = 0, h = 0, raf = 0, last = performance.now(), visible = true;
    let prevState = stateRef.current, kick = 0, dprNow = 1;
    const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: PointerEvent) => {
      tilt.tx = (e.clientX / window.innerWidth) * 2 - 1;
      tilt.ty = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const resize = () => {
      const r = host.getBoundingClientRect();
      if (!r.width || !r.height) return;
      w = r.width; h = r.height;
      const dpr = smallRef.current ? 1 : Math.min(window.devicePixelRatio || 1, w < 420 ? 1.75 : 2);
      dprNow = dpr;
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, true);
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      shellMat.uniforms.uScanPx.value = Math.max(4, Math.round((h * dpr) / 70));
    };
    resizeRef.current = resize;
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();
    const io = new IntersectionObserver((e) => { visible = e[0].isIntersecting; });
    io.observe(host);

    const mix = (a: number, b: number, k: number) => a + (b - a) * k;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!visible || !w) return;
      const k = 1 - Math.exp(-dt * 4.5);
      const kc = 1 - Math.exp(-dt * 5);
      const S = STATES[stateRef.current];
      if (stateRef.current !== prevState) { prevState = stateRef.current; kick = 1; }
      kick *= Math.exp(-dt * 2.6);
      tilt.x += (tilt.tx - tilt.x) * (1 - Math.exp(-dt * 3));
      tilt.y += (tilt.ty - tilt.y) * (1 - Math.exp(-dt * 3));
      (Object.keys(cur) as (keyof StateParams)[]).forEach((key) => { cur[key] = mix(cur[key], S[key], k); });

      // audio level: fast attack, slower release
      const raw = Math.min(Math.max(levelRef.current?.() ?? 0, 0), 1) * cur.audio;
      level = mix(level, raw, 1 - Math.exp(-dt * (raw > level ? 28 : 9)));

      const m = reduce ? 0.25 : 1;
      tSurf += dt * cur.speed * m * (1 + level * 1.5);
      tRib += dt * (0.5 + cur.speed) * m * (1 + level * 2.2);
      tRing += dt * (0.35 + cur.ring * 0.5) * m * (1 + level * 1.5);
      spin += dt * cur.spin * m;

      // theme easing
      bg.lerp(target.bg, kc);
      const su = shellMat.uniforms, s = th.shell;
      su.uBase.value.lerp(target.base, kc); su.uRimA.value.lerp(target.rimA, kc); su.uRimB.value.lerp(target.rimB, kc);
      su.uIri.value = mix(su.uIri.value, s.iri, kc);
      su.uOct.value = mix(su.uOct.value, s.iri > 0.5 ? 0.12 : 0.3, kc);
      su.uCoreAlpha.value = mix(su.uCoreAlpha.value, s.coreAlpha, kc);
      su.uFilmMix.value = mix(su.uFilmMix.value, s.filmMix, kc);
      su.uFresPow.value = mix(su.uFresPow.value, s.fresPow, kc);
      su.uSpec.value = mix(su.uSpec.value, s.spec, kc);
      su.uShade.value = mix(su.uShade.value, s.shade, kc);
      su.uScan.value = mix(su.uScan.value, s.scan, kc);
      ribbonMat.uniforms.uA.value.lerp(target.ribA, kc); ribbonMat.uniforms.uB.value.lerp(target.ribB, kc);
      ribbonMat.uniforms.uOn.value = mix(ribbonMat.uniforms.uOn.value, th.ribbon.on, kc);
      ringMat.uniforms.uA.value.lerp(target.ringA, kc); ringMat.uniforms.uB.value.lerp(target.ringB, kc);
      ringMat.uniforms.uOn.value = mix(ringMat.uniforms.uOn.value, th.ring.on * (0.45 + cur.ring * 0.75), kc);
      wireMat.color.lerp(target.wire, kc);
      coreMat.uniforms.uColor.value.lerp(target.core, kc);
      coreMat.uniforms.uIntensity.value = mix(coreMat.uniforms.uIntensity.value, th.core.intensity, kc);
      bloomNow = mix(bloomNow, th.bloom, kc);

      // state + audio
      const pulse = cur.pulse * (0.5 + 0.5 * Math.sin(now / 1000 * 2.4)) + level * 0.6 + kick * 0.5;
      su.uT.value = tSurf;
      su.uDisp.value = mix(su.uDisp.value, s.disp * cur.disp * (1 + level * 2.2) + level * 0.035, 0.5);
      su.uPulse.value = pulse;
      ribbonMat.uniforms.uT.value = tRib;
      ribbonMat.uniforms.uAmp.value = cur.amp * (0.55 + level * 1.9);
      ribbonMat.uniforms.uTwist.value = cur.twist;
      ribbonMat.uniforms.uLevel.value = level;
      ringMat.uniforms.uT.value = tRing;
      ringMat.uniforms.uLevel.value = level;
      ringMat.uniforms.uEnergy.value = cur.ring + kick * 1.2;
      dotsMat.uniforms.uT.value = -tRib * 0.7 + 3.0;
      dotsMat.uniforms.uAmp.value = cur.amp * (0.4 + level * 1.3);
      dotsMat.uniforms.uLevel.value = level;
      dotsMat.uniforms.uPt.value = 1.4 * dprNow;
      dustMat.uniforms.uT.value = tRib;
      dustMat.uniforms.uLevel.value = level;
      dustMat.uniforms.uSize.value = 15 * dprNow * (h / 700);
      dustMat.uniforms.uOn.value = mix(dustMat.uniforms.uOn.value, Math.min(1, th.ribbon.on * 2), kc);
      floorMat.uniforms.uColor.value.lerp(target.rimB, kc);
      floorMat.uniforms.uIntensity.value = mix(floorMat.uniforms.uIntensity.value, th.bloom > 0 ? 0.1 + level * 0.08 : 0, kc);
      coreMat.uniforms.uPulse.value = pulse;
      wireMat.opacity = Math.min(1, th.wire.base + cur.wire * 0.85) * (0.75 + 0.25 * Math.sin(now / 1000 * 5 * cur.wire));

      const tt = now / 1000;
      ribbon.rotation.y = spin;
      dots.rotation.y = -spin * 0.6;
      dust.rotation.y = spin * 0.5;
      orb.rotation.set(tilt.y * 0.16 * m, tilt.x * 0.22 * m, 0);
      ring.rotation.x = tilt.y * 0.12 * m;
      ring.rotation.y = tilt.x * 0.16 * m;
      dots.visible = ribbonMat.uniforms.uOn.value > 0.01;
      dust.visible = dustMat.uniforms.uOn.value > 0.01;
      floor.visible = floorMat.uniforms.uIntensity.value > 0.005;
      wire.rotation.set(tt * 0.11, tt * 0.17 + spin * 0.3, 0);
      wire2.rotation.set(-tt * 0.21, -tt * 0.13, tt * 0.09);
      wire2.visible = wire.visible = wireMat.opacity > 0.01;
      ring.rotation.z = tRing * 0.12;
      core.visible = coreMat.uniforms.uIntensity.value > 0.01;
      ribbon.visible = ribbonMat.uniforms.uOn.value > 0.01;
      ring.visible = ringMat.uniforms.uOn.value > 0.01;

      // gentle float + breathing
      const breathe = 1 + Math.sin(tt * 0.9) * 0.012 * m;
      orb.scale.setScalar(cur.scale * breathe * (1 + level * 0.04));
      orb.position.y = Math.sin(tt * 0.55) * 0.045 * m;
      orb.position.x = Math.sin(tt * 0.31) * 0.02 * m;
      ring.position.copy(orb.position);
      core.position.copy(orb.position);
      core.scale.setScalar(cur.scale * breathe);

      if (bloomNow > 0.02) {
        // The composer's OutputPass encodes to sRGB a second time for the clear colour,
        // so pre-decode it; otherwise the canvas is lighter than the page behind it.
        renderer.setClearColor(clearTmp.copy(bg).convertSRGBToLinear(), 1);
        bloom.strength = bloomNow * (1 + level * 0.35);
        composer.render();
      } else {
        renderer.setClearColor(bg, 1);
        renderer.render(scene, camera);
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      resizeRef.current = () => {};
      ro.disconnect();
      io.disconnect();
      applyThemeRef.current = () => {};
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        (mesh.material as THREE.Material | undefined)?.dispose?.();
      });
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className={className} data-orb-state={state} role="img" aria-label={`Apollo, ${state}`} />;
}

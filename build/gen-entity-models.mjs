#!/usr/bin/env node
// Regenerates src/shared/entity-models.ts — the vanilla mob GEOMETRY registry the viewer
// draws structure/world entities with (see src/renderer/viewer/entity-mesh.ts).
//
// Source data: Mojang's public bedrock-samples repository, which ships the same entity
// models Java hardcodes in code as data (.geo.json). This script converts the box
// DIMENSIONS/UVs (facts about proportions — no textures or other assets are copied) into
// Java model space and bakes the Java default-pose rotations (quadruped bodies lie down,
// spider legs splay, zombie arms reach) that Java applies in setupAnim at render time.
//
// Usage:
//   git clone --depth 1 --filter=blob:none --sparse https://github.com/Mojang/bedrock-samples
//   (cd bedrock-samples && git sparse-checkout set resource_pack/models/entity)
//   node build/gen-entity-models.mjs <path-to-bedrock-samples>
//
// Conversion rules (verified against the hand-written armor stand model + witch/spider
// rotation constants): bedrock model space is y-UP with the ground at 0 and cube origins
// ABSOLUTE; Java model space is y-DOWN with the ground at 24 and cubes relative to the
// bone pivot. x/z and UVs carry over verbatim; java_y = 24 - bedrock_y; rotation values
// are already Java-convention degrees.
import fs from 'node:fs';
import path from 'node:path';

const samplesRoot = process.argv[2];
if (!samplesRoot) {
  console.error('usage: node build/gen-entity-models.mjs <path-to-bedrock-samples>');
  process.exit(1);
}
const GEO_DIR = path.join(samplesRoot, 'resource_pack', 'models', 'entity');
const OUT = path.join(import.meta.dirname, '..', 'src', 'shared', 'entity-models.ts');

// ---------------------------------------------------------------------------
// Model list: registry key → geometry ref + tweaks.
//   geo:      '<file>#<identifier>' under resource_pack/models/entity
//   rot:      Java default-pose rotations (degrees) applied per bone; children of a
//             rotated bone are reparented to its parent (Java models are flat — bedrock
//             hierarchy exists for its animation system and must not inherit these).
//   hide:     bones dropped entirely (saddles, reins, unused ears).
//   only:     keep ONLY these bones (overlay layers like the drowned's clothes).
//   uvShift:  [du, dv] added to every box UV (bedrock packs some Java overlay textures
//             into one atlas; e.g. sheep wool lives +32px below the skin).
//   texSize:  override the declared texture size (when the Java texture differs).
// ---------------------------------------------------------------------------
const QUAD_BODY = { body: [90, 0, 0] };
const ZOMBIE_ARMS = { rightArm: [-90, 0, 0], leftArm: [-90, 0, 0] };
const SPIDER_LEGS = {
  leg0: [0, 45, -45], leg1: [0, -45, 45],
  leg2: [0, 22.5, -33.3], leg3: [0, -22.5, 33.3],
  leg4: [0, -22.5, -33.3], leg5: [0, 22.5, 33.3],
  leg6: [0, -45, -45], leg7: [0, 45, 45],
};
const HORSE_TACK = ['Saddle', 'Bridle', 'BitL', 'BitR', 'ReinsL', 'ReinsR', 'BagL', 'BagR'];
// Java's VillagerModel default pose: the hat brim is authored vertical and laid flat
// (xRot -90°), the arms fold against the chest (xRot -0.75 rad).
const VILLAGER_ARMS = { arms: [-42.97, 0, 0] };
const VILLAGER_BRIM = { brim: [-90, 0, 0] };

const MODELS = {
  allay: { geo: 'allay.geo.json#geometry.allay' },
  armadillo: { geo: 'armadillo.geo.json#geometry.armadillo' },
  axolotl: { geo: 'axolotl.geo.json#geometry.axolotl' },
  bat: { geo: 'bat_v2.geo.json#geometry.bat_v2' },
  bee: { geo: 'bee.geo.json#geometry.bee' },
  blaze: { geo: 'blaze.geo.json#geometry.blaze' },
  bogged: { geo: 'bogged.geo.json#geometry.skeleton.bogged' },
  bogged_overlay: { geo: 'bogged_armor.geo.json#geometry.bogged.armor' },
  breeze: { geo: 'breeze.geo.json#geometry.breeze' },
  breeze_eyes: { geo: 'breeze.geo.json#geometry.breeze_eyes' },
  camel: { geo: 'camel.geo.json#geometry.camel', hide: ['saddle', 'reins'] },
  cat: { geo: 'cat.geo.json#geometry.cat', rot: { body: [90, 0, 0] } },
  chicken: { geo: 'chicken.geo.json#geometry.chicken' },
  cod: { geo: 'cod.geo.json#geometry.cod' },
  cow: { geo: 'cow_v1.0.geo.json#geometry.cow', rot: QUAD_BODY },
  creaking: { geo: 'creaking.geo.json#geometry.creaking' },
  creeper: { geo: 'creeper.geo.json#geometry.creeper.v1.8' },
  dolphin: { geo: 'dolphin.geo.json#geometry.dolphin' },
  dragon: { geo: 'ender_dragon.geo.json#geometry.dragon', rot: { root: [0, 180, 0] } },
  drowned: { geo: 'drowned.geo.json#geometry.zombie.drowned.v1.16', rot: ZOMBIE_ARMS, hide: ['jacket', 'rightSleeve', 'leftSleeve', 'rightPants', 'leftPants'] },
  drowned_overlay: { geo: 'drowned.geo.json#geometry.zombie.drowned.v1.16', rot: ZOMBIE_ARMS, only: ['body', 'head', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg', 'jacket', 'rightSleeve', 'leftSleeve', 'rightPants', 'leftPants'], hideCubesOf: ['body', 'head', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'] },
  endermite: { geo: 'endermite.geo.json#geometry.endermite' },
  enderman: { geo: 'enderman.geo.json#geometry.enderman.v1.8' },
  evoker: { geo: 'evoker.geo.json#geometry.evoker.v1.8', rot: VILLAGER_ARMS, hide: ['rightArm', 'leftArm', 'rightItem', 'leftItem'] },
  fox: { geo: 'fox.geo.json#geometry.fox', texSize: [48, 32] },
  frog: { geo: 'frog.geo.json#geometry.frog' },
  ghast: { geo: 'ghast.geo.json#geometry.ghast' },
  glow_squid: { geo: 'glow_squid.geo.json#geometry.glow_squid' },
  goat: { geo: 'goat.geo.json#geometry.goat' },
  guardian: { geo: 'guardian.geo.json#geometry.guardian.v1.8' },
  happy_ghast: { geo: 'happy_ghast.geo.json#geometry.happy_ghast' },
  hoglin: { geo: 'hoglin.geo.json#geometry.hoglin' },
  horse: { geo: 'horse_v3.geo.json#geometry.horse.v3', hide: [...HORSE_TACK, 'MuleEarL', 'MuleEarR'] },
  mule: { geo: 'horse_v3.geo.json#geometry.horse.v3', hide: [...HORSE_TACK, 'EarL', 'EarR'] },
  zombie: { geo: '#humanoid64', rot: ZOMBIE_ARMS }, // synthetic, defined below (Java 64x64 skin layout)
  iron_golem: { geo: 'iron_golem.geo.json#geometry.irongolem' },
  llama: { geo: 'llama.geo.json#geometry.llama.v1.8', rot: QUAD_BODY, hide: ['chests'] },
  magma_cube: { geo: 'magma_cube.geo.json#geometry.lavaslime' },
  mooshroom: { geo: 'mooshroom.geo.json#geometry.mooshroom.v1.8', rot: QUAD_BODY },
  ocelot: { geo: 'ocelot.geo.json#geometry.ocelot.v1.8', rot: { body: [90, 0, 0] } },
  panda: { geo: 'panda.geo.json#geometry.panda' },
  parrot: { geo: 'parrot.geo.json#geometry.parrot' },
  phantom: { geo: 'phantom.geo.json#geometry.phantom' },
  pig: { geo: 'pig_v1.0.geo.json#geometry.pig', rot: QUAD_BODY },
  piglin: { geo: 'piglin.geo.json#geometry.piglin' },
  pillager: { geo: 'pillager.geo.json#geometry.pillager' },
  polar_bear: { geo: 'polar_bear.geo.json#geometry.polarbear', rot: QUAD_BODY },
  pufferfish: { geo: 'pufferfish.geo.json#geometry.pufferfish.large.v1.8' },
  rabbit: { geo: 'rabbit.geo.json#geometry.rabbit.v1.8' },
  ravager: { geo: 'ravager.geo.json#geometry.ravager' },
  salmon: { geo: 'salmon.geo.json#geometry.salmon' },
  sheep: { geo: 'sheep.geo.json#geometry.sheep.sheared.v1.8', rot: QUAD_BODY, texSize: [64, 32] },
  sheep_wool: { geo: 'sheep.geo.json#geometry.sheep.v1.8', own: true, uvShift: [0, -32], rot: QUAD_BODY, texSize: [64, 32] },
  shulker: { geo: 'shulker.geo.json#geometry.shulker.v1.8' },
  silverfish: { geo: 'silverfish.geo.json#geometry.silverfish' },
  skeleton: { geo: 'skeleton.geo.json#geometry.skeleton.v1.8' },
  slime: { geo: 'slime.geo.json#geometry.slime' },
  slime_outer: { geo: 'slime_armor.geo.json#geometry.slime.armor' },
  sniffer: { geo: 'sniffer.geo.json#geometry.sniffer' },
  snow_golem: { geo: 'snow_golem.geo.json#geometry.snowgolem.v1.8', texSize: [64, 64] },
  spider: { geo: 'spider.geo.json#geometry.spider.v1.8', rot: SPIDER_LEGS },
  squid: { geo: 'squid.geo.json#geometry.squid' },
  stray_overlay: { geo: 'stray_armor.geo.json#geometry.stray.armor.v1.8' },
  strider: { geo: 'strider.geo.json#geometry.strider', hide: ['saddle'] },
  tadpole: { geo: 'tadpole.geo.json#geometry.tadpole' },
  tropical_fish: { geo: 'tropical_fish.geo.json#geometry.tropicalfish_a' },
  turtle: { geo: 'turtle.geo.json#geometry.turtle' },
  vex: { geo: 'vex.geo.json#geometry.vex.v1.8' },
  villager: { geo: 'villager_v2.geo.json#geometry.villager_v2', texSize: [64, 64], rot: { ...VILLAGER_ARMS, ...VILLAGER_BRIM } },
  vindicator: { geo: 'vindicator.geo.json#geometry.vindicator.v1.8', rot: VILLAGER_ARMS, hide: ['rightArm', 'leftArm', 'rightItem', 'leftItem'] },
  warden: { geo: 'warden.geo.json#geometry.warden' },
  witch: { geo: 'witch.geo.json#geometry.villager.witch.v1.8', rot: VILLAGER_ARMS },
  wither: { geo: 'wither_boss.geo.json#geometry.witherBoss' },
  wither_skeleton: { geo: 'wither_skeleton.geo.json#geometry.skeleton.wither.v1.8' },
  wolf: { geo: 'wolf.geo.json#geometry.wolf', rot: { body: [90, 0, 0], upperBody: [90, 0, 0], tail: [55, 0, 0] } },
  zombie_villager: { geo: 'zombie_villager_v2.geo.json#geometry.zombie.villager_v2', rot: { ...ZOMBIE_ARMS, ...VILLAGER_BRIM } },
};

// Java 64x64 skin-layout humanoid (zombie/husk/etc.) — bedrock only ships the legacy
// 64x32 layout, whose left-limb regions don't exist on modern Java textures.
const HUMANOID64 = {
  texSize: [64, 64],
  bones: [
    { name: 'head', pivot: [0, 24, 0], cubes: [{ origin: [-4, 24, -4], size: [8, 8, 8], uv: [0, 0] }] },
    { name: 'hat', parent: 'head', pivot: [0, 24, 0], cubes: [{ origin: [-4, 24, -4], size: [8, 8, 8], uv: [32, 0], inflate: 0.5 }] },
    { name: 'body', pivot: [0, 24, 0], cubes: [{ origin: [-4, 12, -2], size: [8, 12, 4], uv: [16, 16] }] },
    { name: 'rightArm', pivot: [-5, 22, 0], cubes: [{ origin: [-8, 12, -2], size: [4, 12, 4], uv: [40, 16] }] },
    { name: 'leftArm', pivot: [5, 22, 0], cubes: [{ origin: [4, 12, -2], size: [4, 12, 4], uv: [32, 48] }] },
    { name: 'rightLeg', pivot: [-1.9, 12, 0], cubes: [{ origin: [-3.9, 0, -2], size: [4, 12, 4], uv: [0, 16] }] },
    { name: 'leftLeg', pivot: [1.9, 12, 0], cubes: [{ origin: [-0.1, 0, -2], size: [4, 12, 4], uv: [16, 48] }] },
  ],
};

// --------------------------- geometry parsing ------------------------------

/** All geometries across every file, keyed by identifier (before any ':'). */
function loadAllGeometries() {
  const byId = new Map();
  for (const file of fs.readdirSync(GEO_DIR)) {
    if (!file.endsWith('.json')) continue;
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(path.join(GEO_DIR, file), 'utf8'));
    } catch {
      continue; // a few sample files carry comments/trailing commas; none we need
    }
    if (Array.isArray(doc['minecraft:geometry'])) {
      for (const g of doc['minecraft:geometry']) {
        const d = g.description ?? {};
        byId.set(d.identifier, {
          texSize: [d.texture_width ?? 64, d.texture_height ?? 64],
          bones: g.bones ?? [],
          parent: undefined,
        });
      }
    } else {
      for (const [key, g] of Object.entries(doc)) {
        if (key === 'format_version') continue;
        const [id, parentId] = key.split(':');
        byId.set(id, {
          texSize: [g.texturewidth ?? 64, g.textureheight ?? 64],
          bones: g.bones ?? [],
          parent: parentId,
        });
      }
    }
  }
  return byId;
}

/** Legacy `child:parent` inheritance — parent bones first, child bones replace by name. */
function resolveBones(geos, id, ownOnly) {
  const g = geos.get(id);
  if (!g) throw new Error(`geometry not found: ${id}`);
  if (!g.parent || ownOnly) return { texSize: g.texSize, bones: g.bones };
  const base = resolveBones(geos, g.parent, false);
  const merged = [...base.bones];
  for (const child of g.bones) {
    const i = merged.findIndex((b) => b.name === child.name);
    if (i >= 0) merged[i] = { ...merged[i], ...child };
    else merged.push(child);
  }
  const texSize = g.texSize[0] && g.texSize[1] !== undefined && geos.get(id).texSize.every((n) => n) ? g.texSize : base.texSize;
  return { texSize, bones: merged };
}

// --------------------------- conversion ------------------------------------

const r3 = (n) => Math.round(n * 1000) / 1000;
const v3 = (a) => [r3(a[0]), r3(a[1]), r3(a[2])];

// Bedrock per-face names → the renderer's FACES-table keys (JAVA model space: x/z carry
// over — bedrock 'north' IS the java -z front — but the y-flip to world means bedrock
// 'up' renders on the key 'down' and vice versa).
const FACE_MAP = { north: 'north', south: 'south', east: 'east', west: 'west', up: 'down', down: 'up' };

/** One bedrock cube → Java-space MobCube (relative to the JAVA pivot). */
function convertCube(cube, bonePivotJ, boneMirror, uvShift) {
  const [ox, oy, oz] = cube.origin;
  const [w, h, d] = cube.size;
  const fromJ = [ox, 24 - oy - h, oz];
  const out = {
    from: v3([fromJ[0] - bonePivotJ[0], fromJ[1] - bonePivotJ[1], fromJ[2] - bonePivotJ[2]]),
    size: v3([w, h, d]),
  };
  if (cube.uv && !Array.isArray(cube.uv)) {
    const faces = {};
    for (const [bk, face] of Object.entries(cube.uv)) {
      const key = FACE_MAP[bk];
      if (!key || !face?.uv) continue;
      const fw = face.uv_size?.[0] ?? w;
      const fh = face.uv_size?.[1] ?? h;
      faces[key] = [r3(face.uv[0] + uvShift[0]), r3(face.uv[1] + uvShift[1]), r3(face.uv[0] + fw + uvShift[0]), r3(face.uv[1] + fh + uvShift[1])];
    }
    out.faces = faces;
  } else {
    const uv = cube.uv ?? [0, 0];
    out.uv = [r3(uv[0] + uvShift[0]), r3(uv[1] + uvShift[1])];
  }
  const inflate = cube.inflate ?? 0;
  if (inflate) out.inflate = r3(inflate);
  const mirror = cube.mirror ?? boneMirror;
  if (mirror) out.mirror = true;
  return out;
}

/** Convert one configured model into the emitted Java-space shape. */
function convertModel(geos, key, spec) {
  let texSize, rawBones;
  if (spec.geo === '#humanoid64') {
    ({ texSize } = HUMANOID64);
    rawBones = HUMANOID64.bones;
  } else {
    const [, id] = spec.geo.split('#');
    ({ texSize, bones: rawBones } = resolveBones(geos, id, !!spec.own));
  }
  if (spec.texSize) texSize = spec.texSize;
  const uvShift = spec.uvShift ?? [0, 0];
  const hide = new Set(spec.hide ?? []);
  const only = spec.only ? new Set(spec.only) : null;
  const hideCubes = new Set(spec.hideCubesOf ?? []);
  const poseRot = spec.rot ?? {};

  // Filter + index bones by name (keep declared order — parents come first).
  let bones = rawBones.filter((b) => !hide.has(b.name) && (!only || only.has(b.name)) && !b.neverRender);
  const names = new Map(bones.map((b, i) => [b.name, i]));

  // A bone getting a config pose rotation must not pass it to its children (Java models
  // are flat) — reparent its children one level up.
  const parentOf = (b) => {
    let p = b.parent;
    while (p !== undefined && (poseRot[p] || !names.has(p))) p = rawBones.find((x) => x.name === p)?.parent;
    return p;
  };

  const out = [];
  const subBones = []; // cubes carrying their own rotation become child bones
  bones.forEach((b, boneIndex) => {
    const pivotB = b.pivot ?? [0, 0, 0];
    const pivotJ = v3([pivotB[0], 24 - pivotB[1], pivotB[2]]);
    const bone = { name: b.name, pivot: pivotJ };
    const parent = parentOf(b);
    if (parent !== undefined && names.has(parent)) bone.parent = names.get(parent);
    const rot = poseRot[b.name] ?? b.rotation;
    if (rot && rot.some((n) => n)) bone.rot = v3(rot);
    const cubes = hideCubes.has(b.name) ? [] : (b.cubes ?? []);
    bone.cubes = [];
    cubes.forEach((c, cubeIndex) => {
      if (c.rotation && c.rotation.some((n) => n)) {
        const cp = c.pivot ?? pivotB;
        const cpJ = v3([cp[0], 24 - cp[1], cp[2]]);
        subBones.push({
          name: `${b.name}#${cubeIndex}`,
          parent: boneIndex,
          pivot: cpJ,
          rot: v3(c.rotation),
          cubes: [convertCube(c, cpJ, b.mirror, uvShift)],
        });
      } else {
        bone.cubes.push(convertCube(c, pivotJ, b.mirror, uvShift));
      }
    });
    out.push(bone);
  });
  return { texSize: [texSize[0], texSize[1]], bones: [...out, ...subBones] };
}

// --------------------------- emit -------------------------------------------

/** Blaze rods are positioned by setupAnim in Java (and by animations in bedrock) — the
 *  geometry binds all 12 at the origin. Place them statically in vanilla's three rings
 *  of four (lower ring widest), so a static blaze reads as a blaze. */
function poseBlazeRods(model) {
  const RINGS = [
    { y: 16, r: 9, phase: 0 },
    { y: 8, r: 7, phase: 45 },
    { y: 0, r: 5, phase: 22.5 },
  ];
  for (const bone of model.bones) {
    const m = /^upperBodyParts(\d+)$/.exec(bone.name);
    if (!m) continue;
    const i = Number(m[1]);
    const ring = RINGS[Math.floor(i / 4)];
    const angle = ((i % 4) * 90 + ring.phase) * (Math.PI / 180);
    bone.pivot = v3([Math.cos(angle) * ring.r, ring.y, Math.sin(angle) * ring.r]);
    for (const cube of bone.cubes) cube.from = v3([-1, 0, -1]);
  }
}

const geos = loadAllGeometries();
const models = {};
const report = [];
for (const [key, spec] of Object.entries(MODELS)) {
  try {
    const m = convertModel(geos, key, spec);
    if (key === 'blaze') poseBlazeRods(m);
    models[key] = m;
    const cubes = m.bones.reduce((n, b) => n + b.cubes.length, 0);
    report.push(`${key}: ${m.bones.length} bones, ${cubes} cubes, tex ${m.texSize.join('x')}`);
  } catch (e) {
    report.push(`${key}: FAILED — ${e.message}`);
    process.exitCode = 1;
  }
}

const lines = [];
lines.push('// GENERATED by build/gen-entity-models.mjs — do not edit by hand.');
lines.push('// Vanilla mob box models in Java model space (pixels, y-down, ground at y=24; cubes');
lines.push('// relative to each bone pivot; box-UV per Minecraft\'s entity unwrap). Derived from');
lines.push('// the geometry data in Mojang\'s public bedrock-samples repository (box dimensions');
lines.push('// and UV offsets only — no assets), with Java default-pose rotations baked in.');
lines.push('// Textures are resolved separately from the user\'s content pack (never bundled).');
lines.push('');
lines.push("import type { FaceDir } from './types';");
lines.push('');
lines.push('type Vec3 = [number, number, number];');
lines.push('');
lines.push('/** One textured box of a mob bone (Java model space, relative to the bone pivot). */');
lines.push('export interface MobCube {');
lines.push('  from: Vec3;');
lines.push('  size: Vec3;');
lines.push("  /** Box-UV atlas origin (px) — Minecraft's standard entity unwrap. */");
lines.push('  uv?: [number, number];');
lines.push('  /** Explicit per-face atlas rects [x1,y1,x2,y2] (px) for models authored that way. */');
lines.push('  faces?: Partial<Record<FaceDir, [number, number, number, number]>>;');
lines.push('  /** Grow the box this many px on every side (overlay/wool layers). */');
lines.push('  inflate?: number;');
lines.push('  /** Mirror the box UV in X (left limbs). */');
lines.push('  mirror?: boolean;');
lines.push('}');
lines.push('');
lines.push('/** A mob bone: pivot in Java model space, an optional default-pose rotation');
lines.push(' *  (Java-convention degrees), and its boxes. `parent` indexes MobModel.bones. */');
lines.push('export interface MobBone {');
lines.push('  name: string;');
lines.push('  parent?: number;');
lines.push('  pivot: Vec3;');
lines.push('  rot?: Vec3;');
lines.push('  cubes: MobCube[];');
lines.push('}');
lines.push('');
lines.push('export interface MobModel {');
lines.push('  /** Atlas size (px) the UVs are authored against. */');
lines.push('  texSize: [number, number];');
lines.push('  bones: MobBone[];');
lines.push('}');
lines.push('');
lines.push('export const MOB_MODELS: Record<string, MobModel> = {');
for (const [key, m] of Object.entries(models)) {
  lines.push(`  ${key}: {`);
  lines.push(`    texSize: [${m.texSize.join(', ')}],`);
  lines.push('    bones: [');
  for (const b of m.bones) lines.push(`      ${JSON.stringify(b)},`);
  lines.push('    ],');
  lines.push('  },');
}
lines.push('};');
lines.push('');

fs.writeFileSync(OUT, lines.join('\n'));
console.log(report.join('\n'));
console.log(`\nwrote ${OUT}`);

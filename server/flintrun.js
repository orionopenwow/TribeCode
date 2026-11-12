// Flint's run-through and proof of work (feat/flint-runthrough, docs/FLINT-TIERS.md, docs/FLINT-CREATORS.md).
// The run-through itself plays in the browser (app/ui/flintrun.js: Flint drives the real app with his normal commands);
// this module gives it what only the host has, and keeps the ZIPs it makes:
//   GET  /api/flint/proof/files?project=   -> { files: [{ path, size, b64 }], skipped, total }   the project's code (no .git,
//                                              dot folders, node_modules or secret files; at most 600 files / 40 MB)
//   GET  /api/flint/proof/manifest         -> { tribe, members, projects }                      who and what is in the tribe
//   POST /api/flint/proof/save?name=x.zip  (raw ZIP bytes) -> { name, path, size }               into <tribe>/exports/
//   GET  /api/flint/proof                  -> { dir, files: [{ name, size, at }] }               what is in exports/
//   GET  /api/flint/proof/file?name=       -> the ZIP's bytes (a download)
//   POST /api/flint/blender { model?, frames?, size?, engine?, name? } -> { name, path, script, run }
//        The Blender bridge stub: writes a Python script for a turntable render into <tribe>/exports/blender/. The
//        person runs it in their own Blender (`blender -b -P <script>`); TribeCode never starts Blender or runs code.
// Nothing here calls a model or any outside service. The ZIPs are built in the browser with the existing store-only
// ZIP writer (app/ui/exporter.js TribeExport.zip), so there is one ZIP writer in the codebase.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const SKIP = new Set(['node_modules', 'bower_components', '__pycache__', 'venv', 'dist', 'target', 'Pods']);
const SECRET = /^(\.env(\..*)?|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|.*\.(pem|key|p12|pfx|keystore|jks|kdbx|asc|gpg)|credentials(\..*)?|secrets?(\..*)?|\.npmrc|\.netrc)$/i;
const MAX_FILES = 600, MAX_TOTAL = 40 * 1024 * 1024, MAX_FILE = 8 * 1024 * 1024, MAX_ZIP = 120 * 1024 * 1024;
const okName = n => /^[\w][\w .()-]{0,118}\.(zip|py)$/i.test(String(n || '')) && !/\.\./.test(n);

// ---------- the Blender bridge stub: a turntable render script the person runs themselves ----------
function blenderScript({ model = '', frames = 120, size = 1080, engine = 'eevee', name = 'turntable' } = {}) {
  frames = Math.max(12, Math.min(720, Math.round(+frames || 120)));
  size = Math.max(256, Math.min(4096, Math.round(+size || 1080)));
  const eng = /cycles/i.test(engine) ? 'CYCLES' : 'EEVEE';
  const out = String(name || 'turntable').replace(/[^\w-]+/g, '-').slice(0, 40) || 'turntable';
  const mdl = String(model || '').replace(/["\\\r\n]/g, '').slice(0, 300);
  return `# TribeCode · Flint's Blender bridge (stub): a turntable render, written for you to run yourself.
# Made by Flint on ${new Date().toISOString().slice(0, 10)}. Nothing ran on your computer: read it, then run it.
#
#   blender -b -P ${out}-turntable.py                      # renders the open/default scene's objects
#   blender -b -P ${out}-turntable.py -- --model hero.glb  # imports a model first (.glb .gltf .obj .fbx .stl .ply)
#   blender -b -P ${out}-turntable.py -- --frames 240 --size 1920 --engine cycles --out //renders/${out}_
#
# What it does: frames the objects, adds a camera on a circle that turns once around them over the frames, a soft
# three-point light and a plain floor, then renders PNG frames (and an MP4 if your Blender has FFmpeg). It only adds
# new objects named "TC_*"; it never deletes or saves over your .blend file.
import sys, math, os
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def opt(name, default):
    if "--" + name in argv:
        i = argv.index("--" + name)
        if i + 1 < len(argv): return argv[i + 1]
    return default

MODEL = opt("model", "${mdl}")
FRAMES = int(opt("frames", ${frames}))
SIZE = int(opt("size", ${size}))
ENGINE = opt("engine", "${eng}").upper()
OUT = opt("out", "//renders/${out}_")

scene = bpy.context.scene

# 1 · import a model when one is given
if MODEL:
    path = bpy.path.abspath(MODEL)
    ext = os.path.splitext(path)[1].lower()
    importers = {
        ".glb": lambda p: bpy.ops.import_scene.gltf(filepath=p), ".gltf": lambda p: bpy.ops.import_scene.gltf(filepath=p),
        ".fbx": lambda p: bpy.ops.import_scene.fbx(filepath=p), ".obj": lambda p: (bpy.ops.wm.obj_import(filepath=p) if hasattr(bpy.ops.wm, "obj_import") else bpy.ops.import_scene.obj(filepath=p)),
        ".stl": lambda p: (bpy.ops.wm.stl_import(filepath=p) if hasattr(bpy.ops.wm, "stl_import") else bpy.ops.import_mesh.stl(filepath=p)),
        ".ply": lambda p: (bpy.ops.wm.ply_import(filepath=p) if hasattr(bpy.ops.wm, "ply_import") else bpy.ops.import_mesh.ply(filepath=p)),
    }
    if ext not in importers: raise SystemExit("TribeCode turntable: unsupported model type " + ext)
    importers[ext](path)

meshes = [o for o in scene.objects if o.type == "MESH" and not o.name.startswith("TC_")]
if not meshes:
    bpy.ops.mesh.primitive_monkey_add(size=1.5)
    bpy.context.active_object.name = "TC_Suzanne"
    meshes = [bpy.context.active_object]

# 2 · frame the objects: their combined bounding box
pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
center, radius = (lo + hi) / 2, max((hi - lo).length / 2, 0.01)

# 3 · a pivot at the center, the camera on a circle around it
pivot = bpy.data.objects.new("TC_Pivot", None); scene.collection.objects.link(pivot); pivot.location = center
cam_data = bpy.data.cameras.new("TC_Camera"); cam_data.lens = 50
cam = bpy.data.objects.new("TC_Camera", cam_data); scene.collection.objects.link(cam)
cam.parent = pivot; cam.location = (0, -radius * 3.2, radius * 0.9)
track = cam.constraints.new("TRACK_TO"); track.target = pivot; track.track_axis = "TRACK_NEGATIVE_Z"; track.up_axis = "UP_Y"
scene.camera = cam
scene.frame_start, scene.frame_end = 1, FRAMES
pivot.rotation_euler = (0, 0, 0); pivot.keyframe_insert("rotation_euler", index=2, frame=1)
pivot.rotation_euler = (0, 0, math.tau); pivot.keyframe_insert("rotation_euler", index=2, frame=FRAMES + 1)
for fc in (pivot.animation_data.action.fcurves if pivot.animation_data and pivot.animation_data.action and hasattr(pivot.animation_data.action, "fcurves") else []):
    for k in fc.keyframe_points: k.interpolation = "LINEAR"

# 4 · light and a floor
def light(name, kind, energy, loc):
    d = bpy.data.lights.new(name, kind); d.energy = energy
    o = bpy.data.objects.new(name, d); scene.collection.objects.link(o); o.location = center + Vector(loc)
    c = o.constraints.new("TRACK_TO"); c.target = pivot; c.track_axis = "TRACK_NEGATIVE_Z"; c.up_axis = "UP_Y"
light("TC_Key", "AREA", 400 * radius, (radius * 2.5, -radius * 2.5, radius * 3))
light("TC_Fill", "AREA", 150 * radius, (-radius * 3, -radius, radius * 1.5))
light("TC_Rim", "AREA", 250 * radius, (0, radius * 3, radius * 2.5))
bpy.ops.mesh.primitive_plane_add(size=radius * 20, location=(center.x, center.y, lo.z)); bpy.context.active_object.name = "TC_Floor"

# 5 · render settings: EEVEE (Next on 4.2+) or Cycles, PNG frames, an MP4 when FFmpeg is there
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
scene.render.engine = "CYCLES" if ENGINE == "CYCLES" else ("BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE")
if scene.render.engine == "CYCLES": scene.cycles.samples = 64
scene.render.resolution_x = scene.render.resolution_y = SIZE
scene.render.film_transparent = False
scene.render.filepath = OUT
scene.render.image_settings.file_format = "PNG"
print("TribeCode turntable: rendering %d frames at %dpx with %s to %s" % (FRAMES, SIZE, scene.render.engine, bpy.path.abspath(OUT)))
bpy.ops.render.render(animation=True)
try:
    scene.render.image_settings.file_format = "FFMPEG"; scene.render.ffmpeg.format = "MPEG4"; scene.render.ffmpeg.codec = "H264"
    scene.render.filepath = OUT + "turntable.mp4"; bpy.ops.render.render(animation=True)
except Exception as e:
    print("TribeCode turntable: no MP4 (%s); the PNG frames are there." % e)
print("TribeCode turntable: done.")
`;
}

module.exports = function flintRun({ P, root, tribe, getMembers, publicMember, log = () => {} }) {
  const exportsDir = () => path.join(root, 'exports');
  const can = me => me && !['spectator', 'guest', 'agent'].includes(me.role);

  function repoFiles(pid) {
    const p = P.get(pid || P.current() || P.defaultId()); if (!p || !p.repo) return { files: [], skipped: 0, total: 0 };
    let base; try { base = fs.realpathSync(p.repo); } catch { return { files: [], skipped: 0, total: 0 }; }
    const files = []; let total = 0, skipped = 0;
    const walk = (rel, depth) => {
      if (depth > 8) return;
      let ents = []; try { ents = fs.readdirSync(path.join(base, rel), { withFileTypes: true }); } catch { return; }
      ents.sort((a, b) => a.name.localeCompare(b.name));
      for (const e of ents) {
        if (e.name.startsWith('.') || SKIP.has(e.name) || SECRET.test(e.name)) continue;
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) { walk(r, depth + 1); continue; }
        if (!e.isFile()) continue;
        let st; try { st = fs.statSync(path.join(base, r)); } catch { continue; }
        if (st.size > MAX_FILE || files.length >= MAX_FILES || total + st.size > MAX_TOTAL) { skipped++; continue; }
        total += st.size; files.push({ path: r, size: st.size, b64: fs.readFileSync(path.join(base, r)).toString('base64') });
      }
    };
    walk('', 0);
    return { files, skipped, total };
  }
  function readRaw(req, limit) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('that ZIP is too big'), { status: 413 })); req.destroy(); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject);
    });
  }
  function list() {
    let names = []; try { names = fs.readdirSync(exportsDir()).filter(n => /\.zip$/i.test(n)); } catch {}
    return names.map(n => { const st = fs.statSync(path.join(exportsDir(), n)); return { name: n, size: st.size, at: st.mtime.toISOString() }; }).sort((a, b) => b.at.localeCompare(a.at));
  }

  async function route(req, res, { m, b, c, me, url, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    try {
      if (b === 'blender' && m === 'POST') {
        if (!can(me)) return fail(res, 403, 'only builders make files');
        const body = await readBody(req, 8 * 1024).catch(() => ({}));
        const name = String(body.name || (P.get(P.current() || P.defaultId()) || {}).name || 'turntable').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).toLowerCase() || 'turntable';
        const script = blenderScript({ ...body, name });
        const dir = path.join(exportsDir(), 'blender'); fs.mkdirSync(dir, { recursive: true });
        const file = `${name}-turntable.py`; fs.writeFileSync(path.join(dir, file), script);
        log(`flint blender bridge: wrote exports/blender/${file}`);
        return send(res, 200, { name: file, path: path.join(dir, file), script, run: `blender -b -P "${path.join(dir, file)}"${body.model ? ` -- --model "${String(body.model).replace(/"/g, '')}"` : ''}` });
      }
      if (b !== 'proof') return fail(res, 404, 'no such route');
      if (m === 'GET' && !c) return send(res, 200, { dir: exportsDir(), files: list() });
      if (m === 'GET' && c === 'files') { const pid = url.searchParams.get('project') || P.current() || P.defaultId(); if (P.canSee && !P.canSee(me, pid)) return fail(res, 404, 'project not found'); return send(res, 200, repoFiles(pid)); }
      if (m === 'GET' && c === 'manifest') {
        const members = (getMembers() || []).map(publicMember).filter(Boolean);
        const projects = (P.visibleTo ? P.visibleTo(me) : P.all()).map(p => ({ id: p.id, name: p.name, emoji: p.emoji || '', created: p.created || '', hasRepo: !!p.repo }));
        return send(res, 200, { tribe: { name: tribe.name, created: tribe.created }, members, projects, at: new Date().toISOString() });
      }
      if (m === 'GET' && c === 'file') {
        const name = String(url.searchParams.get('name') || ''); if (!okName(name)) return fail(res, 400, 'which file?');
        const f = path.join(exportsDir(), name); if (!fs.existsSync(f)) return fail(res, 404, 'no such export');
        res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${name.replace(/"/g, '')}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
        return fs.createReadStream(f).pipe(res);
      }
      if (m === 'POST' && c === 'save') {
        if (!can(me)) return fail(res, 403, 'only builders save exports');
        const name = String(url.searchParams.get('name') || ''); if (!okName(name) || !/\.zip$/i.test(name)) return fail(res, 400, 'name it like project-proof.zip');
        const buf = await readRaw(req, MAX_ZIP);
        if (buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50) return fail(res, 400, 'that is not a ZIP');
        fs.mkdirSync(exportsDir(), { recursive: true });
        const f = path.join(exportsDir(), name), tmp = f + '.tmp'; fs.writeFileSync(tmp, buf); fs.renameSync(tmp, f);
        log(`flint proof: exports/${name} (${buf.length} bytes)`);
        return send(res, 200, { name, path: f, size: buf.length });
      }
    } catch (e) { return fail(res, e.status || 500, e.message); }
    return fail(res, 404, 'no such route');
  }
  return { route, repoFiles, blenderScript, list };
};
module.exports.blenderScript = blenderScript;

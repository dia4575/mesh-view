# MeshView Studio

Professional, lightweight 3D model viewer and inspector that runs entirely in your browser.

Works on **Windows 11** (desktop browsers) and **Android** (mobile browsers).

---

## Features

- **Formats**: GLB, glTF (including **Draco** + **Meshopt** compressed), OBJ (+ MTL), STL, FBX, PLY, 3MF
- **Viewport**: Orbit, pan, zoom (mouse + touch / pinch), auto-frame, fit, reset
- **Cameras**: Perspective & orthographic, front/back/left/right/top/bottom/iso views
- **Shading**: Material preview, solid, wireframe, wireframe overlay, normals
- **Lighting**: Exposure, ambient / key / fill intensity, environment presets (Studio, Neutral, Warm, Cool)
- **Material override**: Color, metalness, roughness for solid shading; one-click restore originals
- **Scene hierarchy**: Expandable tree, visibility toggles, select, frame, isolate, hide
- **Inspector**: Mesh/vertex/triangle counts, dimensions, materials, textures, animations
- **Large files**: Progress UI, pixel-ratio reduction for very large assets, clearer OOM errors
- **Extras**: Drag & drop, screenshot, measurement tool, animation playback, fullscreen
- **Design**: Dark premium UI, responsive desktop + mobile layouts

All model processing is **local** in the browser. Nothing is uploaded to a server.
inside the MTL are matched by **filename**, so folder prefixes like `textures/floor.jpg` still work if you include `floor.jpg`.
- **STL / PLY**: Geometry only (no materials in most files). Default material applied.
- **FBX**: Geometry, materials, and animations when present. Complex scenes may vary.
- **3MF**: Basic geometry support.
- **OFF / XYZ**: Not fully implemented (error shown if selected).
- **.blend / USD**: Not supported.
faster — the mesh still downloads fully into your browser and runs on your GPU.

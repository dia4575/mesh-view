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

**Requires an internet connection** only to load Three.js (and Draco decoder) from the CDN (jsDelivr) on first visit / when the cache is empty.

---

## A. Extract the ZIP (Windows 11)

1. Download `meshview-studio.zip`.
2. Right-click the ZIP → **Extract All…**
3. Choose a folder (e.g. `C:\Users\YourName\Documents\meshview-studio`) and extract.

You should see:

```
meshview-studio/
  index.html
  README.md
  css/
    styles.css
  js/
    main.js
  assets/          (empty, reserved)
```

---

## B. Run locally on Windows 11

Modern browsers block loading ES modules from `file://`. You need a tiny local web server.

### Option 1 — Python (recommended, usually pre-installed)

1. Open **PowerShell** or **Command Prompt**.
2. Go to the project folder:

```powershell
cd C:\Users\YourName\Documents\meshview-studio
```

3. Start the server:

```powershell
python -m http.server 8000
```

If `python` is not found, try:

```powershell
py -m http.server 8000
```

4. Leave that window open.

### Option 2 — Node.js (if you have it)

```powershell
npx --yes serve -p 8000
```

### Option 3 — VS Code Live Server

Install the “Live Server” extension and click **Go Live** on `index.html`.

---

## C. Open in a desktop browser

1. Open Chrome, Edge, or Firefox.
2. Go to: **http://localhost:8000**
3. Click **Import** or drag a model onto the viewport.

Supported browsers: recent Chrome, Edge, Firefox, Safari. WebGL is required.

---

## D. Open on your Android phone (same Wi-Fi)

1. Keep the local server running on the laptop.
2. Find your laptop’s local IP address:

   - PowerShell: `ipconfig`
   - Look for **IPv4 Address** under your Wi-Fi adapter (e.g. `192.168.1.42`).

3. On the phone, open Chrome (or any modern browser).
4. Go to: **http://YOUR_IP:8000**  
   Example: `http://192.168.1.42:8000`

5. Both devices must be on the **same Wi-Fi network**.
6. Windows Firewall may ask to allow Python — choose **Allow** on private networks.

**Security note:** Do **not** expose this development server to the public internet. Use it only on your local network.

---

## E. Deploy to a free static host (public URL)

Because MeshView Studio is a static site, you can host it on:

- **GitHub Pages**
- **Netlify** (drag-and-drop the folder)
- **Cloudflare Pages**
- **Vercel**

Steps (Netlify example):

1. Go to [https://app.netlify.com/drop](https://app.netlify.com/drop)
2. Drag the entire `meshview-studio` folder onto the page.
3. You receive a public HTTPS URL immediately.

HTTPS is recommended for production; some browser features work more reliably over secure contexts.

---

## F. Requirements & limitations

| Item | Notes |
|------|--------|
| Internet | Needed to download Three.js (CDN) the first time |
| WebGL | Required. Most modern phones and PCs support it |
| Memory | Large models (>50–80 MB) may struggle on 2 GB VRAM / low-end phones |
| HTTPS | Not required for localhost; recommended for public hosting |
| Upload | Models never leave your device |

### Format notes

- **GLB / glTF**: Best support (materials, textures, animations, hierarchy).
- **OBJ + MTL**: Materials and textures when companion files are selected **together** (multi-select .obj + .mtl + every texture image). Path names inside the MTL are matched by **filename**, so folder prefixes like `textures/floor.jpg` still work if you include `floor.jpg`.
- **STL / PLY**: Geometry only (no materials in most files). Default material applied.
- **FBX**: Geometry, materials, and animations when present. Complex scenes may vary.
- **3MF**: Basic geometry support.
- **OFF / XYZ**: Not fully implemented (error shown if selected).
- **.blend / USD**: Not supported.

External textures for glTF work best when the model is a single `.glb` or when all files are in the same selection (limited relative-path handling for multi-file glTF).

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| Ctrl+O / Cmd+O | Import |
| F | Frame selected object |
| Esc | Cancel measure / close panels |

---

## Troubleshooting

- **Blank page / module errors**: You must use a local server (`python -m http.server`), not double-click `index.html`.
- **Cannot reach phone**: Check same Wi-Fi, correct IP, firewall allows port 8000.
- **Model invisible**: Try **Fit**, check hierarchy visibility icons, or switch shading to Solid.
- **Out of memory**: Use a smaller model or a simpler format (STL/GLB).

---

## License & credits

- Built with [Three.js](https://threejs.org/) r170 (CDN).
- MeshView Studio itself is provided as-is for personal and educational use.

Enjoy inspecting your meshes.


## Large scenes (bathrooms, archviz)

MeshView automatically enables **performance mode** for very large files or high triangle counts:
- Lower pixel ratio (sharper UI, faster orbit)
- Frozen transforms + frustum culling
- Truncated hierarchy for thousands of objects

**Tips for laggy orbit:**
1. Prefer a **compressed GLB** export from Blender (File → Export → glTF 2.0, Draco) instead of multi-file OBJ.
2. On phones, use **Solid** shading instead of Material.
3. Hide unused objects in the hierarchy.
4. Close other browser tabs to free GPU memory.

Hosting the viewer on **GitHub Pages / Netlify** makes the *app* faster to open (CDN + HTTPS). It does **not** make a 200 MB bathroom model load faster — the mesh still downloads fully into your browser and runs on your GPU.

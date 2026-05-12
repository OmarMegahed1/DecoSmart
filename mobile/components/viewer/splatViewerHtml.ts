export function buildSplatViewerHtml(spzUrl: string) {
  const safeUrl = JSON.stringify(spzUrl);

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      html, body, #app { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #F5EFE6; }
      #hud {
        position: fixed; top: 10px; left: 10px; z-index: 10;
        color: #3A2F2A; font: 12px system-ui, sans-serif;
        background: rgba(255,255,255,0.92); border: 1px solid rgba(107,112,92,0.22);
        border-radius: 999px; padding: 6px 10px; pointer-events: none;
      }
      #err {
        position: fixed; inset: 0; display: none; align-items: center;
        justify-content: center; color: #b91c1c; font: 13px system-ui, sans-serif;
        text-align: center; padding: 24px; background: rgba(245,239,230,0.96);
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <div id="hud">Loading…</div>
    <div id="err"></div>
    <script type="module">
      const hud = document.getElementById('hud');
      const err = document.getElementById('err');
      const app = document.getElementById('app');

      const emit = (type, payload = {}) => {
        const msg = JSON.stringify({ __splatViewer: true, type, payload, at: Date.now() });
        try { window.ReactNativeWebView?.postMessage(msg); } catch {}
        try { window.parent?.postMessage(msg, '*'); } catch {}
      };

      const spzUrl = ${safeUrl};

      try {
        emit('init-start', { spzUrl });

        const THREE = await import('https://esm.sh/three@0.167.0');
        emit('three-loaded');

        const { SplatMesh, SparkRenderer } = await import(
          'https://esm.sh/@sparkjsdev/spark@0.1.10?external=three'
        );
        emit('spark-loaded');

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf5efe6);

        const camera = new THREE.PerspectiveCamera(
          75, window.innerWidth / window.innerHeight, 0.01, 2000
        );
        camera.up.set(0, -1, 0);
        camera.position.set(0, 0, 0);
        camera.lookAt(0, 0, -1);
        camera.updateMatrix();
        camera.updateMatrixWorld(true);
        scene.add(camera);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setSize(window.innerWidth, window.innerHeight);
        app.appendChild(renderer.domElement);
        emit('renderer-ready', { width: window.innerWidth, height: window.innerHeight });

        const sparkRenderer = new SparkRenderer({ renderer });
        scene.add(sparkRenderer);
        emit('spark-renderer-added');

        scene.updateMatrixWorld(true);

        hud.textContent = 'Fetching splat…';
        let activeSplat;
        try {
          activeSplat = new SplatMesh({ url: spzUrl });
          emit('splat-ctor-url');
        } catch {
          activeSplat = new SplatMesh();
          emit('splat-load-start');
          await activeSplat.load(spzUrl);
          emit('splat-load-done');
        }

        sparkRenderer.add(activeSplat);
        emit('mesh-added');

        let dragging = false, px = 0, py = 0, yaw = 0, pitch = 0;
        const MAX_PITCH = Math.PI / 2 - 0.01;

        function updateCameraLook() {
          pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));
          camera.lookAt(
            Math.sin(yaw) * Math.cos(pitch),
            Math.sin(pitch),
            -Math.cos(yaw) * Math.cos(pitch)
          );
        }
        window.__splatNudge = (dx = 0, dy = 0) => {
          yaw += Number(dx) || 0;
          pitch += Number(dy) || 0;
          updateCameraLook();
        };
        window.__splatMove = (strafe = 0, forward = 0) => {
          const s = Number(strafe) || 0;
          const f = Number(forward) || 0;
          const forwardVec = new THREE.Vector3();
          camera.getWorldDirection(forwardVec);
          forwardVec.y = 0;
          if (forwardVec.lengthSq() > 0) forwardVec.normalize();

          const rightVec = new THREE.Vector3();
          rightVec.crossVectors(forwardVec, camera.up).normalize();

          camera.position.addScaledVector(forwardVec, f);
          camera.position.addScaledVector(rightVec, s);
        };
        updateCameraLook();

        renderer.domElement.addEventListener('mousedown', e => { dragging = true; px = e.clientX; py = e.clientY; });
        window.addEventListener('mouseup', () => { dragging = false; });
        window.addEventListener('mousemove', e => {
          if (!dragging) return;
          yaw -= (e.clientX - px) * 0.005; px = e.clientX;
          pitch -= (e.clientY - py) * 0.005; py = e.clientY;
          updateCameraLook();
        });

        let lastTouchX = 0, lastTouchY = 0;
        renderer.domElement.addEventListener('touchstart', e => {
          lastTouchX = e.touches[0].clientX;
          lastTouchY = e.touches[0].clientY;
        }, { passive: true });
        renderer.domElement.addEventListener('touchmove', e => {
          e.preventDefault();
          yaw -= (e.touches[0].clientX - lastTouchX) * 0.005;
          pitch -= (e.touches[0].clientY - lastTouchY) * 0.005;
          lastTouchX = e.touches[0].clientX;
          lastTouchY = e.touches[0].clientY;
          updateCameraLook();
        }, { passive: false });

        window.addEventListener('resize', () => {
          camera.aspect = window.innerWidth / window.innerHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(window.innerWidth, window.innerHeight);
        });

        let firstFrame = true;
        function animate() {
          requestAnimationFrame(animate);
          camera.updateMatrixWorld(false);
          sparkRenderer.update(camera);
          renderer.render(scene, camera);

          if (firstFrame) {
            firstFrame = false;
            hud.textContent = 'Drag to look around';
            emit('first-frame');
          }
        }
        animate();
      } catch (e) {
        err.style.display = 'flex';
        err.textContent = 'Unable to render 3D preview. ' + (e?.message || e);
        emit('render-error', { message: e?.message || String(e) });
        console.error(e);
      }
    </script>
  </body>
</html>`;
}

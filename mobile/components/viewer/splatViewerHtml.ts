export function buildSplatViewerHtml(spzUrl: string, opts?: { maxDpr?: number }) {
  const safeUrl = JSON.stringify(spzUrl);
  const maxDpr = opts?.maxDpr ?? 2.25;

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <style>
      html, body, #app { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #F5EFE6; }
      #err {
        position: fixed; inset: 0; display: none; align-items: center;
        justify-content: center; color: #b91c1c; font: 13px system-ui, sans-serif;
        text-align: center; padding: 24px; background: rgba(245,239,230,0.96);
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <div id="err"></div>
    <script type="module">
      const err = document.getElementById('err');
      const app = document.getElementById('app');

      const postError = (message) => {
        const payload = JSON.stringify({
          __splatViewer: true,
          type: 'render-error',
          payload: { message },
          at: Date.now(),
        });
        try { window.ReactNativeWebView?.postMessage(payload); } catch (_) {}
        try { window.parent?.postMessage(payload, '*'); } catch (_) {}
      };

      const spzUrl = ${safeUrl};
      const maxDpr = ${maxDpr};
      const getPixelRatio = () => Math.min(window.devicePixelRatio || 1, maxDpr);

      function applyRendererSize(renderer, camera) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const pr = getPixelRatio();
        renderer.setPixelRatio(pr);
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(h, 1);
        camera.updateProjectionMatrix();
      }

      try {
        const THREE = await import('https://esm.sh/three@0.167.0');
        const { SplatMesh, SparkRenderer } = await import(
          'https://esm.sh/@sparkjsdev/spark@0.1.10?external=three'
        );

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf5efe6);

        const camera = new THREE.PerspectiveCamera(
          75, window.innerWidth / Math.max(window.innerHeight, 1), 0.01, 2000
        );
        camera.up.set(0, -1, 0);
        camera.position.set(0, 0, 0);
        camera.lookAt(0, 0, -1);
        camera.updateMatrix();
        camera.updateMatrixWorld(true);
        scene.add(camera);

        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        });
        applyRendererSize(renderer, camera);
        app.appendChild(renderer.domElement);

        const sparkRenderer = new SparkRenderer({ renderer });
        scene.add(sparkRenderer);
        scene.updateMatrixWorld(true);

        let activeSplat;
        try {
          activeSplat = new SplatMesh({ url: spzUrl });
        } catch {
          activeSplat = new SplatMesh();
          await activeSplat.load(spzUrl);
        }
        sparkRenderer.add(activeSplat);

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

        /** Walk speed: moderate steps; movement does not change render resolution (fixed PR in resize). */
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
          applyRendererSize(renderer, camera);
        });

        function animate() {
          requestAnimationFrame(animate);
          camera.updateMatrixWorld(false);
          sparkRenderer.update(camera);
          renderer.render(scene, camera);
        }
        animate();
      } catch (e) {
        err.style.display = 'flex';
        err.textContent = 'Unable to render 3D preview. ' + (e?.message || e);
        postError(e?.message || String(e));
        console.error(e);
      }
    </script>
  </body>
</html>`;
}

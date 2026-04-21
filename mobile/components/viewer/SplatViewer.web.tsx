import { useEffect, useRef } from "react";

type Props = {
  spzUrl: string;
  onLog?: (msg: string) => void;
};

export default function SplatViewer({ spzUrl, onLog }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const onLogRef = useRef<Props["onLog"]>(onLog);
  const threeRef = useRef<any>(null);
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const cameraRef = useRef<any>(null);
  const updateLookRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onLogRef.current = onLog;
  }, [onLog]);

  useEffect(() => {
    if (!mountRef.current || !spzUrl) return;

    let disposed = false;
    let animFrameId = 0;
    const cleanupFns: Array<() => void> = [];

    (async () => {
      try {
        onLogRef.current?.("init-start");

        const THREE = await (new Function(
          'return import("https://esm.sh/three@0.167.0")'
        )() as Promise<any>);
        threeRef.current = THREE;
        onLogRef.current?.("three-loaded");

        // Shared THREE instance between app and Spark to avoid shader chunk mismatches.
        const sparkModule = await (new Function(
          'return import("https://esm.sh/@sparkjsdev/spark@0.1.10?deps=three@0.167.0")'
        )() as Promise<any>);
        const { SplatMesh, SparkRenderer } = sparkModule as any;
        onLogRef.current?.("spark-loaded");

        const mount = mountRef.current;
        if (!mount) return;

        const width = mount.clientWidth || 1;
        const height = mount.clientHeight || 1;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x020617);

        const camera = new THREE.PerspectiveCamera(75, width / height, 0.01, 2000);
  camera.up.set(0, -1, 0);
        camera.position.set(0, 0, 0);
        camera.lookAt(0, 0, -1);
        camera.updateMatrix();
        camera.updateMatrixWorld(true);
        scene.add(camera);
  cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setSize(width, height);
        mount.appendChild(renderer.domElement);
  onLogRef.current?.("renderer-ready");

        const sparkRenderer = new SparkRenderer({ renderer });
        scene.add(sparkRenderer);
        scene.updateMatrixWorld(true);
  onLogRef.current?.("spark-renderer-added");

        let activeSplat: any;
        try {
          activeSplat = new SplatMesh({ url: spzUrl });
          onLogRef.current?.("splat-ctor-url");
        } catch {
          activeSplat = new SplatMesh();
          onLogRef.current?.("splat-load-start");
          await activeSplat.load(spzUrl);
          onLogRef.current?.("splat-load-done");
        }

        sparkRenderer.add(activeSplat);
        onLogRef.current?.("mesh-added");

        let dragging = false;
        let px = 0;
        let py = 0;
        const maxPitch = Math.PI / 2 - 0.01;

        const updateLook = () => {
          pitchRef.current = Math.max(-maxPitch, Math.min(maxPitch, pitchRef.current));
          camera.lookAt(
            Math.sin(yawRef.current) * Math.cos(pitchRef.current),
            Math.sin(pitchRef.current),
            -Math.cos(yawRef.current) * Math.cos(pitchRef.current)
          );
        };
        updateLookRef.current = updateLook;
        updateLook();

        const onMouseDown = (e: MouseEvent) => {
          dragging = true;
          px = e.clientX;
          py = e.clientY;
        };
        const onMouseUp = () => {
          dragging = false;
        };
        const onMouseMove = (e: MouseEvent) => {
          if (!dragging) return;
          yawRef.current -= (e.clientX - px) * 0.005;
          pitchRef.current -= (e.clientY - py) * 0.005;
          px = e.clientX;
          py = e.clientY;
          updateLook();
        };

        renderer.domElement.addEventListener("mousedown", onMouseDown);
        window.addEventListener("mouseup", onMouseUp);
        window.addEventListener("mousemove", onMouseMove);

        cleanupFns.push(() => renderer.domElement.removeEventListener("mousedown", onMouseDown));
        cleanupFns.push(() => window.removeEventListener("mouseup", onMouseUp));
        cleanupFns.push(() => window.removeEventListener("mousemove", onMouseMove));

        let tx = 0;
        let ty = 0;
        const onTouchStart = (e: TouchEvent) => {
          tx = e.touches[0].clientX;
          ty = e.touches[0].clientY;
        };
        const onTouchMove = (e: TouchEvent) => {
          e.preventDefault();
          yawRef.current -= (e.touches[0].clientX - tx) * 0.005;
          pitchRef.current -= (e.touches[0].clientY - ty) * 0.005;
          tx = e.touches[0].clientX;
          ty = e.touches[0].clientY;
          updateLook();
        };

        renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: true });
        renderer.domElement.addEventListener("touchmove", onTouchMove, { passive: false });

        cleanupFns.push(() => renderer.domElement.removeEventListener("touchstart", onTouchStart));
        cleanupFns.push(() => renderer.domElement.removeEventListener("touchmove", onTouchMove));

        const onResize = () => {
          const nW = mount.clientWidth || 1;
          const nH = mount.clientHeight || 1;
          camera.aspect = nW / nH;
          camera.updateProjectionMatrix();
          renderer.setSize(nW, nH);
        };

        window.addEventListener("resize", onResize);
        cleanupFns.push(() => window.removeEventListener("resize", onResize));

        let firstFrame = true;
        const loop = () => {
          if (disposed) return;
          animFrameId = requestAnimationFrame(loop);
          camera.updateMatrixWorld(false);
          sparkRenderer.update(camera);
          renderer.render(scene, camera);
          if (firstFrame) {
            firstFrame = false;
            onLogRef.current?.("first-frame");
          }
        };
        loop();

        cleanupFns.push(() => {
          cancelAnimationFrame(animFrameId);
          renderer.dispose();
          if (mount.contains(renderer.domElement)) {
            mount.removeChild(renderer.domElement);
          }
        });
      } catch (e: any) {
        onLogRef.current?.(`render-error: ${e?.message || e}`);
      }
    })();

    return () => {
      disposed = true;
      threeRef.current = null;
      cameraRef.current = null;
      updateLookRef.current = null;
      cancelAnimationFrame(animFrameId);
      for (const fn of cleanupFns) {
        try {
          fn();
        } catch {
          // ignore cleanup errors
        }
      }
    };
  }, [spzUrl]);

  const moveCamera = (strafe: number, forward: number) => {
    const camera = cameraRef.current;
    const THREE = threeRef.current;
    if (!camera || !THREE) return;

    const forwardVec = new THREE.Vector3();
    camera.getWorldDirection(forwardVec);
    forwardVec.y = 0;
    if (forwardVec.lengthSq() > 0) forwardVec.normalize();

    const rightVec = new THREE.Vector3();
    rightVec.crossVectors(forwardVec, camera.up).normalize();

    camera.position.addScaledVector(forwardVec, forward);
    camera.position.addScaledVector(rightVec, strafe);
  };

  return (
    <div style={{ width: "100%", height: "100%", background: "#020617", position: "relative" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
      <div
        style={{
          position: "absolute",
          right: 12,
          bottom: 12,
          display: "grid",
          gridTemplateColumns: "40px 40px 40px",
          gridTemplateRows: "40px 40px 40px",
          gap: 6,
          userSelect: "none",
          touchAction: "manipulation",
        }}
      >
        <div />
  <button onClick={() => moveCamera(0, 0.22)}>▲</button>
        <div />
  <button onClick={() => moveCamera(-0.22, 0)}>◀</button>
        <div />
  <button onClick={() => moveCamera(0.22, 0)}>▶</button>
        <div />
  <button onClick={() => moveCamera(0, -0.22)}>▼</button>
        <div />
      </div>
    </div>
  );
}

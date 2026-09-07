import { useEffect, useRef, useState } from "react";
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PMREMGenerator,
  PCFShadowMap,
  Raycaster,
  Scene,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type WebGLRenderTarget,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { GamepadSceneStatus } from "./GamepadArtwork";
import {
  buttonAmount,
  controlPose,
  controlButtonIndices,
  dpadButtonAtPoint,
  readControlMetadata,
  type ControlMetadata,
  createDemandLoop,
  type ControllerInput,
} from "./articulation";
import { applyPose, bindArticulation } from "./applyPose";
function disposeModel(root: Object3D) {
  const geometries = new Set<Mesh["geometry"]>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((node) => {
    if (!(node instanceof Mesh)) {
      return;
    }
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof Texture) {
          textures.add(value);
        }
      }
    }
  });
  for (const texture of textures) {
    if (typeof ImageBitmap !== "undefined" && texture.image instanceof ImageBitmap) {
      texture.image.close();
    }
    texture.dispose();
  }
  for (const material of materials) {
    material.dispose();
  }
  for (const geometry of geometries) {
    geometry.dispose();
  }
}

export default function GamepadScene({
  assetUrl,
  ...input
}: ControllerInput & { assetUrl: string; onButtonSelect?: (index: number) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef(input);
  const invalidateRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    inputRef.current = input;
    invalidateRef.current?.();
  }, [
    input.buttonStates,
    input.buttonValues,
    input.axisValues,
    input.highlightedButton,
    input.onButtonSelect,
  ]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    let disposed = false;
    let root: Object3D | undefined;
    let renderer: WebGLRenderer | undefined;
    let environmentTarget: WebGLRenderTarget | undefined;
    let shadowLight: DirectionalLight | undefined;
    let observer: ResizeObserver | undefined;
    const detachedMaterials = new Set<Material>();
    let cleanup = () => {};
    const teardown = () => {
      disposed = true;
      invalidateRef.current = null;
      observer?.disconnect();
      cleanup();
      if (root) {
        disposeModel(root);
        root = undefined;
      }
      for (const material of detachedMaterials) {
        material.dispose();
      }
      detachedMaterials.clear();
      environmentTarget?.dispose();
      environmentTarget = undefined;
      shadowLight?.dispose();
      shadowLight = undefined;
      renderer?.dispose();
      if (renderer && !renderer.getContext().isContextLost()) {
        renderer.forceContextLoss();
      }
      renderer?.domElement.remove();
      renderer = undefined;
    };
    setStatus("loading");
    try {
      renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
      const webgl = renderer;
      webgl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      webgl.setClearColor(0, 0);
      webgl.toneMapping = ACESFilmicToneMapping;
      webgl.toneMappingExposure = 0.85;
      webgl.shadowMap.enabled = true;
      webgl.shadowMap.type = PCFShadowMap;
      webgl.domElement.style.width = "100%";
      webgl.domElement.style.height = "100%";
      webgl.domElement.setAttribute("aria-hidden", "true");
      host.append(webgl.domElement);
      webgl.domElement.dataset.drawCount = "0";
      const scene = new Scene();
      const camera = new OrthographicCamera(-1.5, 1.5, 1, -1, 0.1, 20);
      camera.position.set(0, 1.6, 5.3);
      camera.lookAt(0, 0, 0);
      scene.add(new AmbientLight(0xff_ff_ff, 0.18));
      const key = new DirectionalLight(0xff_ff_ff, 1.4);
      key.position.set(-3, 4, 6);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.bias = -0.0001;
      key.shadow.normalBias = 0.0025;
      key.shadow.radius = 2;
      shadowLight = key;
      scene.add(key);
      const rim = new DirectionalLight(0xd4_e1_ff, 0.65);
      rim.position.set(3, -1, 2);
      scene.add(rim);
      const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
      const controls = new Map<
        Object3D,
        {
          binding: ReturnType<typeof bindArticulation>;
          metadata: ControlMetadata;
          rockerChild: boolean;
        }
      >();
      const findControl = (start: Object3D | null) => {
        let node = start;
        while (node && !controls.has(node)) {
          node = node.parent;
        }
        return node ? controls.get(node) : undefined;
      };
      const highlights: Array<{
        material: MeshStandardMaterial;
        indices: Array<number>;
        axes?: [number, number];
        color: number;
        intensity: number;
      }> = [];
      let previousTime = 0;
      let size = new Vector3(2.5, 1.7, 0.7);
      let lastWidth = 0;
      let lastHeight = 0;
      const resize = (force = false) => {
        const width = host.clientWidth;
        const height = host.clientHeight;
        if (!width || !height || (!force && width === lastWidth && height === lastHeight)) {
          return false;
        }
        lastWidth = width;
        lastHeight = height;
        webgl.setSize(width, height, false);
        const aspect = width / height;
        camera.updateMatrixWorld();
        const corners = [-1, 1].flatMap((x) =>
          [-1, 1].flatMap((y) =>
            [-1, 1].map((z) =>
              new Vector3((x * size.x) / 2, (y * size.y) / 2, (z * size.z) / 2).applyMatrix4(
                camera.matrixWorldInverse,
              ),
            ),
          ),
        );
        const projected = new Box3().setFromPoints(corners).getSize(new Vector3());
        const halfHeight = Math.max(projected.y / 2, projected.x / (2 * aspect)) * 1.06;
        camera.left = -halfHeight * aspect;
        camera.right = halfHeight * aspect;
        camera.top = halfHeight;
        camera.bottom = -halfHeight;
        camera.updateProjectionMatrix();
        return true;
      };
      const loop = createDemandLoop((time) => {
        if (!root || !host.clientWidth || !host.clientHeight) {
          return false;
        }
        if (!environmentTarget) {
          // Generate studio reflections once, in the first requested frame.
          const room = new RoomEnvironment();
          const pmrem = new PMREMGenerator(webgl);
          try {
            environmentTarget = pmrem.fromScene(room, 0.04, 0.1, 100, { size: 128 });
            scene.environment = environmentTarget.texture;
            scene.environmentIntensity = 0.55;
          } catch {
            setStatus("error");
            teardown();
            return false;
          } finally {
            room.dispose();
            pmrem.dispose();
          }
        }
        const elapsed = previousTime ? time - previousTime : 16;
        previousTime = time;
        let moving = false;
        for (const control of controls.values()) {
          const target = controlPose(control.metadata, inputRef.current, control.rockerChild);
          if (applyPose(control.binding, target, elapsed, motion.matches)) {
            moving = true;
          }
        }
        for (const highlight of highlights) {
          const selected = highlight.indices.includes(inputRef.current.highlightedButton ?? -1);
          const pressed =
            highlight.indices.some((index) => buttonAmount(inputRef.current, index) > 0.03) ||
            highlight.axes?.some(
              (axis) => Math.abs(inputRef.current.axisValues?.[axis] ?? 0) > 0.03,
            );
          highlight.material.emissive.setHex(
            selected ? 0x59_d6_a1 : pressed ? 0xe8_a5_5d : highlight.color,
          );
          highlight.material.emissiveIntensity = selected || pressed ? 0.65 : highlight.intensity;
        }
        webgl.render(scene, camera);
        webgl.domElement.dataset.settled = String(!moving);
        webgl.domElement.dataset.drawCount = String(Number(webgl.domElement.dataset.drawCount) + 1);
        return moving;
      });
      invalidateRef.current = loop.invalidate;
      observer = new ResizeObserver(() => {
        if (resize()) {
          loop.invalidate();
        }
      });
      observer.observe(host);
      const onMotionChange = () => loop.invalidate();
      motion.addEventListener("change", onMotionChange);
      const onContextLost = (event: Event) => {
        event.preventDefault();
        setStatus("error");
        teardown();
      };
      webgl.domElement.addEventListener("webglcontextlost", onContextLost);
      const onClick = (event: MouseEvent) => {
        if (!root || !inputRef.current.onButtonSelect) {
          return;
        }
        const rect = webgl.domElement.getBoundingClientRect();
        const ray = new Raycaster();
        ray.setFromCamera(
          new Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            (-(event.clientY - rect.top) / rect.height) * 2 + 1,
          ),
          camera,
        );
        const hit = ray.intersectObject(root, true)[0];
        const control = findControl(hit?.object ?? null);
        if (!hit || !control) {
          return;
        }
        if (control.metadata.role === "dpad") {
          const point = control.binding.node.worldToLocal(hit.point.clone());
          inputRef.current.onButtonSelect(dpadButtonAtPoint(point.x, point.y));
        } else if (control.metadata.buttonIndex !== undefined) {
          inputRef.current.onButtonSelect(control.metadata.buttonIndex);
        }
      };
      webgl.domElement.addEventListener("click", onClick);
      cleanup = () => {
        webgl.domElement.removeEventListener("click", onClick);
        loop.dispose();
        motion.removeEventListener("change", onMotionChange);
        webgl.domElement.removeEventListener("webglcontextlost", onContextLost);
      };
      new GLTFLoader()
        .loadAsync(assetUrl)
        .then((gltf) => {
          if (disposed) {
            disposeModel(gltf.scene);
            return;
          }
          root = gltf.scene;
          const bounds = new Box3().setFromObject(root);
          size = bounds.getSize(new Vector3());
          root.position.sub(bounds.getCenter(new Vector3()));
          root.traverse((node) => {
            const metadata = readControlMetadata(node.userData);
            if (metadata) {
              const parentControl = findControl(node.parent);
              const rockerChild =
                parentControl?.metadata.role === "dpad" &&
                (metadata.dpadDirection !== undefined ||
                  (metadata.buttonIndex !== undefined &&
                    controlButtonIndices(parentControl.metadata).includes(metadata.buttonIndex)));
              controls.set(node, { binding: bindArticulation(node), metadata, rockerChild });
            }
            if (!(node instanceof Mesh)) {
              return;
            }
            node.castShadow = true;
            node.receiveShadow = true;
            const control = findControl(node);
            if (!control) {
              return;
            }
            // A selected control gets its own material so shared shell materials never light up.
            const originals = Array.isArray(node.material) ? node.material : [node.material];
            const replacements = originals.map((material) => {
              detachedMaterials.add(material);
              const copy = material.clone();
              if (copy instanceof MeshStandardMaterial) {
                highlights.push({
                  material: copy,
                  indices: controlButtonIndices(control.metadata),
                  axes: control.metadata.axisIndices,
                  color: copy.emissive.getHex(),
                  intensity: copy.emissiveIntensity,
                });
              }
              return copy;
            });
            node.material = Array.isArray(node.material) ? replacements : replacements[0];
          });
          if (!controls.size) {
            throw new Error("Controller asset has no interactive control metadata");
          }
          scene.add(root);
          // Fit the single shadow map to this asset, rather than a large world.
          const shadowRadius = size.length() * 0.55;
          const shadowCamera = key.shadow.camera;
          shadowCamera.left = -shadowRadius;
          shadowCamera.right = shadowRadius;
          shadowCamera.top = shadowRadius;
          shadowCamera.bottom = -shadowRadius;
          shadowCamera.near = Math.max(0.1, key.position.length() - shadowRadius);
          shadowCamera.far = key.position.length() + shadowRadius;
          shadowCamera.updateProjectionMatrix();
          resize(true);
          setStatus("ready");
          loop.invalidate();
        })
        .catch(() => {
          if (!disposed) {
            setStatus("error");
            teardown();
          }
        });
    } catch {
      setStatus("error");
      teardown();
    }
    return teardown;
  }, [assetUrl]);

  return (
    <div data-scene-status={status} style={{ width: "100%", height: "100%", position: "relative" }}>
      <div
        ref={hostRef}
        style={{
          position: "absolute",
          inset: 0,
          visibility: status === "ready" ? "visible" : "hidden",
        }}
      />
      {status !== "ready" && <GamepadSceneStatus error={status === "error"} />}
    </div>
  );
}

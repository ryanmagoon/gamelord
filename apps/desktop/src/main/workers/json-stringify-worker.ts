/**
 * Worker thread for offloading JSON.stringify from the main thread.
 *
 * Large libraries (1000+ games) can take 10-50ms+ to serialize, which blocks
 * the main process event loop and starves frame/audio IPC during gameplay.
 * Running serialization in a worker thread keeps the event loop free.
 */
import { parentPort } from "node:worker_threads";

if (parentPort) {
  parentPort.on("message", (data: unknown) => {
    const content = JSON.stringify(data, null, 2);
    parentPort?.postMessage(content);
  });
}

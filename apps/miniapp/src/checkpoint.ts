export interface CheckpointCoordinator {
  checkpoint(): Promise<void>;
  register(handler: () => Promise<void>): () => void;
}

export function createCheckpointCoordinator(): CheckpointCoordinator {
  let currentHandler: (() => Promise<void>) | null = null;

  return {
    async checkpoint() {
      await currentHandler?.();
    },
    register(handler) {
      currentHandler = handler;
      return () => {
        if (currentHandler === handler) {
          currentHandler = null;
        }
      };
    },
  };
}

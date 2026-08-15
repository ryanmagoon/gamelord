interface LifecycleContext {
  readonly hidden?: boolean;
}

let phase = "created";

export const prepare = async (): Promise<void> => {
  phase = "prepared";
};

export const activate = async (): Promise<void> => {
  phase = "active";
};

export const mount = async (context: LifecycleContext = {}): Promise<void> => {
  phase = context.hidden ? "paused" : "mounted";
};

export const unmount = async (): Promise<void> => {
  phase = "unmounted";
};

export const deactivate = async (): Promise<void> => {
  phase = "deactivated";
};

export const prePause = async (): Promise<void> => undefined;

export const pause = async (): Promise<void> => {
  phase = "paused";
};

export const preResume = async (): Promise<void> => undefined;

export const resume = async (): Promise<void> => {
  phase = "active";
};

export const uninstall = async (): Promise<void> => {
  phase = "uninstalled";
};

export const getLifecyclePhase = (): string => phase;

export const applicationLifecyclePlugin = {
  name: "gamelord-miniapp-lifecycle",
  prePause,
  pause,
  preResume,
  resume,
};

export default applicationLifecyclePlugin;

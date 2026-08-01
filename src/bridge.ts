/**
 * Talks to the Rust shell.
 *
 * wry's IPC is one-way (page → host), so request/response is built here: each
 * call gets an id, the promise is parked in a map, and Rust resolves it by
 * evaluating `window.__bridge.resolve(id, ok, payload)`. Events arrive the
 * same way through `window.__bridge.emit`.
 *
 * The exported shapes deliberately mirror the Tauri APIs this replaced, so
 * the call sites in main.ts and files.ts did not have to change.
 */

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

declare global {
  interface Window {
    ipc: { postMessage: (message: string) => void };
    __bridge: {
      resolve: (id: number, ok: boolean, payload: unknown) => void;
      emit: (event: string, payload: unknown) => void;
    };
  }
}

let nextId = 1;
const pending = new Map<number, Pending>();
const listeners = new Map<string, Array<(payload: unknown) => void>>();

window.__bridge = {
  resolve(id, ok, payload) {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (ok) entry.resolve(payload);
    else entry.reject(new Error(String(payload)));
  },

  emit(event, payload) {
    for (const handler of listeners.get(event) ?? []) handler(payload);
  },
};

export function invoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    window.ipc.postMessage(JSON.stringify({ id, cmd, args }));
  });
}

export function listen<T>(event: string, handler: (payload: T) => void): void {
  const handlers = listeners.get(event) ?? [];
  handlers.push(handler as (payload: unknown) => void);
  listeners.set(event, handlers);
}

// --- Window ---------------------------------------------------------------

export const setTitle = (title: string) => invoke<void>("set_title", { title });

export const closeWindow = () => invoke<void>("close_window");

// --- Dialogs --------------------------------------------------------------
//
// Backed by rfd in Rust, which uses each platform's native panels.

export const openDialog = (options: { title?: string; extensions?: string[] } = {}) =>
  invoke<string | null>("dialog_open", { ...options });

export const saveDialog = (options: { title?: string; defaultPath?: string } = {}) =>
  invoke<string | null>("dialog_save", { ...options });

export const messageDialog = (
  message: string,
  options: { title?: string; kind?: "info" | "warning" | "error" } = {},
) => invoke<void>("dialog_message", { message, ...options });

export const confirmDialog = (
  message: string,
  options: { title?: string; kind?: "info" | "warning" | "error" } = {},
) => invoke<boolean>("dialog_confirm", { message, ...options });

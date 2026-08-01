import { invoke } from "./bridge";

export const readFile = (path: string) => invoke<string>("read_file", { path });

export const writeFile = (path: string, contents: string) =>
  invoke<void>("write_file", { path, contents });

export const readImageDataUri = (path: string) =>
  invoke<string>("read_image_data_uri", { path });

export const readDraft = () => invoke<string | null>("read_draft");

export const writeDraft = (contents: string) =>
  invoke<void>("write_draft", { contents });

export const clearDraft = () => invoke<void>("clear_draft");

/** Path the OS asked us to open, or null. Returns it only once. */
export const takePendingFile = () => invoke<string | null>("take_pending_file");

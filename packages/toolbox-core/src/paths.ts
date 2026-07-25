import os from "node:os";
import path from "node:path";

export const IMAGEGEN_HOME =
  process.env.IMAGEGEN_HOME ?? path.join(os.homedir(), ".imagegen");

export const CONFIG_PATH = path.join(IMAGEGEN_HOME, "config.json");
export const IMAGES_DIR = path.join(IMAGEGEN_HOME, "images");
export const LOGS_DIR = path.join(IMAGEGEN_HOME, "logs");
export const DB_PATH = path.join(IMAGEGEN_HOME, "studio.db");

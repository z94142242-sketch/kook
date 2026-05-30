import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { config, type ProjectConfig } from "../config.js";

const projectSchema = z.object({
  cwd: z.string().min(1),
  sandbox: z.literal("workspace-write"),
  templates: z.record(z.string().min(1), z.string().min(1)).optional()
});

const projectsSchema = z.record(z.string().min(1), projectSchema);

let projectsCache: Record<string, ProjectConfig> | undefined;

export async function loadProjects() {
  const raw = await fs.readFile(config.projectsPath, "utf8");
  const parsed = projectsSchema.parse(JSON.parse(raw));
  const normalized: Record<string, ProjectConfig> = {};

  for (const [projectKey, project] of Object.entries(parsed)) {
    normalized[projectKey] = {
      cwd: path.resolve(project.cwd),
      sandbox: project.sandbox,
      templates: project.templates
    };
  }

  projectsCache = normalized;
  return normalized;
}

export function getProjects() {
  if (!projectsCache) throw new Error("Projects are not loaded");
  return projectsCache;
}

export function getProject(projectKey: string) {
  return getProjects()[projectKey];
}

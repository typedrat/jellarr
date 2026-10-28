import {
  type SystemConfig,
  type TrickplayOptionsConfig,
  type PluginRepositoryConfig,
} from "../types/config/system";
import {
  type ServerConfigurationSchema,
  type TrickplayOptionsSchema,
  type PluginRepositorySchema,
} from "../types/schema/system";

export function toPluginRepositorySchemas(
  inRepos: PluginRepositoryConfig[],
): PluginRepositorySchema[] {
  return inRepos.map(
    (r: PluginRepositoryConfig): PluginRepositorySchema => ({
      Name: r.name,
      Url: r.url,
      Enabled: r.enabled,
    }),
  );
}

export function toTrickplayOptionsSchema(
  cfg: TrickplayOptionsConfig,
): TrickplayOptionsSchema {
  const out: TrickplayOptionsSchema = {};
  if (cfg.enableHwAcceleration !== undefined) {
    out.EnableHwAcceleration = cfg.enableHwAcceleration;
  }
  if (cfg.enableHwEncoding !== undefined) {
    out.EnableHwEncoding = cfg.enableHwEncoding;
  }
  if (cfg.processThreads !== undefined) {
    out.ProcessThreads = cfg.processThreads;
  }
  return out;
}

export function mapSystemConfigurationConfigToSchema(
  desired: SystemConfig,
): Partial<ServerConfigurationSchema> {
  const out: Partial<ServerConfigurationSchema> = {};

  if (desired.serverName !== undefined) {
    out.ServerName = desired.serverName;
  }

  if (desired.enableMetrics !== undefined) {
    out.EnableMetrics = desired.enableMetrics;
  }

  if (desired.pluginRepositories !== undefined) {
    out.PluginRepositories = toPluginRepositorySchemas(
      desired.pluginRepositories,
    );
  }

  if (desired.trickplayOptions !== undefined) {
    out.TrickplayOptions = toTrickplayOptionsSchema(desired.trickplayOptions);
  }

  return out;
}

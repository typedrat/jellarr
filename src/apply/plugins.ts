import { logger } from "../lib/logger";
import type { JellyfinClient } from "../api/jellyfin.types";
import type {
  PluginConfig,
  PluginConfigList,
  PluginConfigurationConfig,
} from "../types/config/plugins";
import type {
  PluginInfoSchema,
  PackageInfoSchema,
  VersionInfoSchema,
  BasePluginConfigurationSchema,
  PluginConfigurationSchema,
} from "../types/schema/plugins";
import { ChangeSetBuilder } from "../lib/changeset";
import { applyChangeset, diff, type IChange } from "json-diff-ts";

function isPluginConfigurationMissingError(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "response" in error) {
    const responseStatus: number | undefined = (
      error as {
        response?: { status?: number };
      }
    ).response?.status;
    if (responseStatus === 404) return true;
  }

  return error instanceof Error && /failed:\s*404$/.test(error.message);
}

export interface PluginInstall {
  name: string;
  guid: string;
  version: string;
  repositoryUrl?: string;
  installedVersion?: string;
}

function normalizeGuid(guid: string): string {
  return guid.replace(/-/g, "").toLowerCase();
}

/**
 * Compares dotted numeric versions, treating missing components as zero so
 * that a manifest's "5.1.1" and an installed assembly's "5.1.1.0" are equal.
 */
export function compareVersions(a: string, b: string): number {
  const left: number[] = a.split(".").map(Number);
  const right: number[] = b.split(".").map(Number);
  const length: number = Math.max(left.length, right.length);
  for (let i: number = 0; i < length; i++) {
    const difference: number = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

/**
 * Jellyfin only loads a plugin whose target ABI is no newer than the server,
 * so versions built for a later server are never candidates.
 */
function isCompatible(
  version: VersionInfoSchema,
  serverVersion: string,
): boolean {
  return (
    !version.targetAbi || compareVersions(version.targetAbi, serverVersion) <= 0
  );
}

function findPackage(
  catalog: PackageInfoSchema[],
  desired: PluginConfig,
): PackageInfoSchema | undefined {
  return catalog.find((pkg: PackageInfoSchema) => pkg.name === desired.name);
}

/**
 * Finds the installed copies of a desired plugin. Jellyfin reports a plugin
 * under its assembly name, which often differs from its catalog name (the
 * catalog's "SSO Authentication" installs as "SSO-Auth"), so the catalog GUID
 * is matched first and the name only when the plugin isn't in any repository.
 */
function findInstalled(
  installed: PluginInfoSchema[],
  pkg: PackageInfoSchema | undefined,
  desired: PluginConfig,
): PluginInfoSchema[] {
  const guid: string | undefined = pkg?.guid;
  if (guid) {
    return installed.filter(
      (plugin: PluginInfoSchema) =>
        plugin.Id !== undefined &&
        normalizeGuid(plugin.Id) === normalizeGuid(guid),
    );
  }
  return installed.filter(
    (plugin: PluginInfoSchema) => plugin.Name === desired.name,
  );
}

function newestVersion(plugins: PluginInfoSchema[]): string | undefined {
  return plugins
    .map((plugin: PluginInfoSchema) => plugin.Version)
    .filter((version: string | undefined): version is string => !!version)
    .sort(compareVersions)
    .at(-1);
}

function chooseVersion(
  pkg: PackageInfoSchema,
  desired: PluginConfig,
  serverVersion: string,
): VersionInfoSchema | undefined {
  const versions: VersionInfoSchema[] = (pkg.versions ?? []).filter(
    (version: VersionInfoSchema) => isCompatible(version, serverVersion),
  );

  if (desired.version) {
    const pinned: string = desired.version;
    const match: VersionInfoSchema | undefined = versions.find(
      (version: VersionInfoSchema) =>
        version.version !== undefined &&
        compareVersions(version.version, pinned) === 0,
    );
    if (!match) {
      throw new Error(
        `Plugin "${desired.name}" has no version ${pinned} compatible with Jellyfin ${serverVersion}`,
      );
    }
    return match;
  }

  return versions
    .filter((version: VersionInfoSchema) => version.version !== undefined)
    .sort((a: VersionInfoSchema, b: VersionInfoSchema) =>
      compareVersions(a.version as string, b.version as string),
    )
    .at(-1);
}

/**
 * Works out which plugins to install or upgrade: missing plugins, and plugins
 * whose repositories offer a newer compatible version. A pinned version is
 * installed exactly and holds the plugin there.
 */
export function calculatePluginInstalls(
  installed: PluginInfoSchema[],
  catalog: PackageInfoSchema[],
  desired: PluginConfigList,
  serverVersion: string,
): PluginInstall[] | undefined {
  const installs: PluginInstall[] = [];

  for (const plugin of desired) {
    const pkg: PackageInfoSchema | undefined = findPackage(catalog, plugin);
    const installedVersion: string | undefined = newestVersion(
      findInstalled(installed, pkg, plugin),
    );

    if (!pkg?.guid) {
      if (installedVersion) {
        logger.warn(
          `Plugin "${plugin.name}" is not in any configured repository; leaving ${installedVersion} as is`,
        );
        continue;
      }
      throw new Error(
        `Plugin "${plugin.name}" is not in any configured repository`,
      );
    }

    const target: VersionInfoSchema | undefined = chooseVersion(
      pkg,
      plugin,
      serverVersion,
    );
    if (!target?.version) {
      if (installedVersion) {
        logger.warn(
          `Plugin "${plugin.name}" has no version compatible with Jellyfin ${serverVersion}; leaving ${installedVersion} as is`,
        );
        continue;
      }
      throw new Error(
        `Plugin "${plugin.name}" has no version compatible with Jellyfin ${serverVersion}`,
      );
    }

    if (installedVersion !== undefined) {
      const comparison: number = compareVersions(
        target.version,
        installedVersion,
      );
      if (comparison === 0) continue;
      if (comparison < 0) {
        if (plugin.version) {
          logger.warn(
            `Plugin "${plugin.name}" is pinned to ${plugin.version} but ${installedVersion} is installed; uninstall it to downgrade`,
          );
        }
        continue;
      }
    }

    logger.info(
      installedVersion
        ? `Upgrading plugin ${plugin.name}: ${installedVersion} -> ${target.version}`
        : `Installing plugin: ${plugin.name} ${target.version}`,
    );
    installs.push({
      name: plugin.name,
      guid: pkg.guid,
      version: target.version,
      ...(target.repositoryUrl ? { repositoryUrl: target.repositoryUrl } : {}),
      ...(installedVersion ? { installedVersion } : {}),
    });
  }

  return installs.length > 0 ? installs : undefined;
}

export async function installPlugins(
  client: JellyfinClient,
  installs: PluginInstall[] | undefined,
): Promise<void> {
  if (!installs) return;

  for (const install of installs) {
    await client.installPackage(install.name, {
      assemblyGuid: install.guid,
      version: install.version,
      ...(install.repositoryUrl
        ? { repositoryUrl: install.repositoryUrl }
        : {}),
    });
  }
}

export interface PluginRemoval {
  name: string;
  id: string;
  version: string;
}

/**
 * Finds old copies of desired plugins left behind by an upgrade. Jellyfin
 * marks them superseded but still loads their assemblies, so an old copy's
 * API controllers clash with the new one's. Copies are only removed once a
 * newer copy is active, so a pending upgrade never loses the running version.
 */
export function calculatePluginRemovals(
  installed: PluginInfoSchema[],
  catalog: PackageInfoSchema[],
  desired: PluginConfigList,
): PluginRemoval[] | undefined {
  const removals: PluginRemoval[] = [];

  for (const plugin of desired) {
    const copies: PluginInfoSchema[] = findInstalled(
      installed,
      findPackage(catalog, plugin),
      plugin,
    );
    const newestActive: string | undefined = newestVersion(
      copies.filter((copy: PluginInfoSchema) => copy.Status === "Active"),
    );
    if (!newestActive) continue;

    for (const copy of copies) {
      if (!copy.Id || !copy.Version) continue;
      if (compareVersions(copy.Version, newestActive) === 0) continue;
      const superseded: boolean =
        copy.Status === "Superseded" || copy.Status === "Superceded";
      const older: boolean =
        copy.Status !== "Deleted" &&
        compareVersions(copy.Version, newestActive) < 0;
      if (!superseded && !older) continue;
      if (
        removals.some(
          (removal: PluginRemoval) =>
            removal.id === copy.Id && removal.version === copy.Version,
        )
      ) {
        continue;
      }

      logger.info(
        `Removing plugin ${plugin.name} ${copy.Version}, superseded by ${newestActive}`,
      );
      removals.push({ name: plugin.name, id: copy.Id, version: copy.Version });
    }
  }

  return removals.length > 0 ? removals : undefined;
}

export async function removePlugins(
  client: JellyfinClient,
  removals: PluginRemoval[] | undefined,
): Promise<void> {
  if (!removals) return;

  for (const removal of removals) {
    await client.uninstallPlugin(removal.id, removal.version);
  }
}

/**
 * Renames desired plugins to the names Jellyfin reports for their installed
 * copies, so their configuration can be matched against installed plugins.
 */
export function resolveInstalledPluginNames(
  installed: PluginInfoSchema[],
  catalog: PackageInfoSchema[],
  desired: PluginConfigList,
): PluginConfigList {
  return desired.map((plugin: PluginConfig) => {
    const name: string | undefined = findInstalled(
      installed,
      findPackage(catalog, plugin),
      plugin,
    )[0]?.Name;
    return name ? { ...plugin, name } : plugin;
  });
}

export async function getPluginConfigurationSchemaByName(
  client: JellyfinClient,
  current: PluginInfoSchema[],
): Promise<Map<string, PluginConfigurationSchema>> {
  const pluginConfigurationSchemaByName: Map<
    string,
    PluginConfigurationSchema
  > = new Map();

  for (const pluginInfo of current) {
    if (pluginInfo.Id && pluginInfo.Name) {
      try {
        pluginConfigurationSchemaByName.set(pluginInfo.Name, {
          id: pluginInfo.Id,
          configuration: await client.getPluginConfiguration(pluginInfo.Id),
        });
      } catch (error) {
        if (isPluginConfigurationMissingError(error)) continue;
        throw error;
      }
    }
  }

  return pluginConfigurationSchemaByName;
}

export function calculatePluginConfigurationDiff(
  current: BasePluginConfigurationSchema,
  desired: PluginConfigurationConfig,
): BasePluginConfigurationSchema | undefined {
  const patch: IChange[] = new ChangeSetBuilder(
    diff(current, desired as BasePluginConfigurationSchema),
  )
    .atomize()
    .withoutRemoves()
    .unatomize()
    .toArray();

  if (patch.length > 0) {
    return applyChangeset(current, patch) as BasePluginConfigurationSchema;
  }

  return undefined;
}

export function calculatePluginConfigurationsDiff(
  currentPluginConfigurationsByName: Map<string, PluginConfigurationSchema>,
  desired: PluginConfigList,
): Map<string, BasePluginConfigurationSchema> | undefined {
  if (desired.length === 0) return undefined;

  const pluginConfigurationsToUpdate: Map<
    string,
    BasePluginConfigurationSchema
  > = new Map();

  desired.forEach((desiredPluginConfiguration: PluginConfig) => {
    if (desiredPluginConfiguration.configuration) {
      const currentPluginConfiguration: PluginConfigurationSchema | undefined =
        currentPluginConfigurationsByName.get(desiredPluginConfiguration.name);

      if (currentPluginConfiguration) {
        const configurationDiff: BasePluginConfigurationSchema | undefined =
          calculatePluginConfigurationDiff(
            currentPluginConfiguration.configuration,
            desiredPluginConfiguration.configuration,
          );

        if (configurationDiff) {
          logger.info(
            `Updating plugin configuration: ${desiredPluginConfiguration.name}`,
          );
          pluginConfigurationsToUpdate.set(
            currentPluginConfiguration.id,
            configurationDiff,
          );
        }
      }
    }
  });

  return pluginConfigurationsToUpdate.size > 0
    ? pluginConfigurationsToUpdate
    : undefined;
}

export async function applyPluginConfigurations(
  client: JellyfinClient,
  configurations: Map<string, BasePluginConfigurationSchema> | undefined,
): Promise<void> {
  if (!configurations) return;

  for (const [pluginId, config] of configurations) {
    await client.updatePluginConfiguration(pluginId, config);
  }
}

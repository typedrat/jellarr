import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
  calculatePluginInstalls,
  compareVersions,
  resolveInstalledPluginNames,
  installPlugins,
  calculatePluginRemovals,
  removePlugins,
  type PluginInstall,
  type PluginRemoval,
  getPluginConfigurationSchemaByName,
  calculatePluginConfigurationDiff,
  calculatePluginConfigurationsDiff,
  applyPluginConfigurations,
} from "../../src/apply/plugins";
import type { JellyfinClient } from "../../src/api/jellyfin.types";
import type {
  PluginConfigList,
  PluginConfigurationConfig,
} from "../../src/types/config/plugins";
import type {
  PluginInfoSchema,
  PackageInfoSchema,
  BasePluginConfigurationSchema,
  PluginConfigurationSchema,
} from "../../src/types/schema/plugins";

vi.mock("../../src/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const SSO_GUID: string = "505ce9d1-d916-42fa-86ca-673ef241d7df";
const LDAP_GUID: string = "958aad66-3784-4d2a-b89a-a7b6fab6e25c";

function catalogEntry(
  name: string,
  guid: string,
  versions: Array<{ version: string; targetAbi?: string }>,
): PackageInfoSchema {
  return {
    name,
    guid,
    versions: versions.map((v: { version: string; targetAbi?: string }) => ({
      ...v,
      repositoryUrl: `https://example.invalid/${name}/manifest.json`,
    })),
  } as PackageInfoSchema;
}

const catalog: PackageInfoSchema[] = [
  catalogEntry("SSO Authentication", SSO_GUID, [
    { version: "5.1.1", targetAbi: "12.0.0.0" },
    { version: "5.1.0", targetAbi: "12.0.0.0" },
    { version: "4.0.0.4", targetAbi: "10.11.0.0" },
    { version: "6.0.0", targetAbi: "13.0.0.0" },
  ]),
  catalogEntry("LDAP Authentication", LDAP_GUID, [
    { version: "24.0.0.0", targetAbi: "12.0.0.0" },
  ]),
];

function installedPlugin(
  name: string,
  guid: string,
  version: string,
): PluginInfoSchema {
  return {
    Name: name,
    Id: guid.replace(/-/g, ""),
    Version: version,
    Status: "Active",
  } as PluginInfoSchema;
}

describe("compareVersions", () => {
  it("should treat missing components as zero", () => {
    expect(compareVersions("5.1.1", "5.1.1.0")).toBe(0);
  });

  it("should compare components numerically", () => {
    expect(compareVersions("10.0.0", "9.9.9")).toBe(1);
    expect(compareVersions("4.0.0.4", "5.1.1")).toBe(-1);
  });
});

describe("calculatePluginInstalls", () => {
  it("should return undefined when no plugins desired", () => {
    expect(calculatePluginInstalls([], catalog, [], "12.2.0")).toBeUndefined();
  });

  it("should install a missing plugin at its newest compatible version", () => {
    // Act
    const result: PluginInstall[] | undefined = calculatePluginInstalls(
      [],
      catalog,
      [{ name: "SSO Authentication" }],
      "12.2.0",
    );

    // Assert
    expect(result).toEqual([
      {
        name: "SSO Authentication",
        guid: SSO_GUID,
        version: "5.1.1",
        repositoryUrl:
          "https://example.invalid/SSO Authentication/manifest.json",
      },
    ]);
  });

  it("should upgrade an installed plugin matched by GUID under a different name", () => {
    // Act
    const result: PluginInstall[] | undefined = calculatePluginInstalls(
      [installedPlugin("SSO-Auth", SSO_GUID, "4.0.0.4")],
      catalog,
      [{ name: "SSO Authentication" }],
      "12.2.0",
    );

    // Assert
    expect(result).toHaveLength(1);
    expect(result?.[0]).toMatchObject({
      version: "5.1.1",
      installedVersion: "4.0.0.4",
    });
  });

  it("should not reinstall a plugin already at the newest compatible version", () => {
    expect(
      calculatePluginInstalls(
        [installedPlugin("LDAP-Auth", LDAP_GUID, "24.0.0.0")],
        catalog,
        [{ name: "LDAP Authentication" }],
        "12.2.0",
      ),
    ).toBeUndefined();
  });

  it("should skip versions built for a newer server", () => {
    // Act
    const result: PluginInstall[] | undefined = calculatePluginInstalls(
      [],
      catalog,
      [{ name: "SSO Authentication" }],
      "10.11.6",
    );

    // Assert
    expect(result?.[0]?.version).toBe("4.0.0.4");
  });

  it("should install a pinned version and hold the plugin there", () => {
    expect(
      calculatePluginInstalls(
        [installedPlugin("SSO-Auth", SSO_GUID, "4.0.0.4")],
        catalog,
        [{ name: "SSO Authentication", version: "5.1.0" }],
        "12.2.0",
      )?.[0]?.version,
    ).toBe("5.1.0");

    expect(
      calculatePluginInstalls(
        [installedPlugin("SSO-Auth", SSO_GUID, "5.1.0.0")],
        catalog,
        [{ name: "SSO Authentication", version: "5.1.0" }],
        "12.2.0",
      ),
    ).toBeUndefined();
  });

  it("should not try to downgrade below the installed version", () => {
    expect(
      calculatePluginInstalls(
        [installedPlugin("SSO-Auth", SSO_GUID, "5.1.1.0")],
        catalog,
        [{ name: "SSO Authentication", version: "5.1.0" }],
        "12.2.0",
      ),
    ).toBeUndefined();
  });

  it("should compare against the newest of several installed copies", () => {
    expect(
      calculatePluginInstalls(
        [
          installedPlugin("SSO-Auth", SSO_GUID, "4.0.0.4"),
          installedPlugin("SSO-Auth", SSO_GUID, "5.1.1.0"),
        ],
        catalog,
        [{ name: "SSO Authentication" }],
        "12.2.0",
      ),
    ).toBeUndefined();
  });

  it("should throw for a pinned version that does not exist", () => {
    expect(() =>
      calculatePluginInstalls(
        [],
        catalog,
        [{ name: "SSO Authentication", version: "9.9.9" }],
        "12.2.0",
      ),
    ).toThrow(/no version 9.9.9/);
  });

  it("should throw for a missing plugin that is in no repository", () => {
    expect(() =>
      calculatePluginInstalls([], catalog, [{ name: "Trakt" }], "12.2.0"),
    ).toThrow(/not in any configured repository/);
  });

  it("should leave an installed plugin alone when it is in no repository", () => {
    expect(
      calculatePluginInstalls(
        [
          installedPlugin(
            "Trakt",
            "0f8a3c5e-0000-0000-0000-000000000000",
            "26.0.0",
          ),
        ],
        catalog,
        [{ name: "Trakt" }],
        "12.2.0",
      ),
    ).toBeUndefined();
  });
});

function withStatus(
  plugin: PluginInfoSchema,
  status: PluginInfoSchema["Status"],
): PluginInfoSchema {
  return { ...plugin, Status: status };
}

describe("calculatePluginRemovals", () => {
  it("should remove a superseded copy once the upgrade is active", () => {
    // Arrange: the state Jellyfin was left in after upgrading SSO 4.0.0.4.
    const installed: PluginInfoSchema[] = [
      installedPlugin("SSO-Auth", SSO_GUID, "5.1.1.0"),
      withStatus(
        installedPlugin("SSO Authentication", SSO_GUID, "5.1.1"),
        "Restart",
      ),
      withStatus(
        installedPlugin("SSO-Auth", SSO_GUID, "4.0.0.4"),
        "Superseded",
      ),
    ];

    // Act
    const result: PluginRemoval[] | undefined = calculatePluginRemovals(
      installed,
      catalog,
      [{ name: "SSO Authentication" }],
    );

    // Assert
    expect(result).toEqual([
      {
        name: "SSO Authentication",
        id: SSO_GUID.replace(/-/g, ""),
        version: "4.0.0.4",
      },
    ]);
  });

  it("should accept Jellyfin's misspelled superseded status", () => {
    expect(
      calculatePluginRemovals(
        [
          installedPlugin("SSO-Auth", SSO_GUID, "5.1.1.0"),
          withStatus(
            installedPlugin("SSO-Auth", SSO_GUID, "4.0.0.4"),
            "Superceded",
          ),
        ],
        catalog,
        [{ name: "SSO Authentication" }],
      )?.map((removal: PluginRemoval) => removal.version),
    ).toEqual(["4.0.0.4"]);
  });

  it("should keep the running copy while an upgrade waits for a restart", () => {
    expect(
      calculatePluginRemovals(
        [
          installedPlugin("SSO-Auth", SSO_GUID, "4.0.0.4"),
          withStatus(
            installedPlugin("SSO Authentication", SSO_GUID, "5.1.1"),
            "Restart",
          ),
        ],
        catalog,
        [{ name: "SSO Authentication" }],
      ),
    ).toBeUndefined();
  });

  it("should not remove a copy sharing the active version", () => {
    expect(
      calculatePluginRemovals(
        [
          installedPlugin("SSO-Auth", SSO_GUID, "5.1.1.0"),
          withStatus(
            installedPlugin("SSO-Auth", SSO_GUID, "5.1.1"),
            "Superseded",
          ),
        ],
        catalog,
        [{ name: "SSO Authentication" }],
      ),
    ).toBeUndefined();
  });

  it("should leave plugins that are not managed alone", () => {
    expect(
      calculatePluginRemovals(
        [
          installedPlugin("SSO-Auth", SSO_GUID, "5.1.1.0"),
          withStatus(
            installedPlugin("SSO-Auth", SSO_GUID, "4.0.0.4"),
            "Superseded",
          ),
        ],
        catalog,
        [{ name: "LDAP Authentication" }],
      ),
    ).toBeUndefined();
  });

  it("should skip copies already marked for deletion", () => {
    expect(
      calculatePluginRemovals(
        [
          installedPlugin("SSO-Auth", SSO_GUID, "5.1.1.0"),
          withStatus(
            installedPlugin("SSO-Auth", SSO_GUID, "4.0.0.4"),
            "Deleted",
          ),
        ],
        catalog,
        [{ name: "SSO Authentication" }],
      ),
    ).toBeUndefined();
  });
});

describe("removePlugins", () => {
  it("should uninstall each removal by ID and version", async () => {
    // Arrange
    const uninstallPluginSpy: Mock = vi.fn().mockResolvedValue(undefined);
    const mockClient: JellyfinClient = {
      uninstallPlugin: uninstallPluginSpy,
    } as unknown as JellyfinClient;

    // Act
    await removePlugins(mockClient, [
      { name: "SSO Authentication", id: "abc", version: "4.0.0.4" },
    ]);

    // Assert
    expect(uninstallPluginSpy).toHaveBeenCalledWith("abc", "4.0.0.4");
  });
});

describe("resolveInstalledPluginNames", () => {
  it("should rename desired plugins to their installed names", () => {
    expect(
      resolveInstalledPluginNames(
        [installedPlugin("SSO-Auth", SSO_GUID, "4.0.0.4")],
        catalog,
        [{ name: "SSO Authentication", configuration: { a: 1 } }],
      ),
    ).toEqual([{ name: "SSO-Auth", configuration: { a: 1 } }]);
  });

  it("should keep the desired name when the plugin is not installed", () => {
    expect(
      resolveInstalledPluginNames([], catalog, [
        { name: "SSO Authentication" },
      ]),
    ).toEqual([{ name: "SSO Authentication" }]);
  });
});

describe("installPlugins", () => {
  let mockClient: JellyfinClient;
  let installPackageSpy: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    installPackageSpy = vi.fn().mockResolvedValue(undefined);
    mockClient = {
      installPackage: installPackageSpy,
    } as unknown as JellyfinClient;
  });

  it("should do nothing when installs is undefined", async () => {
    await installPlugins(mockClient, undefined);

    expect(installPackageSpy).not.toHaveBeenCalled();
  });

  it("should install each plugin by GUID, version, and repository", async () => {
    // Arrange
    const installs: PluginInstall[] = [
      {
        name: "SSO Authentication",
        guid: SSO_GUID,
        version: "5.1.1",
        repositoryUrl: "https://example.invalid/sso.json",
      },
      { name: "LDAP Authentication", guid: LDAP_GUID, version: "24.0.0.0" },
    ];

    // Act
    await installPlugins(mockClient, installs);

    // Assert
    expect(installPackageSpy).toHaveBeenNthCalledWith(1, "SSO Authentication", {
      assemblyGuid: SSO_GUID,
      version: "5.1.1",
      repositoryUrl: "https://example.invalid/sso.json",
    });
    expect(installPackageSpy).toHaveBeenNthCalledWith(
      2,
      "LDAP Authentication",
      {
        assemblyGuid: LDAP_GUID,
        version: "24.0.0.0",
      },
    );
  });
});

describe("getPluginConfigurationSchemaByName", () => {
  let mockClient: JellyfinClient;
  let getPluginConfigurationSpy: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    getPluginConfigurationSpy = vi.fn();
    mockClient = {
      getPluginConfiguration: getPluginConfigurationSpy,
    } as unknown as JellyfinClient;
  });

  it("should return empty map when no plugins", async () => {
    // Arrange
    const installedPlugins: PluginInfoSchema[] = [];

    // Act
    const result: Map<string, PluginConfigurationSchema> =
      await getPluginConfigurationSchemaByName(mockClient, installedPlugins);

    // Assert
    expect(result.size).toBe(0);
    expect(getPluginConfigurationSpy).not.toHaveBeenCalled();
  });

  it("should return map with plugin configurations", async () => {
    // Arrange
    const installedPlugins: PluginInfoSchema[] = [
      { Name: "Trakt", Id: "trakt-id" } as PluginInfoSchema,
      { Name: "Fanart", Id: "fanart-id" } as PluginInfoSchema,
    ];
    const traktConfig: BasePluginConfigurationSchema = {
      TraktUsers: [],
    } as unknown as BasePluginConfigurationSchema;
    const fanartConfig: BasePluginConfigurationSchema = {
      EnableImages: true,
    } as unknown as BasePluginConfigurationSchema;
    getPluginConfigurationSpy
      .mockResolvedValueOnce(traktConfig)
      .mockResolvedValueOnce(fanartConfig);

    // Act
    const result: Map<string, PluginConfigurationSchema> =
      await getPluginConfigurationSchemaByName(mockClient, installedPlugins);

    // Assert
    expect(result.size).toBe(2);
    expect(result.get("Trakt")).toEqual({
      id: "trakt-id",
      configuration: traktConfig,
    });
    expect(result.get("Fanart")).toEqual({
      id: "fanart-id",
      configuration: fanartConfig,
    });
    expect(getPluginConfigurationSpy).toHaveBeenCalledTimes(2);
    expect(getPluginConfigurationSpy).toHaveBeenCalledWith("trakt-id");
    expect(getPluginConfigurationSpy).toHaveBeenCalledWith("fanart-id");
  });

  it("should skip plugins without Id", async () => {
    // Arrange
    const installedPlugins: PluginInfoSchema[] = [
      { Name: "Trakt", Id: undefined } as PluginInfoSchema,
      { Name: "Fanart", Id: "fanart-id" } as PluginInfoSchema,
    ];
    const fanartConfig: BasePluginConfigurationSchema = {
      EnableImages: true,
    } as unknown as BasePluginConfigurationSchema;
    getPluginConfigurationSpy.mockResolvedValueOnce(fanartConfig);

    // Act
    const result: Map<string, PluginConfigurationSchema> =
      await getPluginConfigurationSchemaByName(mockClient, installedPlugins);

    // Assert
    expect(result.size).toBe(1);
    expect(result.get("Fanart")).toEqual({
      id: "fanart-id",
      configuration: fanartConfig,
    });
    expect(getPluginConfigurationSpy).toHaveBeenCalledTimes(1);
  });

  it("should skip plugins without Name", async () => {
    // Arrange
    const installedPlugins: PluginInfoSchema[] = [
      { Name: undefined, Id: "trakt-id" } as PluginInfoSchema,
      { Name: "Fanart", Id: "fanart-id" } as PluginInfoSchema,
    ];
    const fanartConfig: BasePluginConfigurationSchema = {
      EnableImages: true,
    } as unknown as BasePluginConfigurationSchema;
    getPluginConfigurationSpy.mockResolvedValueOnce(fanartConfig);

    // Act
    const result: Map<string, PluginConfigurationSchema> =
      await getPluginConfigurationSchemaByName(mockClient, installedPlugins);

    // Assert
    expect(result.size).toBe(1);
    expect(result.get("Fanart")).toEqual({
      id: "fanart-id",
      configuration: fanartConfig,
    });
    expect(getPluginConfigurationSpy).toHaveBeenCalledTimes(1);
  });

  it("should ignore missing plugin configuration responses", async () => {
    // Arrange
    const installedPlugins: PluginInfoSchema[] = [
      { Name: "Fanart", Id: "fanart-id" } as PluginInfoSchema,
    ];
    getPluginConfigurationSpy.mockRejectedValueOnce(
      new Error("GET /Plugins/fanart-id/Configuration failed: 404"),
    );

    // Act
    const result: Map<string, PluginConfigurationSchema> =
      await getPluginConfigurationSchemaByName(mockClient, installedPlugins);

    // Assert
    expect(result.size).toBe(0);
    expect(getPluginConfigurationSpy).toHaveBeenCalledTimes(1);
  });

  it("should rethrow plugin configuration errors other than 404", async () => {
    // Arrange
    const installedPlugins: PluginInfoSchema[] = [
      { Name: "Fanart", Id: "fanart-id" } as PluginInfoSchema,
    ];
    const error: Error = new Error(
      "GET /Plugins/fanart-id/Configuration failed: 500",
    );
    getPluginConfigurationSpy.mockRejectedValueOnce(error);

    // Act & Assert
    await expect(
      getPluginConfigurationSchemaByName(mockClient, installedPlugins),
    ).rejects.toThrow(error);
  });
});

describe("calculatePluginConfigurationDiff", () => {
  it("should return undefined when no changes", () => {
    // Arrange
    const current: BasePluginConfigurationSchema = {
      TraktUsers: [{ ExtraLogging: false }],
    } as unknown as BasePluginConfigurationSchema;
    const desired: PluginConfigurationConfig = {
      TraktUsers: [{ ExtraLogging: false }],
    };

    // Act
    const result: BasePluginConfigurationSchema | undefined =
      calculatePluginConfigurationDiff(current, desired);

    // Assert
    expect(result).toBeUndefined();
  });

  it("should return updated schema when field changes", () => {
    // Arrange
    const current: BasePluginConfigurationSchema = {
      TraktUsers: [{ ExtraLogging: false }],
    } as unknown as BasePluginConfigurationSchema;
    const desired: PluginConfigurationConfig = {
      TraktUsers: [{ ExtraLogging: true }],
    };

    // Act
    const result: BasePluginConfigurationSchema | undefined =
      calculatePluginConfigurationDiff(current, desired);

    // Assert
    expect(result).toBeDefined();
    expect((result as unknown as Record<string, unknown>).TraktUsers).toEqual([
      { ExtraLogging: true },
    ]);
  });

  it("should preserve existing fields not in desired", () => {
    // Arrange
    const current: BasePluginConfigurationSchema = {
      TraktUsers: [{ ExtraLogging: false }],
      OtherField: "preserved",
    } as unknown as BasePluginConfigurationSchema;
    const desired: PluginConfigurationConfig = {
      TraktUsers: [{ ExtraLogging: true }],
    };

    // Act
    const result: BasePluginConfigurationSchema | undefined =
      calculatePluginConfigurationDiff(current, desired);

    // Assert
    expect(result).toBeDefined();
    const resultRecord: Record<string, unknown> = result as unknown as Record<
      string,
      unknown
    >;
    expect(resultRecord.TraktUsers).toEqual([{ ExtraLogging: true }]);
    expect(resultRecord.OtherField).toBe("preserved");
  });

  it("should add new fields from desired", () => {
    // Arrange
    const current: BasePluginConfigurationSchema = {
      ExistingField: "value",
    } as unknown as BasePluginConfigurationSchema;
    const desired: PluginConfigurationConfig = {
      NewField: "new value",
    };

    // Act
    const result: BasePluginConfigurationSchema | undefined =
      calculatePluginConfigurationDiff(current, desired);

    // Assert
    expect(result).toBeDefined();
    const resultRecord: Record<string, unknown> = result as unknown as Record<
      string,
      unknown
    >;
    expect(resultRecord.ExistingField).toBe("value");
    expect(resultRecord.NewField).toBe("new value");
  });

  it("should handle nested object changes", () => {
    // Arrange
    const current: BasePluginConfigurationSchema = {
      Settings: { Option1: true, Option2: false },
    } as unknown as BasePluginConfigurationSchema;
    const desired: PluginConfigurationConfig = {
      Settings: { Option1: false },
    };

    // Act
    const result: BasePluginConfigurationSchema | undefined =
      calculatePluginConfigurationDiff(current, desired);

    // Assert
    expect(result).toBeDefined();
    const resultRecord: Record<
      string,
      Record<string, boolean>
    > = result as unknown as Record<string, Record<string, boolean>>;
    expect(resultRecord.Settings.Option1).toBe(false);
    expect(resultRecord.Settings.Option2).toBe(false);
  });
});

describe("calculatePluginConfigurationsDiff", () => {
  it("should return undefined when no plugins desired", () => {
    // Arrange
    const currentMap: Map<string, PluginConfigurationSchema> = new Map([
      [
        "Trakt",
        {
          id: "trakt-id",
          configuration: {
            TraktUsers: [],
          } as unknown as BasePluginConfigurationSchema,
        },
      ],
    ]);
    const desired: PluginConfigList = [];

    // Act
    const result: Map<string, BasePluginConfigurationSchema> | undefined =
      calculatePluginConfigurationsDiff(currentMap, desired);

    // Assert
    expect(result).toBeUndefined();
  });

  it("should return undefined when no plugins have configuration", () => {
    // Arrange
    const currentMap: Map<string, PluginConfigurationSchema> = new Map([
      [
        "Trakt",
        {
          id: "trakt-id",
          configuration: {
            TraktUsers: [],
          } as unknown as BasePluginConfigurationSchema,
        },
      ],
    ]);
    const desired: PluginConfigList = [{ name: "Trakt" }];

    // Act
    const result: Map<string, BasePluginConfigurationSchema> | undefined =
      calculatePluginConfigurationsDiff(currentMap, desired);

    // Assert
    expect(result).toBeUndefined();
  });

  it("should return undefined when plugin not installed", () => {
    // Arrange
    const currentMap: Map<string, PluginConfigurationSchema> = new Map();
    const desired: PluginConfigList = [
      { name: "Trakt", configuration: { TraktUsers: [] } },
    ];

    // Act
    const result: Map<string, BasePluginConfigurationSchema> | undefined =
      calculatePluginConfigurationsDiff(currentMap, desired);

    // Assert
    expect(result).toBeUndefined();
  });

  it("should return undefined when configuration unchanged", () => {
    // Arrange
    const currentMap: Map<string, PluginConfigurationSchema> = new Map([
      [
        "Trakt",
        {
          id: "trakt-id",
          configuration: {
            TraktUsers: [{ ExtraLogging: true }],
          } as unknown as BasePluginConfigurationSchema,
        },
      ],
    ]);
    const desired: PluginConfigList = [
      {
        name: "Trakt",
        configuration: { TraktUsers: [{ ExtraLogging: true }] },
      },
    ];

    // Act
    const result: Map<string, BasePluginConfigurationSchema> | undefined =
      calculatePluginConfigurationsDiff(currentMap, desired);

    // Assert
    expect(result).toBeUndefined();
  });

  it("should return map with updated configurations", () => {
    // Arrange
    const currentMap: Map<string, PluginConfigurationSchema> = new Map([
      [
        "Trakt",
        {
          id: "trakt-id",
          configuration: {
            TraktUsers: [{ ExtraLogging: false }],
          } as unknown as BasePluginConfigurationSchema,
        },
      ],
    ]);
    const desired: PluginConfigList = [
      {
        name: "Trakt",
        configuration: { TraktUsers: [{ ExtraLogging: true }] },
      },
    ];

    // Act
    const result: Map<string, BasePluginConfigurationSchema> | undefined =
      calculatePluginConfigurationsDiff(currentMap, desired);

    // Assert
    expect(result).toBeDefined();
    expect(result?.size).toBe(1);
    const config: Record<string, unknown> = result?.get(
      "trakt-id",
    ) as unknown as Record<string, unknown>;
    expect(config.TraktUsers).toEqual([{ ExtraLogging: true }]);
  });

  it("should handle multiple plugins with changes", () => {
    // Arrange
    const currentMap: Map<string, PluginConfigurationSchema> = new Map([
      [
        "Trakt",
        {
          id: "trakt-id",
          configuration: {
            TraktUsers: [{ ExtraLogging: false }],
          } as unknown as BasePluginConfigurationSchema,
        },
      ],
      [
        "Fanart",
        {
          id: "fanart-id",
          configuration: {
            EnableImages: false,
          } as unknown as BasePluginConfigurationSchema,
        },
      ],
    ]);
    const desired: PluginConfigList = [
      {
        name: "Trakt",
        configuration: { TraktUsers: [{ ExtraLogging: true }] },
      },
      { name: "Fanart", configuration: { EnableImages: true } },
    ];

    // Act
    const result: Map<string, BasePluginConfigurationSchema> | undefined =
      calculatePluginConfigurationsDiff(currentMap, desired);

    // Assert
    expect(result).toBeDefined();
    expect(result?.size).toBe(2);
    const traktConfig: Record<string, unknown> = result?.get(
      "trakt-id",
    ) as unknown as Record<string, unknown>;
    expect(traktConfig.TraktUsers).toEqual([{ ExtraLogging: true }]);
    const fanartConfig: Record<string, unknown> = result?.get(
      "fanart-id",
    ) as unknown as Record<string, unknown>;
    expect(fanartConfig.EnableImages).toBe(true);
  });
});

describe("applyPluginConfigurations", () => {
  let mockClient: JellyfinClient;
  let updatePluginConfigurationSpy: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    updatePluginConfigurationSpy = vi.fn();
    mockClient = {
      updatePluginConfiguration: updatePluginConfigurationSpy,
    } as unknown as JellyfinClient;
  });

  it("should do nothing when configurations is undefined", async () => {
    // Act
    await applyPluginConfigurations(mockClient, undefined);

    // Assert
    expect(updatePluginConfigurationSpy).not.toHaveBeenCalled();
  });

  it("should update single plugin configuration", async () => {
    // Arrange
    const config: BasePluginConfigurationSchema = {
      TraktUsers: [{ ExtraLogging: true }],
    } as unknown as BasePluginConfigurationSchema;
    const configurations: Map<string, BasePluginConfigurationSchema> = new Map([
      ["trakt-id", config],
    ]);
    updatePluginConfigurationSpy.mockResolvedValue(undefined);

    // Act
    await applyPluginConfigurations(mockClient, configurations);

    // Assert
    expect(updatePluginConfigurationSpy).toHaveBeenCalledTimes(1);
    expect(updatePluginConfigurationSpy).toHaveBeenCalledWith(
      "trakt-id",
      config,
    );
  });

  it("should update multiple plugin configurations", async () => {
    // Arrange
    const traktConfig: BasePluginConfigurationSchema = {
      TraktUsers: [{ ExtraLogging: true }],
    } as unknown as BasePluginConfigurationSchema;
    const fanartConfig: BasePluginConfigurationSchema = {
      EnableImages: true,
    } as unknown as BasePluginConfigurationSchema;
    const configurations: Map<string, BasePluginConfigurationSchema> = new Map([
      ["trakt-id", traktConfig],
      ["fanart-id", fanartConfig],
    ]);
    updatePluginConfigurationSpy.mockResolvedValue(undefined);

    // Act
    await applyPluginConfigurations(mockClient, configurations);

    // Assert
    expect(updatePluginConfigurationSpy).toHaveBeenCalledTimes(2);
    expect(updatePluginConfigurationSpy).toHaveBeenCalledWith(
      "trakt-id",
      traktConfig,
    );
    expect(updatePluginConfigurationSpy).toHaveBeenCalledWith(
      "fanart-id",
      fanartConfig,
    );
  });

  it("should handle empty map", async () => {
    // Arrange
    const configurations: Map<string, BasePluginConfigurationSchema> =
      new Map();

    // Act
    await applyPluginConfigurations(mockClient, configurations);

    // Assert
    expect(updatePluginConfigurationSpy).not.toHaveBeenCalled();
  });
});

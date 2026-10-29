import type {
  LibraryOptionName,
  VirtualFolderConfig,
} from "../types/config/library";
import type {
  LibraryOptionsSchema,
  VirtualFolderInfoSchema,
} from "../types/schema/library";

/** The LibraryOptions field each library option is written to. */
export const LIBRARY_OPTION_FIELDS: Record<
  LibraryOptionName,
  keyof LibraryOptionsSchema
> = {
  pathInfos: "PathInfos",
  typeOptions: "TypeOptions",
  automaticallyAddToCollection: "AutomaticallyAddToCollection",
  enableChapterImageExtraction: "EnableChapterImageExtraction",
  extractChapterImagesDuringLibraryScan:
    "ExtractChapterImagesDuringLibraryScan",
  extractTrickplayImagesDuringLibraryScan:
    "ExtractTrickplayImagesDuringLibraryScan",
  enableEmbeddedEpisodeInfos: "EnableEmbeddedEpisodeInfos",
  enableEmbeddedExtraTitles: "EnableEmbeddedExtrasTitles",
  enableTrickplayImageExtraction: "EnableTrickplayImageExtraction",
  saveTrickplayWithMedia: "SaveTrickplayWithMedia",
  metadataSavers: "MetadataSavers",
  saveLocalMetadata: "SaveLocalMetadata",
  automaticRefreshIntervalDays: "AutomaticRefreshIntervalDays",
  enableRealtimeMonitor: "EnableRealtimeMonitor",
};

/**
 * Drop keys whose value is `undefined`. The library diff runs against the live
 * server config, so an omitted option must be absent rather than an explicit
 * `undefined`, which json-diff-ts would otherwise report as a spurious change.
 */
function withoutUndefined<T extends Record<string, unknown>>(
  obj: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(
      ([, value]: [string, unknown]) => value !== undefined,
    ),
  ) as Partial<T>;
}

export function mapVirtualFolderConfigToSchema(
  config: VirtualFolderConfig,
): Partial<VirtualFolderInfoSchema> {
  const opts: VirtualFolderConfig["libraryOptions"] = config.libraryOptions;

  const libraryOptions: Partial<LibraryOptionsSchema> = withoutUndefined({
    PathInfos: opts.pathInfos.map((pathInfo: { path: string }) => ({
      Path: pathInfo.path,
    })),
    TypeOptions: opts.typeOptions as LibraryOptionsSchema["TypeOptions"],
    AutomaticallyAddToCollection: opts.automaticallyAddToCollection,
    EnableChapterImageExtraction: opts.enableChapterImageExtraction,
    ExtractChapterImagesDuringLibraryScan:
      opts.extractChapterImagesDuringLibraryScan,
    ExtractTrickplayImagesDuringLibraryScan:
      opts.extractTrickplayImagesDuringLibraryScan,
    EnableEmbeddedEpisodeInfos: opts.enableEmbeddedEpisodeInfos,
    EnableEmbeddedExtrasTitles: opts.enableEmbeddedExtraTitles,
    EnableTrickplayImageExtraction: opts.enableTrickplayImageExtraction,
    SaveTrickplayWithMedia: opts.saveTrickplayWithMedia,
    MetadataSavers: opts.metadataSavers,
    SaveLocalMetadata: opts.saveLocalMetadata,
    AutomaticRefreshIntervalDays: opts.automaticRefreshIntervalDays,
    EnableRealtimeMonitor: opts.enableRealtimeMonitor,
  });

  return {
    Name: config.name,
    CollectionType: config.collectionType,
    LibraryOptions: libraryOptions as LibraryOptionsSchema,
  };
}

/**
 * Replace the ignored options of a desired folder with the values the server
 * currently has, so they neither show up in the diff nor get overwritten when
 * another option drives an update.
 */
export function withIgnoredLibraryOptions(
  desired: Partial<VirtualFolderInfoSchema>,
  current: VirtualFolderInfoSchema,
  ignoreChanges: readonly LibraryOptionName[],
): Partial<VirtualFolderInfoSchema> {
  if (ignoreChanges.length === 0) return desired;

  const ignored: Set<string> = new Set(
    ignoreChanges.map(
      (option: LibraryOptionName): string => LIBRARY_OPTION_FIELDS[option],
    ),
  );
  const libraryOptions: Record<string, unknown> = Object.fromEntries([
    ...Object.entries(desired.LibraryOptions ?? {}).filter(
      ([field]: [string, unknown]): boolean => !ignored.has(field),
    ),
    ...Object.entries(current.LibraryOptions ?? {}).filter(
      ([field]: [string, unknown]): boolean => ignored.has(field),
    ),
  ]);

  return {
    ...desired,
    LibraryOptions: libraryOptions as LibraryOptionsSchema,
  };
}

export function mapVirtualFolderInfoSchemaToAddVirtualFolderDtoSchema(
  virtualFolderInfoSchema: VirtualFolderInfoSchema,
): { LibraryOptions: VirtualFolderInfoSchema["LibraryOptions"] } {
  return {
    LibraryOptions: virtualFolderInfoSchema.LibraryOptions,
  };
}

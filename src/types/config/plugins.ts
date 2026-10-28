import { z } from "zod";

export const PluginConfigurationConfigType: z.ZodRecord<
  z.ZodString,
  z.ZodUnknown
> = z.record(z.string(), z.unknown());

export type PluginConfigurationConfig = z.infer<
  typeof PluginConfigurationConfigType
>;

export const PluginConfigType: z.ZodObject<{
  name: z.ZodString;
  version: z.ZodOptional<z.ZodString>;
  configuration: z.ZodOptional<typeof PluginConfigurationConfigType>;
}> = z
  .object({
    name: z.string().min(1, "Plugin name cannot be empty"),
    version: z
      .string()
      .regex(/^\d+(\.\d+){0,3}$/, "Plugin version must look like 1.2.3.4")
      .optional(),
    configuration: PluginConfigurationConfigType.optional(),
  })
  .strict();

export type PluginConfig = z.infer<typeof PluginConfigType>;

export const PluginConfigListType: z.ZodArray<typeof PluginConfigType> =
  z.array(PluginConfigType);

export type PluginConfigList = z.infer<typeof PluginConfigListType>;

import { z } from "zod";

export const EncodingOptionsConfigType: z.ZodObject<{
  enableHardwareEncoding: z.ZodOptional<z.ZodBoolean>;
  hardwareAccelerationType: z.ZodOptional<
    z.ZodEnum<{
      none: "none";
      amf: "amf";
      qsv: "qsv";
      nvenc: "nvenc";
      v4l2m2m: "v4l2m2m";
      vaapi: "vaapi";
      videotoolbox: "videotoolbox";
      rkmpp: "rkmpp";
    }>
  >;
  vaapiDevice: z.ZodOptional<z.ZodString>;
  qsvDevice: z.ZodOptional<z.ZodString>;
  hardwareDecodingCodecs: z.ZodOptional<
    z.ZodArray<
      z.ZodEnum<{
        h264: "h264";
        hevc: "hevc";
        mpeg2video: "mpeg2video";
        vc1: "vc1";
        vp8: "vp8";
        vp9: "vp9";
        av1: "av1";
      }>
    >
  >;
  enableDecodingColorDepth10Hevc: z.ZodOptional<z.ZodBoolean>;
  enableDecodingColorDepth10Vp9: z.ZodOptional<z.ZodBoolean>;
  enableDecodingColorDepth10HevcRext: z.ZodOptional<z.ZodBoolean>;
  enableDecodingColorDepth12HevcRext: z.ZodOptional<z.ZodBoolean>;
  allowHevcEncoding: z.ZodOptional<z.ZodBoolean>;
  allowAv1Encoding: z.ZodOptional<z.ZodBoolean>;
  enableTonemapping: z.ZodOptional<z.ZodBoolean>;
  enableVppTonemapping: z.ZodOptional<z.ZodBoolean>;
  tonemappingAlgorithm: z.ZodOptional<
    z.ZodEnum<{
      none: "none";
      clip: "clip";
      linear: "linear";
      gamma: "gamma";
      reinhard: "reinhard";
      hable: "hable";
      mobius: "mobius";
      bt2390: "bt2390";
    }>
  >;
  tonemappingMode: z.ZodOptional<
    z.ZodEnum<{
      auto: "auto";
      max: "max";
      rgb: "rgb";
      lum: "lum";
      itp: "itp";
    }>
  >;
  tonemappingRange: z.ZodOptional<
    z.ZodEnum<{
      auto: "auto";
      tv: "tv";
      pc: "pc";
    }>
  >;
}> = z
  .object({
    enableHardwareEncoding: z.boolean().optional(),
    hardwareAccelerationType: z
      .enum([
        "none",
        "amf",
        "qsv",
        "nvenc",
        "v4l2m2m",
        "vaapi",
        "videotoolbox",
        "rkmpp",
      ])
      .optional(),
    vaapiDevice: z.string().optional(),
    qsvDevice: z.string().optional(),
    hardwareDecodingCodecs: z
      .array(z.enum(["h264", "hevc", "mpeg2video", "vc1", "vp8", "vp9", "av1"]))
      .optional(),
    enableDecodingColorDepth10Hevc: z.boolean().optional(),
    enableDecodingColorDepth10Vp9: z.boolean().optional(),
    enableDecodingColorDepth10HevcRext: z.boolean().optional(),
    enableDecodingColorDepth12HevcRext: z.boolean().optional(),
    allowHevcEncoding: z.boolean().optional(),
    allowAv1Encoding: z.boolean().optional(),
    enableTonemapping: z.boolean().optional(),
    enableVppTonemapping: z.boolean().optional(),
    tonemappingAlgorithm: z
      .enum([
        "none",
        "clip",
        "linear",
        "gamma",
        "reinhard",
        "hable",
        "mobius",
        "bt2390",
      ])
      .optional(),
    tonemappingMode: z.enum(["auto", "max", "rgb", "lum", "itp"]).optional(),
    tonemappingRange: z.enum(["auto", "tv", "pc"]).optional(),
  })
  .strict();

export type EncodingOptionsConfig = z.infer<typeof EncodingOptionsConfigType>;

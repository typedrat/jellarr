import { type EncodingOptionsConfig } from "../types/config/encoding-options";
import { type EncodingOptionsSchema } from "../types/schema/encoding-options";

export function mapEncodingOptionsConfigToSchema(
  desired: EncodingOptionsConfig,
): Partial<EncodingOptionsSchema> {
  const out: Partial<EncodingOptionsSchema> = {};

  if (typeof desired.enableHardwareEncoding !== "undefined") {
    out.EnableHardwareEncoding = desired.enableHardwareEncoding;
  }

  if (typeof desired.hardwareAccelerationType !== "undefined") {
    out.HardwareAccelerationType = desired.hardwareAccelerationType;
  }

  if (typeof desired.hardwareDecodingCodecs !== "undefined") {
    out.HardwareDecodingCodecs = desired.hardwareDecodingCodecs;
  }

  if (typeof desired.enableDecodingColorDepth10Hevc !== "undefined") {
    out.EnableDecodingColorDepth10Hevc = desired.enableDecodingColorDepth10Hevc;
  }

  if (typeof desired.enableDecodingColorDepth10Vp9 !== "undefined") {
    out.EnableDecodingColorDepth10Vp9 = desired.enableDecodingColorDepth10Vp9;
  }

  if (typeof desired.enableDecodingColorDepth10HevcRext !== "undefined") {
    out.EnableDecodingColorDepth10HevcRext =
      desired.enableDecodingColorDepth10HevcRext;
  }

  if (typeof desired.enableDecodingColorDepth12HevcRext !== "undefined") {
    out.EnableDecodingColorDepth12HevcRext =
      desired.enableDecodingColorDepth12HevcRext;
  }

  if (typeof desired.vaapiDevice !== "undefined") {
    out.VaapiDevice = desired.vaapiDevice;
  }

  if (typeof desired.qsvDevice !== "undefined") {
    out.QsvDevice = desired.qsvDevice;
  }

  if (typeof desired.allowHevcEncoding !== "undefined") {
    out.AllowHevcEncoding = desired.allowHevcEncoding;
  }

  if (typeof desired.allowAv1Encoding !== "undefined") {
    out.AllowAv1Encoding = desired.allowAv1Encoding;
  }

  if (typeof desired.enableTonemapping !== "undefined") {
    out.EnableTonemapping = desired.enableTonemapping;
  }

  if (typeof desired.enableVppTonemapping !== "undefined") {
    out.EnableVppTonemapping = desired.enableVppTonemapping;
  }

  if (typeof desired.tonemappingAlgorithm !== "undefined") {
    out.TonemappingAlgorithm = desired.tonemappingAlgorithm;
  }

  if (typeof desired.tonemappingMode !== "undefined") {
    out.TonemappingMode = desired.tonemappingMode;
  }

  if (typeof desired.tonemappingRange !== "undefined") {
    out.TonemappingRange = desired.tonemappingRange;
  }

  return out;
}

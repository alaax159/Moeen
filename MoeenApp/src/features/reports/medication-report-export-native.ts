import { Platform } from "react-native";
import * as FileSystemLegacy from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import {
  MEDICATION_REPORT_MIME_TYPE,
  type MedicationReportExportAdapter,
} from "./medication-report-export-core";

async function savePdfOnAndroid(
  sourceUri: string,
  fileName: string,
): Promise<string | null> {
  const permission =
    await FileSystemLegacy.StorageAccessFramework.requestDirectoryPermissionsAsync();

  if (!permission.granted) {
    return null;
  }

  const base64 = await FileSystemLegacy.readAsStringAsync(sourceUri, {
    encoding: FileSystemLegacy.EncodingType.Base64,
  });

  const destinationUri =
    await FileSystemLegacy.StorageAccessFramework.createFileAsync(
      permission.directoryUri,
      fileName,
      MEDICATION_REPORT_MIME_TYPE,
    );

  await FileSystemLegacy.StorageAccessFramework.writeAsStringAsync(
    destinationUri,
    base64,
    {
      encoding: FileSystemLegacy.EncodingType.Base64,
    },
  );

  return destinationUri;
}

async function copyPdfToLocalDirectory(
  sourceUri: string,
  directoryUri: string | null,
  fileName: string,
): Promise<string> {
  if (!directoryUri) {
    throw new Error("Application file directory is unavailable.");
  }

  const destinationUri = `${directoryUri}${fileName}`;
  const existingFile = await FileSystemLegacy.getInfoAsync(destinationUri);

  if (existingFile.exists) {
    await FileSystemLegacy.deleteAsync(destinationUri, {
      idempotent: true,
    });
  }

  await FileSystemLegacy.copyAsync({
    from: sourceUri,
    to: destinationUri,
  });

  return destinationUri;
}

async function savePdfInAppDocuments(
  sourceUri: string,
  fileName: string,
): Promise<string> {
  return copyPdfToLocalDirectory(
    sourceUri,
    FileSystemLegacy.documentDirectory,
    fileName,
  );
}

async function preparePdfForSharing(
  sourceUri: string,
  fileName: string,
): Promise<string> {
  const directoryUri = FileSystemLegacy.cacheDirectory;

  if (!directoryUri) {
    throw new Error("Application cache directory is unavailable.");
  }

  const destinationUri = `${directoryUri}${fileName}`;

  try {
    return await copyPdfToLocalDirectory(
      sourceUri,
      directoryUri,
      fileName,
    );
  } catch (error) {
    try {
      await FileSystemLegacy.deleteAsync(destinationUri, {
        idempotent: true,
      });
    } catch {
      // Best-effort cleanup of a partially created sharing copy.
    }

    throw error;
  }
}

export const nativeMedicationReportExportAdapter: MedicationReportExportAdapter =
  {
    async generatePdf(html) {
      const result = await Print.printToFileAsync({
        html,
        base64: false,
      });

      return result.uri;
    },

    async savePdf(sourceUri, fileName) {
      if (Platform.OS === "android") {
        return savePdfOnAndroid(sourceUri, fileName);
      }

      return savePdfInAppDocuments(sourceUri, fileName);
    },

    isSharingAvailable() {
      return Sharing.isAvailableAsync();
    },

    preparePdfForSharing(sourceUri, fileName) {
      return preparePdfForSharing(sourceUri, fileName);
    },

    async sharePdf(uri, fileName) {
      await Sharing.shareAsync(uri, {
        mimeType: MEDICATION_REPORT_MIME_TYPE,
        UTI: "com.adobe.pdf",
        dialogTitle: `Share ${fileName}`,
      });
    },

    async deleteTemporaryPdf(uri) {
      await FileSystemLegacy.deleteAsync(uri, {
        idempotent: true,
      });
    },
  };

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  PrescriptionScanApiError,
  scanPrescription,
} from '@/features/prescription-scan/api';
import { usePrescriptionDraft } from '@/features/prescription-scan/context';
import type { PrescriptionImageFile } from '@/features/prescription-scan/types';
import { useTheme } from '@/hooks/use-theme';

const GENERIC_ERROR = 'Unable to scan the prescription. Please try again.';

export default function PrescriptionScanScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { draft, setDraft } = usePrescriptionDraft();
  const [image, setImage] = useState<PrescriptionImageFile | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setDraft(null);
    }, [setDraft]),
  );

  const handleAsset = (asset: ImagePicker.ImagePickerAsset) => {
    const type = supportedMimeType(asset);
    if (!type) {
      Alert.alert('Unsupported image', 'Please choose a JPEG or PNG image.');
      return;
    }
    setDraft(null);
    setImage({
      uri: asset.uri,
      name: asset.fileName ?? defaultFileName(type),
      type,
    });
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Camera permission required',
        'Allow camera access to take a prescription photo.',
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
    });
    if (!result.canceled) handleAsset(result.assets[0]);
  };

  const uploadImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 1,
    });
    if (!result.canceled) handleAsset(result.assets[0]);
  };

  const submit = async () => {
    if (!image || isScanning) return;
    setIsScanning(true);
    try {
      const result = await scanPrescription(image);
      setDraft(result);
    } catch (error) {
      Alert.alert(
        'Prescription scan failed',
        error instanceof PrescriptionScanApiError
          ? error.message
          : GENERIC_ERROR,
      );
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <ThemedView
      style={[styles.screen, { backgroundColor: theme.backgroundElement }]}
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Go back"
            activeOpacity={0.8}
            onPress={() => router.back()}
            style={[styles.backButton, { backgroundColor: theme.background }]}
          >
            <Ionicons name="arrow-back" size={21} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            Scan Prescription
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.intro, { color: theme.textSecondary }]}>
            Take a photo or upload an image of your prescription.
          </Text>

          {!image ? (
            <View style={styles.actions}>
              <ImageAction
                icon="camera-outline"
                title="Take Photo"
                subtitle="Use your camera"
                onPress={takePhoto}
              />
              <ImageAction
                icon="image-outline"
                title="Upload Image"
                subtitle="Choose from your gallery"
                onPress={uploadImage}
              />
            </View>
          ) : (
            <View>
              <View
                style={[
                  styles.previewCard,
                  {
                    backgroundColor: theme.background,
                    borderColor: theme.backgroundSelected,
                  },
                ]}
              >
                <Image
                  source={{ uri: image.uri }}
                  style={styles.preview}
                  contentFit="contain"
                />
              </View>
              <View style={styles.previewActions}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  disabled={isScanning}
                  onPress={uploadImage}
                  style={[
                    styles.secondaryButton,
                    { backgroundColor: theme.background },
                  ]}
                >
                  <Ionicons
                    name="swap-horizontal"
                    size={18}
                    color={theme.primary}
                  />
                  <Text
                    style={[styles.secondaryText, { color: theme.primary }]}
                  >
                    Replace
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.8}
                  disabled={isScanning}
                  onPress={() => {
                    setImage(null);
                    setDraft(null);
                  }}
                  style={[
                    styles.secondaryButton,
                    { backgroundColor: theme.background },
                  ]}
                >
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={theme.danger}
                  />
                  <Text style={[styles.secondaryText, { color: theme.danger }]}>
                    Remove
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {draft && (
            <View
              style={[
                styles.successCard,
                { backgroundColor: theme.primaryLight },
              ]}
            >
              <Ionicons
                name="checkmark-circle"
                size={24}
                color={theme.primary}
              />
              <View style={styles.successText}>
                <Text
                  style={[styles.successTitle, { color: theme.primaryDark }]}
                >
                  Prescription scanned
                </Text>
                <Text
                  style={[
                    styles.successSubtitle,
                    { color: theme.textSecondary },
                  ]}
                >
                  Draft ready for the Review step.
                </Text>
              </View>
            </View>
          )}
        </ScrollView>

        {image && !draft && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ disabled: isScanning }}
            activeOpacity={0.9}
            disabled={isScanning}
            onPress={submit}
            style={[
              styles.scanButton,
              { backgroundColor: theme.primary, opacity: isScanning ? 0.7 : 1 },
            ]}
          >
            {isScanning ? (
              <>
                <ActivityIndicator size="small" color={theme.onPrimary} />
                <Text
                  style={[styles.scanButtonText, { color: theme.onPrimary }]}
                >
                  Scanning prescription...
                </Text>
              </>
            ) : (
              <>
                <Ionicons
                  name="scan-outline"
                  size={20}
                  color={theme.onPrimary}
                />
                <Text
                  style={[styles.scanButtonText, { color: theme.onPrimary }]}
                >
                  Scan Prescription
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
        {draft && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Continue to review"
            activeOpacity={0.9}
            onPress={() => router.push('/medications/prescription-review')}
            style={[styles.scanButton, { backgroundColor: theme.primary }]}
          >
            <Ionicons
              name="arrow-forward-outline"
              size={20}
              color={theme.onPrimary}
            />

            <Text style={[styles.scanButtonText, { color: theme.onPrimary }]}>
              Continue to Review
            </Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function supportedMimeType(
  asset: ImagePicker.ImagePickerAsset,
): PrescriptionImageFile['type'] | null {
  if (asset.mimeType === 'image/jpeg' || asset.mimeType === 'image/png') {
    return asset.mimeType;
  }
  const name = asset.fileName?.toLowerCase() ?? asset.uri.toLowerCase();
  if (/\.jpe?g(?:\?|$)/.test(name)) return 'image/jpeg';
  if (/\.png(?:\?|$)/.test(name)) return 'image/png';
  return null;
}

function defaultFileName(type: PrescriptionImageFile['type']) {
  return `prescription.${type === 'image/png' ? 'png' : 'jpg'}`;
}

function ImageAction({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={title}
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.actionCard,
        {
          backgroundColor: theme.background,
          borderColor: theme.backgroundSelected,
        },
      ]}
    >
      <View
        style={[styles.actionIcon, { backgroundColor: theme.primaryLight }]}
      >
        <Ionicons name={icon} size={28} color={theme.primary} />
      </View>
      <Text style={[styles.actionTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.actionSubtitle, { color: theme.textSecondary }]}>
        {subtitle}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    minHeight: 70,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 20, lineHeight: 26, fontWeight: '800' },
  headerSpacer: { width: 40 },
  content: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 124 },
  intro: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: Spacing.four,
  },
  actions: { gap: Spacing.three },
  actionCard: {
    minHeight: 154,
    borderWidth: 1,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
    shadowColor: '#173E2A',
    shadowOpacity: 0.035,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  actionIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  actionTitle: { fontSize: 16, fontWeight: '800' },
  actionSubtitle: { fontSize: 13, marginTop: Spacing.one },
  previewCard: {
    height: 390,
    borderWidth: 1,
    borderRadius: 22,
    overflow: 'hidden',
    padding: Spacing.two,
  },
  preview: { width: '100%', height: '100%' },
  previewActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { fontSize: 14, fontWeight: '700', marginLeft: Spacing.two },
  successCard: {
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.four,
  },
  successText: { flex: 1, marginLeft: Spacing.three },
  successTitle: { fontSize: 15, fontWeight: '700' },
  successSubtitle: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  scanButton: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 16,
    minHeight: 54,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanButtonText: { fontSize: 15, fontWeight: '700', marginLeft: Spacing.two },
});

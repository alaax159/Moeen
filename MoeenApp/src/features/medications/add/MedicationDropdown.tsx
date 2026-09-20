import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  useColorScheme,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Colors, Radius, Typography } from "@/constants/theme";

import type { Option } from "./types";

type MedicationDropdownProps<T> = {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
};

export function MedicationDropdown<T>({
  label,
  value,
  options,
  onChange,
}: MedicationDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);

  const scheme = useColorScheme();
  const colors =
    Colors[scheme === "dark" ? "dark" : "light"];

  const selectedLabel =
    options.find(
      (option) => option.value === value,
    )?.label ?? label;

  function selectOption(optionValue: T) {
    onChange(optionValue);
    setIsOpen(false);
  }

  return (
    <View
      style={[
        styles.wrapper,
        isOpen && styles.wrapperOpen,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{
          expanded: isOpen,
        }}
        onPress={() =>
          setIsOpen((current) => !current)
        }
        style={[
          styles.dropdown,
          {
            backgroundColor:
              colors.backgroundElement,
            borderColor:
              isOpen
                ? colors.primary
                : colors.backgroundSelected,
          },
        ]}
      >
        <ThemedText
          numberOfLines={1}
          style={[
            styles.dropdownText,
            {
              color: colors.text,
            },
          ]}
        >
          {selectedLabel}
        </ThemedText>

        <Ionicons
          name={
            isOpen
              ? "chevron-up"
              : "chevron-down"
          }
          size={18}
          color={colors.textSecondary}
        />
      </Pressable>

      {isOpen && (
        <View
          style={[
            styles.optionsContainer,
            {
              backgroundColor:
                colors.background,
              borderColor:
                colors.backgroundSelected,
            },
          ]}
        >
          {options.map((option) => {
            const isSelected =
              option.value === value;

            return (
              <Pressable
                key={String(option.value)}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityState={{
                  selected: isSelected,
                }}
                onPress={() =>
                  selectOption(option.value)
                }
                style={[
                  styles.option,
                  isSelected && {
                    backgroundColor:
                      colors.primaryLight,
                  },
                ]}
              >
                <ThemedText
                  style={[
                    styles.optionText,
                    {
                      color: isSelected
                        ? colors.primaryDark
                        : colors.text,
                    },
                    isSelected &&
                      styles.selectedOptionText,
                  ]}
                >
                  {option.label}
                </ThemedText>

                {isSelected && (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={colors.primary}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    zIndex: 1,
  },
  wrapperOpen: {
    zIndex: 20,
  },
  dropdown: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: Radius.control,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dropdownText: {
    flex: 1,
    ...Typography.body,
    fontSize: 15,
  },
  optionsContainer: {
    marginTop: 7,
    borderWidth: 1,
    borderRadius: Radius.control,
    overflow: 'hidden',
    shadowColor: '#173E2A',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  option: {
    minHeight: 50,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionText: {
    flex: 1,
    ...Typography.body,
    fontSize: 15,
  },
  selectedOptionText: {
    fontWeight: '700',
  },
});

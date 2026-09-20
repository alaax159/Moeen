import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { MedicalTerm } from './types';

const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 400;

interface TermSearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSelect: (term: MedicalTerm) => void;
  search: (query: string) => Promise<MedicalTerm[]>;
  placeholder: string;
}

export function TermSearchInput({
  value,
  onChangeText,
  onSelect,
  search,
  placeholder,
}: TermSearchInputProps) {
  const theme = useTheme();

  const [results, setResults] = useState<MedicalTerm[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);

  useEffect(() => {
    const trimmed = value.trim();

    if (!isOpen || trimmed.length < MIN_QUERY_LENGTH) {
      return;
    }

    let active = true;

    const timeoutId = setTimeout(async () => {
      try {
        const terms = await search(trimmed);
        if (active) {
          setResults(terms);
          setSearchFailed(false);
        }
      } catch {
        if (active) {
          setResults([]);
          setSearchFailed(true);
        }
      } finally {
        if (active) setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [value, isOpen, search]);

  const handleSelect = (term: MedicalTerm) => {
    setIsOpen(false);
    setResults([]);
    onSelect(term);
  };

  const syncSearchingState = (text: string) => {
    if (text.trim().length >= MIN_QUERY_LENGTH) {
      setIsSearching(true);
    } else {
      setIsSearching(false);
      setResults([]);
    }
  };

  return (
    <View>
      <TextInput
        value={value}
        onChangeText={(text) => {
          onChangeText(text);
          setIsOpen(true);
          syncSearchingState(text);
        }}
        onFocus={() => {
          setIsOpen(true);
          syncSearchingState(value);
        }}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected },
        ]}
      />

      {isOpen && value.trim().length >= MIN_QUERY_LENGTH && (
        <View style={[styles.dropdown, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
          {isSearching && (
            <ActivityIndicator style={styles.loader} color={theme.primary} />
          )}

          {!isSearching && searchFailed && (
            <Text style={[styles.emptyText, { color: theme.danger }]}>
              Search unavailable right now — you can still enter this manually.
            </Text>
          )}

          {!isSearching && !searchFailed && results.length === 0 && (
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No matches — you can still enter this manually.
            </Text>
          )}

          {!isSearching &&
            results.map((term) => (
              <TouchableOpacity
                key={term.id}
                style={[styles.resultRow, { borderBottomColor: theme.backgroundSelected }]}
                onPress={() => handleSelect(term)}
              >
                <Text style={[styles.resultText, { color: theme.text }]}>{term.name}</Text>
              </TouchableOpacity>
            ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
  },
  dropdown: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#173E2A',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  loader: {
    paddingVertical: Spacing.three,
  },
  emptyText: {
    fontSize: 13,
    padding: Spacing.three,
  },
  resultRow: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  resultText: {
    fontSize: 15,
  },
});

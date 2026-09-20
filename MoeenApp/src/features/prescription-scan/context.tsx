import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import type {
  PrescriptionMedicationDraft,
  PrescriptionScanDraft,
} from "./types";

type PrescriptionDraftContextValue = {
  draft: PrescriptionScanDraft | null;
  setDraft: (draft: PrescriptionScanDraft | null) => void;
  addedItemIndexes: number[];
  markItemAdded: (index: number) => void;
  // Persists the values the user edited on the review/edit screen so the
  // confirmation submits exactly what was reviewed.
  updateItem: (index: number, item: PrescriptionMedicationDraft) => void;
  // Removes a medication the user does not want to add.
  removeItem: (index: number) => void;
};

const PrescriptionDraftContext =
  createContext<PrescriptionDraftContextValue | null>(null);

export function PrescriptionDraftProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [draft, setDraftState] = useState<PrescriptionScanDraft | null>(null);

  const [addedItemIndexes, setAddedItemIndexes] = useState<number[]>([]);

  const setDraft = useCallback((nextDraft: PrescriptionScanDraft | null) => {
    setDraftState(nextDraft);
    setAddedItemIndexes([]);
  }, []);

  const markItemAdded = useCallback((index: number) => {
    setAddedItemIndexes((current) =>
      current.includes(index) ? current : [...current, index],
    );
  }, []);

  const updateItem = useCallback(
    (index: number, item: PrescriptionMedicationDraft) => {
      setDraftState((current) => {
        if (!current || index < 0 || index >= current.items.length) {
          return current;
        }

        const items = [...current.items];
        items[index] = item;

        return { ...current, items };
      });
    },
    [],
  );

  const removeItem = useCallback((index: number) => {
    setDraftState((current) => {
      if (!current || index < 0 || index >= current.items.length) {
        return current;
      }

      return {
        ...current,
        items: current.items.filter((_, itemIndex) => itemIndex !== index),
      };
    });

    // Indexes shift once an item is removed, so keep the "added" markers
    // pointing at the same medications.
    setAddedItemIndexes((current) =>
      current
        .filter((addedIndex) => addedIndex !== index)
        .map((addedIndex) =>
          addedIndex > index ? addedIndex - 1 : addedIndex,
        ),
    );
  }, []);

  const value = useMemo(
    () => ({
      draft,
      setDraft,
      addedItemIndexes,
      markItemAdded,
      updateItem,
      removeItem,
    }),
    [draft, setDraft, addedItemIndexes, markItemAdded, updateItem, removeItem],
  );

  return (
    <PrescriptionDraftContext.Provider value={value}>
      {children}
    </PrescriptionDraftContext.Provider>
  );
}

export function usePrescriptionDraft() {
  const context = useContext(PrescriptionDraftContext);

  if (!context) {
    throw new Error(
      "usePrescriptionDraft must be used within PrescriptionDraftProvider",
    );
  }

  return context;
}

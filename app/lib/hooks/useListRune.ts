import { create } from "zustand";

import { ValidAddressRuneAssetWithList } from "../types/rune";

interface ListRuneState {
  selectedRune?: ValidAddressRuneAssetWithList;
  sameRunes: ValidAddressRuneAssetWithList[];
  action: string;
  setSelectedRune: (rune?: ValidAddressRuneAssetWithList) => void;
  setSameRunes: (runes: ValidAddressRuneAssetWithList[]) => void;
  setAction: (action: string) => void;
}

export const useListRune = create<ListRuneState>((set) => ({
  selectedRune: undefined,
  sameRunes: [],
  action: "list",
  setSelectedRune: (rune) => set({ selectedRune: rune }),
  setSameRunes: (runes) => set({ sameRunes: runes }),
  setAction: (action) => set({ action }),
}));

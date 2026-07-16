export type SGDBAssetType = 'grid_p' | 'grid_l' | 'hero' | 'logo' | 'icon';

// SteamGridDB records ----------------------------------------------------

export type SGDBAsset = {
  id: number;
  url: string;
  thumb: string;
  width: number;
  height: number;
  author?: {
    name?: string;
  };
  nsfw?: boolean;
  humor?: boolean;
  epilepsy?: boolean;
};

// Browser state ----------------------------------------------------------

export type AssetState = Record<SGDBAssetType, SGDBAsset[]>;
export type PageState = Record<SGDBAssetType, number>;
export type LoadingState = Record<SGDBAssetType, boolean>;
export type EndState = Record<SGDBAssetType, boolean>;
export type ErrorState = Record<SGDBAssetType, string | null>;

export type FilterState = {
  static: boolean;
  animated: boolean;
  adult: boolean;
  humor: boolean;
  epilepsy: boolean;
};

// Account collections ---------------------------------------------------

export type SGDBCollection = {
  id: number;
  name: string;
};

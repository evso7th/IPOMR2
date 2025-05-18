
export interface PlayerState {
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  isOnGround: boolean;
  isMovingLeft: boolean;
  isMovingRight: boolean;
  color: string;
  image?: HTMLImageElement;
}

export interface CoinState {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isCollected: boolean;
  // image?: HTMLImageElement; // Optional: if each coin can have a different image
}

export type TilePositioningAnchor =
  | 'top-left' | 'top-center' | 'top-right'
  | 'center-left' | 'center' | 'center-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface TilePositioning {
  anchor: TilePositioningAnchor;
  xOffsetPx?: number; // Pixel offset from anchor point (or 0 if omitted)
  yOffsetPx?: number; // Pixel offset from anchor point (or 0 if omitted)
}

// Tile definition with absolute, calculated values, used in the game loop
export interface Tile {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: number;
  color: string;
  vx?: number;
  direction?: number;
}

// Raw tile definition as it comes from JSON
export interface RawTileData {
  id?: string;
  width: number | string; // e.g., 150 or "80%"
  height: number | string; // e.g., 16 or "20px"
  type: number;
  color: string;
  vx?: number;
  direction?: number;
  positioning: TilePositioning;
}

export interface RawPlayerStart {
  platformId: string; // ID of the tile the player starts on
  horizontalAlign: 'left' | 'center' | 'right'; // Alignment on the platform
  xOffsetPx?: number; // Optional pixel offset from the alignment point
  yOffsetPx?: number; // Optional vertical offset from top of platform (default 0)
}

// Structure of the JSON level file
export interface RawLevelData {
  playerStart: RawPlayerStart;
  tiles: RawTileData[];
}

// Processed level data, ready for the game engine
export interface ProcessedLevelData {
  playerStart: { xPx: number; yPx: number }; // Absolute pixel coordinates
  tiles: Tile[]; // Tiles with absolute coordinates and dimensions
  coins: CoinState[]; // Added coins
}

export type GameAction = 'moveLeft' | 'moveRight' | 'jump' | 'stopMoveLeft' | 'stopMoveRight';

// Generic rectangle interface for collision detection
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

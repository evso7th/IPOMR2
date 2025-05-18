import type { LevelData, Tile } from '@/types/game';
import { TILE_COLOR_GROUND, TILE_COLOR_EMPTY } from '@/config/gameConfig';

interface RawLevelData {
  tileWidth: number;
  tileHeight: number;
  layout: number[][];
  playerStart: { xTile: number; yTile: number };
}

export async function loadLevel(levelPath: string): Promise<LevelData | null> {
  try {
    const response = await fetch(levelPath);
    if (!response.ok) {
      console.error(`Failed to load level: ${response.statusText}`);
      return null;
    }
    const rawData: RawLevelData = await response.json();

    const tiles: Tile[] = [];
    rawData.layout.forEach((row, y) => {
      row.forEach((tileType, x) => {
        if (tileType === 1) { // Solid tile
          tiles.push({
            x: x * rawData.tileWidth,
            y: y * rawData.tileHeight,
            width: rawData.tileWidth,
            height: rawData.tileHeight,
            type: 1,
            color: TILE_COLOR_GROUND,
          });
        }
      });
    });
    
    return {
      ...rawData,
      tiles,
    };
  } catch (error) {
    console.error('Error loading or parsing level:', error);
    return null;
  }
}

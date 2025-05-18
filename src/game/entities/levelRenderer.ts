
import type { LevelData, Tile } from '@/types/game';

export const renderLevel = (
  ctx: CanvasRenderingContext2D,
  currentLevel: LevelData,
  tileImage: HTMLImageElement | null
): void => {
  currentLevel.tiles.forEach(tile => {
     if (tileImage?.complete && tile.type === 1) {
       ctx.drawImage(tileImage, tile.x, tile.y, tile.width, tile.height);
     } else {
       ctx.fillStyle = tile.color;
       ctx.fillRect(tile.x, tile.y, tile.width, tile.height);
     }
  });
};


import type { PlayerState } from '@/types/game';

export const renderPlayer = (
  ctx: CanvasRenderingContext2D,
  player: PlayerState,
  playerImage: HTMLImageElement | null
): void => {
  if (playerImage?.complete && player.image === playerImage) {
    ctx.drawImage(playerImage, player.x, player.y, player.width, player.height);
  } else {
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, player.width, player.height);
  }
};

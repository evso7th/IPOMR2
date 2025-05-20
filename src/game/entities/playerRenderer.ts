
import type { PlayerState } from '@/types/game';

export const renderPlayer = (
  ctx: CanvasRenderingContext2D,
  player: PlayerState,
  playerImage: HTMLImageElement | null
): void => {
  ctx.save(); 

  if (playerImage?.complete && player.image === playerImage) {
    if (player.facingDirection === 'left') {
      ctx.translate(player.x + player.width, player.y); // Move origin to player's top-right corner
      ctx.scale(-1, 1);                             // Flip the context horizontally
      ctx.drawImage(playerImage, 0, 0, player.width, player.height); // Draw image at new (0,0) which is the translated top-right
    } else { // Facing right
      ctx.drawImage(playerImage, player.x, player.y, player.width, player.height); // Draw normally
    }
  } else { 
    // Fallback drawing (colored rectangle) - does not need flipping as it's symmetrical
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, player.width, player.height);
  }
  
  ctx.restore(); // Restore context to prevent transformations from affecting other drawings
};


import type { CoinState } from '@/types/game';
import { COIN_COLOR, COIN_SHADOW_COLOR, COIN_SHADOW_BLUR, COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y, COIN_SIZE } from '@/config/gameConfig';

// Helper to draw the coin (either image or fallback)
const drawCoinVisual = (
    ctx: CanvasRenderingContext2D,
    coin: CoinState,
    coinImage: HTMLImageElement | null,
    displayX: number,
    displayY: number,
    displayWidth: number,
    displayHeight: number
) => {
    if (coinImage?.complete && coinImage.naturalWidth > 0) {
        ctx.drawImage(coinImage, displayX, displayY, displayWidth, displayHeight);
    } else {
        // Fallback to drawing a simple circle if image not loaded
        ctx.beginPath();
        ctx.arc(
            coin.x + coin.width / 2, // Center X of the original coin position for fallback
            coin.y + coin.height / 2, // Center Y
            coin.width / 2,        // Radius
            0,
            Math.PI * 2
        );
        ctx.fillStyle = COIN_COLOR;
        ctx.fill();
    }
};

export const renderCoins = (
  ctx: CanvasRenderingContext2D,
  coins: CoinState[],
  coinImage: HTMLImageElement | null
): void => {
  // console.log(`[renderCoins] CALLED with ${coins.length} coins. First coin: ${coins.length > 0 ? coins[0].id : 'No coins'}`);
  
  coins.forEach((coin) => {
    // console.log(`[renderCoins] Processing coin: ${coin.id}, Collected: ${coin.isCollected}, Opacity: ${coin.currentOpacity}, VisuallyPresent: ${coin.isVisuallyPresent}, X: ${coin.x}, Y: ${coin.y}`);

    if (!coin.isCollected && coin.currentOpacity > 0 && coin.isVisuallyPresent) {
      // console.log(`[renderCoins] Drawing coin: ${coin.id}`);
      ctx.save();
      
      // Apply opacity for fade-in/out
      ctx.globalAlpha = coin.currentOpacity;

      // Shadow (only for the main coin, not particles)
      ctx.shadowColor = COIN_SHADOW_COLOR;
      ctx.shadowBlur = COIN_SHADOW_BLUR;
      ctx.shadowOffsetX = COIN_SHADOW_OFFSET_X;
      ctx.shadowOffsetY = COIN_SHADOW_OFFSET_Y;
      
      // Calculate scale for rotation effect (makes it look like it's spinning)
      // Math.cos goes from 1 (face on) to 0 (edge on) to -1 (face on, other side) to 0 (edge on)
      // We use Math.abs to keep scale positive, from 1 down to 0 and back up to 1.
      const scaleX = Math.abs(Math.cos(coin.rotationAngle));
      const displayWidth = coin.width * scaleX;
      const displayHeight = coin.height; // No vertical squashing for this simple rotation
      const displayX = coin.x + (coin.width - displayWidth) / 2; // Keep centered
      const displayY = coin.y;

      // Clipping path for circular coins (if using square images)
      ctx.beginPath();
      ctx.arc(
        coin.x + coin.width / 2, // Center X for clipping
        coin.y + coin.height / 2, // Center Y for clipping
        coin.width / 2,         // Radius for clipping
        0,
        Math.PI * 2
      );
      ctx.closePath();
      ctx.clip(); // Apply clipping path

      // Draw the coin (image or fallback)
      drawCoinVisual(ctx, coin, coinImage, displayX, displayY, displayWidth, displayHeight);
      
      ctx.restore(); // Restore context (removes clip, shadow, globalAlpha)
    }

    // Render particles if any
    if (coin.particles.length > 0) {
      coin.particles.forEach(particle => {
        ctx.save();
        ctx.globalAlpha = particle.opacity;
        ctx.fillStyle = COIN_COLOR; // Particles are simple colored squares
        ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
        ctx.restore();
      });
    }
  });
};

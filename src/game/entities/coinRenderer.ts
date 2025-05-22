
import type { CoinState } from '@/types/game';
import { 
  COIN_COLOR, 
  COIN_SIZE,
  COIN_SHADOW_OFFSET_X,
  COIN_SHADOW_OFFSET_Y,
  COIN_SHADOW_BLUR,
  COIN_SHADOW_COLOR 
} from '@/config/gameConfig';

// Helper to draw the fallback coin (e.g., if image fails to load or for diagnostics)
const drawFallbackCoin = (
  ctx: CanvasRenderingContext2D,
  coin: CoinState
) => {
  ctx.beginPath();
  ctx.arc(
    coin.x + coin.width / 2,
    coin.y + coin.height / 2,
    coin.width / 2, // Use coin.width / 2 as radius for a circle
    0,
    Math.PI * 2
  );
  ctx.fillStyle = COIN_COLOR; // Use gold for fallback
  ctx.fill();
  ctx.closePath();
};

export const renderCoins = (
  ctx: CanvasRenderingContext2D,
  coins: CoinState[],
  coinImage: HTMLImageElement | null
): void => {
  if (!coins || coins.length === 0) {
    return;
  }

  coins.forEach((coin) => {
    // Draw coin if it's not collected and visually present and has some opacity
    if (!coin.isCollected && coin.currentOpacity > 0 && coin.isVisuallyPresent) {
      ctx.save();
      ctx.globalAlpha = coin.currentOpacity;

      // Apply shadow
      ctx.shadowColor = COIN_SHADOW_COLOR;
      ctx.shadowBlur = COIN_SHADOW_BLUR;
      ctx.shadowOffsetX = COIN_SHADOW_OFFSET_X;
      ctx.shadowOffsetY = COIN_SHADOW_OFFSET_Y;
      
      // Center of the coin for clipping and drawing
      const coinCenterX = coin.x + coin.width / 2;
      const coinCenterY = coin.y + coin.height / 2;
      
      // For now, no rotation, draw as a static circle/image
      const scaleX = 1; // No horizontal scaling (no rotation effect)
      const currentDisplayWidth = coin.width * scaleX;
      const currentDisplayX = coin.x + (coin.width - currentDisplayWidth) / 2;


      if (coinImage && coinImage.complete && coinImage.naturalHeight !== 0) {
        // Create a circular clipping path
        ctx.beginPath();
        ctx.arc(coinCenterX, coinCenterY, coin.width / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        // Draw the image centered
        ctx.drawImage(
          coinImage,
          currentDisplayX, // Use currentDisplayX for proper centering if scaled
          coin.y,
          currentDisplayWidth, // Use currentDisplayWidth
          coin.height
        );
      } else {
        // Fallback drawing if image is not available
        // Ensure fallback also respects clipping if needed, but drawFallbackCoin already draws a circle
         drawFallbackCoin(ctx, coin);
      }
      ctx.restore(); // Restore to remove clipping mask, globalAlpha, and shadow settings
    }

    // Render particles if any
    if (coin.particles.length > 0) {
      coin.particles.forEach(particle => {
        ctx.save();
        ctx.globalAlpha = particle.opacity;
        ctx.fillStyle = COIN_COLOR; // Particles are simple colored squares/circles
        ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
        ctx.restore();
      });
    }
  });
};

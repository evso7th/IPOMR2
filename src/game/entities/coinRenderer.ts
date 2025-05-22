
import type { CoinState } from '@/types/game';
import { COIN_COLOR, COIN_SIZE } from '@/config/gameConfig';

// Helper to draw the fallback coin (e.g., if image fails to load or for diagnostics)
const drawFallbackCoin = (
  ctx: CanvasRenderingContext2D,
  coin: CoinState
) => {
  ctx.beginPath();
  ctx.arc(
    coin.x + coin.width / 2,
    coin.y + coin.height / 2,
    coin.width / 2,
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
  coins.forEach((coin) => {
    if (!coin.isCollected && coin.currentOpacity > 0 && coin.isVisuallyPresent) {
      ctx.save();
      ctx.globalAlpha = coin.currentOpacity;

      // Center of the coin for clipping and drawing
      const coinCenterX = coin.x + coin.width / 2;
      const coinCenterY = coin.y + coin.height / 2;

      if (coinImage && coinImage.complete && coinImage.naturalHeight !== 0) {
        // Create a circular clipping path
        ctx.beginPath();
        ctx.arc(coinCenterX, coinCenterY, coin.width / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        // Draw the image centered
        ctx.drawImage(
          coinImage,
          coin.x,
          coin.y,
          coin.width,
          coin.height
        );
      } else {
        // Fallback drawing if image is not available
        drawFallbackCoin(ctx, coin);
      }
      ctx.restore(); // Restore to remove clipping mask and globalAlpha
    }

    // Render particles if any
    if (coin.particles.length > 0) {
      coin.particles.forEach(particle => {
        ctx.save();
        ctx.globalAlpha = particle.opacity;
        ctx.fillStyle = COIN_COLOR; // Particles are simple colored squares/circles
        ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
        // Or for circular particles:
        // ctx.beginPath();
        // ctx.arc(particle.x, particle.y, particle.size / 2, 0, Math.PI * 2);
        // ctx.fill();
        // ctx.closePath();
        ctx.restore();
      });
    }
  });
};

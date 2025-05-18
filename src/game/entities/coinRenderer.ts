
import type { CoinState, Particle } from '@/types/game';
import { COIN_COLOR, COIN_SIZE } from '@/config/gameConfig';

export const renderCoins = (
  ctx: CanvasRenderingContext2D,
  coins: CoinState[],
  coinImage: HTMLImageElement | null
): void => {
  coins.forEach(coin => {
    ctx.save(); // Save context state for this coin (handles opacity, clipping, etc.)

    // Render particles if they exist
    if (coin.particles.length > 0) {
      coin.particles.forEach(particle => {
        ctx.globalAlpha = particle.opacity;
        // For simplicity, drawing particles as squares. Could be circles.
        ctx.fillStyle = COIN_COLOR; // Or a particle-specific color
        ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
      });
    } 
    // Else, if not collected and opacity > 0 (for fade-in or normal display)
    else if (!coin.isCollected && coin.currentOpacity > 0) {
      ctx.globalAlpha = coin.currentOpacity;
      
      if (coinImage?.complete && coinImage.src) {
        try {
          // Apply circular clipping mask
          ctx.save(); // Save context specifically for clipping the image
          ctx.beginPath();
          ctx.arc(
            coin.x + coin.width / 2, 
            coin.y + coin.height / 2, 
            coin.width / 2, // Radius
            0, 
            Math.PI * 2
          );
          ctx.closePath();
          ctx.clip();
          
          // Draw the image, which will be clipped to the circle
          ctx.drawImage(coinImage, coin.x, coin.y, coin.width, coin.height);
          
          ctx.restore(); // Restore context to remove the clipping mask for subsequent draws

        } catch (e) {
          console.warn("Failed to draw coin image, falling back to color", e);
          drawFallbackCoin(ctx, coin); // Fallback already draws a circle
        }
      } else {
        // Image not available or not loaded, use fallback
        drawFallbackCoin(ctx, coin); // Fallback already draws a circle
      }
    }
    
    ctx.restore(); // Restore context state changed for this coin
  });
};

function drawFallbackCoin(ctx: CanvasRenderingContext2D, coin: CoinState) {
  // This function is now only called when the coin itself is visible (not particles)
  // and the image failed or is not yet loaded. The globalAlpha is already set by the caller.
  ctx.fillStyle = COIN_COLOR;
  ctx.beginPath();
  ctx.arc(
    coin.x + coin.width / 2,
    coin.y + coin.height / 2,
    coin.width / 2, 
    0,
    Math.PI * 2
  );
  ctx.fill();
}



import type { CoinState } from '@/types/game';
import { COIN_COLOR, COIN_SHADOW_COLOR, COIN_SHADOW_BLUR, COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y } from '@/config/gameConfig';

export const renderCoins = (
  ctx: CanvasRenderingContext2D,
  coins: CoinState[],
  coinImage: HTMLImageElement | null
): void => {
  coins.forEach(coin => {
    ctx.save(); // Save context state for this coin (handles opacity, clipping, shadows etc.)

    if (coin.particles.length > 0) {
      // Render particles (these won't have the coin's shadow unless specifically set)
      coin.particles.forEach(particle => {
        ctx.globalAlpha = particle.opacity;
        ctx.fillStyle = COIN_COLOR; 
        ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
      });
    } else if (!coin.isCollected && coin.currentOpacity > 0) {
      ctx.globalAlpha = coin.currentOpacity;

      // Calculate scaled width for rotation effect
      // Math.cos(angle) goes from 1 to -1. abs() makes it 0 to 1.
      // This will make the coin shrink to 0 width when edge-on.
      const scaleX = Math.abs(Math.cos(coin.rotationAngle));
      const currentDisplayWidth = coin.width * scaleX;
      // Adjust x to keep the coin centered as it scales
      const currentDisplayX = coin.x + (coin.width - currentDisplayWidth) / 2;

      // Apply shadow before drawing the coin itself
      ctx.shadowColor = COIN_SHADOW_COLOR;
      ctx.shadowBlur = COIN_SHADOW_BLUR;
      ctx.shadowOffsetX = COIN_SHADOW_OFFSET_X;
      ctx.shadowOffsetY = COIN_SHADOW_OFFSET_Y;
      
      if (coinImage?.complete && coinImage.src) {
        try {
          // Apply circular clipping mask
          ctx.save(); 
          ctx.beginPath();
          ctx.arc(
            coin.x + coin.width / 2, 
            coin.y + coin.height / 2, 
            coin.width / 2, 
            0, 
            Math.PI * 2
          );
          ctx.closePath();
          ctx.clip();
          
          // Draw the image, scaled horizontally for rotation, which will be clipped to the circle
          ctx.drawImage(coinImage, currentDisplayX, coin.y, currentDisplayWidth, coin.height);
          
          ctx.restore(); 

        } catch (e) {
          console.warn("Failed to draw coin image, falling back to color", e);
          // Fallback coin drawing (will also be affected by shadow if set before fillStyle)
          // For simplicity, fallback will not "rotate" but will be clipped.
          drawFallbackCoin(ctx, coin); 
        }
      } else {
        // Fallback coin drawing
        drawFallbackCoin(ctx, coin);
      }
    }
    
    ctx.restore(); // Restore context state (clears shadow, globalAlpha for the next coin/element)
  });
};

function drawFallbackCoin(ctx: CanvasRenderingContext2D, coin: CoinState) {
  // This function is now only called when the coin itself is visible (not particles)
  // and the image failed or is not yet loaded. The globalAlpha and shadow are set by the caller.
  // The clipping is also handled by the caller.
  ctx.fillStyle = COIN_COLOR; // Shadow should be set before this if fallback needs shadow
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


import type { CoinState } from '@/types/game';
import { COIN_COLOR, COIN_SHADOW_COLOR, COIN_SHADOW_BLUR, COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y, COIN_SIZE } from '@/config/gameConfig';

export const renderCoins = (
  ctx: CanvasRenderingContext2D,
  coins: CoinState[],
  coinImage: HTMLImageElement | null // coinImage will be effectively ignored for this temporary change
): void => {
  if (!coins || coins.length === 0) {
    return;
  }
  
  coins.forEach((coin) => {
    ctx.save(); 

    if (coin.particles && coin.particles.length > 0) {
      coin.particles.forEach(particle => {
        ctx.globalAlpha = particle.opacity;
        ctx.fillStyle = COIN_COLOR; 
        ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
      });
    } else if (!coin.isCollected && coin.currentOpacity > 0 && coin.isVisuallyPresent) { 
        // Shadow
        ctx.shadowColor = COIN_SHADOW_COLOR;
        ctx.shadowBlur = COIN_SHADOW_BLUR;
        ctx.shadowOffsetX = COIN_SHADOW_OFFSET_X;
        ctx.shadowOffsetY = COIN_SHADOW_OFFSET_Y;
        
        // Calculate horizontal scale for rotation effect
        const scaleX = Math.abs(Math.cos(coin.rotationAngle));
        
        ctx.globalAlpha = coin.currentOpacity;

        // Translate to the coin's center, apply scale, then draw the circle
        ctx.translate(coin.x + coin.width / 2, coin.y + coin.height / 2);
        ctx.scale(scaleX, 1); // Apply horizontal scale for rotation (squash/stretch)
        
        ctx.beginPath();
        // Draw a circle at the new origin (0,0) with radius based on original coin width
        ctx.arc(0, 0, coin.width / 2, 0, Math.PI * 2, true); 
        ctx.fillStyle = COIN_COLOR; // COIN_COLOR is 'gold'
        ctx.fill();
        ctx.closePath(); // Though not strictly necessary for a filled shape
    }
    
    ctx.restore(); // Restore context to remove transformations (translate, scale) and shadow settings
  });
};

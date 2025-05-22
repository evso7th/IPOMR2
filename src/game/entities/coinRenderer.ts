
import type { CoinState } from '@/types/game';
import { COIN_COLOR, COIN_SHADOW_COLOR, COIN_SHADOW_BLUR, COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y, COIN_SIZE } from '@/config/gameConfig';

export const renderCoins = (
  ctx: CanvasRenderingContext2D,
  coins: CoinState[],
  coinImage: HTMLImageElement | null
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
        
        // Rotation effect (squash and stretch)
        const scaleX = Math.abs(Math.cos(coin.rotationAngle));
        const displayWidth = coin.width * scaleX;
        const displayX = coin.x + (coin.width - displayWidth) / 2; // Keep centered

        ctx.globalAlpha = coin.currentOpacity;

        if (coinImage?.complete) {
          ctx.beginPath();
          ctx.arc(coin.x + coin.width / 2, coin.y + coin.height / 2, coin.width / 2, 0, Math.PI * 2, true);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(coinImage, displayX, coin.y, displayWidth, coin.height);
        } else {
          // Fallback drawing (simple circle)
          ctx.beginPath();
          ctx.arc(coin.x + coin.width / 2, coin.y + coin.height / 2, coin.width / 2, 0, Math.PI * 2);
          ctx.fillStyle = COIN_COLOR;
          ctx.fill();
          ctx.closePath();
        }
    }
    
    ctx.restore(); 
  });
};

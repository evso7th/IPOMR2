
import type { CoinState } from '@/types/game';
import { COIN_COLOR } from '@/config/gameConfig';

export const renderCoins = (
  ctx: CanvasRenderingContext2D,
  coins: CoinState[],
  coinImage: HTMLImageElement | null
): void => {
  coins.forEach(coin => {
    if (!coin.isCollected) {
      if (coinImage?.complete && coinImage.src) { // Check if image is loaded and has a src
        try {
          ctx.drawImage(coinImage, coin.x, coin.y, coin.width, coin.height);
        } catch (e) {
          // Fallback if drawImage fails (e.g. image not fully decoded, though 'complete' should cover this)
          console.warn("Failed to draw coin image, falling back to color", e);
          drawFallbackCoin(ctx, coin);
        }
      } else {
        // Fallback to drawing a colored circle or square
        drawFallbackCoin(ctx, coin);
      }
    }
  });
};

function drawFallbackCoin(ctx: CanvasRenderingContext2D, coin: CoinState) {
  ctx.fillStyle = COIN_COLOR;
  // Simple circle for coin
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

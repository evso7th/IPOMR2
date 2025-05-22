
import type { CoinState } from '@/types/game';
// import { COIN_COLOR, COIN_SHADOW_COLOR, COIN_SHADOW_BLUR, COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y, COIN_SIZE } from '@/config/gameConfig';

export const renderCoins = (
  ctx: CanvasRenderingContext2D,
  coins: CoinState[],
  coinImage: HTMLImageElement | null
): void => {
  // console.log(`[renderCoins] CALLED with ${coins.length} coins. First coin: ${coins.length > 0 ? JSON.stringify(coins[0]) : 'No coins'}`);
  if (!coins || coins.length === 0) {
    return;
  }
  
  // Simplified rendering for debugging
  // coins.forEach((coin) => {
  //   if (!coin.isCollected && coin.currentOpacity > 0.5 && coin.isVisuallyPresent) {
  //     console.log(`[renderCoins] SIMPLIFIED - Drawing diagnostic coin: ${coin.id} at X:${coin.x.toFixed(0)}, Y:${coin.y.toFixed(0)}`);
  //     ctx.fillStyle = 'yellow';
  //     ctx.fillRect(coin.x, coin.y, coin.width, coin.height);
  //     ctx.strokeStyle = 'orange';
  //     ctx.lineWidth = 1;
  //     ctx.strokeRect(coin.x, coin.y, coin.width, coin.height);
  //   }
  // });
};

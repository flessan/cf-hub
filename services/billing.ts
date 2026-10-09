import { Platform } from 'react-native';

let initialized = false;
let billingReady = false;

/** Whether Google Play billing initialized and can process purchases. */
export function isBillingAvailable(): boolean {
  return billingReady;
}

function iap() {
  return require('react-native-iap');
}

/**
 * Initialize billing once and route AI subscription purchases to the
 * subscription service. Advertising and its purchase product are not used.
 */
export async function initBilling(): Promise<void> {
  if (initialized || Platform.OS === 'web') return;
  initialized = true;

  try {
    await iap().initConnection();
    billingReady = true;

    iap().purchaseUpdatedListener(async (purchase: any) => {
      const ids = [purchase?.productId, ...(purchase?.productIds ?? [])];
      if (!ids.includes('cfmobile_ai_monthly')) return;

      const { handlePurchase } = require('./ai-subscription');
      await handlePurchase(purchase);
    });
  } catch {
    // Billing may be unavailable on emulators or devices without Play Services.
  }
}

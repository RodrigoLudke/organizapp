import { Platform } from "react-native";
import {
  AppOpenAd,
  AdEventType,
  TestIds,
} from "react-native-google-mobile-ads";
import { getSetting, setSetting } from "@/db/database";

// ─── Frequency cap constants ──────────────────────────────────────────────────
const MIN_OPENS_BEFORE_AD = 2;       // Skip ad on first N cold starts
const MIN_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours between shown ads

// ─── Ad unit ─────────────────────────────────────────────────────────────────
const adUnitId = __DEV__
  ? TestIds.APP_OPEN
  : Platform.select({
      android: "ca-app-pub-8902611713444491/3001983063",
      ios: "ca-app-pub-8902611713444491/8746456306",
    })!;

// ─── Frequency cap ────────────────────────────────────────────────────────────

/** Increments the cold-start counter. Call once per boot, before shouldShowAppOpenAd. */
export async function incrementAppOpenCount(): Promise<void> {
  const raw = await getSetting("app_open_count");
  const count = raw ? parseInt(raw, 10) : 0;
  await setSetting("app_open_count", String(count + 1));
}

/** Returns true if the ad should be shown this session. In __DEV__, always true. */
export async function shouldShowAppOpenAd(): Promise<boolean> {
  if (__DEV__) return true;

  const countRaw = await getSetting("app_open_count");
  const count = countRaw ? parseInt(countRaw, 10) : 0;
  if (count <= MIN_OPENS_BEFORE_AD) return false;

  const lastShownRaw = await getSetting("ad_last_open_shown");
  if (lastShownRaw) {
    const elapsed = Date.now() - parseInt(lastShownRaw, 10);
    if (elapsed < MIN_INTERVAL_MS) return false;
  }

  return true;
}

/** Records that an ad was just shown. Call immediately after showAppOpenAd resolves. */
export async function recordAdShown(): Promise<void> {
  await setSetting("ad_last_open_shown", String(Date.now()));
}

// ─── Show ad ──────────────────────────────────────────────────────────────────

/**
 * Loads and shows an App Open Ad.
 * Always resolves (never rejects) — any failure is swallowed so the boot flow
 * is never blocked. Respects timeoutMs as a hard upper bound.
 */
export function showAppOpenAd(timeoutMs = 5000): Promise<void> {
  return new Promise<void>((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      resolve();
    };

    const timer = setTimeout(finish, timeoutMs);

    let ad: AppOpenAd | null = null;
    try {
      ad = AppOpenAd.createForAdRequest(adUnitId, {
        requestNonPersonalizedAdsOnly: true,
      });

      ad.addAdEventListener(AdEventType.LOADED, () => {
        try {
          ad?.show();
        } catch {
          clearTimeout(timer);
          finish();
        }
      });

      ad.addAdEventListener(AdEventType.CLOSED, () => {
        clearTimeout(timer);
        finish();
      });

      ad.addAdEventListener(AdEventType.ERROR, () => {
        clearTimeout(timer);
        finish();
      });

      ad.load();
    } catch {
      clearTimeout(timer);
      finish();
    }
  });
}

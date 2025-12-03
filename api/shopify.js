// shopify.js
import { shopifyApi, ApiVersion } from "@shopify/shopify-api";

export const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  apiVersion: ApiVersion.July24,
  isCustomStoreApp: true,
  scopes: (process.env.SHOPIFY_SCOPES || "").split(","),
  hostName: process.env.SHOPIFY_APP_URL.replace("https://", ""),
});

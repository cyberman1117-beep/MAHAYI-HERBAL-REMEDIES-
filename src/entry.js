import originalWorker from "./index.js";
import { handleCategoryApi } from "./category-api.js";
import { handleShippingApi } from "./shipping-api.js";
import { handleCustomerProfile } from "./customer-profile-api.js";
import { handleAdminCustomers } from "./admin-customers-api.js";
import { handleAdminOrders } from "./admin-orders-api.js";
import { handleCustomerOrders } from "./customer-orders-api.js";
import { handlePaymentApi } from "./payment-api.js";
import { handlePaymentSettings } from "./payment-settings-api.js";
import { handleCustomerCommunications, handleAdminCommunications } from "./communication-api.js";
import { handleContentPages } from "./content-pages-api.js";
import { handleSeoSettings } from "./seo-settings-api.js";
export default { async fetch(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname === "/api/categories") return handleCategoryApi(request, env, originalWorker);
  if (url.pathname === "/api/shipping" || url.pathname === "/api/product-shipping") return handleShippingApi(request, env, originalWorker);
  if (url.pathname === "/api/customer-profile") return handleCustomerProfile(request, env);
  if (url.pathname === "/api/admin-customers") return handleAdminCustomers(request, env);
  if (url.pathname === "/api/admin-orders") return handleAdminOrders(request, env);
  if (url.pathname === "/api/customer-orders") return handleCustomerOrders(request, env);
  if (url.pathname === "/api/payment-settings") return handlePaymentSettings(request, env);
  if (url.pathname === "/api/customer-communications") return handleCustomerCommunications(request, env);
  if (url.pathname === "/api/admin-communications") return handleAdminCommunications(request, env);
  if (url.pathname === "/api/content-pages") return handleContentPages(request, env);
  if (url.pathname === "/api/seo-settings") return handleSeoSettings(request, env);
  if (url.pathname === "/api/product-groups" && request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type"
      }
    });
  }
  if (url.pathname.startsWith("/api/payment/")) return handlePaymentApi(request, env);
  return originalWorker.fetch(request, env, ctx);
} };
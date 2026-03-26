/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as addresses from "../addresses.js";
import type * as admin_resetConversations from "../admin/resetConversations.js";
import type * as catalog from "../catalog.js";
import type * as cleanup from "../cleanup.js";
import type * as conversation_handleMessage from "../conversation/handleMessage.js";
import type * as events from "../events.js";
import type * as http from "../http.js";
import type * as leads from "../leads.js";
import type * as lib_ai from "../lib/ai.js";
import type * as lib_conversationSignals from "../lib/conversationSignals.js";
import type * as lib_email from "../lib/email.js";
import type * as lib_messages from "../lib/messages.js";
import type * as lib_orderUtils from "../lib/orderUtils.js";
import type * as lib_smartMessages from "../lib/smartMessages.js";
import type * as lib_types from "../lib/types.js";
import type * as lib_validation from "../lib/validation.js";
import type * as orders from "../orders.js";
import type * as payments from "../payments.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  addresses: typeof addresses;
  "admin/resetConversations": typeof admin_resetConversations;
  catalog: typeof catalog;
  cleanup: typeof cleanup;
  "conversation/handleMessage": typeof conversation_handleMessage;
  events: typeof events;
  http: typeof http;
  leads: typeof leads;
  "lib/ai": typeof lib_ai;
  "lib/conversationSignals": typeof lib_conversationSignals;
  "lib/email": typeof lib_email;
  "lib/messages": typeof lib_messages;
  "lib/orderUtils": typeof lib_orderUtils;
  "lib/smartMessages": typeof lib_smartMessages;
  "lib/types": typeof lib_types;
  "lib/validation": typeof lib_validation;
  orders: typeof orders;
  payments: typeof payments;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

import type { BunRequest, SQL } from "bun";
import type { Auth } from "../auth/auth";
import { addItem, clearCheckedItems, editItem, removeItem, setItemChecked, uncheckAllItems } from "../items/items";
import { createList, deleteList, listListsFor, readList, renameList } from "../lists/lists";
import {
  clearCheckedItemsSchema,
  createItemSchema,
  createListSchema,
  setItemCheckedSchema,
  uncheckAllItemsSchema,
  updateItemSchema,
  updateListSchema,
} from "../lib/schemas";
import { map, ok, type Result } from "../lib/result";
import type { AppError } from "../lib/errors";
import { parseBody, parseId, respond } from "./http";
import { requireAccount } from "./session";

/**
 * Route handlers parse input, call one domain function and map its `Result` to a response, and
 * nothing else (CONVENTIONS.md, "Where logic lives"). No handler reads a Role or decides who may
 * do what: that lives behind `can()` in the domain layer (ADR-0005).
 */
export type ApiDeps = { sql: SQL; auth: Auth };

export function apiRoutes({ sql, auth }: ApiDeps) {
  return {
    "/api/lists": {
      GET: async (req: BunRequest<"/api/lists">) => {
        const actor = await requireAccount(req, auth);
        if (!actor.ok) return respond(actor);

        const lists = await listListsFor(sql, actor.value);
        return respond(map(lists, (value) => ({ lists: value })));
      },

      POST: async (req: BunRequest<"/api/lists">) => {
        const actor = await requireAccount(req, auth);
        if (!actor.ok) return respond(actor);
        const input = await parseBody(req, createListSchema);
        if (!input.ok) return respond(input);

        return respond(await createList(sql, actor.value, input.value), 201);
      },
    },

    "/api/lists/:listId": {
      GET: async (req: BunRequest<"/api/lists/:listId">) => {
        const actor = await requireAccount(req, auth);
        if (!actor.ok) return respond(actor);
        const listId = parseId(req.params.listId, "listId");
        if (!listId.ok) return respond(listId);

        return respond(await readList(sql, actor.value, listId.value));
      },

      PATCH: async (req: BunRequest<"/api/lists/:listId">) => {
        const actor = await requireAccount(req, auth);
        if (!actor.ok) return respond(actor);
        const listId = parseId(req.params.listId, "listId");
        if (!listId.ok) return respond(listId);
        const input = await parseBody(req, updateListSchema);
        if (!input.ok) return respond(input);

        return respond(await renameList(sql, actor.value, listId.value, input.value));
      },

      DELETE: async (req: BunRequest<"/api/lists/:listId">) => {
        const actor = await requireAccount(req, auth);
        if (!actor.ok) return respond(actor);
        const listId = parseId(req.params.listId, "listId");
        if (!listId.ok) return respond(listId);

        return respond(await deleteList(sql, actor.value, listId.value));
      },
    },

    "/api/lists/:listId/items": {
      POST: async (req: BunRequest<"/api/lists/:listId/items">) => {
        const actor = await requireAccount(req, auth);
        if (!actor.ok) return respond(actor);
        const listId = parseId(req.params.listId, "listId");
        if (!listId.ok) return respond(listId);
        const input = await parseBody(req, createItemSchema);
        if (!input.ok) return respond(input);

        return respond(await addItem(sql, actor.value, listId.value, input.value), 201);
      },
    },

    "/api/lists/:listId/items/:itemId": {
      PATCH: async (req: BunRequest<"/api/lists/:listId/items/:itemId">) => {
        const actor = await requireAccount(req, auth);
        if (!actor.ok) return respond(actor);
        const ids = parseItemPath(req.params);
        if (!ids.ok) return respond(ids);
        const input = await parseBody(req, updateItemSchema);
        if (!input.ok) return respond(input);

        return respond(await editItem(sql, actor.value, ids.value.listId, ids.value.itemId, input.value));
      },

      DELETE: async (req: BunRequest<"/api/lists/:listId/items/:itemId">) => {
        const actor = await requireAccount(req, auth);
        if (!actor.ok) return respond(actor);
        const ids = parseItemPath(req.params);
        if (!ids.ok) return respond(ids);

        return respond(await removeItem(sql, actor.value, ids.value.listId, ids.value.itemId));
      },
    },

    // Checking an Item is its own endpoint, so an edit behind save/cancel and an instant tick
    // never contend for the same payload.
    "/api/lists/:listId/items/:itemId/checked": {
      PUT: async (req: BunRequest<"/api/lists/:listId/items/:itemId/checked">) => {
        const actor = await requireAccount(req, auth);
        if (!actor.ok) return respond(actor);
        const ids = parseItemPath(req.params);
        if (!ids.ok) return respond(ids);
        const input = await parseBody(req, setItemCheckedSchema);
        if (!input.ok) return respond(input);

        return respond(await setItemChecked(sql, actor.value, ids.value.listId, ids.value.itemId, input.value));
      },
    },

    // The bulk actions hang off the List, not off `items`, because the action is the whole List
    // and takes no Items to act on.
    "/api/lists/:listId/clear-checked": {
      POST: async (req: BunRequest<"/api/lists/:listId/clear-checked">) => {
        const actor = await requireAccount(req, auth);
        if (!actor.ok) return respond(actor);
        const listId = parseId(req.params.listId, "listId");
        if (!listId.ok) return respond(listId);
        const input = await parseBody(req, clearCheckedItemsSchema);
        if (!input.ok) return respond(input);

        return respond(await clearCheckedItems(sql, actor.value, listId.value));
      },
    },

    "/api/lists/:listId/uncheck-all": {
      POST: async (req: BunRequest<"/api/lists/:listId/uncheck-all">) => {
        const actor = await requireAccount(req, auth);
        if (!actor.ok) return respond(actor);
        const listId = parseId(req.params.listId, "listId");
        if (!listId.ok) return respond(listId);
        const input = await parseBody(req, uncheckAllItemsSchema);
        if (!input.ok) return respond(input);

        return respond(await uncheckAllItems(sql, actor.value, listId.value));
      },
    },
  };
}

type ItemPath = { listId: string; itemId: string };

function parseItemPath(params: ItemPath): Result<ItemPath, AppError> {
  const listId = parseId(params.listId, "listId");
  if (!listId.ok) return listId;
  const itemId = parseId(params.itemId, "itemId");
  if (!itemId.ok) return itemId;

  return ok({ listId: listId.value, itemId: itemId.value });
}

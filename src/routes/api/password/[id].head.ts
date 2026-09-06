import { defineHandler, HTTPError } from "nitro";
import { getRouterParam } from "nitro/h3";
import { isShareId } from "~/utils/id";
import { useStore } from "~/plugins/storage";

export default defineHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id || !isShareId(id)) {
    throw new HTTPError({ status: 404 });
  }

  const exists = await useStore().hasEncryptedSecret(id);
  if (!exists) {
    throw new HTTPError({ status: 404 });
  }

  return new Response(null, { status: 204 });
});

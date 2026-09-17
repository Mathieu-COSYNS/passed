import { defineHandler, HTTPError } from "nitro";
import { getRouterParam } from "nitro/h3";
import { isShareId } from "~/utils/id";
import { useStore } from "~/plugins/storage";

export default defineHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id || !isShareId(id)) {
    throw new HTTPError({ status: 404 });
  }

  const viewed = await (await useStore()).viewEncryptedSecret(id);
  if (viewed == null) {
    throw new HTTPError({ status: 404 });
  }

  return Response.json(viewed.encryptedSecret, {
    headers: {
      "X-Remaining-Views": String(viewed.remainingViews),
      "X-Expires-In": String(viewed.expiresIn),
    },
  });
});

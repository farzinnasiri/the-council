import { httpRouter } from "convex/server";
import { auth } from "./auth";
import {
  getPublicRoundtable,
  optionsPublicRoundtable,
} from "./publicRoundtableHttp";

const http = httpRouter();

auth.addHttpRoutes(http);
http.route({
  pathPrefix: "/public/roundtables/",
  method: "OPTIONS",
  handler: optionsPublicRoundtable,
});
http.route({
  pathPrefix: "/public/roundtables/",
  method: "GET",
  handler: getPublicRoundtable,
});

export default http;

import { nextJsApiRouter } from "@connectrpc/connect-next";
import routes from "@/server/connect/routes";
import { validationInterceptor } from "@/server/connect/validation";

// Serves every ConnectRPC service under /api/<package>.<Service>/<Method>.
// Next only treats files under pages/api/** as API routes, so the catch-all
// lives here (the default /api prefix matches the file location). protovalidate
// runs on every request via the interceptor before handlers see the message.
const { handler, config } = nextJsApiRouter({
  routes,
  interceptors: [validationInterceptor],
});

export { handler as default, config };

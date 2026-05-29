import type { DescMessage, MessageShape } from "@bufbuild/protobuf";
import { createValidator } from "@bufbuild/protovalidate";
import { Code, ConnectError, type Interceptor } from "@connectrpc/connect";

// A single validator instance compiles and caches CEL programs per message
// type, so reuse it across all requests.
const validator = createValidator();

function assertValid<Desc extends DescMessage>(schema: Desc, message: MessageShape<Desc>): void {
  const result = validator.validate(schema, message);
  if (result.kind === "invalid") {
    // Surface the human-readable rule violations to the caller.
    throw new ConnectError(result.error.message, Code.InvalidArgument);
  }
  if (result.kind === "error") {
    // A rule failed to compile/evaluate — that's a server-side bug, not bad input.
    throw new ConnectError(`request validation failed: ${result.error.message}`, Code.Internal);
  }
}

/**
 * Server interceptor that enforces protovalidate (buf.validate) rules on every
 * inbound request message before it reaches a handler. Works for unary calls
 * and for the single request message of server-streaming calls.
 */
export const validationInterceptor: Interceptor = (next) => async (req) => {
  if (req.stream) {
    const source = req.message;
    const validated = (async function* () {
      for await (const message of source) {
        assertValid(req.method.input, message);
        yield message;
      }
    })();
    return next({ ...req, message: validated });
  }
  assertValid(req.method.input, req.message);
  return next(req);
};

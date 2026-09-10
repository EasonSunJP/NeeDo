import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import request from "supertest";
import {
  createContentImageBodyErrorHandler,
  createContentImageBodyParser
} from "../src/middlewares/content-image-upload.middleware";
import type { AppError } from "../src/utils/app-error";

const createFixture = () => {
  const app = express();
  const respondNoContent: RequestHandler = (_request, response) => response.status(204).end();
  app.post(
    "/image",
    createContentImageBodyParser(),
    createContentImageBodyErrorHandler({
      invalid: "error.fixture.image_invalid",
      tooLarge: "error.fixture.image_too_large"
    }),
    respondNoContent
  );
  const respondWithError: ErrorRequestHandler = (error, _request, response, _next) => {
    void _next;
    const appError = error as AppError;
    response.status(appError.statusCode).json({ message: appError.message });
  };
  app.use(respondWithError);
  return app;
};

describe("content image upload middleware", () => {
  it("maps malformed encoded image bodies to the supplied invalid message", async () => {
    await request(createFixture())
      .post("/image")
      .set("Content-Type", "image/jpeg")
      .set("Content-Encoding", "gzip")
      .send(Buffer.from([0xff, 0xd8, 0xff, 0xdb]))
      .expect(400)
      .expect((response) => expect(response.body.message).toBe("error.fixture.image_invalid"));
  });

  it("maps bodies above eight MiB to the supplied too-large message", async () => {
    await request(createFixture())
      .post("/image")
      .set("Content-Type", "image/jpeg")
      .send(Buffer.alloc(8 * 1024 * 1024 + 1))
      .expect(413)
      .expect((response) => expect(response.body.message).toBe("error.fixture.image_too_large"));
  });
});

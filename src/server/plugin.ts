import { loadEnv, type Plugin } from "vite";
import { createMailer, mailEnv } from "./mailer";
import { attachRegisterRoutes } from "./register-routes";

export function verificationPlugin(): Plugin {
  return {
    name: "bloom-verification",
    configureServer(server) {
      const fileEnv = loadEnv(server.config.mode, server.config.root, "BLOOM_");
      attachRegisterRoutes(server.middlewares, createMailer(mailEnv(fileEnv)));
    },
    configurePreviewServer(server) {
      const fileEnv = loadEnv("production", process.cwd(), "BLOOM_");
      attachRegisterRoutes(server.middlewares, createMailer(mailEnv(fileEnv)));
    },
  };
}

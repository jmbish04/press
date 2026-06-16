/**
 * @fileoverview OpenAPI documentation routes
 */

import { swaggerUI } from "@hono/swagger-ui";
import { apiReference } from "@scalar/hono-api-reference";
import { Hono } from "hono";

const openapiRouter = new Hono<{ Bindings: Env }>();

// OpenAPI specification
const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Core Template API",
    version: "1.0.0",
    description: "API documentation for Cloudflare Workers AI powered application",
  },
  servers: [
    {
      url: "/api",
      description: "API Server",
    },
  ],
  paths: {
    "/auth/login": {
      post: {
        summary: "User login",
        tags: ["Authentication"],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 8 },
                },
                required: ["email", "password"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Login successful",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    user: { type: "object" },
                    token: { type: "string" },
                    expiresAt: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/dashboard/metrics": {
      get: {
        summary: "Get dashboard metrics",
        tags: ["Dashboard"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "category",
            in: "query",
            schema: { type: "string" },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 100 },
          },
        ],
        responses: {
          "200": {
            description: "Metrics retrieved successfully",
          },
        },
      },
    },
    "/threads": {
      get: {
        summary: "List user threads",
        tags: ["AI Threads"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Threads retrieved successfully",
          },
        },
      },
      post: {
        summary: "Create a new thread",
        tags: ["AI Threads"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { type: "string", minLength: 1 },
                },
                required: ["title"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Thread created successfully",
          },
        },
      },
    },
    "/health": {
      get: {
        summary: "System health check",
        tags: ["Health"],
        responses: {
          "200": {
            description: "System is healthy",
          },
        },
      },
    },
    "/sources": {
      get: {
        summary: "List all publication sources",
        tags: ["Sources"],
        description:
          "Returns all publication sources with their style profiles and article counts.",
        responses: {
          "200": {
            description: "Sources retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    sources: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "integer" },
                          key: { type: "string" },
                          name: { type: "string" },
                          accent: {
                            type: "string",
                            nullable: true,
                            description: "OKLCH accent colour for the masthead",
                          },
                          ink: {
                            type: "string",
                            nullable: true,
                            description: 'Text colour on the masthead ("#fff" or "#111")',
                          },
                          bg: {
                            type: "string",
                            nullable: true,
                            description: "Background colour for synthetic renders",
                          },
                          short: {
                            type: "string",
                            nullable: true,
                            description: "Short code (1–3 chars)",
                          },
                          face: {
                            type: "string",
                            nullable: true,
                            enum: ["serif", "grotesque", "condensed", "mono", "slab"],
                            description: "Typographic personality of the masthead wordmark",
                          },
                          articleCount: { type: "integer" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/sources/{id}": {
      put: {
        summary: "Update a source's style profile",
        tags: ["Sources"],
        description:
          "Update any combination of name, accent, ink, bg, short, face for a publication source.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer" },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  accent: { type: "string" },
                  ink: { type: "string" },
                  bg: { type: "string" },
                  short: { type: "string" },
                  face: {
                    type: "string",
                    enum: ["serif", "grotesque", "condensed", "mono", "slab"],
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Source updated successfully",
          },
          "404": {
            description: "Source not found",
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
      },
    },
  },
};

// GET /openapi.json
openapiRouter.get("/openapi.json", (c) => {
  return c.json(openApiSpec);
});

// GET /swagger
openapiRouter.get("/swagger", swaggerUI({ url: "/openapi.json" }));

// GET /scalar
openapiRouter.get(
  "/scalar",
  apiReference({
    spec: {
      url: "/openapi.json",
    },
    theme: "default",
  }),
);

// GET /docs - redirect to scalar
openapiRouter.get("/docs", (c) => {
  return c.redirect("/scalar");
});

export { openapiRouter };

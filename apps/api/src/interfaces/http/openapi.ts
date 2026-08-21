export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "CodeGuard AI API",
    version: "0.1.0"
  },
  paths: {
    "/health": {
      get: {
        responses: {
          "200": {
            description: "Service health"
          }
        }
      }
    },
    "/api/analyses/code-review": {
      post: {
        summary: "Run AI code review",
        responses: {
          "201": {
            description: "Structured analysis result"
          }
        }
      }
    }
  }
};

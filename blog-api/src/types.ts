export type Bindings = {
  DB: D1Database;
  MEDIA: R2Bucket;
  JWT_SECRET: string;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
  CORS_ORIGIN: string;
  R2_PUBLIC_BASE_URL: string;
  PUBLIC_SITE_URL?: string;
  SITE_TITLE?: string;
};

export type Variables = {
  admin: { username: string };
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};

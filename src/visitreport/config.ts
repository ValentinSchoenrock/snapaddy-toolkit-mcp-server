export const ENV_NAMES = ["prod", "stg", "dev"] as const;
export type EnvName = (typeof ENV_NAMES)[number];

export interface Config {
  baseUrl: string;
  token: string;
}

const DEV_NAME_PATTERN = /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/;

const HOSTS = {
  prod: "https://backend.snapaddy.com",
  stg: "https://backend.stg.snapaddy.com",
} as const;

export function loadConfig(env: Record<string, string | undefined>): Config {
  const token = env.SNAPADDY_API_KEY?.trim();
  if (!token) {
    throw new Error("SNAPADDY_API_KEY is required");
  }
  const name = (env.SNAPADDY_ENV?.trim() || "prod") as EnvName;
  if (!ENV_NAMES.includes(name)) {
    throw new Error(`SNAPADDY_ENV must be one of: ${ENV_NAMES.join(", ")}`);
  }
  if (name === "dev") {
    const dev = env.SNAPADDY_DEV_NAME?.trim() ?? "";
    if (!DEV_NAME_PATTERN.test(dev)) {
      throw new Error(
        "SNAPADDY_DEV_NAME is required for SNAPADDY_ENV=dev and must be a lowercase DNS label (a-z, 0-9, '-')",
      );
    }
    return { baseUrl: `https://backend-${dev}.dev.snapaddy.com`, token };
  }
  return { baseUrl: HOSTS[name], token };
}

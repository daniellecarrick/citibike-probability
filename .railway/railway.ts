import { defineRailway, github, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const citibikeDataFdbH = volume("citibike-data-fdbH", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "sfo", sizeMB: 30000 });
  const citibikeProbabilityBackend = service("citibike-probability-backend", {
    source: github("daniellecarrick/citibike-probability", { branch: "main", checkSuites: false, rootDirectory: "/backend" }),
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    replicas: { "sfo": 1 },
    volumeMounts: { "/data": citibikeDataFdbH },
    env: { BACKEND_URL: preserve(), DB_PATH: preserve(), MAPBOX_TOKEN: preserve() },
  });
  const heroicTenderness = service("heroic-tenderness", {
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    healthcheck: "/",
    replicas: { "sfo": 1 },
    env: { BACKEND_URL: preserve(), DB_PATH: preserve(), MAPBOX_TOKEN: preserve(), VITE_API_URL: preserve(), VITE_MAPBOX_TOKEN: preserve() },
  });

  return project("citibike-probability", {
    variables: { managed: true },
    resources: [citibikeProbabilityBackend, heroicTenderness, citibikeDataFdbH],
  });
});

import { lazy, Suspense, type ComponentType, type PropsWithChildren } from "react";
import App from "../App";
import { PAGE_NAMES, type AuthContextValue, type PlatformPages } from "./contracts";
import { ErrorBoundary } from "./ErrorBoundary";
import { IntegrationStatus } from "./IntegrationStatus";

// Build-time module discovery allows the three owners to work independently.
// Missing modules fail closed; no mock authentication is bundled here.
const authModules = import.meta.glob<Record<string, unknown>>("../auth/{AuthProvider,useAuth}.{ts,tsx}");
const pageModules = import.meta.glob<Record<string, unknown>>("../pages/*.tsx");
const providerLoader = authModules["../auth/AuthProvider.tsx"];
const hookLoader = authModules["../auth/useAuth.ts"] ?? authModules["../auth/useAuth.tsx"];

const pages = Object.fromEntries(PAGE_NAMES.map((name) => [name, lazy(async () => {
  const load = pageModules[`../pages/${name}.tsx`];
  if (!load) return { default: () => <IntegrationStatus title="Screen integration pending" message={`${name} has not been delivered yet.`} /> };
  const module = await load();
  const Page = module[name] ?? module.default;
  if (!Page) throw new Error(`Missing export: ${name}`);
  return { default: Page as () => React.JSX.Element };
})])) as unknown as PlatformPages;

const ConnectedPlatform = lazy(async () => {
  if (!providerLoader || !hookLoader) return {
    default: () => <IntegrationStatus title="Platform integration pending"
      message="The authentication module is being integrated. The laboratory stays locked until real authentication is available." />,
  };
  const [providerModule, hookModule] = await Promise.all([providerLoader(), hookLoader()]);
  const AuthProvider = (providerModule.AuthProvider ?? providerModule.default) as ComponentType<PropsWithChildren>;
  const useAuth = hookModule.useAuth as () => AuthContextValue;
  if (!AuthProvider || !useAuth) throw new Error("The authentication exports do not match the integration contract.");
  function AuthenticatedRouter() { return <App auth={useAuth()} pages={pages} />; }
  return { default: function Platform() { return <AuthProvider><AuthenticatedRouter /></AuthProvider>; } };
});

export default function PlatformEntry() {
  return <ErrorBoundary><Suspense fallback={<IntegrationStatus title="Opening BioFold" message="Preparing your workspace…" />}>
    <ConnectedPlatform />
  </Suspense></ErrorBoundary>;
}

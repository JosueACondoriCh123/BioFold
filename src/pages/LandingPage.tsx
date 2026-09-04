import { Footer, PlatformPage, PublicHeader } from "../components/platform/PlatformLayout";
import {
  CapabilitiesSection,
  CinematicStage,
  ClosingSection,
  CommandBusSection,
  EvidenceSection,
  PlatformSection,
  ToolsSection,
} from "../features/landing";
import "../features/landing/landing.css";

export default function LandingPage() {
  return (
    <PlatformPage name="landing" title="A molecular workspace agents can actually use">
      <a className="bf-skip" href="#main-content">Skip to content</a>
      <PublicHeader overlay />
      <main id="main-content">
        <CinematicStage />
        <CapabilitiesSection />
        <CommandBusSection />
        <ToolsSection />
        <EvidenceSection />
        <PlatformSection />
        <ClosingSection />
      </main>
      <Footer />
    </PlatformPage>
  );
}

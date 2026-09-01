import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import PlatformEntry from "./integration/PlatformEntry";

createRoot(document.getElementById("root")!).render(<BrowserRouter><PlatformEntry /></BrowserRouter>);

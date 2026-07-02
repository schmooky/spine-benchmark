import { createRoot } from "react-dom/client";

import App from "./App";
import { SweepApp } from "./ui/SweepApp";
import "./index.css";

// ?mode=sweep runs the isolation-sweep calibrator instead of the normal
// multi-scene benchmark - see @/bench/sweepEngine.
const mode = new URLSearchParams(location.search).get("mode");
const Root = mode === "sweep" ? SweepApp : App;

createRoot(document.getElementById("root")!).render(<Root />);

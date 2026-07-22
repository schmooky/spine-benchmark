import { createRoot } from "react-dom/client";

import App from "./App";
import "./index.css";

// ONE site, ONE flow: open it on a device and it measures the real per-frame
// compute time of the real scenes on THAT device, then shows you the number and
// uploads it. No modes, no prediction - just the measurement.
createRoot(document.getElementById("root")!).render(<App />);
